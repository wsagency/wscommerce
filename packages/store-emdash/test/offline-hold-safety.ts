import {
	cents,
	currency,
	idempotencyKey,
	orderId,
	productId,
	reservationId,
	sku,
	type OfflinePayment,
} from "@otta-sh/domain";
import { expect, test } from "vitest";
import type { OrderHarness } from "./order-harness.js";

/** The same frozen-quantity regressions run on migrated SQLite and local D1. */
export function offlineHoldSafetyCases(makeHarness: () => OrderHarness): void {
	for (const method of ["bank_transfer", "cod"] as const) {
		for (const quantity of [1, 2, 3]) {
			test(`${method} settles only the frozen quantity after interrupted checkout (cart hold ${quantity})`, async () => {
				const h = makeHarness();
				const stockSku = sku(`OFFLINE-${method}-${quantity}`);
				await h.inventory.seedOnHand(stockSku, 10);
				const hold = await h.inventory.reserve(
					stockSku,
					2,
					idempotencyKey(`reserve-${method}-${quantity}`),
				);
				expect(hold.ok).toBe(true);
				if (!hold.ok) throw new Error("Fixture reservation failed");
				await h.inventory.stampHoldDeadline(hold.reservationId, "2026-07-10T00:15:00.000Z");
				const id = orderId(`offline-${method}-${quantity}`);
				const payment: OfflinePayment = {
					method,
					instructions: "LOCAL TEST ONLY",
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
				};
				await h.store.createFromCart({
					orderId: id,
					cartId: "cart",
					currency: currency("USD"),
					idempotencyKey: idempotencyKey(`checkout-${method}-${quantity}`),
					holdExpiresAt: payment.paymentDueAt,
					buyerRef: "buyer@example.test",
					paymentMethod: method,
					offlinePayment: payment,
					lines: [
						{
							productId: productId("p"),
							sku: stockSku,
							title: "Frozen widget",
							unitPrice: cents(1000),
							currency: currency("USD"),
							quantity: 2,
							fulfillmentKind: "physical",
							reservationId: reservationId(hold.reservationId),
						},
					],
					totals: { subtotal: cents(2000), total: cents(2000), currency: currency("USD") },
				});
				// Persisted pending order; adoption never ran before this cart edit.
				if (quantity !== 2) {
					await h.inventory.adjust(
						hold.reservationId,
						quantity,
						idempotencyKey(`adjust-${method}-${quantity}`),
					);
					expect(await h.store.completeHoldAdoption(id)).toEqual({
						completed: true,
						lost: [hold.reservationId],
					});
				}
				const result =
					method === "cod"
						? await h.store.acceptCODOrder({
								orderId: id,
								acceptedBy: "staff",
								idempotencyKey: idempotencyKey(`accept-${quantity}`),
							})
						: await h.store.recordOfflinePayment({
								orderId: id,
								recordedBy: "staff",
								amount: cents(2000),
								currency: currency("USD"),
								receiptRef: `receipt-${quantity}`,
								idempotencyKey: idempotencyKey(`receive-${quantity}`),
							});
				if (quantity === 2) {
					expect(result.outcome).toBe("applied");
					expect(await h.store.completeHoldCommit(id)).toEqual({ completed: true, lost: [] });
					expect((await h.store.getById(id))?.state).toBe(method === "cod" ? "processing" : "paid");
					expect(await h.inventory.getOnHand(stockSku)).toBe(8);
					expect(await h.store.getCapturedPayments(id)).toHaveLength(method === "cod" ? 0 : 1);
				} else {
					expect(result.outcome).toBe("not_payable");
					expect(await h.store.completeHoldCommit(id)).toEqual({ completed: false, lost: [] });
					expect((await h.store.getById(id))?.state).toBe("pending");
					expect(await h.inventory.getOnHand(stockSku)).toBe(10 - quantity);
					expect(await h.store.getCapturedPayments(id)).toEqual([]);
				}
			});
		}
	}
	for (const action of ["bank_transfer", "cod", "recovery"] as const) {
		const method = action === "bank_transfer" ? "bank_transfer" : "cod";
		for (const partialFailure of [false, true]) {
			test(`${action} fences late adoption when cancellation won (${partialFailure ? "partial failure" : "success"})`, async () => {
				const h = makeHarness();
				const stockSku = sku(`LATE-${method}-${partialFailure}`);
				await h.inventory.seedOnHand(stockSku, 10);
				const hold = await h.inventory.reserve(
					stockSku,
					2,
					idempotencyKey(`late-reserve-${method}-${partialFailure}`),
				);
				if (!hold.ok) throw new Error("Fixture reservation failed");
				await h.inventory.stampHoldDeadline(hold.reservationId, "2026-07-10T00:15:00.000Z");
				const id = orderId(`late-${method}-${partialFailure}`);
				const secondSku = sku(`${stockSku}-SECOND`);
				await h.inventory.seedOnHand(secondSku, 10);
				const second = await h.inventory.reserve(
					secondSku,
					1,
					idempotencyKey(`late-second-${method}-${partialFailure}`),
				);
				if (!second.ok) throw new Error("Second fixture reservation failed");
				await h.inventory.stampHoldDeadline(second.reservationId, "2026-07-10T00:15:00.000Z");
				await h.store.createFromCart({
					orderId: id,
					cartId: "cart",
					currency: currency("USD"),
					idempotencyKey: idempotencyKey(`late-checkout-${method}-${partialFailure}`),
					holdExpiresAt: "2026-07-11T00:00:00.000Z",
					buyerRef: "buyer@example.test",
					paymentMethod: method,
					offlinePayment: {
						method,
						instructions: "LOCAL TEST ONLY",
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
							sku: stockSku,
							title: "Frozen widget",
							unitPrice: cents(1000),
							currency: currency("USD"),
							quantity: 2,
							fulfillmentKind: "physical",
							reservationId: reservationId(hold.reservationId),
						},
						{
							productId: productId("p2"),
							sku: secondSku,
							title: "Second widget",
							unitPrice: cents(1000),
							currency: currency("USD"),
							quantity: 1,
							fulfillmentKind: "physical",
							reservationId: reservationId(second.reservationId),
						},
					],
					totals: { subtotal: cents(3000), total: cents(3000), currency: currency("USD") },
				});
				let arrived!: () => void;
				let resume!: () => void;
				const entered = new Promise<void>((resolve) => {
					arrived = resolve;
				});
				const released = new Promise<void>((resolve) => {
					resume = resolve;
				});
				const original = h.inventory.adoptMany.bind(h.inventory);
				h.inventory.adoptMany = async (input) => {
					arrived();
					await released;
					const result = await original(
						partialFailure
							? {
									...input,
									reservationIds: [hold.reservationId],
									expectedReservations: input.expectedReservations?.filter(
										(entry) => entry.reservationId === hold.reservationId,
									),
								}
							: input,
					);
					if (partialFailure) throw new Error("INJECTED_PARTIAL_ADOPTION");
					return result;
				};
				const command =
					action === "recovery"
						? h.store.completeHoldAdoption(id)
						: method === "cod"
							? h.store.acceptCODOrder({
									orderId: id,
									acceptedBy: "staff",
									idempotencyKey: idempotencyKey("late-accept"),
								})
							: h.store.recordOfflinePayment({
									orderId: id,
									recordedBy: "staff",
									amount: cents(3000),
									currency: currency("USD"),
									receiptRef: "late-receipt",
									idempotencyKey: idempotencyKey("late-receive"),
								});
				const settled = command.then(
					(result) => ({ result, error: null }),
					(error: unknown) => ({ result: null, error }),
				);
				await entered;
				try {
					await h.store.cancelOrder({
						orderId: id,
						fromState: "pending",
						reason: "out_of_stock",
						detail: null,
						cancelledBy: "staff",
						idempotencyKey: idempotencyKey("late-cancel"),
						enqueueEmail: false,
					});
					await h.store.completeHoldRelease(id);
				} finally {
					resume();
				}
				const outcome = await settled;
				if (partialFailure)
					expect(outcome.error).toMatchObject({ message: "INJECTED_PARTIAL_ADOPTION" });
				else
					expect(outcome.result).toMatchObject(
						action === "recovery"
							? { completed: true, lost: [hold.reservationId, second.reservationId] }
							: { outcome: "not_payable", order: { state: "cancelled" } },
					);
				expect((await h.store.getById(id))?.state).toBe("cancelled");
				// Cancellation blocks the stale adoption CAS. Both reservations still
				// belong to the cart and keep their original quantity and deadline.
				expect(await h.inventory.getOnHand(stockSku)).toBe(8);
				expect(await h.inventory.getOnHand(secondSku)).toBe(9);
				expect(await h.store.getCapturedPayments(id)).toEqual([]);
			});
		}
	}
}
