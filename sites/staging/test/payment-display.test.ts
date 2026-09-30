import { STOREFRONT_ORDER_ROUTE } from "@otta-sh/plugin";
import type { PublicPluginApiRouteHandler } from "emdash/plugin-utils";
import { describe, expect, test } from "vitest";
import { localizedCheckoutTotal } from "../src/lib/payment-display.js";

const stash = {
	orderId: "private-order-capability",
	clientSecret: "secret-kept-in-stash",
	total: { currency: "EUR", formatted: "€12.50" },
};

describe("payment label after language switching", () => {
	test("reads only the same private order and uses its localized immutable total", async () => {
		const calls: Array<{ route: string; body: unknown }> = [];
		const immutable = { amount: 1250, currency: "EUR", formatted: "12,50 €" };
		const handler: PublicPluginApiRouteHandler = async (_plugin, method, route, request) => {
			expect(method).toBe("POST");
			calls.push({ route, body: await request.json() });
			return {
				success: true,
				data: {
					ok: true,
					order: {
						id: stash.orderId,
						state: "pending",
						totals: { total: { money: immutable, label: immutable.formatted } },
					},
				},
			};
		};
		expect(
			await localizedCheckoutTotal(stash, "hr", handler, new URL("https://shop.test/checkout/pay")),
		).toEqual({ currency: "EUR", formatted: "12,50 €" });
		expect(calls).toEqual([
			{
				route: `/${STOREFRONT_ORDER_ROUTE}`,
				body: { orderId: "private-order-capability", locale: "hr" },
			},
		]);
		expect(immutable).toEqual({ amount: 1250, currency: "EUR", formatted: "12,50 €" });
		expect(stash.total).toEqual({ currency: "EUR", formatted: "€12.50" });
	});
	test("a unavailable, expired or differently identified read preserves the approved stash label", async () => {
		for (const data of [
			null,
			{ ok: false, reason: "ORDER_NOT_FOUND" },
			{
				ok: true,
				order: {
					id: "other-capability",
					state: "pending",
					totals: { total: { money: { currency: "EUR", formatted: "100,00 €" } } },
				},
			},
			{
				ok: true,
				order: {
					id: stash.orderId,
					state: "expired",
					totals: { total: { money: { currency: "EUR", formatted: "100,00 €" } } },
				},
			},
			{
				ok: true,
				order: {
					id: stash.orderId,
					state: "pending",
					totals: { total: { money: { currency: "USD", formatted: "$100.00" } } },
				},
			},
		]) {
			const handler: PublicPluginApiRouteHandler = async () => ({ success: true, data });
			expect(
				await localizedCheckoutTotal(
					stash,
					"hr",
					handler,
					new URL("https://shop.test/checkout/pay"),
				),
			).toEqual(stash.total);
		}
		expect(
			await localizedCheckoutTotal(
				stash,
				"hr",
				undefined,
				new URL("https://shop.test/checkout/pay"),
			),
		).toEqual(stash.total);
	});
});
