import { cents, currency, idempotencyKey, orderId } from "@otta-sh/domain";
import { expect, test } from "vitest";
import type { ReportingOrderEvent, StorageAccess, StorageCollection } from "../src/index.js";
import { REPORTING_DAILY_COLLECTION } from "../src/index.js";
import { delegatingCollection, withCollection } from "./helpers/fault-injection.js";
import { makeOrderHarness } from "./order-harness.js";
import { makeReportingHarness } from "./reporting-harness.js";

const JOURNALS = "reporting_refund_journals";
const RANGE = { from: "2026-01-01T00:00:00.000Z", to: "2026-01-01T23:59:59.999Z" };
const CREATED = RANGE.from;

interface Bound {
	readonly storage: StorageAccess;
	collection<T>(name: string): StorageCollection<T>;
}

async function fixture(
	bound: Bound,
	writer?: (event: ReportingOrderEvent) => Promise<void>,
	amount = 250,
	state: "paid" | "pending" = "paid",
) {
	const events: ReportingOrderEvent[] = [];
	const anomalies: unknown[] = [];
	const reporting = makeReportingHarness(bound.storage, {
		onAnomaly: (value) => anomalies.push(value),
	});
	const h = makeOrderHarness(bound.storage, {
		reporting: {
			async recordOrderEvent(event) {
				events.push(event);
				await writer?.(event);
			},
		},
	});
	const id = orderId("journal-order");
	const key = idempotencyKey("journal-refund");
	const usd = currency("USD");
	await reporting.seedOrder({
		id,
		state,
		currency: "USD",
		createdAt: CREATED,
		totalCents: 1000,
	});
	await h.store.recordPayment({
		orderId: id,
		gateway: "stripe",
		providerRef: "pi_journal",
		amount: cents(1000),
		currency: usd,
		status: "succeeded",
	});
	await h.store.reserveRefund({
		orderId: id,
		amount: cents(amount),
		currency: usd,
		kind: "gateway",
		gateway: "stripe",
		paymentRef: "pi_journal",
		refundRef: null,
		reason: null,
		refundedBy: "staff",
		idempotencyKey: key,
	});
	const binding = {
		orderId: id,
		gateway: "stripe" as const,
		idempotencyKey: key,
		paymentRef: "pi_journal",
		refundRef: "re_journal",
		amount: cents(amount),
		currency: usd,
	};
	const succeed = () =>
		h.store.applyRefundProviderOutcome({
			...binding,
			providerStatus: "succeeded",
			event: { id: "evt_success", created: 10 },
		});
	const fail = () =>
		h.store.applyRefundProviderOutcome({
			...binding,
			providerStatus: "failed",
			event: { id: "evt_failure", created: 11, previousStatus: "succeeded" },
		});
	const refundEvent = (index: number): ReportingOrderEvent => {
		const event = events.filter((value) => value.kind === "refund")[index];
		if (event === undefined) throw new Error("Missing native refund event");
		return event;
	};
	return { reporting, h, id, events, anomalies, succeed, fail, refundEvent };
}

function gate() {
	let entered!: () => void, resume!: () => void;
	return {
		entered: new Promise<void>((resolve) => {
			entered = resolve;
		}),
		wait: new Promise<void>((resolve) => {
			resume = resolve;
		}),
		arrive: () => entered(),
		release: () => resume(),
	};
}

export function reportingRefundJournalCases(bound: Bound): void {
	for (const missing of [false, true])
		test(`a full refund heals ${missing ? "missing" : "delayed"} prior paid reporting on a healed old day`, async () => {
			const paused = gate();
			let f!: Awaited<ReturnType<typeof fixture>>;
			f = await fixture(
				bound,
				async (event) => {
					if (event.kind === "transition" && event.toState === "paid") {
						paused.arrive();
						if (missing) throw new Error("INJECTED_PAID_REPORT_CRASH");
						await paused.wait;
					}
					await f.reporting.store.recordOrderEvent(event);
				},
				1000,
				"pending",
			);
			await f.reporting.store.reconcile(RANGE);
			const paid = f.h.store.markPaid(f.id);
			await paused.entered;
			try {
				expect((await f.succeed()).refund?.status).toBe("recorded");
				expect(await f.reporting.store.ordersByStatus(RANGE)).toEqual([
					{ status: "refunded", orderCount: 1 },
				]);
			} finally {
				paused.release();
			}
			await paid;
			await f.reporting.store.recordOrderEvent(f.refundEvent(0));
			expect(await f.reporting.store.ordersByStatus(RANGE)).toEqual([
				{ status: "refunded", orderCount: 1 },
			]);
			expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]).toMatchObject({
				revenueCents: 0,
				refundedCents: 1000,
			});
			expect((await f.reporting.dailyRaw.get("USD:2026-01-01"))?.refundJournalToken).toBeNull();
			expect(f.anomalies).toContainEqual({
				kind: "refund_rebuilt",
				docId: "USD:2026-01-01",
				orderId: f.id,
				nativeRefundId: expect.any(String),
			});
		});
	test("a fulfillment transition racing refund reports heals drift from the native journal immediately", async () => {
		const positive = gate(),
			negative = gate();
		let f!: Awaited<ReturnType<typeof fixture>>;
		f = await fixture(
			bound,
			async (event) => {
				if (event.kind === "refund") {
					const paused = event.refundedCents > 0 ? positive : negative;
					paused.arrive();
					await paused.wait;
				}
				await f.reporting.store.recordOrderEvent(event);
			},
			1000,
		);
		const first = f.succeed();
		await positive.entered;
		const second = f.fail();
		await negative.entered;
		try {
			expect(
				(
					await f.h.store.transition({
						orderId: f.id,
						fromState: "paid",
						toState: "processing",
						enqueueEmail: false,
						idempotencyKey: idempotencyKey("journal-fulfillment-transition"),
					})
				).transitioned,
			).toBe(true);
		} finally {
			positive.release();
			negative.release();
		}
		await Promise.all([first, second]);
		await expect(f.reporting.store.recordOrderEvent(f.refundEvent(1))).resolves.toBeUndefined();
		expect(await f.reporting.store.ordersByStatus(RANGE)).toEqual([
			{ status: "processing", orderCount: 1 },
		]);
		expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]).toMatchObject({
			revenueCents: 1000,
			refundedCents: 0,
		});
	});
	test("a full refund correction orders its associated state counters with the financial prefix", async () => {
		const paused = gate();
		let f!: Awaited<ReturnType<typeof fixture>>;
		f = await fixture(
			bound,
			async (event) => {
				if (event.kind === "refund" && event.refundedCents > 0) {
					paused.arrive();
					await paused.wait;
				}
				await f.reporting.store.recordOrderEvent(event);
			},
			1000,
		);
		await f.reporting.store.reconcile(RANGE);
		const first = f.succeed();
		await paused.entered;
		try {
			await f.fail();
		} finally {
			paused.release();
		}
		await first;
		expect(await f.reporting.store.ordersByStatus(RANGE)).toEqual([
			{ status: "paid", orderCount: 1 },
		]);
		expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]).toMatchObject({
			revenueCents: 1000,
			refundedCents: 0,
		});
		expect(f.anomalies).toEqual([]);
	});
	for (const healed of [false, true]) {
		test(`a newer refund reversal completes the paused financial prefix (${healed ? "already healed old day" : "new day"})`, async () => {
			const paused = gate();
			let f!: Awaited<ReturnType<typeof fixture>>;
			f = await fixture(bound, async (event) => {
				if (event.kind === "refund" && event.refundedCents > 0) {
					paused.arrive();
					await paused.wait;
				}
				await f.reporting.store.recordOrderEvent(event);
			});
			if (healed) await f.reporting.store.reconcile(RANGE);
			const first = f.succeed();
			await paused.entered;
			try {
				expect((await f.fail()).refund?.status).toBe("voided");
				expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(0);
			} finally {
				paused.release();
			}
			await first;
			expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(0);
			expect(f.anomalies).toEqual([]);
			expect(f.refundEvent(0)).toMatchObject({
				nativeRefundId: expect.any(String),
				financialRevision: 1,
			});
			expect(f.refundEvent(1)).toMatchObject({
				nativeRefundId: expect.any(String),
				financialRevision: 2,
			});
			await f.reporting.store.reconcile(RANGE);
			await f.reporting.store.recordOrderEvent(f.refundEvent(1));
			await f.reporting.store.recordOrderEvent(f.refundEvent(0));
			expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(0);
		});
	}

	for (const seam of ["before-delta", "after-delta", "before-prefix", "after-prefix"] as const) {
		for (const target of [1, 2])
			test(`a refund journal replays revision ${target} with an interrupted prerequisite ${seam}`, async () => {
				const f = await fixture(bound);
				await f.succeed();
				if (target === 2) await f.fail();
				const raw = bound.collection<Record<string, unknown>>(
					seam.includes("prefix") ? JOURNALS : REPORTING_DAILY_COLLECTION,
				);
				let injected = false;
				const wrapped = delegatingCollection(raw, {
					async updateIf(id, args) {
						const should = !injected && args.delta?.refundedCents !== undefined;
						if (should) {
							injected = true;
							if (seam === "before-delta") throw new Error("INJECTED_JOURNAL_CRASH");
						}
						const result = await raw.updateIf(id, args);
						if (should && seam === "after-delta") throw new Error("INJECTED_JOURNAL_CRASH");
						return result;
					},
					async compareAndSet(id, revision, data) {
						const should = !injected && data.completedRevision === 1;
						if (should) {
							injected = true;
							if (seam === "before-prefix") throw new Error("INJECTED_JOURNAL_CRASH");
						}
						const result = await raw.compareAndSet(id, revision, data);
						if (should && seam === "after-prefix") throw new Error("INJECTED_JOURNAL_CRASH");
						return result;
					},
				});
				const broken = makeReportingHarness(bound.storage, {
					storageForStore: withCollection(
						bound.storage,
						seam.includes("prefix") ? JOURNALS : REPORTING_DAILY_COLLECTION,
						wrapped,
					),
					clock: f.reporting.clock,
				});
				await expect(broken.store.recordOrderEvent(f.refundEvent(target - 1))).rejects.toThrow(
					"INJECTED_JOURNAL_CRASH",
				);
				expect(injected).toBe(true);
				await f.reporting.store.recordOrderEvent(f.refundEvent(target - 1));
				expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(
					target === 1 ? 250 : 0,
				);
				if (target === 1) await f.fail();
				await f.reporting.store.recordOrderEvent(f.refundEvent(1));
				await f.reporting.store.recordOrderEvent(f.refundEvent(0));
				expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(0);
				await f.reporting.store.reconcile(RANGE);
				await f.reporting.store.recordOrderEvent(f.refundEvent(1));
				await f.reporting.store.recordOrderEvent(f.refundEvent(0));
				expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(0);
			});
	}

	test("an absolute rebuild checkpoints missing refund prefixes before their delayed replay", async () => {
		const f = await fixture(bound);
		await f.succeed();
		await f.fail();
		await f.reporting.store.reconcile(RANGE);
		await f.reporting.store.recordOrderEvent(f.refundEvent(0));
		await f.reporting.store.recordOrderEvent(f.refundEvent(1));
		expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(0);
	});

	test("a peer finishes an applied rebuild whose prefix checkpoint was interrupted", async () => {
		const f = await fixture(bound);
		await f.succeed();
		await f.fail();
		const raw = bound.collection<Record<string, unknown>>(JOURNALS);
		let injected = false;
		const broken = makeReportingHarness(bound.storage, {
			storageForStore: withCollection(
				bound.storage,
				JOURNALS,
				delegatingCollection(raw, {
					async compareAndSet(id, revision, data) {
						if (!injected && data.completedRevision === 2) {
							injected = true;
							throw new Error("INJECTED_REBUILD_CRASH");
						}
						return raw.compareAndSet(id, revision, data);
					},
				}),
			),
			clock: f.reporting.clock,
		});
		await expect(broken.store.reconcile(RANGE)).rejects.toThrow("INJECTED_REBUILD_CRASH");
		expect(injected).toBe(true);
		expect((await f.reporting.dailyRaw.get("USD:2026-01-01"))?.refundJournalApplied).toBe(1);
		await f.reporting.store.recordOrderEvent(f.refundEvent(0));
		await f.reporting.store.recordOrderEvent(f.refundEvent(1));
		expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(0);
		expect((await f.reporting.dailyRaw.get("USD:2026-01-01"))?.refundJournalToken).toBeNull();
	});

	test("a delayed delta helper cannot reapply a witness completed by a peer", async () => {
		const f = await fixture(bound);
		await f.succeed();
		await f.fail();
		const paused = gate();
		const raw = bound.collection<Record<string, unknown>>(REPORTING_DAILY_COLLECTION);
		let parked = false;
		const slow = makeReportingHarness(bound.storage, {
			storageForStore: withCollection(
				bound.storage,
				REPORTING_DAILY_COLLECTION,
				delegatingCollection(raw, {
					async updateIf(id, args) {
						const delta = args.delta?.refundedCents;
						if (!parked && delta !== undefined && "inc" in delta && delta.inc === 250) {
							parked = true;
							paused.arrive();
							await paused.wait;
						}
						return raw.updateIf(id, args);
					},
				}),
			),
			clock: f.reporting.clock,
		});
		const first = slow.store.recordOrderEvent(f.refundEvent(0));
		await paused.entered;
		try {
			await f.reporting.store.recordOrderEvent(f.refundEvent(1));
		} finally {
			paused.release();
		}
		await first;
		expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(0);
	});

	test("a delayed prefix reader cannot install an already completed revision", async () => {
		const f = await fixture(bound);
		await f.succeed();
		const paused = gate();
		const raw = bound.collection<Record<string, unknown>>(REPORTING_DAILY_COLLECTION);
		let parked = false;
		const slow = makeReportingHarness(bound.storage, {
			storageForStore: withCollection(
				bound.storage,
				REPORTING_DAILY_COLLECTION,
				delegatingCollection(raw, {
					async updateIf(id, args) {
						if (
							!parked &&
							args.set?.refundJournalToken != null &&
							args.delta?.refundedCents === undefined
						) {
							parked = true;
							paused.arrive();
							await paused.wait;
						}
						return raw.updateIf(id, args);
					},
				}),
			),
			clock: f.reporting.clock,
		});
		const first = slow.store.recordOrderEvent(f.refundEvent(0));
		await paused.entered;
		try {
			await f.reporting.store.recordOrderEvent(f.refundEvent(0));
		} finally {
			paused.release();
		}
		await first;
		expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(250);
	});

	test("legacy positive claims migrate through native truth before a signed reversal", async () => {
		const f = await fixture(bound);
		await f.succeed();
		const success = f.refundEvent(0);
		if (success.kind !== "refund") throw new Error("Not a refund");
		const { nativeRefundId: _identity, financialRevision: _revision, ...legacy } = success;
		await f.reporting.store.recordOrderEvent(legacy);
		expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(250);
		await f.fail();
		await f.reporting.store.recordOrderEvent(f.refundEvent(1));
		await f.reporting.store.recordOrderEvent(success);
		expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(0);
		await expect(
			f.reporting.store.recordOrderEvent({ ...legacy, refundedCents: -250 }),
		).rejects.toThrow("requires explicit native identity");
	});

	test("native refund IDs stay opaque and forged financial proof cannot move money", async () => {
		const f = await fixture(bound);
		const held = await f.reporting.orders.getVersioned(f.id);
		if (held === null) throw new Error("Missing native order");
		await f.reporting.orders.compareAndSet(f.id, held.revision, {
			...held.value,
			refunds: held.value.refunds.map((refund) => ({ ...refund, id: "opaque:2:refund>%" })),
		});
		await f.succeed();
		await f.fail();
		const failure = f.refundEvent(1);
		if (failure.kind !== "refund") throw new Error("Not a refund");
		expect(failure).toMatchObject({ nativeRefundId: "opaque:2:refund>%", financialRevision: 2 });
		for (const change of [
			{ nativeRefundId: "missing" },
			{ financialRevision: 4 },
			{ currency: "EUR" },
			{ refundedCents: -251 },
		]) {
			await expect(f.reporting.store.recordOrderEvent({ ...failure, ...change })).rejects.toThrow(
				"native ledger",
			);
		}
		await f.reporting.store.recordOrderEvent(failure);
		await f.reporting.store.recordOrderEvent(f.refundEvent(0));
		expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(0);
	});

	test("rebuild checkpoint manifests stay bounded across more than one refund page", async () => {
		const f = await fixture(bound);
		const held = await f.reporting.orders.getVersioned(f.id);
		const row = held?.value.refunds[0];
		if (held === null || row === undefined) throw new Error("Missing native refund fixture");
		await f.reporting.orders.compareAndSet(f.id, held.revision, {
			...held.value,
			refunds: Array.from({ length: 102 }, (_, index) => ({
				...row,
				id: `opaque:${index}:2`,
				idempotencyKey: idempotencyKey(`large-${index}`),
				amount: cents(1),
				status: "recorded" as const,
				financialRevision: 1,
			})),
		});
		await f.reporting.store.reconcile(RANGE);
		const manifests = await bound
			.collection<{ entries: unknown[] }>("reporting_refund_rebuilds")
			.query({ limit: 100 });
		expect(manifests.items).toHaveLength(2);
		expect(manifests.items.every((item) => item.data.entries.length <= 100)).toBe(true);
		await f.reporting.store.recordOrderEvent({
			kind: "refund",
			orderId: f.id,
			orderCreatedAt: CREATED,
			currency: "USD",
			refundId: "opaque:101:2",
			nativeRefundId: "opaque:101:2",
			financialRevision: 1,
			refundedCents: 1,
		});
		expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(102);
	});

	test("a prior current day without financial guard fields accepts a native journal", async () => {
		const f = await fixture(bound);
		const held = await f.reporting.dailyRaw.getVersioned("USD:2026-01-01");
		if (held === null) throw new Error("Missing reporting day");
		const { refundJournalSeq: _sequence, ...legacy } = held.value;
		await f.reporting.dailyRaw.compareAndSet("USD:2026-01-01", held.revision, legacy);
		await f.succeed();
		await f.reporting.store.recordOrderEvent(f.refundEvent(0));
		expect((await f.reporting.store.revenueByPeriod(RANGE, "day"))[0]?.refundedCents).toBe(250);
	});
}
