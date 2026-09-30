import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	createWooCredentialAuthenticator,
	hashWooSecret,
	buildWooWebhook,
	verifyWooWebhook,
} from "../src/index.js";
const KEY = `ck_${"a".repeat(40)}`;
const SECRET = `cs_${"b".repeat(40)}`;
describe("Woo secrets and exact-byte webhooks", () => {
	it("authenticates a hashed server credential, retaining explicit scopes and revocation", async () => {
		const digest = await hashWooSecret(SECRET);
		expect(digest).toMatch(/^[a-f0-9]{64}$/);
		const record = {
			consumerKey: KEY,
			secretSha256: digest,
			id: "erp",
			enabled: true,
			scopes: ["orders:read"] as const,
		};
		const auth = createWooCredentialAuthenticator({
			findByConsumerKey: async (k) => (k === KEY ? record : null),
		});
		expect(await auth.authenticate(KEY, SECRET)).toEqual({ id: "erp", scopes: ["orders:read"] });
		expect(await auth.authenticate(KEY, `${SECRET}x`)).toBeNull();
		record.enabled = false;
		expect(await auth.authenticate(KEY, SECRET)).toBeNull();
	});
	it("signs exact UTF-8 bytes with Woo headers and verifies tampering", async () => {
		const payload = new TextEncoder().encode('{ "id": 42, "note": "Čarolija" }\n');
		const webhook = await buildWooWebhook({
			payload,
			secret: "test-webhook-secret",
			source: "https://shop.example/",
			topic: "order.updated",
			webhookId: 5,
			deliveryId: "delivery-001",
		});
		const expected = createHmac("sha256", "test-webhook-secret").update(payload).digest("base64");
		expect(webhook.headers["X-WC-Webhook-Signature"]).toBe(expected);
		expect(webhook.headers).toMatchObject({
			"X-WC-Webhook-Source": "https://shop.example/",
			"X-WC-Webhook-Topic": "order.updated",
			"X-WC-Webhook-Resource": "order",
			"X-WC-Webhook-Event": "updated",
			"X-WC-Webhook-ID": "5",
			"X-WC-Webhook-Delivery-ID": "delivery-001",
		});
		expect(webhook.body).toEqual(payload);
		expect(await verifyWooWebhook(payload, expected, "test-webhook-secret")).toBe(true);
		expect(
			await verifyWooWebhook(
				new TextEncoder().encode('{"id":42,"note":"Čarolija"}'),
				expected,
				"test-webhook-secret",
			),
		).toBe(false);
		expect(await verifyWooWebhook(payload, "invalid", "test-webhook-secret")).toBe(false);
	});
});
