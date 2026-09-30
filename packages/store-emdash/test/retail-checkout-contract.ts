import {
	addLine,
	cents,
	createCart,
	createOrderFromCart,
	currency,
	idempotencyKey,
	money,
	productId,
	sku,
	type CreateOrderCommand,
} from "@otta-sh/domain";
import { expect, test } from "vitest";
import {
	EmdashProductCommerceStore,
	EmdashShippingRulesStore,
	EmdashTaxRulesStore,
	type StorageAccess,
} from "../src/index.js";
import { makeOrderHarness } from "./order-harness.js";

const EUR = currency("EUR");
const shippingAddress = {
	name: "Buyer",
	line1: "Street 1",
	city: "Zagreb",
	postalCode: "10000",
	country: "HR",
};

async function arrange(storage: StorageAccess, kind: "physical" | "digital" = "physical") {
	const h = makeOrderHarness(storage);
	const productCommerce = new EmdashProductCommerceStore({ storage, clock: h.clock });
	const shippingRules = new EmdashShippingRulesStore({ storage, clock: h.clock });
	const taxRules = new EmdashTaxRulesStore({ storage, clock: h.clock });
	await productCommerce.upsert(
		{
			productId: productId("shirt"),
			sku: sku("BASE"),
			price: money(cents(1250), EUR),
			title: "Shirt",
			productKind: kind,
			priceTaxMode: "inclusive",
		},
		idempotencyKey("seed"),
	);
	await productCommerce.activate(
		productId("shirt"),
		idempotencyKey("publish"),
		"2026-01-01T00:00:00.000Z",
	);
	await h.inventory.seedOnHand(sku("BASE"), 10);
	await shippingRules.createZone({ id: "hr", name: "Croatia", regions: ["HR"] });
	await shippingRules.createMethod({ id: "flat", zoneId: "hr", name: "Flat", type: "flat_rate" });
	await shippingRules.createRate({
		methodId: "flat",
		currency: EUR,
		amountCents: cents(100),
		minSubtotalCents: null,
	});
	await taxRules.createRate({
		id: "vat",
		zoneId: "hr",
		taxClassId: "standard",
		rateBps: 2500,
		appliesToShipping: true,
	});
	return {
		h,
		productCommerce,
		taxRules,
		deps: { ...h.createDeps, productCommerce, shippingRules, taxRules },
	};
}

function command(cartId: string): CreateOrderCommand {
	return {
		cartId,
		idempotencyKey: idempotencyKey("checkout"),
		buyerRef: "buyer@example.com",
		paymentMethod: "stripe",
		shippingAddress,
		shippingMethodId: "flat",
	};
}

/** The identical assertions run on migrated SQLite and local workerd D1. */
export function retailCheckoutContract(storage: () => StorageAccess): void {
	test("digital checkout freezes its billing jurisdiction and taxes from it", async () => {
		const { h, deps } = await arrange(storage(), "digital");
		const cartId = await createCart(h.cartDeps, EUR);
		await addLine(h.cartDeps, cartId, sku("BASE"), "shirt", 1, idempotencyKey("add"), "digital");
		const result = await createOrderFromCart(deps, {
			cartId,
			idempotencyKey: idempotencyKey("digital"),
			buyerRef: "buyer",
			paymentMethod: "stripe",
			billingAddress: { ...shippingAddress, company: "Retail Ltd", vatId: "HR-EXAMPLE" },
		});
		expect(result).toMatchObject({
			ok: true,
			order: {
				shippingAddress: null,
				billingAddress: { country: "HR", company: "Retail Ltd", vatId: "HR-EXAMPLE" },
				totals: { total: 1250, tax: 250 },
				lines: [{ netCents: 1000, grossCents: 1250, taxCents: 250, rateBps: 2500 }],
			},
		});
	});
	test("digital checkout with configured jurisdictions refuses an absent billing destination before minting", async () => {
		const { h, deps } = await arrange(storage(), "digital");
		const cartId = await createCart(h.cartDeps, EUR);
		await addLine(h.cartDeps, cartId, sku("BASE"), "shirt", 1, idempotencyKey("add"), "digital");
		expect(
			await createOrderFromCart(deps, {
				cartId,
				idempotencyKey: idempotencyKey("missing"),
				buyerRef: "buyer",
				paymentMethod: "stripe",
			}),
		).toEqual({ ok: false, reason: "MISSING_BILLING_ADDRESS" });
		expect(await h.store.getByIdempotencyKey(idempotencyKey("missing"))).toBeNull();
	});
	test("inclusive retail checkout freezes line and shipping arithmetic and replays after catalog/rate edits", async () => {
		const { h, productCommerce, taxRules, deps } = await arrange(storage());
		const cartId = await createCart(h.cartDeps, EUR);
		expect(
			(await addLine(h.cartDeps, cartId, sku("BASE"), "shirt", 2, idempotencyKey("add"))).ok,
		).toBe(true);
		const result = await createOrderFromCart(deps, command(cartId));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const before = await h.store.getById(result.order.id);
		expect(before?.totals).toMatchObject({
			subtotal: 2500,
			shipping: 100,
			tax: 525,
			total: 2625,
			taxBreakdown: {
				priceTaxMode: "inclusive",
				shippingNetCents: 100,
				shippingTaxCents: 25,
				shippingRateBps: 2500,
				lines: [
					{
						rateBps: 2500,
						subtotalNetCents: 2000,
						netCents: 2000,
						grossCents: 2500,
						discountedCents: 2500,
						taxCents: 500,
						priceTaxMode: "inclusive",
					},
				],
			},
		});
		expect(before?.lines[0]).toMatchObject({
			unitPrice: 1250,
			variantId: null,
			priceTaxMode: "inclusive",
			rateBps: 2500,
			netCents: 2000,
			grossCents: 2500,
			taxCents: 500,
		});
		await productCommerce.upsert(
			{ productId: productId("shirt"), price: money(cents(9999), EUR), priceTaxMode: "exclusive" },
			idempotencyKey("edit"),
		);
		await taxRules.updateRate("vat", { rateBps: 1900, appliesToShipping: false }, 2500);
		const replay = await createOrderFromCart(deps, command(cartId));
		expect(replay.ok && replay.order.totals).toEqual(before?.totals);
		expect(replay.ok && replay.order.lines).toEqual(before?.lines);
	});
	test("variant identity is frozen from its immutable key and survives a catalog SKU rename", async () => {
		const { h, productCommerce, deps } = await arrange(storage(), "digital");
		await productCommerce.upsertVariant(
			{
				productId: productId("shirt"),
				variantKey: "large",
				title: "Large",
				contentUpdatedAt: "2026-01-01T00:00:00.000Z",
			},
			idempotencyKey("declare"),
		);
		const variant = (await productCommerce.listVariants(productId("shirt")))[0]!;
		await productCommerce.updateVariantFields(
			{
				productId: productId("shirt"),
				variantKey: "large",
				sku: sku("LARGE"),
				price: money(cents(2500), EUR),
			},
			idempotencyKey("price"),
			variant.updatedAt.toISOString(),
		);
		const cartId = await createCart(h.cartDeps, EUR);
		await addLine(h.cartDeps, cartId, sku("LARGE"), "shirt", 1, idempotencyKey("add"), "digital");
		const cmd = { ...command(cartId), shippingMethodId: undefined };
		const placed = await createOrderFromCart(deps, cmd);
		expect(placed).toMatchObject({ ok: true });
		if (!placed.ok) return;
		expect(placed.order.lines[0]).toMatchObject({
			sku: "LARGE",
			title: "Shirt — Large",
			unitPrice: 2500,
			variantId: "shirt:large",
		});
		const priced = (await productCommerce.listVariants(productId("shirt")))[0]!;
		await productCommerce.updateVariantFields(
			{ productId: productId("shirt"), variantKey: "large", sku: sku("NEW-LARGE") },
			idempotencyKey("rename"),
			priced.updatedAt.toISOString(),
		);
		expect((await h.store.getById(placed.order.id))?.lines[0]).toMatchObject({
			sku: "LARGE",
			variantId: "shirt:large",
			unitPrice: 2500,
		});
	});
	test("a historical order without a tax proof does not acquire invented rates or variant identity", async () => {
		const h = makeOrderHarness(storage());
		const placed = await h.store.createFromCart({
			orderId: "old" as never,
			cartId: null,
			currency: EUR,
			idempotencyKey: idempotencyKey("legacy"),
			buyerRef: "legacy",
			paymentMethod: null,
			holdExpiresAt: "2026-09-30T00:00:00.000Z",
			lines: [
				{
					productId: productId("shirt"),
					sku: sku("OLD"),
					title: "Old",
					unitPrice: cents(1000),
					currency: EUR,
					quantity: 1,
					fulfillmentKind: "digital",
					reservationId: null,
				},
			],
			totals: { subtotal: cents(1000), total: cents(1250), tax: cents(250), currency: EUR },
		});
		const reread = await h.store.getById(placed.order.id);
		expect(reread?.totals.taxBreakdown).toBeNull();
		expect(reread?.lines[0]?.rateBps).toBeUndefined();
		expect(reread?.lines[0]?.variantId).toBeUndefined();
	});
}
