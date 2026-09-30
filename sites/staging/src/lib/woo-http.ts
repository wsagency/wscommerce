import type { APIContext } from "astro";
import { decodeWooHttpResponse, encodeWooHttpRequest } from "@emdash-commerce/compat-woocommerce";
import type { WooHttpResponse } from "@emdash-commerce/compat-woocommerce";
import { OTTA_PLUGIN_ID, WOO_HTTP_ROUTE } from "@otta-sh/plugin";
import { routeDispatcher } from "./cart-actions.js";

const failed = (status: number, code: string) =>
	Response.json(
		{ code, message: "The commerce REST request could not be completed.", data: { status } },
		{ status, headers: { "Cache-Control": "no-store" } },
	);

/** Anonymous HTTP edge. Woo Basic authorization is forwarded in an ephemeral envelope, never logged. */
export async function forwardWooHttp(context: APIContext): Promise<Response> {
	try {
		const dispatcher = routeDispatcher(context);
		if (!dispatcher) return failed(503, "woocommerce_rest_unavailable");
		const wire = await encodeWooHttpRequest(context.request);
		const request = new Request(
			new URL(`/_emdash/api/plugins/${OTTA_PLUGIN_ID}/${WOO_HTTP_ROUTE}`, context.url),
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(wire),
			},
		);
		const envelope = (await dispatcher(OTTA_PLUGIN_ID, "POST", `/${WOO_HTTP_ROUTE}`, request)) as {
			success?: boolean;
			data?: WooHttpResponse;
		};
		if (!envelope.success || !envelope.data) return failed(503, "woocommerce_rest_unavailable");
		return decodeWooHttpResponse(envelope.data);
	} catch (error) {
		return failed(
			error instanceof Error && "status" in error && error.status === 400 ? 400 : 503,
			"woocommerce_rest_invalid_request",
		);
	}
}
