import { idempotencyKey, sku } from "@otta-sh/domain";
import { absoluteStockContract, FixedClock } from "@otta-sh/domain/testing";
import { expect, test } from "vitest";
import {
	APPLIED_MOVEMENT_RING_SIZE,
	collectionOf,
	EmdashInventoryStore,
	INVENTORY_COLLECTION,
	INVENTORY_MOVEMENTS_COLLECTION,
	stockClaimId,
	uuidIdGen,
	type InventoryDoc,
	type MovementClaimDoc,
	type StorageAccess,
} from "../src/index.js";
import {
	failCall,
	InjectedCrashError,
	isUpdateWrite,
	parkCall,
	withCollection,
} from "./helpers/fault-injection.js";

const make = (storage: StorageAccess) =>
	new EmdashInventoryStore({
		storage,
		idGen: uuidIdGen,
		clock: new FixedClock(new Date("2026-09-30T00:00:00Z")),
		sleep: async () => {},
		random: () => 0,
	});
const item = sku("BOOK");

/** Faults decorate actual storage calls; no database implementation is mocked. */
export function nativeAbsoluteStockContract(storage: () => StorageAccess): void {
	absoluteStockContract(() => make(storage()));

	test("setter CAS retry preserves a reservation acquired after its first stock read", async () => {
		const access = storage();
		const store = make(access);
		await store.seedOnHand(item, 10);
		const parked = parkCall(access[INVENTORY_COLLECTION]!, isUpdateWrite);
		const setting = make(
			withCollection(access, INVENTORY_COLLECTION, parked.collection),
		).setOnHandAbsolute(item, 2, idempotencyKey("setter"));
		await parked.arrived;
		let held;
		try {
			held = await store.reserve(item, 3, idempotencyKey("new-hold"));
		} finally {
			parked.release();
		}
		expect(await setting).toEqual({ ok: true, onHand: 2 });
		if (!held?.ok) throw new Error("the competing reservation must succeed");
		const doc = await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(item);
		expect(doc?.holds["new-hold"]?.qty).toBe(3);
		await store.release(held.reservationId);
		expect(await store.getOnHand(item)).toBe(5);
	});

	test("setter CAS retry does not restore a hold released after its first stock read", async () => {
		const access = storage();
		const store = make(access);
		await store.seedOnHand(item, 10);
		const held = await store.reserve(item, 3, idempotencyKey("hold"));
		if (!held.ok) throw new Error("the reservation must succeed");
		const parked = parkCall(access[INVENTORY_COLLECTION]!, isUpdateWrite);
		const setting = make(
			withCollection(access, INVENTORY_COLLECTION, parked.collection),
		).setOnHandAbsolute(item, 2, idempotencyKey("setter"));
		await parked.arrived;
		try {
			await store.release(held.reservationId);
		} finally {
			parked.release();
		}
		expect(await setting).toEqual({ ok: true, onHand: 2 });
		expect(
			(await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(item))?.holds,
		).toEqual({});
		await store.release(held.reservationId);
		expect(await store.getOnHand(item)).toBe(2);
	});

	test("setter interrupted before inventory CAS completes from its durable claim with current holds", async () => {
		const access = storage();
		const store = make(access);
		const key = idempotencyKey("before-CAS");
		await store.seedOnHand(item, 10);
		const crash = failCall(access[INVENTORY_COLLECTION]!, isUpdateWrite, { mode: "instead" });
		await expect(
			make(withCollection(access, INVENTORY_COLLECTION, crash.collection)).setOnHandAbsolute(
				item,
				4,
				key,
			),
		).rejects.toThrow(InjectedCrashError);
		expect(await store.getOnHand(item)).toBe(10);
		const held = await store.reserve(item, 3, idempotencyKey("later-hold"));
		if (!held.ok) throw new Error("the later hold must succeed");
		expect(await store.setOnHandAbsolute(item, 4, key)).toEqual({ ok: true, onHand: 4 });
		await store.release(held.reservationId);
		expect(await store.getOnHand(item)).toBe(7);
	});

	test("setter interrupted after inventory CAS stays once-only after 256 actual subsequent restocks", async () => {
		const access = storage();
		const store = make(access);
		const key = idempotencyKey("after-CAS");
		await store.seedOnHand(item, 10);
		const crash = failCall(access[INVENTORY_MOVEMENTS_COLLECTION]!, isUpdateWrite, {
			mode: "instead",
		});
		await expect(
			make(
				withCollection(access, INVENTORY_MOVEMENTS_COLLECTION, crash.collection),
			).setOnHandAbsolute(item, 7, key),
		).rejects.toThrow(InjectedCrashError);
		expect(await store.getOnHand(item)).toBe(7);
		for (let i = 0; i < APPLIED_MOVEMENT_RING_SIZE; i++) {
			await store.restock(item, 1, idempotencyKey(`restock-${String(i)}`));
		}
		const doc = await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(item);
		expect(doc?.appliedMovements?.some((entry) => entry.key === key)).toBe(false);
		const claim = await collectionOf<MovementClaimDoc>(access, INVENTORY_MOVEMENTS_COLLECTION).get(
			stockClaimId(key),
		);
		expect(claim?.applied?.result).toEqual({ ok: true, onHand: 7 });
		expect(await store.setOnHandAbsolute(item, 7, key)).toEqual({ ok: true, onHand: 7 });
		expect(await store.getOnHand(item)).toBe(7 + APPLIED_MOVEMENT_RING_SIZE);
	});
}
