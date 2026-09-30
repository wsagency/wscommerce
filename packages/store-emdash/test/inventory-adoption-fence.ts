import {
	cents,
	currency,
	idempotencyKey,
	orderId,
	productId,
	reservationId,
	sku,
} from "@otta-sh/domain";
import { expect, test } from "vitest";
import {
	collectionOf,
	EmdashInventoryStore,
	INVENTORY_COLLECTION,
	uuidIdGen,
	type InventoryDoc,
	type StorageAccess,
} from "../src/index.js";
import { isUpdateWrite, parkCall, withCollection } from "./helpers/fault-injection.js";
import { makeOrderHarness } from "./order-harness.js";

/** Real migrated SQLite/Postgres and local D1 exercise the same late-writer seams. */
export function inventoryAdoptionFenceCases(storage: () => StorageAccess): void {
	for (const operation of ["adopt", "adoptMany"] as const) {
		test(`${operation} retries a stale inventory CAS against the order's cancellation fence`, async () => {
			const access = storage();
			const h = makeOrderHarness(access);
			await h.inventory.seedOnHand("FENCED", 10);
			const hold = await h.inventory.reserve("FENCED", 2, idempotencyKey("fenced-reserve"));
			if (!hold.ok) throw new Error("Fixture reservation failed");
			await h.inventory.stampHoldDeadline(hold.reservationId, "2026-07-10T00:15:00.000Z");
			const parked = parkCall(access[INVENTORY_COLLECTION]!, isUpdateWrite);
			const racing = new EmdashInventoryStore({
				storage: withCollection(access, INVENTORY_COLLECTION, parked.collection),
				clock: h.clock,
				idGen: uuidIdGen,
				sleep: async () => {},
			});
			const input = {
				orderId: "cancelled-order",
				holdExpiresAt: "2026-07-11T00:00:00.000Z",
				now: h.clock.now().toISOString(),
			};
			const pending =
				operation === "adopt"
					? racing.adopt({ ...input, reservationId: hold.reservationId })
					: racing.adoptMany({ ...input, reservationIds: [hold.reservationId] });
			await parked.arrived;
			try {
				await h.inventory.releaseAdopted(hold.reservationId, input.orderId);
			} finally {
				parked.release();
			}
			expect(await pending).toEqual(
				operation === "adopt"
					? { ok: false, reason: "RESERVATION_LOST" }
					: { adopted: [], lost: [hold.reservationId] },
			);
			expect(await h.inventory.getOnHand("FENCED")).toBe(8);
			expect(await h.reservationState(hold.reservationId)).toBe("held");
		});
	}

	for (const method of ["bank_transfer", "cod"] as const) {
		test(`${method} cannot strand adoption after cancelled recovery closed both brackets and the writer crashed`, async () => {
			const access = storage();
			const h = makeOrderHarness(access);
			await h.seedPhysical({
				productId: "p",
				sku: "CRASH-FENCED",
				title: "Frozen widget",
				priceCents: 1000,
				onHand: 10,
			});
			const cartId = await h.cartWith([
				{ productId: "p", sku: "CRASH-FENCED", qty: 2, kind: "physical" },
			]);
			const line = (await h.cartStore.get(cartId))?.lines[0];
			if (line?.reservationId === null || line?.reservationId === undefined)
				throw new Error("Fixture cart must hold its physical line");
			const heldId = line.reservationId;
			const id = orderId(`crash-${method}`);
			await h.store.createFromCart({
				orderId: id,
				cartId,
				currency: currency("USD"),
				idempotencyKey: idempotencyKey("crash-checkout"),
				holdExpiresAt: "2026-07-11T00:00:00.000Z",
				buyerRef: "buyer@example.test",
				paymentMethod: method,
				offlinePayment: {
					method,
					instructions: "LOCAL FIXTURE ONLY",
					paymentReference: id,
					paymentDueAt: "2026-07-11T00:00:00.000Z",
					status: "awaiting",
					acceptedAt: null,
					acceptedBy: null,
					acceptanceKey: null,
					receivedAt: null,
					recordedBy: null,
					receiptRef: null,
					confirmationKey: null,
				},
				lines: [
					{
						productId: productId("p"),
						sku: sku("CRASH-FENCED"),
						title: "Frozen widget",
						unitPrice: cents(1000),
						currency: currency("USD"),
						quantity: 2,
						fulfillmentKind: "physical",
						reservationId: reservationId(heldId),
					},
				],
				totals: { subtotal: cents(2000), total: cents(2000), currency: currency("USD") },
			});

			let arrived!: () => void;
			let resumeWrite!: () => void;
			let wrote!: () => void;
			let resumeResponse!: () => void;
			const entered = new Promise<void>((resolve) => {
				arrived = resolve;
			});
			const writeGate = new Promise<void>((resolve) => {
				resumeWrite = resolve;
			});
			const inventoryFinished = new Promise<void>((resolve) => {
				wrote = resolve;
			});
			const responseGate = new Promise<void>((resolve) => {
				resumeResponse = resolve;
			});
			const original = h.inventory.adoptMany.bind(h.inventory);
			h.inventory.adoptMany = async (input) => {
				arrived();
				await writeGate;
				const result = await original(input);
				wrote();
				// Stop after the real inventory operation, before its response lets
				// the order store clean up. This is the persisted state at process death.
				await responseGate;
				return result;
			};
			const command =
				method === "cod"
					? h.store.acceptCODOrder({
							orderId: id,
							acceptedBy: "staff",
							idempotencyKey: idempotencyKey("crash-accept"),
						})
					: h.store.recordOfflinePayment({
							orderId: id,
							recordedBy: "staff",
							amount: cents(2000),
							currency: currency("USD"),
							receiptRef: "crash-receipt",
							idempotencyKey: idempotencyKey("crash-receive"),
						});
			await entered;
			try {
				await h.store.cancelOrder({
					orderId: id,
					fromState: "pending",
					reason: "out_of_stock",
					detail: null,
					cancelledBy: "staff",
					idempotencyKey: idempotencyKey("crash-cancel"),
					enqueueEmail: false,
				});
				await h.store.completeHoldRelease(id);
				expect(await h.store.completeHoldAdoption(id)).toEqual({ completed: true, lost: [] });
				resumeWrite();
				await inventoryFinished;
				const fresh = makeOrderHarness(access, { share: h.shared });
				expect(await fresh.store.completeHoldAdoption(id)).toEqual({ completed: false, lost: [] });
				expect(await fresh.store.completeHoldRelease(id)).toEqual({ completed: false, lost: [] });
				expect((await fresh.store.getById(id))?.state).toBe("cancelled");
				const doc = await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get(
					"CRASH-FENCED",
				);
				expect(
					Object.values(doc?.holds ?? {}).find((entry) => entry.reservationId === heldId),
				).toMatchObject({ state: "held", orderId: null, qty: 2 });
				expect((await fresh.cartStore.get(cartId))?.state).toBe("active");
				expect(await fresh.store.getCapturedPayments(id)).toEqual([]);
				// The still-cart-owned hold remains eligible for the ordinary cart
				// expiry/removal release, so cancellation cannot lose or duplicate units.
				expect(await fresh.sweepHeldHolds()).toBe(1);
				expect(await fresh.inventory.getOnHand("CRASH-FENCED")).toBe(10);
				expect(await fresh.sweepHeldHolds()).toBe(0);
				expect(await fresh.inventory.getOnHand("CRASH-FENCED")).toBe(10);
			} finally {
				resumeWrite();
				resumeResponse();
				await command;
			}
		});
	}
}
