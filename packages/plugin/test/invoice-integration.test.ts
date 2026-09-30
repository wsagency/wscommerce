import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	runInvoiceIntegrationSweep,
	withInvoiceIntegrations,
} from "../src/integrations/invoices.js";
import type { IntegrationConfiguration } from "../src/integrations/invoices.js";
import { makeInProcessCommerce } from "./helpers/in-process-commerce.js";
import type { InProcessCommerceHarness } from "./helpers/in-process-commerce.js";
import type { SandboxedPlugin } from "../src/types.js";

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
