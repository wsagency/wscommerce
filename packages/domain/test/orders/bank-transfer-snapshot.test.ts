import { test, expect } from "vitest";
import {
	addLine,
	cents,
	createCart,
	createOrderFromCart,
	currency,
	idempotencyKey,
	money,
	productId,
	sku,
	type BankTransferRecipient,
} from "@otta-sh/domain";
import { FakePaymentGateway } from "@otta-sh/domain/testing";
import { makeOrderHarness } from "./fake-harness.js";
const recipient: BankTransferRecipient = {
	name: "Synthetic ČĆĐŠŽ",
	address: "Test 1",
	city: "10000 Test",
	iban: "HR3799999990000000001",
	model: "HR00",
	purpose: "GDDS",
};
async function setup() {
	const h = makeOrderHarness();
	await h.productCommerce.upsert(
		{
			productId: productId("p"),
			sku: sku("SKU"),
			price: money(cents(3950), currency("EUR")),
			title: "Test",
			productKind: "physical",
		},
		idempotencyKey("seed"),
	);
	await h.productCommerce.activate(
		productId("p"),
		idempotencyKey("publish"),
		"2026-01-01T00:00:00.000Z",
	);
	h.inventory.seed("SKU", 4);
	const cartId = await createCart(h.cartDeps, currency("EUR"));
	expect(
		(await addLine(h.cartDeps, cartId, sku("SKU"), "p", 1, idempotencyKey("add"), "physical")).ok,
	).toBe(true);
	const gateway = Object.assign(new FakePaymentGateway({ id: "bank_transfer" }), {
		checkoutPolicy: {
			holdTtlMs: 72 * 3600000,
			offlineInstructions: "Test only",
			bankTransferRecipient: { ...recipient },
		},
	});
	const deps = {
		...h.createDeps,
		idGen: { newId: () => "00000000-0000-4000-8000-000000000001" },
		gateways: { bank_transfer: gateway },
	};
	const command = {
		cartId,
		paymentMethod: "bank_transfer" as const,
		buyerRef: "test@example.invalid",
		idempotencyKey: idempotencyKey("checkout"),
		billingAddress: {
			name: "Payer",
			line1: "Test street",
			city: "Test",
			postalCode: "10000",
			country: "HR",
		},
	};
	return { h, gateway, deps, command };
}
test("native first insert freezes authoritative bank money, payer and profile; replay never rereads changed settings", async () => {
	const { h, gateway, deps, command } = await setup();
	const first = await createOrderFromCart(deps, command);
	expect(first.ok).toBe(true);
	if (!first.ok) throw new Error(first.reason);
	const snapshot = first.order.offlinePayment?.bankTransfer;
	expect(snapshot).toMatchObject({
		version: 1,
		amountCents: 3950,
		currency: "EUR",
		recipient,
		payer: { name: "Payer" },
	});
	expect(first.order.offlinePayment?.paymentReference).toBe(snapshot?.reference);
	expect(JSON.stringify(first.intent.clientAction)).not.toContain("bankTransfer");
	expect(JSON.stringify(gateway.intentCalls)).not.toContain(recipient.iban);
	gateway.checkoutPolicy.bankTransferRecipient.name = "Changed";
	const again = await createOrderFromCart(deps, command);
	expect(again.ok).toBe(true);
	if (!again.ok) throw new Error(again.reason);
	expect(again.order.offlinePayment?.bankTransfer).toEqual(snapshot);
	expect((await h.orderStore.getById(first.order.id))?.offlinePayment?.bankTransfer).toEqual(
		snapshot,
	);
});
test("a crash after the committed order resumes with its original bank snapshot", async () => {
	const { h, gateway, deps, command } = await setup();
	const adopt = h.inventory.adoptMany.bind(h.inventory);
	let crashed = false;
	h.inventory.adoptMany = async (input) => {
		if (!crashed) {
			crashed = true;
			throw new Error("local interruption");
		}
		return adopt(input);
	};
	await expect(createOrderFromCart(deps, command)).rejects.toThrow("local interruption");
	const first = await h.orderStore.getByIdempotencyKey(command.idempotencyKey);
	expect(first?.offlinePayment?.bankTransfer).toMatchObject({ recipient });
	gateway.checkoutPolicy.bankTransferRecipient.name = "Changed";
	const retry = await createOrderFromCart(deps, command);
	expect(retry.ok).toBe(true);
	if (!retry.ok) throw new Error(retry.reason);
	expect(retry.order.offlinePayment?.bankTransfer).toEqual(first?.offlinePayment?.bankTransfer);
});
test("invalid structured bank configuration creates no unusable order", async () => {
	const { h, gateway, deps, command } = await setup();
	gateway.checkoutPolicy.bankTransferRecipient.iban = "invalid";
	expect(await createOrderFromCart(deps, command)).toMatchObject({
		ok: false,
		reason: "PAYMENT_METHOD_NOT_AVAILABLE",
	});
	expect(await h.orderStore.getByIdempotencyKey(command.idempotencyKey)).toBe(null);
	expect(gateway.intentCalls).toHaveLength(0);
});

test("invalid bank configuration releases a redeemed coupon before any order is committed", async () => {
	const { h, gateway, deps, command } = await setup();
	await h.couponStore.create({
		id: "cpn",
		code: "SAVE5",
		type: "fixed_amount",
		amountCents: cents(500),
		rateBps: null,
		capCents: null,
		currency: currency("EUR"),
		minSubtotalCents: null,
		startsAt: null,
		expiresAt: null,
		maxUses: 100,
		maxUsesPerCustomer: null,
	});
	gateway.checkoutPolicy.bankTransferRecipient.iban = "invalid";
	expect(await createOrderFromCart(deps, { ...command, couponCode: "SAVE5" })).toMatchObject({
		ok: false,
		reason: "PAYMENT_METHOD_NOT_AVAILABLE",
	});
	expect((await h.couponStore.findByCode("SAVE5"))?.usesCount).toBe(0);
});
