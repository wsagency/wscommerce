import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	cents,
	currency,
	email,
	idempotencyKey,
	money,
	orderId,
	productId,
	sku,
} from "@otta-sh/domain";
import { collectionOf, type CustomerDoc, type OrderDoc } from "@otta-sh/store-emdash";
import { makeSqliteStorage } from "@otta-sh/store-emdash/testing";
import {
	EmDashWooExternalIdStore,
	EmDashWooMetadataStore,
	WOO_STORAGE_LAYOUT,
	createWooCommerceHandler,
	type ListQuery,
	type MutationContext,
	type WooBackendPort,
} from "@emdash-commerce/compat-woocommerce";
import {
	createInProcessCommerceStores,
	type InProcessCommerceStores,
} from "../src/commerce/in-process-commerce-stores.js";
import { commerceStorageLayout } from "./sandbox/storage-layout.js";
import { createNativeWooBackend } from "../src/integrations/woocommerce-backend.js";
import type { PluginContext } from "../src/types.js";
const EUR = currency("EUR"),
	NOW = "2026-09-30T10:00:00.000Z";
const query: ListQuery = { page: 1, perPage: 10, order: "asc", orderBy: "date" };
const command: MutationContext = {
	principal: { id: "erp", scopes: ["orders:write", "products:write"] },
	idempotencyKey: "woo:erp:request",
};
let db: Awaited<ReturnType<typeof makeSqliteStorage>>,
	stores: InProcessCommerceStores,
	backend: WooBackendPort,
	ids: EmDashWooExternalIdStore,
	metadata: EmDashWooMetadataStore,
	ctx: PluginContext;
beforeAll(async () => {
	db = await makeSqliteStorage({ ...commerceStorageLayout(), ...WOO_STORAGE_LAYOUT });
	ctx = {
		storage: db.storage,
		http: {
			fetch: async () => {
				throw new Error("Native backend may not send HTTP");
			},
		},
		kv: {
			get: async () => null,
			set: async () => {},
			delete: async () => false,
			list: async () => [],
		},
	};
});
afterAll(async () => {
	await db.close();
});
beforeEach(async () => {
	await db.reset();
	let counter = 0;
	stores = createInProcessCommerceStores(ctx, {
		clock: { now: () => new Date(NOW) },
		idGen: { newId: () => `id-${++counter}` },
	});
	ids = new EmDashWooExternalIdStore(collectionOf(db.storage, "woo_ids"));
	metadata = new EmDashWooMetadataStore(collectionOf(db.storage, "woo_metadata"));
	backend = createNativeWooBackend(ctx, ids, metadata, "https://shop.test");
});
async function order(id = "native-order", method = "stripe") {
	return (
		await stores.orderStore.createFromCart({
			orderId: orderId(id),
			cartId: null,
			currency: EUR,
			idempotencyKey: idempotencyKey(`create:${id}`),
			holdExpiresAt: "2026-10-30T10:00:00.000Z",
			buyerRef: "buyer@example.test",
			paymentMethod: method as "stripe",
			lines: [
				{
					productId: productId("native-product"),
					sku: sku("SNAPSHOT-SKU"),
					title: "Frozen title",
					unitPrice: cents(1000),
					currency: EUR,
					quantity: 2,
					fulfillmentKind: "digital",
					reservationId: null,
				},
			],
			totals: {
				subtotal: cents(2000),
				total: cents(2000),
				currency: EUR,
				taxBreakdown: {
					priceTaxMode: "exclusive",
					lines: [
						{
							taxClassId: "zero",
							rateBps: 0,
							netCents: 2000,
							grossCents: 2000,
							subtotalNetCents: 2000,
							taxCents: 0,
							discountedCents: 2000,
						},
					],
					shippingNetCents: 0,
					shippingTaxCents: 0,
					shippingRateBps: 0,
				},
			},
		})
	).order;
}
async function paid(id = "native-order") {
	await order(id);
	await stores.orderStore.recordPayment({
		orderId: orderId(id),
		gateway: "stripe",
		providerRef: `pi:${id}`,
		amount: cents(2000),
		currency: EUR,
		status: "succeeded",
	});
	await stores.orderStore.markPaid(orderId(id));
}
async function orderDoc(id = "native-order") {
	return collectionOf<OrderDoc>(db.storage, "orders").get(id);
}
describe("native Woo backend over migrated SQLite", () => {
	it("projects only the selected order page after complete native filters and totals", async () => {
		await order("current");
		await order("historical");
		const collection = collectionOf<OrderDoc>(db.storage, "orders"),
			historical = (await collection.get("historical"))!;
		await collection.put("historical", {
			...historical,
			createdAt: "2026-09-29T10:00:00.000Z",
			updatedAt: "2026-09-29T10:00:00.000Z",
			totals: { ...historical.totals, tax: cents(500), total: cents(2500), taxBreakdown: null },
		});
		const filtered = await backend.listOrders({ ...query, after: "2026-09-30T00:00:00Z" });
		expect(filtered.total).toBe(1);
		expect(filtered.items.map((item) => item.nativeId)).toEqual(["current"]);
		const first = await backend.listOrders({ ...query, order: "desc", perPage: 1 });
		expect(first.total).toBe(2);
		expect(first.items.map((item) => item.nativeId)).toEqual(["current"]);
		await expect(
			backend.listOrders({ ...query, order: "desc", perPage: 1, page: 2 }),
		).rejects.toMatchObject({ status: 503 });
	});
	it("requires exact succeeded capture before date_paid even when a paid state event exists", async () => {
		await order();
		await stores.orderStore.recordPayment({
			orderId: orderId("native-order"),
			gateway: "stripe",
			providerRef: "partial",
			amount: cents(100),
			currency: EUR,
			status: "succeeded",
		});
		await stores.orderStore.markPaid(orderId("native-order"));
		expect((await backend.getOrder("native-order"))!.paidAt).toBeNull();
		const collection = collectionOf<OrderDoc>(db.storage, "orders"),
			doc = (await collection.get("native-order"))!;
		await collection.put("native-order", { ...doc, payments: [] });
		expect((await backend.getOrder("native-order"))!.paidAt).toBeNull();
	});
	it("returns unavailable customer modification dates honestly and refuses modified filters", async () => {
		const customer = await stores.customerStore.create({ email: email("dated@example.test") });
		expect((await backend.getCustomer(customer.id))!.updatedAt).toBeNull();
		await expect(backend.listCustomers({ ...query, modifiedAfter: NOW })).rejects.toMatchObject({
			status: 400,
		});
	});
	it("preserves CMS description, images and permalink through one read-only batch per page", async () => {
		await stores.productCommerce.upsert(
			{ productId: productId("content"), title: "Cached title" },
			idempotencyKey("content"),
		);
		const captured: string[][] = [];
		const cms = {
			slug: "content-slug",
			permalink: "https://shop.test/products/content-slug",
			description: "<p>CMS details</p>",
			shortDescription: "CMS summary",
			images: [{ src: "https://shop.test/images/item.webp", name: "Item", alt: "Blue item" }],
		};
		const withContent = createNativeWooBackend(ctx, ids, metadata, "https://shop.test", {
			getMany: async (nativeIds) => {
				captured.push([...nativeIds]);
				return { content: cms };
			},
		});
		expect((await withContent.listProducts(query)).items[0]).toMatchObject({
			...cms,
			name: "Cached title",
		});
		expect(captured).toEqual([["content"]]);
		expect(await withContent.getProduct("content")).toMatchObject(cms);
	});
	it("applies common search filters to immutable child resources before total and pagination", async () => {
		await paid();
		await backend.appendNote("native-order", "Invoice attached", command);
		expect((await backend.listNotes("native-order", { ...query, search: "missing" })).total).toBe(
			0,
		);
		await stores.orderStore.recordRefund({
			orderId: orderId("native-order"),
			amount: cents(200),
			currency: EUR,
			kind: "manual",
			gateway: "stripe",
			refundRef: null,
			reason: "Return",
			refundedBy: "merchant",
			idempotencyKey: idempotencyKey("returned"),
		});
		expect((await backend.listRefunds("native-order", { ...query, search: "missing" })).total).toBe(
			0,
		);
		await stores.productCommerce.upsert(
			{ productId: productId("parent") },
			idempotencyKey("parent"),
		);
		await stores.productCommerce.upsertVariant(
			{ productId: productId("parent"), variantKey: "blue", title: "Blue" },
			idempotencyKey("blue"),
		);
		expect((await backend.listVariations("parent", { ...query, search: "missing" })).total).toBe(0);
	});
	it("reads real pending orders and frozen lines without guessing payment evidence", async () => {
		await order();
		await stores.productCommerce.upsert(
			{
				productId: productId("native-product"),
				sku: sku("CHANGED-SKU"),
				title: "Edited title",
				price: money(cents(9000), EUR),
			},
			idempotencyKey("new-catalog"),
		);
		const result = await backend.getOrder("native-order");
		expect(result).toMatchObject({
			nativeId: "native-order",
			state: "pending",
			paidAt: null,
			transactionId: "",
			total: 2000,
			lines: [{ name: "Frozen title", sku: "SNAPSHOT-SKU", unitPrice: 1000, total: 2000 }],
		});
		expect(await backend.getOrder("missing")).toBeNull();
	});
	it("exports capture/event evidence and only finalized refunds", async () => {
		await paid();
		await stores.orderStore.recordRefund({
			orderId: orderId("native-order"),
			amount: cents(200),
			currency: EUR,
			kind: "manual",
			gateway: "stripe",
			refundRef: null,
			reason: "Recorded return",
			refundedBy: "merchant",
			idempotencyKey: idempotencyKey("return"),
		});
		await stores.orderStore.reserveRefund({
			orderId: orderId("native-order"),
			amount: cents(300),
			currency: EUR,
			kind: "gateway",
			gateway: "stripe",
			refundRef: null,
			reason: null,
			refundedBy: "merchant",
			idempotencyKey: idempotencyKey("awaiting-provider"),
		});
		const result = await backend.getOrder("native-order");
		expect(result).toMatchObject({
			paidAt: NOW,
			transactionId: "pi:native-order",
			refunds: [{ amount: 200, paymentRefunded: false }],
		});
		expect((await backend.listRefunds("native-order", query)).total).toBe(1);
		expect(await backend.getRefund("other-order", result!.refunds[0]!.nativeId)).toBeNull();
	});
	it("filters offline on-hold precisely and paginates with stable external IDs", async () => {
		await order("a", "bank_transfer");
		await order("b", "cod");
		await order("c");
		const result = await backend.listOrders({
			...query,
			perPage: 1,
			page: 2,
			statuses: ["on-hold"],
		});
		expect(result.total).toBe(2);
		expect(result.items.map((item) => item.nativeId)).toEqual(["b"]);
		const b = await ids.getOrAssign("order", "b");
		expect(
			(await backend.listOrders({ ...query, include: [b] })).items.map((item) => item.nativeId),
		).toEqual(["b"]);
		expect(
			(await backend.listOrders({ ...query, exclude: [b], search: "SNAPSHOT-SKU" })).total,
		).toBe(2);
	});
	it("honors captured created/modified ranges and linked-customer filters", async () => {
		await order("a");
		await order("b");
		const collection = collectionOf<OrderDoc>(db.storage, "orders");
		const b = (await collection.get("b"))!;
		await collection.put("b", {
			...b,
			createdAt: "2026-09-29T10:00:00.000Z",
			updatedAt: "2026-09-30T11:00:00.000Z",
			customerId: "customer",
		});
		expect(
			(await backend.listOrders({ ...query, after: "2026-09-30T00:00:00Z" })).items.map(
				(item) => item.nativeId,
			),
		).toEqual(["a"]);
		expect(
			(
				await backend.listOrders({
					...query,
					modifiedAfter: "2026-09-30T10:30:00Z",
					customerId: "customer",
				})
			).items.map((item) => item.nativeId),
		).toEqual(["b"]);
	});
	it("keeps unpriced and unknown-stock products nullable and excludes absent/deleted/orphan variants", async () => {
		await stores.productCommerce.upsert(
			{ productId: productId("unpriced"), title: null },
			idempotencyKey("unpriced"),
		);
		await stores.productCommerce.upsert(
			{
				productId: productId("parent"),
				title: "Sizes",
				sku: sku("PARENT"),
				price: money(cents(2000), EUR),
			},
			idempotencyKey("parent"),
		);
		await stores.productCommerce.upsertVariant(
			{ productId: productId("parent"), variantKey: "blue", title: "Blue" },
			idempotencyKey("blue"),
		);
		await stores.productCommerce.upsertVariant(
			{ productId: productId("parent"), variantKey: "old", title: "Old" },
			idempotencyKey("old"),
		);
		await stores.productCommerce.deactivateVariant(
			productId("parent"),
			"old",
			idempotencyKey("orphan"),
			NOW,
		);
		await stores.productCommerce.upsertVariant(
			{ productId: productId("absent"), variantKey: "shell" },
			idempotencyKey("shell"),
		);
		const parent = await backend.getProduct("parent");
		expect(parent).toMatchObject({
			type: "variable",
			stockQuantity: null,
			variationIds: ["parent:blue"],
		});
		expect(await backend.getProduct("unpriced")).toMatchObject({
			name: "",
			price: null,
			stockQuantity: null,
		});
		expect(await backend.getProduct("absent")).toBeNull();
		expect((await backend.listProducts(query)).total).toBe(2);
		expect(
			(await backend.listVariations("parent", query)).items.map((item) => item.nativeId),
		).toEqual(["parent:blue"]);
		expect(await backend.getVariation("parent", "parent:old")).toBeNull();
		expect(await backend.getVariation("other", "parent:blue")).toBeNull();
	});
	it("uses native available stock rather than adding held quantities back", async () => {
		await stores.productCommerce.upsert(
			{ productId: productId("p"), sku: sku("S"), price: money(cents(1234), EUR) },
			idempotencyKey("p"),
		);
		await stores.inventory.seedOnHand("S", 5);
		await stores.inventory.reserve(sku("S"), 2, idempotencyKey("hold"));
		expect(await backend.getProduct("p")).toMatchObject({
			stockQuantity: 3,
			stockStatus: "instock",
		});
		expect((await backend.listProducts({ ...query, sku: "S", stockStatus: "instock" })).total).toBe(
			1,
		);
	});
	it("reads customer identity/default addresses while hiding address-only shells", async () => {
		const customer = await stores.customerStore.create({
			email: email("account@example.test"),
			displayName: "Ana Example",
		});
		await stores.addressStore.create(customer.id, {
			kind: "billing",
			name: "Ana Example",
			line1: "Main 1",
			city: "Zagreb",
			postalCode: "10000",
			country: "HR",
			isDefault: true,
		});
		await stores.addressStore.create("shell" as typeof customer.id, {
			kind: "shipping",
			name: "Guest",
			line1: "Main 2",
			city: "Zagreb",
			postalCode: "10000",
			country: "HR",
		});
		expect(await backend.getCustomer(customer.id)).toMatchObject({
			email: "account@example.test",
			firstName: "Ana",
			lastName: "Example",
			billing: { address_1: "Main 1" },
		});
		expect((await backend.listCustomers({ ...query, email: "ACCOUNT@example.test" })).total).toBe(
			1,
		);
		expect(await backend.getCustomer("shell")).toBeNull();
	});
	it("applies metadata by CAS with replay and rejects mixed patches before any write", async () => {
		await order();
		const patch = { metadata: [{ key: "erp_invoice", value: "ERP-1" }] };
		const first = await backend.applyOrderPatch("native-order", patch, command);
		const replay = await backend.applyOrderPatch("native-order", patch, command);
		expect(replay.metadata).toEqual(first.metadata);
		await expect(
			backend.applyOrderPatch(
				"native-order",
				{ metadata: [{ key: "erp_invoice", value: "ERP-2" }], status: "processing" },
				{ ...command, idempotencyKey: "mixed" },
			),
		).rejects.toMatchObject({ status: 400 });
		expect((await backend.getOrder("native-order"))!.metadata).toEqual(first.metadata);
		expect((await orderDoc())!.state).toBe("pending");
		await expect(
			backend.applyOrderPatch(
				"native-order",
				{ metadata: [{ id: 999, key: "erp_invoice", value: "ERP-2" }] },
				{ ...command, idempotencyKey: "stale" },
			),
		).rejects.toMatchObject({ status: 409 });
		expect((await orderDoc())!.payments).toEqual([]);
	});
	it("cannot move unpaid to processing/completed, but delegates paid completion/cancellation to native guards", async () => {
		await order();
		await expect(
			backend.applyOrderPatch("native-order", { status: "processing" }, command),
		).rejects.toMatchObject({ status: 409 });
		await expect(
			backend.applyOrderPatch("native-order", { status: "completed" }, command),
		).rejects.toMatchObject({ status: 409 });
		expect((await orderDoc())!.payments).toEqual([]);
		await paid("paid-order");
		const completed = await backend.applyOrderPatch(
			"paid-order",
			{ status: "completed" },
			{ ...command, idempotencyKey: "complete" },
		);
		expect(completed.state).toBe("completed");
		expect(completed.completedAt).not.toBeNull();
		const cancelled = await backend.applyOrderPatch(
			"native-order",
			{ status: "cancelled" },
			{ ...command, idempotencyKey: "cancel" },
		);
		expect(cancelled.state).toBe("cancelled");
		expect((await orderDoc())!.cancellation).toMatchObject({ reason: "other", cancelledBy: "erp" });
	});
	it("appends private notes once, rejects changed replay and cannot leak to another parent", async () => {
		await order();
		await order("other");
		const first = await backend.appendNote("native-order", "ERP invoice attached", command);
		expect(await backend.appendNote("native-order", "ERP invoice attached", command)).toEqual(
			first,
		);
		await expect(backend.appendNote("native-order", "Changed", command)).rejects.toMatchObject({
			status: 409,
		});
		expect((await backend.listNotes("native-order", query)).total).toBe(1);
		expect(await backend.getNote("other", first.nativeId)).toBeNull();
		expect(first.customerNote).toBe(false);
	});
	it("refuses historical tax without frozen proof before metadata mutation", async () => {
		await order();
		const collection = collectionOf<OrderDoc>(db.storage, "orders"),
			doc = (await collection.get("native-order"))!;
		await collection.put("native-order", {
			...doc,
			totals: { ...doc.totals, tax: cents(500), total: cents(2500) },
		});
		await expect(
			backend.applyOrderPatch(
				"native-order",
				{ metadata: [{ key: "erp_invoice", value: "bad" }] },
				command,
			),
		).rejects.toMatchObject({ status: 503 });
		expect(await metadata.get("order:native-order")).toEqual([]);
	});
	it("sets native available stock atomically while preserving holds and old replay outcomes", async () => {
		await stores.productCommerce.upsert(
			{ productId: productId("p"), sku: sku("S"), price: money(cents(1234), EUR) },
			idempotencyKey("p"),
		);
		await stores.inventory.seedOnHand("S", 5);
		const held = await stores.inventory.reserve(sku("S"), 2, idempotencyKey("hold"));
		expect(held.ok).toBe(true);
		const first = await backend.applyStockUpdate("p", { stockQuantity: 0 }, command);
		expect(first).toMatchObject({ stockQuantity: 0, stockStatus: "outofstock" });
		await stores.inventory.restock("S", 4, idempotencyKey("new-stock"));
		expect(await backend.applyStockUpdate("p", { stockQuantity: 0 }, command)).toMatchObject({
			stockQuantity: 0,
		});
		expect(await stores.inventory.getOnHand("S")).toBe(4);
		await expect(
			backend.applyStockUpdate("p", { stockQuantity: 10 }, command),
		).rejects.toMatchObject({
			status: 409,
		});
		if (held.ok) await stores.inventory.release(held.reservationId);
		expect(await stores.inventory.getOnHand("S")).toBe(6);
	});
	it("rejects absent stock and invalid targets without seeding inventory", async () => {
		await stores.productCommerce.upsert(
			{ productId: productId("unseeded"), sku: sku("NO-STOCK") },
			idempotencyKey("unseeded"),
		);
		await stores.productCommerce.upsert(
			{ productId: productId("unmanaged") },
			idempotencyKey("unmanaged"),
		);
		await expect(
			backend.applyStockUpdate("unseeded", { stockQuantity: 5 }, command),
		).rejects.toMatchObject({ status: 404 });
		await expect(
			backend.applyStockUpdate("unmanaged", { stockQuantity: 5 }, command),
		).rejects.toMatchObject({ status: 501 });
		await expect(
			backend.applyStockUpdate("missing", { stockQuantity: 5 }, command),
		).rejects.toMatchObject({ status: 404 });
		await expect(
			backend.applyStockUpdate("unseeded", { stockQuantity: -1 }, command),
		).rejects.toMatchObject({ status: 400 });
		expect(await stores.inventory.findOnHand("NO-STOCK")).toBeNull();
	});
	it("accepts headerless variation stock targets and binds the exact native parent", async () => {
		await stores.productCommerce.upsert(
			{ productId: productId("parent") },
			idempotencyKey("parent"),
		);
		await stores.productCommerce.upsert({ productId: productId("other") }, idempotencyKey("other"));
		const variant = await stores.productCommerce.upsertVariant(
			{ productId: productId("parent"), variantKey: "blue:large" },
			idempotencyKey("blue"),
		);
		expect(
			(
				await stores.productCommerce.updateVariantFields(
					{ productId: productId("parent"), variantKey: "blue:large", sku: sku("BLUE") },
					idempotencyKey("price-blue"),
					variant.updatedAt.toISOString(),
				)
			).ok,
		).toBe(true);
		await stores.inventory.seedOnHand("BLUE", 8);
		const parent = await ids.getOrAssign("product", "parent"),
			other = await ids.getOrAssign("product", "other"),
			variation = await ids.getOrAssign("variation", "parent:blue:large");
		const handler = createWooCommerceHandler({
			backend,
			ids,
			authenticate: { authenticate: async () => command.principal },
			currencyDecimals: { EUR: 2 },
		});
		const update = (parentId: number) =>
			handler(
				new Request(
					`https://shop.test/wp-json/wc/v3/products/${parentId}/variations/${variation}`,
					{
						method: "PUT",
						headers: {
							Authorization: `Basic ${btoa("ck_" + "a".repeat(40) + ":cs_" + "b".repeat(40))}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ stock_quantity: 3 }),
					},
				),
			);
		const first = await update(parent);
		expect(first.status).toBe(200);
		expect(await first.json()).toMatchObject({ id: variation, stock_quantity: 3 });
		await stores.inventory.restock("BLUE", 2, idempotencyKey("new-stock"));
		expect((await update(parent)).status).toBe(200);
		expect(await stores.inventory.getOnHand("BLUE")).toBe(3);
		expect((await update(other)).status).toBe(404);
		expect(await stores.inventory.getOnHand("BLUE")).toBe(3);
		await stores.productCommerce.deactivateVariant(
			productId("parent"),
			"blue:large",
			idempotencyKey("orphan"),
			NOW,
		);
		expect((await update(parent)).status).toBe(404);
		expect(await stores.inventory.getOnHand("BLUE")).toBe(3);
	});
	it("applies headerless metadata ABA requests as new commands while explicit keys replay", async () => {
		await order();
		const numeric = await ids.getOrAssign("order", "native-order");
		const handler = createWooCommerceHandler({
			backend,
			ids,
			authenticate: { authenticate: async () => command.principal },
			currencyDecimals: { EUR: 2 },
		});
		const write = (value: string, key?: string) =>
			handler(
				new Request(`https://shop.test/wp-json/wc/v3/orders/${numeric}`, {
					method: "PUT",
					headers: {
						Authorization: `Basic ${btoa("ck_" + "a".repeat(40) + ":cs_" + "b".repeat(40))}`,
						"Content-Type": "application/json",
						...(key ? { "Idempotency-Key": key } : {}),
					},
					body: JSON.stringify({ meta_data: [{ key: "erp_invoice", value }] }),
				}),
			);
		for (const value of ["A", "B", "A"]) {
			expect((await write(value)).status).toBe(200);
			expect((await metadata.get("order:native-order"))[0]!.value).toBe(value);
		}
		expect((await write("explicit", "same-command")).status).toBe(200);
		expect((await write("newer")).status).toBe(200);
		expect((await write("explicit", "same-command")).status).toBe(200);
		expect((await metadata.get("order:native-order"))[0]!.value).toBe("newer");
	});
	it("applies headerless absolute stock ABA requests without mistaking a new target for an old retry", async () => {
		await stores.productCommerce.upsert(
			{ productId: productId("p"), sku: sku("S") },
			idempotencyKey("p"),
		);
		await stores.inventory.seedOnHand("S", 1);
		const numeric = await ids.getOrAssign("product", "p");
		const handler = createWooCommerceHandler({
			backend,
			ids,
			authenticate: { authenticate: async () => command.principal },
			currencyDecimals: { EUR: 2 },
		});
		for (const quantity of [7, 8, 7]) {
			const response = await handler(
				new Request(`https://shop.test/wp-json/wc/v3/products/${numeric}`, {
					method: "PUT",
					headers: {
						Authorization: `Basic ${btoa("ck_" + "a".repeat(40) + ":cs_" + "b".repeat(40))}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ stock_quantity: quantity }),
				}),
			);
			expect(response.status).toBe(200);
			expect(await stores.inventory.getOnHand("S")).toBe(quantity);
		}
	});
	it("returns actual HTTP pagination headers and accepts headerless vendor metadata", async () => {
		await order("a");
		await order("b");
		const handler = createWooCommerceHandler({
			backend,
			ids,
			authenticate: {
				authenticate: async () => ({ id: "erp", scopes: ["orders:read", "orders:write"] }),
			},
			currencyDecimals: { EUR: 2 },
		});
		const headers = {
			Authorization: `Basic ${btoa("ck_" + "a".repeat(40) + ":cs_" + "b".repeat(40))}`,
			"Content-Type": "application/json",
		};
		const response = await handler(
			new Request("https://shop.test/wp-json/wc/v3/orders?per_page=1&page=2", { headers }),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("X-WP-Total")).toBe("2");
		expect(response.headers.get("X-WP-TotalPages")).toBe("2");
		const numeric = await ids.getOrAssign("order", "b");
		const update = () =>
			handler(
				new Request(`https://shop.test/wp-json/wc/v3/orders/${numeric}`, {
					method: "PUT",
					headers,
					body: JSON.stringify({ meta_data: [{ key: "erp_invoice", value: "ERP-2" }] }),
				}),
			);
		expect((await update()).status).toBe(200);
		expect((await update()).status).toBe(200);
		expect((await backend.getOrder("b"))!.metadata).toHaveLength(1);
	});
	it("fails loudly above the bounded scan ceiling instead of returning a partial customer list", async () => {
		const collection = collectionOf<CustomerDoc>(db.storage, "customers");
		for (let i = 0; i < 10001; i++)
			await collection.put(`c${i}`, {
				customerId: `c${i}`,
				email: email(`c${i}@example.test`),
				emailLower: `c${i}@example.test`,
				displayName: null,
				emailVerifiedAt: null,
				createdAt: NOW,
				addresses: [],
			});
		await expect(backend.listCustomers(query)).rejects.toMatchObject({ status: 503 });
	}, 30000);
});
