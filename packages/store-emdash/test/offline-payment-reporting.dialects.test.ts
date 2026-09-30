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
import { describeEachDialect } from "./describe-each-dialect.js";
import { makeOrderHarness } from "./order-harness.js";
import { makeReportingHarness } from "./reporting-harness.js";
import { REPORTING_LAYOUT } from "./reporting-collections.js";

const range = { from: "2026-07-10T00:00:00.000Z", to: "2026-07-10T23:59:59.999Z" };
describeEachDialect("offline receipt reporting", (ctx) => {
	const bound = ctx.useStorage(REPORTING_LAYOUT);
	test("unpaid COD fulfillment counts orders but no revenue; receipt counts once before and after recompute", async () => {
		const reporting = makeReportingHarness(bound.storage);
		const h = makeOrderHarness(bound.storage, { reporting: reporting.store });
		await h.store.createFromCart({
			orderId: orderId("cod"),
			cartId: "cart",
			currency: currency("USD"),
			idempotencyKey: idempotencyKey("cod"),
			holdExpiresAt: "2026-07-17T00:00:00.000Z",
			buyerRef: "buyer@example.test",
			paymentMethod: "cod",
			lines: [
				{
					productId: productId("p"),
					sku: sku("SKU"),
					title: "Widget",
					unitPrice: cents(1500),
					currency: currency("USD"),
					quantity: 1,
					fulfillmentKind: "physical",
					reservationId: reservationId("res"),
				},
			],
			totals: { subtotal: cents(1500), total: cents(1500), currency: currency("USD") },
			offlinePayment: {
				method: "cod",
				instructions: "Pay on delivery",
				paymentReference: "cod",
				paymentDueAt: "2026-07-17T00:00:00.000Z",
				status: "awaiting",
				acceptedAt: null,
				acceptedBy: null,
				acceptanceKey: null,
				receivedAt: null,
				recordedBy: null,
				receiptRef: null,
				confirmationKey: null,
			},
		});
		await h.store.acceptCODOrder({
			orderId: orderId("cod"),
			acceptedBy: "staff",
			idempotencyKey: idempotencyKey("accept"),
		});
		expect(await reporting.store.revenueByPeriod(range, "day")).toEqual([]);
		expect(await reporting.store.ordersByStatus(range)).toContainEqual({
			status: "processing",
			orderCount: 1,
		});
		await reporting.store.reconcile(range);
		expect(await reporting.store.revenueByPeriod(range, "day")).toEqual([]);
		await h.store.transition({
			orderId: orderId("cod"),
			fromState: "processing",
			toState: "shipped",
			enqueueEmail: false,
			idempotencyKey: idempotencyKey("ship"),
		});
		expect(await reporting.store.topProducts(range, "revenue", 10)).toEqual([]);
		const receipt = {
			orderId: orderId("cod"),
			receiptRef: "delivery-1",
			amount: cents(1500),
			currency: currency("USD"),
			recordedBy: "staff",
			idempotencyKey: idempotencyKey("receive"),
		};
		await h.store.recordOfflinePayment(receipt);
		await h.store.recordOfflinePayment(receipt);
		expect(await reporting.store.revenueByPeriod(range, "day")).toMatchObject([
			{ revenueCents: 1500 },
		]);
		await reporting.store.reconcile(range);
		expect(await reporting.store.revenueByPeriod(range, "day")).toMatchObject([
			{ revenueCents: 1500 },
		]);
		expect(await reporting.store.topProducts(range, "revenue", 10)).toMatchObject([
			{ revenueCents: 1500 },
		]);
	});
});
