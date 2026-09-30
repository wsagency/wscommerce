import type { WooAuthenticator, WooCredentialStore } from "./types.js";
import { invalid } from "./errors.js";
const encoder = new TextEncoder();
export function bytesToBase64(bytes: Uint8Array): string {
	let value = "";
	for (const byte of bytes) value += String.fromCharCode(byte);
	return btoa(value);
}
export function base64ToBytes(base64: string): Uint8Array {
	return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
export async function hashWooSecret(secret: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(secret)));
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function equalDigest(a: string, b: string): boolean {
	if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
	let mismatch = 0;
	for (let i = 0; i < 64; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return mismatch === 0;
}
export function createWooCredentialAuthenticator(store: WooCredentialStore): WooAuthenticator {
	return {
		async authenticate(key, secret) {
			if (!/^ck_[a-f0-9]{40}$/.test(key) || !/^cs_[a-f0-9]{40}$/.test(secret)) return null;
			const record = await store.findByConsumerKey(key);
			// Perform a digest comparison even when the key is absent or revoked.
			const actual = await hashWooSecret(secret);
			const matched = equalDigest(actual, record?.secretSha256 ?? "0".repeat(64));
			return record?.enabled && matched ? { id: record.id, scopes: record.scopes } : null;
		},
	};
}
export interface WooWebhookInput {
	payload: Uint8Array;
	secret: string;
	source: string;
	topic: string;
	webhookId: number;
	deliveryId: string;
}
export interface WooWebhook {
	body: Uint8Array;
	headers: Record<string, string>;
}
async function hmacKey(secret: string): Promise<CryptoKey> {
	if (!secret) invalid("A webhook secret is required.");
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}
export async function buildWooWebhook(input: WooWebhookInput): Promise<WooWebhook> {
	const match = /^(order|product|customer)\.(created|updated|deleted)$/.exec(input.topic);
	if (
		!match ||
		!Number.isSafeInteger(input.webhookId) ||
		input.webhookId < 1 ||
		!input.deliveryId ||
		input.deliveryId.length > 200
	)
		invalid("Invalid webhook identity or topic.");
	const source = new URL(input.source);
	if (source.protocol !== "https:" || source.username || source.password)
		invalid("The webhook source must be HTTPS without credentials.");
	const body = new Uint8Array(input.payload);
	const signature = await crypto.subtle.sign("HMAC", await hmacKey(input.secret), body);
	return {
		body,
		headers: {
			"Content-Type": "application/json",
			"X-WC-Webhook-Source": source.toString(),
			"X-WC-Webhook-Topic": input.topic,
			"X-WC-Webhook-Resource": match[1]!,
			"X-WC-Webhook-Event": match[2]!,
			"X-WC-Webhook-ID": String(input.webhookId),
			"X-WC-Webhook-Delivery-ID": input.deliveryId,
			"X-WC-Webhook-Signature": bytesToBase64(new Uint8Array(signature)),
		},
	};
}
export async function verifyWooWebhook(
	bytes: Uint8Array,
	signature: string,
	secret: string,
): Promise<boolean> {
	try {
		if (!/^[A-Za-z0-9+/]{43}=$/.test(signature) || !secret) return false;
		const raw = base64ToBytes(signature);
		if (raw.length !== 32) return false;
		return await crypto.subtle.verify(
			"HMAC",
			await hmacKey(secret),
			new Uint8Array(raw),
			new Uint8Array(bytes),
		);
	} catch {
		return false;
	}
}
