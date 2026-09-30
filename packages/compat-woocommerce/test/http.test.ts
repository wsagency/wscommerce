import { describe, expect, it } from "vitest";
import { cents, currency } from "@otta-sh/domain";
import { createWooCommerceHandler } from "../src/index.js";
import type { WooBackendPort, WooOrderSnapshot, WooHandlerOptions } from "../src/index.js";

const KEY = `ck_${"a".repeat(40)}`;
const SECRET = `cs_${"b".repeat(40)}`;
const order: WooOrderSnapshot = {
	nativeId: "order-uuid",
	number: "A-001",
	state: "paid",
	currency: currency("EUR"),
	createdAt: "2026-09-30T08:00:00Z",
	updatedAt: "2026-09-30T08:00:00Z",
	paidAt: "2026-09-30T08:00:01Z",
	completedAt: null,
	customerId: null,
	billing: null,
	shipping: null,
	paymentMethod: "stripe",
	paymentMethodTitle: "Card",
	transactionId: "pi_test",
	customerNote: "",
	pricesIncludeTax: false,
	discountTotal: cents(0),
	discountTax: cents(0),
	shippingTotal: cents(0),
	shippingTax: cents(0),
	cartTax: cents(500),
	total: cents(2500),
	totalTax: cents(500),
	lines: [
		{
			nativeId: "line-1",
			productId: "product-uuid",
			variationId: "variation-uuid",
			name: "Snapshot title",
			sku: "BOOK-RED",
			quantity: 2,
			subtotal: cents(2000),
			subtotalTax: cents(500),
			total: cents(2000),
			totalTax: cents(500),
			unitPrice: cents(1000),
			taxes: [{ nativeTaxId: "standard", total: cents(500), subtotal: cents(500) }],
		},
	],
	shippingLines: [],
	taxLines: [
		{
			nativeId: "standard",
			code: "VAT-25",
			label: "VAT",
			compound: false,
			total: cents(500),
			shippingTotal: cents(0),
			ratePercent: "25.0000",
		},
	],
	refunds: [],
	metadata: [],
};
const emptyPage = async () => ({ items: [], total: 0 });
const noEntity = async () => null;
const backend: WooBackendPort = {
	listOrders: async () => ({ items: [order], total: 1 }),
	getOrder: async (id) => (id === order.nativeId ? order : null),
	listProducts: emptyPage,
	getProduct: noEntity,
	listVariations: emptyPage,
	getVariation: noEntity,
	listCustomers: emptyPage,
	getCustomer: noEntity,
	listNotes: emptyPage,
	getNote: noEntity,
	listRefunds: emptyPage,
	getRefund: noEntity,
	applyOrderPatch: async () => {
		throw new Error("A rejected write reached the backend");
	},
	applyStockUpdate: async () => {
		throw new Error("A rejected write reached the backend");
	},
	appendNote: async () => {
		throw new Error("A rejected write reached the backend");
	},
};
// Pure HTTP port tests; persistence/CAS is exercised separately with migrated SQLite.
function handler(scopes: string[] = ["orders:read"], overrides: Partial<WooHandlerOptions> = {}) {
	return createWooCommerceHandler({
		backend,
		ids: {
			getOrAssign: async (kind, id) => (kind === "order" && id === "order-uuid" ? 42 : 99),
			lookup: async (kind, id) => (kind === "order" && id === 42 ? order.nativeId : null),
		},
		authenticate: {
			authenticate: async (key, secret) =>
				key === KEY && secret === SECRET ? { id: "erp", scopes: scopes as never } : null,
		},
		currencyDecimals: { EUR: 2, JPY: 0, KWD: 3 },
		...overrides,
	});
}
function request(path = "orders", init: RequestInit = {}, scheme = "https") {
	const headers = new Headers(init.headers);
	headers.set("Authorization", `Basic ${btoa(`${KEY}:${SECRET}`)}`);
	return new Request(`${scheme}://shop.example/wp-json/wc/v3/${path}`, { ...init, headers });
}

describe("Woo REST v3 accounting HTTP contract", () => {
	it("requires Basic consumer-key authentication without disclosing credentials", async () => {
		const res = await handler()(new Request("https://shop.example/wp-json/wc/v3/orders"));
		expect(res.status).toBe(401);
		expect(await res.json()).toMatchObject({
			code: "woocommerce_rest_authentication_error",
			data: { status: 401 },
		});
		expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
	});
	it("rejects plaintext transport and query-string credentials", async () => {
		expect((await handler()(request("orders", {}, "http"))).status).toBe(403);
		expect(
			(
				await handler()(
					new Request(
						`https://shop.example/wp-json/wc/v3/orders?consumer_key=${KEY}&consumer_secret=${SECRET}`,
					),
				)
			).status,
		).toBe(401);
	});
	it("enforces the resource read scope", async () => {
		expect((await handler(["products:read"])(request())).status).toBe(403);
	});
	it("maps a frozen paid order, exact decimal strings and persistent numeric references", async () => {
		const res = await handler()(request("orders/42"));
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			id: 42,
			number: "A-001",
			status: "processing",
			currency: "EUR",
			total: "25.00",
			total_tax: "5.00",
			payment_method: "stripe",
			transaction_id: "pi_test",
			line_items: [
				{
					name: "Snapshot title",
					sku: "BOOK-RED",
					product_id: 99,
					variation_id: 99,
					quantity: 2,
					subtotal: "20.00",
					total: "20.00",
					total_tax: "5.00",
				},
			],
		});
	});
	it("returns pagination headers and credential-free navigation links", async () => {
		const res = await handler()(request("orders?per_page=1&page=1"));
		expect(res.status).toBe(200);
		expect(res.headers.get("X-WP-Total")).toBe("1");
		expect(res.headers.get("X-WP-TotalPages")).toBe("1");
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		expect(await res.json()).toHaveLength(1);
	});
	it("rejects unsupported query filters instead of silently ignoring them", async () => {
		const res = await handler()(request("orders?customer=bogus&made_up=1"));
		expect(res.status).toBe(400);
	});
	it("rejects unsupported financial mutation before entering native commands", async () => {
		const res = await handler(["orders:write"])(
			request("orders/42", {
				method: "PUT",
				headers: { "Content-Type": "application/json", "Idempotency-Key": "erp:1" },
				body: JSON.stringify({
					meta_data: [{ key: "invoice_number", value: "001" }],
					set_paid: true,
				}),
			}),
		);
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ code: "woocommerce_rest_unsupported_field" });
	});
	it("rejects attempts to invent payment, refund or fulfillment proof via status", async () => {
		for (const status of ["paid", "refunded", "on-hold", "pending"]) {
			const res = await handler(["orders:write"])(
				request("orders/42", {
					method: "PUT",
					headers: { "Content-Type": "application/json", "Idempotency-Key": "erp:1" },
					body: JSON.stringify({ status }),
				}),
			);
			expect(res.status).toBe(400);
		}
	});
	it("rejects prototype and native-reserved metadata keys", async () => {
		for (const key of ["__proto__", "constructor", "_emdash_payment", "_otta_settlement"]) {
			const res = await handler(["orders:write"])(
				request("orders/42", {
					method: "PUT",
					headers: { "Content-Type": "application/json", "Idempotency-Key": "erp:1" },
					body: JSON.stringify({ meta_data: [{ key, value: "bad" }] }),
				}),
			);
			expect(res.status).toBe(400);
		}
	});
	it("has explicit unsupported routes, writes and discovery", async () => {
		expect((await handler()(request("reports"))).status).toBe(404);
		expect(
			(await handler(["orders:write"])(request("orders", { method: "POST", body: "{}" }))).status,
		).toBe(405);
		const res = await handler()(new Request("https://shop.example/wp-json"));
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			namespaces: ["wc/v3"],
			emdash_commerce: { profile: "accounting-v1", wordpress_runtime: false },
		});
	});
});

describe("standard ERP metadata writes", () => {
	it("gives headerless PUT fresh command identities and preserves explicit durable replay keys", async () => {
		const keys: string[] = [];
		const writeBackend = {
			...backend,
			applyOrderPatch: async (
				_id: string,
				patch: import("../src/index.js").GuardedOrderPatch,
				context: import("../src/index.js").MutationContext,
			) => {
				keys.push(context.idempotencyKey);
				return {
					...order,
					metadata: patch.metadata!.map((entry, index) => ({ ...entry, id: index + 1 })),
				};
			},
		};
		const process = handler(["orders:write"], { backend: writeBackend });
		const write = (body: string, key?: string) =>
			process(
				request("orders/42", {
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						...(key ? { "Idempotency-Key": key } : {}),
					},
					body,
				}),
			);
		expect((await write('{"meta_data":[{"key":"invoice_number","value":"001"}]}')).status).toBe(
			200,
		);
		expect((await write('{"meta_data":[{"value":"001","key":"invoice_number"}]}')).status).toBe(
			200,
		);
		expect(keys).toHaveLength(2);
		expect(keys[0]).not.toBe(keys[1]);
		expect(keys[0]).toMatch(/^woo:erp:auto:[a-f0-9-]{36}$/);
		for (let retry = 0; retry < 2; retry++)
			expect(
				(await write('{"meta_data":[{"key":"invoice_number","value":"001"}]}', "stable-command"))
					.status,
			).toBe(200);
		expect(keys[2]).toBe(keys[3]);
		expect((await write('{"status":"completed"}')).status).toBe(400);
	});
});

describe("remaining profile resources and validation", () => {
	it("maps product/variation/customer/refund/note fields and refuses cross-parent children", async () => {
		const product: import("../src/index.js").WooProductSnapshot = {
			nativeId: "product",
			name: "Book",
			slug: "book",
			permalink: "https://shop.example/book",
			type: "variable",
			status: "publish",
			description: "",
			shortDescription: "",
			sku: "BOOK",
			price: { amount: cents(1001), currency: currency("KWD") },
			regularPrice: { amount: cents(1001), currency: currency("KWD") },
			salePrice: null,
			virtual: false,
			downloadable: false,
			taxStatus: "taxable",
			taxClass: "standard",
			manageStock: true,
			stockQuantity: 3,
			stockStatus: "instock",
			createdAt: order.createdAt,
			updatedAt: order.updatedAt,
			variationIds: ["variation"],
			attributes: [],
			images: [],
			metadata: [],
		};
		const variation = {
			...product,
			nativeId: "variation",
			parentId: "product",
			type: "variation" as const,
			variationIds: [],
		};
		const profile = {
			...backend,
			getProduct: async () => product,
			getVariation: async () => variation,
			getCustomer: async () => ({
				nativeId: "customer",
				email: "buyer@example.invalid",
				firstName: "Buyer",
				lastName: "Test",
				username: "buyer",
				createdAt: order.createdAt,
				updatedAt: order.updatedAt,
				billing: null,
				shipping: null,
				metadata: [],
			}),
			getRefund: async () => ({
				nativeId: "refund",
				orderId: order.nativeId,
				currency: currency("EUR"),
				amount: cents(500),
				reason: "Returned",
				createdAt: order.createdAt,
				paymentRefunded: true,
				metadata: [],
			}),
			getNote: async () => ({
				nativeId: "note",
				orderId: order.nativeId,
				note: "Invoice linked",
				author: "ERP",
				createdAt: order.createdAt,
				customerNote: false,
			}),
		};
		const ids = {
			getOrAssign: async () => 99,
			lookup: async (kind: import("../src/index.js").ExternalEntityKind) =>
				({
					product: "product",
					variation: "variation",
					customer: "customer",
					refund: "refund",
					note: "note",
					order: order.nativeId,
					line: "line",
					tax: "tax",
					shipping: "shipping",
				})[kind],
		};
		const process = handler(["orders:read", "products:read", "customers:read"], {
			backend: profile,
			ids,
		});
		expect(await (await process(request("products/99"))).json()).toMatchObject({
			type: "variable",
			price: "1.001",
			stock_quantity: 3,
			variations: [99],
		});
		expect(await (await process(request("products/99/variations/99"))).json()).toMatchObject({
			type: "variation",
			parent_id: 99,
		});
		expect(await (await process(request("customers/99"))).json()).toMatchObject({
			email: "buyer@example.invalid",
			role: "customer",
		});
		expect(await (await process(request("orders/99/refunds/99"))).json()).toMatchObject({
			amount: "5.00",
			refunded_payment: true,
		});
		expect(await (await process(request("orders/99/notes/99"))).json()).toMatchObject({
			note: "Invoice linked",
			customer_note: false,
		});
		const foreign = handler(["orders:read"], {
			backend: {
				...profile,
				getNote: async () => ({ ...(await profile.getNote()), orderId: "foreign-order" }),
			},
			ids,
		});
		expect((await foreign(request("orders/99/notes/99"))).status).toBe(404);
		let stockWrites = 0;
		const foreignStock = handler(["products:write"], {
			backend: {
				...profile,
				getVariation: async () => ({ ...variation, parentId: "foreign-product" }),
				applyStockUpdate: async () => {
					stockWrites++;
					return variation;
				},
			},
			ids,
		});
		expect(
			(
				await foreignStock(
					request("products/99/variations/99", {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ stock_quantity: 4 }),
					}),
				)
			).status,
		).toBe(404);
		expect(stockWrites).toBe(0);
	});
	it("rejects a corrupt native financial projection and malformed pagination", async () => {
		const process = handler(["orders:read"], {
			backend: { ...backend, getOrder: async () => ({ ...order, total: cents(2501) }) },
		});
		expect((await process(request("orders/42"))).status).toBe(503);
		for (const query of ["page=0", "per_page=101", "page=1&page=2", "after=not-a-date"]) {
			expect((await handler()(request(`orders?${query}`))).status).toBe(400);
		}
	});
	it("forwards valid filters, pagination and navigation without credentials", async () => {
		const profile = {
			...backend,
			listOrders: async (query: import("../src/index.js").ListQuery) => ({
				items: query.statuses?.includes("processing") && query.page === 2 ? [order] : [],
				total: 3,
			}),
		};
		const res = await handler(["orders:read"], { backend: profile })(
			request("orders?status=processing&page=2&per_page=1&after=2026-09-01T00:00:00"),
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("X-WP-TotalPages")).toBe("3");
		expect(res.headers.get("Link")).toContain('rel="prev"');
		expect(res.headers.get("Link")).toContain('rel="next"');
		expect(res.headers.get("Link")).not.toContain(KEY);
		expect(await res.json()).toHaveLength(1);
	});
});
