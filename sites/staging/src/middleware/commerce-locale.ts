import type { MiddlewareHandler } from "astro";
import { ADMIN_ROUTE, OTTA_PLUGIN_ID, forwardAdminLocale } from "@otta-sh/plugin";

const adminRoutePath = `/_emdash/api/plugins/${OTTA_PLUGIN_ID}/${ADMIN_ROUTE}`;

/** Forward presentation metadata before the host's normal authentication and plugin pipeline. */
export const onRequest: MiddlewareHandler = (context, next) =>
	next(forwardAdminLocale(context.request, adminRoutePath));
