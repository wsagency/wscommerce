import { cents, currency, idempotencyKey, orderId } from "@otta-sh/domain";
import { describe, expect, test } from "vitest";
import {
	OfflinePaymentGateway,
	offlineGatewaysFromCtx,
	OFFLINE_SETTING_KEYS,
} from "../src/payments/offline-gateway.js";
import type { PluginContext } from "../src/types.js";

function context(values: Record<string, unknown>): PluginContext {
	return {
		http: {
			fetch() {
				throw new Error("offline payments must not use transport");
			},
		},
		kv: {
			async get<T>(key: string) {
				return (values[key] ?? null) as T | null;
			},
			async set() {},
			async delete() {
				return false;
			},
			async list() {
				return [];
			},
		},
	};
}

describe("explicit offline gateways", () => {
	test("disabled, incomplete, malformed and unreasonably short configuration stay unavailable", async () => {
		expect(await offlineGatewaysFromCtx(context({}))).toEqual({});
		for (const hours of ["", "0", "0.25", "721", "15 minutes"]) {
			expect(
				await offlineGatewaysFromCtx(
					context({
						[OFFLINE_SETTING_KEYS.bankEnabled]: "true",
						[OFFLINE_SETTING_KEYS.bankInstructions]: "Use bank reference",
						[OFFLINE_SETTING_KEYS.bankWindowHours]: hours,
					}),
				),
			).toEqual({});
		}
	});
	test("bank and COD resolve independently with configured native deadlines", async () => {
		const gateways = await offlineGatewaysFromCtx(
			context({
				[OFFLINE_SETTING_KEYS.bankEnabled]: "true",
				[OFFLINE_SETTING_KEYS.bankInstructions]: "Pay to our bank account",
				[OFFLINE_SETTING_KEYS.bankWindowHours]: "72",
			}),
		);
		expect(gateways.bank_transfer?.checkoutPolicy?.holdTtlMs).toBe(72 * 3600000);
		expect(gateways.cod).toBeUndefined();
	});
	test("instructions come from the frozen order and no public signal can confirm offline money", async () => {
		const gateway = new OfflinePaymentGateway("bank_transfer", "Updated configuration", 72);
		const intent = await gateway.createIntent({
			orderId: orderId("order-1"),
			amount: cents(100),
			currency: currency("EUR"),
			idempotencyKey: idempotencyKey("order-1"),
			lines: [],
			offlinePayment: {
				method: "bank_transfer",
				instructions: "Frozen instructions",
				paymentReference: "order-1",
				paymentDueAt: "2026-10-03T00:00:00.000Z",
			},
		});
		expect(intent.clientAction).toEqual({
			kind: "offline_instructions",
			method: "bank_transfer",
			instructions: "Frozen instructions",
			paymentReference: "order-1",
			paymentDueAt: "2026-10-03T00:00:00.000Z",
		});
		expect(
			await gateway.verifyConfirmation({ kind: "webhook", body: new Uint8Array(), headers: {} }),
		).toEqual({ ok: false, reason: "UNKNOWN_EVENT" });
		expect(gateway.refundable).toBe(false);
	});
});
