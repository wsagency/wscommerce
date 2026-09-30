import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSqliteStorage } from "@otta-sh/store-emdash/testing";
import { collectionOf } from "@otta-sh/store-emdash";
import { InvoiceProviderLockStore } from "../src/index.js";

describe("serialized provider work on real storage", () => {
	let db: Awaited<ReturnType<typeof makeSqliteStorage>>;
	let locks: InvoiceProviderLockStore;
	let now = "2026-09-30T10:00:00.000Z";
	beforeAll(async () => {
		db = await makeSqliteStorage({ commerce_invoice_locks: {} });
		locks = new InvoiceProviderLockStore(collectionOf(db.storage, "commerce_invoice_locks"), {
			now: () => now,
		});
	});
	afterAll(async () => db.close());
	it("allows one provider request at a time, then observes minimum provider spacing", async () => {
		const claims = await Promise.all([locks.acquire("solo", "one"), locks.acquire("solo", "two")]);
		const won = claims.find(Boolean)!;
		expect(claims.filter(Boolean)).toHaveLength(1);
		await locks.release(won);
		expect(await locks.acquire("solo", "three")).toBeNull();
		now = "2026-09-30T10:00:10.000Z";
		expect(await locks.acquire("solo", "three")).not.toBeNull();
	});
	it("a stale worker cannot unlock a recovered e-racuni request lease", async () => {
		const first = await locks.acquire("e-racuni", "one");
		now = "2026-09-30T11:00:00.000Z";
		const recovered = await locks.acquire("e-racuni", "two");
		expect(recovered).not.toBeNull();
		await locks.release(first!);
		expect(await locks.acquire("e-racuni", "three")).toBeNull();
	});
});
