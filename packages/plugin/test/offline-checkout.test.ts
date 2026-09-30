import { orderId } from "@otta-sh/domain";
import {
	collectionOf,
	RESERVATION_INDEX_COLLECTION,
	type ReservationIndexDoc,
} from "@otta-sh/store-emdash";
import { FixedClock } from "@otta-sh/domain/testing";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { OfflinePaymentGateway } from "../src/payments/offline-gateway.js";
import { InProcessAdminOrdersClient } from "../src/admin/in-process-admin-orders-client.js";
import {
	makeInProcessCommerce,
	type InProcessCommerceHarness,
} from "./helpers/in-process-commerce.js";

const clock = new FixedClock(new Date("2026-09-30T10:00:00.000Z"));
const gateways = {
	bank_transfer: new OfflinePaymentGateway(
		"bank_transfer",
		"Bank account TEST; use the order reference",
		72,
	),
	cod: new OfflinePaymentGateway("cod", "Pay the carrier on delivery", 168),
};
let h: InProcessCommerceHarness;
beforeAll(async () => {
	h = await makeInProcessCommerce({ clock, gateways });
});
beforeEach(async () => {
	await h.reset();
});
afterAll(async () => {
	await h.close();
});
const billingAddress = {
	name: "Buyer",
	company: "Acme",
	taxNumber: "TAX123",
	vatId: "VAT123",
	line1: "Billing street",
	city: "Zagreb",
	country: "HR",
	postalCode: "10000",
};

async function cart(kind: "physical" | "digital" = "physical") {
	await h.client.upsertProductCommerce(
		"p",
		{
			sku: "SKU",
			title: "Widget",
			price: { amount: 1500, currency: "EUR" },
			productKind: kind,
			initialOnHand: 4,
		},
		"seed",
	);
	await h.client.activateProductCommerce("p", "activate", "2026-01-01T00:00:00.000Z");
	const c = await h.client.createCart("EUR");
	expect((await h.client.addCartLine(c.cartId, "SKU", "p", 1, "add")).ok).toBe(true);
	return c.cartId;
}

test("bank checkout freezes billing and instructions, keeps pending stock for its 72 hour deadline", async () => {
	const cartId = await cart();
	const placed = await h.client.createOrder(
		{ cartId, paymentMethod: "bank_transfer", buyerRef: "buyer@example.test", billingAddress },
		"place-bank",
	);
	if (!placed.ok) throw new Error(placed.reason);
	expect(placed.order.state).toBe("pending");
	expect(placed.intent.clientAction).toMatchObject({
		kind: "offline_instructions",
		paymentDueAt: "2026-10-03T10:00:00.000Z",
	});
	const stored = await h.stores.orderStore.getById(orderId(placed.order.id));
	expect(stored?.billingAddress).toMatchObject(billingAddress);
	expect(stored?.offlinePayment?.status).toBe("awaiting");
	expect(stored?.holdExpiresAt).toBe("2026-10-03T10:00:00.000Z");
	expect(await h.stores.orderStore.getCapturedPayments(orderId(placed.order.id))).toEqual([]);
	expect(placed.order).not.toHaveProperty("billingAddress");
	expect(h.egressAttempts()).toBe(0);
});

test("private COD acceptance commits stock while unpaid, fulfillment then receipt preserves shipped and captures once", async () => {
	const cartId = await cart();
	const placed = await h.client.createOrder(
		{ cartId, paymentMethod: "cod", buyerRef: "buyer@example.test", billingAddress },
		"place-cod",
	);
	if (!placed.ok) throw new Error(placed.reason);
	const admin = new InProcessAdminOrdersClient(h.ctx, { clock, gateways });
	expect(
		await admin.acceptCODOrder(
			placed.order.id,
			{ acceptedBy: "staff" },
			{ idempotencyKey: "accept" },
		),
	).toMatchObject({ ok: true, applied: true });
	const accepted = await h.stores.orderStore.getById(orderId(placed.order.id));
	expect(accepted?.state).toBe("processing");
	expect(accepted?.offlinePayment?.status).toBe("accepted");
	expect(await h.stores.orderStore.getCapturedPayments(orderId(placed.order.id))).toEqual([]);
	const hold = await collectionOf<ReservationIndexDoc>(
		h.ctx.storage!,
		RESERVATION_INDEX_COLLECTION,
	).get(accepted!.lines[0]!.reservationId!);
	expect(hold?.terminalState).toBe("committed");
	expect(
		await admin.recordFulfillment(
			placed.order.id,
			{ carrier: "Post", trackingNumber: "TRACK1", recordedBy: "staff" },
			{ idempotencyKey: "ship" },
		),
	).toMatchObject({ ok: true });
	const receipt = {
		receiptRef: "delivery-123",
		amountCents: 1500,
		currency: "EUR",
		recordedBy: "staff",
	};
	expect(
		await admin.confirmOfflinePayment(placed.order.id, receipt, { idempotencyKey: "receipt" }),
	).toMatchObject({ ok: true, applied: true });
	expect(
		await admin.confirmOfflinePayment(placed.order.id, receipt, { idempotencyKey: "receipt" }),
	).toMatchObject({ ok: true, applied: false });
	expect((await h.stores.orderStore.getById(orderId(placed.order.id)))?.state).toBe("shipped");
	expect(await h.stores.orderStore.getCapturedPayments(orderId(placed.order.id))).toMatchObject([
		{ amount: 1500, status: "succeeded" },
	]);
});

test("COD refuses digital checkout and changing a placed method cannot create another intent", async () => {
	const digitalCart = await cart("digital");
	expect(
		await h.client.createOrder(
			{ cartId: digitalCart, paymentMethod: "cod", buyerRef: "buyer@example.test", billingAddress },
			"digital-cod",
		),
	).toEqual({ ok: false, reason: "PAYMENT_METHOD_NOT_AVAILABLE" });
	const placed = await h.client.createOrder(
		{
			cartId: digitalCart,
			paymentMethod: "bank_transfer",
			buyerRef: "buyer@example.test",
			billingAddress,
		},
		"bank-digital",
	);
	if (!placed.ok) throw new Error(placed.reason);
	expect(
		await h.client.createOrder(
			{ cartId: digitalCart, paymentMethod: "cod", buyerRef: "buyer@example.test" },
			"bank-digital",
		),
	).toEqual({ ok: false, reason: "IDEMPOTENCY_KEY_REUSED" });
});
