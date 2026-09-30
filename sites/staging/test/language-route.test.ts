import type { APIContext } from "astro";
import { describe, expect, test } from "vitest";
import { requestSiteLocale } from "../src/lib/site-locale.js";
import { POST } from "../src/pages/language.js";

const origin = "https://shop.example.test";
function context(fields: Record<string, string>, callerOrigin = origin) {
	const writes: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
	const request = new Request(`${origin}/language`, {
		method: "POST",
		headers: { origin: callerOrigin },
		body: new URLSearchParams(fields),
	});
	return {
		writes,
		context: {
			request,
			url: new URL(request.url),
			cookies: {
				set: (name: string, value: string, options: Record<string, unknown>) =>
					writes.push({ name, value, options }),
			},
			redirect: (location: string, status: number) =>
				new Response(null, { status, headers: { location } }),
		} as unknown as APIContext,
	};
}

describe("POST /language", () => {
	test("persists a normalized choice and returns to the entire private URL", async () => {
		const path = "/orders/order-42?access=private%2Bkey%3D&p=3";
		const { context: ctx, writes } = context({ locale: "hr-HR", returnTo: path });
		const response = await POST(ctx);
		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe(path);
		expect(writes).toEqual([
			{
				name: "wscommerce_locale",
				value: "hr",
				options: {
					path: "/",
					httpOnly: true,
					secure: true,
					sameSite: "lax",
					maxAge: 31_536_000,
				},
			},
		]);
		expect(
			requestSiteLocale(
				new Request(`${origin}${path}`, { headers: { cookie: "wscommerce_locale=hr" } }),
			),
		).toBe("hr");
	});
	test("falls back to English for an invalid locale and to home for an unsafe return", async () => {
		const { context: ctx, writes } = context({ locale: "../../hr", returnTo: "//outside.test/" });
		const response = await POST(ctx);
		expect(response.headers.get("location")).toBe("/");
		expect(writes[0]?.value).toBe("en");
	});
	test("rejects a cross-origin request before reading the form or setting any cookie", async () => {
		const { context: ctx, writes } = context(
			{ locale: "hr", returnTo: "/cart" },
			"https://outside.test",
		);
		const response = await POST(ctx);
		expect(response.status).toBe(403);
		expect(ctx.request.bodyUsed).toBe(false);
		expect(writes).toEqual([]);
	});
	test("rejects an opaque Origin just like the commerce forms", async () => {
		const { context: ctx, writes } = context({ locale: "hr" }, "null");
		expect((await POST(ctx)).status).toBe(403);
		expect(writes).toEqual([]);
	});
});
