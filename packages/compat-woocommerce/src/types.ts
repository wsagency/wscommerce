import type { Cents, Currency, Money, Order, OrderState } from "@otta-sh/domain";

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };
export interface WooMetadata {
	id: number;
	key: string;
	value: JsonValue;
}
export interface MetadataPatch {
	id?: number;
	key: string;
	value: JsonValue;
}
export interface WooAddress {
	first_name: string;
	last_name: string;
	company: string;
	address_1: string;
	address_2: string;
	city: string;
	state: string;
	postcode: string;
	country: string;
	email?: string;
	phone?: string;
}
export type WooOrderStatus =
	| "pending"
	| "processing"
	| "on-hold"
	| "completed"
	| "cancelled"
	| "refunded"
	| "failed";
export interface WooTaxAmount {
	nativeTaxId: string;
	total: Cents;
	subtotal: Cents;
}
export interface WooLineSnapshot {
	nativeId: string;
	productId: string;
	variationId?: string;
	name: string;
	sku: string;
	quantity: number;
	subtotal: Cents;
	subtotalTax: Cents;
	total: Cents;
	totalTax: Cents;
	unitPrice: Cents;
	taxes: WooTaxAmount[];
	metadata?: WooMetadata[];
}
export interface WooShippingSnapshot {
	nativeId: string;
	methodId: string;
	title: string;
	total: Cents;
	totalTax: Cents;
	taxes: WooTaxAmount[];
}
export interface WooTaxSnapshot {
	nativeId: string;
	code: string;
	label: string;
	compound: boolean;
	total: Cents;
	shippingTotal: Cents;
	ratePercent?: string;
}
export interface WooRefundSnapshot {
	nativeId: string;
	orderId: string;
	currency: Currency;
	amount: Cents;
	reason: string;
	createdAt: string;
	refundedBy?: string;
	paymentRefunded: boolean;
	metadata: WooMetadata[];
}
/** Frozen native projection. Per-line discounts/taxes must reconcile, never use current catalog rates. */
export interface WooOrderSnapshot {
	nativeId: string;
	number: string;
	state: OrderState;
	currency: Currency;
	createdAt: string;
	updatedAt: string;
	paidAt: string | null;
	completedAt: string | null;
	customerId: string | null;
	billing: WooAddress | null;
	shipping: WooAddress | null;
	paymentMethod: string;
	paymentMethodTitle: string;
	transactionId: string;
	customerNote: string;
	pricesIncludeTax: boolean;
	discountTotal: Cents;
	discountTax: Cents;
	shippingTotal: Cents;
	shippingTax: Cents;
	cartTax: Cents;
	total: Cents;
	totalTax: Cents;
	lines: WooLineSnapshot[];
	shippingLines: WooShippingSnapshot[];
	taxLines: WooTaxSnapshot[];
	refunds: WooRefundSnapshot[];
	metadata: WooMetadata[];
}
export interface WooProductSnapshot {
	nativeId: string;
	parentId?: string;
	name: string;
	slug: string;
	permalink: string;
	type: "simple" | "variable" | "variation";
	status: "publish" | "draft" | "private";
	description: string;
	shortDescription: string;
	sku: string;
	price: Money | null;
	regularPrice: Money | null;
	salePrice: Money | null;
	virtual: boolean;
	downloadable: boolean;
	taxStatus: "taxable" | "none";
	taxClass: string;
	manageStock: boolean;
	stockQuantity: number | null;
	stockStatus: "instock" | "outofstock";
	createdAt: string;
	updatedAt: string;
	variationIds: string[];
	attributes: Array<{
		name: string;
		option?: string;
		options?: string[];
		variation?: boolean;
		visible?: boolean;
	}>;
	images: Array<{ src: string; name: string; alt: string }>;
	metadata: WooMetadata[];
}
export interface WooCustomerSnapshot {
	nativeId: string;
	email: string;
	firstName: string;
	lastName: string;
	username: string;
	createdAt: string;
	updatedAt: string | null;
	billing: WooAddress | null;
	shipping: WooAddress | null;
	metadata: WooMetadata[];
}
export interface WooNoteSnapshot {
	nativeId: string;
	orderId: string;
	note: string;
	author: string;
	createdAt: string;
	customerNote: boolean;
}
export interface ListQuery {
	page: number;
	perPage: number;
	order: "asc" | "desc";
	orderBy: "date" | "modified" | "id";
	after?: string;
	before?: string;
	modifiedAfter?: string;
	modifiedBefore?: string;
	include?: number[];
	exclude?: number[];
	search?: string;
	statuses?: WooOrderStatus[];
	customerId?: string;
	sku?: string;
	productStatus?: "publish" | "draft" | "private";
	productType?: "simple" | "variable";
	stockStatus?: "instock" | "outofstock";
	email?: string;
}
export interface ListResult<T> {
	items: T[];
	total: number;
}
export type WooScope =
	| "orders:read"
	| "orders:write"
	| "products:read"
	| "products:write"
	| "customers:read";
export interface WooPrincipal {
	id: string;
	scopes: readonly WooScope[];
}
export interface WooCredentialRecord extends WooPrincipal {
	consumerKey: string;
	secretSha256: string;
	enabled: boolean;
}
export interface WooCredentialStore {
	findByConsumerKey(key: string): Promise<WooCredentialRecord | null>;
}
export interface WooAuthenticator {
	authenticate(key: string, secret: string): Promise<WooPrincipal | null>;
}
export interface MutationContext {
	principal: WooPrincipal;
	idempotencyKey: string;
}
export interface GuardedOrderPatch {
	metadata?: MetadataPatch[];
	status?: "processing" | "completed" | "cancelled";
}
export interface GuardedStockPatch {
	stockQuantity: number;
}
/** Implementations must atomically validate all fields and enter native guarded commands; no raw markPaid. */
export interface WooBackendPort {
	listOrders(query: ListQuery): Promise<ListResult<WooOrderSnapshot>>;
	getOrder(nativeId: string): Promise<WooOrderSnapshot | null>;
	listProducts(query: ListQuery): Promise<ListResult<WooProductSnapshot>>;
	getProduct(nativeId: string): Promise<WooProductSnapshot | null>;
	listVariations(parentId: string, query: ListQuery): Promise<ListResult<WooProductSnapshot>>;
	getVariation(parentId: string, nativeId: string): Promise<WooProductSnapshot | null>;
	listCustomers(query: ListQuery): Promise<ListResult<WooCustomerSnapshot>>;
	getCustomer(nativeId: string): Promise<WooCustomerSnapshot | null>;
	listNotes(orderId: string, query: ListQuery): Promise<ListResult<WooNoteSnapshot>>;
	getNote(orderId: string, nativeId: string): Promise<WooNoteSnapshot | null>;
	listRefunds(orderId: string, query: ListQuery): Promise<ListResult<WooRefundSnapshot>>;
	getRefund(orderId: string, nativeId: string): Promise<WooRefundSnapshot | null>;
	/** One guarded native operation. Reject invalid transition with WooMutationError(409). */
	applyOrderPatch(
		nativeId: string,
		patch: GuardedOrderPatch,
		context: MutationContext,
	): Promise<WooOrderSnapshot>;
	/** Absolute stock update guarded against holds/replays, delegated to native inventory. */
	applyStockUpdate(
		nativeId: string,
		patch: GuardedStockPatch,
		context: MutationContext,
	): Promise<WooProductSnapshot>;
	appendNote(orderId: string, note: string, context: MutationContext): Promise<WooNoteSnapshot>;
}
export type ExternalEntityKind =
	| "order"
	| "product"
	| "variation"
	| "customer"
	| "line"
	| "refund"
	| "note"
	| "tax"
	| "shipping";
export interface ExternalEntity {
	kind: ExternalEntityKind;
	nativeId: string;
}
/** Allocation and reverse lookup are durable/atomic. Never recycle IDs or hash native identifiers. */
export interface WooExternalIdStore {
	getOrAssign(kind: ExternalEntityKind, nativeId: string): Promise<number>;
	lookup(kind: ExternalEntityKind, externalId: number): Promise<string | null>;
}
export interface WooHandlerOptions {
	backend: WooBackendPort;
	ids: WooExternalIdStore;
	authenticate: WooAuthenticator;
	currencyDecimals: Readonly<Record<string, number>>;
	/** Plain HTTP only for an explicitly configured localhost development URL. */
	allowInsecureLocalhost?: boolean;
}
export interface NativeSnapshotOptions {
	billing?: WooAddress | null;
	paymentMethodTitle?: string;
	paidAt?: string | null;
	completedAt?: string | null;
	transactionId?: string;
	metadata?: WooMetadata[];
	refunds?: WooRefundSnapshot[];
}
export type NativeOrder = Order;
