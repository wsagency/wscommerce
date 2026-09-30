/** Locale is a presentation preference, never a commerce or protocol value. */
export type AdminLocale = "en" | "hr";
export const ADMIN_LOCALE_COOKIE = "wscommerce_admin_locale";

export function normalizeAdminLocale(input: unknown): AdminLocale {
	if (typeof input !== "string" || input.length > 100) return "en";
	try {
		return new Intl.Locale(input.trim()).language === "hr" ? "hr" : "en";
	} catch {
		return "en";
	}
}

export function adminLocaleTag(input: unknown, kind: "money" | "date" = "money"): string {
	return normalizeAdminLocale(input) === "hr" ? "hr-HR" : kind === "date" ? "en-GB" : "en-US";
}

export function adminUnitWord(count: number, locale: unknown): string {
	if (normalizeAdminLocale(locale) === "en") return count === 1 ? "unit" : "units";
	return new Intl.PluralRules("hr").select(count) === "one" ? "komad" : "komada";
}

/** Display only; canonical quantity inputs and mutation values keep their original strings. */
export function formatAdminQuantity(quantity: number, locale: unknown = "en"): string {
	return normalizeAdminLocale(locale) === "hr"
		? new Intl.NumberFormat("hr-HR").format(quantity)
		: String(quantity);
}
