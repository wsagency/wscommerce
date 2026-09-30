import type {
	AcceptCODOrderInput,
	RecordOfflinePaymentInput,
	OfflineOrderStoreResult,
} from "../ports/order-store.js";
import type { Order } from "./model.js";
import { applyOrderFulfillment, type SettleDeps } from "./settle-order.js";

export type OfflinePaymentFailure =
	| "INVALID_INPUT"
	| "ORDER_NOT_FOUND"
	| "NOT_OFFLINE_ORDER"
	| "OFFLINE_PAYMENT_EXPIRED"
	| "OFFLINE_PAYMENT_NOT_PAYABLE"
	| "AMOUNT_MISMATCH"
	| "RECEIPT_CONFLICT"
	| "IDEMPOTENCY_KEY_REUSED";
export type OfflinePaymentResult =
	| { ok: true; applied: boolean; order: Order }
	| { ok: false; reason: OfflinePaymentFailure };

/** Only a trusted private caller may invoke this command; actor text is audit attribution. */
export async function acceptCODOrder(
	deps: SettleDeps,
	command: AcceptCODOrderInput,
): Promise<OfflinePaymentResult> {
	if (!bounded(command.acceptedBy, 200) || !bounded(command.idempotencyKey, 200))
		return { ok: false, reason: "INVALID_INPUT" };
	const result = await deps.orderStore.acceptCODOrder({
		...command,
		acceptedBy: command.acceptedBy.trim(),
	});
	const mapped = toResult(result);
	if (!mapped.ok) return mapped;
	if (canFulfill(mapped.order))
		await applyOrderFulfillment(deps, mapped.order, "cod", deps.clock.now().toISOString(), false);
	return { ...mapped, order: (await deps.orderStore.getById(mapped.order.id)) ?? mapped.order };
}

/** Records witnessed money, never an untrusted public proof. Store claims precede capture. */
export async function confirmOfflinePayment(
	deps: SettleDeps,
	command: RecordOfflinePaymentInput,
): Promise<OfflinePaymentResult> {
	if (
		!bounded(command.recordedBy, 200) ||
		!bounded(command.receiptRef, 200) ||
		!bounded(command.idempotencyKey, 200) ||
		!Number.isSafeInteger(command.amount) ||
		command.amount < 0
	)
		return { ok: false, reason: "INVALID_INPUT" };
	const result = await deps.orderStore.recordOfflinePayment({
		...command,
		receiptRef: command.receiptRef.trim(),
		recordedBy: command.recordedBy.trim(),
	});
	const mapped = toResult(result);
	if (!mapped.ok) return mapped;
	if (canFulfill(mapped.order))
		await applyOrderFulfillment(
			deps,
			mapped.order,
			mapped.order.offlinePayment!.method,
			deps.clock.now().toISOString(),
		);
	return { ...mapped, order: (await deps.orderStore.getById(mapped.order.id)) ?? mapped.order };
}

function bounded(value: string, max: number): boolean {
	return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}
function canFulfill(order: Order): boolean {
	return ["paid", "processing", "shipped", "delivered", "completed"].includes(order.state);
}
function toResult(result: OfflineOrderStoreResult): OfflinePaymentResult {
	if ((result.outcome === "applied" || result.outcome === "duplicate") && result.order !== null)
		return { ok: true, applied: result.outcome === "applied", order: result.order };
	const reasons: Record<
		Exclude<OfflineOrderStoreResult["outcome"], "applied" | "duplicate">,
		OfflinePaymentFailure
	> = {
		order_not_found: "ORDER_NOT_FOUND",
		not_eligible: "NOT_OFFLINE_ORDER",
		expired: "OFFLINE_PAYMENT_EXPIRED",
		not_payable: "OFFLINE_PAYMENT_NOT_PAYABLE",
		amount_mismatch: "AMOUNT_MISMATCH",
		receipt_conflict: "RECEIPT_CONFLICT",
		key_conflict: "IDEMPOTENCY_KEY_REUSED",
	};
	return {
		ok: false,
		reason:
			result.outcome === "applied" || result.outcome === "duplicate"
				? "ORDER_NOT_FOUND"
				: reasons[result.outcome],
	};
}
