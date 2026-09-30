import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { cents, currency, idempotencyKey, money, orderId, productId, sku } from "@otta-sh/domain";
import {
	EmdashInventoryStore,
	EmdashOrderStore,
	EmdashProductCommerceStore,
	systemClock,
	uuidIdGen,
} from "@otta-sh/store-emdash";
import { encodePath } from "../src/admin/scaffold/index.js";
import { assertBlockContract } from "./helpers/block-contract.js";
import { blocksOf, field, findBlocks, formFor } from "./helpers/blocks.js";
import { loadPluginInSandbox, type SandboxHandle } from "./sandbox/harness.js";
import { storageBridge } from "./sandbox/storage-bridge.js";

let sandbox: SandboxHandle;

describe("commerce language inside the workerd sandbox", () => {
	beforeAll(async () => {
		sandbox = await loadPluginInSandbox({ allowedHosts: [], storage: true });
	});
	afterAll(async () => sandbox.close());

	test.each([
		["/reports", "Trgovina — Izvještaji", "reports"],
		["/settings", "Postavke", "settings"],
		["/coupons", "Kuponi", "coupons"],
		["/tax", "Porezne klase", "tax"],
		["/shipping", "Zone dostave", "shipping"],
	] as const)(
		"renders %s in Croatian within its Block Kit budgets",
		async (page, title, screen) => {
			const blocks = blocksOf(
				await sandbox.invokeRoute("admin", { type: "page_load", page, locale: "hr" }),
			);
			expect(findBlocks(blocks, "header")[0]?.text).toBe(title);
			assertBlockContract(blocks, { screen, level: "list", locale: "hr" });
		},
	);

	test("resolves the cookie per request and keeps explicit English and invalid preferences isolated", async () => {
		const request = { headers: { cookie: "wscommerce_admin_locale=hr" } };
		const input = { type: "page_load", page: "/settings" };
		const header = async (locale?: unknown): Promise<unknown> => {
			const current = locale === undefined ? input : { ...input, locale };
			return findBlocks(blocksOf(await sandbox.invokeRoute("admin", current, request)), "header")[0]
				?.text;
		};
		expect(await header()).toBe("Postavke");
		expect(await header("en-GB")).toBe("Settings");
		expect(await header("xx")).toBe("Settings");
		expect(await header()).toBe("Postavke");
		expect(findBlocks(blocksOf(await sandbox.invokeRoute("admin", input)), "header")[0]?.text).toBe(
			"Settings",
		);
	});

	test("formats populated coupon money and UTC dates while keeping codes, targets and decimal inputs native", async () => {
		await sandbox.invokeRoute("admin", {
			type: "form_submit",
			action_id: "coupons:create",
			locale: "hr",
			values: {
				id: "sandbox-locale-coupon",
				code: "SETTINGS",
				type: "fixed_amount",
				amount: "4.99",
				currency: "EUR",
			},
		});
		const input = {
			type: "block_action",
			action_id: "coupons:open",
			values: { target: encodePath(["SETTINGS"]) },
		};
		const initial = blocksOf(await sandbox.invokeRoute("admin", { ...input, locale: "hr" }));
		await sandbox.invokeRoute("admin", {
			type: "form_submit",
			action_id: "coupons:save",
			locale: "hr",
			block_id: formFor(initial, "coupons:save")?.block_id,
			values: { amount: "4.99", startsAt: "2026-09-01", expiresAt: "2027-09-01" },
		});
		const croatian = blocksOf(await sandbox.invokeRoute("admin", { ...input, locale: "hr" }));
		expect(findBlocks(croatian, "header")[0]?.text).toBe("Kupon — SETTINGS");
		expect(JSON.stringify(croatian)).toContain("4,99\u00a0€");
		expect(JSON.stringify(croatian)).toContain("ruj");
		expect(field(formFor(croatian, "coupons:save"), "amount")?.initial_value).toBe("4.99");
		expect(field(formFor(croatian, "coupons:save"), "startsAt")?.initial_value).toBe("2026-09-01");
		assertBlockContract(croatian, { screen: "coupons", level: "detail", locale: "hr" });
		const english = blocksOf(await sandbox.invokeRoute("admin", { ...input, locale: "en" }));
		expect(findBlocks(english, "header")[0]?.text).toBe("Coupon — SETTINGS");
		expect(JSON.stringify(english)).toContain("€4.99");
	});

	test("localizes a native stock command receipt inside workerd and preserves its English replay", async () => {
		const { storage } = await storageBridge();
		const products = new EmdashProductCommerceStore({ storage, clock: systemClock });
		const inventory = new EmdashInventoryStore({ storage, clock: systemClock, idGen: uuidIdGen });
		await products.upsert(
			{
				productId: productId("sandbox-action-locale"),
				sku: sku("Settings"),
				title: "Stock added",
				price: money(cents(499), currency("EUR")),
				taxClass: "standard",
				weightGrams: 320,
				productKind: "physical",
			},
			idempotencyKey("sandbox-action-locale-seed"),
		);
		await inventory.seedOnHand(sku("Settings"), 10);
		const input = {
			type: "otta_console_act",
			action_id: "products:restock",
			value: {
				productId: "sandbox-action-locale",
				onHand: "10",
				qty: "2",
				commandId: "dc5918d8-a1ae-40ef-89a2-857d9f67d54d",
			},
		};
		const croatian = await sandbox.invokeRoute("admin", input, {
			headers: { cookie: "wscommerce_admin_locale=hr" },
		});
		expect(croatian).toMatchObject({
			result: {
				ok: true,
				notice: {
					title: "Zaliha dodana",
					description: expect.stringContaining("Dodano 2 jedinice."),
				},
			},
		});
		const english = await sandbox.invokeRoute(
			"admin",
			{ ...input, locale: "en" },
			{ headers: { cookie: "wscommerce_admin_locale=hr" } },
		);
		expect(english).toMatchObject({
			result: {
				ok: true,
				notice: { title: "Stock added", description: expect.stringContaining("Added 2 units.") },
			},
		});
		expect(await inventory.findOnHand(sku("Settings"))).toBe(12);
	});

	test("localizes dynamic order refusals in workerd while native states and note/name text remain literal", async () => {
		const { storage } = await storageBridge();
		const inventory = new EmdashInventoryStore({ storage, clock: systemClock, idGen: uuidIdGen });
		const orders = new EmdashOrderStore({
			storage,
			inventory,
			clock: systemClock,
			idGen: uuidIdGen,
		});
		await orders.createFromCart({
			orderId: orderId("sandbox-order-locale"),
			cartId: null,
			currency: currency("EUR"),
			idempotencyKey: idempotencyKey("sandbox-order-locale-seed"),
			holdExpiresAt: "2099-01-01T00:00:00.000Z",
			buyerRef: "Settings",
			paymentMethod: "stripe",
			lines: [
				{
					productId: productId("order-locale-product"),
					sku: sku("REPORTS"),
					title: "Stock added",
					unitPrice: cents(499),
					currency: currency("EUR"),
					quantity: 1,
					fulfillmentKind: "physical",
					reservationId: null,
				},
			],
			totals: { subtotal: cents(499), total: cents(499), currency: currency("EUR") },
		});
		await orders.markPaid(orderId("sandbox-order-locale"));
		const refusal = await sandbox.invokeRoute("admin", {
			type: "otta_console_act",
			action_id: "orders:transition-shipped",
			locale: "hr",
			value: { orderId: "sandbox-order-locale", state: "pending" },
		});
		expect(refusal).toMatchObject({
			result: {
				ok: true,
				notice: {
					title: "Narudžba je promijenjena — ništa nije primijenjeno",
					description: expect.stringContaining("pending, a sada je paid"),
				},
			},
		});
		const note = {
			type: "otta_console_act",
			action_id: "orders:add-note",
			locale: "hr",
			value: { orderId: "sandbox-order-locale", author: "Stock added", body: "Settings" },
		};
		await sandbox.invokeRoute("admin", note);
		expect(await sandbox.invokeRoute("admin", note)).toMatchObject({
			result: { notice: { title: "Već dodano" } },
		});
		const detail = await sandbox.invokeRoute("admin", {
			type: "otta_console_read",
			resource: "orders.detail",
			orderId: "sandbox-order-locale",
			locale: "hr",
		});
		expect(detail).toMatchObject({
			result: {
				order: {
					state: "paid",
					buyerRef: "Settings",
					lines: [expect.objectContaining({ title: "Stock added", unitPriceCents: 499 })],
				},
				notes: [expect.objectContaining({ author: "Stock added", body: "Settings" })],
			},
		});
	});
});
