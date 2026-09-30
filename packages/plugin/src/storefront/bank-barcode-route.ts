import { orderId } from "@otta-sh/domain";
import { createInProcessCommerceStores } from "../commerce/in-process-commerce-stores.js";
import { renderHub3Svg } from "../payments/pdf417.js";
import type { RouteHandler } from "../types.js";
import { renderGuard, type RenderGuardFailure } from "./pdp-route.js";
export const STOREFRONT_BANK_BARCODE_ROUTE = "storefront/order/bank-barcode";
export type BankBarcodeResult =
	| { ok: true; svg: string }
	| { ok: false; reason: "NOT_FOUND" | "NOT_AVAILABLE" }
	| RenderGuardFailure;
/** The native UUID is the existing private receipt capability. No settings read or mutation. */
export function createBankBarcodeRouteHandler(): RouteHandler {
	return (route, ctx) =>
		renderGuard(STOREFRONT_BANK_BARCODE_ROUTE, async () => {
			const input = route.input as { orderId?: unknown } | null;
			const id = input?.orderId;
			if (typeof id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
				return { ok: false, reason: "NOT_FOUND" } as const;
			const order = await createInProcessCommerceStores(ctx).orderStore.getById(orderId(id));
			if (!order) return { ok: false, reason: "NOT_FOUND" } as const;
			const snapshot = order.offlinePayment?.bankTransfer;
			if (
				order.paymentMethod !== "bank_transfer" ||
				order.offlinePayment?.method !== "bank_transfer" ||
				snapshot?.version !== 1
			)
				return { ok: false, reason: "NOT_AVAILABLE" } as const;
			return { ok: true, svg: renderHub3Svg(snapshot) } as const;
		});
}
