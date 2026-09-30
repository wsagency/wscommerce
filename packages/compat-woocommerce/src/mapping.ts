import { cents, type Cents, type Currency, type OrderState } from "@otta-sh/domain";
import type {
	WooCustomerSnapshot,
	WooExternalIdStore,
	WooOrderSnapshot,
	WooProductSnapshot,
	WooRefundSnapshot,
	WooNoteSnapshot,
	WooOrderStatus,
	WooAddress,
	WooTaxAmount,
} from "./types.js";
import { WooMutationError } from "./errors.js";

export function formatWooAmount(
	amount: Cents,
	code: Currency,
	decimals: Readonly<Record<string, number>>,
): string {
	const precision = Object.hasOwn(decimals, code) ? decimals[code] : undefined;
	if (
		!Number.isSafeInteger(amount) ||
		amount < 0 ||
		precision === undefined ||
		!Number.isSafeInteger(precision) ||
		precision < 0 ||
		precision > 6
	)
		throw new WooMutationError(
			"woocommerce_rest_invalid_snapshot",
			"A supported currency precision and exact nonnegative minor amount are required.",
			503,
		);
	const digits = BigInt(amount)
		.toString()
		.padStart(precision + 1, "0");
	return precision === 0 ? digits : `${digits.slice(0, -precision)}.${digits.slice(-precision)}`;
}
/** Discounted net total / quantity. Line totals remain the authoritative accounting amounts. */
export function formatWooUnitPrice(
	total: Cents,
	quantity: number,
	code: Currency,
	decimals: Readonly<Record<string, number>>,
): string {
	// Validate the frozen amount/currency before division can disguise malformed data.
	formatWooAmount(total, code, decimals);
	if (!Number.isSafeInteger(quantity) || quantity < 1)
		throw new WooMutationError(
			"woocommerce_rest_invalid_snapshot",
			"An exact positive integer quantity is required.",
			503,
		);
	const divisor = BigInt(quantity),
		amount = BigInt(total);
	if (amount % divisor === 0n)
		return formatWooAmount(cents(Number(amount / divisor)), code, decimals);
	const currencyPrecision = decimals[code]!,
		extra = Math.max(4, String(quantity).length),
		precision = currencyPrecision + extra,
		scaled = (amount * 10n ** BigInt(extra) * 2n + divisor) / (2n * divisor),
		digits = scaled.toString().padStart(precision + 1, "0"),
		whole = digits.slice(0, -precision);
	let fraction = digits.slice(-precision);
	while (fraction.length > currencyPrecision && fraction.endsWith("0"))
		fraction = fraction.slice(0, -1);
	// At least quantity-digit guard places bound aggregate rounding below half a minor unit.
	return fraction ? `${whole}.${fraction}` : whole;
}
export function wooOrderStatus(state: OrderState, paymentMethod?: string): WooOrderStatus {
	if (state === "pending" && ["bacs", "bank_transfer", "cod"].includes(paymentMethod ?? ""))
		return "on-hold";
	switch (state) {
		case "paid":
		case "processing":
		case "shipped":
		case "delivered":
			return "processing";
		case "expired":
		case "cancelled":
			return "cancelled";
		case "pending":
		case "failed":
		case "completed":
		case "refunded":
			return state;
	}
}
/** Use this exact predicate for backend status filtering, including pending offline orders. */
export function nativeWooOrderStatus(
	snapshot: Pick<WooOrderSnapshot, "state" | "paymentMethod">,
): WooOrderStatus {
	return wooOrderStatus(snapshot.state, snapshot.paymentMethod);
}
export function nativeStatesForWooStatuses(statuses: readonly WooOrderStatus[]): OrderState[] {
	const states: OrderState[] = [
		"pending",
		"paid",
		"processing",
		"shipped",
		"delivered",
		"completed",
		"expired",
		"cancelled",
		"refunded",
		"failed",
	];
	return states.filter(
		(state) =>
			statuses.includes(wooOrderStatus(state)) ||
			(state === "pending" && statuses.includes("on-hold")),
	);
}
const EMPTY_ADDRESS: WooAddress = {
	first_name: "",
	last_name: "",
	company: "",
	address_1: "",
	address_2: "",
	city: "",
	state: "",
	postcode: "",
	country: "",
};
function date(value: string | null): string | null {
	if (value === null) return null;
	const stamp = new Date(value);
	if (Number.isNaN(stamp.valueOf()))
		throw new WooMutationError(
			"woocommerce_rest_invalid_snapshot",
			"A native timestamp is invalid.",
			503,
		);
	return stamp.toISOString().slice(0, 19);
}
function sum(values: readonly number[]): bigint {
	let result = 0n;
	for (const value of values) {
		if (!Number.isSafeInteger(value) || value < 0)
			throw new WooMutationError(
				"woocommerce_rest_invalid_snapshot",
				"Amounts must be exact nonnegative minor units.",
				503,
			);
		result += BigInt(value);
	}
	return result;
}
function validateOrder(order: WooOrderSnapshot): void {
	const lineSubtotal = sum(order.lines.map((line) => line.subtotal));
	const lineTotal = sum(order.lines.map((line) => line.total));
	const lineTax = sum(order.lines.map((line) => line.totalTax));
	const cartTax = sum([order.cartTax]);
	const shipping = sum([order.shippingTotal]);
	const shippingTax = sum([order.shippingTax]);
	if (
		order.lines.some(
			(line) =>
				!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.total > line.subtotal,
		) ||
		lineSubtotal - lineTotal !== sum([order.discountTotal]) ||
		lineTax !== cartTax ||
		cartTax + shippingTax !== sum([order.totalTax]) ||
		lineTotal + cartTax + shipping + shippingTax !== sum([order.total]) ||
		sum(order.shippingLines.map((line) => line.total)) !== shipping ||
		sum(order.shippingLines.map((line) => line.totalTax)) !== shippingTax ||
		sum(order.taxLines.map((line) => line.total)) !== cartTax ||
		sum(order.taxLines.map((line) => line.shippingTotal)) !== shippingTax
	) {
		throw new WooMutationError(
			"woocommerce_rest_invalid_snapshot",
			"The frozen accounting lines do not reconcile with native totals.",
			503,
		);
	}
}
export interface WooMapper {
	order(snapshot: WooOrderSnapshot): Promise<Record<string, unknown>>;
	product(snapshot: WooProductSnapshot): Promise<Record<string, unknown>>;
	customer(snapshot: WooCustomerSnapshot): Promise<Record<string, unknown>>;
	refund(snapshot: WooRefundSnapshot): Promise<Record<string, unknown>>;
	note(snapshot: WooNoteSnapshot): Promise<Record<string, unknown>>;
}
export function createWooMapper(
	ids: WooExternalIdStore,
	decimals: Readonly<Record<string, number>>,
): WooMapper {
	const amount = (n: Cents, currency: Currency) => formatWooAmount(n, currency, decimals);
	const taxAmounts = async (taxes: WooTaxAmount[], currency: Currency) =>
		Promise.all(
			taxes.map(async (tax) => ({
				id: await ids.getOrAssign("tax", tax.nativeTaxId),
				total: amount(tax.total, currency),
				subtotal: amount(tax.subtotal, currency),
			})),
		);
	const money = (value: WooProductSnapshot["price"]) =>
		value === null ? "" : amount(value.amount, value.currency);
	return {
		async order(snapshot) {
			validateOrder(snapshot);
			const id = await ids.getOrAssign("order", snapshot.nativeId);
			return {
				id,
				parent_id: 0,
				number: snapshot.number,
				status: nativeWooOrderStatus(snapshot),
				currency: snapshot.currency,
				version: "emdash-commerce/accounting-v1",
				created_via: "emdash-commerce",
				prices_include_tax: snapshot.pricesIncludeTax,
				date_created: date(snapshot.createdAt),
				date_created_gmt: date(snapshot.createdAt),
				date_modified: date(snapshot.updatedAt),
				date_modified_gmt: date(snapshot.updatedAt),
				date_paid: date(snapshot.paidAt),
				date_paid_gmt: date(snapshot.paidAt),
				date_completed: date(snapshot.completedAt),
				date_completed_gmt: date(snapshot.completedAt),
				discount_total: amount(snapshot.discountTotal, snapshot.currency),
				discount_tax: amount(snapshot.discountTax, snapshot.currency),
				shipping_total: amount(snapshot.shippingTotal, snapshot.currency),
				shipping_tax: amount(snapshot.shippingTax, snapshot.currency),
				cart_tax: amount(snapshot.cartTax, snapshot.currency),
				total: amount(snapshot.total, snapshot.currency),
				total_tax: amount(snapshot.totalTax, snapshot.currency),
				customer_id: snapshot.customerId
					? await ids.getOrAssign("customer", snapshot.customerId)
					: 0,
				billing: { ...EMPTY_ADDRESS, email: "", phone: "", ...snapshot.billing },
				shipping: { ...EMPTY_ADDRESS, ...snapshot.shipping },
				payment_method: snapshot.paymentMethod,
				payment_method_title: snapshot.paymentMethodTitle,
				transaction_id: snapshot.transactionId,
				customer_note: snapshot.customerNote,
				meta_data: snapshot.metadata,
				line_items: await Promise.all(
					snapshot.lines.map(async (line) => ({
						id: await ids.getOrAssign("line", line.nativeId),
						name: line.name,
						product_id: await ids.getOrAssign("product", line.productId),
						variation_id: line.variationId
							? await ids.getOrAssign("variation", line.variationId)
							: 0,
						quantity: line.quantity,
						sku: line.sku,
						subtotal: amount(line.subtotal, snapshot.currency),
						subtotal_tax: amount(line.subtotalTax, snapshot.currency),
						total: amount(line.total, snapshot.currency),
						total_tax: amount(line.totalTax, snapshot.currency),
						price: formatWooUnitPrice(line.total, line.quantity, snapshot.currency, decimals),
						taxes: await taxAmounts(line.taxes, snapshot.currency),
						meta_data: line.metadata ?? [],
					})),
				),
				tax_lines: await Promise.all(
					snapshot.taxLines.map(async (tax) => ({
						id: await ids.getOrAssign("tax", tax.nativeId),
						rate_id: await ids.getOrAssign("tax", tax.nativeId),
						rate_code: tax.code,
						label: tax.label,
						compound: tax.compound,
						tax_total: amount(tax.total, snapshot.currency),
						shipping_tax_total: amount(tax.shippingTotal, snapshot.currency),
						...(tax.ratePercent === undefined ? {} : { rate_percent: tax.ratePercent }),
						meta_data: [],
					})),
				),
				shipping_lines: await Promise.all(
					snapshot.shippingLines.map(async (shipping) => ({
						id: await ids.getOrAssign("shipping", shipping.nativeId),
						method_id: shipping.methodId,
						method_title: shipping.title,
						total: amount(shipping.total, snapshot.currency),
						total_tax: amount(shipping.totalTax, snapshot.currency),
						taxes: await taxAmounts(shipping.taxes, snapshot.currency),
						meta_data: [],
					})),
				),
				fee_lines: [],
				coupon_lines: [],
				refunds: await Promise.all(
					snapshot.refunds.map(async (refund) => ({
						id: await ids.getOrAssign("refund", refund.nativeId),
						reason: refund.reason,
						total: `-${amount(refund.amount, refund.currency)}`,
					})),
				),
			};
		},
		async product(snapshot) {
			if (snapshot.type === "variation" && !snapshot.parentId)
				throw new WooMutationError(
					"woocommerce_rest_invalid_snapshot",
					"Variation parent is missing.",
					503,
				);
			if (
				snapshot.stockQuantity !== null &&
				(!Number.isSafeInteger(snapshot.stockQuantity) || snapshot.stockQuantity < 0)
			)
				throw new WooMutationError(
					"woocommerce_rest_invalid_snapshot",
					"Stock quantity is invalid.",
					503,
				);
			const priceCurrencies = [snapshot.price, snapshot.regularPrice, snapshot.salePrice].flatMap(
				(value) => (value ? [value.currency] : []),
			);
			if (new Set(priceCurrencies).size > 1)
				throw new WooMutationError(
					"woocommerce_rest_invalid_snapshot",
					"Product prices use different currencies.",
					503,
				);
			return {
				id: await ids.getOrAssign(
					snapshot.type === "variation" ? "variation" : "product",
					snapshot.nativeId,
				),
				...(snapshot.parentId
					? { parent_id: await ids.getOrAssign("product", snapshot.parentId) }
					: {}),
				name: snapshot.name,
				slug: snapshot.slug,
				permalink: snapshot.permalink,
				type: snapshot.type,
				status: snapshot.status,
				description: snapshot.description,
				short_description: snapshot.shortDescription,
				sku: snapshot.sku,
				price: money(snapshot.price),
				regular_price: money(snapshot.regularPrice),
				sale_price: money(snapshot.salePrice),
				on_sale: snapshot.salePrice !== null,
				purchasable:
					snapshot.status === "publish" &&
					snapshot.price !== null &&
					snapshot.stockStatus === "instock",
				virtual: snapshot.virtual,
				downloadable: snapshot.downloadable,
				tax_status: snapshot.taxStatus,
				tax_class: snapshot.taxClass,
				manage_stock: snapshot.manageStock,
				stock_quantity: snapshot.stockQuantity,
				stock_status: snapshot.stockStatus,
				backorders: "no",
				backorders_allowed: false,
				date_created: date(snapshot.createdAt),
				date_created_gmt: date(snapshot.createdAt),
				date_modified: date(snapshot.updatedAt),
				date_modified_gmt: date(snapshot.updatedAt),
				variations: await Promise.all(
					snapshot.variationIds.map((id) => ids.getOrAssign("variation", id)),
				),
				attributes: snapshot.attributes,
				images: snapshot.images,
				meta_data: snapshot.metadata,
			};
		},
		async customer(snapshot) {
			return {
				id: await ids.getOrAssign("customer", snapshot.nativeId),
				email: snapshot.email,
				first_name: snapshot.firstName,
				last_name: snapshot.lastName,
				username: snapshot.username,
				role: "customer",
				date_created: date(snapshot.createdAt),
				date_created_gmt: date(snapshot.createdAt),
				date_modified: date(snapshot.updatedAt),
				date_modified_gmt: date(snapshot.updatedAt),
				billing: { ...EMPTY_ADDRESS, email: snapshot.email, phone: "", ...snapshot.billing },
				shipping: { ...EMPTY_ADDRESS, ...snapshot.shipping },
				meta_data: snapshot.metadata,
			};
		},
		async refund(snapshot) {
			return {
				id: await ids.getOrAssign("refund", snapshot.nativeId),
				date_created: date(snapshot.createdAt),
				date_created_gmt: date(snapshot.createdAt),
				amount: amount(snapshot.amount, snapshot.currency),
				reason: snapshot.reason,
				refunded_by: 0,
				refunded_payment: snapshot.paymentRefunded,
				meta_data: snapshot.metadata,
				line_items: [],
			};
		},
		async note(snapshot) {
			return {
				id: await ids.getOrAssign("note", snapshot.nativeId),
				author: snapshot.author,
				date_created: date(snapshot.createdAt),
				date_created_gmt: date(snapshot.createdAt),
				note: snapshot.note,
				customer_note: snapshot.customerNote,
			};
		},
	};
}
