/** Server-only composition entrypoint for the trusted EmDash plugin descriptor. */
import base from "@otta-sh/plugin/plugin";
import { integrationConfigurationFromBindings, withInvoiceIntegrations } from "@otta-sh/plugin";
import { env } from "virtual:emdash/env";

export default withInvoiceIntegrations(base, async () =>
	integrationConfigurationFromBindings(env ?? {}),
);
