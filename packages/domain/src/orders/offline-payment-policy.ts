import type { Order, OrderState } from "./model.js";
import type { RecordOfflinePaymentInput, OfflineOrderStoreResult } from "../ports/order-store.js";

type Outcome = OfflineOrderStoreResult["outcome"];
const COD_RECEIPT_STATES: ReadonlySet<OrderState> = new Set([
	"processing",
	"shipped",
	"delivered",
	"completed",
]);

export function codAcceptanceOutcome(order: Order, now: string): Outcome {
	if (
		order.paymentMethod !== "cod" ||
		order.offlinePayment?.method !== "cod" ||
		order.lines.some((line) => line.fulfillmentKind !== "physical")
	)
		return "not_eligible";
	if (order.offlinePayment.acceptedAt !== null) return "duplicate";
	if (order.state !== "pending" || order.offlinePayment.status !== "awaiting") return "not_payable";
	return order.holdExpiresAt <= now ? "expired" : "applied";
}

export function offlineReceiptOutcome(
	order: Order,
	input: RecordOfflinePaymentInput,
	now: string,
): Outcome {
	const payment = order.offlinePayment;
	if (payment === null || payment === undefined || payment.method !== order.paymentMethod)
		return "not_eligible";
	if (input.amount !== order.totals.total || input.currency !== order.totals.currency)
		return "amount_mismatch";
	if (payment.status === "received") {
		return payment.receiptRef === input.receiptRef ? "duplicate" : "receipt_conflict";
	}
	if (order.state === "pending" && payment.status === "awaiting")
		return order.holdExpiresAt <= now ? "expired" : "applied";
	if (
		payment.method === "cod" &&
		payment.status === "accepted" &&
		COD_RECEIPT_STATES.has(order.state)
	)
		return "applied";
	return "not_payable";
}

export function offlineProviderRef(receiptRef: string): string {
	return `offline-receipt:${receiptRef}`;
}
