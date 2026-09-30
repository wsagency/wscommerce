import { FakePaymentGateway } from "@otta-sh/domain/testing";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import {
	makeInProcessCommerce,
	type InProcessCommerceHarness,
} from "./helpers/in-process-commerce.js";
import { InProcessAdminProductsClient } from "../src/admin/in-process-admin-products-client.js";

let h: InProcessCommerceHarness;
beforeAll(async () => {
	h = await makeInProcessCommerce({
		gateways: { stripe: new FakePaymentGateway({ id: "stripe" }) },
	});
});
beforeEach(async () => {
	await h.reset();
});
afterAll(async () => {
	await h.close();
});

async function seed() {
	await h.client.upsertProductCommerce(
		"retail",
		{
			sku: "RETAIL",
			title: "Retail",
			price: { amount: 1250, currency: "EUR" },
			priceTaxMode: "inclusive",
			productKind: "digital",
		},
		"seed",
	);
	await h.client.activateProductCommerce("retail", "activate", "2026-01-01T00:00:00.000Z");
	await h.stores.shippingRules.createZone({ id: "hr", name: "Croatia", regions: ["HR"] });
	await h.stores.taxRules.createRate({
		id: "vat",
		taxClassId: "standard",
		zoneId: "hr",
		rateBps: 2500,
		appliesToShipping: false,
	});
	const cart = await h.client.createCart("EUR");
	expect((await h.client.addCartLine(cart.cartId, "RETAIL", "retail", 2, "add")).ok).toBe(true);
	return cart.cartId;
}

test("native client quotes inclusive digital retail prices from the billing jurisdiction", async () => {
	const cartId = await seed();
	expect(await h.client.quoteCheckout({ cartId, taxDestination: { country: "HR" } })).toMatchObject(
		{
			ok: true,
			requiresShipping: false,
			taxDestination: { status: "matched", zoneId: "hr" },
			breakdown: { subtotalCents: 2500, totalCents: 2500, taxCents: 500 },
		},
	);
	expect((await h.client.getProductCommerce("retail"))?.priceTaxMode).toBe("inclusive");
});

test("guarded merchant edit changes the explicit price mode and refuses unknown modes", async () => {
	await seed();
	const admin = new InProcessAdminProductsClient(h.ctx);
	const detail = await admin.getProduct("retail");
	if (detail === null) throw new Error("missing product");
	const changed = await admin.updateProduct(
		"retail",
		{ expectedUpdatedAt: detail.updatedAt, priceTaxMode: "exclusive" },
		"change-mode",
	);
	expect(changed.ok).toBe(true);
	expect((await h.client.getProductCommerce("retail"))?.priceTaxMode).toBe("exclusive");
	const current = await admin.getProduct("retail");
	expect(
		(
			await admin.updateProduct(
				"retail",
				{ expectedUpdatedAt: current!.updatedAt, priceTaxMode: "unknown" as never },
				"bad-mode",
			)
		).ok,
	).toBe(false);
});
