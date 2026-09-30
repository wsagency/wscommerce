import { describe, expect, it } from "vitest";
import { integrationConfigurationFromBindings } from "../src/integrations/runtime-configuration.js";

describe("server runtime invoice configuration", () => {
	it("defaults to disabled and adding a secret never enables issuance", () => {
		expect(
			integrationConfigurationFromBindings({ SOLO_API_TOKEN: "test-only-secret" }),
		).toMatchObject({ invoiceOwner: "disabled", invoiceLiveEnabled: false });
		expect(
			integrationConfigurationFromBindings({
				INVOICE_OWNER: "solo",
				COMMERCE_SHOP_ID: "shop-a",
				SOLO_API_TOKEN: "test-only-secret",
			}),
		).toMatchObject({
			invoiceOwner: "solo",
			invoiceLiveEnabled: false,
			solo: { token: "test-only-secret", buyerType: 1 },
		});
	});
	it("requires a stable shop id before enabling an invoice owner", () => {
		expect(() => integrationConfigurationFromBindings({ INVOICE_OWNER: "solo" })).toThrow(
			"COMMERCE_SHOP_ID_REQUIRED",
		);
	});
	it("connector ownership excludes direct provider configuration", () => {
		const config = integrationConfigurationFromBindings({
			INVOICE_OWNER: "woocommerce-connector",
			COMMERCE_SHOP_ID: "shop-a",
			INVOICE_LIVE_ENABLED: "true",
			SOLO_API_TOKEN: "test-only-secret",
			ERACUNI_USERNAME: "test-user",
		});
		expect(config.solo).toBeUndefined();
		expect(config.eRacuni).toBeUndefined();
	});
	it("reads the organization endpoint and all e-racuni credentials from server bindings", () => {
		expect(
			integrationConfigurationFromBindings({
				INVOICE_OWNER: "e-racuni",
				COMMERCE_SHOP_ID: "shop-a",
				ERACUNI_API_URL: "https://eurofaktura.com/WebServices/API",
				ERACUNI_USERNAME: "test-user",
				ERACUNI_SECRET_KEY: "test-only-secret",
				ERACUNI_ORG_TOKEN: "test-only-token",
			}),
		).toMatchObject({
			eRacuni: {
				endpoint: "https://eurofaktura.com/WebServices/API",
				username: "test-user",
				secretKey: "test-only-secret",
				token: "test-only-token",
			},
		});
	});
});
