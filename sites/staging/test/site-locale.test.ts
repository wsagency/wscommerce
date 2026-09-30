import { describe, expect, test } from "vitest";
import { countryOptions } from "../src/lib/countries.js";
import {
	normalizeSiteLocale,
	requestSiteLocale,
	safeLanguageReturn,
	varyBySiteLocale,
} from "../src/lib/site-locale.js";

describe("request language", () => {
	test.each([
		["hr-HR", "hr"],
		["EN-us", "en"],
		[" hr ", "hr"],
		["sr-HR", null],
		["hr_bad", null],
		["%", null],
		[null, null],
	])("normalizes supported BCP-47 input %s", (input, expected) => {
		expect(normalizeSiteLocale(input)).toBe(expected);
	});
	test("defaults to English and ignores malformed or unsupported preferences", () => {
		expect(requestSiteLocale(new Request("https://shop.test/"))).toBe("en");
		expect(
			requestSiteLocale(
				new Request("https://shop.test/", {
					headers: {
						cookie: "wscommerce_locale=%ZZ",
						"accept-language": "fr-FR,hr-bad;q=0.8",
					},
				}),
			),
		).toBe("en");
	});
	test("uses a persisted choice ahead of browser preferences", () => {
		expect(
			requestSiteLocale(
				new Request("https://shop.test/", {
					headers: {
						cookie: "cart=cart-id; wscommerce_locale=en-US",
						"accept-language": "hr-HR,hr;q=0.9",
					},
				}),
			),
		).toBe("en");
	});
	test("negotiates the most preferred supported browser language", () => {
		expect(
			requestSiteLocale(
				new Request("https://shop.test/", {
					headers: {
						"accept-language": "fr-FR, en;q=0.4, hr-HR;q=0.8",
					},
				}),
			),
		).toBe("hr");
		expect(
			requestSiteLocale(
				new Request("https://shop.test/", {
					headers: {
						"accept-language": "hr;q=0,en;q=0.5",
					},
				}),
			),
		).toBe("en");
	});
	test("keeps country option identifiers stable when labels change", () => {
		expect(countryOptions("en").find((o) => o.code === "DE")).toEqual({
			code: "DE",
			label: "Germany",
		});
		expect(countryOptions("hr").find((o) => o.code === "DE")).toEqual({
			code: "DE",
			label: "Njemačka",
		});
	});
	test("merges locale cache variation without dropping another header or duplicating names", () => {
		const headers = new Headers({ Vary: "Accept-Encoding, cookie" });
		varyBySiteLocale(headers);
		varyBySiteLocale(headers);
		expect(headers.get("Vary")).toBe("Accept-Encoding, cookie, Accept-Language");
		const wildcard = new Headers({ Vary: "*" });
		varyBySiteLocale(wildcard);
		expect(wildcard.get("Vary")).toBe("*");
	});
});

describe("language return navigation", () => {
	test("preserves private order capabilities, selection, encodings and fragments", () => {
		const target = "/orders/order-42?access=private%2Bkey%3D&sku=ABC&coupon=SAVE%20ME&p=2#receipt";
		expect(safeLanguageReturn(target)).toBe(target);
	});
	test.each([
		"https://outside.test/",
		"https://shop.test/cart",
		"//outside.test/",
		"/\\outside.test/",
		"/%2Foutside.test/",
		"/%5Coutside.test/",
		"/.//outside.test/",
		"/cart\r\nLocation: https://outside.test/",
		"javascript:alert(1)",
		"/bad%zz",
		"cart",
		"",
		null,
	])("rejects external or malformed target %s", (input) => {
		expect(safeLanguageReturn(input)).toBe("/");
	});
});
