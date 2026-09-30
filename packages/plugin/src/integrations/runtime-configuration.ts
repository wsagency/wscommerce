import type { IntegrationConfiguration } from "./invoices.js";

const text = (bindings: Record<string, unknown>, key: string): string | undefined => {
	const value = bindings[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
};
const number = (bindings: Record<string, unknown>, key: string, fallback: number) => {
	const value = text(bindings, key);
	if (value === undefined) return fallback;
	if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)))
		throw new Error("INVALID_INVOICE_CONFIGURATION");
	return Number(value);
};

/** Call only in a server entrypoint. Values are injected, never fetched from customer data or persisted in plugin KV. */
export function integrationConfigurationFromBindings(
	bindings: Record<string, unknown> = {},
): IntegrationConfiguration {
	const rawOwner = text(bindings, "INVOICE_OWNER");
	const invoiceOwner =
		rawOwner === "solo" || rawOwner === "e-racuni" || rawOwner === "woocommerce-connector"
			? rawOwner
			: "disabled";
	const shopId = text(bindings, "COMMERCE_SHOP_ID");
	if (invoiceOwner !== "disabled" && !shopId) throw new Error("COMMERCE_SHOP_ID_REQUIRED");
	const result: IntegrationConfiguration = {
		invoiceOwner,
		shopId: shopId ?? "unconfigured",
		invoiceLiveEnabled: text(bindings, "INVOICE_LIVE_ENABLED") === "true",
		allowLegacyBillingFromShipping:
			text(bindings, "INVOICE_ALLOW_LEGACY_SHIPPING_BILLING") === "true",
	};
	const soloToken = text(bindings, "SOLO_API_TOKEN");
	if (invoiceOwner === "solo" && soloToken) {
		const codPaymentType = number(bindings, "SOLO_COD_PAYMENT_TYPE", 1);
		if (codPaymentType !== 1 && codPaymentType !== 2 && codPaymentType !== 5)
			throw new Error("INVALID_INVOICE_CONFIGURATION");
		result.solo = {
			token: soloToken,
			buyerType: 1,
			serviceType: number(bindings, "SOLO_SERVICE_TYPE", 1),
			invoiceType: number(bindings, "SOLO_INVOICE_TYPE", 1),
			codPaymentType,
		};
	}
	const endpoint = text(bindings, "ERACUNI_API_URL");
	const username = text(bindings, "ERACUNI_USERNAME");
	const secretKey = text(bindings, "ERACUNI_SECRET_KEY");
	const token = text(bindings, "ERACUNI_ORG_TOKEN");
	if (invoiceOwner === "e-racuni" && endpoint && username && secretKey && token)
		result.eRacuni = {
			endpoint,
			username,
			secretKey,
			token,
			businessUnit: text(bindings, "ERACUNI_BUSINESS_UNIT"),
			costPosition: text(bindings, "ERACUNI_COST_POSITION"),
		};
	return result;
}
