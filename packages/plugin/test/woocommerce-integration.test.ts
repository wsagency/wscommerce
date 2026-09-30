import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cents, currency, idempotencyKey, orderId, productId, sku } from "@otta-sh/domain";
import {
	EmDashWooMetadataStore,
	verifyWooWebhook,
	type WooMetadataDocument,
} from "@emdash-commerce/compat-woocommerce";
import type { StorageCollection } from "@otta-sh/store-emdash";
import {
	makeInProcessCommerce,
	type InProcessCommerceHarness,
} from "./helpers/in-process-commerce.js";
import {
	runWooWebhookSweep,
	withWooCommerceIntegrations,
	wooConfigurationFromBindings,
} from "../src/integrations/woocommerce.js";

const consumerKey = `ck_${"a".repeat(40)}`;
const consumerSecret = `cs_${"b".repeat(40)}`;
const configuration = {
	origin: "https://shop.test",
	consumerKey,
	consumerSecret,
	scopes: ["orders:read"] as const,
	webhook: {
		url: "https://accounting.test/hook?token=test-only",
		secret: "test-webhook-secret",
		id: 1,
	},
};
describe("mounted Woo REST and durable order webhooks", () => {
	let harness: InProcessCommerceHarness;
	beforeAll(async () => {
		harness = await makeInProcessCommerce();
	});
	beforeEach(async () => harness.reset());
	afterEach(() => vi.restoreAllMocks());
	afterAll(async () => harness.close());
	async function seed() {
		await harness.stores.orderStore.createFromCart({
			orderId: orderId("woo-order"),
			cartId: null,
			currency: currency("EUR"),
			idempotencyKey: idempotencyKey("woo-checkout"),
			holdExpiresAt: "2099-01-01T00:00:00.000Z",
			buyerRef: "buyer@example.test",
			paymentMethod: "bank_transfer",
			lines: [
				{
					productId: productId("book"),
					sku: sku("BOOK"),
					title: "Book",
					unitPrice: cents(1500),
					currency: currency("EUR"),
					quantity: 1,
					fulfillmentKind: "digital",
					reservationId: null,
				},
			],
			totals: {
				subtotal: cents(1500),
				total: cents(1500),
				currency: currency("EUR"),
				taxBreakdown: {
					priceTaxMode: "exclusive",
					lines: [
						{
							discountedCents: 1500,
							netCents: 1500,
							grossCents: 1500,
							subtotalNetCents: 1500,
							taxCents: 0,
							rateBps: 0,
						},
					],
					shippingTaxCents: 0,
					shippingNetCents: 0,
					shippingRateBps: 0,
				},
			},
		});
	}
	it("requires explicit scopes and valid server-only key pairs", () => {
		expect(wooConfigurationFromBindings({})).toBeNull();
		expect(() => wooConfigurationFromBindings({ WOO_CONSUMER_KEY: consumerKey })).toThrow();
		expect(() =>
			wooConfigurationFromBindings({
				WOO_CONSUMER_KEY: consumerKey,
				WOO_CONSUMER_SECRET: consumerSecret,
				COMMERCE_PUBLIC_URL: "http://shop.test",
				WOO_SCOPES: "orders:read",
			}),
		).toThrow();
		expect(
			wooConfigurationFromBindings({
				WOO_CONSUMER_KEY: consumerKey,
				WOO_CONSUMER_SECRET: consumerSecret,
				COMMERCE_PUBLIC_URL: "https://shop.test",
				WOO_SCOPES: "orders:read,products:read",
			}),
		).toMatchObject({ origin: "https://shop.test", scopes: ["orders:read", "products:read"] });
	});
	it("preserves Basic credentials through the public host bridge and gates writes itself", async () => {
		await seed();
		const plugin = withWooCommerceIntegrations({ routes: {} }, async () => configuration);
		const route = plugin.routes!["woocommerce/http"]!;
		if (typeof route === "function") throw new Error("public route declaration required");
		expect(route.public).toBe(true);
		const call = (
			headers: Record<string, string>,
			method = "GET",
			path = "/orders",
			body?: string,
		) =>
			route.handler(
				{
					input: {
						url: `https://shop.test/wp-json/wc/v3${path}`,
						method,
						headers,
						...(body ? { body } : {}),
					},
					request: {
						url: "https://shop.test/_emdash/api/plugins/otta/woocommerce/http",
						method: "POST",
						headers: {},
					},
				},
				harness.ctx,
			) as Promise<{ status: number; body: string; headers: Record<string, string> }>;
		expect((await call({})).status).toBe(401);
		const headers = {
			authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}`,
			"content-type": "application/json",
		};
		const list = await call(headers);
		expect(list.status).toBe(200);
		expect(list.headers["x-wp-total"]).toBe("1");
		const id = JSON.parse(list.body)[0].id;
		expect(
			(
				await call(
					headers,
					"PUT",
					`/orders/${id}`,
					JSON.stringify({ meta_data: [{ key: "invoice_id", value: "42" }] }),
				)
			).status,
		).toBe(403);
		expect(await harness.ctx.storage!.woo_metadata!.count()).toBe(0);
	});
	it("persists exact signed bytes across a failed delivery and a fresh worker", async () => {
		await seed();
		const deliveries: Array<{ body: Uint8Array; headers: Headers; url: string }> = [];
		let status = 503;
		const ctx = {
			...harness.ctx,
			http: {
				fetch: async (url: string, init?: RequestInit) => {
					deliveries.push({
						url,
						body: new Uint8Array(init?.body as Uint8Array),
						headers: new Headers(init?.headers),
					});
					expect(init?.redirect).toBe("manual");
					return new Response(null, { status });
				},
			},
		};
		expect(
			await runWooWebhookSweep(ctx, configuration, { now: "2026-09-30T10:00:00.000Z" }),
		).toMatchObject({ enqueued: 1, retryable: 1 });
		status = 200;
		expect(
			await runWooWebhookSweep(ctx, configuration, { now: "2026-09-30T10:00:02.000Z" }),
		).toMatchObject({ enqueued: 0, delivered: 1 });
		expect(deliveries).toHaveLength(2);
		expect(deliveries[0]!.body).toEqual(deliveries[1]!.body);
		expect(
			await verifyWooWebhook(
				deliveries[1]!.body,
				deliveries[1]!.headers.get("X-WC-Webhook-Signature")!,
				configuration.webhook.secret,
			),
		).toBe(true);
		expect(deliveries[1]!.headers.get("X-WC-Webhook-Topic")).toBe("order.created");
		expect(JSON.parse(new TextDecoder().decode(deliveries[1]!.body))).toMatchObject({
			status: "on-hold",
			date_paid: null,
			total: "15.00",
		});
		await runWooWebhookSweep(ctx, configuration, { now: "2026-09-30T10:00:03.000Z" });
		expect(deliveries).toHaveLength(2);
	});
	it("resumes prepared bytes after a producer crashes before enqueue, despite a later order change", async () => {
		await seed();
		const bodies: Uint8Array[] = [];
		const ctx = {
			...harness.ctx,
			http: {
				fetch: async (_url: string, init?: RequestInit) => {
					bodies.push(new Uint8Array(init?.body as ArrayBuffer));
					return new Response(null, { status: 200 });
				},
			},
		};
		vi.spyOn(ctx.storage!.woo_webhooks!, "compareAndSet").mockRejectedValueOnce(
			new Error("worker interrupted"),
		);
		expect(await runWooWebhookSweep(ctx, configuration)).toMatchObject({ enqueued: 0, blocked: 1 });
		const cursor = (await ctx.storage!.commerce_integration_cursors!.get(
			"woo-order:woo-order",
		)) as { prepared: { bodyBase64: string } };
		const prepared = Uint8Array.from(atob(cursor.prepared.bodyBase64), (c) => c.charCodeAt(0));
		const metadata = new EmDashWooMetadataStore(
			ctx.storage!.woo_metadata! as StorageCollection<WooMetadataDocument>,
		);
		await metadata.patch(
			"order:woo-order",
			[{ key: "accounting_reference", value: "later" }],
			"later-edit",
		);
		expect(await runWooWebhookSweep(ctx, configuration)).toMatchObject({
			enqueued: 1,
			delivered: 1,
		});
		expect(bodies).toEqual([prepared]);
		expect(await runWooWebhookSweep(ctx, configuration)).toMatchObject({
			enqueued: 1,
			delivered: 1,
		});
		expect(bodies).toHaveLength(2);
		expect(JSON.parse(new TextDecoder().decode(bodies[1]))).toMatchObject({
			meta_data: [{ key: "accounting_reference", value: "later" }],
		});
	});
	it("replays enqueue after a checkpoint crash without repeating an already delivered message", async () => {
		await seed();
		let delivered = 0;
		const ctx = {
			...harness.ctx,
			http: {
				fetch: async () => {
					delivered++;
					return new Response(null, { status: 200 });
				},
			},
		};
		const cursors = ctx.storage!.commerce_integration_cursors!;
		const compareAndSet = cursors.compareAndSet.bind(cursors);
		let interrupted = false;
		vi.spyOn(cursors, "compareAndSet").mockImplementation(async (key, revision, value) => {
			if (
				key === "woo-order:woo-order" &&
				(value as { prepared?: unknown }).prepared === null &&
				!interrupted
			) {
				interrupted = true;
				throw new Error("worker interrupted after enqueue");
			}
			return compareAndSet(key, revision, value);
		});
		expect(await runWooWebhookSweep(ctx, configuration)).toMatchObject({
			blocked: 1,
			delivered: 1,
		});
		expect(await runWooWebhookSweep(ctx, configuration)).toMatchObject({
			enqueued: 1,
			delivered: 0,
		});
		expect(delivered).toBe(1);
		expect(await ctx.storage!.woo_webhooks!.count()).toBe(1);
	});
	it("CAS fences concurrent producers that both read an absent per-order cursor", async () => {
		await seed();
		let delivered = 0;
		const ctx = {
			...harness.ctx,
			http: {
				fetch: async () => {
					delivered++;
					return new Response(null, { status: 200 });
				},
			},
		};
		const cursors = ctx.storage!.commerce_integration_cursors!;
		const getVersioned = cursors.getVersioned.bind(cursors);
		let release!: () => void;
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		let reads = 0;
		vi.spyOn(cursors, "getVersioned").mockImplementation(async (key) => {
			const value = await getVersioned(key);
			if (key === "woo-order:woo-order" && value === null && reads < 2) {
				reads++;
				if (reads === 2) release();
				await barrier;
			}
			return value;
		});
		const results = await Promise.all([
			runWooWebhookSweep(ctx, configuration),
			runWooWebhookSweep(ctx, configuration),
		]);
		expect(results.reduce((count, result) => count + result.enqueued, 0)).toBe(1);
		expect(delivered).toBe(1);
		expect(await ctx.storage!.woo_webhooks!.count()).toBe(1);
	});
	it("assigns a new delivery identity when an exported value changes and later returns to its first value", async () => {
		await seed();
		const messages: Array<{ id: string | null; body: Uint8Array }> = [];
		const ctx = {
			...harness.ctx,
			http: {
				fetch: async (_url: string, init?: RequestInit) => {
					messages.push({
						id: new Headers(init?.headers).get("X-WC-Webhook-Delivery-ID"),
						body: new Uint8Array(init?.body as ArrayBuffer),
					});
					return new Response(null, { status: 200 });
				},
			},
		};
		const metadata = new EmDashWooMetadataStore(
			ctx.storage!.woo_metadata! as StorageCollection<WooMetadataDocument>,
		);
		for (const [index, value] of ["first", "second", "first"].entries()) {
			await metadata.patch(
				"order:woo-order",
				[{ key: "accounting_reference", value }],
				`change-${index}`,
			);
			expect(await runWooWebhookSweep(ctx, configuration)).toMatchObject({
				enqueued: 1,
				delivered: 1,
			});
		}
		expect(messages[0]!.body).toEqual(messages[2]!.body);
		expect(new Set(messages.map((message) => message.id)).size).toBe(3);
	});
});
