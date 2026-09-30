import { idempotencyKey, productId, sku } from "@otta-sh/domain";
import {
	EmdashInventoryStore,
	EmdashProductCommerceStore,
	systemClock,
	uuidIdGen,
} from "@otta-sh/store-emdash";
import { afterAll, beforeAll, expect, test } from "vitest";
import { loadPluginInSandbox, type SandboxHandle } from "./sandbox/harness.js";
import { storageBridge } from "./sandbox/storage-bridge.js";

let boot: SandboxHandle;
let products: EmdashProductCommerceStore;
let inventory: EmdashInventoryStore;
let seq = 0;
beforeAll(async () => {
	const { storage } = await storageBridge();
	products = new EmdashProductCommerceStore({ storage, clock: systemClock });
	inventory = new EmdashInventoryStore({ storage, clock: systemClock, idGen: uuidIdGen });
	boot = await loadPluginInSandbox({ allowedHosts: [], storage: true });
}, 300_000);
afterAll(async () => {
	await boot?.close();
});

async function seed() {
	const id = `variant-admin-${++seq}`;
	await products.upsert(
		{ productId: productId(id), title: "Parent", productKind: "physical" },
		idempotencyKey(`seed:${id}`),
	);
	const variant = await products.upsertVariant(
		{
			productId: productId(id),
			variantKey: "blue",
			title: "Blue / large",
			contentUpdatedAt: "2026-01-01T00:00:00.000Z",
		},
		idempotencyKey(`declare:${id}`),
	);
	return { productId: id, variantKey: "blue", expectedUpdatedAt: variant.updatedAt.toISOString() };
}
async function act(action_id: string, value: Record<string, string>) {
	const command = ["products:variant-restock", "products:variant-remove-stock"].includes(action_id)
		? { commandId: crypto.randomUUID(), ...value }
		: value;
	const result = await boot.invokeRoute("admin", {
		type: "otta_console_act",
		action_id,
		value: command,
	});
	if (!("result" in result)) throw new Error(result.error);
	return result.result as {
		ok: boolean;
		notice?: { variant: string; title: string; description: string };
	};
}
async function variants(id: string) {
	return products.listVariants(productId(id));
}

test("a declared variant is priced through the private admin action; replay and stale edit preserve CMS key/name", async () => {
	const original = await seed();
	const input = {
		...original,
		sku: `${original.productId}-BLUE`,
		priceCents: "2500",
		currency: "EUR",
		title: "Hostile CMS name",
		active: "true",
	};
	expect((await act("products:save-variant", input)).notice?.title).toBe("Variant saved");
	expect((await act("products:save-variant", input)).notice?.title).toBe("Variant saved");
	expect((await variants(original.productId))[0]).toMatchObject({
		variantKey: "blue",
		title: "Blue / large",
		sku: input.sku,
		price: { amount: 2500, currency: "EUR" },
		onHand: 0,
	});
	expect(
		(await act("products:save-variant", { ...input, priceCents: "2600" })).notice?.variant,
	).toBe("error");
	expect((await variants(original.productId))[0]?.price?.amount).toBe(2500);
	const saved = (await variants(original.productId))[0]!;
	expect(
		(
			await act("products:save-variant", {
				...input,
				expectedUpdatedAt: saved.updatedAt.toISOString(),
				currency: "USD",
			})
		).notice?.variant,
	).toBe("error");
	expect((await variants(original.productId))[0]?.price?.currency).toBe("EUR");
});

test("stock controls preserve held units, refuse stale counts and cannot rename a held variant SKU", async () => {
	const seeded = await seed();
	const variantSku = `${seeded.productId}-BLUE`;
	await act("products:save-variant", {
		...seeded,
		sku: variantSku,
		priceCents: "2500",
		currency: "EUR",
	});
	await inventory.restock(variantSku, 5, idempotencyKey(`stock:${variantSku}`));
	const held = await inventory.reserve(variantSku, 2, idempotencyKey(`hold:${variantSku}`));
	if (!held.ok) throw new Error(held.reason);
	const row = (await variants(seeded.productId))[0]!;
	const movement = {
		commandId: crypto.randomUUID(),
		...seeded,
		expectedUpdatedAt: row.updatedAt.toISOString(),
		onHand: "3",
		qty: "4",
		sku: "FOREIGN",
	};
	expect((await act("products:variant-restock", movement)).notice?.variant).not.toBe("error");
	await act("products:variant-restock", movement);
	expect(await inventory.getOnHand(variantSku)).toBe(7);
	expect(await inventory.findOnHand(sku("FOREIGN"))).toBeNull();
	expect(
		(
			await act("products:variant-remove-stock", {
				...movement,
				commandId: crypto.randomUUID(),
				qty: "1",
			})
		).notice?.variant,
	).toBe("error");
	expect(
		(
			await act("products:variant-remove-stock", {
				...movement,
				commandId: crypto.randomUUID(),
				onHand: "7",
				qty: "8",
			})
		).notice?.description,
	).toContain("held units are protected");
	expect(
		(
			await act("products:variant-remove-stock", {
				...movement,
				commandId: crypto.randomUUID(),
				onHand: "7",
				qty: "1",
			})
		).notice?.variant,
	).not.toBe("error");
	expect(await inventory.getOnHand(variantSku)).toBe(6);
	expect(
		(
			await act("products:save-variant", {
				...seeded,
				expectedUpdatedAt: row.updatedAt.toISOString(),
				sku: `${variantSku}-NEW`,
			})
		).notice?.description,
	).toContain("held");
	expect(await inventory.getOnHand(variantSku)).toBe(6);
	await inventory.release(held.reservationId);
	expect(await inventory.getOnHand(variantSku)).toBe(8);
});

test("variant add-remove-add uses separate confirmed commands and retries recover the original movement", async () => {
	const seeded = await seed();
	const variantSku = `${seeded.productId}-BLUE`;
	await act("products:save-variant", {
		...seeded,
		sku: variantSku,
		priceCents: "2500",
		currency: "EUR",
	});
	await inventory.restock(variantSku, 4, idempotencyKey(`stock:${variantSku}`));
	const row = (await variants(seeded.productId))[0]!;
	const first = {
		...seeded,
		expectedUpdatedAt: row.updatedAt.toISOString(),
		onHand: "4",
		qty: "3",
		commandId: crypto.randomUUID(),
	};
	expect((await act("products:variant-restock", first)).notice?.variant).toBe("default");
	expect(await inventory.getOnHand(variantSku)).toBe(7);
	const remove = { ...first, onHand: "7", commandId: crypto.randomUUID() };
	expect((await act("products:variant-remove-stock", remove)).notice?.variant).toBe("default");
	expect(await inventory.getOnHand(variantSku)).toBe(4);
	// A fresh identical movement is distinct even after stock returns to its old value.
	const next = { ...first, commandId: crypto.randomUUID() };
	expect((await act("products:variant-restock", next)).notice?.variant).toBe("default");
	expect(await inventory.getOnHand(variantSku)).toBe(7);
	// Retrying the exact command succeeds despite its old count, without adding again.
	expect((await act("products:variant-restock", next)).notice?.variant).toBe("default");
	expect(await inventory.getOnHand(variantSku)).toBe(7);
	// A command's quantity and direction cannot be changed during retry.
	expect(
		(await act("products:variant-restock", { ...next, onHand: "7", qty: "1" })).notice?.variant,
	).toBe("error");
	expect(
		(await act("products:variant-remove-stock", { ...next, onHand: "7" })).notice?.variant,
	).toBe("error");
	expect(await inventory.getOnHand(variantSku)).toBe(7);
	expect(
		(await act("products:variant-restock", { ...next, onHand: "7", commandId: "" })).notice
			?.variant,
	).toBe("error");
	expect(await inventory.getOnHand(variantSku)).toBe(7);
});

test("orphan rows remain visible with retained stock but edits and foreign-parent commands are refused", async () => {
	const seeded = await seed();
	const variantSku = `${seeded.productId}-BLUE`;
	await act("products:save-variant", {
		...seeded,
		sku: variantSku,
		priceCents: "2500",
		currency: "EUR",
	});
	await inventory.restock(variantSku, 3, idempotencyKey(`stock:${variantSku}`));
	await products.deactivateVariant(
		productId(seeded.productId),
		"blue",
		idempotencyKey(`orphan:${variantSku}`),
		"2099-01-01T00:00:00.000Z",
	);
	const row = (await variants(seeded.productId))[0]!;
	const detail = await boot.invokeRoute("admin", {
		type: "otta_console_read",
		resource: "products.detail",
		productId: seeded.productId,
	});
	if (!("result" in detail)) throw new Error(detail.error);
	expect(detail.result).toMatchObject({
		product: {
			variants: [{ variantKey: "blue", orphanedAt: row.orphanedAt?.toISOString(), onHand: 3 }],
		},
	});
	const request = {
		...seeded,
		expectedUpdatedAt: row.updatedAt.toISOString(),
		sku: variantSku,
		priceCents: "2700",
		currency: "EUR",
		onHand: "3",
		qty: "1",
	};
	for (const action of [
		"products:save-variant",
		"products:variant-restock",
		"products:variant-remove-stock",
	])
		expect((await act(action, request)).notice?.variant).toBe("error");
	const other = await seed();
	// Matching keys on different parents remain separate rows; a stale foreign revision cannot retarget this row.
	expect(
		(
			await act("products:save-variant", {
				...request,
				productId: other.productId,
				expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
			})
		).notice?.variant,
	).toBe("error");
	expect(
		(
			await act("products:variant-restock", {
				...request,
				productId: other.productId,
				variantKey: "not-declared",
			})
		).notice?.variant,
	).toBe("error");
	expect((await variants(other.productId))[0]?.sku).toBeNull();
	expect(await inventory.getOnHand(variantSku)).toBe(3);
});

test("variant writes require watermarks and have no public action route", async () => {
	const seeded = await seed();
	expect(
		(
			await act("products:save-variant", {
				...seeded,
				expectedUpdatedAt: "",
				sku: "A",
				priceCents: "1",
				currency: "EUR",
			})
		).notice?.variant,
	).toBe("error");
	expect(
		(
			await act("products:save-variant", {
				...seeded,
				sku: "A",
				priceCents: "1.5",
				currency: "EUR",
			})
		).notice?.variant,
	).toBe("error");
	const publicAttempt = await boot.invokeRoute("products:save-variant", {
		...seeded,
		sku: "A",
		priceCents: "1",
		currency: "EUR",
	});
	expect(publicAttempt).toHaveProperty("error");
	expect((await variants(seeded.productId))[0]?.sku).toBeNull();
});
