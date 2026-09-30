import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { cents, currency, idempotencyKey, orderId } from "@otta-sh/domain";
import { SHIPPING_ZONES_COLLECTION } from "@otta-sh/store-emdash";
import { createAdminRouteHandler } from "../src/admin/admin-route.js";
import { asRecord, encodePath } from "../src/admin/scaffold/index.js";
import { withInvoiceIntegrations } from "../src/integrations/invoices.js";
import type { BlockResponse, PluginContext, RouteHandler } from "../src/types.js";
import { assertBlockContract } from "./helpers/block-contract.js";
import { buttons, field, findBlocks, formFor, type LooseBlock } from "./helpers/blocks.js";
import {
	makeInProcessCommerce,
	type InProcessCommerceHarness,
} from "./helpers/in-process-commerce.js";

const adminHandler = createAdminRouteHandler();
const admin: RouteHandler = async (routeCtx, ctx) => {
	const input = asRecord(routeCtx.input);
	if (input === undefined) return { blocks: [] };
	return adminHandler({ ...routeCtx, input }, ctx);
};
let harness: InProcessCommerceHarness;

async function invoke(
	input: Record<string, unknown>,
	headers: Record<string, string> = {},
	ctx: PluginContext = harness.ctx,
): Promise<BlockResponse> {
	return (await admin(
		{ input, request: { method: "POST", url: "https://shop.test/plugins/otta/admin", headers } },
		ctx,
	)) as BlockResponse;
}

function blocks(response: BlockResponse): LooseBlock[] {
	return response.blocks as unknown as LooseBlock[];
}

function heading(response: BlockResponse): string | undefined {
	return findBlocks(blocks(response), "header")[0]?.text as string | undefined;
}

describe("request-local Block Kit commerce language", () => {
	beforeAll(async () => {
		harness = await makeInProcessCommerce();
	});
	beforeEach(async () => harness.reset());
	afterAll(async () => harness.close());

	test.each([
		["/reports", "Trgovina — Izvještaji", "reports"],
		["/settings", "Postavke", "settings"],
		["/coupons", "Kuponi", "coupons"],
		["/tax", "Porezne klase", "tax"],
		["/shipping", "Zone dostave", "shipping"],
	] as const)(
		"renders Croatian authored copy for %s without changing the block contract",
		async (page, title, screen) => {
			const response = await invoke({ type: "page_load", page, locale: "hr" });
			expect(heading(response)).toBe(title);
			assertBlockContract(blocks(response), { screen, level: "list", locale: "hr" });
			expect(harness.egressAttempts()).toBe(0);
		},
	);

	test("uses the persisted cookie, normalizes explicit variants, and defaults invalid explicit input to English", async () => {
		const headers = { Cookie: "other=1; wscommerce_admin_locale=hr" };
		expect(heading(await invoke({ type: "page_load", page: "/settings" }, headers))).toBe(
			"Postavke",
		);
		expect(
			heading(await invoke({ type: "page_load", page: "/settings", locale: "en-GB" }, headers)),
		).toBe("Settings");
		expect(heading(await invoke({ type: "page_load", page: "/settings", locale: "hr-HR" }))).toBe(
			"Postavke",
		);
		expect(
			heading(
				await invoke({ type: "page_load", page: "/settings", locale: { locale: "hr" } }, headers),
			),
		).toBe("Settings");
		expect(
			heading(
				await invoke(
					{ type: "page_load", page: "/settings" },
					{ cookie: "wscommerce_admin_locale=%ZZ" },
				),
			),
		).toBe("Settings");
	});

	test("keeps concurrent report requests in their own language across asynchronous reads", async () => {
		let entered!: () => void;
		let release!: () => void;
		const paused = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const resume = new Promise<void>((resolve) => {
			release = resolve;
		});
		const ctx: PluginContext = {
			...harness.ctx,
			kv: {
				...harness.ctx.kv,
				async get<T>(key: string): Promise<T | null> {
					if (key === "settings:storeDisplayName") {
						entered();
						await resume;
					}
					return harness.ctx.kv.get<T>(key);
				},
			},
		};
		const croatian = invoke({ type: "page_load", page: "/reports", locale: "hr" }, {}, ctx);
		await paused;
		const english = await invoke({ type: "page_load", page: "/reports", locale: "en" });
		release();
		expect(heading(english)).toBe("Store — Reports");
		expect(heading(await croatian)).toBe("Trgovina — Izvještaji");
	});

	test("localizes report statuses, dates and money while retaining frozen product names and amounts", async () => {
		await harness.ctx.storage!.reporting_daily!.put("EUR:2026-09-01", {
			currency: "EUR",
			date: "2026-09-01",
			stateCounts: { paid: 1 },
			revenueOrders: 1,
			revenueCents: 1500,
			refundEntries: 0,
			refundedCents: 0,
			updatedAt: "2026-09-01T00:00:00.000Z",
		});
		await harness.ctx.storage!.orders!.put("report-locale", {
			orderId: "report-locale",
			state: "paid",
			currency: "EUR",
			createdAt: "2026-09-01T00:00:00.000Z",
			updatedAt: "2026-09-01T00:00:00.000Z",
			items: [
				{
					id: "line-locale",
					productId: "product-locale",
					sku: "REPORTS",
					title: "Settings",
					unitPrice: 1500,
					currency: "EUR",
					quantity: 1,
					fulfillmentKind: "physical",
					reservationId: null,
				},
			],
		});
		const response = await invoke({
			type: "page_load",
			page: "/reports",
			locale: "hr",
			from: "2026-09-01",
			to: "2026-09-01",
		});
		const tables = findBlocks(blocks(response), "table");
		expect(tables.find((table) => table.block_id === "reports:statuses-table")?.rows).toEqual([
			{ status: "plaćeno", orderCount: 1 },
		]);
		expect(tables.find((table) => table.block_id === "reports:top-table")?.rows).toEqual([
			{ titleSnapshot: "Settings", qtySold: 1, revenue: "15,00\u00a0€" },
		]);
		expect(JSON.stringify(response)).toContain("ruj");
		expect(JSON.stringify(response)).toContain("Prihod po danu");
		expect(
			findBlocks(blocks(response), "accordion").find((group) => group.block_id === "reports:low")
				?.label,
		).toBe("Niska zaliha (0) — do 5");
		expect(await harness.ctx.storage!.reporting_daily!.get("EUR:2026-09-01")).toMatchObject({
			revenueCents: 1500,
			currency: "EUR",
		});
	});

	test("translates secret provisioning receipts and empty-field notices without exposing secret values", async () => {
		const saved = await invoke({
			type: "form_submit",
			action_id: "save-stripe-secret-key",
			locale: "hr",
			values: { stripeSecretKey: "secret-locale-value" },
		});
		expect(saved.toast?.message).toBe("Spremljeno: Tajni Stripe ključ");
		expect(JSON.stringify(saved)).not.toContain("secret-locale-value");
		const kept = await invoke({
			type: "form_submit",
			action_id: "save-stripe-secret-key",
			locale: "hr",
			values: { stripeSecretKey: "" },
		});
		expect(kept.toast?.message).toBe("Bez promjene: Tajni Stripe ključ");
		expect(await harness.ctx.kv.get("settings:stripeSecretKey")).toBe("secret-locale-value");
	});

	test("translates settings validation and receipts while preserving merchant-authored values", async () => {
		const saved = await invoke({
			type: "form_submit",
			action_id: "save-display",
			locale: "hr",
			values: { storeDisplayName: "Settings" },
		});
		expect(saved.toast).toEqual({ message: "Naziv trgovine spremljen", type: "success" });
		expect(field(formFor(blocks(saved), "save-display"), "storeDisplayName")).toMatchObject({
			label: "Naziv trgovine",
			initial_value: "Settings",
		});
		expect(await harness.ctx.kv.get("settings:storeDisplayName")).toBe("Settings");
		const rejected = await invoke({
			type: "form_submit",
			action_id: "save-display",
			locale: "hr",
			values: { storeDisplayName: "" },
		});
		expect(findBlocks(blocks(rejected), "banner")[0]).toMatchObject({
			title: "Naziv trgovine nije spremljen",
		});
		expect(JSON.stringify(rejected)).toContain("1–200 znakova");
		expect(await harness.ctx.kv.get("settings:storeDisplayName")).toBe("Settings");
	});

	test("localizes typed operational-setting validation with its bound and attempted value while leaving storage unchanged", async () => {
		const response = await invoke({
			type: "form_submit",
			action_id: "save-operational",
			locale: "hr",
			idempotencyKey: "locale-invalid-setting",
			values: { holdTtlMinutes: "10081" },
		});
		expect(JSON.stringify(response)).toContain(
			"Trajanje rezervacije mora biti cijeli broj od 1 do 10080; uneseno: 10081.",
		);
		expect(
			field(formFor(blocks(response), "save-operational"), "holdTtlMinutes")?.initial_value,
		).toBe("10081");
		expect(await harness.stores.settingsStore.get()).toMatchObject({ holdTtlMinutes: 15 });
		const english = await invoke({
			type: "form_submit",
			action_id: "save-operational",
			locale: "en",
			idempotencyKey: "locale-invalid-setting",
			values: { holdTtlMinutes: "10081" },
		});
		expect(JSON.stringify(english)).toContain("holdTtlMinutes must be <= 10080, got 10081");
	});

	test("keeps coupon codes, money, kind options and delete targets while translating statuses and confirmation", async () => {
		const created = await invoke({
			type: "form_submit",
			action_id: "coupons:create",
			locale: "hr",
			values: {
				id: "coupon-locale",
				code: "REPORTS",
				type: "fixed_amount",
				amount: "5.00",
				currency: "EUR",
			},
		});
		expect(JSON.stringify(created)).toContain("Kupon je izrađen");
		expect(await harness.stores.couponStore.findById("coupon-locale")).toMatchObject({
			id: "coupon-locale",
			code: "REPORTS",
			type: "fixed_amount",
			amountCents: 500,
			currency: "EUR",
		});
		const detail = await invoke({
			type: "block_action",
			action_id: "coupons:open",
			locale: "hr",
			values: { target: encodePath(["REPORTS"]) },
		});
		assertBlockContract(blocks(detail), { screen: "coupons", level: "detail", locale: "hr" });
		expect(heading(detail)).toContain("REPORTS");
		expect(JSON.stringify(detail)).toContain("Aktivan");
		expect(JSON.stringify(detail)).toContain("— (nema)");
		const remove = buttons(blocks(detail)).find((button) => button.action_id === "coupons:delete");
		expect(remove).toMatchObject({
			label: "Obriši kupon",
			value: { couponId: "coupon-locale", code: "REPORTS" },
			confirm: { confirm: "Da, obriši", deny: "Zadrži" },
		});
		const fresh = await invoke({ type: "block_action", action_id: "coupons:new", locale: "hr" });
		expect(field(formFor(blocks(fresh), "coupons:create"), "type")).toMatchObject({
			options: [
				{ value: "fixed_amount", label: "Fiksni popust" },
				{ value: "percentage", label: "Postotni popust" },
			],
		});
	});

	test.each([
		[1, "1 iskorištenje"],
		[2, "2 iskorištenja"],
		[5, "5 iskorištenja"],
		[21, "21 iskorištenje"],
	] as const)(
		"renders Croatian coupon use plurals for %s actual redemptions",
		async (count, summary) => {
			await invoke({
				type: "form_submit",
				action_id: "coupons:create",
				values: {
					id: "plural-locale",
					code: "PLURAL",
					type: "fixed_amount",
					amount: "5.00",
					currency: "EUR",
				},
			});
			for (let index = 0; index < count; index++) {
				await harness.stores.couponStore.redeem({
					couponId: "plural-locale",
					orderId: orderId(`plural-order-${index}`),
					idempotencyKey: idempotencyKey(`plural-key-${index}`),
					createdAt: "2026-09-01T00:00:00.000Z",
				});
			}
			const response = await invoke({
				type: "block_action",
				action_id: "coupons:open",
				locale: "hr",
				values: { target: encodePath(["PLURAL"]) },
			});
			const identity = findBlocks(blocks(response), "fields").find(
				(block) => block.block_id === "coupons:identity",
			);
			expect(identity?.fields).toContainEqual({ label: "Iskorištenja", value: summary });
		},
	);

	test("localizes tax rate scope and keeps immutable rate, zone, percent and toggle inputs", async () => {
		await harness.stores.shippingRules.createZone({
			id: "rate-zone",
			name: "Settings",
			regions: ["HR"],
		});
		await harness.stores.taxRules.createClass({ id: "rate-class", name: "Reports" });
		await harness.stores.taxRules.createRate({
			id: "rate-locale",
			taxClassId: "rate-class",
			zoneId: "rate-zone",
			rateBps: 725,
			appliesToShipping: true,
		});
		const response = await invoke({
			type: "block_action",
			action_id: "tax:open",
			locale: "hr",
			value: { target: encodePath(["rate-class"]) },
		});
		expect(JSON.stringify(response)).toContain("i dostava");
		const edit = formFor(blocks(response), "tax:save-rate");
		expect(field(edit, "ratePercent")?.initial_value).toBe("7.25");
		expect(field(edit, "appliesToShipping")?.initial_value).toBe(true);
		expect(JSON.stringify(response)).toContain("Settings");
	});

	test.each([
		["hr", "da", "Primjenjuje se na dostavu"],
		["en", "yes", "Applies to shipping"],
	] as const)(
		"localizes %s tax fallback-table booleans while retaining rate records and form values",
		async (locale, affirmative, label) => {
			await harness.stores.shippingRules.createZone({
				id: "fallback-zone",
				name: "yes",
				regions: ["HR"],
			});
			await harness.stores.taxRules.createClass({ id: "fallback-class", name: "Settings" });
			for (let index = 0; index < 26; index++) {
				await harness.stores.taxRules.createRate({
					id: `fallback-rate-${index}`,
					taxClassId: "fallback-class",
					zoneId: "fallback-zone",
					rateBps: 725,
					appliesToShipping: index === 0,
				});
			}
			const storedRates = await harness.stores.taxRules.listRatesForZone("fallback-zone");
			const response = await invoke({
				type: "block_action",
				action_id: "tax:open",
				locale,
				value: { target: encodePath(["fallback-class"]) },
			});
			const table = findBlocks(blocks(response), "table").find(
				(block) => block.block_id === "tax:rates",
			);
			expect(table?.columns).toContainEqual({ key: "appliesToShipping", label });
			expect(table?.rows).toHaveLength(26);
			expect(table?.rows).toContainEqual({
				id: "fallback-rate-0",
				zone: "yes",
				rate: "7.25%",
				appliesToShipping: affirmative,
			});
			expect(table?.rows).toContainEqual({
				id: "fallback-rate-1",
				zone: "yes",
				rate: "7.25%",
				appliesToShipping: "—",
			});
			assertBlockContract(blocks(response), { screen: "tax", level: "list", locale });
			for (const [rateId, appliesToShipping] of [
				["fallback-rate-0", true],
				["fallback-rate-1", false],
			] as const) {
				const detail = await invoke({
					type: "block_action",
					action_id: "tax:open",
					locale,
					value: { target: encodePath(["fallback-class", rateId]) },
				});
				expect(
					field(formFor(blocks(detail), "tax:save-rate"), "appliesToShipping")?.initial_value,
				).toBe(appliesToShipping);
			}
			expect(await harness.stores.taxRules.listRatesForZone("fallback-zone")).toEqual(storedRates);
			expect(harness.egressAttempts()).toBe(0);
		},
	);

	test("localizes shipping rate scope, minimum and legacy-code hints while retaining merchant names", async () => {
		await harness.stores.shippingRules.createZone({
			id: "shipping-rate-zone",
			name: "Reports",
			regions: ["HR"],
		});
		await harness.stores.shippingRules.createMethod({
			id: "shipping-rate-method",
			zoneId: "shipping-rate-zone",
			name: "Settings",
			type: "flat_rate",
		});
		await harness.stores.shippingRules.createRate({
			methodId: "shipping-rate-method",
			currency: currency("EUR"),
			amountCents: cents(499),
			minSubtotalCents: null,
		});
		const response = await invoke({
			type: "form_submit",
			action_id: "shipping:apply-filter",
			locale: "hr",
			values: {
				currency: "EUR",
				__path: encodePath(["shipping-rate-zone", "shipping-rate-method"]),
			},
		});
		expect(JSON.stringify(response)).toContain("Bez minimuma");
		expect(field(formFor(blocks(response), "shipping:save-rate"), "amount")?.initial_value).toBe(
			"4.99",
		);
		const invalid = await invoke({
			type: "form_submit",
			action_id: "shipping:create-zone",
			locale: "hr",
			values: { id: "invalid-locale", name: "Settings", regions: "UK, EU" },
		});
		expect(JSON.stringify(invalid)).toContain("UK (upotrijebite GB)");
		expect(JSON.stringify(invalid)).toContain("EU (nije država");
		expect(field(formFor(blocks(invalid), "shipping:create-zone"), "name")?.initial_value).toBe(
			"Settings",
		);
	});

	test("translates tax validation and destructive confirmations without translating class names or ids", async () => {
		const invalid = await invoke({
			type: "form_submit",
			action_id: "tax:create-class",
			locale: "hr",
			values: { id: "class-locale", name: "" },
		});
		expect(JSON.stringify(invalid)).toContain("Unesite ID klase i naziv.");
		const created = await invoke({
			type: "form_submit",
			action_id: "tax:create-class",
			locale: "hr",
			values: { id: "class-locale", name: "Settings" },
		});
		expect(field(formFor(blocks(created), "tax:save-class"), "name")).toMatchObject({
			label: "Naziv",
			initial_value: "Settings",
		});
		const remove = buttons(blocks(created)).find(
			(button) => button.action_id === "tax:delete-class",
		);
		expect(remove).toMatchObject({
			label: "Obriši klasu",
			value: { classId: "class-locale" },
			confirm: { confirm: "Da, obriši", deny: "Zadrži" },
		});
	});

	test("translates shipping validation and confirmations while preserving zone names and regions", async () => {
		const invalid = await invoke({
			type: "form_submit",
			action_id: "shipping:create-zone",
			locale: "hr",
			values: { id: "zone-locale", name: "", regions: "HR" },
		});
		expect(JSON.stringify(invalid)).toContain("Unesite ID zone i naziv.");
		const created = await invoke({
			type: "form_submit",
			action_id: "shipping:create-zone",
			locale: "hr",
			values: { id: "zone-locale", name: "Tax", regions: "HR" },
		});
		expect(field(formFor(blocks(created), "shipping:save-zone"), "name")).toMatchObject({
			label: "Naziv",
			initial_value: "Tax",
		});
		expect(field(formFor(blocks(created), "shipping:save-zone"), "regions")?.initial_value).toBe(
			"HR",
		);
		const remove = buttons(blocks(created)).find(
			(button) => button.action_id === "shipping:delete-zone",
		);
		expect(remove).toMatchObject({
			label: "Obriši zonu",
			value: { zoneId: "zone-locale" },
			confirm: { confirm: "Da, obriši", deny: "Zadrži" },
		});
	});

	test("translates refused shipping currency filters without changing the typed currency or method name", async () => {
		await harness.stores.shippingRules.createZone({
			id: "bad-currency-zone",
			name: "Reports",
			regions: ["HR"],
		});
		await harness.stores.shippingRules.createMethod({
			id: "bad-currency-method",
			zoneId: "bad-currency-zone",
			name: "Settings",
			type: "flat_rate",
		});
		const response = await invoke({
			type: "form_submit",
			action_id: "shipping:apply-filter",
			locale: "hr",
			values: { currency: "not-money", __path: encodePath(["bad-currency-zone"]) },
		});
		expect(findBlocks(blocks(response), "banner")[0]).toMatchObject({
			title: "Cijene nisu prikazane",
			description: "Unesite troslovni kod valute, npr. USD.",
		});
		expect(
			field(formFor(blocks(response), "shipping:apply-filter"), "currency")?.initial_value,
		).toBe("NOT-MONEY");
		expect(JSON.stringify(response)).toContain("Settings");
	});

	test("fits translated legacy-region warnings after localization and retains merchant text", async () => {
		for (let index = 0; index < 6; index++) {
			await harness.ctx.storage![SHIPPING_ZONES_COLLECTION]!.put(`legacy-locale-${index}`, {
				zoneId: `legacy-locale-${index}`,
				name: `Settings ${index} ${"N".repeat(70)}`,
				regions: ["Reports"],
				methods: {},
			});
		}
		const response = await invoke({ type: "page_load", page: "/shipping", locale: "hr" });
		const warning = findBlocks(blocks(response), "banner").find(
			(block) => block.block_id === "ship:no-match-zones",
		);
		expect(String(warning?.description)).toContain("Settings 0");
		expect(String(warning?.description)).toMatch(/; još \d+\.$/);
		expect(String(warning?.description).length).toBeLessThanOrEqual(240);
		expect(JSON.stringify(response)).toContain("Reports (nije kod regije — nema podudaranja)");
	});

	test("translates integration display while leaving native status routes and provider values unchanged", async () => {
		const plugin = withInvoiceIntegrations({ routes: { admin } }, async () => ({
			invoiceOwner: "disabled",
			shopId: "Settings",
			invoiceLiveEnabled: false,
		}));
		const route = plugin.routes!.admin!;
		const render = typeof route === "function" ? route : route.handler;
		const response = (await render(
			{
				input: { type: "page_load", page: "/integrations", locale: "hr" },
				request: { method: "POST", url: "https://shop.test/admin", headers: {} },
			},
			harness.ctx,
		)) as BlockResponse;
		expect(heading(response)).toBe("Integracije trgovine");
		expect(findBlocks(blocks(response), "stats")[0]).toMatchObject({
			items: [
				{ label: "Na čekanju", value: "0" },
				{ label: "Izdano", value: "0" },
				{ label: "Usklađivanje", value: "0" },
				{ label: "Neuspjelo", value: "0" },
			],
		});
		const status = plugin.routes!["commerce/integrations/status"]!;
		const read = typeof status === "function" ? status : status.handler;
		const native = await read(
			{
				input: { locale: "hr" },
				request: { method: "POST", url: "https://shop.test/status", headers: {} },
			},
			harness.ctx,
		);
		expect(native).toEqual({
			invoiceOwner: "disabled",
			shopId: "Settings",
			invoiceLiveEnabled: false,
			soloConfigured: false,
			eRacuniConfigured: false,
		});
		expect(harness.egressAttempts()).toBe(0);
	});
});
