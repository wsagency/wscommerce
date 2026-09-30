import { describe, expect, it } from "vitest";
import { cents, currency } from "@otta-sh/domain";
import type { Order } from "@otta-sh/domain";
import { collectionOf } from "@otta-sh/store-emdash";
import { makeSqliteStorage } from "@otta-sh/store-emdash/testing";
import {
	createWooMapper,
	EmDashWooExternalIdStore,
	WOO_STORAGE_LAYOUT,
	nativeOrderSnapshot,
	formatWooAmount,
	wooOrderStatus,
} from "../src/index.js";
async function exportOrder(order: Order) {
	const db = await makeSqliteStorage(WOO_STORAGE_LAYOUT);
	try {
		const ids = new EmDashWooExternalIdStore(collectionOf(db.storage, "woo_ids"));
		return await createWooMapper(ids, { EUR: 2 }).order(nativeOrderSnapshot(order));
	} finally {
		await db.close();
	}
}
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
	it("preserves a frozen 25-percent rate when one-cent VAT rounds to zero", () => {
		const order = native(
			{
				priceTaxMode: "exclusive",
				lines: [
					{
						taxClassId: "vat25",
						rateBps: 2500,
						netCents: 1,
						grossCents: 1,
						subtotalNetCents: 1,
						taxCents: 0,
						discountedCents: 1,
					},
				],
				shippingNetCents: 1,
				shippingTaxCents: 0,
				shippingRateBps: 2500,
			},
			2,
			2,
		);
		order.lines = [{ ...order.lines[0]!, quantity: 1, unitPrice: cents(1) }];
		order.totals = {
			...order.totals,
			subtotal: cents(1),
			shipping: cents(1),
			tax: cents(0),
			shippingMethodSnapshot: { id: "post", name: "Post" },
		};
		expect(nativeOrderSnapshot(order)).toMatchObject({
			taxLines: [
				{ ratePercent: "25.0000", total: 0 },
				{ ratePercent: "25.0000", shippingTotal: 0 },
			],
			lines: [{ taxes: [{ nativeTaxId: "vat25", total: 0 }] }],
		});
	});
	it("refuses missing frozen line or shipping rates even when rounded tax is zero", () => {
		const proof = {
			priceTaxMode: "exclusive",
			lines: [
				{
					taxClassId: "vat25",
					netCents: 1,
					grossCents: 1,
					subtotalNetCents: 1,
					taxCents: 0,
					discountedCents: 1,
				},
			],
			shippingNetCents: 1,
			shippingTaxCents: 0,
		};
		const order = native(proof, 2, 2);
		order.lines = [{ ...order.lines[0]!, quantity: 1, unitPrice: cents(1) }];
		order.totals = {
			...order.totals,
			subtotal: cents(1),
			shipping: cents(1),
			tax: cents(0),
			shippingMethodSnapshot: { id: "post", name: "Post" },
		};
		expect(() => nativeOrderSnapshot(order)).toThrow(/frozen/i);
		order.totals.taxBreakdown = { ...proof, lines: [{ ...proof.lines[0]!, rateBps: 2500 }] };
		expect(() => nativeOrderSnapshot(order)).toThrow(/frozen/i);
		order.totals.taxBreakdown = null;
		order.totals = { ...order.totals, shipping: cents(0), total: cents(1) };
		expect(() => nativeOrderSnapshot(order)).toThrow(/frozen/i);
	});
	it("projects frozen discounts as net discount plus discount tax for both captured modes", async () => {
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
			expect((await exportOrder(order)).line_items).toMatchObject([
				{ quantity: 2, price: "9.00", total: "18.00", total_tax: "4.50" },
			]);
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
			totals: {
				...native(null, 2000, 2000).totals,
				tax: cents(0),
				taxBreakdown: {
					priceTaxMode: "exclusive",
					lines: [
						{
							taxClassId: "zero",
							rateBps: 0,
							netCents: 2000,
							grossCents: 2000,
							subtotalNetCents: 2000,
							taxCents: 0,
							discountedCents: 2000,
						},
					],
					shippingNetCents: 0,
					shippingTaxCents: 0,
					shippingRateBps: 0,
				},
			},
		} as unknown as Order;
		expect(nativeOrderSnapshot(transfer).paymentMethod).toBe("bacs");
	});
});

describe("mixed catalog tax modes and frozen variation identity", () => {
	it("normalizes mixed order lines to net Woo amounts using each frozen mode", async () => {
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
		expect((await exportOrder(order)).line_items).toMatchObject([
			{ quantity: 1, price: "10.00", total: "10.00", total_tax: "2.50" },
			{ quantity: 1, price: "10.00", total: "10.00", total_tax: "2.50" },
		]);
	});
});

describe("frozen net unit prices and fractional minor-unit remainders", () => {
	it("derives discounted net price from frozen total and preserves accounting totals for a remainder", async () => {
		const order = native(
			{
				priceTaxMode: "exclusive",
				lines: [
					{
						taxClassId: "vat25",
						rateBps: 2500,
						netCents: 100,
						grossCents: 125,
						subtotalNetCents: 150,
						taxCents: 25,
						discountedCents: 100,
					},
				],
				shippingNetCents: 0,
				shippingTaxCents: 0,
				shippingRateBps: 0,
			},
			150,
			125,
		);
		order.lines = [{ ...order.lines[0]!, quantity: 3, unitPrice: cents(50) }];
		order.totals = { ...order.totals, discount: cents(50), tax: cents(25) };
		const exported = await exportOrder(order);
		expect(exported.line_items).toMatchObject([
			{ quantity: 3, price: "0.333333", subtotal: "1.50", total: "1.00", total_tax: "0.25" },
		]);
		expect(exported).toMatchObject({ discount_total: "0.50", discount_tax: "0.13", total: "1.25" });
		expect(nativeOrderSnapshot(order).lines[0]).not.toHaveProperty("unitPrice");
	});
	it("keeps terminating fractions and precision for large quantities without floating amounts", async () => {
		for (const [quantity, unit, total, price] of [
			[2, 75, 101, "0.505"],
			[100000, 1, 1, "0.0000001"],
		] as const) {
			const subtotal = quantity * unit;
			const order = native(
				{
					priceTaxMode: "exclusive",
					lines: [
						{
							taxClassId: "zero",
							rateBps: 0,
							netCents: total,
							grossCents: total,
							subtotalNetCents: subtotal,
							taxCents: 0,
							discountedCents: total,
						},
					],
					shippingNetCents: 0,
					shippingTaxCents: 0,
					shippingRateBps: 0,
				},
				subtotal,
				total,
			);
			order.lines = [{ ...order.lines[0]!, quantity, unitPrice: cents(unit) }];
			order.totals = { ...order.totals, discount: cents(subtotal - total), tax: cents(0) };
			const exported = await exportOrder(order),
				line = (exported.line_items as Array<{ price: string }>)[0]!;
			expect(line.price).toBe(price);
			const [whole, fraction = ""] = line.price.split("."),
				scale = 10n ** BigInt(fraction.length),
				digits = BigInt(whole + fraction);
			expect((digits * BigInt(quantity) * 100n * 2n + scale) / (2n * scale)).toBe(BigInt(total));
		}
	});
});
