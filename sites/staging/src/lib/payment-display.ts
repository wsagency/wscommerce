import { STOREFRONT_ORDER_ROUTE, type OrderRouteResult } from "@otta-sh/plugin";
import type { PublicPluginApiRouteHandler } from "emdash/plugin-utils";
import {
	checkoutStashTotal,
	type CheckoutStash,
	type CheckoutStashTotal,
} from "./checkout-cookie.js";
import { dispatchOttaRoute } from "./otta-api.js";
import type { SiteLocale } from "./site-locale.js";

/**
 * The stash keeps a formatted place-time snapshot, without numeric amounts.
 * Reformat by reading that SAME private order's immutable totals. An unavailable
 * read costs only localization: the approved stash label remains available.
 * This route cannot create an intent, mutate an order or contact a provider.
 */
export async function localizedCheckoutTotal(
	stash: CheckoutStash,
	locale: SiteLocale,
	handler: PublicPluginApiRouteHandler | undefined,
	url: URL,
): Promise<CheckoutStashTotal | undefined> {
	const result = await dispatchOttaRoute<OrderRouteResult>(
		handler,
		STOREFRONT_ORDER_ROUTE,
		{ orderId: stash.orderId, locale },
		url,
	);
	if (
		result === null ||
		!result.ok ||
		result.order?.id !== stash.orderId ||
		["expired", "cancelled", "failed", "refunded"].includes(result.order.state)
	)
		return stash.total;
	const total = checkoutStashTotal(result.order?.totals?.total?.money);
	if (total === undefined || (stash.total !== undefined && total.currency !== stash.total.currency))
		return stash.total;
	return total;
}
