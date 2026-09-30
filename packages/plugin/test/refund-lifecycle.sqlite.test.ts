import {
	cents,
	currency,
	idempotencyKey,
	refundOrder,
	sumFinalizedRefunds,
	sumRefunds,
	type OrderId,
} from "@otta-sh/domain";
import { buildRefundSeed } from "@otta-sh/domain/testing";
import { StripePaymentGateway } from "@otta-sh/payments-stripe";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import {
	makeInProcessCommerce,
	type InProcessCommerceHarness,
} from "./helpers/in-process-commerce.js";
import { signedStripeEvent } from "./helpers/signed-stripe-event.js";
import { createStripeWebhookSettleHandler } from "../src/webhooks/stripe-settle-route.js";
import { STRIPE_WEBHOOK_SECRET_KEY } from "../src/payment-secrets.js";

const USD = currency("USD");
const WEBHOOK_SECRET = "whsec_local_refund_regression";
let h: InProcessCommerceHarness;

beforeEach(async () => {
	if (h === undefined) h = await makeInProcessCommerce();
	else await h.reset();
});
afterAll(async () => h?.close());

function stripeResponse(status: string, amount = 1000, refundRef = "re_regression") {
	let posts = 0;
	const gateway = new StripePaymentGateway({
		webhookSecret: WEBHOOK_SECRET,
		secretKey: "sk_test_local_refund_regression",
		fetch: async (url, init) => {
			if (init?.method === "GET" && String(url).includes("/v1/payment_intents/")) {
				return Response.json({
					latest_charge: { amount_refunded: 0, amount_captured: 1000, currency: "usd" },
				});
			}
			if (init?.method === "POST" && String(url).endsWith("/v1/refunds")) {
				posts++;
				return Response.json({ id: refundRef, object: "refund", amount, currency: "usd", status });
			}
			throw new Error("unexpected Stripe transport path");
		},
	});
	return { gateway, posts: () => posts };
}

async function refundEvent(
	orderId: OrderId,
	key: string,
	status: string,
	created: number,
	options: {
		amount?: number;
		refundRef?: string;
		paymentRef?: string;
		eventId?: string;
		previousStatus?: string;
	} = {},
) {
	await h.ctx.kv.set(STRIPE_WEBHOOK_SECRET_KEY, WEBHOOK_SECRET);
	const event = {
		id: options.eventId ?? `evt_${key}_${status}_${created}`,
		type: status === "failed" ? "refund.failed" : "refund.updated",
		created,
		data: {
			...(options.previousStatus === undefined
				? {}
				: { previous_attributes: { status: options.previousStatus } }),
			object: {
				id: options.refundRef ?? "re_regression",
				object: "refund",
				amount: options.amount ?? 1000,
				currency: "usd",
				status,
				payment_intent: options.paymentRef ?? `pi_${orderId}`,
				charge: null,
				metadata: { order_id: orderId, refund_key: key },
			},
		},
	};
	const input = signedStripeEvent(event, WEBHOOK_SECRET, event.id);
	return createStripeWebhookSettleHandler()(
		{
			input,
			request: { method: "POST", url: "https://shop.example/webhooks/stripe/settle", headers: {} },
		},
		h.ctx,
	);
}

async function reportedRefunds(): Promise<number> {
	const buckets = await h.stores.reportingStore.revenueByPeriod(
		{ from: "2020-01-01T00:00:00.000Z", to: "2099-01-01T00:00:00.000Z" },
		"day",
	);
	return buckets.reduce((sum, bucket) => sum + bucket.refundedCents, 0);
}

async function reportedRefundEntries(): Promise<number> {
	const rows = await h.ctx.storage?.["reporting_daily"]?.query({ limit: 100 });
	if (rows === undefined) throw new Error("reporting collection missing");
	return rows.items.reduce(
		(sum, row) => sum + (row.data as { refundEntries: number }).refundEntries,
		0,
	);
}

describe("Stripe refund lifecycle over migrated SQLite", () => {
	for (const [status, localStatus, reason] of [
		["pending", "unverified", "GATEWAY_PENDING"],
		["requires_action", "unverified", "GATEWAY_PENDING"],
		["failed", "voided", "GATEWAY_TERMINAL"],
		["canceled", "voided", "GATEWAY_TERMINAL"],
	] as const) {
		test(`${status} is not completed money and retains the provider refund reference`, async () => {
			const orderId = await buildRefundSeed(h.stores.orderStore)({
				id: `order-${status}`,
				totalCents: 1000,
			});
			const wire = stripeResponse(status);
			const cmd = {
				orderId,
				amount: cents(1000),
				currency: USD,
				refundedBy: "admin",
				idempotencyKey: idempotencyKey(`refund-${status}`),
			};
			expect(await refundOrder({ orderStore: h.stores.orderStore }, wire.gateway, cmd)).toEqual({
				ok: false,
				reason,
			});
			const [refund] = await h.stores.orderStore.listRefunds(orderId);
			expect(refund).toMatchObject({
				status: localStatus,
				refundRef: "re_regression",
				amount: 1000,
				providerStatus: status,
			});
			expect((await h.stores.orderStore.getById(orderId))?.state).toBe("paid");
			expect(
				(await h.stores.orderStore.listEventsForOrder(orderId)).filter(
					(event) => event.toState === "refunded",
				),
			).toHaveLength(0);
			// Replaying a known provider outcome must never issue another refund.
			expect(await refundOrder({ orderStore: h.stores.orderStore }, wire.gateway, cmd)).toEqual({
				ok: false,
				reason,
			});
			expect(wire.posts()).toBe(1);
		});
	}

	test("a response with the wrong amount cannot finalize the reserved amount", async () => {
		const orderId = await buildRefundSeed(h.stores.orderStore)({
			id: "order-mismatch",
			totalCents: 1000,
		});
		const wire = stripeResponse("succeeded", 500);
		expect(
			await refundOrder({ orderStore: h.stores.orderStore }, wire.gateway, {
				orderId,
				amount: cents(1000),
				currency: USD,
				refundedBy: "admin",
				idempotencyKey: idempotencyKey("refund-mismatch"),
			}),
		).toEqual({ ok: false, reason: "GATEWAY_UNVERIFIED" });
		expect((await h.stores.orderStore.getById(orderId))?.state).toBe("paid");
		expect((await h.stores.orderStore.listRefunds(orderId))[0]?.status).toBe("unverified");
	});

	test("a signed refund.updated completes a pending refund once and ignores older snapshots", async () => {
		const orderId = await buildRefundSeed(h.stores.orderStore)({
			id: "order-event",
			totalCents: 1000,
		});
		const key = "refund-event";
		await refundOrder({ orderStore: h.stores.orderStore }, stripeResponse("pending").gateway, {
			orderId,
			amount: cents(1000),
			currency: USD,
			refundedBy: "admin",
			idempotencyKey: idempotencyKey(key),
		});
		expect(await refundEvent(orderId, key, "succeeded", 200)).toEqual({ ok: true, status: 200 });
		expect(await refundEvent(orderId, key, "succeeded", 200)).toEqual({ ok: true, status: 200 });
		expect(await refundEvent(orderId, key, "pending", 100)).toEqual({ ok: true, status: 200 });
		expect((await h.stores.orderStore.getById(orderId))?.state).toBe("refunded");
		expect(sumFinalizedRefunds(await h.stores.orderStore.listRefunds(orderId))).toBe(1000);
		expect(
			(await h.stores.orderStore.listEventsForOrder(orderId)).filter(
				(event) => event.toState === "refunded",
			),
		).toHaveLength(1);
	});

	test("a later failed event releases pending capacity and permits a distinct replacement", async () => {
		const orderId = await buildRefundSeed(h.stores.orderStore)({
			id: "order-failed-event",
			totalCents: 1000,
		});
		const key = "refund-failed-event";
		await refundOrder({ orderStore: h.stores.orderStore }, stripeResponse("pending").gateway, {
			orderId,
			amount: cents(1000),
			currency: USD,
			refundedBy: "admin",
			idempotencyKey: idempotencyKey(key),
		});
		expect(await refundEvent(orderId, key, "failed", 200)).toEqual({ ok: true, status: 200 });
		expect(sumRefunds(await h.stores.orderStore.listRefunds(orderId))).toBe(0);
		expect(await refundEvent(orderId, key, "pending", 100)).toEqual({ ok: true, status: 200 });
		const replacement = await refundOrder(
			{ orderStore: h.stores.orderStore },
			stripeResponse("succeeded", 1000, "re_replacement").gateway,
			{
				orderId,
				amount: cents(1000),
				currency: USD,
				refundedBy: "admin",
				idempotencyKey: idempotencyKey("replacement"),
			},
		);
		expect(replacement.ok && replacement.fullyRefunded).toBe(true);
	});

	test("a later bank return removes completed money, restores the preceding order state and flags reconciliation", async () => {
		const orderId = await buildRefundSeed(h.stores.orderStore)({
			id: "order-bank-return",
			totalCents: 1000,
		});
		const key = "refund-bank-return";
		await refundOrder({ orderStore: h.stores.orderStore }, stripeResponse("pending").gateway, {
			orderId,
			amount: cents(1000),
			currency: USD,
			refundedBy: "admin",
			idempotencyKey: idempotencyKey(key),
		});
		await refundEvent(orderId, key, "succeeded", 200);
		expect(await reportedRefunds()).toBe(1000);
		expect(await refundEvent(orderId, key, "failed", 300)).toEqual({ ok: true, status: 200 });
		expect(await refundEvent(orderId, key, "succeeded", 200)).toEqual({ ok: true, status: 200 });
		const order = await h.stores.orderStore.getById(orderId);
		expect(order?.state).toBe("paid");
		expect(order?.reconciliationFlag).toContain("re_regression");
		expect(sumFinalizedRefunds(await h.stores.orderStore.listRefunds(orderId))).toBe(0);
		expect(await reportedRefunds()).toBe(0);
		expect(await reportedRefundEntries()).toBe(0);
	});

	for (const [status, reason] of [
		["pending", "GATEWAY_PENDING"],
		["failed", "GATEWAY_TERMINAL"],
	] as const) {
		test(`the newer ${status} webhook wins over an in-flight succeeded create response`, async () => {
			const orderId = await buildRefundSeed(h.stores.orderStore)({
				id: `order-create-race-${status}`,
				totalCents: 1000,
			});
			const key = `refund-create-race-${status}`;
			const gateway = new StripePaymentGateway({
				webhookSecret: WEBHOOK_SECRET,
				secretKey: "sk_test_local_race",
				fetch: async (_url, init) => {
					if (init?.method === "GET")
						return Response.json({
							latest_charge: { amount_refunded: 0, amount_captured: 1000, currency: "usd" },
						});
					expect(await refundEvent(orderId, key, status, 200)).toEqual({ ok: true, status: 200 });
					return Response.json({
						id: "re_regression",
						amount: 1000,
						currency: "usd",
						status: "succeeded",
					});
				},
			});
			expect(
				await refundOrder({ orderStore: h.stores.orderStore }, gateway, {
					orderId,
					amount: cents(1000),
					currency: USD,
					refundedBy: "admin",
					idempotencyKey: idempotencyKey(key),
				}),
			).toEqual({ ok: false, reason });
			expect((await h.stores.orderStore.getById(orderId))?.state).toBe("paid");
			expect((await h.stores.orderStore.getById(orderId))?.reconciliationFlag).toBeNull();
		});
	}

	test("a same-second requires_action update with an explicit predecessor corrects completed money and can complete again", async () => {
		const orderId = await buildRefundSeed(h.stores.orderStore)({
			id: "order-return-to-action",
			totalCents: 1000,
		});
		const key = "refund-return-to-action";
		await refundOrder({ orderStore: h.stores.orderStore }, stripeResponse("pending").gateway, {
			orderId,
			amount: cents(1000),
			currency: USD,
			refundedBy: "admin",
			idempotencyKey: idempotencyKey(key),
		});
		await refundEvent(orderId, key, "succeeded", 200);
		expect(await reportedRefunds()).toBe(1000);
		expect(
			await refundEvent(orderId, key, "requires_action", 200, { previousStatus: "succeeded" }),
		).toEqual({ ok: true, status: 200 });
		// Redelivery of the already-consumed predecessor is not another completion.
		expect(await refundEvent(orderId, key, "succeeded", 200)).toEqual({ ok: true, status: 200 });
		expect(sumFinalizedRefunds(await h.stores.orderStore.listRefunds(orderId))).toBe(0);
		expect(sumRefunds(await h.stores.orderStore.listRefunds(orderId))).toBe(1000);
		expect(await reportedRefunds()).toBe(0);
		await refundEvent(orderId, key, "succeeded", 300);
		expect((await h.stores.orderStore.getById(orderId))?.state).toBe("refunded");
		expect(await reportedRefunds()).toBe(1000);
		const range = { from: "2020-01-01T00:00:00.000Z", to: "2099-01-01T00:00:00.000Z" };
		const buckets = await h.stores.reportingStore.revenueByPeriod(range, "day");
		expect(buckets.reduce((sum, bucket) => sum + bucket.revenueCents, 0)).toBe(0);
		const counts = await h.stores.reportingStore.ordersByStatus(range);
		expect(counts.find((row) => row.status === "refunded")?.orderCount).toBe(1);
		expect(counts.find((row) => row.status === "paid")?.orderCount ?? 0).toBe(0);
	});

	test("a signed event cannot rebind a reserved refund to a different amount or captured payment", async () => {
		const orderId = await buildRefundSeed(h.stores.orderStore)({
			id: "order-event-mismatch",
			totalCents: 1000,
		});
		const key = "refund-event-mismatch";
		await refundOrder({ orderStore: h.stores.orderStore }, stripeResponse("pending").gateway, {
			orderId,
			amount: cents(1000),
			currency: USD,
			refundedBy: "admin",
			idempotencyKey: idempotencyKey(key),
		});
		for (const options of [
			{ amount: 500 },
			{ paymentRef: "pi_other" },
			{ refundRef: "re_other" },
		]) {
			expect(await refundEvent(orderId, key, "succeeded", 200, options)).toEqual({
				ok: false,
				status: 200,
				reason: "AMOUNT_MISMATCH",
			});
		}
		expect(sumFinalizedRefunds(await h.stores.orderStore.listRefunds(orderId))).toBe(0);
		expect(sumRefunds(await h.stores.orderStore.listRefunds(orderId))).toBe(1000);
	});

	test("rebuilding reporting absorbs a delayed refund correction completion", async () => {
		const orderId = await buildRefundSeed(h.stores.orderStore)({
			id: "order-report-rebuild",
			totalCents: 1000,
		});
		const key = "refund-report-rebuild";
		await refundOrder({ orderStore: h.stores.orderStore }, stripeResponse("pending").gateway, {
			orderId,
			amount: cents(1000),
			currency: USD,
			refundedBy: "admin",
			idempotencyKey: idempotencyKey(key),
		});
		await refundEvent(orderId, key, "succeeded", 200);
		await refundEvent(orderId, key, "requires_action", 300, { previousStatus: "succeeded" });
		await refundEvent(orderId, key, "succeeded", 400);
		const order = (await h.stores.orderStore.getById(orderId))!;
		const [refund] = await h.stores.orderStore.listRefunds(orderId);
		// Simulate a restored reporting projection; durable order history is kept.
		for (const name of ["reporting_daily", "reporting_applied"]) {
			const collection = h.ctx.storage?.[name];
			if (collection === undefined) throw new Error("reporting collection missing");
			for (const row of (await collection.query({ limit: 100 })).items)
				await collection.delete(row.id);
		}
		await h.stores.reportingStore.reconcile({ from: order.createdAt, to: order.createdAt });
		expect(await reportedRefunds()).toBe(1000);
		await h.stores.reportingStore.recordOrderEvent({
			kind: "refund",
			orderId,
			orderCreatedAt: order.createdAt,
			currency: USD,
			refundId: `${refund!.id}:3`,
			refundedCents: 1000,
		});
		expect(await reportedRefunds()).toBe(1000);
	});

	test("a timed-out create holds capacity and a signed completion heals it without a second POST", async () => {
		const orderId = await buildRefundSeed(h.stores.orderStore)({
			id: "order-timeout",
			totalCents: 1000,
		});
		let posts = 0;
		const gateway = new StripePaymentGateway({
			webhookSecret: WEBHOOK_SECRET,
			secretKey: "sk_test_local_timeout",
			fetch: async (_url, init) => {
				if (init?.method === "GET")
					return Response.json({
						latest_charge: { amount_refunded: 0, amount_captured: 1000, currency: "usd" },
					});
				posts++;
				throw new Error("network connection lost after issuing");
			},
		});
		const key = "refund-timeout";
		const cmd = {
			orderId,
			amount: cents(1000),
			currency: USD,
			refundedBy: "admin",
			idempotencyKey: idempotencyKey(key),
		};
		for (let i = 0; i < 2; i++)
			expect(await refundOrder({ orderStore: h.stores.orderStore }, gateway, cmd)).toEqual({
				ok: false,
				reason: "GATEWAY_UNVERIFIED",
			});
		expect(
			await refundOrder({ orderStore: h.stores.orderStore }, gateway, {
				...cmd,
				idempotencyKey: idempotencyKey("blind-second-key"),
			}),
		).toEqual({ ok: false, reason: "REFUND_EXCEEDS_TOTAL" });
		expect(posts).toBe(1);
		expect(await refundEvent(orderId, key, "succeeded", 200)).toEqual({ ok: true, status: 200 });
		expect((await h.stores.orderStore.getById(orderId))?.state).toBe("refunded");
	});

	test("two partial provider completions drive a full refund only after the second success", async () => {
		const orderId = await buildRefundSeed(h.stores.orderStore)({
			id: "order-partials",
			totalCents: 1000,
		});
		for (const [key, ref] of [
			["partial-a", "re_a"],
			["partial-b", "re_b"],
		] as const) {
			await refundOrder(
				{ orderStore: h.stores.orderStore },
				stripeResponse("pending", 500, ref).gateway,
				{
					orderId,
					amount: cents(500),
					currency: USD,
					refundedBy: "admin",
					idempotencyKey: idempotencyKey(key),
				},
			);
			expect((await h.stores.orderStore.getById(orderId))?.state).toBe("paid");
			expect(
				await refundEvent(orderId, key, "succeeded", 200, { amount: 500, refundRef: ref }),
			).toEqual({ ok: true, status: 200 });
			expect((await h.stores.orderStore.getById(orderId))?.state).toBe(
				key === "partial-a" ? "paid" : "refunded",
			);
		}
		expect(sumFinalizedRefunds(await h.stores.orderStore.listRefunds(orderId))).toBe(1000);
	});
});
