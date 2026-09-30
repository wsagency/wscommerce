import {
	cents,
	currency,
	idempotencyKey,
	money,
	productId,
	sku,
	type ProductCommerceUpdateResult,
	type ProductVariantUpdateResult,
} from "@otta-sh/domain";
import { expect, test } from "vitest";
import type { ProductCommerceHarness } from "./product-commerce-harness.js";

const eur = (amount: number) => money(cents(amount), currency("EUR"));

function savedRow(result: ProductCommerceUpdateResult | ProductVariantUpdateResult) {
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error("The fixture's fresh native edit must succeed");
	return "product" in result ? result.product : result.variant;
}

/** Real native writes in one clock tick must invalidate an older merchant draft. */
export function productWatermarkCases(make: () => ProductCommerceHarness): void {
	for (const kind of ["product", "variant"] as const) {
		test(`${kind} edit tokens survive clock rollback and returning price or CMS metadata`, async () => {
			const { store, clock } = make();
			const id = productId(`watermark-rollback-${kind}`);
			const contentTime = (offset: number) =>
				new Date(clock.now().getTime() + 60_000 + offset).toISOString();
			const contentEpoch = clock.now().toISOString();
			let opened = await store.upsert(
				{ productId: id, price: eur(1000), title: "A", contentUpdatedAt: contentEpoch },
				idempotencyKey("seed"),
			);
			const edit = (amount: number, key: string, expected: string) =>
				kind === "product"
					? store.updateCommerceFields(
							{ productId: id, price: eur(amount) },
							idempotencyKey(key),
							expected,
						)
					: store.updateVariantFields(
							{ productId: id, variantKey: "blue", price: eur(amount) },
							idempotencyKey(key),
							expected,
						);
			const refresh = (title: string, at: string, key: string) =>
				kind === "product"
					? store.upsert({ productId: id, title, contentUpdatedAt: at }, idempotencyKey(key))
					: store.upsertVariant(
							{ productId: id, variantKey: "blue", title, contentUpdatedAt: at },
							idempotencyKey(key),
						);
			let current;
			if (kind === "variant") {
				const declared = await refresh("A", contentEpoch, "declare");
				current = savedRow(await edit(1000, "initial-price", declared.updatedAt.toISOString()));
			} else current = opened;
			clock.advance(-60_000);
			const first = await edit(2100, "first", current.updatedAt.toISOString());
			const saved = savedRow(first);
			expect(saved.updatedAt.getTime()).toBeGreaterThan(current.updatedAt.getTime());
			expect(await edit(2100, "first", current.updatedAt.toISOString())).toEqual(first);
			const returnedPrice = savedRow(await edit(1000, "second", saved.updatedAt.toISOString()));
			expect(returnedPrice.updatedAt.getTime()).toBeGreaterThan(saved.updatedAt.getTime());
			expect(await edit(2499, "old-draft", current.updatedAt.toISOString())).toMatchObject({
				ok: false,
				reason: "stale",
			});
			const changed = await refresh("B", contentTime(1), "cms-B");
			expect(changed.updatedAt.getTime()).toBeGreaterThan(returnedPrice.updatedAt.getTime());
			expect(await refresh("B", contentTime(1), "cms-B")).toEqual(changed);
			expect(await refresh("OLD", contentEpoch, "stale-CMS")).toEqual(changed);
			const returnedTitle = await refresh("A", contentTime(2), "cms-A");
			expect(returnedTitle.title).toBe("A");
			expect(returnedTitle.updatedAt.getTime()).toBeGreaterThan(changed.updatedAt.getTime());
			expect(
				await edit(2499, "old-title-draft", returnedPrice.updatedAt.toISOString()),
			).toMatchObject({ ok: false, reason: "stale" });
			if (kind === "product") {
				await store.activate(id, idempotencyKey("on"), contentTime(3));
				const active = await store.getByProductId(id);
				await store.deactivate(id, idempotencyKey("off"), contentTime(4));
				const inactive = await store.getByProductId(id);
				expect(active?.updatedAt.getTime()).toBeGreaterThan(returnedTitle.updatedAt.getTime());
				expect(inactive?.updatedAt.getTime()).toBeGreaterThan(active!.updatedAt.getTime());
				expect(inactive?.active).toBe(false);
			} else {
				await store.deactivateVariant(id, "blue", idempotencyKey("orphan"), contentTime(3));
				const restored = await refresh("A", contentTime(4), "restore");
				expect(restored.updatedAt.getTime()).toBeGreaterThan(returnedTitle.updatedAt.getTime());
				expect(
					await edit(2499, "old-live-draft", returnedTitle.updatedAt.toISOString()),
				).toMatchObject({ ok: false, reason: "stale" });
			}
		});
	}
	test("same-tick product edits refuse the original draft after the first save", async () => {
		const { store } = make();
		const id = productId("watermark-product");
		const opened = await store.upsert({ productId: id, price: eur(1000) }, idempotencyKey("seed"));
		const saved = await store.updateCommerceFields(
			{ productId: id, price: eur(2100) },
			idempotencyKey("save"),
			opened.updatedAt.toISOString(),
		);
		expect(saved.ok).toBe(true);
		const stale = await store.updateCommerceFields(
			{ productId: id, price: eur(2499) },
			idempotencyKey("other"),
			opened.updatedAt.toISOString(),
		);
		expect(stale).toMatchObject({ ok: false, reason: "stale" });
		expect((await store.getByProductId(id))?.price).toEqual(eur(2100));
		const replay = await store.updateCommerceFields(
			{ productId: id, price: eur(2100) },
			idempotencyKey("save"),
			opened.updatedAt.toISOString(),
		);
		expect(replay).toEqual(saved);
	});

	test("same-tick variant edits refuse the original draft after the first save", async () => {
		const { store } = make();
		const id = productId("watermark-variant");
		await store.upsert({ productId: id, price: eur(1000) }, idempotencyKey("seed"));
		const opened = await store.upsertVariant(
			{ productId: id, variantKey: "blue" },
			idempotencyKey("declare"),
		);
		const saved = await store.updateVariantFields(
			{ productId: id, variantKey: "blue", sku: sku("BLUE"), price: eur(2100) },
			idempotencyKey("save"),
			opened.updatedAt.toISOString(),
		);
		expect(saved.ok).toBe(true);
		const stale = await store.updateVariantFields(
			{ productId: id, variantKey: "blue", price: eur(2499) },
			idempotencyKey("other"),
			opened.updatedAt.toISOString(),
		);
		expect(stale).toMatchObject({ ok: false, reason: "stale" });
		expect(
			(await store.getManyVariantsByProductId([id])).get(id)?.find((v) => v.variantKey === "blue")
				?.price,
		).toEqual(eur(2100));
	});

	test("same-tick CMS product refresh invalidates an earlier merchant watermark", async () => {
		const { store } = make();
		const id = productId("watermark-product-cms");
		const opened = await store.upsert(
			{ productId: id, price: eur(1000), title: "Before" },
			idempotencyKey("seed"),
		);
		await store.upsert({ productId: id, title: "After" }, idempotencyKey("publish"));
		const stale = await store.updateCommerceFields(
			{ productId: id, price: eur(2499) },
			idempotencyKey("draft"),
			opened.updatedAt.toISOString(),
		);
		expect(stale).toMatchObject({ ok: false, reason: "stale" });
		expect((await store.getByProductId(id))?.price).toEqual(eur(1000));
	});

	test("same-tick CMS variant refresh invalidates an earlier merchant watermark", async () => {
		const { store } = make();
		const id = productId("watermark-variant-cms");
		await store.upsert({ productId: id, price: eur(1000) }, idempotencyKey("seed"));
		const opened = await store.upsertVariant(
			{ productId: id, variantKey: "blue", title: "Before" },
			idempotencyKey("declare"),
		);
		await store.upsertVariant(
			{ productId: id, variantKey: "blue", title: "After" },
			idempotencyKey("publish"),
		);
		const stale = await store.updateVariantFields(
			{ productId: id, variantKey: "blue", sku: sku("BLUE"), price: eur(2499) },
			idempotencyKey("draft"),
			opened.updatedAt.toISOString(),
		);
		expect(stale).toMatchObject({ ok: false, reason: "stale" });
		expect(
			(await store.getManyVariantsByProductId([id])).get(id)?.find((v) => v.variantKey === "blue")
				?.price,
		).toBeNull();
	});
}
