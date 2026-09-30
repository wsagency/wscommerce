import { idempotencyKey, sku } from "@otta-sh/domain";
import { FixedClock } from "@otta-sh/domain/testing";
import { expect, test } from "vitest";
import {
	APPLIED_MOVEMENT_RING_SIZE,
	collectionOf,
	EmdashInventoryStore,
	INVENTORY_COLLECTION,
	INVENTORY_MOVEMENTS_COLLECTION,
	RESERVATION_INDEX_COLLECTION,
	RESERVATION_KEYS_COLLECTION,
	SkuStockTransfer,
	uuidIdGen,
	type InventoryDoc,
	type ReservationIndexDoc,
	type ReservationKeyDoc,
	type SkuRenameLedgerDoc,
	type StorageAccess,
} from "../src/index.js";
import {
	delegatingCollection,
	failCall,
	InjectedCrashError,
	isUpdateWrite,
	nthCall,
	onId,
	parkCall,
	withCollection,
} from "./helpers/fault-injection.js";

const item = "BOOK";
const key = idempotencyKey("abandoned-reserve");
const make = (storage: StorageAccess) =>
	new EmdashInventoryStore({
		storage,
		clock: new FixedClock(new Date("2026-09-30T00:00:00.000Z")),
		idGen: uuidIdGen,
		sleep: async () => {},
		random: () => 0,
	});

async function abandoned(access: StorageAccess): Promise<string> {
	const store = make(access);
	await store.seedOnHand(item, 1);
	const crash = failCall(access[INVENTORY_COLLECTION]!, isUpdateWrite, { mode: "instead" });
	await expect(
		make(withCollection(access, INVENTORY_COLLECTION, crash.collection)).reserve(item, 1, key),
	).rejects.toThrow(InjectedCrashError);
	const claim = await collectionOf<ReservationKeyDoc>(access, RESERVATION_KEYS_COLLECTION).get(key);
	if (claim?.state !== "claimed") throw new Error("Fixture must retain a real abandoned claim");
	return claim.reservationId;
}

/** The original failure/success schedule and its inverses use actual native storage. */
export function inventoryReserveFinalizationCases(storage: () => StorageAccess): void {
	for (const firstKeyWriter of ["failure-peer", "later-peer"] as const) {
		test(`same abandoned reserve keeps one failed decision when ${firstKeyWriter} completes the key first`, async () => {
			const access = storage();
			const store = make(access);
			const id = await abandoned(access);
			const other = await store.reserve(item, 1, idempotencyKey("other-hold"));
			if (!other.ok) throw new Error("Fixture competing hold must succeed");
			const failureKey = parkCall(access[RESERVATION_KEYS_COLLECTION]!, onId(key, isUpdateWrite));
			const laterKey = parkCall(access[RESERVATION_KEYS_COLLECTION]!, onId(key, isUpdateWrite));
			const failure = make(
				withCollection(access, RESERVATION_KEYS_COLLECTION, failureKey.collection),
			).reserve(item, 1, key);
			await failureKey.arrived;
			await store.release(other.reservationId);
			const later = make(
				withCollection(access, RESERVATION_KEYS_COLLECTION, laterKey.collection),
			).reserve(item, 1, key);
			await laterKey.arrived;
			try {
				if (firstKeyWriter === "failure-peer") {
					failureKey.release();
					await failure;
					laterKey.release();
				} else {
					laterKey.release();
					await later;
					failureKey.release();
				}
			} finally {
				failureKey.release();
				laterKey.release();
			}
			expect(await failure).toEqual({ ok: false, reason: "OUT_OF_STOCK" });
			expect(await later).toEqual(await failure);
			expect(await store.reserve(item, 1, key)).toEqual(await failure);
			expect(await store.getOnHand(item)).toBe(1);
			expect(
				(await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(item))?.holds,
			).toEqual({});
			expect(
				(await collectionOf<ReservationIndexDoc>(access, RESERVATION_INDEX_COLLECTION).get(id))
					?.terminalState,
			).toBe("failed");
			const fresh = await store.reserve(item, 1, idempotencyKey("fresh-command"));
			if (!fresh.ok) throw new Error("A different command must still reserve the returned unit");
			await store.release(fresh.reservationId);
			expect(await store.getOnHand(item)).toBe(1);
		});
	}

	for (const completedKey of [false, true]) {
		test(`a stale zero-stock read cannot fail a peer's successful hold (${completedKey ? "completed" : "paused"} key receipt)`, async () => {
			const access = storage();
			const store = make(access);
			const id = await abandoned(access);
			const other = await store.reserve(item, 1, idempotencyKey("other-hold"));
			if (!other.ok) throw new Error("Fixture competing hold must succeed");
			const raw = access[INVENTORY_COLLECTION]!;
			let arrived!: () => void;
			let release!: () => void;
			let read = false;
			const entered = new Promise<void>((resolve) => {
				arrived = resolve;
			});
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const parkResult = async <T>(result: T): Promise<T> => {
				if (!read) {
					read = true;
					arrived();
					await gate;
				}
				return result;
			};
			// Both legacy pre-check reads and the corrected CAS pin are captured
			// AFTER the real native read. No result is invented or storage write skipped.
			const stale = delegatingCollection(raw, {
				async get(documentId) {
					return parkResult(await raw.get(documentId));
				},
				async getVersioned(documentId) {
					return parkResult(await raw.getVersioned(documentId));
				},
			});
			const staleResult = make(withCollection(access, INVENTORY_COLLECTION, stale)).reserve(
				item,
				1,
				key,
			);
			await entered;
			await store.release(other.reservationId);
			const successKey = parkCall(access[RESERVATION_KEYS_COLLECTION]!, onId(key, isUpdateWrite));
			const peer = (
				completedKey
					? store
					: make(withCollection(access, RESERVATION_KEYS_COLLECTION, successKey.collection))
			).reserve(item, 1, key);
			if (completedKey) await peer;
			else await successKey.arrived;
			try {
				release();
				await staleResult;
			} finally {
				release();
				successKey.release();
			}
			// Drain both writers before any assertion can end this case, including
			// RED runs on D1 whose next case resets the same local storage binding.
			const [staleAnswer, peerAnswer] = await Promise.all([staleResult, peer]);
			expect(staleAnswer).toEqual({ ok: true, reservationId: id });
			expect(peerAnswer).toEqual(staleAnswer);
			expect(await store.reserve(item, 1, key)).toEqual(peerAnswer);
			expect(await store.getOnHand(item)).toBe(0);
			expect(
				(await collectionOf<ReservationIndexDoc>(access, RESERVATION_INDEX_COLLECTION).get(id))
					?.terminalState,
			).toBeUndefined();
			await store.release(id);
			await store.release(id);
			expect(await store.getOnHand(item)).toBe(1);
		});
	}

	for (const interruptEviction of [false, true]) {
		test(`a failed reserve survives ${interruptEviction ? "interrupted " : ""}eviction after its receipt write crashed`, async () => {
			const access = storage();
			const store = make(access);
			await abandoned(access);
			const other = await store.reserve(item, 1, idempotencyKey("other-hold"));
			if (!other.ok) throw new Error("Fixture competing hold must succeed");
			const crash = failCall(access[RESERVATION_KEYS_COLLECTION]!, onId(key, isUpdateWrite), {
				mode: "instead",
			});
			await expect(
				make(withCollection(access, RESERVATION_KEYS_COLLECTION, crash.collection)).reserve(
					item,
					1,
					key,
				),
			).rejects.toThrow(InjectedCrashError);
			await store.release(other.reservationId);
			for (let i = 0; i < APPLIED_MOVEMENT_RING_SIZE - 1; i++) {
				await store.restock(item, 1, idempotencyKey(`later-${i}`));
			}
			const last = idempotencyKey("evict-failure");
			if (interruptEviction) {
				const failedPromotion = failCall(
					access[RESERVATION_KEYS_COLLECTION]!,
					onId(key, isUpdateWrite),
					{ mode: "instead" },
				);
				await expect(
					make(
						withCollection(access, RESERVATION_KEYS_COLLECTION, failedPromotion.collection),
					).restock(item, 1, last),
				).rejects.toThrow(InjectedCrashError);
				expect(await store.getOnHand(item)).toBe(APPLIED_MOVEMENT_RING_SIZE);
			}
			await store.restock(item, 1, last);
			const doc = await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(item);
			expect(doc?.appliedMovements).toHaveLength(APPLIED_MOVEMENT_RING_SIZE);
			expect(doc?.appliedMovements?.some((entry) => entry.key === key)).toBe(false);
			expect(await store.reserve(item, 1, key)).toEqual({ ok: false, reason: "OUT_OF_STOCK" });
			expect(await store.getOnHand(item)).toBe(APPLIED_MOVEMENT_RING_SIZE + 1);
			expect(
				(await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(item))?.holds,
			).toEqual({});
		});
	}

	for (const writer of [
		"removal",
		"absolute",
		"adjust",
		"failed-adjust",
		"failed-reserve",
	] as const) {
		test(`${writer} cannot evict an unfinished failed reserve before its durable promotion`, async () => {
			const access = storage();
			const store = make(access);
			await abandoned(access);
			const other = await store.reserve(item, 1, idempotencyKey("other-hold"));
			if (!other.ok) throw new Error("Fixture competing hold must succeed");
			const crash = failCall(access[RESERVATION_KEYS_COLLECTION]!, onId(key, isUpdateWrite), {
				mode: "instead",
			});
			await expect(
				make(withCollection(access, RESERVATION_KEYS_COLLECTION, crash.collection)).reserve(
					item,
					1,
					key,
				),
			).rejects.toThrow(InjectedCrashError);
			for (let i = 0; i < APPLIED_MOVEMENT_RING_SIZE - 1; i++) {
				await store.restock(item, 1, idempotencyKey(`later-${i}`));
			}
			const nextKey = idempotencyKey("evict-with-next-operation");
			let extraHold: string | undefined;
			if (writer === "failed-reserve") {
				const interrupted = failCall(access[INVENTORY_COLLECTION]!, isUpdateWrite, {
					mode: "instead",
				});
				await expect(
					make(withCollection(access, INVENTORY_COLLECTION, interrupted.collection)).reserve(
						item,
						APPLIED_MOVEMENT_RING_SIZE - 1,
						nextKey,
					),
				).rejects.toThrow(InjectedCrashError);
				const extra = await store.reserve(item, 1, idempotencyKey("extra-hold"));
				if (!extra.ok) throw new Error("Fixture second competing hold must succeed");
				extraHold = extra.reservationId;
			}
			const write = (inventory: EmdashInventoryStore) => {
				switch (writer) {
					case "removal":
						return inventory.removeStock(item, 1, nextKey);
					case "absolute":
						return inventory.setOnHandAbsolute(sku(item), 2, nextKey);
					case "adjust":
						return inventory.adjust(other.reservationId, 2, nextKey);
					case "failed-adjust":
						return inventory.adjust(other.reservationId, APPLIED_MOVEMENT_RING_SIZE + 1, nextKey);
					case "failed-reserve":
						return inventory.reserve(item, APPLIED_MOVEMENT_RING_SIZE - 1, nextKey);
				}
			};
			const before = await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(item);
			const failedPromotion = failCall(
				access[RESERVATION_KEYS_COLLECTION]!,
				onId(key, isUpdateWrite),
				{ mode: "instead" },
			);
			await expect(
				write(
					make(withCollection(access, RESERVATION_KEYS_COLLECTION, failedPromotion.collection)),
				),
			).rejects.toThrow(InjectedCrashError);
			expect(await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(item)).toEqual(
				before,
			);
			const answer = await write(store);
			expect(answer.ok).toBe(writer !== "failed-adjust" && writer !== "failed-reserve");
			const after = await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(item);
			expect(after?.appliedMovements).toHaveLength(APPLIED_MOVEMENT_RING_SIZE);
			expect(after?.appliedMovements?.some((entry) => entry.key === key)).toBe(false);
			expect(await store.reserve(item, 1, key)).toEqual({ ok: false, reason: "OUT_OF_STOCK" });
			await store.release(other.reservationId);
			if (extraHold !== undefined) await store.release(extraHold);
			expect(
				(await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(item))?.holds,
			).toEqual({});
		});
	}

	test("SKU transfer writes and pristine-claim withdrawal preserve a failed reserve witness", async () => {
		const access = storage();
		const store = make(access);
		await abandoned(access);
		const other = await store.reserve(item, 1, idempotencyKey("other-hold"));
		if (!other.ok) throw new Error("Fixture competing hold must succeed");
		const crash = failCall(access[RESERVATION_KEYS_COLLECTION]!, onId(key, isUpdateWrite), {
			mode: "instead",
		});
		await expect(
			make(withCollection(access, RESERVATION_KEYS_COLLECTION, crash.collection)).reserve(
				item,
				1,
				key,
			),
		).rejects.toThrow(InjectedCrashError);
		await store.release(other.reservationId);
		const inventory = collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION);
		const witness = (await inventory.get(item))?.appliedMovements;
		expect(witness).toEqual([expect.objectContaining({ key, kind: "reserve" })]);
		const transferOptions = {
			inventory,
			ledger: collectionOf<SkuRenameLedgerDoc>(access, INVENTORY_MOVEMENTS_COLLECTION),
			clock: new FixedClock(new Date("2026-09-30T00:00:00.000Z")),
		};
		const transfer = new SkuStockTransfer(transferOptions);
		await transfer.prepare(item, "RENAMED", { targetIsOurs: false, occupiedAtClaim: false });
		const interruptedClear = failCall(inventory, nthCall(2, onId(item, isUpdateWrite)), {
			mode: "instead",
		});
		await expect(
			new SkuStockTransfer({ ...transferOptions, inventory: interruptedClear.collection }).move(
				item,
				"RENAMED",
				"transfer-out",
				"rename-out",
			),
		).rejects.toThrow(InjectedCrashError);
		await transfer.completePending(item);
		expect(await store.getOnHand(item)).toBe(0);
		expect(await store.getOnHand("RENAMED")).toBe(1);
		expect((await inventory.get(item))?.appliedMovements).toEqual(witness);
		await transfer.withdrawPristineClaim(item);
		expect((await inventory.get(item))?.appliedMovements).toEqual(witness);
		await transfer.prepare("RENAMED", item, { targetIsOurs: true, occupiedAtClaim: true });
		await transfer.move("RENAMED", item, "transfer-back", "rename-back");
		expect(await store.getOnHand(item)).toBe(1);
		expect(await store.getOnHand("RENAMED")).toBe(0);
		expect((await inventory.get(item))?.appliedMovements).toEqual(witness);
		expect(await store.reserve(item, 1, key)).toEqual({ ok: false, reason: "OUT_OF_STOCK" });
		expect(await store.getOnHand(item)).toBe(1);
	});
}
