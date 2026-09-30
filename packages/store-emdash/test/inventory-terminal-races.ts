import { idempotencyKey, ReservationCommitLostError, sku } from "@otta-sh/domain";
import { FixedClock } from "@otta-sh/domain/testing";
import { expect, test } from "vitest";
import {
	collectionOf,
	EmdashInventoryStore,
	INVENTORY_COLLECTION,
	RESERVATION_INDEX_COLLECTION,
	ReservationNotReleasableError,
	uuidIdGen,
	type InventoryDoc,
	type ReservationIndexDoc,
	type StorageAccess,
} from "../src/index.js";
import {
	failCall,
	InjectedCrashError,
	isUpdateWrite,
	parkCall,
	parkRead,
	withCollection,
} from "./helpers/fault-injection.js";

const item = sku("BOOK");
const owner = "terminal-race-order";
const make = (storage: StorageAccess) =>
	new EmdashInventoryStore({
		storage,
		clock: new FixedClock(new Date("2026-07-10T00:00:00.000Z")),
		idGen: uuidIdGen,
		sleep: async () => {},
		random: () => 0,
	});

async function adopted(store: EmdashInventoryStore): Promise<string> {
	await store.seedOnHand(item, 10);
	const hold = await store.reserve(item, 2, idempotencyKey("terminal-race-hold"));
	if (!hold.ok) throw new Error("Fixture reservation failed");
	await store.stampHoldDeadline(hold.reservationId, "2026-07-11T00:00:00.000Z");
	expect(
		await store.adopt({
			reservationId: hold.reservationId,
			orderId: owner,
			now: "2026-07-10T00:00:00.000Z",
			holdExpiresAt: "2026-07-11T00:00:00.000Z",
		}),
	).toEqual({ ok: true });
	return hold.reservationId;
}

/** Parked calls still perform the actual host CAS on SQLite, Postgres and D1. */
export function inventoryTerminalRaceCases(storage: () => StorageAccess): void {
	for (const operation of ["commit", "release"] as const) {
		test(`${operation} reclassifies a stale live index when its peer already completed the prune`, async () => {
			const access = storage();
			const store = make(access);
			const id = await adopted(store);
			// The index read has already classified this as live. Pause its following
			// inventory read while a peer completes the terminal write AND prune.
			const parked = parkRead(access[INVENTORY_COLLECTION]!, (call) => call.method === "get");
			const replayingStore = make(withCollection(access, INVENTORY_COLLECTION, parked.collection));
			const replaying = replayingStore[operation](id).then(
				() => ({ ok: true as const }),
				(error: unknown) => ({ ok: false as const, error }),
			);
			await parked.arrived;
			try {
				await store[operation](id);
			} finally {
				parked.release();
			}
			expect(await replaying).toEqual({ ok: true });
			expect(await store.getOnHand(item)).toBe(operation === "commit" ? 8 : 10);
		});
	}

	for (const winningCommit of ["commit", "commitMany"] as const) {
		for (const losingRelease of ["release", "releaseAdopted"] as const) {
			test(`${losingRelease} losing to ${winningCommit} prunes as committed and cannot return spent units`, async () => {
				const access = storage();
				const store = make(access);
				const id = await adopted(store);
				const releaseIndex = parkCall(access[RESERVATION_INDEX_COLLECTION]!, isUpdateWrite);
				const commitPrune = parkCall(access[INVENTORY_COLLECTION]!, isUpdateWrite);
				const releasingStore = make(
					withCollection(access, RESERVATION_INDEX_COLLECTION, releaseIndex.collection),
				);
				const releasing = (
					losingRelease === "release"
						? releasingStore.release(id)
						: releasingStore.releaseAdopted(id, owner)
				).then(
					() => ({ ok: true as const }),
					(error: unknown) => ({ ok: false as const, error }),
				);
				await releaseIndex.arrived;
				const committingStore = make(
					withCollection(access, INVENTORY_COLLECTION, commitPrune.collection),
				);
				const committing =
					winningCommit === "commit"
						? committingStore.commit(id)
						: committingStore.commitMany([id]);
				await commitPrune.arrived;
				try {
					expect(
						(await collectionOf<ReservationIndexDoc>(access, RESERVATION_INDEX_COLLECTION).get(id))
							?.terminalState,
					).toBe("committed");
					releaseIndex.release();
					await releasing;
				} finally {
					releaseIndex.release();
					commitPrune.release();
					await Promise.all([releasing, committing]);
				}
				expect(await store.getOnHand(item)).toBe(8);
				const result = await releasing;
				if (losingRelease === "release") {
					expect(result.ok).toBe(false);
					if (!result.ok) expect(result.error).toBeInstanceOf(ReservationNotReleasableError);
				} else expect(result).toEqual({ ok: true });
				expect(
					(await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(item))?.holds,
				).toEqual({});
				await store.commit(id);
				await store.releaseAdopted(id, owner);
				expect(await store.getOnHand(item)).toBe(8);
			});
		}
	}

	for (const losingCommit of ["commit", "commitMany"] as const) {
		test(`${losingCommit} losing to scoped release returns units once and reports the lost hold`, async () => {
			const access = storage();
			const store = make(access);
			const id = await adopted(store);
			const commitIndex = parkCall(access[RESERVATION_INDEX_COLLECTION]!, isUpdateWrite);
			const releasePrune = parkCall(access[INVENTORY_COLLECTION]!, isUpdateWrite);
			const committingStore = make(
				withCollection(access, RESERVATION_INDEX_COLLECTION, commitIndex.collection),
			);
			const committing = (
				losingCommit === "commit"
					? committingStore.commit(id).then(() => ({ lost: [] as string[] }))
					: committingStore.commitMany([id])
			).then(
				(result) => ({ ok: true as const, result }),
				(error: unknown) => ({ ok: false as const, error }),
			);
			await commitIndex.arrived;
			const releasing = make(
				withCollection(access, INVENTORY_COLLECTION, releasePrune.collection),
			).releaseAdopted(id, owner);
			await releasePrune.arrived;
			try {
				expect(
					(await collectionOf<ReservationIndexDoc>(access, RESERVATION_INDEX_COLLECTION).get(id))
						?.terminalState,
				).toBe("released");
				commitIndex.release();
				await committing;
			} finally {
				commitIndex.release();
				releasePrune.release();
				await Promise.all([committing, releasing]);
			}
			expect(await store.getOnHand(item)).toBe(10);
			const outcome = await committing;
			if (losingCommit === "commit") {
				expect(outcome.ok).toBe(false);
				if (!outcome.ok) expect(outcome.error).toBeInstanceOf(ReservationCommitLostError);
			} else expect(outcome).toEqual({ ok: true, result: { lost: [id] } });
			await store.releaseAdopted(id, owner);
			expect(await store.commitMany([id])).toEqual({ lost: [id] });
			expect(await store.getOnHand(item)).toBe(10);
		});
	}

	for (const terminal of ["committed", "released"] as const) {
		test(`batch replay heals an interrupted ${terminal} terminal record according to its durable state`, async () => {
			const access = storage();
			const store = make(access);
			const id = await adopted(store);
			const crashed = failCall(access[INVENTORY_COLLECTION]!, isUpdateWrite, { mode: "instead" });
			const interrupted = make(withCollection(access, INVENTORY_COLLECTION, crashed.collection));
			await expect(
				terminal === "committed" ? interrupted.commit(id) : interrupted.releaseAdopted(id, owner),
			).rejects.toThrow(InjectedCrashError);
			expect(await store.getOnHand(item)).toBe(8);
			expect(
				(await collectionOf<ReservationIndexDoc>(access, RESERVATION_INDEX_COLLECTION).get(id))
					?.terminalState,
			).toBe(terminal);
			expect(await store.commitMany([id, id])).toEqual({
				lost: terminal === "committed" ? [] : [id],
			});
			expect(
				(await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(item))?.holds,
			).toEqual({});
			expect(await store.getOnHand(item)).toBe(terminal === "committed" ? 8 : 10);
		});
	}

	test("absolute setter retries its integer bound when a new hold arrives before the inventory CAS", async () => {
		const access = storage();
		const store = make(access);
		await store.seedOnHand(item, 2);
		const parked = parkCall(access[INVENTORY_COLLECTION]!, isUpdateWrite);
		const setting = make(withCollection(access, INVENTORY_COLLECTION, parked.collection))
			.setOnHandAbsolute(item, Number.MAX_SAFE_INTEGER, idempotencyKey("integer-bound"))
			.then(
				() => ({ ok: true as const }),
				(error: unknown) => ({ ok: false as const, error }),
			);
		await parked.arrived;
		const hold = await store.reserve(item, 1, idempotencyKey("new-hold"));
		parked.release();
		const outcome = await setting;
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.error).toBeInstanceOf(RangeError);
		expect(await store.getOnHand(item)).toBe(1);
		if (!hold.ok) throw new Error("Fixture reservation failed");
		await store.release(hold.reservationId);
		expect(await store.getOnHand(item)).toBe(2);
	});
}
