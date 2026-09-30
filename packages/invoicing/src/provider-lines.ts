import { cents } from "@otta-sh/domain";
import type { Cents } from "@otta-sh/domain";
import type { InvoiceSnapshot } from "./types.js";

export interface ProviderLine {
	title: string;
	quantity: number;
	unitNet: Cents;
	taxRateBps: number;
}

/** Split a discounted line into at most two integer unit prices; no lost remainder. */
export function providerLines(snapshot: InvoiceSnapshot): ProviderLine[] {
	const lines: ProviderLine[] = [];
	for (const line of snapshot.lines) {
		const quantity = BigInt(line.quantity);
		const quotient = BigInt(line.totalNet) / quantity;
		const remainder = Number(BigInt(line.totalNet) % quantity);
		const group: ProviderLine[] = [];
		if (line.quantity - remainder > 0)
			group.push({
				title: line.title,
				quantity: line.quantity - remainder,
				unitNet: cents(Number(quotient)),
				taxRateBps: line.taxRateBps,
			});
		if (remainder > 0)
			group.push({
				title: line.title,
				quantity: remainder,
				unitNet: cents(Number(quotient + 1n)),
				taxRateBps: line.taxRateBps,
			});
		const taxes = group.reduce(
			(sum, row) =>
				sum +
				(BigInt(row.unitNet) * BigInt(row.quantity) * BigInt(row.taxRateBps) + 5_000n) / 10_000n,
			0n,
		);
		if (taxes !== BigInt(line.totalTax)) throw new Error("PROVIDER_ROUNDING_UNREPRESENTABLE");
		lines.push(...group);
	}
	if (snapshot.shipping.net || snapshot.shipping.tax) {
		const shippingTax =
			(BigInt(snapshot.shipping.net) * BigInt(snapshot.shipping.taxRateBps) + 5_000n) / 10_000n;
		if (shippingTax !== BigInt(snapshot.shipping.tax))
			throw new Error("PROVIDER_ROUNDING_UNREPRESENTABLE");
		lines.push({
			title: snapshot.shipping.title,
			quantity: 1,
			unitNet: snapshot.shipping.net,
			taxRateBps: snapshot.shipping.taxRateBps,
		});
	}
	return lines;
}

export function secureEndpoint(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("INVALID_ENDPOINT");
	}
	if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
		throw new Error("INVALID_ENDPOINT");
	return url.href;
}
