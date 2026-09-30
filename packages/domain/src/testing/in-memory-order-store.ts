import { refundProviderUpdate } from "../orders/refund-provider-state.js";
import {
	codAcceptanceOutcome,
	offlineReceiptOutcome,
	offlineProviderRef,
} from "../orders/offline-payment-policy.js";
import { cents, currency as toCurrency } from "../money/cents.js";
import {
	type CustomerId,
	idempotencyKey as toIdempotencyKey,
	type IdempotencyKey,
	type OrderId,
	orderId as toOrderId,
} from "../money/ids.js";
import type { Clock } from "../ports/clock.js";
import type { IdGen } from "../ports/id-gen.js";
import type {
	ApplyRefundProviderOutcomeInput,
	ApplyRefundProviderOutcomeStoreResult,
	CancelOrderInput,
	CancelOrderStoreResult,
	CapturedPayment,
	CreateOrderInput,
	AcceptCODOrderInput,
	RecordOfflinePaymentInput,
	OfflineOrderStoreResult,
	CreateOrderResult,
	FinalizeRefundInput,
	FinalizeRefundStoreResult,
	OrderEvent,
	OrderListFilter,
	OrderListPage,
	OrderListResult,
	OrderStore,
	OrderSummary,
	OrderTransitionInput,
	OrderTransitionResult,
	OutboxEmail,
	RecordFulfillmentInput,
	RecordFulfillmentStoreResult,
	RecordPaymentInput,
	RecordRefundInput,
	RecordRefundStoreResult,
	RefundRecord,
	RefundStatus,
	ResolveReconciliationInput,
	ResolveReconciliationStoreResult,
} from "../ports/order-store.js";
import type {
	Order,
	OrderAddress,
	OrderLine,
	OrderState,
	OrderTotals,
	PaymentMethod,
} from "../orders/model.js";

/** Test-only seed shape for the admin-list contract — a direct order row (no
 *  cart/reservation flow), so a case can pin an EXACT `createdAt`/`state`/
 *  `buyerRef`/`total` per row (MOD-5: distinct clocks for ordering, identical
 *  clocks for the tie-break). Mirrors the columns `KyselyOrderStore.listOrders`
 *  reads, so the fake and the SQL agree byte-for-byte. */
export interface SeedOrderSummaryRow {
	id: string;
	state: OrderState;
	currency: string;
	buyerRef: string;
	customerId?: string | null;
	paymentMethod?: PaymentMethod | null;
	createdAt: string;
	totalCents: number;
	reconciliationFlag?: string | null;
}
import { emailTemplateForState, isLegalOrderTransition } from "../orders/state-machine.js";

/** Descending code-unit string comparison (`>` first) — the SAME plain code-unit
 *  ordering the keyset predicate + from/to filters use, so the admin-list fake is
 *  internally consistent (never `localeCompare`). */
function codeUnitDesc(a: string, b: string): number {
	return a > b ? -1 : a < b ? 1 : 0;
}

interface StoredOrder {
	order: Order;
}

interface StoredPayment {
	orderId: string;
	gateway: PaymentMethod;
	providerRef: string;
	amount: number;
	currency: string;
	status: string;
}

type OutboxStatus = "pending" | "sending" | "sent" | "failed";

interface StoredOutbox {
	id: string;
	orderId: string;
	toState: OrderState;
	status: OutboxStatus;
	attempts: number;
	leaseUntil: string | null;
	sentAt: string | null;
	createdAt: string;
}

/**
 * IO-free `OrderStore` fake — the first adapter to pass `orderStoreContract`.
 * Models the real adapter: an `idempotency_key`-guarded create (replay returns
 * the existing order, no re-snapshot), immutable `order_items`, a 1:1
 * `order_totals`, and guarded state flips. Deterministic and synchronous so the
 * contract's replay / snapshot-immutability / illegal-transition cases run here
 * first.
 */
export class InMemoryOrderStore implements OrderStore {
	#idGen: IdGen;
	#clock: Clock;
	#orders = new Map<string, StoredOrder>();
	#byKey = new Map<string, string>();
	#payments: StoredPayment[] = [];
	#offlineClaims = new Map<string, RecordOfflinePaymentInput>();
	/** Append-only refunds ledger — the fake analogue of the `refunds` table
	 *  (ADR-0008). */
	#refunds: RefundRecord[] = [];
	#outbox: StoredOutbox[] = [];
	/** Append-only state-change audit — the fake analogue of `order_events`,
	 *  appended IN the same synchronous step as each guarded flip (mirrors the
	 *  Kysely adapter writing the event inside the flip transaction). */
	#events: OrderEvent[] = [];

	constructor(options: { idGen: IdGen; clock: Clock }) {
		this.#idGen = options.idGen;
		this.#clock = options.clock;
	}

	async createFromCart(input: CreateOrderInput): Promise<CreateOrderResult> {
		const existingId = this.#byKey.get(input.idempotencyKey);
		if (existingId !== undefined) {
			return { created: false, order: this.#clone(this.#orders.get(existingId)!.order) };
		}

		const now = this.#clock.now().toISOString();
		const orderId = input.orderId;
		const lines: OrderLine[] = input.lines.map((l) => ({
			id: this.#idGen.newId(),
			orderId,
			productId: l.productId,
			sku: l.sku,
			title: l.title,
			unitPrice: l.unitPrice,
			currency: l.currency,
			quantity: l.quantity,
			fulfillmentKind: l.fulfillmentKind,
			reservationId: l.reservationId,
			...(l.variantId === undefined ? {} : { variantId: l.variantId }),
			...(l.taxClassId === undefined ? {} : { taxClassId: l.taxClassId }),
			...(l.priceTaxMode === undefined ? {} : { priceTaxMode: l.priceTaxMode }),
			...(l.rateBps === undefined ? {} : { rateBps: l.rateBps }),
			...(l.subtotalNetCents === undefined ? {} : { subtotalNetCents: l.subtotalNetCents }),
			...(l.netCents === undefined ? {} : { netCents: l.netCents }),
			...(l.grossCents === undefined ? {} : { grossCents: l.grossCents }),
			...(l.discountedCents === undefined ? {} : { discountedCents: l.discountedCents }),
			...(l.taxCents === undefined ? {} : { taxCents: l.taxCents }),
		}));
		const totals: OrderTotals = {
			orderId,
			currency: input.totals.currency,
			subtotal: input.totals.subtotal,
			discount: input.totals.discount ?? cents(0),
			shipping: input.totals.shipping ?? cents(0),
			tax: input.totals.tax ?? cents(0),
			total: input.totals.total,
			appliedCouponCode: input.totals.appliedCouponCode ?? null,
			shippingMethodSnapshot: input.totals.shippingMethodSnapshot ?? null,
			taxBreakdown: input.totals.taxBreakdown ?? null,
		};
		const order: Order = {
			id: orderId,
			cartId: input.cartId,
			currency: input.currency,
			state: "pending",
			idempotencyKey: input.idempotencyKey,
			holdExpiresAt: input.holdExpiresAt,
			paymentMethod: input.paymentMethod,
			buyerRef: input.buyerRef,
			customerId: null,
			createdAt: now,
			updatedAt: now,
			lines,
			totals,
			// ADR-0009: freeze the submitted ship-to snapshot (a COPY — never a live
			// pointer to the profile book), or null when none was captured.
			shippingAddress: cloneAddress(input.shippingAddress ?? null),
			billingAddress: input.billingAddress ? { ...input.billingAddress } : null,
			offlinePayment: input.offlinePayment ? { ...input.offlinePayment } : null,
			reconciliationFlag: null,
			reconciliationResolution: null,
			fulfillment: null,
			cancellation: null,
		};
		this.#orders.set(orderId, { order });
		this.#byKey.set(input.idempotencyKey, orderId);
		return { created: true, order: this.#clone(order) };
	}

	async getById(orderId: OrderId): Promise<Order | null> {
		const stored = this.#orders.get(orderId);
		return stored === undefined ? null : this.#clone(stored.order);
	}

	async getByIdempotencyKey(key: IdempotencyKey): Promise<Order | null> {
		const orderId = this.#byKey.get(key);
		if (orderId === undefined) return null;
		const stored = this.#orders.get(orderId);
		return stored === undefined ? null : this.#clone(stored.order);
	}

	async markPaid(orderId: OrderId): Promise<boolean> {
		const payment = this.#orders.get(orderId)?.order.offlinePayment;
		if (payment && payment.status !== "received") return false;
		return this.#guardedFlip(orderId, "pending", "paid");
	}

	async expire(orderId: OrderId, now: string): Promise<boolean> {
		const stored = this.#orders.get(orderId);
		if (stored === undefined) return false;
		if (stored.order.state !== "pending") return false;
		if (stored.order.holdExpiresAt > now) return false; // not yet due (re-checked)
		stored.order.state = "expired";
		stored.order.updatedAt = this.#clock.now().toISOString();
		// Same-"transaction" outbox enqueue + state-change audit as the real adapter.
		this.#appendEvent(orderId, "pending", "expired", null);
		this.#enqueue(orderId, "expired");
		return true;
	}

	async listExpirable(now: string): Promise<OrderId[]> {
		const out: OrderId[] = [];
		for (const stored of this.#orders.values()) {
			if (stored.order.state === "pending" && stored.order.holdExpiresAt <= now) {
				out.push(stored.order.id);
			}
		}
		return out;
	}

	async recordPayment(input: RecordPaymentInput): Promise<void> {
		if (this.#payments.some((p) => p.providerRef === input.providerRef)) return; // idempotent
		this.#payments.push({
			orderId: input.orderId,
			gateway: input.gateway,
			providerRef: input.providerRef,
			amount: input.amount,
			currency: input.currency,
			status: input.status,
		});
	}

	async acceptCODOrder(input: AcceptCODOrderInput): Promise<OfflineOrderStoreResult> {
		const stored = this.#orders.get(input.orderId);
		if (stored === undefined) return { outcome: "order_not_found", order: null };
		const now = this.#clock.now().toISOString();
		const outcome = codAcceptanceOutcome(stored.order, now);
		if (outcome === "applied") {
			stored.order.offlinePayment = {
				...stored.order.offlinePayment!,
				status: "accepted",
				acceptedAt: now,
				acceptedBy: input.acceptedBy,
				acceptanceKey: input.idempotencyKey,
			};
			stored.order.state = "processing";
			stored.order.updatedAt = now;
			this.#appendEvent(input.orderId, "pending", "processing", input.acceptedBy);
		}
		return { outcome, order: this.#clone(stored.order) };
	}

	async recordOfflinePayment(input: RecordOfflinePaymentInput): Promise<OfflineOrderStoreResult> {
		const stored = this.#orders.get(input.orderId);
		if (stored === undefined) return { outcome: "order_not_found", order: null };
		const now = this.#clock.now().toISOString();
		let outcome = offlineReceiptOutcome(stored.order, input, now);
		if (outcome === "applied") {
			const refKey = offlineProviderRef(input.receiptRef);
			const key = `offline-key:${input.idempotencyKey}`;
			const ref = this.#offlineClaims.get(refKey);
			const claimedKey = this.#offlineClaims.get(key);
			if (
				ref !== undefined &&
				(ref.orderId !== input.orderId ||
					ref.amount !== input.amount ||
					ref.currency !== input.currency)
			)
				outcome = "receipt_conflict";
			else if (
				claimedKey !== undefined &&
				(claimedKey.orderId !== input.orderId || claimedKey.receiptRef !== input.receiptRef)
			)
				outcome = "key_conflict";
			else {
				this.#offlineClaims.set(refKey, { ...input });
				this.#offlineClaims.set(key, { ...input });
				const from = stored.order.state;
				stored.order.offlinePayment = {
					...stored.order.offlinePayment!,
					status: "received",
					receivedAt: now,
					recordedBy: input.recordedBy,
					receiptRef: input.receiptRef,
					confirmationKey: input.idempotencyKey,
				};
				stored.order.state = from === "pending" ? "paid" : from;
				stored.order.updatedAt = now;
				this.#payments.push({
					orderId: input.orderId,
					gateway: stored.order.paymentMethod!,
					providerRef: refKey,
					amount: input.amount,
					currency: input.currency,
					status: "succeeded",
				});
				this.#appendEvent(input.orderId, from, stored.order.state, input.recordedBy);
				if (stored.order.state === "paid") this.#enqueue(input.orderId, "paid");
			}
		}
		return { outcome, order: this.#clone(stored.order) };
	}

	// -- Refunds ledger (ADR-0008) --------------------------------------------

	async getCapturedPayments(orderId: OrderId): Promise<CapturedPayment[]> {
		return this.#payments
			.filter((p) => p.orderId === orderId)
			.map((p) => ({
				gateway: p.gateway,
				providerRef: p.providerRef,
				amount: cents(p.amount),
				currency: toCurrency(p.currency),
				status: p.status,
			}));
	}

	async listRefunds(orderId: OrderId): Promise<RefundRecord[]> {
		return this.#refunds.filter((r) => r.orderId === orderId).map((r) => ({ ...r }));
	}

	async getRefundByIdempotencyKey(key: IdempotencyKey): Promise<RefundRecord | null> {
		const found = this.#refunds.find((r) => r.idempotencyKey === key);
		return found === undefined ? null : { ...found };
	}

	async recordRefund(input: RecordRefundInput): Promise<RecordRefundStoreResult> {
		// The MANUAL/record-only one-shot (ADR-0008): reserve + finalize collapsed —
		// insert a FINALIZED ('recorded') row and drive the full-refund flip when the
		// finalized Σ reaches the ceiling. The gateway path uses reserveRefund →
		// gateway → finalizeRefund instead.
		return this.#insertRefundRow(input, { status: "recorded", driveFlip: true });
	}

	async reserveRefund(input: RecordRefundInput): Promise<RecordRefundStoreResult> {
		// RESERVE the ledger slot BEFORE any gateway call (ADR-0008): the SAME atomic
		// arbitration as recordRefund but the row lands 'reserved' and NEVER drives
		// the → refunded flip. A rejected reservation never reaches the provider.
		return this.#insertRefundRow(input, { status: "reserved", driveFlip: false });
	}

	/** Shared dedupe/arbitrate/insert body for {@link recordRefund} (finalized
	 *  one-shot) and {@link reserveRefund} (held slot). The real adapter's row lock +
	 *  ceiling guard collapse to a straight-line check here; ceiling arbitrates the
	 *  ACTIVE (non-'voided') Σ, the flip counts the FINALIZED ('recorded') Σ. */
	#insertRefundRow(
		input: RecordRefundInput,
		opts: { status: Extract<RefundStatus, "recorded" | "reserved">; driveFlip: boolean },
	): RecordRefundStoreResult {
		const stored = this.#orders.get(input.orderId);
		const capturedTotal = cents(
			this.#payments
				.filter((p) => p.orderId === input.orderId && p.status === "succeeded")
				.reduce((sum, p) => sum + p.amount, 0),
		);
		if (stored === undefined) {
			return {
				outcome: "order_not_found",
				refund: null,
				fullyRefunded: false,
				capturedTotal,
				frozenTotal: cents(0),
				order: null,
			};
		}
		const frozenTotal = stored.order.totals.total;
		// Dedupe on the idempotency key — a replay records nothing.
		const existing = this.#refunds.find((r) => r.idempotencyKey === input.idempotencyKey);
		if (existing !== undefined) {
			return {
				outcome: "duplicate",
				refund: { ...existing },
				fullyRefunded: stored.order.state === "refunded",
				capturedTotal,
				frozenTotal,
				order: this.#clone(stored.order),
			};
		}
		const ceiling = Math.min(capturedTotal, frozenTotal);
		// ACTIVE Σ — every non-'voided' row (finalized + held reservations) consumes
		// ceiling capacity; a voided row released its slot.
		const activePrior = this.#refunds
			.filter((r) => r.orderId === input.orderId && r.status !== "voided")
			.reduce((sum, r) => sum + r.amount, 0);
		if (activePrior + input.amount > ceiling) {
			return {
				outcome: "exceeds_ceiling",
				refund: null,
				fullyRefunded: false,
				capturedTotal,
				frozenTotal,
				order: this.#clone(stored.order),
			};
		}
		const now = this.#clock.now().toISOString();
		const refund: RefundRecord = {
			id: this.#idGen.newId(),
			orderId: input.orderId,
			amount: input.amount,
			currency: input.currency,
			kind: input.kind,
			gateway: input.gateway,
			refundRef: input.refundRef,
			...(input.paymentRef === undefined ? {} : { paymentRef: input.paymentRef }),
			reason: input.reason,
			refundedBy: input.refundedBy,
			status: opts.status,
			idempotencyKey: input.idempotencyKey,
			createdAt: now,
		};
		this.#refunds.push(refund);
		let fullyRefunded = false;
		// FULL refund (finalized Σ reached the ceiling) → drive → refunded atomically
		// with the ledger row (actor = the refunder). Finalized path only — a held
		// reservation never flips; the finalized prior counts 'recorded' rows.
		if (opts.driveFlip) {
			const finalizedTotal = this.#refunds
				.filter((r) => r.orderId === input.orderId && r.status === "recorded")
				.reduce((sum, r) => sum + r.amount, 0);
			if (finalizedTotal === ceiling && isLegalOrderTransition(stored.order.state, "refunded")) {
				const fromState = stored.order.state;
				stored.order.state = "refunded";
				stored.order.updatedAt = now;
				this.#appendEvent(input.orderId, fromState, "refunded", input.refundedBy);
				if (emailTemplateForState("refunded") !== null) this.#enqueue(input.orderId, "refunded");
				fullyRefunded = true;
			}
		}
		return {
			outcome: "recorded",
			refund: { ...refund },
			fullyRefunded,
			capturedTotal,
			frozenTotal,
			order: this.#clone(stored.order),
		};
	}

	async finalizeRefund(input: FinalizeRefundInput): Promise<FinalizeRefundStoreResult> {
		const row = this.#refunds.find((entry) => entry.idempotencyKey === input.idempotencyKey);
		const missing: FinalizeRefundStoreResult = {
			found: false,
			alreadyFinalized: false,
			refund: null,
			fullyRefunded: false,
			order: null,
		};
		if (row === undefined) return missing;
		const captured = (await this.getCapturedPayments(row.orderId)).find(
			(payment) => payment.status === "succeeded" && payment.gateway === row.gateway,
		);
		if (captured === undefined) return missing;
		const result = await this.applyRefundProviderOutcome({
			...(input.expected ?? {
				orderId: row.orderId,
				gateway: row.gateway,
				amount: row.amount,
				currency: row.currency,
				paymentRef: row.paymentRef ?? captured.providerRef,
			}),
			idempotencyKey: input.idempotencyKey,
			refundRef: input.refundRef,
			providerStatus: "succeeded",
		});
		if (result.refund?.status !== "recorded" || result.outcome === "mismatch") return missing;
		return {
			found: true,
			alreadyFinalized: result.outcome === "noop",
			refund: result.refund,
			order: result.order,
			fullyRefunded: result.fullyRefunded,
		};
	}

	async applyRefundProviderOutcome(
		input: ApplyRefundProviderOutcomeInput,
	): Promise<ApplyRefundProviderOutcomeStoreResult> {
		const row = this.#refunds.find((entry) => entry.idempotencyKey === input.idempotencyKey);
		const stored = this.#orders.get(input.orderId);
		const missing: ApplyRefundProviderOutcomeStoreResult = {
			outcome: "not_found",
			refund: null,
			order: null,
			fullyRefunded: false,
		};
		if (row === undefined || stored === undefined) return missing;
		const result = (
			outcome: ApplyRefundProviderOutcomeStoreResult["outcome"],
		): ApplyRefundProviderOutcomeStoreResult => ({
			outcome,
			refund: { ...row },
			order: this.#clone(stored.order),
			fullyRefunded: stored.order.state === "refunded",
		});
		const captured = this.#payments.some(
			(payment) =>
				payment.orderId === input.orderId &&
				payment.status === "succeeded" &&
				payment.gateway === input.gateway &&
				payment.providerRef === input.paymentRef &&
				payment.currency === input.currency,
		);
		if (
			!captured ||
			this.#refunds.some(
				(other) =>
					other.idempotencyKey !== input.idempotencyKey && other.refundRef === input.refundRef,
			)
		)
			return result("mismatch");
		const decision = refundProviderUpdate(row, input);
		if (decision !== "apply") return result(decision);
		const wasRecorded = row.status === "recorded";
		row.status =
			input.providerStatus === "succeeded"
				? "recorded"
				: input.providerStatus === "failed" || input.providerStatus === "canceled"
					? "voided"
					: "unverified";
		row.refundRef = input.refundRef;
		row.paymentRef = input.paymentRef;
		row.providerStatus = input.providerStatus;
		if (input.event !== undefined) row.providerEvent = input.event;
		const now = this.#clock.now().toISOString();
		stored.order.updatedAt = now;
		const capturedTotal = this.#payments
			.filter((payment) => payment.orderId === input.orderId && payment.status === "succeeded")
			.reduce((sum, payment) => sum + payment.amount, 0);
		const finalizedTotal = this.#refunds
			.filter((entry) => entry.orderId === input.orderId && entry.status === "recorded")
			.reduce((sum, entry) => sum + entry.amount, 0);
		if (
			finalizedTotal === Math.min(capturedTotal, stored.order.totals.total) &&
			isLegalOrderTransition(stored.order.state, "refunded")
		) {
			const fromState = stored.order.state;
			stored.order.state = "refunded";
			this.#appendEvent(input.orderId, fromState, "refunded", row.refundedBy);
			this.#enqueue(input.orderId, "refunded");
		} else if (wasRecorded && row.status !== "recorded") {
			const preceding = this.#events.findLast(
				(event) => event.orderId === input.orderId && event.toState === "refunded",
			)?.fromState;
			if (stored.order.state === "refunded" && preceding !== undefined && preceding !== null) {
				stored.order.state = preceding;
				this.#appendEvent(input.orderId, "refunded", preceding, "payment-provider");
			}
			stored.order.reconciliationFlag = `refund ${input.refundRef} changed from succeeded to ${input.providerStatus} — reconcile the returned funds`;
		}
		return result("applied");
	}

	async voidRefund(idempotencyKey: IdempotencyKey): Promise<boolean> {
		// Guarded `reserved → voided` (ADR-0008): capacity RELEASED, row kept as an
		// audit record. False ⇒ no reserved row under the key.
		const row = this.#refunds.find(
			(r) => r.idempotencyKey === idempotencyKey && r.status === "reserved",
		);
		if (row === undefined) return false;
		row.status = "voided";
		return true;
	}

	async markRefundUnverified(idempotencyKey: IdempotencyKey): Promise<boolean> {
		// Guarded `reserved → unverified` (ADR-0008): capacity stays HELD (the safe
		// direction) until a human re-checks the provider. False ⇒ no reserved row.
		const row = this.#refunds.find(
			(r) => r.idempotencyKey === idempotencyKey && r.status === "reserved",
		);
		if (row === undefined) return false;
		row.status = "unverified";
		return true;
	}

	async flagReconciliation(orderId: OrderId, detail: string): Promise<void> {
		const stored = this.#orders.get(orderId);
		if (stored === undefined) return;
		stored.order.reconciliationFlag = detail;
		stored.order.updatedAt = this.#clock.now().toISOString();
	}

	async resolveReconciliation(
		input: ResolveReconciliationInput,
	): Promise<ResolveReconciliationStoreResult> {
		// EQUALITY-guarded compare-and-clear (mirrors the Kysely `WHERE
		// reconciliation_flag = :expectedFlag` UPDATE, the `transition` fromState
		// precedent): only the exact reviewed flag can be cleared, so exactly one
		// caller wins AND a re-flagged order (different detail) is a 0-row miss —
		// never a blind clear. A racing loser finds the flag cleared/changed →
		// resolved:false, and NEVER overwrites the first disposition.
		const stored = this.#orders.get(input.orderId);
		if (stored === undefined) return { resolved: false, order: null };
		if (stored.order.reconciliationFlag !== input.expectedFlag) {
			return { resolved: false, order: this.#clone(stored.order) };
		}
		const now = this.#clock.now().toISOString();
		stored.order.reconciliationFlag = null;
		stored.order.reconciliationResolution = {
			outcome: input.outcome,
			reason: input.reason,
			resolvedBy: input.resolvedBy,
			resolvedAt: now,
		};
		stored.order.updatedAt = now;
		return { resolved: true, order: this.#clone(stored.order) };
	}

	async recordFulfillment(input: RecordFulfillmentInput): Promise<RecordFulfillmentStoreResult> {
		// Guarded compose (mirrors the Kysely #flipAndEnqueue-routed UPDATE + outbox
		// insert): the `state === input.fromState` guard is the `transition`
		// fromState precedent — the use-case passes the state it validated against
		// the state machine, so exactly one caller wins the flip and records, and an
		// order a concurrent cancel already moved is a 0-row miss (never shipped
		// behind the cancel's back). NEVER touches lines/totals.
		const stored = this.#orders.get(input.orderId);
		if (stored === undefined) return { recorded: false, order: null };
		if (stored.order.state !== input.fromState) {
			return { recorded: false, order: this.#clone(stored.order) };
		}
		const now = this.#clock.now().toISOString();
		stored.order.state = "shipped";
		stored.order.fulfillment = {
			carrier: input.carrier,
			trackingNumber: input.trackingNumber,
			trackingUrl: input.trackingUrl,
			// A blank ship time defaults to the record time (the store's clock).
			shippedAt: input.shippedAt ?? now,
			recordedBy: input.recordedBy,
			recordedAt: now,
		};
		stored.order.updatedAt = now;
		// Same-"transaction" state-change audit as the real adapter — the actor is
		// the recorder (the who this domain knows for a fulfillment flip).
		this.#appendEvent(input.orderId, input.fromState, "shipped", input.recordedBy);
		// Same-"transaction" outbox enqueue as the real adapter (§5) when the shipped
		// state has a template — the buyer's shipped email now carries this tracking.
		if (input.enqueueEmail) this.#enqueue(input.orderId, "shipped");
		return { recorded: true, order: this.#clone(stored.order) };
	}

	async cancelOrder(input: CancelOrderInput): Promise<CancelOrderStoreResult> {
		// Guarded compose (mirrors the Kysely #flipAndEnqueue-routed UPDATE + outbox
		// insert): the `state === input.fromState` guard is the
		// `transition`/`recordFulfillment` fromState precedent — the use-case passes
		// the state it validated against the state machine, so exactly one caller
		// wins the flip and records the reason, and an order a concurrent
		// transition/recordFulfillment already moved is a 0-row miss (never
		// cancelled behind that transition's back). NEVER touches lines/totals.
		const stored = this.#orders.get(input.orderId);
		if (stored === undefined) return { cancelled: false, order: null };
		if (stored.order.state !== input.fromState) {
			return { cancelled: false, order: this.#clone(stored.order) };
		}
		const now = this.#clock.now().toISOString();
		stored.order.state = "cancelled";
		stored.order.cancellation = {
			reason: input.reason,
			detail: input.detail,
			cancelledBy: input.cancelledBy,
			cancelledAt: now,
		};
		stored.order.updatedAt = now;
		// Same-"transaction" state-change audit as the real adapter — the actor is
		// the canceller (the who this domain knows for a cancellation flip).
		this.#appendEvent(input.orderId, input.fromState, "cancelled", input.cancelledBy);
		// Same-"transaction" outbox enqueue as the real adapter (§5) when the
		// cancelled state has a template — the buyer's cancellation email now
		// carries the reason.
		if (input.enqueueEmail) this.#enqueue(input.orderId, "cancelled");
		return { cancelled: true, order: this.#clone(stored.order) };
	}

	// -- Phase 5: state machine + outbox --------------------------------------

	async transition(input: OrderTransitionInput): Promise<OrderTransitionResult> {
		// input.idempotencyKey is intentionally unused here too (review round H4)
		// — mirrors the Kysely adapter: dedup is structural (guarded flip +
		// outbox uniqueness), the field exists for CLAUDE.md command-shape
		// consistency, not because the fake keys off it.
		const transitioned = this.#guardedFlip(
			input.orderId,
			input.fromState,
			input.toState,
			input.enqueueEmail,
		);
		const order = await this.getById(input.orderId);
		return { transitioned, order };
	}

	async listForCustomer(customerId: CustomerId): Promise<Order[]> {
		return [...this.#orders.values()]
			.filter((s) => s.order.customerId === customerId)
			.toSorted((a, b) => a.order.createdAt.localeCompare(b.order.createdAt))
			.map((s) => this.#clone(s.order));
	}

	async listEventsForOrder(orderId: OrderId): Promise<OrderEvent[]> {
		// Insertion order IS chronological (appended on each won flip under the
		// advancing clock); scoped to the one order. Cloned so a caller can't mutate
		// the store's audit log. Mirrors the SQL `WHERE order_id=? ORDER BY at, id`.
		return this.#events.filter((e) => e.orderId === orderId).map((e) => ({ ...e }));
	}

	/** The ONE `OrderListFilter` predicate, shared by `listOrders` and
	 *  `countOrders` (mirrors the Kysely adapter's single filter builder) — a
	 *  count can never disagree with the list it captions. */
	#matchesFilter(o: Order, filter: OrderListFilter): boolean {
		if (
			filter.states !== undefined &&
			filter.states.length > 0 &&
			!filter.states.includes(o.state)
		) {
			return false;
		}
		if (filter.from !== undefined && o.createdAt < filter.from) return false; // inclusive lower
		if (filter.to !== undefined && o.createdAt >= filter.to) return false; // EXCLUSIVE upper
		if (filter.search !== undefined) {
			// Order-id PREFIX, buyer_ref SUBSTRING or an EXACT line sku, all sides
			// folded (port doc). The fake's stand-in for the adapter's `lower(col)
			// LIKE lower(:pattern) ESCAPE '\'`: `startsWith`/`includes` build no
			// pattern, so `%` and `_` are already ordinary characters here — exactly
			// what the SQL side buys by escaping them (the sku half is an equality,
			// so it is literal in both by construction). The fold is explicit on BOTH
			// sides, matching the SQL (whose bare-LIKE case behaviour differs between
			// pg and SQLite).
			const needle = filter.search.toLowerCase();
			const byId = o.id.toLowerCase().startsWith(needle);
			const byRef = o.buyerRef.toLowerCase().includes(needle);
			// `some` over the order's OWN line snapshots — the fake's stand-in for the
			// adapter's correlated EXISTS over `order_items`, and an existence test
			// for the same reason: an order whose lines match twice is still ONE row.
			const bySku = o.lines.some((l) => l.sku.toLowerCase() === needle);
			if (!byId && !byRef && !bySku) return false;
		}
		// The customer dimension: a UNION inside the key (customer_id = :id OR
		// lower(buyer_ref) = lower(:buyerRef)), ANDed with everything above. A key
		// with neither half set constrains nothing (matches the SQL adapter).
		if (filter.customer !== undefined) {
			const { customerId, buyerRef } = filter.customer;
			if (customerId !== undefined || buyerRef !== undefined) {
				const byId = customerId !== undefined && o.customerId === customerId;
				const byRef = buyerRef !== undefined && o.buyerRef.toLowerCase() === buyerRef.toLowerCase();
				if (!byId && !byRef) return false;
			}
		}
		return true;
	}

	async countOrders(filter: OrderListFilter): Promise<number> {
		let count = 0;
		for (const s of this.#orders.values()) {
			if (this.#matchesFilter(s.order, filter)) count++;
		}
		return count;
	}

	async listOrders(filter: OrderListFilter, page: OrderListPage): Promise<OrderListResult> {
		// EXACT parity with `KyselyOrderStore.listOrders` (MOD-5): same filters
		// (via the shared `#matchesFilter` predicate), same `created_at DESC, id
		// DESC` order, same half-open `[from, to)` window, same folded id-PREFIX /
		// buyer_ref-SUBSTRING / exact-line-sku `search`, same `limit + 1` next-page
		// detection.
		const cursor = page.cursor ?? null;

		const matched = [...this.#orders.values()]
			.map((s) => s.order)
			.filter((o) => {
				if (!this.#matchesFilter(o, filter)) return false;
				// Keyset predicate: everything strictly "less than" the cursor position
				// under `created_at DESC, id DESC`.
				if (cursor !== null) {
					if (o.createdAt > cursor.createdAt) return false;
					if (o.createdAt === cursor.createdAt && o.id >= cursor.id) return false;
				}
				return true;
			})
			// Order ids and created_at are ASCII (opaque tokens / fixed-width ISO-8601),
			// so plain code-unit comparison matches the store's byte ordering. Use the
			// SAME code-unit `<`/`>` here as the keyset predicate + from/to filters above
			// (never `localeCompare`), so the fake is internally consistent. Non-C
			// Postgres collations are out of scope for the fake.
			.toSorted(
				(a, b) =>
					a.createdAt === b.createdAt
						? codeUnitDesc(a.id, b.id) // id DESC
						: codeUnitDesc(a.createdAt, b.createdAt), // created_at DESC
			);

		const window = matched.slice(0, page.limit + 1);
		const hasMore = window.length > page.limit;
		const rows = hasMore ? window.slice(0, page.limit) : window;
		const last = rows.at(-1);
		const nextCursor =
			hasMore && last !== undefined ? { createdAt: last.createdAt, id: last.id } : null;
		return { orders: rows.map((o) => this.#toSummary(o)), nextCursor };
	}

	/** TEST-ONLY: directly seed an order row for the admin-list contract with an
	 *  EXACT `createdAt`/`state`/`buyerRef`/`total`. Not part of `OrderStore`. */
	seedSummaryOrder(row: SeedOrderSummaryRow): void {
		const oid = toOrderId(row.id);
		const cur = toCurrency(row.currency);
		const order: Order = {
			id: oid,
			cartId: null,
			currency: cur,
			state: row.state,
			idempotencyKey: toIdempotencyKey(`seed-${row.id}`),
			holdExpiresAt: row.createdAt,
			paymentMethod: row.paymentMethod ?? null,
			buyerRef: row.buyerRef,
			customerId: row.customerId ?? null,
			createdAt: row.createdAt,
			updatedAt: row.createdAt,
			lines: [],
			totals: {
				orderId: oid,
				currency: cur,
				subtotal: cents(row.totalCents),
				discount: cents(0),
				shipping: cents(0),
				tax: cents(0),
				total: cents(row.totalCents),
				appliedCouponCode: null,
				shippingMethodSnapshot: null,
				taxBreakdown: null,
			},
			shippingAddress: null,
			reconciliationFlag: row.reconciliationFlag ?? null,
			reconciliationResolution: null,
			fulfillment: null,
			cancellation: null,
		};
		this.#orders.set(row.id, { order });
	}

	#toSummary(order: Order): OrderSummary {
		return {
			id: order.id,
			state: order.state,
			currency: order.currency,
			buyerRef: order.buyerRef,
			customerId: order.customerId,
			paymentMethod: order.paymentMethod,
			createdAt: order.createdAt,
			total: order.totals.total,
			reconciliationFlag: order.reconciliationFlag !== null,
		};
	}

	async linkGuestOrders(customerId: CustomerId, buyerRef: string): Promise<number> {
		// Case-insensitive on buyer_ref (review round H2): checkout stores the
		// buyer's email VERBATIM, while the login email is lower-normalized —
		// compare-side folding links a mixed-case guest checkout without rewriting
		// the Phase-4 value (which is also the exact-match entitlement claim key).
		const needle = buyerRef.toLowerCase();
		let linked = 0;
		for (const stored of this.#orders.values()) {
			if (stored.order.buyerRef.toLowerCase() === needle && stored.order.customerId === null) {
				stored.order.customerId = customerId;
				stored.order.updatedAt = this.#clock.now().toISOString();
				linked++;
			}
		}
		return linked;
	}

	async claimNextEmail(now: string, leaseUntil: string): Promise<OutboxEmail | null> {
		// Claimability is lease-driven: a row is claimable when it isn't sent, isn't
		// failed, and has no live lease (null, or elapsed). This unifies "fresh
		// pending", "crashed 'sending' whose lease expired", and "rescheduled with a
		// retry backoff" — a rescheduled row is not re-claimed until its lease passes.
		const claimable = this.#outbox
			.filter(
				(r) =>
					r.sentAt === null &&
					r.status !== "failed" &&
					(r.leaseUntil === null || r.leaseUntil <= now),
			)
			.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
		const row = claimable[0];
		if (row === undefined) return null;
		row.status = "sending";
		row.leaseUntil = leaseUntil;
		row.attempts += 1;
		return {
			id: row.id,
			orderId: row.orderId as OrderId,
			toState: row.toState,
			attempts: row.attempts,
		};
	}

	async markEmailSent(id: string, now: string): Promise<void> {
		const row = this.#outbox.find((r) => r.id === id);
		if (row === undefined) return;
		row.status = "sent";
		row.sentAt = now;
	}

	async rescheduleEmail(id: string, retryAt: string | null): Promise<void> {
		const row = this.#outbox.find((r) => r.id === id);
		if (row === undefined) return;
		if (retryAt === null) {
			row.status = "failed";
			row.leaseUntil = null;
		} else {
			row.status = "pending";
			row.leaseUntil = retryAt; // backoff — not re-claimable until retryAt
		}
	}

	// -- test surface ---------------------------------------------------------

	/** Payments recorded (for contract assertions). */
	payments(orderId: string): StoredPayment[] {
		return this.#payments.filter((p) => p.orderId === orderId);
	}

	/** Outbox rows for an order (for contract assertions). */
	outboxFor(orderId: string): { toState: OrderState; status: OutboxStatus }[] {
		return this.#outbox
			.filter((r) => r.orderId === orderId)
			.map((r) => ({ toState: r.toState, status: r.status }));
	}

	// -- internals ------------------------------------------------------------

	#guardedFlip(orderId: OrderId, from: OrderState, to: OrderState, enqueue?: boolean): boolean {
		const stored = this.#orders.get(orderId);
		if (stored === undefined || stored.order.state !== from) return false;
		if (
			to === "paid" &&
			stored.order.offlinePayment &&
			stored.order.offlinePayment.status !== "received"
		)
			return false;
		stored.order.state = to;
		stored.order.updatedAt = this.#clock.now().toISOString();
		// State-change audit rides the (won) flip, exactly like the real adapter's
		// event INSERT inside the guarded UPDATE transaction — so a 0-row miss above
		// (already-flipped / lost race) writes NO event. No actor: a bare flip has
		// no modeled who (markPaid/transition).
		this.#appendEvent(orderId, from, to, null);
		// markPaid passes no explicit flag → enqueue iff the target state has a
		// template (paid ⇒ yes); `transition` passes it explicitly.
		const shouldEnqueue = enqueue ?? emailTemplateForState(to) !== null;
		if (shouldEnqueue) this.#enqueue(orderId, to);
		return true;
	}

	/** Append a state-change audit row (the fake analogue of the `order_events`
	 *  INSERT). Called ONLY on a won flip, so a replay/lost race records nothing. */
	#appendEvent(orderId: string, from: OrderState, to: OrderState, actor: string | null): void {
		this.#events.push({
			id: this.#idGen.newId(),
			orderId: toOrderId(orderId),
			at: this.#clock.now().toISOString(),
			kind: "state_change",
			fromState: from,
			toState: to,
			actor,
		});
	}

	/** Outbox INSERT … ON CONFLICT(order_id, to_state) DO NOTHING (§5). */
	#enqueue(orderId: string, toState: OrderState): void {
		if (this.#outbox.some((r) => r.orderId === orderId && r.toState === toState)) return;
		this.#outbox.push({
			id: this.#idGen.newId(),
			orderId,
			toState,
			status: "pending",
			attempts: 0,
			leaseUntil: null,
			sentAt: null,
			createdAt: this.#clock.now().toISOString(),
		});
	}

	#clone(order: Order): Order {
		return {
			...order,
			lines: order.lines.map((l) => ({ ...l })),
			totals: { ...order.totals },
			// Deep-clone the frozen ship-to so a caller can never mutate the stored
			// snapshot (mirrors the immutability the real adapter gets structurally).
			shippingAddress: cloneAddress(order.shippingAddress),
			billingAddress: order.billingAddress ? { ...order.billingAddress } : null,
			offlinePayment: order.offlinePayment ? { ...order.offlinePayment } : null,
			fulfillment: order.fulfillment === null ? null : { ...order.fulfillment },
			cancellation: order.cancellation === null ? null : { ...order.cancellation },
		};
	}
}

/** Copy an {@link OrderAddress} (or pass null through) so the fake never shares a
 *  mutable reference with a caller — the snapshot must read frozen. */
function cloneAddress(address: OrderAddress | null): OrderAddress | null {
	return address === null ? null : { ...address };
}
