import { describe, expect, it } from "vitest";
import { encodeWooHttpRequest, decodeWooHttpResponse, handleWooHttpBridge } from "../src/index.js";
import type { WooHandlerOptions } from "../src/index.js";
describe("thin native host HTTP bridge", () => {
	it("preserves server credentials and exact body without forwarding ambient cookies", async () => {
		const body = '{ "meta_data": [] }';
		const input = await encodeWooHttpRequest(
			new Request("https://shop.example/wp-json/wc/v3/orders/1", {
				method: "PUT",
				headers: {
					Authorization: "Basic dGVzdA==",
					"Content-Type": "application/json",
					"Idempotency-Key": "abc",
					Cookie: "session=private",
				},
				body,
			}),
		);
		expect(input).toMatchObject({
			method: "PUT",
			body,
			headers: {
				authorization: "Basic dGVzdA==",
				"content-type": "application/json",
				"idempotency-key": "abc",
			},
		});
		expect(input.headers).not.toHaveProperty("cookie");
	});
	it("replays the native handler HTTP status and headers", async () => {
		const options = { allowInsecureLocalhost: false } as WooHandlerOptions;
		const wire = await handleWooHttpBridge(
			{ url: "https://shop.example/wp-json/wc/v3/unknown", method: "GET", headers: {} },
			options,
		);
		const response = decodeWooHttpResponse(wire);
		expect(response.status).toBe(404);
		expect(response.headers.get("Content-Type")).toContain("application/json");
		expect(await response.json()).toMatchObject({ code: "rest_no_route" });
	});
});
