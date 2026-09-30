import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { STOREFRONT_CHECKOUT_SUMMARY_ROUTE, STOREFRONT_ORDER_ROUTE } from "@otta-sh/plugin";
import type { PublicPluginApiRouteHandler } from "emdash/plugin-utils";
import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("astro:assets", async () => ({
	Font: (await import("./fixtures/EmptyFont.astro")).default,
}));
vi.mock("emdash", () => ({ getSiteSettings: async () => ({}), getMenu: async () => null }));
vi.mock("../src/lib/stripe-config.js", () => ({ STRIPE_PUBLISHABLE_KEY: undefined }));

import Checkout from "../src/pages/checkout/index.astro";
import Receipt from "../src/pages/orders/[orderId].astro";

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});
const request = (path: string, locale = "hr") =>
	new Request(`https://shop.test${path}`, {
		headers: { cookie: `otta_cart=cart-private; wscommerce_locale=${locale}` },
	});
const money = (amount: number) => {
	const formatted = new Intl.NumberFormat("hr", { style: "currency", currency: "EUR" }).format(
		amount / 100,
	);
	return { money: { amount, currency: "EUR", formatted }, label: formatted };
};
const totals = () => ({
	subtotal: money(1500),
	discount: money(-250),
	shipping: { money: null, label: "Not calculated" },
	tax: { money: null, label: "Not calculated" },
	total: money(1250),
	appliedCouponCode: "Paid",
	totalExcludesUncalculated: true,
});
const line = () => ({ sku: "Quantity", qty: 2, title: "Paid", lineTotal: money(1500).money });
function reader(data: unknown) {
	const calls: Array<{ route: string; body: unknown }> = [];
	const handler: PublicPluginApiRouteHandler = async (_plugin, _method, route, input) => {
		calls.push({ route, body: await input.json() });
		return { success: true, data };
	};
	return { calls, locals: { emdash: { handlePublicPluginApiRoute: handler } } as never };
}

describe("rendered checkout and private receipt localization", () => {
	test("checkout keeps selections and financial inputs stable while localizing authored copy and country names", async () => {
		const snapshot = totals();
		const { calls, locals } = reader({
			ok: true,
			orderCreated: false,
			lines: [line()],
			totals: snapshot,
			selection: {
				couponCode: "Paid",
				destination: { country: "HR", region: null },
				taxDestination: { country: "HR", region: null },
				shippingMethodId: "method-private",
			},
			selectionErrors: {},
			requiresShipping: true,
			billingRequired: true,
			addressRequired: true,
			shipping: {
				status: "matched",
				noOptions: false,
				options: [{ id: "method-private", label: "Delivery", price: "4,00 €" }],
			},
			paymentMethods: [
				{ id: "bank_transfer", label: "Bank transfer" },
				{ id: "cod", label: "Cash on delivery" },
			],
			readyToPlace: true,
			hasUnpricedLines: false,
			uncalculatedReason: null,
		});
		const response = await container.renderToResponse(Checkout, {
			request: request("/checkout?coupon=Paid&country=HR&method=method-private&billingCountry=HR"),
			locals,
		});
		const html = await response.text();
		expect(html).toContain("Kodovi razlikuju velika i mala slova.");
		expect(html).toContain("Bankovna uplata");
		expect(html).toContain("Pouzećem");
		expect(html).toContain("Hrvatska");
		expect(html).toContain("Nije izračunato");
		expect(html).toContain("12,50 €");
		expect(html).toContain("Popust · Paid");
		expect(html).toContain("Dostava: Delivery (4,00 €)");
		expect(html).toContain('name="couponCode" value="Paid"');
		expect(html).toContain('name="paymentMethod" value="bank_transfer"');
		expect(html).toContain('value="HR"');
		expect(html).toContain('action="/checkout/place"');
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(calls).toEqual([
			{
				route: `/${STOREFRONT_CHECKOUT_SUMMARY_ROUTE}`,
				body: {
					cartId: "cart-private",
					locale: "hr",
					couponCode: "Paid",
					destination: { country: "HR" },
					shippingMethodId: "method-private",
					taxDestination: { country: "HR" },
				},
			},
		]);
		expect(snapshot.total.money?.amount).toBe(1250);
		expect(snapshot.total.money?.currency).toBe("EUR");
	});

	test("completed unpaid COD stays unpaid; merchant instructions and receipt snapshots remain verbatim", async () => {
		const snapshot = totals();
		const { calls, locals } = reader({
			ok: true,
			order: {
				id: "private-order",
				state: "completed",
				currency: "EUR",
				lines: [line()],
				totals: snapshot,
				fulfillment: { carrier: "Shipping", trackingNumber: "Tax" },
				offlinePayment: {
					method: "cod",
					status: "accepted",
					instructions: "Continue to payment",
					paymentReference: "Quantity",
					paymentDueAt: "2026-10-01T10:00:00Z",
				},
			},
		});
		const response = await container.renderToResponse(Receipt, {
			params: { orderId: "private-order" },
			request: request(
				"/orders/private-order?access=key%2Bsecret%3D&payment_intent_client_secret=do-not-render&payment_intent=pi_fixture&redirect_status=succeeded&coupon=Paid&p=8",
			),
			locals,
		});
		const html = await response.text();
		expect(html).toContain("Plaćanje nije evidentirano.");
		expect(html).toContain("Status narudžbe: Dovršeno.");
		expect(html).toContain("Continue to payment");
		expect(html).toContain("Paid");
		expect(html).toContain("Quantity");
		expect(html).toContain("Shipping");
		expect(html).toContain("Tax");
		expect(html).toContain("Popust · Paid");
		expect(html).toContain("Ukupno");
		expect(html).not.toContain(">Plaćeno<");
		expect(html).not.toContain("do-not-render");
		expect(html).not.toContain("pi_fixture");
		expect(html).toContain(
			'value="/orders/private-order?access=key%2Bsecret%3D&amp;coupon=Paid&amp;p=8"',
		);
		expect(html).toContain(
			'href="/orders/private-order?access=key%2Bsecret%3D&amp;coupon=Paid&amp;p=9"',
		);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(calls).toEqual([
			{ route: `/${STOREFRONT_ORDER_ROUTE}`, body: { orderId: "private-order", locale: "hr" } },
		]);
		expect(snapshot.total.money?.amount).toBe(1250);
	});
});
