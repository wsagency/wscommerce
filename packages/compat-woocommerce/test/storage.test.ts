import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { makeSqliteStorage } from "@otta-sh/store-emdash/testing";
import { collectionOf } from "@otta-sh/store-emdash";
import { EmDashWooExternalIdStore, EmDashWooMetadataStore } from "../src/index.js";

type Db = Awaited<ReturnType<typeof makeSqliteStorage>>;
let db: Db;
beforeAll(async () => {
	db = await makeSqliteStorage({ woo_ids: {}, woo_metadata: {} });
});
afterAll(async () => {
	await db.close();
});
beforeEach(async () => {
	await db.reset();
});
describe("persistent Woo identities and metadata over migrated SQLite", () => {
	it("keeps numeric IDs through reconstruction, lookup and concurrent replay", async () => {
		const ids = new EmDashWooExternalIdStore(collectionOf(db.storage, "woo_ids"));
		const issued = await Promise.all(
			Array.from({ length: 8 }, () => ids.getOrAssign("order", "native-order")),
		);
		expect(new Set(issued).size).toBe(1);
		expect(issued[0]).toBeGreaterThan(0);
		const again = new EmDashWooExternalIdStore(collectionOf(db.storage, "woo_ids"));
		expect(await again.getOrAssign("order", "native-order")).toBe(issued[0]);
		expect(await again.lookup("order", issued[0]!)).toBe("native-order");
		expect(await again.lookup("product", issued[0]!)).toBeNull();
		const other = await again.getOrAssign("order", "other-order");
		expect(other).not.toBe(issued[0]);
	});
	it("does not collide across kinds or prototype-shaped native IDs", async () => {
		const ids = new EmDashWooExternalIdStore(collectionOf(db.storage, "woo_ids"));
		const issued = await Promise.all([
			ids.getOrAssign("product", "__proto__"),
			ids.getOrAssign("variation", "__proto__"),
			ids.getOrAssign("order", "constructor"),
		]);
		expect(new Set(issued).size).toBe(3);
		expect(await ids.lookup("product", issued[0]!)).toBe("__proto__");
	});
	it("persists metadata IDs and full idempotency witnesses without duplicating annotations", async () => {
		const meta = new EmDashWooMetadataStore(collectionOf(db.storage, "woo_metadata"));
		const first = await meta.patch(
			"order:1",
			[{ key: "invoice_number", value: "2026-001" }],
			"erp:1",
		);
		expect(first).toHaveLength(1);
		expect(first[0]!.id).toBeGreaterThan(0);
		const again = new EmDashWooMetadataStore(collectionOf(db.storage, "woo_metadata"));
		expect(
			await again.patch("order:1", [{ key: "invoice_number", value: "2026-001" }], "erp:1"),
		).toEqual(first);
		const updated = await again.patch(
			"order:1",
			[{ id: first[0]!.id, key: "invoice_number", value: "2026-002" }],
			"erp:2",
		);
		expect(updated).toEqual([{ ...first[0], value: "2026-002" }]);
		await expect(
			again.patch("order:1", [{ key: "invoice_number", value: "different" }], "erp:1"),
		).rejects.toMatchObject({ code: "woocommerce_rest_idempotency_conflict" });
		expect(await again.get("order:1")).toEqual(updated);
	});
	it("rejects the complete metadata batch on a stale ID without a partial write", async () => {
		const meta = new EmDashWooMetadataStore(collectionOf(db.storage, "woo_metadata"));
		await meta.patch("order:1", [{ key: "a", value: "old" }], "key:1");
		await expect(
			meta.patch(
				"order:1",
				[
					{ key: "a", value: "new" },
					{ id: 999, key: "b", value: 2 },
				],
				"key:2",
			),
		).rejects.toMatchObject({ status: 409 });
		expect(await meta.get("order:1")).toEqual([{ id: 1, key: "a", value: "old" }]);
	});
});

describe("durable registry recovery and finite metadata capacity", () => {
	it("repairs reverse mapping after an interrupted completion without reassigning the ID", async () => {
		const collection = collectionOf<import("../src/index.js").WooIdRegistryDocument>(
			db.storage,
			"woo_ids",
		);
		const ids = new EmDashWooExternalIdStore(collection);
		const id = await ids.getOrAssign("order", "native-recover");
		expect(await collection.delete(`reverse:${id}`)).toBe(true);
		const reconstructed = new EmDashWooExternalIdStore(collection);
		expect(await reconstructed.getOrAssign("order", "native-recover")).toBe(id);
		expect(await reconstructed.lookup("order", id)).toBe("native-recover");
	});
	it("stops metadata writes at capacity while preserving old replay witnesses", async () => {
		const meta = new EmDashWooMetadataStore(collectionOf(db.storage, "woo_metadata"), {
			maxReplays: 2,
			maxBytes: 4096,
		});
		const first = await meta.patch("order:1", [{ key: "a", value: 1 }], "key:1");
		await meta.patch("order:1", [{ key: "a", value: 2 }], "key:2");
		await expect(meta.patch("order:1", [{ key: "a", value: 3 }], "key:3")).rejects.toMatchObject({
			code: "woocommerce_rest_metadata_capacity",
		});
		expect(await meta.patch("order:1", [{ key: "a", value: 1 }], "key:1")).toEqual(first);
		expect(await meta.get("order:1")).toEqual([{ id: 1, key: "a", value: 2 }]);
	});
});
