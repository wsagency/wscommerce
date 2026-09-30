import { makeCommerceClient } from "../src/commerce/make-commerce-client.js";
import { expect, test } from "vitest";
import { orderId } from "@otta-sh/domain";
import { makeInProcessCommerce } from "./helpers/in-process-commerce.js";
import { OFFLINE_SETTING_KEYS, offlineGatewaysFromCtx } from "../src/payments/offline-gateway.js";
test("native settings affect only new bank orders; private payer/profile never enter public JSON", async () => {
	const h = await makeInProcessCommerce();
	try {
		const k = OFFLINE_SETTING_KEYS;
		for (const [key, value] of [
			[k.bankEnabled, "true"],
			[k.bankInstructions, "Test only"],
			[k.bankWindowHours, "72"],
			[k.bankName, "Original"],
			[k.bankAddress, "Test 1"],
			[k.bankCity, "10000 Test"],
			[k.bankIban, "HR3799999990000000001"],
			[k.bankModel, "HR00"],
			[k.bankPurpose, "GDDS"],
			[k.codEnabled, "true"],
			[k.codInstructions, "Test only"],
			[k.codWindowHours, "72"],
		] as const)
			await h.ctx.kv.set(key, value);
		await h.client.upsertProductCommerce(
			"p",
			{
				sku: "SKU",
				title: "Test",
				price: { amount: 3950, currency: "EUR" },
				productKind: "physical",
				initialOnHand: 4,
			},
			"seed",
		);
		await h.client.activateProductCommerce("p", "activate", "2026-01-01T00:00:00.000Z");
		const place = async (key: string) => {
			const c = await h.client.createCart("EUR");
			expect((await h.client.addCartLine(c.cartId, "SKU", "p", 1, `add-${key}`)).ok).toBe(true);
			return (await makeCommerceClient(h.ctx)).createOrder(
				{
					cartId: c.cartId,
					paymentMethod: "bank_transfer",
					buyerRef: "test@example.invalid",
					billingAddress: {
						name: "Private payer",
						line1: "Private street",
						postalCode: "10000",
						city: "Test",
						country: "HR",
					},
				},
				key,
			);
		};
		const first = await place("first");
		if (!first.ok) throw new Error(first.reason);
		const original = (await h.stores.orderStore.getById(orderId(first.order.id)))?.offlinePayment
			?.bankTransfer;
		expect(original?.recipient.name).toBe("Original");
		expect(original?.amountCents).toBe(3950);
		await h.ctx.kv.set(k.bankName, "Changed");
		const second = await place("second");
		if (!second.ok) throw new Error(second.reason);
		expect(
			(await h.stores.orderStore.getById(orderId(second.order.id)))?.offlinePayment?.bankTransfer
				?.recipient.name,
		).toBe("Changed");
		expect(
			(await h.stores.orderStore.getById(orderId(first.order.id)))?.offlinePayment?.bankTransfer,
		).toEqual(original);
		const publicJson = JSON.stringify([first, await h.client.getPublicOrder(first.order.id)]);
		expect(publicJson).not.toContain("Private payer");
		expect(publicJson).not.toContain("HR3799999990000000001");
		expect(publicJson).not.toContain("bankTransfer");
		await h.ctx.kv.set(k.bankIban, "bad");
		const methods = await offlineGatewaysFromCtx(h.ctx);
		expect(methods.bank_transfer).toBeUndefined();
		expect(methods.cod).toBeDefined();
	} finally {
		await h.close();
	}
});
