import type { APIRoute } from "astro";
import { rejectCrossOrigin } from "../lib/origin-guard.js";
import {
	LOCALE_COOKIE_NAME,
	normalizeSiteLocale,
	safeLanguageReturn,
	SITE_LOCALE,
} from "../lib/site-locale.js";

/** Language is a presentation cookie, set by the same guarded POST as our forms. */
export const POST: APIRoute = async (context) => {
	const forbidden = rejectCrossOrigin(context);
	if (forbidden !== null) return forbidden;
	let form: FormData;
	try {
		form = await context.request.formData();
	} catch {
		return new Response("Invalid language form", { status: 400 });
	}
	context.cookies.set(LOCALE_COOKIE_NAME, normalizeSiteLocale(form.get("locale")) ?? SITE_LOCALE, {
		path: "/",
		httpOnly: true,
		secure: context.url.protocol === "https:",
		sameSite: "lax",
		maxAge: 31_536_000,
	});
	const response = context.redirect(safeLanguageReturn(form.get("returnTo")), 303);
	response.headers.set("Cache-Control", "private, no-store");
	return response;
};
