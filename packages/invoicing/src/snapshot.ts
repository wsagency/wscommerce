import type { InvoiceSnapshot } from "./types.js";

export const TWO_DECIMAL_CURRENCIES = new Set([
	"EUR",
	"USD",
	"GBP",
	"CHF",
	"CAD",
	"AUD",
	"PLN",
	"CZK",
	"SEK",
	"NOK",
	"DKK",
	"RON",
	"BAM",
]);

const money = (amount: number) => Number.isSafeInteger(amount) && amount >= 0;
const rate = (bps: number) => Number.isSafeInteger(bps) && bps >= 0 && bps <= 10000;

export function validateInvoiceSnapshot(
	snapshot: InvoiceSnapshot,
): { ok: true } | { ok: false; reason: string } {
	if (!TWO_DECIMAL_CURRENCIES.has(snapshot.currency))
		return { ok: false, reason: "UNSUPPORTED_CURRENCY" };
	if (!snapshot.orderId || !snapshot.reference || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date))
		return { ok: false, reason: "INVALID_IDENTITY" };
	if (
		!snapshot.billing.name.trim() ||
		!snapshot.billing.line1.trim() ||
		!snapshot.billing.city.trim() ||
		!/^[A-Z]{2}$/.test(snapshot.billing.country)
	)
		return { ok: false, reason: "INVALID_BILLING" };
	if (snapshot.lines.length === 0 || snapshot.lines.length > 1000)
		return { ok: false, reason: "INVALID_LINES" };
	if (
		!money(snapshot.shipping.net) ||
		!money(snapshot.shipping.tax) ||
		!rate(snapshot.shipping.taxRateBps)
	)
		return { ok: false, reason: "INVALID_SHIPPING" };
	let net = BigInt(snapshot.shipping.net);
	let tax = BigInt(snapshot.shipping.tax);
	for (const line of snapshot.lines) {
		if (
			!Number.isSafeInteger(line.quantity) ||
			line.quantity < 1 ||
			!line.title.trim() ||
			!rate(line.taxRateBps)
		)
			return { ok: false, reason: "INVALID_LINE" };
		if (
			![line.unitNet, line.subtotalNet, line.totalNet, line.totalTax, line.totalGross].every(money)
		)
			return { ok: false, reason: "INVALID_MINOR_UNITS" };
		if (
			BigInt(line.totalNet) + BigInt(line.totalTax) !== BigInt(line.totalGross) ||
			line.totalNet > line.subtotalNet
		)
			return { ok: false, reason: "TOTAL_MISMATCH" };
		net += BigInt(line.totalNet);
		tax += BigInt(line.totalTax);
	}
	if (![snapshot.totalNet, snapshot.totalTax, snapshot.totalGross].every(money))
		return { ok: false, reason: "INVALID_MINOR_UNITS" };
	if (
		net !== BigInt(snapshot.totalNet) ||
		tax !== BigInt(snapshot.totalTax) ||
		net + tax !== BigInt(snapshot.totalGross)
	)
		return { ok: false, reason: "TOTAL_MISMATCH" };
	return { ok: true };
}

/** Deterministic JSON comparison is independent of caller property order. */
export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (typeof value === "object" && value !== null) {
		const row = value as Record<string, unknown>;
		return `{${Object.keys(row)
			.toSorted()
			.map((key) => `${JSON.stringify(key)}:${canonicalJson(row[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}
