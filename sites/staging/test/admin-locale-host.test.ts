import { expect, test } from "vitest";
import { ADMIN_LOCALE_HEADER, forwardAdminLocale } from "@otta-sh/plugin";
import { sanitizeHeadersForSandbox } from "../node_modules/emdash/src/plugins/request-meta.js";

const adminPath = "/_emdash/api/plugins/otta/admin";

test.each([
	["emdash_session=fixture-session; wscommerce_admin_locale=hr", "hr"],
	["wscommerce_admin_locale=hr-HR", "hr"],
	["wscommerce_admin_locale=hr%2DHR", "hr"],
	["wscommerce_locale=hr", "en"],
	["wscommerce_admin_locale=%ZZ", "en"],
	["wscommerce_admin_locale=unsupported", "en"],
	["", "en"],
])("forwards only normalized locale through the actual host filter: %s", (cookie, expected) => {
	const request = new Request(`https://shop.test${adminPath}`, {
		method: "POST",
		headers: { cookie, authorization: "Bearer fixture-auth", "x-emdash-request": "1" },
	});
	const forwarded = forwardAdminLocale(request, adminPath);
	const sanitized = sanitizeHeadersForSandbox(forwarded.headers);
	expect(sanitized[ADMIN_LOCALE_HEADER]).toBe(expected);
	expect(sanitized).not.toHaveProperty("cookie");
	expect(sanitized).not.toHaveProperty("authorization");
	expect(sanitized).not.toHaveProperty("x-emdash-request");
	expect(forwarded.headers.get("cookie")).toBe(cookie);
	expect(forwarded.headers.get("authorization")).toBe("Bearer fixture-auth");
	expect(request.headers.get(ADMIN_LOCALE_HEADER)).toBeNull();
});

test("retains request bytes, native values and authentication while replacing a spoofed locale header", async () => {
	const body =
		'{"type":"otta_console_act","action_id":"products:restock","value":{"sku":"Settings","quantity":"2","idempotencyKey":"fixture-key"}}';
	const request = new Request(`https://shop.test${adminPath}?cursor=private%2Bkey%3D`, {
		method: "POST",
		headers: {
			cookie: "emdash_session=fixture-session; wscommerce_admin_locale=hr",
			[ADMIN_LOCALE_HEADER]: "secret-looking-client-value",
			"content-type": "application/json",
			"x-emdash-request": "1",
		},
		body,
	});
	const forwarded = forwardAdminLocale(request, adminPath);
	expect(forwarded.url).toBe(request.url);
	expect(forwarded.method).toBe(request.method);
	expect(forwarded.headers.get(ADMIN_LOCALE_HEADER)).toBe("hr");
	expect(forwarded.headers.get("x-emdash-request")).toBe("1");
	expect(await forwarded.text()).toBe(body);
	expect(await request.text()).toBe(body);
});

test.each([
	["POST", "/checkout"],
	["POST", "/_emdash/api/plugins/other/admin"],
	["POST", "/_emdash/api/plugins/otta/stripe-webhook"],
	["POST", "/wp-json/wc/v3/orders"],
	["GET", adminPath],
])("leaves unrelated requests untouched: %s %s", (method, path) => {
	const request = new Request(`https://shop.test${path}`, { method });
	expect(forwardAdminLocale(request, adminPath)).toBe(request);
	expect(request.headers.has(ADMIN_LOCALE_HEADER)).toBe(false);
});
