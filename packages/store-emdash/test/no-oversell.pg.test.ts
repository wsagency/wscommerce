/**
 * The race. Postgres only: better-sqlite3 serializes writes in one process, so it
 * verifies the SQL and never the contention.
 *
 * N concurrent reserves against stock M (M < N) must yield exactly M successes and
 * leave the count at 0 — the headline invariant, here over `compareAndSet` on one
 * embedded-holds aggregate instead of a guarded `UPDATE`. The losers are checked
 * for the second property that matters: a loser is either a clean `OUT_OF_STOCK`
 * (the units really were gone) or the typed retryable contention error, and NEVER
 * a contention failure dressed up as `OUT_OF_STOCK`.
 *
 * The pool is sized so each of the N callers can hold its OWN connection — a pool
 * narrower than the crowd serializes the writers and weakens the race, which is
 * why this file builds its own storage instead of taking the shared one.
 *
 * The maximum compare-and-set depth observed is printed, because that number is
 * the contention budget this design accepts (INC-A3 turns it into an assertion).
 */
import { idempotencyKey } from "@otta-sh/domain";
import { FixedClock } from "@otta-sh/domain/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InventoryDoc, MovementClaimDoc, StorageAccess } from "../src/index.js";
import {
	adjustClaimId,
	CAS_MAX_ATTEMPTS,
	collectionOf,
	INVENTORY_MOVEMENTS_COLLECTION,
	EmdashInventoryStore,
	INVENTORY_COLLECTION,
	isStorageContentionError,
	newInventoryDoc,
	uuidIdGen,
	normalizeInventoryDoc,
} from "../src/index.js";
import { makePgStorage, PG_ENABLED } from "./describe-each-dialect.js";
import { INVENTORY_LAYOUT } from "./inventory-collections.js";

const M = 5;
const N = 50;
const LOOPS = 20;

describe.skipIf(!PG_ENABLED)("no oversell under concurrency [postgres]", () => {
	let storage: StorageAccess;
	let close: () => Promise<void>;

	beforeAll(async () => {
		const db = await makePgStorage(INVENTORY_LAYOUT, N + 4);
		storage = db.storage;
		close = db.close;
	}, 180_000);

	afterAll(async () => {
		await close?.();
	});

	it(`${String(N)} concurrent reserves against ${String(M)} units yield exactly ${String(M)} winners, ${String(LOOPS)} times over`, async () => {
		const inventory = collectionOf<InventoryDoc>(storage, INVENTORY_COLLECTION);
		let maxAttempts = 0;
		let contentionErrors = 0;
		const store = new EmdashInventoryStore({
			storage,
			idGen: uuidIdGen,
			clock: new FixedClock(new Date("2026-07-10T00:00:00.000Z")),
			onCasAttempts: (_operation, attempts) => {
				if (attempts > maxAttempts) maxAttempts = attempts;
			},
		});

		const winnersPerLoop: number[] = [];
		for (let loop = 0; loop < LOOPS; loop++) {
			// A fresh sku per loop: each race is independent, and nothing has to
			// truncate the table (which would drop the revision trigger the whole
			// design depends on).
			const sku = `SKU-RACE-${String(loop)}`;
			await inventory.compareAndSet(sku, null, newInventoryDoc(sku, M));

			const settled = await Promise.all(
				Array.from({ length: N }, async (_unused, i) => {
					const key = idempotencyKey(`k-${String(loop)}-${String(i)}`);
					return { key, result: await store.reserve(sku, 1, key).catch((err: unknown) => err) };
				}),
			);

			let winners = 0;
			let outOfStock = 0;
			let contendedHere = 0;
			for (const command of settled) {
				let result = command.result;
				if (isStorageContentionError(result)) {
					contendedHere++;
					expect(result.attempts).toBe(CAS_MAX_ATTEMPTS);
					// The crowd may exhaust the ceiling while recording failed-decision
					// witnesses. Retry the SAME key after the burst and heal its receipt.
					result = await store.reserve(sku, 1, command.key);
				}
				if (result instanceof Error) throw result;
				const reserve = result as Awaited<ReturnType<typeof store.reserve>>;
				expect(await store.reserve(sku, 1, command.key)).toEqual(reserve);
				if (reserve.ok) {
					winners++;
				} else {
					// The ONLY acceptable non-ok reason: contention has its own type and
					// must never be collapsed into "the item is gone".
					expect(reserve.reason).toBe("OUT_OF_STOCK");
					outOfStock++;
				}
			}
			contentionErrors += contendedHere;

			expect(winners, `loop ${String(loop)}: winners`).toBe(M);
			expect(winners + outOfStock, `loop ${String(loop)}: accounted after recovery`).toBe(N);
			expect(outOfStock).toBe(N - M);
			winnersPerLoop.push(winners);

			const doc = await inventory.get(sku);
			if (doc === null) throw new Error(`loop ${String(loop)}: missing inventory document`);
			expect(doc.onHand, `loop ${String(loop)}: final onHand`).toBe(0);
			// Every winner left its hold behind: M holds, M units accounted for.
			expect(
				Object.keys(normalizeInventoryDoc(doc).holds),
				`loop ${String(loop)}: holds`,
			).toHaveLength(M);
		}

		console.info(
			`[no-oversell] loops=${String(LOOPS)} winnersPerLoop=${winnersPerLoop.join(",")} ` +
				`maxCasAttempts=${String(maxAttempts)}/${String(CAS_MAX_ATTEMPTS)} ` +
				`contentionErrors=${String(contentionErrors)}`,
		);
		expect(winnersPerLoop).toEqual(Array.from({ length: LOOPS }, () => M));
		// Claimed failures also write witnesses: the bound includes the crowd.
		// The hard ceiling stays fixed, and every busy command's recovery is checked.
		expect(maxAttempts).toBeLessThanOrEqual(CAS_MAX_ATTEMPTS);
	}, 300_000);

	it("concurrent reserves sharing ONE idempotency key produce one hold, one decrement and one reservation id", async () => {
		// A real race, not a sequence: every caller is started before the first await,
		// so they contend for the same key claim AND the same aggregate revision. The
		// key document is claimed create-if-absent, so exactly one caller mints an id
		// and every other caller completes THAT claim.
		const inventory = collectionOf<InventoryDoc>(storage, INVENTORY_COLLECTION);
		const store = new EmdashInventoryStore({
			storage,
			idGen: uuidIdGen,
			clock: new FixedClock(new Date("2026-07-10T00:00:00.000Z")),
		});
		const sku = "SKU-SAME-KEY";
		await inventory.compareAndSet(sku, null, newInventoryDoc(sku, 10));
		const key = idempotencyKey("one-key");

		const results = await Promise.all(Array.from({ length: 20 }, () => store.reserve(sku, 1, key)));

		const first = results[0];
		if (first === undefined) throw new Error("no results");
		for (const result of results) expect(result).toEqual(first);
		if (!first.ok) throw new Error("the shared key must resolve to one ok reserve");

		// ONE unit left the shelf, under ONE hold, with ONE id.
		const doc = await inventory.get(sku);
		if (doc === null) throw new Error("missing inventory document");
		expect(doc.onHand).toBe(9);
		const holds = Object.entries(normalizeInventoryDoc(doc).holds);
		expect(holds).toHaveLength(1);
		expect(holds[0]?.[0]).toBe(key);
		expect(holds[0]?.[1].reservationId).toBe(first.reservationId);

		// And the one reservation is reachable by that id: it commits, and commit
		// consumes the units rather than returning them.
		await store.commit(first.reservationId);
		expect((await inventory.get(sku))?.onHand).toBe(9);
	}, 120_000);

	it("concurrent adjusts re-derive: a same-key pair agree, a different key still applies, and units are conserved", async () => {
		// Two callers share one adjust key; a third uses another key, on the SAME hold.
		// All three start before any await. `adjust` takes an absolute target and
		// re-derives the previous qty on every attempt (what a rolled-back SQL adjust
		// does), so the different key applies rather than being refused — and the
		// same-key pair must both return the DURABLE answer, not their own view.
		const inventory = collectionOf<InventoryDoc>(storage, INVENTORY_COLLECTION);
		const movements = collectionOf<MovementClaimDoc>(storage, INVENTORY_MOVEMENTS_COLLECTION);
		const store = new EmdashInventoryStore({
			storage,
			idGen: uuidIdGen,
			clock: new FixedClock(new Date("2026-07-10T00:00:00.000Z")),
		});
		const sku = "SKU-ADJUST-RACE";
		await inventory.compareAndSet(sku, null, newInventoryDoc(sku, 100));
		const held = await store.reserve(sku, 2, idempotencyKey("hold"));
		if (!held.ok) throw new Error("the seed reserve must succeed");

		const shared = idempotencyKey("adj-shared");
		const other = idempotencyKey("adj-other");
		const [a1, a2, b] = await Promise.all([
			store.adjust(held.reservationId, 5, shared),
			store.adjust(held.reservationId, 5, shared),
			store.adjust(held.reservationId, 7, other),
		]);

		// One key, one answer — whichever caller recorded it first.
		expect(a1).toEqual(a2);
		// Ample stock, so every adjust applied: no stock outcome is possible here.
		expect(a1).toEqual({ ok: true, reservationId: held.reservationId });
		expect(b).toEqual({ ok: true, reservationId: held.reservationId });

		const doc = await inventory.get(sku);
		if (doc === null) throw new Error("missing inventory document");
		const hold = normalizeInventoryDoc(doc).holds.hold;
		if (hold === undefined) throw new Error("missing hold");
		// The hold landed on one of the two requested targets — never a blend, never
		// a double-applied shared key (which would show as 5 + 3 more units moved).
		expect([5, 7]).toContain(hold.qty);
		// Units conserved: everything off the shelf is held by this reservation.
		expect(doc.onHand + hold.qty).toBe(100);

		// Both claims are durably recorded, and they agree with what the callers saw.
		const sharedClaim = await movements.get(adjustClaimId(shared));
		const otherClaim = await movements.get(adjustClaimId(other));
		if (sharedClaim?.kind !== "adjust" || otherClaim?.kind !== "adjust") {
			throw new Error("both adjust claims must be recorded");
		}
		expect(sharedClaim.applied?.result).toEqual(a1);
		expect(otherClaim.applied?.result).toEqual(b);
	}, 120_000);
});
