import { expect, test } from "vitest";
import { idempotencyKey, sku } from "../money/ids.js";
import { StockMovementMismatchError, type InventoryStore } from "../ports/inventory-store.js";

/** Port behavior shared by the fake, migrated SQL and local D1 adapters. */
export function absoluteStockContract(make: () => InventoryStore): void {
	test("absolute available zero preserves a live hold and release returns exactly its units", async () => {
		const store = make();
		const item = sku("BOOK");
		await store.seedOnHand(item, 10);
		const held = await store.reserve(item, 3, idempotencyKey("hold"));
		if (!held.ok) throw new Error("the three-unit hold must succeed");
		expect(await store.setOnHandAbsolute(item, 0, idempotencyKey("zero"))).toEqual({
			ok: true,
			onHand: 0,
		});
		expect(await store.reserve(item, 1, idempotencyKey("empty"))).toEqual({
			ok: false,
			reason: "OUT_OF_STOCK",
		});
		await store.release(held.reservationId);
		expect(await store.getOnHand(item)).toBe(3);
	});

	test("committing a hold does not decrement the new available target", async () => {
		const store = make();
		const item = sku("BOOK");
		await store.seedOnHand(item, 10);
		const held = await store.reserve(item, 3, idempotencyKey("hold"));
		if (!held.ok) throw new Error("the three-unit hold must succeed");
		expect(await store.setOnHandAbsolute(item, 2, idempotencyKey("two"))).toEqual({
			ok: true,
			onHand: 2,
		});
		await store.commit(held.reservationId);
		expect(await store.getOnHand(item)).toBe(2);
	});

	test("stale setter replay returns its original answer without rewinding subsequent stock writes", async () => {
		const store = make();
		const item = sku("BOOK");
		const key = idempotencyKey("first");
		await store.seedOnHand(item, 10);
		const first = await store.setOnHandAbsolute(item, 7, key);
		expect(first).toEqual({ ok: true, onHand: 7 });
		await store.restock(item, 5, idempotencyKey("later-restock"));
		await store.removeStock(item, 2, idempotencyKey("later-removal"));
		if (first.ok) first.onHand = 999;
		expect(await store.setOnHandAbsolute(item, 7, key)).toEqual({ ok: true, onHand: 7 });
		expect(await store.getOnHand(item)).toBe(10);
	});

	test("unknown SKU neither creates stock nor consumes the setter key", async () => {
		const store = make();
		const item = sku("BOOK");
		const key = idempotencyKey("unknown");
		expect(await store.setOnHandAbsolute(item, 7, key)).toEqual({
			ok: false,
			reason: "UNKNOWN_SKU",
		});
		expect(await store.findOnHand(item)).toBeNull();
		await store.seedOnHand(item, 2);
		expect(await store.setOnHandAbsolute(item, 7, key)).toEqual({ ok: true, onHand: 7 });
	});

	test("setter keys reject changed target, SKU and stock operation while reserve keys stay independent", async () => {
		const store = make();
		const item = sku("BOOK");
		const key = idempotencyKey("same");
		await store.seedOnHand(item, 10);
		await store.seedOnHand("OTHER", 10);
		await store.setOnHandAbsolute(item, 7, key);
		await expect(store.setOnHandAbsolute(item, 8, key)).rejects.toThrow(StockMovementMismatchError);
		await expect(store.setOnHandAbsolute(sku("OTHER"), 7, key)).rejects.toThrow(
			StockMovementMismatchError,
		);
		await expect(store.restock(item, 7, key)).rejects.toThrow(StockMovementMismatchError);
		await expect(store.removeStock(item, 7, key)).rejects.toThrow(StockMovementMismatchError);
		expect(await store.reserve(item, 2, key)).toMatchObject({ ok: true });
		expect(await store.setOnHandAbsolute(item, 7, key)).toEqual({ ok: true, onHand: 7 });
		expect(await store.getOnHand(item)).toBe(5);
	});

	test("invalid absolute targets fail before consuming a key or modifying stock", async () => {
		const store = make();
		const item = sku("BOOK");
		const key = idempotencyKey("validation");
		await store.seedOnHand(item, 10);
		for (const target of [
			-1,
			0.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.MAX_SAFE_INTEGER + 1,
		]) {
			await expect(store.setOnHandAbsolute(item, target, key)).rejects.toThrow(RangeError);
			await expect(store.getOnHand(item)).resolves.toBe(10);
		}
		await expect(store.setOnHandAbsolute(item, 0, key)).resolves.toEqual({ ok: true, onHand: 0 });
	});

	test("an absolute target plus retained holds must fit a safe integer before any stock changes", async () => {
		const store = make();
		const item = sku("BOOK");
		await store.seedOnHand(item, 2);
		const held = await store.reserve(item, 1, idempotencyKey("hold"));
		if (!held.ok) throw new Error("the reservation must succeed");
		await expect(
			store.setOnHandAbsolute(item, Number.MAX_SAFE_INTEGER, idempotencyKey("unsafe-total")),
		).rejects.toThrow(RangeError);
		expect(await store.getOnHand(item)).toBe(1);
		await store.release(held.reservationId);
		await store.release(held.reservationId);
		expect(await store.getOnHand(item)).toBe(2);
	});

	test("the largest safe target with held units remains exact through adjustment and release", async () => {
		const store = make();
		const item = sku("BOOK");
		await store.seedOnHand(item, 3);
		const held = await store.reserve(item, 2, idempotencyKey("hold"));
		if (!held.ok) throw new Error("the reservation must succeed");
		expect(
			await store.setOnHandAbsolute(
				item,
				Number.MAX_SAFE_INTEGER - 2,
				idempotencyKey("safe-total"),
			),
		).toEqual({ ok: true, onHand: Number.MAX_SAFE_INTEGER - 2 });
		await store.adjust(held.reservationId, 1, idempotencyKey("decrease"));
		expect(await store.getOnHand(item)).toBe(Number.MAX_SAFE_INTEGER - 1);
		await store.release(held.reservationId);
		await store.release(held.reservationId);
		expect(await store.getOnHand(item)).toBe(Number.MAX_SAFE_INTEGER);
		await expect(store.restock(item, 1, idempotencyKey("overflow"))).rejects.toThrow(RangeError);
		expect(await store.getOnHand(item)).toBe(Number.MAX_SAFE_INTEGER);
	});

	test("restock also counts retained holds when rejecting an unsafe total", async () => {
		const store = make();
		const item = sku("BOOK");
		await store.seedOnHand(item, 2);
		const held = await store.reserve(item, 1, idempotencyKey("hold"));
		if (!held.ok) throw new Error("the reservation must succeed");
		await expect(
			store.restock(item, Number.MAX_SAFE_INTEGER - 1, idempotencyKey("unsafe-restock")),
		).rejects.toThrow(RangeError);
		expect(await store.getOnHand(item)).toBe(1);
		await store.release(held.reservationId);
		expect(await store.getOnHand(item)).toBe(2);
	});
}
