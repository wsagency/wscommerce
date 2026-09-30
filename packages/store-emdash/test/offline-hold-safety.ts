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
}
