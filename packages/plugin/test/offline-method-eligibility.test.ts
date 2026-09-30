import { expect, test } from "vitest";
import { idempotencyKey } from "@otta-sh/domain";
import { createCheckoutSummaryRouteHandler } from "../src/storefront/checkout-routes.js";
import { OFFLINE_SETTING_KEYS } from "../src/payments/offline-gateway.js";
import { makeInProcessCommerce } from "./helpers/in-process-commerce.js";

test("native mixed-cart quote excludes COD without creating an order and preserves configured bank transfer", async () => {
	const h = await makeInProcessCommerce();
	try {
		await h.ctx.kv.set(OFFLINE_SETTING_KEYS.codEnabled, "true");
		await h.ctx.kv.set(OFFLINE_SETTING_KEYS.codInstructions, "Local delivery instructions");
		await h.ctx.kv.set(OFFLINE_SETTING_KEYS.codWindowHours, "168");
		for (const [id, kind] of [
			["physical", "physical"],
			["digital", "digital"],
		] as const) {
			await h.client.upsertProductCommerce(
				id,
				{
					sku: id,
					title: id,
					price: { amount: 1000, currency: "EUR" },
					productKind: kind,
					initialOnHand: 5,
				},
				`seed:${id}`,
			);
			await h.client.activateProductCommerce(id, `activate:${id}`, "2026-01-01T00:00:00.000Z");
		}
		const { cartId } = await h.client.createCart("EUR");
		await h.client.addCartLine(cartId, "physical", "physical", 1, "physical-add");
		const quote = await h.client.quoteCheckout({ cartId });
		expect(quote).toMatchObject({ ok: true, codEligible: true });
		const route = createCheckoutSummaryRouteHandler();
		expect(
			await route(
				{ input: { cartId }, request: new Request("https://local.test/checkout") },
				h.ctx,
			),
		).toMatchObject({ ok: true, paymentMethods: [{ id: "cod" }] });
		await h.client.addCartLine(cartId, "digital", "digital", 1, "digital-add");
		expect(await h.client.quoteCheckout({ cartId })).toMatchObject({
			ok: true,
			requiresShipping: true,
			codEligible: false,
		});
		const summary = await route(
			{ input: { cartId }, request: new Request("https://local.test/checkout") },
			h.ctx,
		);
		expect(summary).toMatchObject({ ok: true, paymentMethods: [] });
		expect(
			await h.stores.orderStore.getByIdempotencyKey(idempotencyKey(`checkout:${cartId}`)),
		).toBeNull();
		expect(await h.client.getCart(cartId)).toMatchObject({ ok: true, cart: { orderId: null } });
		await h.ctx.kv.set(OFFLINE_SETTING_KEYS.bankEnabled, "true");
		await h.ctx.kv.set(OFFLINE_SETTING_KEYS.bankInstructions, "Local test bank instructions");
		await h.ctx.kv.set(OFFLINE_SETTING_KEYS.bankWindowHours, "72");
		expect(
			await route(
				{ input: { cartId }, request: new Request("https://local.test/checkout") },
				h.ctx,
			),
		).toMatchObject({ ok: true, paymentMethods: [{ id: "bank_transfer" }] });
		expect(h.egressAttempts()).toBe(0);
	} finally {
		await h.close();
	}
});
