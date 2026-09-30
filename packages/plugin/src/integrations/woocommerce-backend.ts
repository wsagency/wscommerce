import {
	appendOrderNote,
	cancelOrder,
	customerId,
	idempotencyKey,
	orderId,
	productId,
	sku,
	StockMovementMismatchError,
	transitionOrder,
	type Address,
	type OrderNote,
	type ProductCommerce,
} from "@otta-sh/domain";
import {
	collectionOf,
	CUSTOMERS_COLLECTION,
	ORDERS_COLLECTION,
	ORDER_NOTES_COLLECTION,
	PRODUCT_COMMERCE_COLLECTION,
	normalizeProductDoc,
	isStorageContentionError,
	type CustomerDoc,
	type OrderDoc,
	type OrderNoteDoc,
	type ProductCommerceDoc,
} from "@otta-sh/store-emdash";
import {
	WooMutationError,
	hashWooSecret,
	nativeOrderSnapshot,
	nativeWooAddress,
	nativeWooOrderStatus,
	type EmDashWooMetadataStore,
	type ExternalEntityKind,
	type ListQuery,
	type ListResult,
	type MutationContext,
	type WooBackendPort,
	type WooCustomerSnapshot,
	type WooExternalIdStore,
	type WooNoteSnapshot,
	type WooOrderSnapshot,
	type WooProductSnapshot,
	type WooRefundSnapshot,
} from "@emdash-commerce/compat-woocommerce";
import { createInProcessCommerceStores } from "../commerce/in-process-commerce-stores.js";
import type { PluginContext, StorageWhereClause } from "../types.js";
import type { NativeWooProductContentPort } from "./woocommerce-content.js";
export type {
	NativeWooProductContent,
	NativeWooProductContentPort,
} from "./woocommerce-content.js";
export const NATIVE_WOO_SCAN_LIMIT = 10_000;
function failure(message: string, status = 409, code = "woocommerce_rest_native_conflict"): never {
	throw new WooMutationError(code, message, status);
}
function missing(): never {
	failure("Resource not found.", 404, "woocommerce_rest_not_found");
}
function textOrder(a: string, b: string): number {
	return a === b ? 0 : a < b ? -1 : 1;
}
function dateMatches(createdAt: string, updatedAt: string, query: ListQuery): boolean {
	const created = Date.parse(createdAt),
		modified = Date.parse(updatedAt);
	return (
		(query.after === undefined || created > Date.parse(query.after)) &&
		(query.before === undefined || created < Date.parse(query.before)) &&
		(query.modifiedAfter === undefined || modified > Date.parse(query.modifiedAfter)) &&
		(query.modifiedBefore === undefined || modified < Date.parse(query.modifiedBefore))
	);
}
function privateNote(note: OrderNote): WooNoteSnapshot {
	return {
		nativeId: note.id,
		orderId: note.orderId,
		note: note.body,
		author: note.author,
		createdAt: note.createdAt,
		customerNote: false,
	};
}
function customerAddress(address: Address | undefined) {
	return address ? nativeWooAddress({ ...address, email: null, phone: null }) : null;
}
/** Reads native stores and frozen snapshots. It never creates a payment, refund or price update. */
export function createNativeWooBackend(
	ctx: PluginContext,
	ids: WooExternalIdStore,
	metadata: EmDashWooMetadataStore,
	origin: string,
	content?: NativeWooProductContentPort,
): WooBackendPort {
	const stores = createInProcessCommerceStores(ctx);
	const storage = ctx.storage!;
	const source = new URL(origin);
	if (
		source.protocol !== "https:" &&
		!["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)
	)
		failure("A secure shop origin is required.", 400);
	const orders = collectionOf<OrderDoc>(storage, ORDERS_COLLECTION),
		products = collectionOf<ProductCommerceDoc>(storage, PRODUCT_COMMERCE_COLLECTION),
		customers = collectionOf<CustomerDoc>(storage, CUSTOMERS_COLLECTION),
		notes = collectionOf<OrderNoteDoc>(storage, ORDER_NOTES_COLLECTION);
	async function scan<T>(
		collection: ReturnType<typeof collectionOf<T>>,
		where?: StorageWhereClause,
	): Promise<Array<{ id: string; data: T }>> {
		if ((await collection.count(where)) > NATIVE_WOO_SCAN_LIMIT)
			failure(
				"Native Woo scan capacity exceeded; indexed adapter required.",
				503,
				"woocommerce_rest_scan_capacity",
			);
		const result: Array<{ id: string; data: T }> = [];
		let cursor: string | undefined;
		for (let page = 0; page < 100; page++) {
			const next = await collection.query({ limit: 100, cursor, where });
			result.push(...next.items);
			if (result.length > NATIVE_WOO_SCAN_LIMIT)
				failure(
					"Native Woo scan capacity exceeded; indexed adapter required.",
					503,
					"woocommerce_rest_scan_capacity",
				);
			if (!next.hasMore) return result;
			if (!next.cursor || next.cursor === cursor)
				failure("Native Woo scan cursor is invalid.", 503, "woocommerce_rest_scan_capacity");
			cursor = next.cursor;
		}
		failure(
			"Native Woo scan capacity exceeded; indexed adapter required.",
			503,
			"woocommerce_rest_scan_capacity",
		);
	}
	async function paginate<T extends { nativeId: string; createdAt: string }>(
		items: T[],
		kind: ExternalEntityKind,
		query: ListQuery,
		modified: (item: T) => string,
	): Promise<ListResult<T>> {
		const filtered: T[] = [];
		for (const item of items) {
			if (!dateMatches(item.createdAt, modified(item), query)) continue;
			if (query.include !== undefined || query.exclude !== undefined) {
				const numeric = await ids.getOrAssign(kind, item.nativeId);
				if (query.include !== undefined && !query.include.includes(numeric)) continue;
				if (query.exclude?.includes(numeric)) continue;
			}
			filtered.push(item);
		}
		const numericIds = new Map<string, number>();
		if (query.orderBy === "id")
			for (const item of filtered)
				numericIds.set(item.nativeId, await ids.getOrAssign(kind, item.nativeId));
		const direction = query.order === "asc" ? 1 : -1;
		const sorted = filtered.toSorted(
			(a, b) =>
				direction *
				((query.orderBy === "id"
					? numericIds.get(a.nativeId)! - numericIds.get(b.nativeId)!
					: textOrder(
							query.orderBy === "modified" ? modified(a) : a.createdAt,
							query.orderBy === "modified" ? modified(b) : b.createdAt,
						)) || textOrder(a.nativeId, b.nativeId)),
		);
		const start = (query.page - 1) * query.perPage;
		return { total: sorted.length, items: sorted.slice(start, start + query.perPage) };
	}
	async function getOrder(nativeId: string): Promise<WooOrderSnapshot | null> {
		for (let attempt = 0; attempt < 3; attempt++) {
			const first = await orders.getVersioned(nativeId);
			if (!first) return null;
			const native = await stores.orderStore.getById(orderId(nativeId));
			if (!native) return null;
			const last = await orders.getVersioned(nativeId);
			if (!last || first.revision !== last.revision) continue;
			const doc = first.value;
			const succeeded = (doc.payments ?? []).filter(
				(payment) =>
					payment.status === "succeeded" &&
					payment.currency === native.currency &&
					payment.amount > 0,
			);
			const events = doc.events ?? [];
			const capturedExactly =
				succeeded.length > 0 &&
				succeeded.every((payment) => Number.isSafeInteger(payment.amount) && payment.amount >= 0) &&
				succeeded.reduce((total, payment) => total + BigInt(payment.amount), 0n) ===
					BigInt(native.totals.total);
			const refunds: WooRefundSnapshot[] = (doc.refunds ?? [])
				.filter(
					(refund) =>
						refund.status === "recorded" &&
						(refund.kind === "manual" ||
							(refund.refundRef !== null &&
								(refund.providerStatus === undefined || refund.providerStatus === "succeeded"))),
				)
				.map((refund) => ({
					nativeId: refund.id,
					orderId: nativeId,
					currency: refund.currency,
					amount: refund.amount,
					reason: refund.reason ?? "",
					createdAt: refund.createdAt,
					refundedBy: refund.refundedBy,
					paymentRefunded: refund.kind === "gateway",
					metadata: [],
				}));
			return nativeOrderSnapshot(native, {
				paidAt: capturedExactly
					? (events.find((event) => event.toState === "paid")?.at ??
						succeeded[0]?.recordedAt ??
						null)
					: null,
				completedAt: events.find((event) => event.toState === "completed")?.at ?? null,
				transactionId: succeeded[0]?.providerRef ?? "",
				metadata: await metadata.get(`order:${nativeId}`),
				refunds,
			});
		}
		failure(
			"Native order changed during projection; retry the request.",
			503,
			"woocommerce_rest_snapshot_busy",
		);
	}
	async function productSnapshot(
		native: ProductCommerce,
		doc: ProductCommerceDoc,
		variantKey?: string,
	): Promise<WooProductSnapshot> {
		const normalized = normalizeProductDoc(doc),
			variant = variantKey === undefined ? undefined : normalized.variants[variantKey];
		const liveVariants = Object.values(normalized.variants).filter(
			(item) => item.orphanedAt === null,
		);
		const price = variant?.price ?? (variantKey === undefined ? native.price : null),
			code = variant?.sku ?? (variantKey === undefined ? native.sku : null);
		const quantity = code === null ? null : await stores.inventory.findOnHand(code);
		const compare = variantKey === undefined ? native.compareAtPrice : null;
		const sale =
			price && compare && compare.currency === price.currency && compare.amount > price.amount
				? price
				: null;
		return {
			nativeId: variantKey === undefined ? native.productId : `${native.productId}:${variantKey}`,
			parentId: variantKey === undefined ? undefined : native.productId,
			name: variantKey === undefined ? (native.title ?? "") : (variant?.title ?? ""),
			slug: "",
			permalink: "",
			type:
				variantKey === undefined ? (liveVariants.length > 0 ? "variable" : "simple") : "variation",
			status: native.active ? "publish" : "draft",
			description: "",
			shortDescription: "",
			sku: code ?? "",
			price,
			regularPrice: sale ? compare : price,
			salePrice: sale,
			virtual: native.productKind === "digital",
			downloadable: native.productKind === "digital",
			taxStatus: "taxable",
			taxClass: native.taxClass ?? "standard",
			manageStock: native.productKind === "physical" && code !== null,
			stockQuantity: quantity,
			stockStatus:
				native.productKind === "digital" || (quantity !== null && quantity > 0)
					? "instock"
					: "outofstock",
			createdAt: variant?.createdAt ?? native.createdAt.toISOString(),
			updatedAt: variant?.updatedAt ?? native.updatedAt.toISOString(),
			variationIds:
				variantKey === undefined
					? liveVariants.map((item) => `${native.productId}:${item.variantKey}`)
					: [],
			attributes:
				variantKey === undefined
					? []
					: [{ name: "Variation", option: variant?.title ?? variantKey }],
			images: [],
			metadata: await metadata.get(
				`${variantKey === undefined ? "product" : "variation"}:${variantKey === undefined ? native.productId : `${native.productId}:${variantKey}`}`,
			),
		};
	}
	async function enrich(items: WooProductSnapshot[]): Promise<WooProductSnapshot[]> {
		if (!content || items.length === 0) return items;
		const records = await content.getMany([
			...new Set(items.map((item) => item.parentId ?? item.nativeId)),
		]);
		return items.map((item) => {
			const cms = records[item.parentId ?? item.nativeId];
			return cms
				? {
						...item,
						slug: cms.slug,
						permalink: cms.permalink,
						description: cms.description,
						shortDescription: cms.shortDescription,
						images: cms.images.map((image) => ({ ...image })),
					}
				: item;
		});
	}
	async function getProduct(nativeId: string): Promise<WooProductSnapshot | null> {
		const native = await stores.productCommerce.getByProductId(productId(nativeId));
		if (!native || native.deletedAt !== null) return null;
		const doc = await products.get(nativeId);
		if (!doc) return null;
		return (await enrich([await productSnapshot(native, doc)]))[0]!;
	}
	async function getVariation(
		parentId: string,
		nativeId: string,
	): Promise<WooProductSnapshot | null> {
		const native = await stores.productCommerce.getByProductId(productId(parentId));
		if (!native || native.deletedAt !== null) return null;
		const raw = await products.get(parentId);
		if (!raw) return null;
		const doc = normalizeProductDoc(raw);
		const variant = Object.values(doc.variants).find(
			(item) => `${parentId}:${item.variantKey}` === nativeId && item.orphanedAt === null,
		);
		if (!variant) return null;
		return (await enrich([await productSnapshot(native, doc, variant.variantKey)]))[0]!;
	}
	async function listVariations(
		parentId: string,
		query: ListQuery,
	): Promise<ListResult<WooProductSnapshot>> {
		const native = await stores.productCommerce.getByProductId(productId(parentId));
		if (!native || native.deletedAt !== null) missing();
		const raw = await products.get(parentId);
		if (!raw) missing();
		const doc = normalizeProductDoc(raw);
		if (Object.keys(doc.variants).length > NATIVE_WOO_SCAN_LIMIT)
			failure("Native Woo variation capacity exceeded.", 503, "woocommerce_rest_scan_capacity");
		const items: WooProductSnapshot[] = [];
		for (const variant of Object.values(doc.variants))
			if (variant.orphanedAt === null) {
				const item = await productSnapshot(native, doc, variant.variantKey);
				if (
					query.search === undefined ||
					`${item.name} ${item.sku}`.toLocaleLowerCase().includes(query.search.toLocaleLowerCase())
				)
					items.push(item);
			}
		const result = await paginate(items, "variation", query, (item) => item.updatedAt);
		return { ...result, items: await enrich(result.items) };
	}
	async function getCustomer(nativeId: string): Promise<WooCustomerSnapshot | null> {
		const native = await stores.customerStore.get(customerId(nativeId));
		if (!native) return null;
		const addresses = await stores.addressStore.list(native.id),
			names = (native.displayName ?? "").trim().split(/\s+/),
			firstName = names.shift() ?? "";
		const address = (kind: "billing" | "shipping") =>
			addresses.find((item) => item.kind === kind && item.isDefault) ??
			addresses.find((item) => item.kind === kind);
		return {
			nativeId: native.id,
			email: native.email,
			firstName,
			lastName: names.join(" "),
			username: "",
			createdAt: native.createdAt,
			updatedAt: null,
			billing: customerAddress(address("billing")),
			shipping: customerAddress(address("shipping")),
			metadata: await metadata.get(`customer:${native.id}`),
		};
	}
	async function listNotes(
		parentId: string,
		query: ListQuery,
	): Promise<ListResult<WooNoteSnapshot>> {
		if (!(await stores.orderStore.getById(orderId(parentId)))) missing();
		const rows = await scan(notes, { orderId: parentId });
		return paginate(
			rows
				.filter(
					({ data }) =>
						query.search === undefined ||
						`${data.body} ${data.author}`
							.toLocaleLowerCase()
							.includes(query.search.toLocaleLowerCase()),
				)
				.map(({ data }) =>
					privateNote({
						id: data.noteId,
						orderId: orderId(data.orderId),
						author: data.author,
						body: data.body,
						createdAt: data.createdAt,
					}),
				),
			"note",
			query,
			(item) => item.createdAt,
		);
	}
	async function listRefunds(
		parentId: string,
		query: ListQuery,
	): Promise<ListResult<WooRefundSnapshot>> {
		const order = await getOrder(parentId);
		if (!order) missing();
		return paginate(
			order.refunds.filter(
				(item) =>
					query.search === undefined ||
					`${item.reason} ${item.nativeId}`
						.toLocaleLowerCase()
						.includes(query.search.toLocaleLowerCase()),
			),
			"refund",
			query,
			(item) => item.createdAt,
		);
	}
	return {
		getOrder,
		async listOrders(query) {
			const rows = await scan(orders),
				items: Array<{ nativeId: string; createdAt: string; updatedAt: string }> = [];
			for (const { id, data } of rows) {
				if (query.customerId !== undefined && data.customerId !== query.customerId) continue;
				if (query.search !== undefined) {
					const search = query.search.toLocaleLowerCase();
					if (
						![
							id,
							data.buyerRef,
							...(data.items ?? []).flatMap((item) => [item.title, item.sku]),
						].some((value) => value.toLocaleLowerCase().includes(search))
					)
						continue;
				}
				if (
					query.statuses &&
					!query.statuses.includes(
						nativeWooOrderStatus({ state: data.state, paymentMethod: data.paymentMethod ?? "" }),
					)
				)
					continue;
				items.push({ nativeId: id, createdAt: data.createdAt, updatedAt: data.updatedAt });
			}
			const selected = await paginate(items, "order", query, (item) => item.updatedAt),
				projected: WooOrderSnapshot[] = [];
			for (const item of selected.items) {
				const snapshot = await getOrder(item.nativeId);
				if (!snapshot)
					failure(
						"Native order disappeared during projection; retry the request.",
						503,
						"woocommerce_rest_snapshot_busy",
					);
				projected.push(snapshot);
			}
			return { total: selected.total, items: projected };
		},
		getProduct,
		async listProducts(query) {
			const rows = await scan(products),
				items: WooProductSnapshot[] = [];
			for (const { id } of rows) {
				const native = await stores.productCommerce.getByProductId(productId(id));
				if (!native || native.deletedAt !== null) continue;
				const doc = await products.get(id);
				if (!doc) continue;
				const item = await productSnapshot(native, doc);
				if (
					(query.productStatus !== undefined && item.status !== query.productStatus) ||
					(query.productType !== undefined && item.type !== query.productType) ||
					(query.stockStatus !== undefined && item.stockStatus !== query.stockStatus) ||
					(query.sku !== undefined && !query.sku.split(",").includes(item.sku))
				)
					continue;
				if (
					query.search !== undefined &&
					!`${item.name} ${item.sku}`.toLocaleLowerCase().includes(query.search.toLocaleLowerCase())
				)
					continue;
				items.push(item);
			}
			const result = await paginate(items, "product", query, (item) => item.updatedAt);
			return { ...result, items: await enrich(result.items) };
		},
		listVariations,
		getVariation,
		getCustomer,
		async listCustomers(query) {
			if (
				query.modifiedAfter !== undefined ||
				query.modifiedBefore !== undefined ||
				query.orderBy === "modified"
			)
				failure(
					"Native customers have no captured modified timestamp.",
					400,
					"woocommerce_rest_unsupported_filter",
				);
			const rows = await scan(customers),
				items: WooCustomerSnapshot[] = [];
			for (const { id } of rows) {
				const item = await getCustomer(id);
				if (!item) continue;
				if (
					query.email !== undefined &&
					item.email.toLocaleLowerCase() !== query.email.toLocaleLowerCase()
				)
					continue;
				if (
					query.search !== undefined &&
					!`${item.email} ${item.firstName} ${item.lastName}`
						.toLocaleLowerCase()
						.includes(query.search.toLocaleLowerCase())
				)
					continue;
				items.push(item);
			}
			return paginate(items, "customer", query, (item) => item.createdAt);
		},
		listNotes,
		async getNote(parentId, nativeId) {
			return (
				(
					await listNotes(parentId, {
						page: 1,
						perPage: NATIVE_WOO_SCAN_LIMIT,
						order: "asc",
						orderBy: "date",
					})
				).items.find((item) => item.nativeId === nativeId) ?? null
			);
		},
		listRefunds,
		async getRefund(parentId, nativeId) {
			const order = await getOrder(parentId);
			return order?.refunds.find((item) => item.nativeId === nativeId) ?? null;
		},
		async applyOrderPatch(nativeId, patch, context) {
			if (patch.metadata !== undefined && patch.status !== undefined)
				failure(
					"Combined metadata/status writes cannot be applied atomically.",
					400,
					"woocommerce_rest_unsupported_patch",
				);
			const before = await getOrder(nativeId);
			if (!before) missing();
			if (patch.metadata !== undefined) {
				await metadata.patch(`order:${nativeId}`, patch.metadata, context.idempotencyKey);
				return (await getOrder(nativeId))!;
			}
			if (!patch.status) failure("A supported order mutation is required.", 400);
			if (patch.status === "processing" || patch.status === "completed") {
				if (!["paid", "processing", "shipped", "delivered", "completed"].includes(before.state))
					failure("The requested state cannot manufacture payment evidence.");
				const result = await transitionOrder(
					{ orderStore: stores.orderStore },
					{
						orderId: orderId(nativeId),
						toState: patch.status,
						idempotencyKey: idempotencyKey(context.idempotencyKey),
					},
				);
				if (!result.ok) failure("Native order transition rejected.");
			} else if (patch.status === "cancelled") {
				const result = await cancelOrder(
					{ orderStore: stores.orderStore },
					{
						orderId: orderId(nativeId),
						reason: "other",
						detail: "Cancelled by the accounting connector.",
						cancelledBy: context.principal.id,
						idempotencyKey: idempotencyKey(context.idempotencyKey),
					},
				);
				if (!result.ok) failure("Native order cancellation rejected.");
			} else failure("Unsupported native order status.", 400);
			return (await getOrder(nativeId))!;
		},
		async applyStockUpdate(nativeId, patch, context) {
			if (!Number.isSafeInteger(patch.stockQuantity) || patch.stockQuantity < 0)
				failure("stock_quantity must be a nonnegative safe integer.", 400);
			const before =
				patch.parentId === undefined
					? await getProduct(nativeId)
					: await getVariation(patch.parentId, nativeId);
			if (!before) missing();
			if (!before.manageStock || !before.sku)
				failure(
					"Only physical products with a native SKU support stock writes.",
					501,
					"woocommerce_rest_stock_not_supported",
				);
			const key = idempotencyKey(
				`woo-stock:${await hashWooSecret(
					JSON.stringify([
						context.principal.id,
						patch.parentId ?? null,
						nativeId,
						context.idempotencyKey,
					]),
				)}`,
			);
			try {
				const result = await stores.inventory.setOnHandAbsolute(
					sku(before.sku),
					patch.stockQuantity,
					key,
				);
				if (!result.ok) missing();
				return {
					...before,
					stockQuantity: result.onHand,
					stockStatus: result.onHand > 0 ? "instock" : "outofstock",
				};
			} catch (error) {
				if (error instanceof StockMovementMismatchError)
					failure(
						"The stock replay key belongs to another command.",
						409,
						"woocommerce_rest_idempotency_conflict",
					);
				if (isStorageContentionError(error))
					failure("Native stock is busy; retry the request.", 503, "woocommerce_rest_stock_busy");
				throw error;
			}
		},
		async appendNote(parentId, body, context: MutationContext) {
			const key = idempotencyKey(
				`woo-note:${await hashWooSecret(`${context.idempotencyKey}:order:${parentId}`)}`,
			);
			const result = await appendOrderNote(
				{ orderStore: stores.orderStore, orderNotesStore: stores.orderNotesStore },
				{ orderId: orderId(parentId), author: context.principal.id, body, idempotencyKey: key },
			);
			if (!result.ok)
				failure("Native order note rejected.", result.reason === "ORDER_NOT_FOUND" ? 404 : 400);
			if (
				result.note.orderId !== parentId ||
				result.note.body !== body.trim() ||
				result.note.author !== context.principal.id
			)
				failure(
					"The note replay key belongs to another command.",
					409,
					"woocommerce_rest_idempotency_conflict",
				);
			return privateNote(result.note);
		},
	};
}
