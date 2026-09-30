/**
 * `InventoryStore` over EmDash's plugin-storage primitives, on the embedded-holds
 * aggregate: one `inventory/{sku}` document carrying `onHand` **and** the live
 * holds that decremented it.
 *
 * ## Why the model is shaped this way
 *
 * There are no transactions here and no `SELECT … FOR UPDATE`. The only
 * atomicity primitives are single-document ones, so the rule is: *an invariant
 * that spans two facts lives in ONE document.* The decisive fact is that an
 * inventory decrement is not idempotent unless the row records who applied it —
 * which puts the holds map inside the inventory document, and makes the decrement
 * a single `compareAndSet` in which the guard (`onHand >= qty`, computed in JS),
 * the new count and the hold record all commit together. No oversell and
 * once-only are the same atom.
 *
 * ## Reserve decisions survive interrupted completion
 *
 * `reserve` is: claim `reservation_keys/{key}` (create-if-absent, carrying the
 * sku, the qty and the minted reservation id) → the inventory `compareAndSet` →
 * update the key document to its terminal `ReserveResult`. The SKU CAS records
 * either the successful hold/decrement or a failed-decision witness, so a peer
 * cannot finalize failure while another applies a hold. A crash before the CAS
 * is completed with the RECORDED reservation id. A crash before copying the
 * outcome is completed from that hold or witness; failed witnesses are promoted
 * before ring eviction. A new key's initial out-of-stock create-if-absent remains
 * safe because it arbitrates before a claim or hold can exist for that key.
 *
 * ## The outcome-before-prune ordering
 *
 * A hold is pruned on commit/release, so the terminal `ReserveResult` is written
 * to the key document **before** the prune, and a replay reads that document
 * first. Prune-first-then-crash would let a replay conclude the key was fresh and
 * decrement a second time. The prune is the second, idempotent step.
 *
 * That *ordering* is only observable under fault injection, which is INC-A3's
 * tier, not this file's: the suites here pin the consequence (a replay after a
 * prune still answers from the key document) rather than the order of the two
 * writes.
 *
 * ## What is NOT atomic
 *
 * `adopt` / `adoptMany` / `commitMany` / `releaseAdopted` take reservation ids
 * with no sku, and one order's holds can span N SKUs — i.e. N documents. **These
 * methods are N per-SKU writes and are not atomic across SKUs.** Every write is
 * idempotent by reservation id (a hold already in the target state is a no-op
 * success), so a partially applied set is safe for any replayer to re-run to
 * completion; the order-side intent record that says *which* set was meant, and
 * the sweeper that completes it, are separate increments (INC-B2 / INC-C4). The
 * implementation therefore classifies every id first (index lookups), then
 * applies the work grouped by SKU — one `compareAndSet` per SKU, not per id.
 *
 * ## Contention
 *
 * Read-modify-write on a hot SKU retries. The budget is bounded and the
 * exhaustion failure is `StorageContentionError` — typed, retryable, and
 * deliberately NOT `OUT_OF_STOCK`. See `cas-retry.ts`.
 */
import type { Clock, IdGen, IdempotencyKey, Sku } from "@otta-sh/domain";
import {
	AdjustReservationMismatchError,
	ReservationCommitLostError,
	ReservationNotFoundError,
	ReservationNotHeldError,
	StockMovementMismatchError,
	type AdoptInput,
	type AdoptManyInput,
	type AdoptManyResult,
	type AdoptResult,
	type CommitManyResult,
	type InventoryStore,
	type ReserveResult,
	type RestockResult,
	type StockRemovalResult,
} from "@otta-sh/domain";
import {
	CAS_RETRY,
	casDone,
	StorageContentionError,
	withCasRetry,
	type CasRetryOptions,
	type CasStep,
} from "./cas-retry.js";
import { collectionOf } from "./collection-of.js";
import {
	InventoryMovementReconciliationRequiredError,
	ReservationIdCollisionError,
	ReservationNotReleasableError,
} from "./errors.js";
import type { HoldDeadlineStamper } from "./hold-deadline-stamper.js";
import {
	adjustClaimId,
	findAppliedMovement,
	INVENTORY_COLLECTION,
	INVENTORY_MOVEMENTS_COLLECTION,
	newInventoryDoc,
	normalizeInventoryDoc,
	pushAppliedMovement,
	RESERVATION_INDEX_COLLECTION,
	RESERVATION_KEYS_COLLECTION,
	stockClaimId,
	type AdjustClaim,
	type AppliedMovement,
	type HoldEntry,
	type InventoryDoc,
	type MovementClaimDoc,
	type ReservationIndexDoc,
	type ReservationKeyDoc,
	type StockDirection,
	type StockMovementClaim,
	type TerminalReservationState,
} from "./inventory-documents.js";
import type { StorageAccess, StorageCollection } from "./storage-access.js";

export interface EmdashInventoryStoreOptions {
	/** The collections the plugin descriptor declared; see `INVENTORY_COLLECTIONS`. */
	storage: StorageAccess;
	/** Reservation ids come from here, never from `crypto.randomUUID()` directly. */
	idGen: IdGen;
	/** Timestamps come from here, never from `Date.now()` directly. */
	clock: Clock;
	/** Override the compare-and-set attempt ceiling (see `CAS_MAX_ATTEMPTS`). */
	maxCasAttempts?: number;
	/** Observer for the attempt depth each step spent — how contention is measured. */
	onCasAttempts?: (operation: string, attempts: number) => void;
	/**
	 * Override the retry backoff sleep. Reaches the retry loop, so a suite running
	 * on fake timers (or one that simply must not wait) can supply its own — with
	 * the default `setTimeout`, fake timers would hang the loop.
	 */
	sleep?: CasRetryOptions["sleep"];
	/** Override the backoff jitter source, to make a retry schedule deterministic. */
	random?: CasRetryOptions["random"];
}

/** One hold to remove from an aggregate, and why. */
interface PruneEntry {
	reserveKey: string;
	reservationId: string;
	terminal: TerminalReservationState;
}

/** The port's wording for a recorded stock movement, used in mismatch messages. */
function describeMovement(direction: StockDirection, qty: number, sku: string): string {
	return `${direction} ${String(qty)}×${sku}`;
}

/** How a movement claim of the other kind is described in a mismatch message. */
function describeOtherKind(claim: MovementClaimDoc): string {
	return claim.kind === "stock"
		? describeMovement(claim.direction, claim.qty, claim.sku)
		: `an adjust of reservation ${claim.reservationId}`;
}

function assertPositiveInt(value: number, method: string, field: string): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new RangeError(`${method}() requires a positive integer ${field}, got ${String(value)}`);
	}
}

/** Released units must remain exactly representable, even after an absolute target. */
function assertSafeStockTotal(onHand: number, holds: Readonly<Record<string, HoldEntry>>): void {
	if (!Number.isSafeInteger(onHand) || onHand < 0) {
		throw new RangeError("Inventory available quantity must be a non-negative safe integer");
	}
	let total = onHand;
	for (const hold of Object.values(holds)) {
		if (
			!Number.isSafeInteger(hold.qty) ||
			hold.qty <= 0 ||
			hold.qty > Number.MAX_SAFE_INTEGER - total
		) {
			throw new RangeError(
				"Inventory available quantity plus held units exceeds the safe integer limit",
			);
		}
		total += hold.qty;
	}
}

const OUT_OF_STOCK: Extract<ReserveResult, { ok: false }> = { ok: false, reason: "OUT_OF_STOCK" };

/** Rounds `reserve` spends resolving its key document; see the loop's comment. */
const ROUNDS = 2;

export class EmdashInventoryStore implements InventoryStore, HoldDeadlineStamper {
	readonly #inventory: StorageCollection<InventoryDoc>;
	readonly #index: StorageCollection<ReservationIndexDoc>;
	readonly #keys: StorageCollection<ReservationKeyDoc>;
	readonly #movements: StorageCollection<MovementClaimDoc>;
	readonly #idGen: IdGen;
	readonly #clock: Clock;
	readonly #retry: CasRetryOptions;

	constructor(options: EmdashInventoryStoreOptions) {
		this.#inventory = collectionOf<InventoryDoc>(options.storage, INVENTORY_COLLECTION);
		this.#index = collectionOf<ReservationIndexDoc>(options.storage, RESERVATION_INDEX_COLLECTION);
		this.#keys = collectionOf<ReservationKeyDoc>(options.storage, RESERVATION_KEYS_COLLECTION);
		this.#movements = collectionOf<MovementClaimDoc>(
			options.storage,
			INVENTORY_MOVEMENTS_COLLECTION,
		);
		this.#idGen = options.idGen;
		this.#clock = options.clock;
		this.#retry = {
			maxAttempts: options.maxCasAttempts,
			onAttempts: options.onCasAttempts,
			sleep: options.sleep,
			random: options.random,
		};
	}

	// -- reserve ---------------------------------------------------------------

	/**
	 * Claim the key, then ONE `compareAndSet` on `inventory/{sku}` in which the
	 * `onHand >= qty` guard, the decrement and the hold record commit together,
	 * then record the terminal outcome on the key document.
	 *
	 * The key document is the durable once-only guard and outlives every prune, so
	 * a replay is answered from it: a terminal document returns the recorded
	 * result, and a `claimed` document is COMPLETED with the recorded reservation id
	 * (never a fresh one). An unknown sku is a pre-claim rejection that does not
	 * consume the key; a genuine `OUT_OF_STOCK` on a known sku does.
	 */
	async reserve(sku: string, qty: number, key: IdempotencyKey): Promise<ReserveResult> {
		assertPositiveInt(qty, "reserve", "qty");

		// Two rounds are sufficient: a create-if-absent claim can only fail because
		// a document now exists, and the next round reads it.
		for (let round = 0; round < ROUNDS; round++) {
			const claim = await this.#keys.get(key);
			if (claim !== null) {
				if (claim.state === "terminal") return { ...claim.result };
				return this.#completeReserveClaim(key, claim);
			}

			const doc = await this.#inventory.get(sku);
			// No inventory document ⇒ outside the idempotency scope: nothing is
			// claimed and the key stays usable once the sku exists (mirroring the SQL
			// adapter, whose `reservations.sku` foreign key aborts the claim).
			if (doc === null) return { ...OUT_OF_STOCK };

			if (doc.onHand < qty) {
				// Decided before any id is minted: an `OUT_OF_STOCK` reserve leaves no
				// reservation id and no index document behind, only the terminal key
				// document that makes the replay stable.
				const written = await this.#keys.compareAndSet(key, null, {
					state: "terminal",
					result: { ...OUT_OF_STOCK },
					reservationId: null,
					recordedAt: this.#clock.now().toISOString(),
				});
				if (written.applied) return { ...OUT_OF_STOCK };
				continue; // a same-key peer claimed first: follow its claim
			}

			const claimed: ReservationKeyDoc = {
				state: "claimed",
				sku,
				qty,
				reservationId: this.#idGen.newId(),
				claimedAt: this.#clock.now().toISOString(),
			};
			const written = await this.#keys.compareAndSet(key, null, claimed);
			if (!written.applied) continue; // a same-key peer claimed first
			return this.#completeReserveClaim(key, claimed);
		}
		// Unreachable by construction: a create-if-absent claim can only fail because
		// a document now exists, and the next round reads it. If it ever happens the
		// key is contended beyond what this loop can resolve, which is the same
		// condition as an exhausted retry budget — typed and retryable, never a bare
		// failure the route boundary cannot classify.
		throw new StorageContentionError("reserve (claim resolution)", ROUNDS, {
			cause: new Error(`the claim for idempotency key ${key} could not be read back`),
		});
	}

	/**
	 * Finish a claimed reserve in the SKU CAS: either its hold/decrement or a
	 * durable failed-decision witness. A mere zero-stock read cannot finalize the
	 * claim while a peer applies its hold. Terminal key promotion follows this CAS;
	 * any peer can complete it, and eviction promotes the same original decision.
	 */
	async #completeReserveClaim(
		key: string,
		claim: Extract<ReservationKeyDoc, { state: "claimed" }>,
	): Promise<ReserveResult> {
		const result = await this.#cas<ReserveResult>("reserve", async () => {
			const current = await this.#inventory.getVersioned(claim.sku);
			// Only an EXISTING claim can reach an absent SKU here. Its zero-stock
			// witness uses create-if-absent to arbitrate a recreation; it never invents
			// units. A new unknown-SKU command still exits before claiming any key.
			const doc =
				current === null ? newInventoryDoc(claim.sku, 0) : normalizeInventoryDoc(current.value);

			// This claim's hold is already in place: the decrement happened, and this
			// caller is a replay (or a same-key peer that lost the race to apply it).
			const existing = doc.holds[key];
			if (existing !== undefined) {
				return casDone<ReserveResult>({ ok: true, reservationId: existing.reservationId });
			}

			// No hold — but that is not proof the decrement never happened. A peer
			// completing THIS claim may have created the hold, committed it and PRUNED
			// it while this caller was between its own claim read and this attempt, and
			// a committed prune leaves `onHand` low with nothing to show for it. Writing
			// a second hold here would decrement a second time, and `#prune` would never
			// return those units: permanent, silent stock loss. The key document is the
			// durable record, so it is re-read on every attempt that finds no hold.
			const settled = await this.#keys.get(key);
			if (settled !== null && settled.state === "terminal") {
				return casDone<ReserveResult>({ ...settled.result });
			}

			const failed = findAppliedMovement(doc.appliedMovements, key, "reserve");
			if (failed?.kind === "reserve") {
				if (failed.reservationId !== claim.reservationId)
					throw new ReservationIdCollisionError(claim.reservationId, key, failed.reservationId);
				return casDone<ReserveResult>({ ...failed.result });
			}
			if (doc.onHand < claim.qty) {
				const written = await this.#inventory.compareAndSet(claim.sku, current?.revision ?? null, {
					...doc,
					appliedMovements: await this.#appendMovement(doc, {
						key,
						kind: "reserve",
						reservationId: claim.reservationId,
						result: { ...OUT_OF_STOCK },
					}),
				});
				return written.applied ? casDone<ReserveResult>({ ...OUT_OF_STOCK }) : CAS_RETRY;
			}

			// The reverse lookup still precedes a successful hold. A losing failure
			// CAS cannot terminalize this index: it must retry the winning SKU state.
			const indexed = await this.#index.compareAndSet(claim.reservationId, null, {
				sku: claim.sku,
				idempotencyKey: key,
			});
			if (!indexed.applied) {
				const recordedIndex = await this.#index.get(claim.reservationId);
				if (recordedIndex !== null && recordedIndex.idempotencyKey !== key) {
					throw new ReservationIdCollisionError(
						claim.reservationId,
						key,
						recordedIndex.idempotencyKey,
					);
				}
			}

			const hold: HoldEntry = {
				reservationId: claim.reservationId,
				qty: claim.qty,
				state: "held",
				expiresAt: null,
				orderId: null,
				createdAt: this.#clock.now().toISOString(),
			};
			const written = await this.#inventory.compareAndSet(claim.sku, current?.revision ?? null, {
				...doc,
				onHand: doc.onHand - claim.qty,
				holds: { ...doc.holds, [key]: hold },
			});
			if (!written.applied) return CAS_RETRY;
			return casDone<ReserveResult>({ ok: true, reservationId: claim.reservationId });
		});

		await this.#markKeyTerminal(key, result, claim.reservationId);
		if (!result.ok) await this.#setTerminalState(claim.reservationId, "failed");
		return result;
	}

	// -- commit / release ------------------------------------------------------

	/**
	 * The `held|adopted → committed` settle. Deliberately order-unscoped, exactly
	 * like the SQL adapter's. A double commit is a benign no-op; a reservation that
	 * lost its hold (released/failed) is the loud `ReservationCommitLostError`
	 * anomaly, never a silent success.
	 */
	async commit(reservationId: string): Promise<void> {
		const index = await this.#mustIndex(reservationId);
		if (index.terminalState !== undefined) {
			// A terminal state, once written, is the truth — even if the prune it
			// precedes has not run yet. Finish that prune, then answer from it.
			await this.#prune(index.sku, this.#pruneEntries(index, reservationId), "commit");
			if (index.terminalState === "committed") return; // benign double-commit
			throw new ReservationCommitLostError(reservationId, index.terminalState);
		}
		const hold = await this.#liveHold(index, reservationId);
		// No hold and no terminal state: the reserve claim was abandoned before its
		// inventory write. The SQL adapter sees a `pending` row here and raises the
		// same loud anomaly.
		if (hold === undefined) {
			// A peer may have completed its terminal write and prune after our
			// initial index read. Reclassify before reporting an abandoned claim.
			const settled = await this.#mustIndex(reservationId);
			await this.#prune(settled.sku, this.#pruneEntries(settled, reservationId), "commit");
			if (settled.terminalState === "committed") return;
			throw new ReservationCommitLostError(reservationId, settled.terminalState ?? "pending");
		}
		const winner = await this.#settle(index, reservationId, "committed");
		if (winner !== "committed") throw new ReservationCommitLostError(reservationId, winner);
	}

	/** The `held|adopted → released` flip plus the stock return. */
	async release(reservationId: string): Promise<void> {
		const index = await this.#mustIndex(reservationId);
		if (index.terminalState !== undefined) {
			await this.#prune(index.sku, this.#pruneEntries(index, reservationId), "release");
			if (index.terminalState === "released") return; // benign double-release
			// Typed, not a bare Error: a caller that must classify this — the cart
			// expiry swallows it, because a hold an order already committed is not
			// the cart's to return — should not have to match on a message. The text
			// is unchanged from the bare error it replaces.
			throw new ReservationNotReleasableError(reservationId, index.terminalState);
		}
		const hold = await this.#liveHold(index, reservationId);
		if (hold === undefined) {
			const settled = await this.#mustIndex(reservationId);
			await this.#prune(settled.sku, this.#pruneEntries(settled, reservationId), "release");
			if (settled.terminalState === "released") return;
			throw new ReservationNotReleasableError(reservationId, settled.terminalState ?? "pending");
		}
		const winner = await this.#settle(index, reservationId, "released");
		if (winner !== "released") throw new ReservationNotReleasableError(reservationId, winner);
	}

	/**
	 * The ORDER-SCOPED release: an order may only release a hold IT adopted.
	 * A cart-held reservation keeps its units and ownership, but records this
	 * order's permanent adoption refusal in the SAME inventory CAS adoption uses.
	 * A delayed writer must lose that CAS or read the fence, even if cancellation
	 * already closed its recovery brackets before the writer resumes or crashes.
	 * Unknown/terminal ids and another order's adopted hold remain harmless.
	 */
	async releaseAdopted(reservationId: string, orderId: string): Promise<void> {
		const index = await this.#index.get(reservationId);
		if (index === null) return;
		if (index.terminalState !== undefined) {
			await this.#prune(index.sku, this.#pruneEntries(index, reservationId), "releaseAdopted");
			return;
		}
		const owned = await this.#cas<boolean>("releaseAdopted", async () => {
			const current = await this.#inventory.getVersioned(index.sku);
			if (current === null) return casDone(false);
			const doc = normalizeInventoryDoc(current.value);
			const hold = doc.holds[index.idempotencyKey];
			if (hold === undefined || hold.reservationId !== reservationId) return casDone(false);
			if (hold.state === "adopted") return casDone(hold.orderId === orderId);
			if (hold.adoptionBlockedFor?.includes(orderId)) return casDone(false);
			const written = await this.#inventory.compareAndSet(index.sku, current.revision, {
				...doc,
				holds: {
					...doc.holds,
					[index.idempotencyKey]: {
						...hold,
						adoptionBlockedFor: [...(hold.adoptionBlockedFor ?? []), orderId],
					},
				},
			});
			return written.applied ? casDone(false) : CAS_RETRY;
		});
		if (owned) await this.#settle(index, reservationId, "released");
	}

	/**
	 * Batched settle. Every id is classified first (an unknown one PROPAGATES as
	 * `ReservationNotFoundError`, matching singular `commit` — unlike `adoptMany`,
	 * which folds an unknown id into `lost`), then the surviving work is applied
	 * one `compareAndSet` per SKU. Not atomic across SKUs; each per-SKU write is
	 * idempotent, so a partial application is safe to re-run.
	 *
	 * Duplicate input ids are collapsed: membership sets must not report an id
	 * twice because a caller listed it twice.
	 */
	async commitMany(reservationIds: string[]): Promise<CommitManyResult> {
		const ids = [...new Set(reservationIds)];
		if (ids.length === 0) return { lost: [] };
		const indexes = await this.#resolveMany(ids);

		const lost: string[] = [];
		const bySku = new Map<string, Array<{ id: string; index: ReservationIndexDoc }>>();
		for (const id of ids) {
			const index = indexes.get(id);
			// Truly unknown: never folded into `lost`.
			if (index === undefined) throw new ReservationNotFoundError(id);
			const group = bySku.get(index.sku) ?? [];
			group.push({ id, index });
			bySku.set(index.sku, group);
		}

		for (const [sku, group] of bySku) {
			const doc = await this.#inventory.get(sku);
			const holds = doc === null ? {} : normalizeInventoryDoc(doc).holds;
			// The terminal records for EVERY id first, then one prune per SKU. A
			// terminal winner is immutable; the losing command must use that state
			// for both its outcome and its prune, including interrupted replays.
			const settled = await Promise.all(
				group.map(async ({ id, index }) => {
					if (index.terminalState !== undefined) return { id, index };
					const hold = holds[index.idempotencyKey];
					if (hold === undefined || hold.reservationId !== id) {
						// A peer may already have pruned after our initial index read.
						return { id, index: await this.#mustIndex(id) };
					}
					const winner = await this.#recordTerminal(index.idempotencyKey, id, "committed");
					return { id, index: { ...index, terminalState: winner } };
				}),
			);
			const prunable: PruneEntry[] = [];
			for (const { id, index } of settled) {
				if (index.terminalState !== "committed") lost.push(id);
				prunable.push(...this.#pruneEntries(index, id));
			}
			await this.#prune(sku, prunable, "commitMany");
		}
		return { lost };
	}

	// -- adopt ----------------------------------------------------------------

	/**
	 * The guarded `held → adopted` flip. Scoped to a hold that is `held` and whose
	 * deadline is still in the future, so it can never adopt a hold the expiry
	 * sweep is about to reap. An already-`adopted` hold for THIS order resolves to
	 * `ok` without re-checking the deadline (the idempotent replay of order
	 * creation); anything else is `RESERVATION_LOST`.
	 *
	 * A hold with NO stamped deadline is NOT adoptable, per the port's own
	 * statement of the guard (`WHERE state='held' AND expires_at > :now`, where a
	 * SQL `NULL` never satisfies the comparison). The in-memory fake treats an
	 * unstamped hold as adoptable and is the outlier; reconciling the two is a
	 * follow-up on the fake, outside this increment. In practice the cart stamps
	 * the deadline before checkout, so this is the "never stamped ⇒ not a checkout
	 * hold" case, not a live one.
	 */
	async adopt(input: AdoptInput): Promise<AdoptResult> {
		const index = await this.#mustIndex(input.reservationId);
		const result = await this.#adoptGrouped(
			index.sku,
			[{ id: input.reservationId, index }],
			{
				orderId: input.orderId,
				holdExpiresAt: input.holdExpiresAt,
				now: input.now,
				...(input.expected !== undefined
					? { expectedReservations: [{ reservationId: input.reservationId, ...input.expected }] }
					: {}),
			},
			"adopt",
		);
		return result.adopted.length === 1 ? { ok: true } : { ok: false, reason: "RESERVATION_LOST" };
	}

	/**
	 * Batched `adopt`: one order's holds across N SKUs. An unknown id is folded
	 * into `lost` and never throws — the asymmetry with `commitMany` is deliberate
	 * and is the port's. Applied one `compareAndSet` per SKU; not atomic across
	 * SKUs, and every flip is idempotent by reservation id. Duplicate input ids are
	 * collapsed.
	 */
	async adoptMany(input: AdoptManyInput): Promise<AdoptManyResult> {
		const ids = [...new Set(input.reservationIds)];
		if (ids.length === 0) return { adopted: [], lost: [] };
		const indexes = await this.#resolveMany(ids);

		const adopted: string[] = [];
		const lost: string[] = [];
		const bySku = new Map<string, Array<{ id: string; index: ReservationIndexDoc }>>();
		for (const id of ids) {
			const index = indexes.get(id);
			if (index === undefined || index.terminalState !== undefined) {
				lost.push(id); // unknown, committed, released or failed ⇒ lost, never a throw
				continue;
			}
			const group = bySku.get(index.sku) ?? [];
			group.push({ id, index });
			bySku.set(index.sku, group);
		}

		for (const [sku, group] of bySku) {
			const outcome = await this.#adoptGrouped(sku, group, input, "adoptMany");
			adopted.push(...outcome.adopted);
			lost.push(...outcome.lost);
		}
		return { adopted, lost };
	}

	/** Every adopt for ONE sku in a single `compareAndSet`. */
	async #adoptGrouped(
		sku: string,
		group: ReadonlyArray<{ id: string; index: ReservationIndexDoc }>,
		input: Omit<AdoptManyInput, "reservationIds">,
		operation: string,
	): Promise<AdoptManyResult> {
		return this.#cas<AdoptManyResult>(operation, async () => {
			const current = await this.#inventory.getVersioned(sku);
			if (current === null) {
				return casDone<AdoptManyResult>({ adopted: [], lost: group.map((e) => e.id) });
			}
			const doc = normalizeInventoryDoc(current.value);
			const holds = { ...doc.holds };
			const adopted: string[] = [];
			const lost: string[] = [];
			let changed = false;

			for (const { id, index } of group) {
				const hold = holds[index.idempotencyKey];
				if (hold === undefined || hold.reservationId !== id) {
					lost.push(id);
					continue;
				}
				if (hold.adoptionBlockedFor?.includes(input.orderId)) {
					lost.push(id);
					continue;
				}
				const expected = input.expectedReservations?.find((entry) => entry.reservationId === id);
				if (
					input.expectedReservations !== undefined &&
					(expected === undefined || expected.sku !== sku || expected.quantity !== hold.qty)
				) {
					lost.push(id);
					continue;
				}
				if (hold.state === "adopted") {
					// Idempotent replay for THIS order — no deadline re-check, so a hold
					// adopted for this order past its deadline is still success.
					if (hold.orderId === input.orderId) adopted.push(id);
					else lost.push(id);
					continue;
				}
				if (hold.expiresAt === null || hold.expiresAt <= input.now) {
					lost.push(id); // never stamped, or about to be swept
					continue;
				}
				holds[index.idempotencyKey] = {
					...hold,
					state: "adopted",
					orderId: input.orderId,
					expiresAt: input.holdExpiresAt,
				};
				adopted.push(id);
				changed = true;
			}

			if (!changed) return casDone<AdoptManyResult>({ adopted, lost });
			const written = await this.#inventory.compareAndSet(sku, current.revision, { ...doc, holds });
			if (!written.applied) return CAS_RETRY;
			return casDone<AdoptManyResult>({ adopted, lost });
		});
	}

	// -- adjust ----------------------------------------------------------------

	/**
	 * Move a live `held` hold to `newQty`, coupling the qty change with its
	 * inventory movement in ONE `compareAndSet` — the qty never moves without the
	 * stock. An increase is the oversell-critical guarded decrement of the delta
	 * (`OUT_OF_STOCK` when the units are genuinely not there, hold unchanged); a
	 * decrease is an unconditional return of units.
	 *
	 * **Exactly-once by per-key claim document.**
	 * `inventory_movements/adjust:{key}` carries the intent and is updated to
	 * `applied` with the recorded result once the units moved. A replay reads it
	 * first: `applied` ⇒ the recorded result, moving nothing, even for a stale replay
	 * arriving after later same-reservation adjusts. Guards run BEFORE the claim, so
	 * an unknown or non-`held` reservation never consumes the key.
	 *
	 * **A claimed-but-unapplied intent is RE-DERIVED, not refused.** `adjust` takes
	 * an absolute target, and the SQL reference re-derives the previous qty on every
	 * retry (its lost qty CAS rolls the claim back with the transaction), so it
	 * always applies. This adapter matches that: a completion reads the hold's
	 * CURRENT qty and applies the absolute `toQty` against it. The claim's `fromQty`
	 * is the qty observed when the intent was recorded — audit, not a guard.
	 *
	 * **Every caller's answer comes from the durable record only**, never from a
	 * locally computed value a same-key peer could disagree with: after the write
	 * phase, the answer is read back from the claim document, or from the aggregate's
	 * own witness (the applied-movement ring, or the hold's `lastMovementKey`) which
	 * is then recorded on the claim. First writer wins, and both callers return it.
	 *
	 * Every ring eviction persists its witnessed result onto the claim first, so
	 * a replay remains deterministic even after later adjusts and hold pruning.
	 * An old unfinished claim with no surviving witness is ambiguous and requires
	 * reconciliation; it cannot safely be applied again.
	 */
	async adjust(reservationId: string, newQty: number, key: IdempotencyKey): Promise<ReserveResult> {
		assertPositiveInt(newQty, "adjust", "newQty");

		const claimId = adjustClaimId(key);
		const existing = await this.#movements.get(claimId);
		if (existing !== null) {
			const claim = this.#asAdjustClaim(key, existing, reservationId);
			if (claim.applied !== undefined) return { ...claim.applied.result };
			// The crash window: the intent is durable but the units never moved.
			return this.#applyAdjustClaim(key, claimId, claim);
		}

		const index = await this.#mustIndex(reservationId);
		const hold = await this.#liveHold(index, reservationId);
		if (hold === undefined) {
			throw new ReservationNotHeldError(reservationId, index.terminalState ?? "pending");
		}
		if (hold.state !== "held") throw new ReservationNotHeldError(reservationId, hold.state);

		const intent: AdjustClaim = {
			kind: "adjust",
			sku: index.sku,
			reservationId,
			reserveKey: index.idempotencyKey,
			fromQty: hold.qty,
			toQty: newQty,
			createdAt: this.#clock.now().toISOString(),
			witnessVersion: 1,
		};
		const written = await this.#movements.compareAndSet(claimId, null, intent);
		if (!written.applied) {
			// A same-key peer claimed first; its intent is the one that counts.
			const peer = await this.#movements.get(claimId);
			if (peer !== null) {
				const claim = this.#asAdjustClaim(key, peer, reservationId);
				if (claim.applied !== undefined) return { ...claim.applied.result };
				return this.#applyAdjustClaim(key, claimId, claim);
			}
		}
		return this.#applyAdjustClaim(key, claimId, intent);
	}

	/** Narrow a movement claim to an adjust of THIS reservation, or reject it. */
	#asAdjustClaim(key: string, claim: MovementClaimDoc, reservationId: string): AdjustClaim {
		if (claim.kind !== "adjust") {
			throw new AdjustReservationMismatchError(key, describeOtherKind(claim), reservationId);
		}
		if (claim.reservationId !== reservationId) {
			throw new AdjustReservationMismatchError(key, claim.reservationId, reservationId);
		}
		return claim;
	}

	/**
	 * Apply a claimed adjust to the aggregate, then read the answer back out of the
	 * durable record. The two phases are separate on purpose: the write phase is
	 * once-only by the aggregate's own witness, and the answer phase is shared by
	 * every same-key caller, so a winner and a loser cannot disagree.
	 */
	async #applyAdjustClaim(
		key: string,
		claimId: string,
		claim: AdjustClaim,
	): Promise<ReserveResult> {
		await this.#cas<void>("adjust", async () => {
			const current = await this.#inventory.getVersioned(claim.sku);
			if (current === null) return casDone<void>(undefined); // answered below
			const doc = normalizeInventoryDoc(current.value);
			// A delayed caller may have read an unfinished claim before a peer
			// promoted it and evicted its ring entry. Re-read after pinning the
			// inventory revision; concurrent eviction then forces a CAS retry.
			const recorded = await this.#movements.get(claimId);
			if (recorded?.kind === "adjust" && recorded.applied !== undefined) {
				return casDone<void>(undefined);
			}

			// Already applied, as remembered by the aggregate.
			if (findAppliedMovement(doc.appliedMovements, key, "adjust") !== undefined) {
				return casDone<void>(undefined);
			}

			const hold = doc.holds[claim.reserveKey];
			if (hold === undefined || hold.reservationId !== claim.reservationId) {
				return casDone<void>(undefined); // no hold to move; answered below
			}
			// The hold's own witness, which outlives eviction from the ring.
			if (hold.lastMovementKey === key) return casDone<void>(undefined);
			if (claim.witnessVersion !== 1) {
				throw new InventoryMovementReconciliationRequiredError(claimId, claim.sku);
			}
			if (hold.state !== "held") {
				throw new ReservationNotHeldError(claim.reservationId, hold.state);
			}

			// Re-derived against the hold AS STORED — exactly what a rolled-back and
			// retried SQL adjust does. The absolute target is what the caller asked
			// for; the delta is whatever gets the hold there from where it is now.
			const delta = claim.toQty - hold.qty;
			if (delta > 0 && doc.onHand < delta) {
				// Genuinely insufficient stock: the port's own outcome for an increase
				// that cannot be backed by units. Recorded so it replays deterministically.
				const failed: ReserveResult = { ...OUT_OF_STOCK };
				const written = await this.#inventory.compareAndSet(claim.sku, current.revision, {
					...doc,
					appliedMovements: await this.#appendMovement(doc, {
						key,
						kind: "adjust",
						result: failed,
					}),
				});
				return written.applied ? casDone<void>(undefined) : CAS_RETRY;
			}

			const onHand = doc.onHand - delta;
			const holds = {
				...doc.holds,
				[claim.reserveKey]: { ...hold, qty: claim.toQty, lastMovementKey: key },
			};
			assertSafeStockTotal(onHand, holds);
			const written = await this.#inventory.compareAndSet(claim.sku, current.revision, {
				...doc,
				onHand,
				holds,
				appliedMovements: await this.#appendMovement(doc, {
					key,
					kind: "adjust",
					result: { ok: true, reservationId: claim.reservationId },
				}),
			});
			return written.applied ? casDone<void>(undefined) : CAS_RETRY;
		});

		return this.#resolveAdjustAnswer(key, claimId, claim);
	}

	/**
	 * The answer phase: the durable record, or the aggregate's witness promoted onto
	 * the claim document. Never a locally computed value.
	 */
	async #resolveAdjustAnswer(
		key: string,
		claimId: string,
		claim: AdjustClaim,
	): Promise<ReserveResult> {
		const stored = await this.#movements.get(claimId);
		if (stored !== null && stored.kind === "adjust" && stored.applied !== undefined) {
			return { ...stored.applied.result };
		}

		const doc = await this.#inventory.get(claim.sku);
		const aggregate = doc === null ? undefined : normalizeInventoryDoc(doc);
		const remembered = findAppliedMovement(aggregate?.appliedMovements, key, "adjust");
		let witnessed: ReserveResult | undefined;
		if (remembered?.kind === "adjust") {
			witnessed = remembered.result;
		} else {
			const hold = aggregate?.holds[claim.reserveKey];
			if (hold?.reservationId === claim.reservationId && hold?.lastMovementKey === key) {
				witnessed = { ok: true, reservationId: claim.reservationId };
			}
		}
		if (witnessed === undefined) {
			// Promotion can race the two reads above: the first claim read saw an
			// unfinished intent, then the inventory read saw its witness evicted.
			// Eviction persisted the result first, so resolve that durable answer.
			const promoted = await this.#movements.get(claimId);
			if (promoted?.kind === "adjust" && promoted.applied !== undefined) {
				return { ...promoted.applied.result };
			}
			// No durable witness: nothing moved and the hold is no longer this
			// reservation's to move. An old ambiguous claim is never re-applied.
			throw new ReservationNotHeldError(claim.reservationId, "pending");
		}

		await this.#markMovementApplied(claimId, (doc2) =>
			doc2.kind === "adjust"
				? { ...doc2, applied: { result: witnessed, appliedAt: this.#clock.now().toISOString() } }
				: undefined,
		);
		// Re-read: whoever marked first owns the answer, and both callers return it.
		const settled = await this.#movements.get(claimId);
		if (settled !== null && settled.kind === "adjust" && settled.applied !== undefined) {
			return { ...settled.applied.result };
		}
		return witnessed;
	}

	// -- the cart's hold deadline ---------------------------------------------

	/**
	 * {@link HoldDeadlineStamper.stampHoldDeadline} — the `held`-scoped deadline
	 * write that is ALSO the cart's attach guard.
	 *
	 * It is the document counterpart of the SQL adapter's
	 * `UPDATE reservations SET expires_at = :deadline WHERE id = :id AND
	 * state = 'held'`: one guarded compare-and-set in which the state precondition,
	 * the ownership check and the new deadline commit together. That is why the
	 * cart store may treat `true` as durable proof the hold was live — a read could
	 * only prove it was live a moment ago.
	 *
	 * It lives here rather than on the port because it is not commerce policy: the
	 * deadline is the cart's, and the only reason the inventory aggregate has to
	 * write it is that the hold lives inside the inventory document.
	 */
	async stampHoldDeadline(reservationId: string, expiresAt: string): Promise<boolean> {
		const index = await this.#index.get(reservationId);
		if (index === null) return false;
		// A settled reservation is never stampable, even while its hold is still in the
		// aggregate: the terminal record is written BEFORE the prune, so a committed or
		// released reservation can leave a hold that still reads `held`. Stamping it
		// would let a cart attach a line to spent units. The same gate `expireHold`'s
		// claim applies before minting a fresh expiry token, for the same reason.
		if (index.terminalState !== undefined) return false;
		return this.#cas<boolean>("stampHoldDeadline", async () => {
			const current = await this.#inventory.getVersioned(index.sku);
			if (current === null) return casDone(false);
			const doc = normalizeInventoryDoc(current.value);
			const hold = doc.holds[index.idempotencyKey];
			// No hold, somebody else's hold, or a hold that has left `held`: there is
			// nothing this may touch. `false`, never a throw — the caller (the cart's
			// attach guard) turns it into the port's typed `HoldExpiredError`.
			if (hold === undefined || hold.reservationId !== reservationId) return casDone(false);
			if (hold.state !== "held") return casDone(false);
			// Idempotent: the deadline it already carries needs no write, and skipping
			// one keeps a replay from adding contention to a hot aggregate.
			if (hold.expiresAt === expiresAt) return casDone(true);
			const written = await this.#inventory.compareAndSet(index.sku, current.revision, {
				...doc,
				holds: { ...doc.holds, [index.idempotencyKey]: { ...hold, expiresAt } },
			});
			return written.applied ? casDone(true) : CAS_RETRY;
		});
	}

	// -- raw stock reads and writes -------------------------------------------

	/**
	 * Create-if-absent initial stock. The document id IS the idempotency, so this
	 * is one `compareAndSet(sku, null, …)`: seeding a new sku creates it, and
	 * re-seeding an existing one — including one a `reserve` has already
	 * decremented — is a no-op that never clobbers the live count.
	 */
	async seedOnHand(sku: string, qty: number): Promise<void> {
		if (!Number.isSafeInteger(qty) || qty < 0) {
			throw new RangeError(`seedOnHand() requires a non-negative integer, got ${String(qty)}`);
		}
		await this.#inventory.compareAndSet(sku, null, newInventoryDoc(sku, qty));
	}

	/** A sku with no document reads `0` — mirrors the SQL adapter's LEFT JOIN miss. */
	async getOnHand(sku: string): Promise<number> {
		const doc = await this.#inventory.get(sku);
		return doc?.onHand ?? 0;
	}

	/** The same read with row presence preserved: `null` means "no document". */
	async findOnHand(sku: string): Promise<number | null> {
		const doc = await this.#inventory.get(sku);
		return doc === null ? null : doc.onHand;
	}

	/**
	 * Merchant restock: an unconditional, oversell-safe increment. Adding units can
	 * never invalidate a concurrent reservation, so there is no guard to fail —
	 * only the claim discipline that makes a double-clicked restock add once.
	 */
	async restock(sku: string, qty: number, key: IdempotencyKey): Promise<RestockResult> {
		assertPositiveInt(qty, "restock", "qty");
		const result = await this.#moveStock(sku, qty, key, "restock");
		return result.ok ? result : { ok: false, reason: "UNKNOWN_SKU" };
	}

	/** Absolute AVAILABLE target; holds and the replay witness survive the same CAS. */
	async setOnHandAbsolute(sku: Sku, quantity: number, key: IdempotencyKey): Promise<RestockResult> {
		if (!Number.isSafeInteger(quantity) || quantity < 0) {
			throw new RangeError(
				`setOnHandAbsolute() requires a non-negative integer quantity, got ${String(quantity)}`,
			);
		}
		const result = await this.#moveStock(sku, quantity, key, "absolute");
		return result.ok ? result : { ok: false, reason: "UNKNOWN_SKU" };
	}

	/**
	 * Merchant stock removal: the oversell-critical guarded decrement, the same
	 * `onHand >= qty` guard `reserve` uses and competing for the same units. It can
	 * never drive the count below zero.
	 */
	async removeStock(sku: string, qty: number, key: IdempotencyKey): Promise<StockRemovalResult> {
		assertPositiveInt(qty, "removeStock", "qty");
		return this.#moveStock(sku, qty, key, "removal");
	}

	/** Resume an existing stock command before an admin's stale-view guard; never creates a claim. */
	async resumeStockMovement(
		sku: string,
		qty: number,
		key: IdempotencyKey,
		direction: "restock" | "removal",
	): Promise<StockRemovalResult | null> {
		assertPositiveInt(qty, "resumeStockMovement", "qty");
		const claimId = stockClaimId(key);
		const existing = await this.#movements.get(claimId);
		if (existing === null) return null;
		const claim = this.#asStockClaim(key, existing, sku, direction, qty);
		return claim.applied === undefined
			? this.#applyStockClaim(key, claimId, claim)
			: { ...claim.applied.result };
	}

	/**
	 * The shared stock delta/absolute target body. Exactly-once by per-key claim
	 * document: `inventory_movements/stock:{key}` carries the intent (sku,
	 * direction, qty) — which is what makes a key reused for a DIFFERENT movement a
	 * typed rejection rather than an `ok` echoing the wrong one — and is updated to
	 * `applied` with the recorded result once the units moved. An `UNKNOWN_SKU`
	 * rejection precedes the claim, so it does not consume the key; an
	 * `INSUFFICIENT_STOCK` on a known sku is a terminal outcome that does.
	 */
	async #moveStock(
		sku: string,
		qty: number,
		key: string,
		direction: StockDirection,
	): Promise<StockRemovalResult> {
		const claimId = stockClaimId(key);
		const existing = await this.#movements.get(claimId);
		if (existing !== null) {
			const claim = this.#asStockClaim(key, existing, sku, direction, qty);
			if (claim.applied !== undefined) return { ...claim.applied.result };
			return this.#applyStockClaim(key, claimId, claim);
		}

		// Unknown sku: `seedOnHand` is the sole create path, so a typo'd sku can
		// never conjure phantom inventory — and the key stays unconsumed.
		if ((await this.#inventory.get(sku)) === null) return { ok: false, reason: "UNKNOWN_SKU" };

		const intent: StockMovementClaim = {
			kind: "stock",
			sku,
			direction,
			qty,
			createdAt: this.#clock.now().toISOString(),
			witnessVersion: 1,
		};
		const written = await this.#movements.compareAndSet(claimId, null, intent);
		if (!written.applied) {
			const peer = await this.#movements.get(claimId);
			if (peer !== null) {
				const claim = this.#asStockClaim(key, peer, sku, direction, qty);
				if (claim.applied !== undefined) return { ...claim.applied.result };
				return this.#applyStockClaim(key, claimId, claim);
			}
		}
		return this.#applyStockClaim(key, claimId, intent);
	}

	/** Narrow a movement claim to THIS stock movement, or reject the reuse. */
	#asStockClaim(
		key: string,
		claim: MovementClaimDoc,
		sku: string,
		direction: StockDirection,
		qty: number,
	): StockMovementClaim {
		if (
			claim.kind !== "stock" ||
			claim.sku !== sku ||
			claim.direction !== direction ||
			claim.qty !== qty
		) {
			throw new StockMovementMismatchError(
				key,
				describeOtherKind(claim),
				describeMovement(direction, qty, sku),
			);
		}
		return claim;
	}

	/** Apply a claimed stock movement to the aggregate, then mark it applied. */
	async #applyStockClaim(
		key: string,
		claimId: string,
		claim: StockMovementClaim,
	): Promise<StockRemovalResult> {
		const result = await this.#cas<StockRemovalResult>(
			claim.direction === "restock"
				? "restock"
				: claim.direction === "absolute"
					? "setOnHandAbsolute"
					: "removeStock",
			async () => {
				const current = await this.#inventory.getVersioned(claim.sku);
				if (current === null) {
					return casDone<StockRemovalResult>({ ok: false, reason: "UNKNOWN_SKU" });
				}
				const doc = normalizeInventoryDoc(current.value);
				const recorded = await this.#movements.get(claimId);
				if (recorded?.kind === "stock" && recorded.applied !== undefined) {
					return casDone<StockRemovalResult>({ ...recorded.applied.result });
				}
				const remembered = findAppliedMovement(doc.appliedMovements, key, "stock");
				if (remembered?.kind === "stock") {
					return casDone<StockRemovalResult>({ ...remembered.result });
				}
				if (claim.witnessVersion !== 1) {
					throw new InventoryMovementReconciliationRequiredError(claimId, claim.sku);
				}

				let moved: StockRemovalResult;
				let onHand = doc.onHand;
				if (claim.direction === "restock") {
					onHand = doc.onHand + claim.qty;
					moved = { ok: true, onHand };
				} else if (claim.direction === "absolute") {
					onHand = claim.qty;
					moved = { ok: true, onHand };
				} else if (doc.onHand < claim.qty) {
					moved = { ok: false, reason: "INSUFFICIENT_STOCK", onHand: doc.onHand };
				} else {
					onHand = doc.onHand - claim.qty;
					moved = { ok: true, onHand };
				}
				// Check available + all retained holds in this same revision. A new
				// reservation forces a retry and a fresh absolute-target bound check.
				assertSafeStockTotal(onHand, doc.holds);

				const written = await this.#inventory.compareAndSet(claim.sku, current.revision, {
					...doc,
					onHand,
					appliedMovements: await this.#appendMovement(doc, {
						key,
						kind: "stock",
						result: moved,
					}),
				});
				if (!written.applied) return CAS_RETRY;
				return casDone<StockRemovalResult>(moved);
			},
		);

		await this.#markMovementApplied(claimId, (stored) =>
			stored.kind === "stock"
				? { ...stored, applied: { result, appliedAt: this.#clock.now().toISOString() } }
				: undefined,
		);
		// Read the answer back out of the durable record, so a same-key pair cannot
		// disagree: whoever marked the claim first owns the recorded result.
		const settled = await this.#movements.get(claimId);
		if (settled !== null && settled.kind === "stock" && settled.applied !== undefined) {
			return { ...settled.applied.result };
		}
		return result;
	}

	/**
	 * Before the inventory CAS can remove an entry, persist its ORIGINAL result
	 * on the claim. Failure prevents the inventory write. The pinned revision
	 * makes concurrent ring changes retry the entire check, so this ordering is
	 * sufficient across documents without transactions or a scheduled healer.
	 */
	async #appendMovement(doc: InventoryDoc, entry: AppliedMovement): Promise<AppliedMovement[]> {
		const next = pushAppliedMovement(doc.appliedMovements, entry);
		for (const previous of doc.appliedMovements ?? []) {
			if (next.some((kept) => kept.key === previous.key && kept.kind === previous.kind)) continue;
			if (previous.kind === "reserve") {
				await this.#markKeyTerminal(previous.key, previous.result, previous.reservationId);
				const state = await this.#setTerminalState(previous.reservationId, "failed");
				const recorded = await this.#keys.get(previous.key);
				if (
					recorded?.state !== "terminal" ||
					recorded.result.ok ||
					recorded.reservationId !== previous.reservationId ||
					(state !== undefined && state !== "failed")
				) {
					throw new InventoryMovementReconciliationRequiredError(previous.key, doc.sku);
				}
				continue;
			}
			const claimId =
				previous.kind === "stock" ? stockClaimId(previous.key) : adjustClaimId(previous.key);
			await this.#markMovementApplied(claimId, (stored) => {
				if (stored.sku !== doc.sku) return undefined;
				const appliedAt = this.#clock.now().toISOString();
				if (stored.kind === "stock" && previous.kind === "stock") {
					return { ...stored, applied: { result: previous.result, appliedAt } };
				}
				if (stored.kind === "adjust" && previous.kind === "adjust") {
					return { ...stored, applied: { result: previous.result, appliedAt } };
				}
				return undefined;
			});
			const recorded = await this.#movements.get(claimId);
			if (
				recorded === null ||
				recorded.sku !== doc.sku ||
				recorded.kind !== previous.kind ||
				recorded.applied === undefined
			) {
				throw new InventoryMovementReconciliationRequiredError(claimId, doc.sku);
			}
		}
		return next;
	}

	/** Record a movement claim's terminal answer. First writer wins; idempotent. */
	async #markMovementApplied(
		claimId: string,
		build: (stored: MovementClaimDoc) => MovementClaimDoc | undefined,
	): Promise<void> {
		await this.#cas<void>("movementApplied", async () => {
			const current = await this.#movements.getVersioned(claimId);
			if (current === null || current.value.applied !== undefined) return casDone<void>(undefined);
			const next = build(current.value);
			if (next === undefined) return casDone<void>(undefined);
			const written = await this.#movements.compareAndSet(claimId, current.revision, next);
			return written.applied ? casDone<void>(undefined) : CAS_RETRY;
		});
	}

	// -- shared internals ------------------------------------------------------

	#cas<T>(operation: string, step: (attempt: number) => Promise<CasStep<T>>): Promise<T> {
		return withCasRetry(operation, step, this.#retry);
	}

	/** An id absent from `reservation_index` is provably unknown. */
	async #mustIndex(reservationId: string): Promise<ReservationIndexDoc> {
		const index = await this.#index.get(reservationId);
		if (index === null) throw new ReservationNotFoundError(reservationId);
		return index;
	}

	async #resolveMany(reservationIds: readonly string[]): Promise<Map<string, ReservationIndexDoc>> {
		const rows = await Promise.all(reservationIds.map((id) => this.#index.get(id)));
		const byId = new Map<string, ReservationIndexDoc>();
		for (const [i, id] of reservationIds.entries()) {
			const row = rows[i];
			if (row !== null && row !== undefined) byId.set(id, row);
		}
		return byId;
	}

	/** The hold this reservation owns, if it is still live in the aggregate. */
	async #liveHold(
		index: ReservationIndexDoc,
		reservationId: string,
	): Promise<HoldEntry | undefined> {
		const doc = await this.#inventory.get(index.sku);
		if (doc === null) return undefined;
		const hold = normalizeInventoryDoc(doc).holds[index.idempotencyKey];
		// A hold filed under this key but owned by a DIFFERENT id cannot be this
		// reservation's — a completion always reuses the claimed id, so this is only
		// reachable if an id source collided.
		return hold !== undefined && hold.reservationId === reservationId ? hold : undefined;
	}

	#pruneEntries(index: ReservationIndexDoc, reservationId: string): PruneEntry[] {
		if (index.terminalState === undefined || index.terminalState === "failed") return [];
		return [{ reserveKey: index.idempotencyKey, reservationId, terminal: index.terminalState }];
	}

	/**
	 * The ordered settle: **terminal outcome, then terminal state, then the prune**.
	 * Writing the outcome before the prune is what keeps a reserve replay from
	 * looking fresh after the hold is gone. Every step is idempotent, so any
	 * replayer can finish an interrupted settle.
	 */
	async #settle(
		index: ReservationIndexDoc,
		reservationId: string,
		terminal: TerminalReservationState,
	): Promise<TerminalReservationState> {
		const winner = await this.#recordTerminal(index.idempotencyKey, reservationId, terminal);
		await this.#prune(
			index.sku,
			this.#pruneEntries({ ...index, terminalState: winner }, reservationId),
			terminal === "committed" ? "commit" : "release",
		);
		return winner;
	}

	/** Steps 1 and 2 of the settle: the reserve key's answer, then the terminal state. */
	async #recordTerminal(
		reserveKey: string,
		reservationId: string,
		terminal: TerminalReservationState,
	): Promise<TerminalReservationState> {
		// A hold exists, so the reserve succeeded: that is the answer the key
		// document must carry once the hold is gone.
		await this.#markKeyTerminal(reserveKey, { ok: true, reservationId }, reservationId);
		const winner = await this.#setTerminalState(reservationId, terminal);
		if (winner === undefined) throw new ReservationNotFoundError(reservationId);
		return winner;
	}

	/** Move a reservation key document to its terminal outcome. First writer wins. */
	async #markKeyTerminal(
		key: string,
		result: ReserveResult,
		reservationId: string | null,
	): Promise<void> {
		await this.#cas<void>("reserveKeyTerminal", async () => {
			const terminal: ReservationKeyDoc = {
				state: "terminal",
				result,
				reservationId,
				recordedAt: this.#clock.now().toISOString(),
			};
			const current = await this.#keys.getVersioned(key);
			if (current === null) {
				const created = await this.#keys.compareAndSet(key, null, terminal);
				return created.applied ? casDone<void>(undefined) : CAS_RETRY;
			}
			if (current.value.state === "terminal") return casDone<void>(undefined);
			const written = await this.#keys.compareAndSet(key, current.revision, terminal);
			return written.applied ? casDone<void>(undefined) : CAS_RETRY;
		});
	}

	/** First terminal state wins; a later one is a no-op. */
	async #setTerminalState(
		reservationId: string,
		terminal: TerminalReservationState,
	): Promise<TerminalReservationState | undefined> {
		return this.#cas<TerminalReservationState | undefined>("reservationTerminalState", async () => {
			const current = await this.#index.getVersioned(reservationId);
			if (current === null) return casDone(undefined);
			if (current.value.terminalState !== undefined) {
				return casDone(current.value.terminalState);
			}
			const written = await this.#index.compareAndSet(reservationId, current.revision, {
				...current.value,
				terminalState: terminal,
			});
			return written.applied ? casDone(terminal) : CAS_RETRY;
		});
	}

	/**
	 * Step 3 of the settle: remove the holds from the aggregate, returning units for
	 * the released ones. ONE `compareAndSet` for every entry on this sku. Idempotent
	 * — an already-pruned hold is simply absent — which is what makes an
	 * interrupted settle safe to re-run, and a partially applied batch safe to
	 * complete.
	 */
	async #prune(sku: string, entries: readonly PruneEntry[], operation: string): Promise<void> {
		if (entries.length === 0) return;
		await this.#cas<void>(operation, async () => {
			const current = await this.#inventory.getVersioned(sku);
			if (current === null) return casDone<void>(undefined);
			const doc = normalizeInventoryDoc(current.value);
			const holds = { ...doc.holds };
			let onHand = doc.onHand;
			let changed = false;
			for (const entry of entries) {
				const hold = holds[entry.reserveKey];
				if (hold === undefined || hold.reservationId !== entry.reservationId) continue;
				delete holds[entry.reserveKey];
				if (entry.terminal === "released") onHand += hold.qty;
				changed = true;
			}
			if (!changed) return casDone<void>(undefined);
			assertSafeStockTotal(onHand, holds);
			const written = await this.#inventory.compareAndSet(sku, current.revision, {
				...doc,
				onHand,
				holds,
			});
			return written.applied ? casDone<void>(undefined) : CAS_RETRY;
		});
	}
}
