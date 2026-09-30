import { type Cents, cents } from "../money/cents.js";
import { allocateCents } from "./allocate.js";
import { computeCouponDiscount } from "./coupon.js";
import { resolveShippingRate } from "./shipping.js";
import { computeInclusiveNet, computeLineTax } from "./tax.js";
import type { TotalsBreakdown, TotalsInput, TotalsLineBreakdown } from "./types.js";

/**
 * The Phase-6 totals pipeline (§4) — a pure, deterministic function of its
 * input, in integer minor units throughout. No float, no clock, no store, no
 * randomness: calling it twice on the same input is bit-identical.
 *
 * Ordering (§4):
 *   subtotal → discount (clamped) → pro-rata discounted lines → shipping fee
 *   (free-shipping threshold vs the DISCOUNTED subtotal) → per-line tax on the
 *   discounted line amount → shipping tax (if the zone taxes shipping) → total.
 *
 * Coupon allocation uses each catalog price's stated mode. Inclusive line VAT
 * is extracted rather than added. The invoice identity is always
 * `sum(line.netCents) + shippingNetCents + taxCents === totalCents`.
 */
export function computeTotals(input: TotalsInput): TotalsBreakdown {
	const { currency, lines, coupon, rules } = input;

	// 1–2. Per-line subtotal (snapshot unit price × qty) and cart subtotal.
	const lineSubtotals: number[] = lines.map((l) => {
		if (!Number.isSafeInteger(l.qty) || l.qty <= 0) {
			throw new RangeError(`computeTotals requires a positive integer qty, got ${String(l.qty)}`);
		}
		return l.unitPriceCents * l.qty;
	});
	const subtotal = cents(lineSubtotals.reduce((a, b) => a + b, 0));

	// 3. Discount, clamped to [0, subtotal] by computeCouponDiscount.
	const discount =
		coupon === undefined ? cents(0) : computeCouponDiscount(subtotal, currency, coupon);
	const discountedTotal = cents(subtotal - discount);

	// 4. Pro-rata: allocate the discounted subtotal across lines by their weight,
	//    so per-class tax is computed on the base the discount actually reduces.
	const discountedLines = allocateCents(discountedTotal, lineSubtotals);

	// 5. Shipping fee — free-shipping threshold checked against the discounted subtotal.
	const shipping = resolveShippingRate(rules.shippingMethod, discountedTotal);

	// 6. Per-line tax on the discounted line amount, each rounded independently.
	let perLineTax = 0;
	const lineBreakdown: TotalsLineBreakdown[] = lines.map((l, i) => {
		const rateBps = rules.taxRatesByClass[l.taxClassId] ?? 0;
		const discountedCents = discountedLines[i] as Cents;
		const priceTaxMode = l.priceTaxMode ?? "exclusive";
		if (priceTaxMode !== "exclusive" && priceTaxMode !== "inclusive") {
			throw new RangeError("invalid priceTaxMode");
		}
		const inclusive = priceTaxMode === "inclusive";
		const netCents = inclusive ? computeInclusiveNet(discountedCents, rateBps) : discountedCents;
		const taxCents = inclusive
			? cents(discountedCents - netCents)
			: computeLineTax(netCents, rateBps);
		const grossCents = cents(netCents + taxCents);
		const subtotalCents = cents(lineSubtotals[i]!);
		const subtotalNetCents = inclusive
			? computeInclusiveNet(subtotalCents, rateBps)
			: subtotalCents;
		perLineTax += taxCents;
		return {
			taxClassId: l.taxClassId,
			priceTaxMode,
			rateBps,
			subtotalNetCents,
			discountedCents,
			netCents,
			grossCents,
			taxCents,
		};
	});

	// 7. Shipping tax (§ case 5).
	const shippingRateBps = rules.shippingTaxable
		? (rules.taxRatesByClass[rules.shippingTaxClassId] ?? 0)
		: 0;
	const shippingTax = computeLineTax(shipping, shippingRateBps);

	// 8. Tax total, 9. grand total.
	const tax = cents(perLineTax + shippingTax);
	const total = cents(
		lineBreakdown.reduce((sum, line) => sum + line.grossCents, 0) + shipping + shippingTax,
	);
	const modes = new Set(lineBreakdown.map((line) => line.priceTaxMode));

	const breakdown: TotalsBreakdown = {
		currency,
		subtotalCents: subtotal,
		discountCents: discount,
		shippingCents: shipping,
		taxCents: tax,
		totalCents: total,
		lineBreakdown,
		shippingTaxCents: shippingTax,
		shippingNetCents: shipping,
		shippingRateBps,
		priceTaxMode: modes.size > 1 ? "mixed" : (lineBreakdown[0]?.priceTaxMode ?? "exclusive"),
	};
	if (coupon !== undefined && discount > 0) {
		breakdown.appliedCouponCode = coupon.code;
	}
	return breakdown;
}
