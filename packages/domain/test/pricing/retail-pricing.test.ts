import { cents, computeQuote, computeTotals, currency } from "@otta-sh/domain";
import {
	CountingIdGen,
	FixedClock,
	InMemoryCouponStore,
	InMemoryShippingRulesStore,
	InMemoryTaxRulesStore,
} from "@otta-sh/domain/testing";
import { describe, expect, test } from "vitest";

const EUR = currency("EUR");
const rules = {
	shippingMethod: {
		zoneId: "hr",
		methodId: "flat",
		type: "flat_rate" as const,
		amountCents: cents(100),
		minSubtotalCents: null,
	},
	taxRatesByClass: { standard: 2500 },
	shippingTaxable: true,
	shippingTaxClassId: "standard",
};

describe("explicit retail price tax mode", () => {
	test("inclusive EUR prices extract line VAT after a coupon without adding it twice", () => {
		const b = computeTotals({
			currency: EUR,
			lines: [
				{ unitPriceCents: cents(1250), qty: 2, taxClassId: "standard", priceTaxMode: "inclusive" },
			],
			coupon: { type: "fixed_amount", code: "SAVE", amountCents: cents(250), currency: EUR },
			rules,
		});
		expect(b).toMatchObject({
			subtotalCents: 2500,
			discountCents: 250,
			shippingCents: 100,
			taxCents: 475,
			totalCents: 2375,
			lineBreakdown: [
				{
					rateBps: 2500,
					priceTaxMode: "inclusive",
					subtotalNetCents: 2000,
					discountedCents: 2250,
					netCents: 1800,
					grossCents: 2250,
					taxCents: 450,
				},
			],
			shippingNetCents: 100,
			shippingTaxCents: 25,
			shippingRateBps: 2500,
		});
	});
	test("absent mode preserves exclusive behavior and carries complete frozen proof", () => {
		const b = computeTotals({
			currency: EUR,
			lines: [{ unitPriceCents: cents(1250), qty: 2, taxClassId: "standard" }],
			rules,
		});
		expect(b).toMatchObject({
			totalCents: 3250,
			taxCents: 650,
			priceTaxMode: "exclusive",
			lineBreakdown: [
				{
					rateBps: 2500,
					priceTaxMode: "exclusive",
					subtotalNetCents: 2500,
					netCents: 2500,
					grossCents: 3125,
					taxCents: 625,
				},
			],
		});
	});
	test("rounds inclusive extraction on the whole line and reconciles net plus VAT", () => {
		const b = computeTotals({
			currency: EUR,
			lines: [
				{ unitPriceCents: cents(1), qty: 3, taxClassId: "standard", priceTaxMode: "inclusive" },
			],
			rules: { ...rules, shippingMethod: { ...rules.shippingMethod, amountCents: cents(0) } },
		});
		expect(b).toMatchObject({
			totalCents: 3,
			taxCents: 1,
			lineBreakdown: [{ netCents: 2, grossCents: 3, taxCents: 1 }],
		});
	});
	test("a mixed-mode cart reconciles each line using its own explicit policy", () => {
		const b = computeTotals({
			currency: EUR,
			lines: [
				{ unitPriceCents: cents(1250), qty: 1, taxClassId: "standard", priceTaxMode: "inclusive" },
				{ unitPriceCents: cents(1000), qty: 1, taxClassId: "standard", priceTaxMode: "exclusive" },
			],
			rules: { ...rules, shippingMethod: { ...rules.shippingMethod, amountCents: cents(0) } },
		});
		expect(b).toMatchObject({
			totalCents: 2500,
			taxCents: 500,
			priceTaxMode: "mixed",
			lineBreakdown: [
				{ netCents: 1000, grossCents: 1250 },
				{ netCents: 1000, grossCents: 1250 },
			],
		});
	});
});

async function quoteDeps() {
	const clock = new FixedClock(new Date("2026-09-30T00:00:00.000Z"));
	const shippingRules = new InMemoryShippingRulesStore();
	const taxRules = new InMemoryTaxRulesStore();
	const couponStore = new InMemoryCouponStore({ clock, idGen: new CountingIdGen("coupon") });
	for (const [id, country, rateBps] of [
		["hr", "HR", 2500],
		["de", "DE", 1900],
	] as const) {
		await shippingRules.createZone({ id, name: id, regions: [country] });
		await taxRules.createRate({
			id,
			zoneId: id,
			taxClassId: "standard",
			rateBps,
			appliesToShipping: true,
		});
	}
	return { clock, shippingRules, taxRules, couponStore };
}

test("digital tax resolves billing destination without requiring a shipping method", async () => {
	const result = await computeQuote(await quoteDeps(), {
		currency: EUR,
		lines: [
			{ unitPriceCents: cents(1250), qty: 1, taxClassId: "standard", priceTaxMode: "inclusive" },
		],
		requiresShipping: false,
		taxDestination: { country: "HR" },
	});
	expect(result).toMatchObject({
		ok: true,
		destination: { status: "not_required" },
		taxDestination: { status: "matched", zoneId: "hr" },
		breakdown: { totalCents: 1250, taxCents: 250 },
	});
});

test("billing tax destination is independent of the physical delivery zone", async () => {
	const result = await computeQuote(await quoteDeps(), {
		currency: EUR,
		lines: [{ unitPriceCents: cents(1000), qty: 1, taxClassId: "standard" }],
		requiresShipping: true,
		destination: { country: "DE" },
		taxDestination: { country: "HR" },
	});
	expect(result).toMatchObject({
		ok: true,
		destination: { status: "matched", zoneId: "de" },
		taxDestination: { status: "matched", zoneId: "hr" },
		breakdown: { totalCents: 1250, taxCents: 250 },
	});
});
