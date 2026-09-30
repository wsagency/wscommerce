import { cents, currency, orderId, productId, sku } from "@otta-sh/domain";
import type { Order } from "@otta-sh/domain";
import { describe, expect, it } from "vitest";
import { invoiceSnapshotFromOrder } from "../src/index.js";
import { invoiceFixture } from "./fixtures.js";

function nativeOrder(): Order {
	return {
		id: orderId("order-test-1"),
		cartId: null,
		currency: currency("EUR"),
		state: "paid",
		idempotencyKey: "checkout-1" as Order["idempotencyKey"],
		holdExpiresAt: "2026-09-30T10:15:00Z",
		paymentMethod: "stripe",
		buyerRef: "buyer@example.test",
		customerId: null,
		createdAt: "2026-09-30T10:00:00Z",
		updatedAt: "2026-09-30T10:01:00Z",
		shippingAddress: null,
		reconciliationFlag: null,
		reconciliationResolution: null,
		fulfillment: null,
		cancellation: null,
		lines: [
			{
				id: "line-1",
				orderId: orderId("order-test-1"),
				productId: productId("product-1"),
				sku: sku("BOOK-1"),
				title: "Test book",
				unitPrice: cents(1650),
				currency: currency("EUR"),
				quantity: 1,
				fulfillmentKind: "digital",
				reservationId: null,
			},
		],
		totals: {
			orderId: orderId("order-test-1"),
			currency: currency("EUR"),
			subtotal: cents(1650),
			discount: cents(0),
			shipping: cents(0),
			tax: cents(79),
			total: cents(1650),
			appliedCouponCode: null,
			shippingMethodSnapshot: null,
			taxBreakdown: {
				priceTaxMode: "inclusive",
				lines: [
					{
						taxClassId: "books",
						rateBps: 500,
						discountedCents: 1650,
						netCents: 1571,
						grossCents: 1650,
						subtotalNetCents: 1571,
						taxCents: 79,
					},
				],
				shippingTaxCents: 0,
				shippingNetCents: 0,
				shippingRateBps: 0,
			},
		},
	};
}

describe("native immutable invoice projection", () => {
	it("uses frozen net/gross/tax evidence for inclusive retail order prices", () => {
		expect(invoiceSnapshotFromOrder(nativeOrder(), invoiceFixture().billing, "shop-a")).toEqual(
			invoiceFixture(),
		);
	});
	it("refuses historical nonzero tax with no frozen rate or missing billing", () => {
		const order = nativeOrder();
		order.totals.taxBreakdown = {
			lines: [{ discountedCents: 1571, taxCents: 79 }],
			shippingTaxCents: 0,
		};
		expect(() => invoiceSnapshotFromOrder(order, invoiceFixture().billing, "shop-a")).toThrow(
			"FROZEN_TAX_PROOF_REQUIRED",
		);
		expect(() => invoiceSnapshotFromOrder(nativeOrder(), null, "shop-a")).toThrow(
			"BILLING_REQUIRED",
		);
	});
	it("never invoices an unpaid, refunded, or reconciled order", () => {
		for (const state of ["pending", "refunded", "cancelled"] as const)
			expect(() =>
				invoiceSnapshotFromOrder({ ...nativeOrder(), state }, invoiceFixture().billing, "shop-a"),
			).toThrow("ORDER_NOT_INVOICEABLE");
		expect(() =>
			invoiceSnapshotFromOrder(
				{ ...nativeOrder(), reconciliationFlag: "PAYMENT_MISMATCH" },
				invoiceFixture().billing,
				"shop-a",
			),
		).toThrow("ORDER_RECONCILIATION_REQUIRED");
	});
});
