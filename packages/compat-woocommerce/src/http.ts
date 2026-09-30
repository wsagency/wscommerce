import type {
	GuardedOrderPatch,
	ListQuery,
	ListResult,
	WooHandlerOptions,
	WooPrincipal,
	WooScope,
	WooOrderStatus,
	ExternalEntityKind,
} from "./types.js";
import { invalid, unsupportedField, WooMutationError } from "./errors.js";
import { validateMetadata } from "./metadata.js";
import { createWooMapper } from "./mapping.js";
import { hashWooSecret } from "./security.js";
export const WOO_REST_BASE = "/wp-json/wc/v3";
const COMMON = [
	"page",
	"per_page",
	"order",
	"orderby",
	"after",
	"before",
	"modified_after",
	"modified_before",
	"search",
	"include",
	"exclude",
	"context",
];
const STATUSES: WooOrderStatus[] = [
	"pending",
	"processing",
	"on-hold",
	"completed",
	"cancelled",
	"refunded",
	"failed",
];
interface Route {
	resource: "orders" | "products" | "customers";
	id?: number;
	child?: "variations" | "notes" | "refunds";
	childId?: number;
}
function positive(value: string, label: string, max = Number.MAX_SAFE_INTEGER): number {
	if (!/^[1-9]\d*$/.test(value)) invalid(`${label} must be a positive integer.`);
	const n = Number(value);
	if (!Number.isSafeInteger(n) || n > max) invalid(`${label} is out of range.`);
	return n;
}
function routeFor(path: string): Route | null {
	const match =
		/^\/(orders|products|customers)(?:\/([1-9]\d*))?(?:\/(variations|notes|refunds)(?:\/([1-9]\d*))?)?$/.exec(
			path,
		);
	if (!match) return null;
	const resource = match[1] as Route["resource"],
		child = match[3] as Route["child"];
	if (
		child &&
		(!match[2] || (child === "variations" ? resource !== "products" : resource !== "orders"))
	)
		return null;
	return {
		resource,
		...(match[2] ? { id: positive(match[2], "ID") } : {}),
		...(child ? { child } : {}),
		...(match[4] ? { childId: positive(match[4], "ID") } : {}),
	};
}
function methods(route: Route): string[] {
	if (route.child === "notes" && !route.childId) return ["GET", "HEAD", "POST", "OPTIONS"];
	if (
		(route.resource === "orders" || route.resource === "products") &&
		route.id &&
		(!route.child || (route.child === "variations" && route.childId))
	)
		return ["GET", "HEAD", "PUT", "PATCH", "OPTIONS"];
	return ["GET", "HEAD", "OPTIONS"];
}
function response(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			...headers,
		},
	});
}
export function wooErrorResponse(error: WooMutationError): Response {
	return response(
		{ code: error.code, message: error.message, data: { status: error.status } },
		error.status,
		error.status === 401
			? { "WWW-Authenticate": 'Basic realm="WooCommerce accounting API", charset="UTF-8"' }
			: {},
	);
}
export function wooDiscovery(): Record<string, unknown> {
	const routes: Record<string, unknown> = {};
	const declared: Record<string, string[]> = {
		"/orders": ["GET"],
		"/orders/(?P<id>[\\d]+)": ["GET", "PUT", "PATCH"],
		"/orders/(?P<id>[\\d]+)/notes": ["GET", "POST"],
		"/orders/(?P<id>[\\d]+)/notes/(?P<note_id>[\\d]+)": ["GET"],
		"/orders/(?P<id>[\\d]+)/refunds": ["GET"],
		"/orders/(?P<id>[\\d]+)/refunds/(?P<refund_id>[\\d]+)": ["GET"],
		"/products": ["GET"],
		"/products/(?P<id>[\\d]+)": ["GET", "PUT", "PATCH"],
		"/products/(?P<id>[\\d]+)/variations": ["GET"],
		"/products/(?P<id>[\\d]+)/variations/(?P<variation_id>[\\d]+)": ["GET", "PUT", "PATCH"],
		"/customers": ["GET"],
		"/customers/(?P<id>[\\d]+)": ["GET"],
	};
	for (const [path, allowed] of Object.entries(declared))
		routes[`/wc/v3${path}`] = { namespace: "wc/v3", methods: allowed };
	return {
		namespaces: ["wc/v3"],
		routes,
		emdash_commerce: {
			profile: "accounting-v1",
			wordpress_runtime: false,
			legacy_api: false,
			store_api: false,
			writes: {
				orders: ["meta_data", "status: processing/completed/cancelled (native guarded)"],
				products: ["stock_quantity"],
				notes: ["note (private)"],
				idempotency_header: "Idempotency-Key",
			},
		},
	};
}
async function authenticate(request: Request, options: WooHandlerOptions): Promise<WooPrincipal> {
	try {
		const match = /^Basic ([A-Za-z0-9+/]+=*)$/i.exec(request.headers.get("Authorization") ?? "");
		if (!match) throw new Error();
		const decoded = atob(match[1]!),
			colon = decoded.indexOf(":");
		if (colon < 1 || decoded.indexOf(":", colon + 1) !== -1) throw new Error();
		const key = decoded.slice(0, colon),
			secret = decoded.slice(colon + 1);
		if (!key.startsWith("ck_") || !secret.startsWith("cs_")) throw new Error();
		const principal = await options.authenticate.authenticate(key, secret);
		if (principal) return principal;
	} catch {
		/* Never expose credential text or a provider error. */
	}
	throw new WooMutationError(
		"woocommerce_rest_authentication_error",
		"Valid consumer-key Basic authentication is required.",
		401,
	);
}
function scope(principal: WooPrincipal, value: WooScope): void {
	if (!principal.scopes.includes(value))
		throw new WooMutationError(
			"woocommerce_rest_cannot_view",
			"The consumer key lacks the required resource scope.",
			403,
		);
}
async function nativeId(
	options: WooHandlerOptions,
	kind: ExternalEntityKind,
	id: number,
): Promise<string> {
	const value = await options.ids.lookup(kind, id);
	if (value === null)
		throw new WooMutationError("woocommerce_rest_not_found", "Resource not found.", 404);
	return value;
}
function queryFor(url: URL, route: Route): ListQuery {
	const extra = route.child
		? []
		: route.resource === "orders"
			? ["status", "customer"]
			: route.resource === "products"
				? ["sku", "status", "type", "stock_status"]
				: ["email"];
	const allowed = new Set([...COMMON, ...extra]),
		params = url.searchParams;
	for (const key of params.keys())
		if (!allowed.has(key) || params.getAll(key).length !== 1)
			invalid(`Unsupported or repeated query parameter '${key}'.`);
	if (params.has("context") && !["view", "edit"].includes(params.get("context")!))
		invalid("Unsupported context.");
	const order = params.get("order") ?? "desc",
		orderBy = params.get("orderby") ?? "date";
	if (order !== "asc" && order !== "desc") invalid("order must be asc or desc.");
	if (!["date", "modified", "id"].includes(orderBy)) invalid("Unsupported orderby.");
	const query: ListQuery = {
		page: positive(params.get("page") ?? "1", "page", 1000000),
		perPage: positive(params.get("per_page") ?? "10", "per_page", 100),
		order,
		orderBy: orderBy as ListQuery["orderBy"],
	};
	for (const [name, key] of [
		["after", "after"],
		["before", "before"],
		["modified_after", "modifiedAfter"],
		["modified_before", "modifiedBefore"],
	] as const) {
		const value = params.get(name);
		if (value !== null) {
			const utc = value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
			if (
				!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/.test(value) ||
				Number.isNaN(new Date(utc).valueOf())
			)
				invalid(`Invalid ${name}.`);
			query[key] = utc;
		}
	}
	for (const name of ["include", "exclude"] as const) {
		const value = params.get(name);
		if (value !== null) {
			if (value.length > 2000) invalid("Too many IDs.");
			query[name] = value.split(",").map((part) => positive(part, name));
		}
	}
	const search = params.get("search");
	if (search !== null) {
		if (search.length > 256) invalid("search is too long.");
		query.search = search;
	}
	if (route.resource === "orders" && !route.child) {
		const status = params.get("status");
		if (status !== null && status !== "any") {
			const values = status.split(",");
			if (values.some((value) => !STATUSES.includes(value as WooOrderStatus)))
				invalid("Unsupported order status.");
			query.statuses = values as WooOrderStatus[];
		}
		const customer = params.get("customer");
		if (customer !== null) query.customerId = String(positive(customer, "customer"));
	}
	if (route.resource === "products" && !route.child) {
		const sku = params.get("sku");
		if (sku !== null) {
			if (!sku || sku.length > 256) invalid("Invalid sku.");
			query.sku = sku;
		}
		const status = params.get("status");
		if (status !== null && status !== "any") {
			if (!["publish", "draft", "private"].includes(status)) invalid("Unsupported product status.");
			query.productStatus = status as ListQuery["productStatus"];
		}
		const type = params.get("type");
		if (type !== null) {
			if (!["simple", "variable"].includes(type)) invalid("Unsupported product type.");
			query.productType = type as ListQuery["productType"];
		}
		const stock = params.get("stock_status");
		if (stock !== null) {
			if (!["instock", "outofstock"].includes(stock)) invalid("Unsupported stock status.");
			query.stockStatus = stock as ListQuery["stockStatus"];
		}
	}
	const email = params.get("email");
	if (email !== null) {
		if (email.length > 254 || !email.includes("@")) invalid("Invalid email.");
		query.email = email;
	}
	return query;
}
function paginationHeaders<T>(
	url: URL,
	query: ListQuery,
	page: ListResult<T>,
): Record<string, string> {
	if (!Number.isSafeInteger(page.total) || page.total < 0 || page.items.length > query.perPage)
		throw new WooMutationError(
			"woocommerce_rest_invalid_snapshot",
			"The native page is inconsistent.",
			503,
		);
	const pages = Math.ceil(page.total / query.perPage),
		headers: Record<string, string> = {
			"X-WP-Total": String(page.total),
			"X-WP-TotalPages": String(pages),
		},
		links: string[] = [];
	const link = (targetPage: number, rel: string) => {
		const next = new URL(url);
		next.username = "";
		next.password = "";
		next.searchParams.set("page", String(targetPage));
		links.push(`<${next.toString()}>; rel="${rel}"`);
	};
	if (query.page > 1 && pages > 0) link(Math.min(query.page - 1, pages), "prev");
	if (query.page < pages) link(query.page + 1, "next");
	if (links.length) headers.Link = links.join(", ");
	return headers;
}
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
	const contentType = request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
	if (contentType !== "application/json")
		throw new WooMutationError(
			"woocommerce_rest_invalid_json",
			"Content-Type application/json is required.",
			415,
		);
	if (Number(request.headers.get("Content-Length") ?? 0) > 262144)
		invalid("Request body is too large.");
	const text = await request.text();
	if (new TextEncoder().encode(text).length > 262144) invalid("Request body is too large.");
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		throw new WooMutationError("woocommerce_rest_invalid_json", "Request body must be JSON.", 400);
	}
	if (!body || typeof body !== "object" || Array.isArray(body))
		invalid("Request body must be an object.");
	return body as Record<string, unknown>;
}
function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	const object = value as Record<string, unknown>;
	return `{${Object.keys(object)
		.toSorted()
		.map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
		.join(",")}}`;
}
async function mutationKey(
	request: Request,
	principal: WooPrincipal,
	body: Record<string, unknown>,
	route: Route,
): Promise<string> {
	const value = request.headers.get("Idempotency-Key");
	if (value !== null) {
		if (!value || value.length > 200 || !/^[\x21-\x7e]+$/.test(value))
			invalid("Invalid Idempotency-Key header.");
		return `woo:${principal.id}:${value}`;
	}
	const fields = Object.keys(body),
		metadataOnly =
			route.resource === "orders" &&
			!route.child &&
			fields.length === 1 &&
			fields[0] === "meta_data";
	const stockOnly =
		route.resource === "products" && fields.length === 1 && fields[0] === "stock_quantity";
	if (!["PUT", "PATCH"].includes(request.method) || (!metadataOnly && !stockOnly))
		invalid("An Idempotency-Key header is required for notes and state transitions.");
	const url = new URL(request.url);
	url.searchParams.sort();
	const fingerprint = await hashWooSecret(
		canonicalJson({
			principal: principal.id,
			url: url.origin + url.pathname.replace(/\/$/, "") + url.search,
			method: request.method,
			body,
		}),
	);
	return `woo:${principal.id}:auto:${fingerprint}`;
}
function orderPatch(body: Record<string, unknown>): GuardedOrderPatch {
	for (const key of Object.keys(body))
		if (!["meta_data", "status"].includes(key)) unsupportedField(key);
	if (Object.keys(body).length === 0) invalid("At least one supported field is required.");
	const patch: GuardedOrderPatch = {};
	if (Object.hasOwn(body, "meta_data")) patch.metadata = validateMetadata(body.meta_data);
	if (Object.hasOwn(body, "status")) {
		if (
			typeof body.status !== "string" ||
			!["processing", "completed", "cancelled"].includes(body.status)
		)
			unsupportedField("status");
		patch.status = body.status as GuardedOrderPatch["status"];
	}
	return patch;
}
export function createWooCommerceHandler(
	options: WooHandlerOptions,
): (request: Request) => Promise<Response> {
	const mapper = createWooMapper(options.ids, options.currencyDecimals);
	return async (request) => {
		try {
			const url = new URL(request.url),
				path = url.pathname.replace(/\/$/, "");
			const local =
				options.allowInsecureLocalhost &&
				["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
			if (url.protocol !== "https:" && !local)
				throw new WooMutationError("woocommerce_rest_https_required", "HTTPS is required.", 403);
			if (
				url.username ||
				url.password ||
				url.searchParams.has("consumer_key") ||
				url.searchParams.has("consumer_secret")
			)
				throw new WooMutationError(
					"woocommerce_rest_authentication_error",
					"Credentials must use the Authorization header.",
					401,
				);
			if (path === "/wp-json" || path === WOO_REST_BASE) {
				if (!["GET", "HEAD", "OPTIONS"].includes(request.method))
					return response(
						{ code: "woocommerce_rest_method_not_allowed", data: { status: 405 } },
						405,
						{ Allow: "GET, HEAD, OPTIONS" },
					);
				const found = response(wooDiscovery());
				return request.method === "HEAD"
					? new Response(null, { status: found.status, headers: found.headers })
					: found;
			}
			const route = path.startsWith(`${WOO_REST_BASE}/`)
				? routeFor(path.slice(WOO_REST_BASE.length))
				: null;
			if (!route)
				throw new WooMutationError(
					"rest_no_route",
					"No route supports this URL in the accounting profile.",
					404,
				);
			const allowed = methods(route);
			if (!allowed.includes(request.method))
				return response(
					{
						code: "woocommerce_rest_method_not_allowed",
						message: "Unsupported method in the accounting profile.",
						data: { status: 405 },
					},
					405,
					{ Allow: allowed.join(", ") },
				);
			if (request.method === "OPTIONS")
				return response({ namespace: "wc/v3", methods: allowed }, 200, {
					Allow: allowed.join(", "),
				});
			const principal = await authenticate(request, options),
				read = request.method === "GET" || request.method === "HEAD";
			scope(principal, `${route.resource}:${read ? "read" : "write"}` as WooScope);
			const query = queryFor(url, route);
			if (query.customerId)
				query.customerId = await nativeId(options, "customer", Number(query.customerId));
			const kind: ExternalEntityKind =
				route.resource === "orders"
					? "order"
					: route.resource === "products"
						? "product"
						: "customer";
			const parent = route.id ? await nativeId(options, kind, route.id) : undefined,
				childKind =
					route.child === "variations" ? "variation" : route.child === "notes" ? "note" : "refund";
			const child = route.childId ? await nativeId(options, childKind, route.childId) : undefined;
			if (!read) {
				const body = await bodyOf(request),
					context = {
						principal,
						idempotencyKey: await mutationKey(request, principal, body, route),
					};
				if (route.resource === "orders" && !route.child && parent) {
					const patch = orderPatch(body);
					if (patch.status) {
						const current = await options.backend.getOrder(parent);
						if (!current)
							throw new WooMutationError("woocommerce_rest_not_found", "Resource not found.", 404);
						if (
							patch.status !== "cancelled" &&
							["pending", "failed", "expired", "cancelled", "refunded"].includes(current.state)
						)
							throw new WooMutationError(
								"woocommerce_rest_invalid_transition",
								"A REST status cannot manufacture payment evidence.",
								409,
							);
					}
					return response(
						await mapper.order(await options.backend.applyOrderPatch(parent, patch, context)),
					);
				}
				if (route.resource === "products" && parent && (!route.child || child)) {
					for (const key of Object.keys(body)) if (key !== "stock_quantity") unsupportedField(key);
					if (!Number.isSafeInteger(body.stock_quantity) || Number(body.stock_quantity) < 0)
						invalid("stock_quantity must be a nonnegative safe integer.");
					return response(
						await mapper.product(
							await options.backend.applyStockUpdate(
								child ?? parent,
								{ stockQuantity: body.stock_quantity as number },
								context,
							),
						),
					);
				}
				if (route.child === "notes" && parent && !child) {
					for (const key of Object.keys(body))
						if (!["note", "customer_note"].includes(key)) unsupportedField(key);
					if (Object.hasOwn(body, "customer_note") && body.customer_note !== false)
						unsupportedField("customer_note");
					if (typeof body.note !== "string" || !body.note.trim() || body.note.length > 5000)
						invalid("A bounded nonempty note is required.");
					return response(
						await mapper.note(await options.backend.appendNote(parent, body.note.trim(), context)),
						201,
					);
				}
				throw new WooMutationError(
					"woocommerce_rest_method_not_allowed",
					"Unsupported mutation.",
					405,
				);
			}
			let value: unknown,
				headers: Record<string, string> = {};
			const renderList = async <T>(page: ListResult<T>, map: (item: T) => Promise<unknown>) => {
				headers = paginationHeaders(url, query, page);
				return Promise.all(page.items.map(map));
			};
			if (route.child === "variations" && parent)
				value = child
					? await options.backend
							.getVariation(parent, child)
							.then((item) =>
								item && item.parentId === parent && item.nativeId === child
									? mapper.product(item)
									: null,
							)
					: await renderList(await options.backend.listVariations(parent, query), async (item) => {
							if (item.parentId !== parent)
								throw new WooMutationError(
									"woocommerce_rest_not_found",
									"Resource not found.",
									404,
								);
							return mapper.product(item);
						});
			else if (route.child === "notes" && parent)
				value = child
					? await options.backend
							.getNote(parent, child)
							.then((item) =>
								item && item.orderId === parent && item.nativeId === child
									? mapper.note(item)
									: null,
							)
					: await renderList(await options.backend.listNotes(parent, query), async (item) => {
							if (item.orderId !== parent)
								throw new WooMutationError(
									"woocommerce_rest_not_found",
									"Resource not found.",
									404,
								);
							return mapper.note(item);
						});
			else if (route.child === "refunds" && parent)
				value = child
					? await options.backend
							.getRefund(parent, child)
							.then((item) =>
								item && item.orderId === parent && item.nativeId === child
									? mapper.refund(item)
									: null,
							)
					: await renderList(await options.backend.listRefunds(parent, query), async (item) => {
							if (item.orderId !== parent)
								throw new WooMutationError(
									"woocommerce_rest_not_found",
									"Resource not found.",
									404,
								);
							return mapper.refund(item);
						});
			else if (route.resource === "orders")
				value = parent
					? await options.backend
							.getOrder(parent)
							.then((item) => (item ? mapper.order(item) : null))
					: await renderList(await options.backend.listOrders(query), mapper.order);
			else if (route.resource === "products")
				value = parent
					? await options.backend
							.getProduct(parent)
							.then((item) => (item ? mapper.product(item) : null))
					: await renderList(await options.backend.listProducts(query), mapper.product);
			else
				value = parent
					? await options.backend
							.getCustomer(parent)
							.then((item) => (item ? mapper.customer(item) : null))
					: await renderList(await options.backend.listCustomers(query), mapper.customer);
			if (value === null)
				throw new WooMutationError("woocommerce_rest_not_found", "Resource not found.", 404);
			const result = response(value, 200, headers);
			return request.method === "HEAD"
				? new Response(null, { status: result.status, headers: result.headers })
				: result;
		} catch (error) {
			return wooErrorResponse(
				error instanceof WooMutationError
					? error
					: new WooMutationError(
							"woocommerce_rest_internal_error",
							"The native backend is unavailable; retry with the same Idempotency-Key.",
							503,
						),
			);
		}
	};
}
