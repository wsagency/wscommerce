import type { StorageCollection } from "@otta-sh/store-emdash";
import { canonicalJson, validateInvoiceSnapshot } from "./snapshot.js";
import type {
	DirectInvoiceProvider,
	InvoiceJob,
	InvoiceOutcome,
	InvoiceProvider,
	InvoiceSnapshot,
} from "./types.js";

export const INVOICE_JOB_COLLECTION = "commerce_invoice_jobs";
export const INVOICE_JOB_INDEXES = ["state", "provider", "orderId", "nextAttemptAt"] as const;
const LEASE_MS = 120_000;

export class InvoiceJobStore {
	private readonly now: () => string;
	constructor(
		private readonly collection: StorageCollection,
		options: { now?: () => string } = {},
	) {
		this.now = options.now ?? (() => new Date().toISOString());
	}
	async get(id: string): Promise<InvoiceJob | null> {
		return (await this.collection.get(id)) as InvoiceJob | null;
	}
	async enqueue(
		snapshot: InvoiceSnapshot,
		provider: DirectInvoiceProvider,
		idempotentIssue = false,
	): Promise<InvoiceJob> {
		const validation = validateInvoiceSnapshot(snapshot);
		if (!validation.ok) throw new Error(validation.reason);
		const timestamp = this.now();
		const job: InvoiceJob = {
			id: snapshot.orderId,
			orderId: snapshot.orderId,
			provider,
			idempotentIssue,
			snapshot: structuredClone(snapshot),
			state: "queued",
			attempts: 0,
			createdAt: timestamp,
			updatedAt: timestamp,
			nextAttemptAt: timestamp,
			lease: null,
			document: null,
			code: null,
		};
		const result = await this.collection.compareAndSet(job.id, null, job);
		if (result.applied) return job;
		const existing = await this.get(job.id);
		if (
			!existing ||
			existing.provider !== provider ||
			existing.idempotentIssue !== idempotentIssue ||
			canonicalJson(existing.snapshot) !== canonicalJson(snapshot)
		)
			throw new Error("SNAPSHOT_CONFLICT");
		return existing;
	}
	async claim(id: string, workerId: string): Promise<InvoiceJob | null> {
		for (let attempt = 0; attempt < 12; attempt++) {
			const row = await this.collection.getVersioned(id);
			if (!row) return null;
			const job = row.value as InvoiceJob;
			const timestamp = this.now();
			if (!["queued", "retry", "issuing"].includes(job.state) || job.nextAttemptAt > timestamp)
				return null;
			if (job.state === "issuing") {
				if (job.lease && job.lease.expiresAt > timestamp) return null;
				if (!job.idempotentIssue) {
					const result = await this.collection.compareAndSet(id, row.revision, {
						...job,
						state: "reconciliation",
						updatedAt: timestamp,
						lease: null,
						code: "ISSUE_LEASE_EXPIRED",
					});
					if (result.applied) return null;
					continue;
				}
			}
			const claimed: InvoiceJob = {
				...job,
				state: "issuing",
				attempts: job.attempts + 1,
				updatedAt: timestamp,
				lease: {
					workerId,
					token: crypto.randomUUID(),
					expiresAt: new Date(Date.parse(timestamp) + LEASE_MS).toISOString(),
				},
			};
			if ((await this.collection.compareAndSet(id, row.revision, claimed)).applied) return claimed;
		}
		return null;
	}
	async finish(claim: InvoiceJob, outcome: InvoiceOutcome): Promise<InvoiceJob> {
		for (let attempt = 0; attempt < 12; attempt++) {
			const row = await this.collection.getVersioned(claim.id);
			if (!row) throw new Error("INVOICE_JOB_NOT_FOUND");
			const job = row.value as InvoiceJob;
			if (job.state !== "issuing" || !job.lease || job.lease.token !== claim.lease?.token)
				return job;
			const timestamp = this.now();
			let next: InvoiceJob = { ...job, updatedAt: timestamp, lease: null };
			if (outcome.status === "issued") {
				const valid =
					outcome.document.totalGross === job.snapshot.totalGross &&
					outcome.document.currency === job.snapshot.currency;
				next = {
					...next,
					state: valid ? "issued" : "reconciliation",
					document: outcome.document,
					code: valid ? null : "PROVIDER_TOTAL_MISMATCH",
				};
			} else if (outcome.status === "retryable") {
				next = {
					...next,
					state: "retry",
					code: outcome.code,
					nextAttemptAt: new Date(
						Date.parse(timestamp) + Math.max(1_000, Math.min(86_400_000, outcome.retryAfterMs)),
					).toISOString(),
				};
			} else {
				next = {
					...next,
					state: outcome.status === "unknown" ? "reconciliation" : "failed",
					code: outcome.code,
				};
			}
			if ((await this.collection.compareAndSet(job.id, row.revision, next)).applied) return next;
		}
		throw new Error("INVOICE_WRITE_CONTENTION");
	}
	async pending(limit = 25): Promise<InvoiceJob[]> {
		const page = await this.collection.query({
			where: { state: { in: ["queued", "retry", "issuing"] }, nextAttemptAt: { lte: this.now() } },
			limit,
			orderBy: { nextAttemptAt: "asc" },
		});
		return page.items.map((item) => item.data as InvoiceJob);
	}
}

export async function dispatchInvoiceJob(
	store: InvoiceJobStore,
	id: string,
	provider: InvoiceProvider,
	workerId: string,
): Promise<InvoiceJob> {
	const before = await store.get(id);
	if (!before) throw new Error("INVOICE_JOB_NOT_FOUND");
	if (before.provider !== provider.id || before.idempotentIssue !== provider.idempotentIssue)
		throw new Error("INVOICE_PROVIDER_MISMATCH");
	const claim = await store.claim(id, workerId);
	if (!claim) return (await store.get(id)) ?? before;
	let outcome: InvoiceOutcome;
	try {
		outcome = await provider.issue(claim.snapshot);
	} catch {
		outcome = { status: "unknown", code: "TRANSPORT_UNKNOWN" };
	}
	return store.finish(claim, outcome);
}
