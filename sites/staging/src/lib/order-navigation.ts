/** Provider redirects are transport details, never order truth or capabilities. */
const PROVIDER_RETURN_FIELDS = new Set([
	"payment_intent",
	"payment_intent_client_secret",
	"redirect_status",
]);

function fieldName(field: string): string {
	try {
		return decodeURIComponent((field.split("=", 1)[0] ?? "").replaceAll("+", " "));
	} catch {
		return "";
	}
}

/** Preserve the bytes of every other field, including encoded bearer tokens. */
export function withoutProviderReturnFields(path: string): string {
	const hashIndex = path.indexOf("#");
	const fragment = hashIndex === -1 ? "" : path.slice(hashIndex);
	const target = hashIndex === -1 ? path : path.slice(0, hashIndex);
	const queryIndex = target.indexOf("?");
	if (queryIndex === -1) return path;
	const pathname = target.slice(0, queryIndex);
	const fields = target
		.slice(queryIndex + 1)
		.split("&")
		.filter((field) => !PROVIDER_RETURN_FIELDS.has(fieldName(field)));
	return pathname + (fields.some(Boolean) ? "?" + fields.join("&") : "") + fragment;
}

export function orderPollPath(url: URL, attempt: number): string {
	const path = withoutProviderReturnFields(url.pathname + url.search);
	const [pathname, query = ""] = path.split("?", 2);
	const fields = query.split("&").filter((field) => field !== "" && fieldName(field) !== "p");
	fields.push(`p=${attempt}`);
	return pathname + "?" + fields.join("&");
}
