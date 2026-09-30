import { type Cents, cents, type Currency } from "../money/cents.js";
import type { Clock } from "../ports/clock.js";
import type { CouponRecord, CouponStore } from "../ports/coupon-store.js";
import type { ShippingRulesStore } from "../ports/shipping-rules-store.js";
import type { TaxRulesStore } from "../ports/tax-rules-store.js";
import { computeTotals } from "./compute-totals.js";
import { normalizeCountryCode, normalizeSubdivision } from "./region-codes.js";
import type { Coupon, RulesSnapshot, TotalsBreakdown, TotalsLineInput } from "./types.js";
import { type CouponValidationFailure, validateCoupon } from "./validate-coupon.js";
import { resolveShippingZone, type ZoneDestination, type ZoneResolution } from "./zone-match.js";

export interface QuoteDeps {
	shippingRules: ShippingRulesStore;
	taxRules: TaxRulesStore;
	couponStore: CouponStore;
	clock: Clock;
}

export interface QuoteCommand {
	currency: Currency;
	lines: ReadonlyArray<TotalsLineInput>;
	/**
	 * Whether any line ships. A digital-only cart ignores the delivery
	 * destination and refuses a shipping method; an explicit taxDestination
	 * still resolves its tax jurisdiction (ADR-0027).
	 */
	requiresShipping: boolean;
	/**
	 * Where the order ships. Its delivery zone is DERIVED from it; there is
	 * deliberately no way to pass a zone (ADR-0021 Decision 1). It also supplies
	 * the tax jurisdiction when taxDestination is absent.
	 * Validated here with the same rules as the order's address.
	 */
	destination?: { country: string; region?: string | null };
	/** Billing jurisdiction, independent of delivery, including digital orders.
	 * Absent preserves physical shipping-based tax and historical digital behavior. */
	taxDestination?: { country: string; region?: string | null };
	/** The selected shipping method; absent ⇒ zero shipping (no method chosen). */
	methodId?: string;
	couponCode?: string;
}

export type QuoteFailure =
	| "INVALID_TAX_DESTINATION"
	| "TAX_REGION_CODE_REQUIRED"
	| "TAX_DESTINATION_NOT_MATCHED"
	/** The destination's country is not an ISO 3166-1 alpha-2 code. */
	| "INVALID_SHIPPING_ADDRESS"
	/** The destination's region is not a real subdivision code of its country,
	 *  or is blank where the country has a subdivision-level zone. */
	| "SHIPPING_REGION_CODE_REQUIRED"
	/** Zones exist and the destination matches none of them. */
	| "SHIPPING_ZONE_NOT_MATCHED"
	/** A method was chosen for a physical cart, but there is no destination. */
	| "MISSING_SHIPPING_ADDRESS"
	| "SHIPPING_METHOD_NOT_FOUND"
	/** The method does not belong to the zone the destination matched. */
	| "SHIPPING_METHOD_NOT_IN_ZONE"
	/** A method was chosen for a cart with nothing to ship. */
	| "SHIPPING_METHOD_NOT_APPLICABLE"
	| "SHIPPING_RATE_NOT_FOUND"
	| "COUPON_NOT_FOUND"
	| CouponValidationFailure;

export type QuoteResult =
	| {
			ok: true;
			breakdown: TotalsBreakdown;
			couponRecord: CouponRecord | null;
			/** How the delivery zone was resolved — `matched` names the zone
			 *  that priced shipping. Tax uses taxDestination independently. */
			destination: ZoneResolution;
			taxDestination: ZoneResolution;
	  }
	| { ok: false; reason: QuoteFailure };

/**
 * The read-side checkout preview (Phase 6 §6): load the shipping/tax rules and
 * validate the coupon via the store ports, then hand PURE data to `computeTotals`.
 * This is the single place IO meets the engine — reused by `/checkout/quote`
 * (read-only, no redemption) and by `createOrderFromCart` (which additionally
 * redeems). It never mutates anything.
 *
 * ORDER MATTERS, and the plugin's checkout summary bounds its fallback
 * re-quotes on it (plugin storefront/checkout-routes.ts): destination →
 * zone → method → rate → coupon.
 */
export async function computeQuote(deps: QuoteDeps, command: QuoteCommand): Promise<QuoteResult> {
	const subtotal = sumLineSubtotals(command.lines);

	// 1. The destination, normalised with the SAME rules as the order address.
	//    A digital-only cart's destination is ignored entirely (Decision 5).
	let destination: ZoneDestination | undefined;
	if (command.requiresShipping && command.destination !== undefined) {
		const country = normalizeCountryCode(command.destination.country);
		if (country === null) return { ok: false, reason: "INVALID_SHIPPING_ADDRESS" };
		const region = normalizeSubdivision(country, command.destination.region);
		if (!region.ok) return { ok: false, reason: "SHIPPING_REGION_CODE_REQUIRED" };
		destination = { country, region: region.code };
	}

	// 2. Delivery and tax zones, independently derived from their addresses.
	const zones =
		command.requiresShipping || command.taxDestination !== undefined
			? await deps.shippingRules.listZones()
			: [];
	const resolution = resolveShippingZone(zones, {
		requiresShipping: command.requiresShipping,
		...(destination !== undefined ? { destination } : {}),
	});
	if (resolution.status === "unmatched") return { ok: false, reason: "SHIPPING_ZONE_NOT_MATCHED" };
	if (resolution.status === "region_code_required") {
		return { ok: false, reason: "SHIPPING_REGION_CODE_REQUIRED" };
	}
	const zoneId = resolution.status === "matched" ? resolution.zoneId : null;
	let taxResolution: ZoneResolution = resolution;
	if (command.taxDestination !== undefined) {
		const country = normalizeCountryCode(command.taxDestination.country);
		if (country === null) return { ok: false, reason: "INVALID_TAX_DESTINATION" };
		const region = normalizeSubdivision(country, command.taxDestination.region);
		if (!region.ok) return { ok: false, reason: "TAX_REGION_CODE_REQUIRED" };
		taxResolution = resolveShippingZone(zones, {
			requiresShipping: true,
			destination: { country, region: region.code },
		});
		if (taxResolution.status === "unmatched")
			return { ok: false, reason: "TAX_DESTINATION_NOT_MATCHED" };
		if (taxResolution.status === "region_code_required")
			return { ok: false, reason: "TAX_REGION_CODE_REQUIRED" };
	}
	const taxZoneId = taxResolution.status === "matched" ? taxResolution.zoneId : null;

	// 3–4. The method, which must belong to the matched zone, and its rate;
	//    absent ⇒ the zero-shipping synthetic method (no method chosen — the
	//    pipeline still runs, never the naive Phase-4 stub sum).
	let shippingMethod: RulesSnapshot["shippingMethod"];
	if (command.methodId !== undefined && command.methodId !== "") {
		if (resolution.status === "not_required") {
			return { ok: false, reason: "SHIPPING_METHOD_NOT_APPLICABLE" };
		}
		if (resolution.status === "address_needed") {
			return { ok: false, reason: "MISSING_SHIPPING_ADDRESS" };
		}
		const method = await deps.shippingRules.getMethod(command.methodId);
		if (method === null) return { ok: false, reason: "SHIPPING_METHOD_NOT_FOUND" };
		// With no zones configured an existing method is an ORPHAN: it belongs to
		// no zone an address can match, so it is never priced.
		if (method.zoneId !== zoneId) return { ok: false, reason: "SHIPPING_METHOD_NOT_IN_ZONE" };
		const rate = await deps.shippingRules.getRate(command.methodId, command.currency);
		if (rate === null) return { ok: false, reason: "SHIPPING_RATE_NOT_FOUND" };
		shippingMethod = {
			zoneId: method.zoneId,
			methodId: method.id,
			type: method.type,
			amountCents: rate.amountCents,
			minSubtotalCents: rate.minSubtotalCents,
		};
	} else {
		shippingMethod = {
			zoneId: zoneId ?? "",
			methodId: "",
			type: "flat_rate",
			amountCents: cents(0),
			minSubtotalCents: null,
		};
	}

	// 5. Tax: all rates in the MATCHED zone → the per-class map + the
	//    shipping-tax class. No zone ⇒ no rates (all classes 0 bps).
	const taxRatesByClass: Record<string, number> = {};
	let shippingTaxable = false;
	let shippingTaxClassId = "standard";
	if (taxZoneId !== null) {
		const zoneRates = await deps.taxRules.listRatesForZone(taxZoneId);
		for (const r of zoneRates) {
			taxRatesByClass[r.taxClassId] = r.rateBps;
			if (r.appliesToShipping) {
				shippingTaxable = true;
				shippingTaxClassId = r.taxClassId;
			}
		}
	}

	const rules: RulesSnapshot = {
		shippingMethod,
		taxRatesByClass,
		shippingTaxable,
		shippingTaxClassId,
	};

	// 6. Coupon: load + validate (dates, min-subtotal, currency, soft-exhaustion).
	// Checked LAST — see the ORDER MATTERS note above.
	let couponRecord: CouponRecord | null = null;
	let coupon: Coupon | undefined;
	if (command.couponCode !== undefined && command.couponCode !== "") {
		couponRecord = await deps.couponStore.findByCode(command.couponCode);
		if (couponRecord === null) return { ok: false, reason: "COUPON_NOT_FOUND" };
		const validation = validateCoupon(couponRecord, {
			now: deps.clock.now().toISOString(),
			subtotalCents: subtotal,
			currency: command.currency,
		});
		if (!validation.ok) return { ok: false, reason: validation.reason };
		coupon = validation.coupon;
	}

	const breakdown = computeTotals({
		currency: command.currency,
		lines: command.lines,
		...(coupon !== undefined ? { coupon } : {}),
		rules,
	});
	return {
		ok: true,
		breakdown,
		couponRecord,
		destination: resolution,
		taxDestination: taxResolution,
	};
}

/** Convenience: subtotal of a line set (integer minor units). */
export function sumLineSubtotals(lines: ReadonlyArray<TotalsLineInput>): Cents {
	return cents(lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0));
}
