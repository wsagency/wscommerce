import { CAS_RETRY, casDone, withCasRetry, type StorageCollection } from "@otta-sh/store-emdash";
import type { WooWebhook } from "./security.js";
import { base64ToBytes, bytesToBase64 } from "./security.js";
import { invalid, WooMutationError } from "./errors.js";
export interface WooWebhookEnqueue {
	deliveryId: string;
	url: string;
	webhook: WooWebhook;
	availableAt: string;
}
export interface WooWebhookJob {
	deliveryId: string;
	url: string;
	bodyBase64: string;
	headers: Record<string, string>;
	state: "queued" | "leased" | "retryable" | "delivered" | "terminal";
	availableAt: string;
	leaseToken: string | null;
	leaseUntil: string | null;
	attempts: number;
	lastStatus: number | null;
}
export interface WooWebhookLease extends WooWebhookJob {
	leaseToken: string;
}
export interface WooWebhookFinish {
	state: "delivered" | "retryable" | "terminal";
	now: string;
	availableAt?: string;
	status?: number;
}
export interface WooWebhookOutboxPort {
	enqueue(input: WooWebhookEnqueue): Promise<void>;
	get(id: string): Promise<WooWebhookJob | null>;
	claim(now: string, leaseMs: number): Promise<WooWebhookLease | null>;
	finish(lease: WooWebhookLease, outcome: WooWebhookFinish): Promise<boolean>;
}
function timestamp(input: string): string {
	const now = new Date(input);
	if (Number.isNaN(now.valueOf())) invalid("Invalid delivery timestamp.");
	return now.toISOString();
}
function headersEqual(a: Record<string, string>, b: Record<string, string>): boolean {
	return (
		JSON.stringify(Object.entries(a).toSorted()) === JSON.stringify(Object.entries(b).toSorted())
	);
}
export class EmDashWooWebhookOutbox implements WooWebhookOutboxPort {
	constructor(private readonly collection: StorageCollection<WooWebhookJob>) {}
	async enqueue(input: WooWebhookEnqueue): Promise<void> {
		const url = new URL(input.url);
		if (url.protocol !== "https:" || url.username || url.password || url.hash)
			invalid(
				"Webhook destinations must be configured HTTPS URLs without credentials or fragments.",
			);
		if (
			!input.deliveryId ||
			input.deliveryId.length > 200 ||
			input.webhook.body.length > 262144 ||
			input.webhook.headers["X-WC-Webhook-Delivery-ID"] !== input.deliveryId
		)
			invalid("Invalid delivery identity or payload size.");
		const doc: WooWebhookJob = {
			deliveryId: input.deliveryId,
			url: url.toString(),
			bodyBase64: bytesToBase64(input.webhook.body),
			headers: { ...input.webhook.headers },
			state: "queued",
			availableAt: timestamp(input.availableAt),
			leaseToken: null,
			leaseUntil: null,
			attempts: 0,
			lastStatus: null,
		};
		await withCasRetry("wooEnqueueWebhook", async () => {
			const current = await this.collection.get(input.deliveryId);
			if (current) {
				if (
					current.url !== doc.url ||
					current.bodyBase64 !== doc.bodyBase64 ||
					!headersEqual(current.headers, doc.headers)
				)
					throw new WooMutationError(
						"woocommerce_rest_idempotency_conflict",
						"A different webhook already uses this delivery identity.",
						409,
					);
				return casDone(undefined);
			}
			const written = await this.collection.compareAndSet(input.deliveryId, null, doc);
			return written.applied ? casDone(undefined) : CAS_RETRY;
		});
	}
	async get(id: string): Promise<WooWebhookJob | null> {
		return this.collection.get(id);
	}
	async claim(now: string, leaseMs: number): Promise<WooWebhookLease | null> {
		const at = timestamp(now);
		if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 3600000)
			invalid("Invalid webhook lease duration.");
		// availableAt is the retry deadline OR the lease expiry. Terminal/delivered rows never enter this query.
		const candidates = await this.collection.query({
			where: { state: { in: ["queued", "retryable", "leased"] }, availableAt: { lte: at } },
			orderBy: { availableAt: "asc" },
			limit: 100,
		});
		for (const candidate of candidates.items) {
			const result = await withCasRetry("wooClaimWebhook", async () => {
				const current = await this.collection.getVersioned(candidate.id);
				if (
					!current ||
					!["queued", "retryable", "leased"].includes(current.value.state) ||
					current.value.availableAt > at
				)
					return casDone<WooWebhookLease | null>(null);
				const lease: WooWebhookLease = {
					...current.value,
					state: "leased",
					leaseToken: crypto.randomUUID(),
					leaseUntil: new Date(new Date(at).valueOf() + leaseMs).toISOString(),
					availableAt: new Date(new Date(at).valueOf() + leaseMs).toISOString(),
					attempts: current.value.attempts + 1,
				};
				const written = await this.collection.compareAndSet(candidate.id, current.revision, lease);
				return written.applied ? casDone(lease) : CAS_RETRY;
			});
			if (result) return result;
		}
		return null;
	}
	async finish(lease: WooWebhookLease, outcome: WooWebhookFinish): Promise<boolean> {
		const now = timestamp(outcome.now);
		if (
			outcome.status !== undefined &&
			(!Number.isInteger(outcome.status) || outcome.status < 100 || outcome.status > 599)
		)
			invalid("Invalid HTTP status.");
		return withCasRetry("wooFinishWebhook", async () => {
			const current = await this.collection.getVersioned(lease.deliveryId);
			if (
				!current ||
				current.value.state !== "leased" ||
				current.value.leaseToken !== lease.leaseToken ||
				!current.value.leaseUntil ||
				current.value.leaseUntil <= now
			)
				return casDone(false);
			const next: WooWebhookJob = {
				...current.value,
				state: outcome.state,
				availableAt: timestamp(outcome.availableAt ?? now),
				leaseToken: null,
				leaseUntil: null,
				lastStatus: outcome.status ?? null,
			};
			const written = await this.collection.compareAndSet(lease.deliveryId, current.revision, next);
			return written.applied ? casDone(true) : CAS_RETRY;
		});
	}
}
/** Host transport must enforce its allowedHosts policy and disable redirects; no ambient fetch. */
export type WooWebhookTransport = (input: {
	url: string;
	headers: Record<string, string>;
	body: Uint8Array;
	redirect: "manual";
}) => Promise<{ status: number }>;
export async function dispatchWooWebhook(
	outbox: WooWebhookOutboxPort,
	transport: WooWebhookTransport,
	options: { now: string; leaseMs?: number; maxAttempts?: number; clockNow?: () => string },
): Promise<"delivered" | "retryable" | "terminal" | "idle" | "lease_lost"> {
	const maxAttempts = options.maxAttempts ?? 10;
	if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100)
		invalid("Invalid webhook retry budget.");
	const lease = await outbox.claim(options.now, options.leaseMs ?? 30000);
	if (!lease) return "idle";
	let status: number | undefined, state: WooWebhookFinish["state"];
	try {
		status = (
			await transport({
				url: lease.url,
				headers: { ...lease.headers },
				body: base64ToBytes(lease.bodyBase64),
				redirect: "manual",
			})
		).status;
		if (!Number.isInteger(status) || status < 100 || status > 599) {
			status = undefined;
			state = "retryable";
		} else
			state =
				status >= 200 && status < 300
					? "delivered"
					: status === 408 || status === 429 || status >= 500
						? "retryable"
						: "terminal";
	} catch {
		state = "retryable";
	}
	if (state === "retryable" && lease.attempts >= maxAttempts) state = "terminal";
	const delay = Math.min(1000 * 2 ** Math.min(lease.attempts - 1, 16), 3600000);
	const finishedAt = options.clockNow?.() ?? options.now;
	const saved = await outbox.finish(lease, {
		state,
		now: finishedAt,
		...(status === undefined ? {} : { status }),
		...(state === "retryable"
			? { availableAt: new Date(new Date(finishedAt).valueOf() + delay).toISOString() }
			: {}),
	});
	return saved ? state : "lease_lost";
}
