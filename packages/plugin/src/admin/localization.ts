import { ADMIN_LOCALE_COOKIE, normalizeAdminLocale } from "@otta-sh/admin-presentation";
import type { AdminLocale } from "@otta-sh/admin-presentation";
import type { SandboxedRouteContext } from "../types.js";
import { CROATIAN_PLUGIN_MESSAGES } from "./messages.js";
import { CROATIAN_PLUGIN_ACTION_MESSAGES } from "./action-messages.js";

export type PluginInterpolation = Readonly<Record<string, string | number>>;
export type PluginTranslate = ((message: string, values?: PluginInterpolation) => string) & {
	readonly locale: AdminLocale;
};

/** Translate authored presentation copy only; callers retain all record and command values. */
export function pluginTranslator(locale: AdminLocale): PluginTranslate {
	const translate = (message: string, values: PluginInterpolation = {}): string => {
		const entry =
			locale === "hr"
				? Object.hasOwn(CROATIAN_PLUGIN_MESSAGES, message)
					? CROATIAN_PLUGIN_MESSAGES[message]
					: Object.hasOwn(CROATIAN_PLUGIN_ACTION_MESSAGES, message)
						? CROATIAN_PLUGIN_ACTION_MESSAGES[message]
						: undefined
				: undefined;
		let template = message;
		if (typeof entry === "string") template = entry;
		else if (entry !== undefined) {
			const category = new Intl.PluralRules("hr").select(Number(values.count));
			template = category === "one" ? entry.one : category === "few" ? entry.few : entry.other;
		}
		return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (placeholder, name: string) =>
			Object.hasOwn(values, name) ? String(values[name]) : placeholder,
		);
	};
	return Object.assign(translate, { locale });
}

export const englishTranslate = pluginTranslator("en");

/** Resolve the request's explicit preference before its persisted cookie. Never mutate shared state. */
export function requestTranslator(routeCtx: SandboxedRouteContext<unknown>): PluginTranslate {
	const input = routeCtx.input;
	if (typeof input === "object" && input !== null && Object.hasOwn(input, "locale")) {
		return pluginTranslator(normalizeAdminLocale((input as { locale?: unknown }).locale));
	}
	const cookie = Object.entries(routeCtx.request.headers).find(
		([name]) => name.toLowerCase() === "cookie",
	)?.[1];
	const preference = cookie
		?.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${ADMIN_LOCALE_COOKIE}=`));
	if (preference !== undefined) {
		try {
			return pluginTranslator(
				normalizeAdminLocale(decodeURIComponent(preference.slice(ADMIN_LOCALE_COOKIE.length + 1))),
			);
		} catch {
			return englishTranslate;
		}
	}
	return englishTranslate;
}

export function moneyLocale(t: PluginTranslate): string {
	return t.locale === "hr" ? "hr-HR" : "en-US";
}
