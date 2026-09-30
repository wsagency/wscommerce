import { describe, expect, test } from "vitest";
import { StripePaymentGateway } from "../src/index.js";

const SECRET = "whsec_offline_dashboard_refund",
	NOW = new Date("2026-09-30T12:00:00.000Z"),
	TIMESTAMP = Math.floor(NOW.getTime() / 1000);
const types = ["refund.created", "refund.updated", "refund.failed", "charge.refund.updated"];
const gateway = new StripePaymentGateway({ webhookSecret: SECRET, clock: { now: () => NOW } });

async function signedRefund(type: string, metadata: Record<string, unknown>, secret = SECRET) {
	const text = JSON.stringify({
		id: "evt_dashboard_refund",
		type,
		created: TIMESTAMP,
		data: {
			object: {
				id: "re_dashboard",
				amount: 500,
				currency: "eur",
				payment_intent: "pi_capture",
				status: type === "refund.failed" ? "failed" : "succeeded",
				metadata,
			},
		},
	});
	const encoder = new TextEncoder(),
		key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		),
		signature = new Uint8Array(
			await crypto.subtle.sign("HMAC", key, encoder.encode(`${TIMESTAMP}.${text}`)),
		);
	return {
		kind: "webhook" as const,
		body: encoder.encode(text),
		headers: {
			"Stripe-Signature": `t=${TIMESTAMP},v1=${Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
		},
	};
}

describe("signed refunds outside the native reservation flow", () => {
	test.each(types)(
		"acknowledges %s with empty metadata after verifying its signature",
		async (type) => {
			expect(await gateway.verifyConfirmation(await signedRefund(type, {}))).toEqual({
				ok: false,
				reason: "UNKNOWN_EVENT",
			});
		},
	);
	test.each(types)("rejects bound %s when its native order identifier is missing", async (type) => {
		expect(
			await gateway.verifyConfirmation(await signedRefund(type, { refund_key: "native-refund" })),
		).toEqual({ ok: false, reason: "MALFORMED" });
	});
	test("rejects an invalid signature before acknowledging an unbound refund", async () => {
		expect(
			await gateway.verifyConfirmation(await signedRefund("refund.updated", {}, "whsec_wrong")),
		).toEqual({ ok: false, reason: "INVALID_SIGNATURE" });
	});
	test("continues normalizing a valid bound native refund", async () => {
		expect(
			await gateway.verifyConfirmation(
				await signedRefund("refund.updated", {
					order_id: "native-order",
					refund_key: "native-refund",
				}),
			),
		).toMatchObject({
			ok: true,
			outcome: "refund",
			orderId: "native-order",
			refundKey: "native-refund",
			providerRef: "re_dashboard",
			amount: 500,
			currency: "EUR",
		});
	});
});
