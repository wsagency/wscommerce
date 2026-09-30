import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { cents, currency, idempotencyKey, money, orderId, productId, sku } from "@otta-sh/domain";
import { createAdminRouteHandler } from "../src/admin/admin-route.js";
import type { Notice } from "../src/admin/scaffold/index.js";
import type { RouteHandler } from "../src/types.js";
import {
	makeInProcessCommerce,
	type InProcessCommerceHarness,
} from "./helpers/in-process-commerce.js";

const admin = createAdminRouteHandler() as RouteHandler<Record<string, unknown>>;
let harness: InProcessCommerceHarness;

async function invoke(
	input: Record<string, unknown>,
	headers: Record<string, string> = {},
): Promise<{ ok: boolean; notice: Notice | null; [key: string]: unknown }> {
	return (await admin(
		{ input, request: { method: "POST", url: "https://shop.test/admin", headers } },
		harness.ctx,
	)) as { ok: boolean; notice: Notice | null; [key: string]: unknown };
}

async function seedProduct(id = "locale-product", code = "Settings", onHand = 10): Promise<string> {
	const record = await harness.stores.productCommerce.upsert(
		{
			productId: productId(id),
			sku: sku(code),
			title: "Stock added",
			price: money(cents(499), currency("EUR")),
			taxClass: "standard",
			weightGrams: 320,
			productKind: "physical",
		},
		idempotencyKey(`seed-${id}`),
	);
	await harness.stores.inventory.seedOnHand(sku(code), onHand);
	return record.updatedAt.toISOString();
}

async function seedOrder(): Promise<void> {
	await harness.stores.orderStore.createFromCart({
		orderId: orderId("locale-order"),
		cartId: null,
		currency: currency("EUR"),
		idempotencyKey: idempotencyKey("locale-order-create"),
		holdExpiresAt: "2099-01-01T00:00:00.000Z",
		buyerRef: "Settings",
		paymentMethod: "stripe",
		lines: [
			{
				productId: productId("order-product"),
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
	await harness.stores.orderStore.markPaid(orderId("locale-order"));
}

describe("request-local authored console action notices", () => {
	beforeAll(async () => {
		harness = await makeInProcessCommerce();
	});
	beforeEach(async () => harness.reset());
	afterAll(async () => harness.close());

	test.each([
		[1, "1 jedinica"],
		[2, "2 jedinice"],
		[5, "5 jedinica"],
		[21, "21 jedinica"],
	] as const)(
		"renders a Croatian restock receipt for %s units without changing the stock command",
		async (count, units) => {
			await seedProduct();
			const value = {
				productId: "locale-product",
				qty: String(count),
				onHand: "10",
				commandId: "92c1d21c-7a89-4e73-840e-6b11b845fc17",
			};
			const response = await invoke({
				type: "otta_console_act",
				action_id: "products:restock",
				value,
				locale: "hr",
			});
			expect(response.notice).toMatchObject({ variant: "default", title: "Zaliha dodana" });
			expect(response.notice?.description).toContain(`Dodano ${units}.`);
			expect(response.notice?.description).toContain(String(10 + count));
			expect(await harness.stores.inventory.findOnHand(sku("Settings"))).toBe(10 + count);
			const replay = await invoke({
				type: "otta_console_act",
				action_id: "products:restock",
				value,
				locale: "en",
			});
			expect(replay.notice?.title).toBe("Stock added");
			expect(await harness.stores.inventory.findOnHand(sku("Settings"))).toBe(10 + count);
			expect(harness.egressAttempts()).toBe(0);
		},
	);

	test("translates the stock watermark refusal with native counts and leaves product name/SKU collisions unchanged", async () => {
		await seedProduct("locale-product", "Stock added", 2);
		const input = {
			type: "otta_console_act",
			action_id: "products:remove-stock",
			value: {
				productId: "locale-product",
				qty: "1",
				onHand: "10",
				commandId: "9a24cf6c-9320-46e6-bb1a-803046292f92",
			},
		};
		const response = await invoke(input, { cookie: "wscommerce_admin_locale=hr" });
		expect(response.notice?.title).toBe("Zaliha je promijenjena — ništa nije uklonjeno");
		expect(response.notice?.description).toContain("2 jedinice");
		const english = await invoke(
			{ ...input, locale: "en" },
			{ cookie: "wscommerce_admin_locale=hr" },
		);
		expect(english.notice?.description).toContain("2 units are on hand now");
		const detail = await invoke({
			type: "otta_console_read",
			resource: "products.detail",
			productId: "locale-product",
			locale: "hr",
		});
		expect(detail.product).toMatchObject({ title: "Stock added", sku: "Stock added", onHand: 2 });
	});

	test("translates order watermark templates while preserving native states, title and frozen amounts", async () => {
		await seedOrder();
		await harness.stores.orderStore.transition({
			orderId: orderId("locale-order"),
			fromState: "paid",
			toState: "processing",
			idempotencyKey: idempotencyKey("locale-order-process"),
			enqueueEmail: false,
		});
		const input = {
			type: "otta_console_act",
			action_id: "orders:transition-shipped",
			value: { orderId: "locale-order", state: "paid" },
		};
		const response = await invoke({ ...input, locale: "hr" });
		expect(response.notice?.title).toBe("Narudžba je promijenjena — ništa nije primijenjeno");
		expect(response.notice?.description).toContain("paid");
		expect(response.notice?.description).toContain("processing");
		const english = await invoke({ ...input, locale: "en" });
		expect(english.notice?.description).toBe(
			"It was paid when you started and is now processing. Check the order below before changing its status.",
		);
		const detail = await invoke({
			type: "otta_console_read",
			resource: "orders.detail",
			orderId: "locale-order",
			locale: "hr",
		});
		expect(detail.order).toMatchObject({
			state: "processing",
			currency: "EUR",
			totals: { totalCents: 499 },
		});
		expect(JSON.stringify(detail)).toContain("Stock added");
	});

	test("translates duplicate-note receipts without substituting merchant note or author copy", async () => {
		await seedOrder();
		const input = {
			type: "otta_console_act",
			action_id: "orders:add-note",
			value: { orderId: "locale-order", author: "Stock added", body: "Settings" },
		};
		expect((await invoke({ ...input, locale: "hr" })).notice).toBeNull();
		const duplicate = await invoke({ ...input, locale: "hr" });
		expect(duplicate.notice).toMatchObject({
			title: "Već dodano",
			description: "Ta je bilješka već na ovoj narudžbi.",
		});
		const detail = await invoke({
			type: "otta_console_read",
			resource: "orders.detail",
			orderId: "locale-order",
			locale: "hr",
		});
		expect(detail.notes).toEqual([
			expect.objectContaining({ author: "Stock added", body: "Settings" }),
		]);
		expect((await invoke({ ...input, locale: "en" })).notice?.title).toBe("Already added");
		expect(harness.egressAttempts()).toBe(0);
	});
});
