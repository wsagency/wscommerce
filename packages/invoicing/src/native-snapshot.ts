import { cents } from "@otta-sh/domain";
import type { Order } from "@otta-sh/domain";
import { validateInvoiceSnapshot } from "./snapshot.js";
import type { InvoiceSnapshot } from "./types.js";

interface FrozenTaxLine {
	rateBps?: number;
	discountedCents: number;
	taxCents: number;
	netCents?: number;
	grossCents?: number;
	subtotalNetCents?: number;
}
interface FrozenTax {
	priceTaxMode?: "inclusive" | "exclusive";
	lines?: FrozenTaxLine[];
	shippingTaxCents?: number;
	shippingNetCents?: number;
	shippingRateBps?: number;
}

export function invoiceSnapshotFromOrder(
	order: Order,
	billing: InvoiceSnapshot["billing"] | null,
	shopId: string,
): InvoiceSnapshot {
	if (!["paid", "processing", "shipped", "delivered", "completed"].includes(order.state))
		throw new Error("ORDER_NOT_INVOICEABLE");
	if (order.reconciliationFlag) throw new Error("ORDER_RECONCILIATION_REQUIRED");
	if (!billing) throw new Error("BILLING_REQUIRED");
	if (!/^[a-zA-Z0-9_-]{1,64}$/.test(shopId)) throw new Error("INVALID_SHOP_ID");
	if (!order.paymentMethod) throw new Error("PAYMENT_METHOD_REQUIRED");
	const proof = (order.totals.taxBreakdown ?? {}) as FrozenTax;
	if (!proof.lines || proof.lines.length !== order.lines.length)
		throw new Error("FROZEN_TAX_PROOF_REQUIRED");
	const lines = order.lines.map((line, index) => {
		const tax = proof.lines![index]!;
		if (
			!Number.isSafeInteger(tax.taxCents) ||
			!Number.isSafeInteger(tax.discountedCents) ||
			(tax.taxCents !== 0 && tax.rateBps === undefined)
		)
			throw new Error("FROZEN_TAX_PROOF_REQUIRED");
		const net =
			tax.netCents ??
			(proof.priceTaxMode === "inclusive"
				? tax.discountedCents - tax.taxCents
				: tax.discountedCents);
		const gross = tax.grossCents ?? net + tax.taxCents;
		const subtotalNet =
			tax.subtotalNetCents ??
			(proof.priceTaxMode === "inclusive" ? undefined : line.unitPrice * line.quantity);
		if (subtotalNet === undefined) throw new Error("FROZEN_TAX_PROOF_REQUIRED");
		return {
			sku: line.sku,
			title: line.title,
			quantity: line.quantity,
			unitNet: cents(Math.floor(subtotalNet / line.quantity)),
			subtotalNet: cents(subtotalNet),
			totalNet: cents(net),
			totalTax: cents(tax.taxCents),
			totalGross: cents(gross),
			taxRateBps: tax.rateBps ?? 0,
		};
	});
	const shippingTax = proof.shippingTaxCents ?? 0;
	if (shippingTax !== 0 && proof.shippingRateBps === undefined)
		throw new Error("FROZEN_TAX_PROOF_REQUIRED");
	const shipping = {
		title: "Shipping",
		net: cents(proof.shippingNetCents ?? order.totals.shipping),
		tax: cents(shippingTax),
		taxRateBps: proof.shippingRateBps ?? 0,
	};
	const snapshot: InvoiceSnapshot = {
		orderId: order.id,
		reference: `${shopId}:${order.id}:invoice`,
		date: order.createdAt.slice(0, 10),
		currency: order.currency,
		billing: structuredClone(billing),
		paymentMethod: order.paymentMethod,
		lines,
		shipping,
		totalNet: cents(order.totals.total - order.totals.tax),
		totalTax: order.totals.tax,
		totalGross: order.totals.total,
	};
	const validation = validateInvoiceSnapshot(snapshot);
	if (!validation.ok) throw new Error(validation.reason);
	return snapshot;
}
