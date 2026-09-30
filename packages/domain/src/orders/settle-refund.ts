import type { VerifiedRefundConfirmation } from "../ports/payment-gateway.js";
import type { SettleDeps, SettleResult } from "./settle-order.js";

/** A verified refund event re-drives the existing reservation; it never issues money. */
export async function settleRefund(
	deps: SettleDeps,
	conf: VerifiedRefundConfirmation,
): Promise<SettleResult> {
	const existing = await deps.orderStore.getRefundByIdempotencyKey(conf.refundKey);
	const paymentRef =
		conf.chargeRef !== undefined && existing?.paymentRef === conf.chargeRef
			? conf.chargeRef
			: conf.paymentRef;
	const result = await deps.orderStore.applyRefundProviderOutcome({
		orderId: conf.orderId,
		gateway: conf.gateway,
		amount: conf.amount,
		currency: conf.currency,
		paymentRef,
		idempotencyKey: conf.refundKey,
		refundRef: conf.providerRef,
		providerStatus: conf.providerStatus,
		event: {
			id: conf.dedupeKey,
			created: conf.eventCreated,
			...(conf.previousStatus === undefined ? {} : { previousStatus: conf.previousStatus }),
		},
	});
	if (result.outcome === "mismatch" || result.outcome === "not_found") {
		const detail = `refund ${conf.providerRef}: provider event does not match its reserved order, payment or money — reconcile before retrying`;
		await deps.orderStore.flagReconciliation(conf.orderId, detail);
		await deps.paymentEventStore.recordAnomaly({
			orderId: conf.orderId,
			gateway: conf.gateway,
			kind: "REFUND_UNRECORDED",
			detail,
			now: deps.clock.now().toISOString(),
		});
		return { ok: false, reason: "AMOUNT_MISMATCH" };
	}
	return { ok: true, order: result.order, noop: result.outcome === "noop" };
}
