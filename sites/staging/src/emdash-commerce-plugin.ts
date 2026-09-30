/** Server-only composition entrypoint for the trusted EmDash plugin descriptor. */
import base from "@otta-sh/plugin/plugin";
import {
	integrationConfigurationFromBindings,
	withInvoiceIntegrations,
	withWooCommerceIntegrations,
	wooConfigurationFromBindings,
} from "@otta-sh/plugin";
import { env } from "virtual:emdash/env";
import { wooProductContent } from "./lib/woo-product-content.js";

const invoices = withInvoiceIntegrations(base, async () =>
	integrationConfigurationFromBindings(env ?? {}),
);
export default withWooCommerceIntegrations(
	invoices,
	async () => wooConfigurationFromBindings(env ?? {}),
	{ content: wooProductContent },
);
