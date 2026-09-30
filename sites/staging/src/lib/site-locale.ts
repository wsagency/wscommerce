import { withoutProviderReturnFields } from "./order-navigation.js";

/** The reference shop's presentation preference; never part of commerce state. */
export type SiteLocale = "en" | "hr";
export const SITE_LOCALE: SiteLocale = "en";
export const LOCALE_COOKIE_NAME = "wscommerce_locale";

// oxlint-disable-next-line no-control-regex -- URL controls must never reach a redirect
const UNSAFE_URL_CHARACTERS = /[\\\u0000-\u001f\u007f]/;

/** Accept supported BCP-47 variants, without accepting malformed language tags. */
export function normalizeSiteLocale(value: unknown): SiteLocale | null {
	if (typeof value !== "string" || value.length > 100) return null;
	try {
		const language = new Intl.Locale(value.trim()).language;
		return language === "en" || language === "hr" ? language : null;
	} catch {
		return null;
	}
}

/** Explicit cookie choice wins; browser negotiation only helps the first visit. */
export function requestSiteLocale(request: Pick<Request, "headers">): SiteLocale {
	for (const pair of (request.headers.get("cookie") ?? "").split(";")) {
		const separator = pair.indexOf("=");
		if (pair.slice(0, separator).trim() !== LOCALE_COOKIE_NAME) continue;
		try {
			const locale = normalizeSiteLocale(decodeURIComponent(pair.slice(separator + 1).trim()));
			if (locale !== null) return locale;
		} catch {
			// A broken preference cookie must never prevent checkout from rendering.
		}
	}
	const preferred = (request.headers.get("accept-language") ?? "")
		.split(",")
		.map((entry, index) => {
			const [language, ...parameters] = entry.trim().split(";");
			const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
			const rawQuality = qualityParameter?.trim().slice(2);
			const quality =
				rawQuality === undefined
					? 1
					: /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(rawQuality)
						? Number(rawQuality)
						: 0;
			return { locale: normalizeSiteLocale(language), quality, index };
		})
		.filter((preference) => preference.locale !== null && preference.quality > 0)
		.toSorted((left, right) => right.quality - left.quality || left.index - right.index);
	return preferred[0]?.locale ?? SITE_LOCALE;
}

export function siteLocale(context: { request: Pick<Request, "headers"> }): SiteLocale {
	return requestSiteLocale(context.request);
}

/** Local absolute paths only. Query bytes may carry private order capabilities. */
export function safeLanguageReturn(value: unknown): string {
	if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
	if (/\s/.test(value) || UNSAFE_URL_CHARACTERS.test(value) || /%(?![0-9a-f]{2})/i.test(value))
		return "/";
	try {
		const parsed = new URL(value, "https://storefront.invalid");
		const path = decodeURIComponent(parsed.pathname);
		if (
			parsed.origin !== "https://storefront.invalid" ||
			path.startsWith("//") ||
			UNSAFE_URL_CHARACTERS.test(path)
		)
			return "/";
		return withoutProviderReturnFields(parsed.pathname + parsed.search + parsed.hash);
	} catch {
		return "/";
	}
}

/** Rendered language varies by these request headers, including the first visit. */
export function varyBySiteLocale(headers: Headers): void {
	const existing = (headers.get("Vary") ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	if (existing.includes("*")) return;
	for (const name of ["Cookie", "Accept-Language"]) {
		if (!existing.some((value) => value.toLowerCase() === name.toLowerCase())) existing.push(name);
	}
	headers.set("Vary", existing.join(", "));
}
