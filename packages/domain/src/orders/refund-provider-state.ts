import type { ApplyRefundProviderOutcomeInput, RefundRecord } from "../ports/order-store.js";
import type { RefundProviderStatus } from "../ports/payment-gateway.js";

/** Shared pure policy; stores apply its decision atomically with the order's ledger/state. */
export function refundProviderUpdate(
	row: RefundRecord,
	input: ApplyRefundProviderOutcomeInput,
): "apply" | "noop" | "mismatch" {
	if (
		row.kind !== "gateway" ||
		row.orderId !== input.orderId ||
		row.gateway !== input.gateway ||
		row.amount !== input.amount ||
		row.currency !== input.currency ||
		(row.paymentRef !== undefined && row.paymentRef !== input.paymentRef) ||
		(row.refundRef !== null && row.refundRef !== input.refundRef)
	)
		return "mismatch";
	const prior = row.providerEvent;
	if (input.event === undefined) {
		// A create response can arrive after a webhook; it cannot roll that evidence back.
		if (prior !== undefined || row.status === "recorded") return "noop";
	} else if (prior !== undefined) {
		if (input.event.id === prior.id || input.event.created < prior.created) return "noop";
		if (input.event.created === prior.created && input.providerStatus !== row.providerStatus) {
			// Stripe timestamps have second precision. An explicit predecessor orders
			// same-second changes; otherwise prefer the outcome that avoids false completion.
			if (input.event.previousStatus !== row.providerStatus) {
				if (
					prior.previousStatus === input.providerStatus ||
					statusRank(input.providerStatus) <= statusRank(row.providerStatus)
				)
					return "noop";
			}
		}
	}
	if (
		row.status === "recorded" &&
		prior === undefined &&
		input.event !== undefined &&
		(input.providerStatus === "pending" || input.providerStatus === "requires_action") &&
		input.event.previousStatus !== "succeeded"
	)
		return "noop";
	if (row.status === "voided") {
		// Released capacity can have been reused. A terminal failure is never resurrected.
		return row.providerStatus === input.providerStatus ? "noop" : "mismatch";
	}
	return "apply";
}

function statusRank(status: RefundProviderStatus | undefined): number {
	if (status === "failed" || status === "canceled") return 3;
	if (status === "pending" || status === "requires_action") return 2;
	return 1;
}
