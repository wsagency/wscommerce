import type { WooHandlerOptions } from "./types.js";
import { createWooCommerceHandler, wooErrorResponse } from "./http.js";
import { WooMutationError } from "./errors.js";
export interface WooHttpRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}
export interface WooHttpResponse {
	status: number;
	headers: Record<string, string>;
	body: string;
}
const FORWARDED_HEADERS = ["authorization", "content-type", "idempotency-key"];
async function boundedBody(request: Request): Promise<string> {
	if (!request.body) return "";
	const reader = request.body.getReader(),
		decoder = new TextDecoder();
	let bytes = 0,
		body = "";
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) return body + decoder.decode();
			bytes += chunk.value.byteLength;
			if (bytes > 262144) {
				await reader.cancel();
				throw new WooMutationError(
					"woocommerce_rest_invalid_param",
					"Request body is too large.",
					400,
				);
			}
			body += decoder.decode(chunk.value, { stream: true });
		}
	} finally {
		reader.releaseLock();
	}
}
/** HTTP shim to the anonymous host plugin route. Never log this ephemeral authenticated envelope. */
export async function encodeWooHttpRequest(request: Request): Promise<WooHttpRequest> {
	const headers: Record<string, string> = {};
	for (const key of FORWARDED_HEADERS) {
		const value = request.headers.get(key);
		if (value !== null) headers[key] = value;
	}
	if (Number(request.headers.get("Content-Length") ?? 0) > 262144)
		throw new WooMutationError("woocommerce_rest_invalid_param", "Request body is too large.", 400);
	const body = ["GET", "HEAD", "OPTIONS"].includes(request.method)
		? undefined
		: await boundedBody(request);
	if (body !== undefined && new TextEncoder().encode(body).length > 262144)
		throw new WooMutationError("woocommerce_rest_invalid_param", "Request body is too large.", 400);
	return {
		url: request.url,
		method: request.method,
		headers,
		...(body === undefined ? {} : { body }),
	};
}
export function decodeWooHttpResponse(result: WooHttpResponse): Response {
	return new Response(result.body || null, { status: result.status, headers: result.headers });
}
export async function handleWooHttpBridge(
	input: WooHttpRequest,
	options: WooHandlerOptions,
): Promise<WooHttpResponse> {
	let response: Response;
	try {
		if (
			!input ||
			typeof input.url !== "string" ||
			typeof input.method !== "string" ||
			!input.headers ||
			typeof input.headers !== "object" ||
			Array.isArray(input.headers) ||
			(input.body !== undefined && typeof input.body !== "string")
		)
			throw new Error();
		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(input.headers)) {
			if (
				!FORWARDED_HEADERS.includes(key.toLowerCase()) ||
				typeof value !== "string" ||
				value.length > 2048
			)
				throw new Error();
			headers[key] = value;
		}
		if (input.body !== undefined && new TextEncoder().encode(input.body).length > 262144)
			throw new Error();
		const request = new Request(input.url, {
			method: input.method,
			headers,
			...(input.body === undefined ? {} : { body: input.body }),
		});
		response = await createWooCommerceHandler(options)(request);
	} catch {
		response = wooErrorResponse(
			new WooMutationError(
				"woocommerce_rest_invalid_request",
				"The host HTTP bridge request is malformed.",
				400,
			),
		);
	}
	return {
		status: response.status,
		headers: Object.fromEntries(response.headers.entries()),
		body: await response.text(),
	};
}
