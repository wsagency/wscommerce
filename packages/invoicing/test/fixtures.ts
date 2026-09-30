import { cents, currency } from "@otta-sh/domain";
import type { InvoiceSnapshot } from "../src/index.js";

export function invoiceFixture(): InvoiceSnapshot {
	return {
		orderId: "order-test-1",
		reference: "shop-a:order-test-1:invoice",
		date: "2026-09-30",
		currency: currency("EUR"),
		billing: {
			name: "Test Buyer",
			company: null,
			taxNumber: null,
			vatId: null,
			email: "buyer@example.test",
			line1: "Test Street 1",
			city: "Zagreb",
			postalCode: "10000",
			country: "HR",
		},
		paymentMethod: "stripe",
		lines: [
			{
				sku: "BOOK-1",
				title: "Test book",
				quantity: 1,
				unitNet: cents(1571),
				subtotalNet: cents(1571),
				totalNet: cents(1571),
				totalTax: cents(79),
				totalGross: cents(1650),
				taxRateBps: 500,
			},
		],
		shipping: { title: "Shipping", net: cents(0), tax: cents(0), taxRateBps: 0 },
		totalNet: cents(1571),
		totalTax: cents(79),
		totalGross: cents(1650),
	};
}
