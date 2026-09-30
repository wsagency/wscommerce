import { describe, expect, it } from "vitest";
import { cents, currency } from "@otta-sh/domain";
import type { Order } from "@otta-sh/domain";
import { nativeOrderSnapshot, formatWooAmount, wooOrderStatus } from "../src/index.js";
function native(breakdown: unknown, subtotal = 2000, total = 2500): Order {
	return {
		id: "native-order",
		state: "paid",
		currency: currency("EUR"),
		createdAt: "2026-09-30T00:00:00Z",
		updatedAt: "2026-09-30T00:00:00Z",
		paymentMethod: "stripe",
		customerId: null,
		buyerRef: "buyer@example.invalid",
		shippingAddress: null,
		totals: {
			currency: currency("EUR"),
			subtotal: cents(subtotal),
			discount: cents(0),
			shipping: cents(0),
			tax: cents(500),
			total: cents(total),
			taxBreakdown: breakdown,
			shippingMethodSnapshot: null,
			appliedCouponCode: null,
		},
		lines: [
			{
				id: "line-native",
				productId: "product-native",
				sku: "BOOK",
				title: "Frozen title",
				quantity: 2,
				unitPrice: cents(subtotal / 2),
				currency: currency("EUR"),
				fulfillmentKind: "physical",
			},
		],
	} as unknown as Order;
}
describe("exact frozen native accounting projection", () => {
	it("projects frozen discounts as net discount plus discount tax for both captured modes", () => {
		for (const mode of ["exclusive", "inclusive"] as const) {
			const order = native(
				{
					priceTaxMode: mode,
					lines: [
						{
							taxClassId: "vat25",
							rateBps: 2500,
							netCents: 1800,
							grossCents: 2250,
							subtotalNetCents: 2000,
							taxCents: 450,
							discountedCents: mode === "inclusive" ? 2250 : 1800,
						},
					],
					shippingNetCents: 0,
					shippingTaxCents: 0,
					shippingRateBps: 0,
				},
				mode === "inclusive" ? 2500 : 2000,
				2250,
			);
			order.totals = {
				...order.totals,
				discount: cents(mode === "inclusive" ? 250 : 200),
				tax: cents(450),
			};
			expect(nativeOrderSnapshot(order)).toMatchObject({
				discountTotal: 200,
				discountTax: 50,
				total: 2250,
				lines: [{ subtotal: 2000, subtotalTax: 500, total: 1800, totalTax: 450 }],
			});
		}
	});
	it("rejects raw native aggregates that disagree with frozen line allocation", () => {
		const proof = {
			priceTaxMode: "exclusive",
			lines: [
				{
					taxClassId: "vat25",
					rateBps: 2500,
					netCents: 2000,
					grossCents: 2500,
					subtotalNetCents: 2000,
					taxCents: 500,
					discountedCents: 2000,
				},
			],
			shippingNetCents: 0,
			shippingTaxCents: 0,
			shippingRateBps: 0,
		};
		const wrongSubtotal = native(proof);
		wrongSubtotal.totals = { ...wrongSubtotal.totals, subtotal: cents(1999) };
		const wrongDiscount = native(proof);
		wrongDiscount.totals = { ...wrongDiscount.totals, discount: cents(1) };
		const wrongLineDiscount = native({
			...proof,
			lines: [{ ...proof.lines[0]!, discountedCents: 1999 }],
		});
		const wrongCurrency = native(proof);
		wrongCurrency.totals = { ...wrongCurrency.totals, currency: currency("USD") };
		for (const order of [wrongSubtotal, wrongDiscount, wrongLineDiscount, wrongCurrency])
			expect(() => nativeOrderSnapshot(order)).toThrow(/frozen/i);
	});
	it("exports exclusive frozen line net amounts and captured rate proof", () => {
		const snapshot = nativeOrderSnapshot(
			native({
				priceTaxMode: "exclusive",
				lines: [
					{
						taxClassId: "vat25",
						rateBps: 2500,
						netCents: 2000,
						grossCents: 2500,
						subtotalNetCents: 2000,
						taxCents: 500,
						discountedCents: 2000,
					},
				],
				shippingNetCents: 0,
				shippingTaxCents: 0,
				shippingRateBps: 0,
			}),
		);
		expect(snapshot).toMatchObject({
			total: 2500,
			cartTax: 500,
			pricesIncludeTax: false,
			lines: [{ subtotal: 2000, total: 2000, totalTax: 500 }],
			taxLines: [{ ratePercent: "25.0000", total: 500 }],
		});
	});
	it("does not add tax twice when native retail prices include VAT", () => {
		const snapshot = nativeOrderSnapshot(
			native(
				{
					priceTaxMode: "inclusive",
					lines: [
						{
							taxClassId: "vat25",
							rateBps: 2500,
							netCents: 2000,
							grossCents: 2500,
							subtotalNetCents: 2000,
							taxCents: 500,
							discountedCents: 2500,
						},
					],
					shippingNetCents: 0,
					shippingTaxCents: 0,
					shippingRateBps: 0,
				},
				2500,
				2500,
			),
		);
		expect(snapshot).toMatchObject({
			total: 2500,
			pricesIncludeTax: true,
			lines: [{ subtotal: 2000, total: 2000, totalTax: 500 }],
		});
	});
	it("refuses a historical taxed order without frozen allocation/rate proof", () => {
		expect(() =>
			nativeOrderSnapshot(
				native({
					lines: [{ taxClassId: "vat25", discountedCents: 2000, taxCents: 500 }],
					shippingTaxCents: 0,
				}),
			),
		).toThrow(/frozen/i);
	});
	it("formats zero/three-digit currencies and large integer amounts exactly", () => {
		expect(formatWooAmount(cents(99), currency("JPY"), { JPY: 0 })).toBe("99");
		expect(formatWooAmount(cents(1001), currency("KWD"), { KWD: 3 })).toBe("1.001");
		expect(formatWooAmount(cents(Number.MAX_SAFE_INTEGER), currency("EUR"), { EUR: 2 })).toBe(
			"90071992547409.91",
		);
		expect(() => formatWooAmount(cents(1), currency("ZZZ"), { EUR: 2 })).toThrow();
	});
	it("preserves native terminal meaning in Woo statuses", () => {
		expect(wooOrderStatus("expired")).toBe("cancelled");
		expect(wooOrderStatus("refunded")).toBe("refunded");
		expect(wooOrderStatus("shipped")).toBe("processing");
	});
});

describe("offline payment semantics in the Woo profile", () => {
	it("projects pending bank transfer/COD as on-hold without asserting payment", () => {
		expect(wooOrderStatus("pending", "bacs")).toBe("on-hold");
		expect(wooOrderStatus("pending", "cod")).toBe("on-hold");
		expect(wooOrderStatus("pending", "stripe")).toBe("pending");
		const transfer = {
			...native(null, 2000, 2000),
			paymentMethod: "bank_transfer",
			state: "pending",
			totals: { ...native(null, 2000, 2000).totals, tax: cents(0) },
		} as unknown as Order;
		expect(nativeOrderSnapshot(transfer).paymentMethod).toBe("bacs");
	});
});

describe("mixed catalog tax modes and frozen variation identity", () => {
	it("normalizes mixed order lines to net Woo amounts using each frozen mode", () => {
		const order = native(
			{
				priceTaxMode: "mixed",
				lines: [
					{
						taxClassId: "vat25",
						priceTaxMode: "inclusive",
						rateBps: 2500,
						netCents: 1000,
						grossCents: 1250,
						subtotalNetCents: 1000,
						taxCents: 250,
						discountedCents: 1250,
					},
					{
						taxClassId: "vat25",
						priceTaxMode: "exclusive",
						rateBps: 2500,
						netCents: 1000,
						grossCents: 1250,
						subtotalNetCents: 1000,
						taxCents: 250,
						discountedCents: 1000,
					},
				],
				shippingNetCents: 0,
				shippingTaxCents: 0,
				shippingRateBps: 0,
			},
			2250,
			2500,
		);
		order.lines = [
			{
				...order.lines[0]!,
				quantity: 1,
				unitPrice: cents(1250),
				variantId: "product:blue",
			} as (typeof order.lines)[number],
			{ ...order.lines[0]!, id: "second-line", quantity: 1, unitPrice: cents(1000) },
		];
		const snapshot = nativeOrderSnapshot(order);
		expect(snapshot.pricesIncludeTax).toBe(false);
		expect(snapshot.lines).toMatchObject([
			{ subtotal: 1000, subtotalTax: 250, total: 1000, totalTax: 250, variationId: "product:blue" },
			{ subtotal: 1000, subtotalTax: 250, total: 1000, totalTax: 250 },
		]);
	});
});
