import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	runInvoiceIntegrationSweep,
	withInvoiceIntegrations,
} from "../src/integrations/invoices.js";
import type { IntegrationConfiguration } from "../src/integrations/invoices.js";
import { makeInProcessCommerce } from "./helpers/in-process-commerce.js";
import type { InProcessCommerceHarness } from "./helpers/in-process-commerce.js";
import type { SandboxedPlugin } from "../src/types.js";
import { cents, currency, idempotencyKey, orderId, productId, sku } from "@otta-sh/domain";
import { InvoiceJobStore, invoiceSnapshotFromOrder } from "@emdash-commerce/invoicing";

describe("mounted native invoice integration", () => {
	it("bootstraps the invoice worker from a real route and preserves public route policy", async () => {
		const scheduled: string[] = [];
		const context = {
			...harness.ctx,
			cron: {
				schedule: async (name: string) => {
					scheduled.push(name);
				},
				cancel: async () => undefined,
				list: async () => [],
			},
		};
		const plugin = withInvoiceIntegrations(
			{ routes: { storefront: { public: true, handler: async () => ({ ok: true }) } } },
			async () => config,
		);
		const route = plugin.routes!.storefront!;
		if (typeof route === "function") throw new Error("route policy lost");
		expect(route.public).toBe(true);
		expect(
			await route.handler(
				{ input: {}, request: { url: "https://shop.test", method: "POST", headers: {} } },
				context,
			),
		).toEqual({ ok: true });
		expect(scheduled).toContain("commerce-integrations");
	});
	let harness: InProcessCommerceHarness;
	beforeAll(async () => {
		harness = await makeInProcessCommerce();
	});
	beforeEach(async () => harness.reset());
	afterAll(async () => harness.close());
	const config: IntegrationConfiguration = {
		invoiceOwner: "disabled",
		shopId: "test-shop",
		invoiceLiveEnabled: false,
	};
	const enabled: IntegrationConfiguration = {
		invoiceOwner: "solo",
		shopId: "test-shop",
		invoiceLiveEnabled: true,
		allowLegacyBillingFromShipping: true,
		solo: {
			token: "test-only-secret",
			serviceType: 1,
			invoiceType: 1,
			buyerType: 1,
			codPaymentType: 1,
		},
	};
	async function paidOrder(captured: boolean) {
		const result = await harness.stores.orderStore.createFromCart({
			orderId: orderId("invoice-order"),
			cartId: null,
			currency: currency("EUR"),
			idempotencyKey: idempotencyKey("invoice-checkout"),
			holdExpiresAt: "2099-01-01T00:00:00.000Z",
			buyerRef: "buyer@example.test",
			paymentMethod: "stripe",
			shippingAddress: {
				name: "Test Buyer",
				line1: "Test 1",
				line2: null,
				city: "Zagreb",
				region: null,
				postalCode: "10000",
				country: "HR",
				email: "buyer@example.test",
				phone: null,
			},
			lines: [
				{
					productId: productId("book"),
					sku: sku("BOOK"),
					title: "Test book",
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
				tax: cents(0),
				taxBreakdown: {
					priceTaxMode: "exclusive",
					lines: [
						{
							rateBps: 0,
							netCents: 1500,
							grossCents: 1500,
							subtotalNetCents: 1500,
							discountedCents: 1500,
							taxCents: 0,
						},
					],
					shippingNetCents: 0,
					shippingTaxCents: 0,
					shippingRateBps: 0,
				},
			},
		});
		await harness.stores.orderStore.markPaid(result.order.id);
		if (captured)
			await harness.stores.orderStore.recordPayment({
				orderId: result.order.id,
				gateway: "stripe",
				providerRef: "pi_test",
				amount: cents(1500),
				currency: currency("EUR"),
				status: "succeeded",
			});
		return (await harness.stores.orderStore.getById(result.order.id))!;
	}
	it("a paid-looking state without a captured payment cannot issue an invoice", async () => {
		await paidOrder(false);
		const result = await runInvoiceIntegrationSweep(harness.ctx, enabled);
		expect(result).toMatchObject({ enqueued: 0, issued: 0, blocked: 1 });
		expect(harness.egressAttempts()).toBe(0);
	});
	it("issues once from frozen billing and money after actual capture", async () => {
		await paidOrder(true);
		const requests: string[] = [];
		const ctx = {
			...harness.ctx,
			http: {
				fetch: async (_url: string, init?: RequestInit) => {
					requests.push(String(init?.body));
					return Response.json({
						status: 0,
						racun: {
							id: "provider-document",
							broj_racuna: "2026-1",
							bruto_suma: "15,00",
							valuta_racuna: "EUR",
						},
					});
				},
			},
		};
		expect(await runInvoiceIntegrationSweep(ctx, enabled)).toMatchObject({
			enqueued: 1,
			issued: 1,
		});
		await runInvoiceIntegrationSweep(ctx, enabled);
		expect(requests).toHaveLength(1);
		expect(new URLSearchParams(requests[0]).get("cijena_1")).toBe("15,00");
	});
	it("a queued invoice is parked if a refund arrived before issuance", async () => {
		const order = await paidOrder(true);
		const jobs = new InvoiceJobStore(harness.ctx.storage!.commerce_invoice_jobs!);
		await jobs.enqueue(
			invoiceSnapshotFromOrder(
				order,
				{
					name: "Test Buyer",
					company: null,
					taxNumber: null,
					vatId: null,
					email: "buyer@example.test",
					line1: "Test 1",
					city: "Zagreb",
					postalCode: "10000",
					country: "HR",
				},
				"test-shop",
			),
			"solo",
		);
		await harness.stores.orderStore.recordRefund({
			orderId: order.id,
			amount: cents(100),
			currency: order.currency,
			kind: "manual",
			gateway: "stripe",
			refundRef: null,
			reason: null,
			refundedBy: "test-admin",
			idempotencyKey: idempotencyKey("refund-before-invoice"),
		});
		await runInvoiceIntegrationSweep(harness.ctx, enabled);
		expect(harness.egressAttempts()).toBe(0);
		expect(await jobs.get(order.id)).toMatchObject({
			state: "failed",
			code: "REFUND_ACCOUNTING_REQUIRED",
		});
	});
	it("does no provider work for disabled or Woo-connector ownership", async () => {
		for (const owner of ["disabled", "woocommerce-connector"] as const) {
			expect(
				await runInvoiceIntegrationSweep(harness.ctx, { ...config, invoiceOwner: owner }),
			).toMatchObject({ skipped: true, issued: 0 });
		}
		expect(harness.egressAttempts()).toBe(0);
	});
	it("configuration alone cannot start live issuance", async () => {
		expect(
			await runInvoiceIntegrationSweep(harness.ctx, {
				...config,
				invoiceOwner: "solo",
				solo: {
					token: "test-only-secret",
					serviceType: 1,
					invoiceType: 1,
					buyerType: 1,
					codPaymentType: 1,
				},
			}),
		).toMatchObject({ skipped: true, reason: "LIVE_ISSUANCE_DISABLED" });
		expect(harness.egressAttempts()).toBe(0);
	});
	it("mounts invoice diagnostics as private routes and returns only configuration presence", async () => {
		const base: SandboxedPlugin = { routes: {} };
		const wrapped = withInvoiceIntegrations(base, async () => ({
			...config,
			solo: {
				token: "test-only-secret",
				serviceType: 1,
				invoiceType: 1,
				buyerType: 1,
				codPaymentType: 1,
			},
		}));
		const route = wrapped.routes!["commerce/integrations/status"]!;
		expect(typeof route).toBe("object");
		if (typeof route === "function") throw new Error("private route entry expected");
		expect(route.public).not.toBe(true);
		const result = await route.handler(
			{
				input: {},
				request: {
					url: "https://shop.test/_emdash/api/plugins/otta/commerce/integrations/status",
					method: "POST",
					headers: {},
				},
			},
			harness.ctx,
		);
		expect(result).toMatchObject({ invoiceOwner: "disabled", soloConfigured: true });
		expect(JSON.stringify(result)).not.toContain("test-only-secret");
	});
	it("preserves the native cron handler and adds an isolated invoice result", async () => {
		let called = 0;
		const wrapped = withInvoiceIntegrations(
			{
				hooks: {
					cron: {
						handler: async () => {
							called++;
							return { native: true };
						},
					},
				},
			},
			async () => config,
		);
		const result = await wrapped.hooks!.cron!.handler(
			{ name: "commerce-sweeps", scheduledAt: "2026-09-30T10:00:00Z" },
			harness.ctx,
		);
		expect(called).toBe(1);
		expect(result).toMatchObject({ native: { native: true }, invoices: { skipped: true } });
	});
});
