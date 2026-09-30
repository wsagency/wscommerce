/** @vitest-environment happy-dom */
import * as React from "react";
import { Storage } from "happy-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fire, mount, type Mounted } from "./dom.js";

const apiFetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
vi.mock("emdash/plugin-utils", async (importOriginal) => {
	const actual = await importOriginal<typeof import("emdash/plugin-utils")>();
	return { ...actual, apiFetch };
});
const { OrdersScreen } = await import("../src/orders/orders-screen.js");
const { ProductsScreen } = await import("../src/products/products-screen.js");
const { LeaveConfirm } = await import("../src/products/product-detail.js");
const { AdminLanguageChoice, AdminLocaleProvider } = await import("../src/locale.js");
type DetailPayload = import("../src/console-api.js").DetailPayload;
type ListPayload = import("../src/console-api.js").ListPayload;
type ProductDetailPayload = import("../src/console-api.js").ProductDetailPayload;
type ProductsListPayload = import("../src/console-api.js").ProductsListPayload;

const vocabulary = {
	statuses: ["paid"],
	statusAny: "any",
	periods: [{ key: "last30", label: "Last 30 days" }],
	cancellationReasons: [{ value: "fraud", label: "Fraud" }],
	oneClickCancellationReasons: [{ value: "fraud", label: "Fraud" }],
	reconciliationOutcomes: [{ value: "resolved", label: "Resolved" }],
	pageLimit: 25,
};
const row = {
	id: "7e4ce728",
	state: "paid",
	currency: "EUR",
	buyerRef: "Fraud",
	customerId: null,
	paymentMethod: "card",
	createdAt: "2026-01-01T00:00:00.000Z",
	totalCents: 12345,
	reconciliationFlag: null,
};
const list: ListPayload = { ok: true, orders: [row], nextCursor: null, total: 1, vocabulary };
const detail: DetailPayload = {
	ok: true,
	order: {
		...row,
		reconciliationResolution: null,
		fulfillment: null,
		cancellation: null,
		shippingAddress: null,
		totals: {
			currency: "EUR",
			subtotalCents: 12345,
			discountCents: 0,
			shippingCents: 0,
			taxCents: 0,
			totalCents: 12345,
			appliedCouponCode: null,
		},
		lines: [
			{
				sku: "Orders",
				title: "Orders",
				unitPriceCents: 12345,
				currency: "EUR",
				quantity: 1,
				fulfillmentKind: "physical",
			},
		],
	},
	transitions: ["shipped"],
	customer: null,
	timeline: {
		entries: [{ kind: "note", at: row.createdAt, author: "Fraud", body: "Cancel this order?" }],
	},
	refunds: {
		refunds: [],
		currency: "EUR",
		capturedTotalCents: 12345,
		refundedTotalCents: 0,
		ceilingCents: 12345,
		remainingCents: 12345,
		paymentMethod: "card",
		refundable: true,
	},
	notes: [{ author: "Fraud", body: "Cancel this order?", createdAt: row.createdAt }],
	vocabulary,
};
const productDetail: ProductDetailPayload = {
	ok: true,
	product: {
		productId: "prod-1",
		title: "Orders",
		sku: "Fraud",
		priceCents: 12345,
		currency: "EUR",
		taxClass: "paid",
		compareAtCents: null,
		compareAtCurrency: null,
		unitCostCents: null,
		unitCostCurrency: null,
		inventoryPolicy: "deny",
		weightGrams: 420,
		lengthMm: null,
		widthMm: null,
		heightMm: null,
		productKind: "physical",
		active: true,
		deletedAt: null,
		onHand: 12,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-02T00:00:00.000Z",
	},
	taxClasses: [{ id: "paid", name: "Orders" }],
	threshold: 3,
	vocabulary: {
		statuses: [{ value: "true", label: "Active" }],
		kinds: [{ value: "physical", label: "Physical" }],
		any: "any",
		pageLimit: 25,
	},
};
const productList: ProductsListPayload = {
	ok: true,
	products: [productDetail.product],
	nextCursor: null,
	total: 1,
	stock: { threshold: 3, unreadable: false, filterUnavailable: false },
	vocabulary: productDetail.vocabulary,
};
let view: Mounted | undefined;
const requests: Record<string, unknown>[] = [];
let actionNotice: { title: string; description: string; variant: string } | null = null;

beforeEach(() => {
	// Node 26 exposes an unavailable native localStorage; use the DOM environment storage.
	vi.stubGlobal("localStorage", new Storage());
	vi.stubGlobal("sessionStorage", new Storage());
	window.localStorage.clear();
	document.cookie = "wscommerce_admin_locale=; Max-Age=0; Path=/";
	window.history.replaceState(null, "", "/_emdash/admin/plugins/otta-console/orders");
	requests.length = 0;
	actionNotice = null;
	apiFetch.mockReset();
	apiFetch.mockImplementation(async (_input, init) => {
		const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
		requests.push(body);
		return Response.json({
			data:
				body.type === "otta_console_act"
					? { ok: true, notice: actionNotice }
					: body.resource === "orders.detail"
						? detail
						: body.resource === "products.detail"
							? productDetail
							: body.resource === "products.list"
								? productList
								: list,
		});
	});
});
afterEach(async () => {
	await view?.unmount();
	view = undefined;
	window.localStorage.clear();
	document.cookie = "wscommerce_admin_locale=; Max-Age=0; Path=/";
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function choose(locale: string): Promise<void> {
	const select = view?.container.querySelector<HTMLSelectElement>('[data-testid="admin-language"]');
	expect(select, "commerce pages offer a language choice").not.toBeNull();
	await React.act(async () => {
		if (!select) throw new Error("language choice missing");
		select.value = locale;
		select.dispatchEvent(new Event("change", { bubbles: true }));
	});
}

test("switches Orders to Croatian and keeps record data and commerce query untouched", async () => {
	window.history.replaceState(null, "", "?search=Orders&cursor=private-cursor&tab=money");
	view = await mount(<OrdersScreen />);
	await choose("hr");
	expect(view.container.querySelector("h1")?.textContent).toBe("Narudžbe");
	expect(view.container.textContent).toContain("Fraud");
	expect(view.container.textContent).toContain("plaćeno");
	expect(view.container.textContent).toContain("123,45 €");
	expect(window.location.search).toBe("?search=Orders&cursor=private-cursor&tab=money");
	expect(window.localStorage.getItem("wscommerce_admin_locale")).toBe("hr");
	expect(document.cookie).toContain("wscommerce_admin_locale=hr");
	await view.unmount();
	view = await mount(<OrdersScreen />);
	expect(view.container.querySelector("h1")?.textContent).toBe("Narudžbe");
	await choose("en");
	expect(view.container.querySelector("h1")?.textContent).toBe("Orders");
});

test("Croatian cancellation labels send original enum and action values", async () => {
	window.history.replaceState(null, "", "?order=7e4ce728&tab=fulfilment");
	view = await mount(<OrdersScreen />);
	await choose("hr");
	const cancel = view.container.querySelector<HTMLButtonElement>('[data-testid="cancel-fraud"]');
	expect(cancel?.textContent).toBe("Prijevara");
	if (!cancel) throw new Error("cancel reason missing");
	await fire(cancel, "click");
	const dialog = view.container.querySelector<HTMLDialogElement>("dialog[open]");
	expect(dialog?.textContent).toContain("Otkazati ovu narudžbu?");
	expect(dialog?.textContent).toContain("Prijevara");
	await choose("en");
	expect(dialog?.textContent).toContain("Cancel this order?");
	expect(dialog?.textContent).toContain("Fraud");
	const confirm = dialog?.querySelector<HTMLButtonElement>('[data-testid="otta-confirm-yes"]');
	if (!confirm) throw new Error("confirm control missing");
	await fire(confirm, "click");
	expect(requests.filter((r) => r.type === "otta_console_act")).toEqual([
		{
			type: "otta_console_act",
			action_id: "orders:cancel-fraud",
			value: { orderId: "7e4ce728", reason: "fraud", state: "paid" },
		},
	]);
});

test("an invalid saved locale falls back to English", async () => {
	window.localStorage.setItem("wscommerce_admin_locale", "../../hr");
	view = await mount(<OrdersScreen />);
	const select = view.container.querySelector<HTMLSelectElement>('[data-testid="admin-language"]');
	expect(select?.value).toBe("en");
	expect(view.container.querySelector("h1")?.textContent).toBe("Orders");
});

test("Croatian refund validation keeps the amount draft and refuses the mutation", async () => {
	window.history.replaceState(null, "", "?order=7e4ce728&tab=money");
	view = await mount(<OrdersScreen />);
	await choose("hr");
	const submit = view.container.querySelector<HTMLButtonElement>(
		'[data-testid="refund-partial-submit"]',
	);
	if (!submit) throw new Error("partial refund control missing");
	await fire(submit, "click");
	expect(
		view.container.querySelector('[data-testid="refund-amount-error"]')?.textContent,
	).toContain("Unesite valjan iznos povrata veći od nule");
	expect(
		view.container.querySelector<HTMLInputElement>('[data-testid="refund-amount"]')?.value,
	).toBe("");
	expect(requests.filter((r) => r.type === "otta_console_act")).toEqual([]);
});

test("Croatian history localizes the tab while preserving note and author text", async () => {
	window.history.replaceState(null, "", "?order=7e4ce728&tab=history");
	view = await mount(<OrdersScreen />);
	await choose("hr");
	expect(view.container.querySelector('[data-testid="tab-history"]')?.textContent).toBe("Povijest");
	expect(view.container.querySelector('[data-testid="detail-timeline"]')?.textContent).toContain(
		"Bilješka dodana",
	);
	expect(view.container.querySelector('[data-testid="detail-timeline"]')?.textContent).toContain(
		"Cancel this order?",
	);
	expect(view.container.querySelector('[data-testid="detail-timeline"]')?.textContent).toContain(
		"Fraud",
	);
	expect(view.container.querySelector('[data-testid="tab-money"]')?.textContent).toBe("Plaćanja");
});

test("a stock confirmation switches language without changing its command or merchant data", async () => {
	const commandId = "9cf64497-bb60-4aab-b520-930aaf43dcbf";
	const nextCommand = vi.spyOn(crypto, "randomUUID").mockReturnValue(commandId);
	window.history.replaceState(null, "", "?product=prod-1&tab=stock");
	view = await mount(<ProductsScreen />);
	await choose("hr");
	expect(view.container.querySelector("h1")?.textContent).toBe("Orders");
	expect(view.container.querySelector('[data-testid="tab-stock"]')?.textContent).toBe("Zalihe");
	expect(view.container.querySelector('[data-testid="detail-more"]')?.textContent).toContain(
		"Orders (paid)",
	);
	const qty = view.container.querySelector<HTMLInputElement>('[data-testid="restock-qty"]');
	if (!qty) throw new Error("stock quantity missing");
	const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
	if (!setter) throw new Error("input setter missing");
	await React.act(async () => {
		setter.call(qty, "2");
		qty.dispatchEvent(new Event("input", { bubbles: true }));
	});
	const add = view.container.querySelector<HTMLButtonElement>('[data-testid="restock-submit"]');
	if (!add) throw new Error("stock action missing");
	await fire(add, "click");
	let dialog = view.container.querySelector<HTMLDialogElement>("dialog[open]");
	expect(dialog?.textContent).toContain("Dodati 2 komada za Fraud?");
	await choose("en");
	dialog = view.container.querySelector<HTMLDialogElement>("dialog[open]");
	expect(dialog?.textContent).toContain("Add 2 units to Fraud?");
	const confirm = dialog?.querySelector<HTMLButtonElement>('[data-testid="otta-confirm-yes"]');
	if (!confirm) throw new Error("stock confirm missing");
	await fire(confirm, "click");
	const writes = requests.filter((r) => r.type === "otta_console_act");
	expect(writes).toHaveLength(1);
	expect(writes[0]).toMatchObject({
		type: "otta_console_act",
		action_id: "products:restock",
		value: { productId: "prod-1", onHand: "12", qty: "2" },
	});
	const command = writes[0]?.value as Record<string, string>;
	expect(command.commandId).toBe(commandId);
	expect(nextCommand).toHaveBeenCalledTimes(1);
	nextCommand.mockRestore();
	expect(Object.keys(command).toSorted()).toEqual(["commandId", "onHand", "productId", "qty"]);
});

test("the shared cookie wins over browser storage and sets renderer and selector language", async () => {
	window.localStorage.setItem("wscommerce_admin_locale", "en");
	document.cookie = "wscommerce_admin_locale=hr; Path=/; SameSite=Lax";
	view = await mount(<OrdersScreen />);
	expect(view.container.querySelector("[lang=hr]")).not.toBeNull();
	expect(
		view.container
			.querySelector<HTMLSelectElement>("[data-testid=admin-language]")
			?.getAttribute("aria-label"),
	).toBe("Jezik");
	expect(view.container.querySelector("h1")?.textContent).toBe("Narudžbe");
});

test("authored action notices translate without touching note or customer data", async () => {
	window.history.replaceState(null, "", "?order=7e4ce728&tab=fulfilment");
	actionNotice = {
		title: "Order shipped",
		description: "Fulfilment recorded — the buyer has been emailed their tracking.",
		variant: "success",
	};
	view = await mount(<OrdersScreen />);
	await choose("hr");
	const shipped = view.container.querySelector<HTMLButtonElement>(
		'[data-testid="transition-shipped"]',
	);
	if (!shipped) throw new Error("status action missing");
	await fire(shipped, "click");
	expect(view.container.textContent).toContain("Narudžba poslana");
	expect(view.container.textContent).toContain(
		"Isporuka je zabilježena — kupcu je poslano praćenje pošiljke.",
	);
	expect(view.container.textContent).toContain("Fraud");
	expect(requests.filter((r) => r.type === "otta_console_act")).toEqual([
		{
			type: "otta_console_act",
			action_id: "orders:transition-shipped",
			value: { orderId: "7e4ce728", toState: "shipped", state: "paid" },
		},
	]);
});

test("transport remediation switches language while keeping the network diagnostic literal", async () => {
	apiFetch.mockRejectedValue(new Error("Orders {id}"));
	view = await mount(<OrdersScreen />);
	await choose("hr");
	expect(view.container.textContent).toContain(
		"Zahtjev nije dovršen — Orders {id}. Provjerite internetsku vezu pa ponovno učitajte stranicu.",
	);
	await choose("en");
	expect(view.container.textContent).toContain(
		"The request never completed — Orders {id}. Check that you are online, then reload.",
	);
	expect(requests.filter((r) => r.type === "otta_console_act")).toEqual([]);
});

test("HTTP failures translate the client recovery instruction and preserve served text", async () => {
	apiFetch.mockResolvedValue(
		Response.json(
			{ success: false, error: { code: "DENIED", message: "Order shipped" } },
			{ status: 403 },
		),
	);
	view = await mount(<OrdersScreen />);
	await choose("hr");
	expect(view.container.textContent).toContain("Narudžbe nisu dostupne (HTTP 403)");
	expect(view.container.textContent).toContain(
		"Order shipped Prijavljeni ste, ali nemate ovlast za upravljanje dodacima.",
	);
	expect(view.container.textContent).toContain("plugins:manage");
	expect(view.container.textContent).not.toContain("Narudžba poslana");
	await choose("en");
	expect(view.container.textContent).toContain("Orders are unavailable (HTTP 403)");
	expect(view.container.textContent).toContain(
		"Order shipped Your account is signed in but is not allowed to manage plugins.",
	);
});

test("the unsaved-variant discard dialog switches every authored section label", async () => {
	const onStay = vi.fn();
	const onLeave = vi.fn();
	view = await mount(
		<AdminLocaleProvider initialLocale="hr">
			<AdminLanguageChoice />
			<LeaveConfirm
				open
				dirty={{ identity: false, price: false, shipping: false }}
				variantsDirty
				onStay={onStay}
				onLeave={onLeave}
			/>
		</AdminLocaleProvider>,
	);
	const dialog = view.container.querySelector("dialog[open]");
	expect(dialog?.textContent).toContain("Odjeljak Varijante ima nespremljene izmjene.");
	expect(dialog?.textContent).not.toContain("Variants");
	await choose("en");
	expect(dialog?.textContent).toContain("The Variants section has unsaved changes.");
	expect(onStay).not.toHaveBeenCalled();
	expect(onLeave).not.toHaveBeenCalled();
});

test.each([
	{ screen: "orders", failure: "http" },
	{ screen: "orders", failure: "network" },
	{ screen: "products", failure: "http" },
	{ screen: "products", failure: "network" },
])(
	"$screen Refresh keeps $failure diagnostics literal while switching recovery instructions",
	async ({ screen, failure }) => {
		window.history.replaceState(null, "", "?search=Orders&cursor=private-cursor");
		apiFetch.mockImplementation(async (_input, init) => {
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			requests.push(body);
			if (requests.length === 1)
				return Response.json({ data: screen === "orders" ? list : productList });
			if (failure === "network") throw new Error("Orders {id}");
			return Response.json(
				{ success: false, error: { code: "DENIED", message: "Order shipped" } },
				{ status: 403 },
			);
		});
		view = await mount(screen === "orders" ? <OrdersScreen /> : <ProductsScreen />);
		await choose("hr");
		const table = view.container.querySelector(`[data-testid="${screen}-table"]`);
		const rows = [...(table?.querySelectorAll("[data-row-id]") ?? [])].map((loadedRow) =>
			loadedRow.getAttribute("data-row-id"),
		);
		expect(rows).toHaveLength(1);
		const refresh = view.container.querySelector<HTMLButtonElement>(
			`[data-testid="${screen}-refresh"]`,
		);
		if (!refresh) throw new Error("refresh control missing");
		await fire(refresh, "click");
		const notice = view.container.querySelector(`[data-testid="${screen}-load-more-failure"]`);
		expect(notice?.textContent).toContain("Popis nije moguće osvježiti");
		expect(notice?.textContent).toContain(
			failure === "http"
				? "Order shipped Prijavljeni ste, ali nemate ovlast za upravljanje dodacima."
				: "Zahtjev nije dovršen — Orders {id}. Provjerite internetsku vezu pa ponovno učitajte stranicu.",
		);
		expect(notice?.textContent).toContain("Prikaz je nepromijenjen");
		expect(notice?.textContent).not.toContain("Narudžba poslana");
		await choose("en");
		expect(notice?.textContent).toContain(
			failure === "http"
				? "Order shipped Your account is signed in but is not allowed to manage plugins."
				: "The request never completed — Orders {id}. Check that you are online, then reload.",
		);
		expect(notice?.textContent).toContain("Nothing on screen has changed");
		expect(view.container.querySelector(`[data-testid="${screen}-table"]`)).toBe(table);
		expect(
			[...(table?.querySelectorAll("[data-row-id]") ?? [])].map((loadedRow) =>
				loadedRow.getAttribute("data-row-id"),
			),
		).toEqual(rows);
		expect(window.location.search).toBe("?search=Orders&cursor=private-cursor");
		expect(requests).toHaveLength(2);
		expect(requests[1]).toEqual(requests[0]);
		expect(requests.every((request) => request.type === "otta_console_read")).toBe(true);
	},
);

async function enter(input: HTMLInputElement, value: string): Promise<void> {
	const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
	if (!setter) throw new Error("input setter missing");
	await React.act(async () => {
		setter.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

test("a saved-price receipt reformats its retained before and after when language changes", async () => {
	document.cookie = "wscommerce_admin_locale=hr; Path=/";
	window.history.replaceState(null, "", "?product=prod-1");
	let saved = false;
	apiFetch.mockImplementation(async (_input, init) => {
		const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
		requests.push(body);
		if (body.type === "otta_console_act") {
			saved = true;
			return Response.json({ data: { ok: true, notice: null } });
		}
		return Response.json({
			data: saved
				? {
						...productDetail,
						product: {
							...productDetail.product,
							priceCents: 1999,
							updatedAt: "2026-01-03T00:00:00.000Z",
						},
					}
				: productDetail,
		});
	});
	view = await mount(<ProductsScreen />);
	const price = view.container.querySelector<HTMLInputElement>('input[data-testid="edit-price"]');
	if (!price) throw new Error("price input missing");
	await enter(price, "19.99");
	const save = view.container.querySelector<HTMLButtonElement>('[data-testid="save-price"]');
	if (!save) throw new Error("save price control missing");
	await fire(save, "click");
	const receipt = view.container.querySelector('[data-testid="price-receipt"]');
	expect(receipt?.textContent).toContain("123,45 € → 19,99 €");
	const writes = requests.filter((request) => request.type === "otta_console_act");
	expect(writes).toEqual([
		{
			type: "otta_console_act",
			action_id: "products:save-price",
			value: {
				productId: "prod-1",
				expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
				price: "19.99",
				priceTaxMode: "exclusive",
				currency: "EUR",
				compareAt: "",
				unitCost: "",
			},
		},
	]);
	await choose("en");
	expect(receipt?.textContent).toContain("Price updated — live on the storefront");
	expect(receipt?.textContent).toContain("€123.45 → €19.99");
	expect(receipt?.textContent).toContain("orders already placed keep the price they were charged");
	await choose("hr");
	expect(receipt?.textContent).toContain("123,45 € → 19,99 €");
	expect(view.container.querySelector("h1")?.textContent).toBe("Orders");
	expect(requests.filter((request) => request.type === "otta_console_act")).toEqual(writes);
});

test("a local stock-storage refusal switches back to English without sending a mutation", async () => {
	document.cookie = "wscommerce_admin_locale=hr; Path=/";
	window.history.replaceState(null, "", "?product=prod-1&tab=stock");
	vi.spyOn(globalThis.sessionStorage, "setItem").mockImplementation(() => {
		throw new Error("storage restricted");
	});
	view = await mount(<ProductsScreen />);
	const quantity = view.container.querySelector<HTMLInputElement>('[data-testid="restock-qty"]');
	if (!quantity) throw new Error("stock quantity missing");
	await enter(quantity, "2");
	const add = view.container.querySelector<HTMLButtonElement>('[data-testid="restock-submit"]');
	if (!add) throw new Error("stock action missing");
	await fire(add, "click");
	const confirm = view.container.querySelector<HTMLButtonElement>(
		'dialog[open] [data-testid="otta-confirm-yes"]',
	);
	if (!confirm) throw new Error("stock confirmation missing");
	await fire(confirm, "click");
	expect(view.container.textContent).toContain("Nalog za zalihu nije poslan");
	await choose("en");
	expect(view.container.textContent).toContain("Stock command not sent");
	expect(view.container.textContent).toContain(
		"Your browser could not retain this stock command for safe retry.",
	);
	await choose("hr");
	expect(view.container.textContent).toContain("Nalog za zalihu nije poslan");
	expect(requests).toHaveLength(1);
	expect(requests[0]?.type).toBe("otta_console_read");
});
