import { cents } from "@otta-sh/domain";
import type { Cents, OrderAddress } from "@otta-sh/domain";
import type {
	NativeOrder,
	NativeSnapshotOptions,
	WooOrderSnapshot,
	WooAddress,
	WooLineSnapshot,
	WooTaxSnapshot,
} from "./types.js";
import { WooMutationError } from "./errors.js";
function projectionError(): never {
	throw new WooMutationError(
		"woocommerce_rest_invalid_snapshot",
		"The native order lacks exact frozen tax/discount allocation proof.",
		503,
	);
}
function minor(value: unknown): Cents {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) projectionError();
	return cents(value);
}
function integer(value: bigint): Cents {
	if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n) projectionError();
	return cents(Number(value));
}
function object(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}
export function nativeWooAddress(address: OrderAddress | null): WooAddress | null {
	if (!address) return null;
	const extended = address as OrderAddress & {
		company?: string | null;
		taxNumber?: string | null;
		vatId?: string | null;
	};
	const names = address.name.trim().split(/\s+/),
		first = names.shift() ?? "";
	return {
		first_name: first,
		last_name: names.join(" "),
		company: extended.company ?? "",
		address_1: address.line1,
		address_2: address.line2 ?? "",
		city: address.city,
		state: address.region ?? "",
		postcode: address.postalCode,
		country: address.country,
		email: address.email ?? "",
		phone: address.phone ?? "",
	};
}
/** Uses only frozen order data; every line needs captured rate proof, including rounded-zero VAT. */
export function nativeOrderSnapshot(
	order: NativeOrder,
	options: NativeSnapshotOptions = {},
): WooOrderSnapshot {
	if (order.totals.currency !== order.currency) projectionError();
	const breakdown = object(order.totals.taxBreakdown),
		frozenLines = Array.isArray(breakdown?.lines) ? breakdown.lines : [];
	const mode = breakdown?.priceTaxMode;
	if (mode !== "exclusive" && mode !== "inclusive" && mode !== "mixed") projectionError();
	if (frozenLines.length !== order.lines.length) projectionError();
	const taxes = new Map<string, WooTaxSnapshot>();
	let nativeSubtotal = 0n;
	let nativeDiscount = 0n;
	const lines: WooLineSnapshot[] = order.lines.map((line, index) => {
		if (
			line.currency !== order.currency ||
			!Number.isSafeInteger(line.quantity) ||
			line.quantity < 1
		)
			projectionError();
		const rawSubtotal = integer(BigInt(line.unitPrice) * BigInt(line.quantity)),
			proof = object(frozenLines[index]);
		if (
			!proof ||
			typeof proof.taxClassId !== "string" ||
			!proof.taxClassId ||
			!Number.isSafeInteger(proof.rateBps) ||
			Number(proof.rateBps) < 0
		)
			projectionError();
		const subtotal = minor(proof.subtotalNetCents),
			total = minor(proof.netCents),
			totalTax = minor(proof.taxCents),
			rate = Number(proof.rateBps);
		const lineMode = proof.priceTaxMode ?? mode;
		if (lineMode !== "exclusive" && lineMode !== "inclusive") projectionError();
		if (mode !== "mixed" && mode !== lineMode) projectionError();
		const subtotalTax =
			lineMode === "inclusive"
				? integer(BigInt(rawSubtotal) - BigInt(subtotal))
				: integer((BigInt(subtotal) * BigInt(rate) + 5000n) / 10000n);
		if (
			total > subtotal ||
			(lineMode === "exclusive" && subtotal !== rawSubtotal) ||
			minor(proof.grossCents) !== total + totalTax
		)
			projectionError();
		const discountedNative =
			lineMode === "inclusive" ? integer(BigInt(total) + BigInt(totalTax)) : total;
		if (discountedNative > rawSubtotal || minor(proof.discountedCents) !== discountedNative)
			projectionError();
		nativeSubtotal += BigInt(rawSubtotal);
		nativeDiscount += BigInt(rawSubtotal) - BigInt(discountedNative);
		const taxId = proof.taxClassId;
		{
			const current = taxes.get(taxId);
			if (
				current &&
				current.ratePercent !== `${Math.floor(rate / 100)}.${String(rate % 100).padStart(2, "0")}00`
			)
				projectionError();
			taxes.set(taxId, {
				nativeId: taxId,
				code: taxId,
				label: taxId,
				compound: false,
				total: integer(BigInt(current?.total ?? 0) + BigInt(totalTax)),
				shippingTotal: cents(0),
				ratePercent: `${Math.floor(rate / 100)}.${String(rate % 100).padStart(2, "0")}00`,
			});
		}
		return {
			nativeId: line.id,
			productId: line.productId,
			variationId: (line as typeof line & { variantId?: string | null }).variantId ?? undefined,
			name: line.title,
			sku: line.sku,
			quantity: line.quantity,
			subtotal,
			total,
			subtotalTax,
			totalTax,
			unitPrice: line.unitPrice,
			taxes: [{ nativeTaxId: taxId, total: totalTax, subtotal: subtotalTax }],
		};
	});
	const shippingTax =
		breakdown?.shippingTaxCents === undefined
			? order.totals.shipping > 0
				? projectionError()
				: cents(0)
			: minor(breakdown.shippingTaxCents);
	const shippingTotal =
		breakdown?.shippingNetCents === undefined
			? order.totals.shipping > 0
				? projectionError()
				: order.totals.shipping
			: minor(breakdown.shippingNetCents);
	const cartTax = integer(lines.reduce((total, line) => total + BigInt(line.totalTax), 0n));
	const discountTotal = integer(
		lines.reduce((total, line) => total + BigInt(line.subtotal) - BigInt(line.total), 0n),
	);
	const discountTax = integer(
		lines.reduce((total, line) => total + BigInt(line.subtotalTax) - BigInt(line.totalTax), 0n),
	);
	if (
		integer(nativeSubtotal) !== order.totals.subtotal ||
		integer(nativeDiscount) !== order.totals.discount ||
		shippingTotal !== order.totals.shipping ||
		cartTax + shippingTax !== order.totals.tax ||
		integer(
			lines.reduce((total, line) => total + BigInt(line.total), 0n) +
				BigInt(shippingTotal) +
				BigInt(order.totals.tax),
		) !== order.totals.total
	)
		projectionError();
	const method = object(order.totals.shippingMethodSnapshot);
	const shippingId = `${order.id}:shipping`;
	if ((shippingTotal > 0 || shippingTax > 0) && !method) projectionError();
	let shippingTaxId: string | undefined;
	if (shippingTotal > 0 || shippingTax > 0) {
		if (!Number.isSafeInteger(breakdown?.shippingRateBps) || Number(breakdown?.shippingRateBps) < 0)
			projectionError();
		const rate = Number(breakdown?.shippingRateBps);
		shippingTaxId = `shipping:${rate}`;
		taxes.set(shippingTaxId, {
			nativeId: shippingTaxId,
			code: shippingTaxId,
			label: shippingTaxId,
			compound: false,
			total: cents(0),
			shippingTotal: shippingTax,
			ratePercent: `${Math.floor(rate / 100)}.${String(rate % 100).padStart(2, "0")}00`,
		});
	}
	const nativeMethod = order.paymentMethod as string | null;
	const paymentMethod = nativeMethod === "bank_transfer" ? "bacs" : (nativeMethod ?? "");
	const billingNative =
		(order as NativeOrder & { billingAddress?: OrderAddress | null }).billingAddress ?? null;
	const billing = options.billing === undefined ? nativeWooAddress(billingNative) : options.billing;
	return {
		nativeId: order.id,
		number: order.id,
		state: order.state,
		currency: order.currency,
		createdAt: order.createdAt,
		updatedAt: order.updatedAt,
		paidAt: options.paidAt ?? null,
		completedAt: options.completedAt ?? null,
		customerId: order.customerId,
		billing,
		shipping: nativeWooAddress(order.shippingAddress),
		paymentMethod,
		paymentMethodTitle: options.paymentMethodTitle ?? nativeMethod ?? "",
		transactionId: options.transactionId ?? "",
		customerNote: "",
		pricesIncludeTax: mode === "inclusive",
		discountTotal,
		discountTax,
		shippingTotal,
		shippingTax,
		cartTax,
		total: order.totals.total,
		totalTax: order.totals.tax,
		lines,
		shippingLines: method
			? [
					{
						nativeId: shippingId,
						methodId:
							typeof method.id === "string"
								? method.id
								: typeof method.methodId === "string"
									? method.methodId
									: "",
						title:
							typeof method.name === "string"
								? method.name
								: typeof method.label === "string"
									? method.label
									: "",
						total: shippingTotal,
						totalTax: shippingTax,
						taxes: shippingTaxId
							? [{ nativeTaxId: shippingTaxId, total: shippingTax, subtotal: shippingTax }]
							: [],
					},
				]
			: [],
		taxLines: [...taxes.values()],
		refunds: options.refunds ?? [],
		metadata: options.metadata ?? [],
	};
}
