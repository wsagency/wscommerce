import { ADMIN_LOCALE_COOKIE, normalizeAdminLocale } from "@otta-sh/admin-presentation";
import type { AdminLocale } from "@otta-sh/admin-presentation";

/** Non-sensitive presentation metadata that survives EmDash's authentication-header filter. */
export const ADMIN_LOCALE_HEADER = "x-wscommerce-admin-locale";

export function adminLocaleFromCookie(cookie: string | null): AdminLocale {
	const preference = cookie
		?.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${ADMIN_LOCALE_COOKIE}=`));
	if (preference !== undefined) {
		try {
			return normalizeAdminLocale(
				decodeURIComponent(preference.slice(ADMIN_LOCALE_COOKIE.length + 1)),
			);
		} catch {
			return "en";
		}
	}
	return "en";
}

/** Run in trusted host middleware before EmDash sanitizes plugin request metadata. */
export function forwardAdminLocale(request: Request, adminRoutePath: string): Request {
	if (request.method !== "POST" || new URL(request.url).pathname !== adminRoutePath) return request;
	const headers = new Headers(request.headers);
	headers.set(ADMIN_LOCALE_HEADER, adminLocaleFromCookie(headers.get("cookie")));
	// Preserve URL, authentication and body bytes; the host still strips credentials
	// before invoking the plugin. Only the normalized display preference crosses it.
	return new Request(request.clone(), { headers });
}
