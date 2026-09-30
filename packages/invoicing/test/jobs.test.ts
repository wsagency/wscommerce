import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Kysely, SqliteDialect, sql } from "kysely";
import Database from "better-sqlite3";
import { PluginStorageRepository } from "emdash";
import { runMigrations } from "emdash/db";
import type { StorageCollection } from "@otta-sh/store-emdash";
import { INVOICE_JOB_COLLECTION, InvoiceJobStore, dispatchInvoiceJob } from "../src/index.js";
import type { InvoiceJob, InvoiceProvider } from "../src/index.js";
import { invoiceFixture } from "./fixtures.js";

function provider(
	outcome: Awaited<ReturnType<InvoiceProvider["issue"]>>,
	safe = false,
): InvoiceProvider {
	return {
		id: "solo",
		idempotentIssue: safe,
		async issue() {
			return outcome;
		},
	};
}

describe("durable invoice work on actual migrated storage", () => {
	let db: Parameters<typeof runMigrations>[0];
	let collection: StorageCollection;
	let store: InvoiceJobStore;
	let now = "2026-09-30T10:00:00.000Z";
	beforeAll(async () => {
		db = new Kysely({
			dialect: new SqliteDialect({ database: new Database(":memory:") }),
		}) as Parameters<typeof runMigrations>[0];
		await runMigrations(db);
		collection = new PluginStorageRepository(db, "emdash-commerce", INVOICE_JOB_COLLECTION, [
			"state",
			"provider",
			"orderId",
			"nextAttemptAt",
		]);
	});
	beforeEach(async () => {
		await sql`DELETE FROM _plugin_storage`.execute(db);
		store = new InvoiceJobStore(collection, { now: () => now });
		now = "2026-09-30T10:00:00.000Z";
	});
	afterAll(async () => db.destroy());

	it("enqueues one immutable job per order and rejects changed snapshots", async () => {
		const a = await store.enqueue(invoiceFixture(), "solo");
		const b = await store.enqueue(invoiceFixture(), "solo");
		expect(a.id).toBe(b.id);
		expect(await collection.count()).toBe(1);
		await expect(
			store.enqueue(
				{ ...invoiceFixture(), billing: { ...invoiceFixture().billing, name: "Changed" } },
				"solo",
			),
		).rejects.toThrow("SNAPSHOT_CONFLICT");
	});
	it("allows only one active lease and confirmed success cannot issue twice", async () => {
		const job = await store.enqueue(invoiceFixture(), "solo");
		const result = await dispatchInvoiceJob(
			store,
			job.id,
			provider({
				status: "issued",
				document: {
					id: "invoice-1",
					number: "2026-1",
					totalGross: invoiceFixture().totalGross,
					currency: invoiceFixture().currency,
					url: null,
				},
			}),
			"worker-1",
		);
		expect(result.state).toBe("issued");
		expect(await store.claim(job.id, "worker-2")).toBeNull();
	});
	it("keeps an unknown Solo outcome for reconciliation instead of issuing again", async () => {
		const job = await store.enqueue(invoiceFixture(), "solo");
		const result = await dispatchInvoiceJob(
			store,
			job.id,
			provider({ status: "unknown", code: "TRANSPORT_UNKNOWN" }),
			"worker-1",
		);
		expect(result.state).toBe("reconciliation");
		now = "2026-10-01T10:00:00.000Z";
		expect(await store.claim(job.id, "worker-2")).toBeNull();
	});
	it("expired issue leases never become blind retries for a non-idempotent provider", async () => {
		const job = await store.enqueue(invoiceFixture(), "solo");
		expect(await store.claim(job.id, "worker-1")).not.toBeNull();
		now = "2026-09-30T11:00:00.000Z";
		expect(await store.claim(job.id, "worker-2")).toBeNull();
		expect((await store.get(job.id))?.state).toBe("reconciliation");
	});
	it("provider-side idempotency permits safe recovery with the same correlation key", async () => {
		const job = await store.enqueue(invoiceFixture(), "e-racuni", true);
		await store.claim(job.id, "worker-1");
		now = "2026-09-30T11:00:00.000Z";
		const recovered = await store.claim(job.id, "worker-2");
		expect(recovered?.snapshot.reference).toBe(invoiceFixture().reference);
		expect(recovered?.attempts).toBe(2);
	});
	it("rejects a different provider total and exposes reconciliation", async () => {
		const job = await store.enqueue(invoiceFixture(), "solo");
		const bad: InvoiceJob = await dispatchInvoiceJob(
			store,
			job.id,
			provider({
				status: "issued",
				document: {
					id: "invoice-1",
					number: "2026-1",
					totalGross: 1700 as InvoiceJob["snapshot"]["totalGross"],
					currency: invoiceFixture().currency,
					url: null,
				},
			}),
			"worker-1",
		);
		expect(bad.state).toBe("reconciliation");
		expect(bad.code).toBe("PROVIDER_TOTAL_MISMATCH");
	});
	it("prevents a second invoice provider from owning the same order", async () => {
		await store.enqueue(invoiceFixture(), "solo");
		await expect(store.enqueue(invoiceFixture(), "e-racuni", true)).rejects.toThrow(
			"SNAPSHOT_CONFLICT",
		);
	});
	it("a different reference cannot create a second invoice job for the same native order", async () => {
		await store.enqueue(invoiceFixture(), "solo");
		await expect(
			store.enqueue({ ...invoiceFixture(), reference: "another-reference" }, "solo"),
		).rejects.toThrow("SNAPSHOT_CONFLICT");
	});
	it("fences a late worker result after an idempotent lease is recovered", async () => {
		const job = await store.enqueue(invoiceFixture(), "e-racuni", true);
		const first = await store.claim(job.id, "worker-1");
		now = "2026-09-30T11:00:00.000Z";
		const second = await store.claim(job.id, "worker-2");
		await store.finish(first!, { status: "terminal", code: "STALE_WORKER" });
		expect((await store.get(job.id))?.lease?.token).toBe(second?.lease?.token);
		await store.finish(second!, {
			status: "issued",
			document: {
				id: "invoice-1",
				number: "2026-1",
				totalGross: invoiceFixture().totalGross,
				currency: invoiceFixture().currency,
				url: null,
			},
		});
		expect((await store.get(job.id))?.state).toBe("issued");
	});
	it("allows one of two concurrent claims and pages pending jobs by their declared indexes", async () => {
		const job = await store.enqueue(invoiceFixture(), "solo");
		const claims = await Promise.all([store.claim(job.id, "one"), store.claim(job.id, "two")]);
		expect(claims.filter(Boolean)).toHaveLength(1);
		expect((await store.pending()).map((row) => row.id)).toContain(job.id);
	});
	it("blocking an active or expired issue preserves unknown provider evidence", async () => {
		const job = await store.enqueue(invoiceFixture(), "solo");
		const claim = await store.claim(job.id, "one");
		expect((await store.block(job.id, "REFUND_ACCOUNTING_REQUIRED"))?.lease?.token).toBe(
			claim?.lease?.token,
		);
		now = "2026-09-30T11:00:00.000Z";
		expect(await store.block(job.id, "REFUND_ACCOUNTING_REQUIRED")).toMatchObject({
			state: "reconciliation",
			code: "ISSUE_LEASE_EXPIRED",
		});
		await store.finish(claim!, { status: "terminal", code: "STALE_WORKER" });
		expect((await store.get(job.id))?.state).toBe("reconciliation");
	});
});
