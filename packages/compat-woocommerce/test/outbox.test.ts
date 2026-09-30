import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { makeSqliteStorage } from "@otta-sh/store-emdash/testing";
import { collectionOf } from "@otta-sh/store-emdash";
import { EmDashWooWebhookOutbox, buildWooWebhook, dispatchWooWebhook } from "../src/index.js";
let db: Awaited<ReturnType<typeof makeSqliteStorage>>;
beforeAll(async () => {
	db = await makeSqliteStorage({ woo_webhooks: { indexes: ["state", "availableAt"] } });
});
afterAll(async () => {
	await db.close();
});
beforeEach(async () => {
	await db.reset();
});
async function setup() {
	const outbox = new EmDashWooWebhookOutbox(collectionOf(db.storage, "woo_webhooks"));
	const signed = await buildWooWebhook({
		payload: new TextEncoder().encode('{ "id": 42 }\n'),
		secret: "test-secret",
		source: "https://shop.example/",
		topic: "order.updated",
		webhookId: 1,
		deliveryId: "delivery-1",
	});
	return {
		outbox,
		job: {
			deliveryId: "delivery-1",
			url: "https://erp.example/receiver",
			webhook: signed,
			availableAt: "2026-09-30T00:00:00Z",
		},
	};
}
describe("durable signed Woo webhook delivery over migrated SQLite", () => {
	it("deduplicates a delivery and claims it once through CAS", async () => {
		const { outbox, job } = await setup();
		await outbox.enqueue(job);
		await outbox.enqueue(job);
		const claims = await Promise.all([
			outbox.claim("2026-09-30T00:00:00Z", 30000),
			outbox.claim("2026-09-30T00:00:00Z", 30000),
		]);
		expect(claims.filter(Boolean)).toHaveLength(1);
		expect((await outbox.get("delivery-1"))?.attempts).toBe(1);
	});
	it("retries failed transport with identical bytes, signature and delivery identity", async () => {
		const { outbox, job } = await setup();
		await outbox.enqueue(job);
		const sent: Array<{ body: Uint8Array; headers: Record<string, string> }> = [];
		const transport = async (input: { body: Uint8Array; headers: Record<string, string> }) => {
			sent.push(input);
			return { status: sent.length === 1 ? 503 : 204 };
		};
		expect(await dispatchWooWebhook(outbox, transport, { now: "2026-09-30T00:00:00Z" })).toBe(
			"retryable",
		);
		const first = await outbox.get("delivery-1");
		expect(first?.state).toBe("retryable");
		expect(
			await dispatchWooWebhook(
				new EmDashWooWebhookOutbox(collectionOf(db.storage, "woo_webhooks")),
				transport,
				{ now: "2026-09-30T00:00:10Z" },
			),
		).toBe("delivered");
		expect(sent[0]!.body).toEqual(job.webhook.body);
		expect(sent[1]!.body).toEqual(sent[0]!.body);
		expect(sent[1]!.headers).toEqual(sent[0]!.headers);
		expect((await outbox.get("delivery-1"))?.state).toBe("delivered");
	});
	it("recovers expired leases and rejects changed payload under the same delivery ID", async () => {
		const { outbox, job } = await setup();
		await outbox.enqueue(job);
		const old = await outbox.claim("2026-09-30T00:00:00Z", 1000);
		expect(await outbox.claim("2026-09-30T00:00:00Z", 1000)).toBeNull();
		const recovered = await outbox.claim("2026-09-30T00:00:02Z", 1000);
		expect(recovered?.deliveryId).toBe(old?.deliveryId);
		expect(recovered?.leaseToken).not.toBe(old?.leaseToken);
		expect(await outbox.finish(old!, { state: "delivered", now: "2026-09-30T00:00:02Z" })).toBe(
			false,
		);
		await expect(
			outbox.enqueue({ ...job, webhook: { ...job.webhook, body: new Uint8Array([1]) } }),
		).rejects.toMatchObject({ code: "woocommerce_rest_idempotency_conflict" });
	});
	it("retains terminal responses and transport errors without response bodies or secrets", async () => {
		const { outbox, job } = await setup();
		await outbox.enqueue(job);
		expect(
			await dispatchWooWebhook(outbox, async () => ({ status: 401 }), {
				now: "2026-09-30T00:00:00Z",
			}),
		).toBe("terminal");
		const record = await outbox.get("delivery-1");
		expect(record?.lastStatus).toBe(401);
		expect(record?.state).toBe("terminal");
		expect(
			await dispatchWooWebhook(
				outbox,
				async () => {
					throw new Error("test-secret");
				},
				{ now: "2026-09-30T00:01:00Z" },
			),
		).toBe("idle");
		expect(JSON.stringify(record)).not.toContain("test-secret");
	});
});
