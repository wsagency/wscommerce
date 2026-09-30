import type { APIContext } from "astro";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { STOREFRONT_ORDER_ROUTE } from "@otta-sh/plugin";
import type { PublicPluginApiRouteHandler } from "emdash/plugin-utils";
import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("astro:assets", async () => ({
	Font: (await import("./fixtures/EmptyFont.astro")).default,
}));
vi.mock("emdash", () => ({ getSiteSettings: async () => ({}), getMenu: async () => null }));
vi.mock("../src/lib/stripe-config.js", () => ({ STRIPE_PUBLISHABLE_KEY: "pk_test_local_fixture" }));

import Pay from "../src/pages/checkout/pay.astro";
import { POST as LANGUAGE_POST } from "../src/pages/language.js";

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});

describe("localized payment page", () => {
	test("switching changes presentation and reads the same immutable private order, without a provider or mutation call", async () => {
		const stash = {
			orderId: "private-capability",
			clientSecret: "local-fixture-secret",
			total: { formatted: "€12.50", currency: "EUR" },
		};
		const snapshot = { amount: 1250, currency: "EUR" };
		const calls: Array<{ route: string; body: Record<string, unknown> }> = [];
		const handler: PublicPluginApiRouteHandler = async (_plugin, _method, route, request) => {
			const body = (await request.json()) as Record<string, unknown>;
			calls.push({ route, body });
			const money = { ...snapshot, formatted: body.locale === "hr" ? "12,50 €" : "€12.50" };
			return {
				success: true,
				data: {
					ok: true,
					order: {
						id: stash.orderId,
						state: "pending",
						totals: { total: { money, label: money.formatted } },
					},
				},
			};
		};
		const render = (locale: string) =>
			container.renderToString(Pay, {
				request: new Request("https://shop.test/checkout/pay", {
					headers: {
						cookie: `otta_checkout=${encodeURIComponent(JSON.stringify(stash))}; wscommerce_locale=${locale}`,
					},
				}),
				locals: { emdash: { handlePublicPluginApiRoute: handler } } as never,
			});
		const english = await render("en");
		expect(english).toContain("Pay €12.50");
		const writes: Array<{ name: string; value: string }> = [];
		const request = new Request("https://shop.test/language", {
			method: "POST",
			headers: { origin: "https://shop.test" },
			body: new URLSearchParams({ locale: "hr", returnTo: "/checkout/pay" }),
		});
		const switched = await LANGUAGE_POST({
			request,
			url: new URL(request.url),
			cookies: { set: (name: string, value: string) => writes.push({ name, value }) },
			redirect: (location: string, status: number) =>
				new Response(null, { status, headers: { location } }),
		} as unknown as APIContext);
		expect(switched.status).toBe(303);
		expect(switched.headers.get("location")).toBe("/checkout/pay");
		expect(writes).toEqual([{ name: "wscommerce_locale", value: "hr" }]);
		const croatian = await render(writes[0]!.value);
		expect(croatian).toContain("Plati 12,50 €");
		expect(croatian).toContain('data-client-secret="local-fixture-secret"');
		expect(croatian).toContain('data-locale="hr"');
		expect(croatian).toContain("Unos kartice zahtijeva JavaScript");
		expect(croatian).toContain("Pružatelj plaćanja nije se učitao");
		expect(croatian).toContain("EUR");
		expect(calls).toEqual(
			["en", "hr"].map((locale) => ({
				route: `/${STOREFRONT_ORDER_ROUTE}`,
				body: { orderId: stash.orderId, locale },
			})),
		);
		expect(snapshot).toEqual({ amount: 1250, currency: "EUR" });
		expect(stash.total).toEqual({ formatted: "€12.50", currency: "EUR" });
	});
});
