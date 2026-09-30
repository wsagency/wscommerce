import { createOrderFromCart, idempotencyKey, updateLine } from "@otta-sh/domain";
import { FixedClock } from "@otta-sh/domain/testing";
import { expect, test } from "vitest";
import {
	APPLIED_MOVEMENT_RING_SIZE,
	collectionOf,
	EmdashInventoryStore,
	INVENTORY_COLLECTION,
	INVENTORY_MOVEMENTS_COLLECTION,
	stockClaimId,
	uuidIdGen,
	type InventoryDoc,
	type MovementClaimDoc,
	type StorageAccess,
} from "../src/index.js";
import {
	failCall,
	InjectedCrashError,
	isUpdateWrite,
	isVersionedRead,
	onId,
	parkCall,
	parkRead,
	withCollection,
} from "./helpers/fault-injection.js";
import { makeOrderHarness } from "./order-harness.js";

const make = (access: StorageAccess) =>
	new EmdashInventoryStore({
		storage: access,
		idGen: uuidIdGen,
		clock: new FixedClock(new Date("2026-09-30T00:00:00Z")),
		sleep: async () => {},
		random: () => 0,
	});
const laterRestocks = async (store: EmdashInventoryStore, count = APPLIED_MOVEMENT_RING_SIZE) => {
	for (let i = 0; i < count; i++) {
		expect(await store.restock("BOOK", 1, idempotencyKey(`later-${String(i)}`))).toMatchObject({
			ok: true,
		});
	}
};
const crashedRestock = async (access: StorageAccess) => {
	const key = idempotencyKey("crashed-restock");
	const crash = failCall(access[INVENTORY_MOVEMENTS_COLLECTION]!, isUpdateWrite, {
		mode: "instead",
	});
	await expect(
		make(withCollection(access, INVENTORY_MOVEMENTS_COLLECTION, crash.collection)).restock(
			"BOOK",
			7,
			key,
		),
	).rejects.toThrow(InjectedCrashError);
	expect(await make(access).getOnHand("BOOK")).toBe(17);
	return key;
};

/** Shared unchanged by migrated SQLite/Postgres and the host's local D1 tier. */
export function inventoryCorrectnessContract(storage: () => StorageAccess): void {
	for (const newQty of [1, 3]) {
		test(`interrupted qty-2 checkout refuses a cart hold adjusted to ${String(newQty)}`, async () => {
			const access = storage();
			const h = makeOrderHarness(access);
			await h.seedPhysical({
				productId: "p-book",
				sku: "BOOK",
				priceCents: 500,
				title: "Book",
				onHand: 10,
			});
			const cartId = await h.cartWith([
				{ sku: "BOOK", productId: "p-book", qty: 2, kind: "physical" },
			]);
			const command = {
				cartId,
				idempotencyKey: idempotencyKey("frozen-checkout"),
				buyerRef: "buyer@example.invalid",
				paymentMethod: "stripe" as const,
			};
			const crash = failCall(access[INVENTORY_COLLECTION]!, isUpdateWrite, { mode: "instead" });
			const interrupted = makeOrderHarness(access, {
				share: h.shared,
				storageForInventory: withCollection(access, INVENTORY_COLLECTION, crash.collection),
			});
			await expect(createOrderFromCart(interrupted.createDeps, command)).rejects.toThrow(
				InjectedCrashError,
			);
			const pending = await h.store.getByIdempotencyKey(command.idempotencyKey);
			expect(pending?.state).toBe("pending");
			expect(pending?.lines[0]?.quantity).toBe(2);
			const cart = await h.cartStore.get(cartId);
			if (cart?.lines[0] === undefined) throw new Error("the cart must retain its line");
			const line = cart.lines[0];
			expect(cart.state).toBe("active");
			expect(
				await updateLine(h.cartDeps, cartId, line.lineId, newQty, idempotencyKey("edit-cart")),
			).toMatchObject({ ok: true });

			expect(await createOrderFromCart(h.createDeps, command)).toEqual({
				ok: false,
				reason: "RESERVATION_LOST",
			});
			expect(h.stripeGateway.intentCalls).toHaveLength(0);
			const final = await h.store.getByIdempotencyKey(command.idempotencyKey);
			expect(final?.state).toBe("expired");
			expect(final?.lines[0]?.quantity).toBe(2);
			expect(final?.totals.total).toBe(1000);
			// The aborted order cannot release a hold that still belongs to the cart.
			expect(await h.inventory.getOnHand("BOOK")).toBe(10 - newQty);
			expect(await h.reservationState(line.reservationId!)).toBe("held");
			expect((await h.cartStore.get(cartId))?.state).toBe("active");
			// Replaying the abandoned checkout also cannot hand out a payable intent.
			expect(await createOrderFromCart(h.createDeps, command)).toMatchObject({
				ok: true,
				order: { state: "expired" },
				intent: { clientAction: { kind: "none" } },
			});
			expect(h.stripeGateway.intentCalls).toHaveLength(0);
		});
	}

	test("adoption rechecks the frozen quantity when its first inventory CAS loses to a cart edit", async () => {
		const access = storage();
		const h = makeOrderHarness(access);
		await h.seedPhysical({
			productId: "p-book",
			sku: "BOOK",
			priceCents: 500,
			title: "Book",
			onHand: 10,
		});
		const cartId = await h.cartWith([
			{ sku: "BOOK", productId: "p-book", qty: 2, kind: "physical" },
		]);
		const cart = await h.cartStore.get(cartId);
		if (cart?.lines[0] === undefined) throw new Error("the cart must have a line");
		const line = cart.lines[0];
		const parked = parkCall(access[INVENTORY_COLLECTION]!, isUpdateWrite);
		const racing = makeOrderHarness(access, {
			share: h.shared,
			storageForInventory: withCollection(access, INVENTORY_COLLECTION, parked.collection),
		});
		const checkout = createOrderFromCart(racing.createDeps, {
			cartId,
			idempotencyKey: idempotencyKey("racing-checkout"),
			buyerRef: "buyer@example.invalid",
			paymentMethod: "stripe",
		});
		await parked.arrived;
		try {
			expect(
				await updateLine(h.cartDeps, cartId, line.lineId, 3, idempotencyKey("racing-edit")),
			).toMatchObject({ ok: true });
		} finally {
			parked.release();
		}
		expect(await checkout).toEqual({ ok: false, reason: "RESERVATION_LOST" });
		expect(h.stripeGateway.intentCalls).toHaveLength(0);
		expect(await h.inventory.getOnHand("BOOK")).toBe(7);
		expect(await h.reservationState(line.reservationId!)).toBe("held");
	});

	test("a restock interrupted before claim completion stays once-only after 256 actual later restocks", async () => {
		const access = storage();
		const clean = make(access);
		await clean.seedOnHand("BOOK", 10);
		const key = await crashedRestock(access);
		await laterRestocks(clean);
		expect(await clean.getOnHand("BOOK")).toBe(273);
		expect(await clean.restock("BOOK", 7, key)).toEqual({ ok: true, onHand: 17 });
		expect(await clean.getOnHand("BOOK")).toBe(273);
		const doc = await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get("BOOK");
		expect(doc?.appliedMovements).toHaveLength(APPLIED_MOVEMENT_RING_SIZE);
		expect(doc?.appliedMovements?.some((entry) => entry.key === key)).toBe(false);
		expect(
			(
				await collectionOf<MovementClaimDoc>(access, INVENTORY_MOVEMENTS_COLLECTION).get(
					stockClaimId(key),
				)
			)?.applied?.result,
		).toEqual({ ok: true, onHand: 17 });
	}, 60_000);

	test("an eviction cannot discard its witness if promoting the claim fails", async () => {
		const access = storage();
		const clean = make(access);
		await clean.seedOnHand("BOOK", 10);
		const key = await crashedRestock(access);
		await laterRestocks(clean, APPLIED_MOVEMENT_RING_SIZE - 1);
		const crash = failCall(
			access[INVENTORY_MOVEMENTS_COLLECTION]!,
			onId(stockClaimId(key), isUpdateWrite),
			{ mode: "instead" },
		);
		await expect(
			make(withCollection(access, INVENTORY_MOVEMENTS_COLLECTION, crash.collection)).restock(
				"BOOK",
				1,
				idempotencyKey("evict-first"),
			),
		).rejects.toThrow(InjectedCrashError);
		expect(await clean.getOnHand("BOOK")).toBe(272);
		const doc = await collectionOf<InventoryDoc>(access, INVENTORY_COLLECTION).get("BOOK");
		expect(doc?.appliedMovements?.some((entry) => entry.key === key)).toBe(true);
		expect(await clean.restock("BOOK", 1, idempotencyKey("evict-first"))).toEqual({
			ok: true,
			onHand: 273,
		});
		expect(await clean.restock("BOOK", 7, key)).toEqual({ ok: true, onHand: 17 });
		expect(await clean.getOnHand("BOOK")).toBe(273);
	}, 60_000);

	test("a delayed same-key caller rechecks the durable claim after its witness is evicted", async () => {
		const access = storage();
		const clean = make(access);
		await clean.seedOnHand("BOOK", 10);
		const key = await crashedRestock(access);
		const parked = parkRead(access[INVENTORY_COLLECTION]!, isVersionedRead);
		const late = make(withCollection(access, INVENTORY_COLLECTION, parked.collection)).restock(
			"BOOK",
			7,
			key,
		);
		await parked.arrived;
		try {
			await laterRestocks(clean);
		} finally {
			parked.release();
		}
		expect(await late).toEqual({ ok: true, onHand: 17 });
		expect(await clean.getOnHand("BOOK")).toBe(273);
	}, 60_000);

	test("a legacy unfinished movement with no witness requires reconciliation without moving stock", async () => {
		const access = storage();
		const clean = make(access);
		await clean.seedOnHand("BOOK", 273);
		const key = idempotencyKey("legacy-ambiguous");
		// A migrated old claim cannot distinguish crash-before-move from a
		// crash-after-move whose witness an older writer has already discarded.
		await collectionOf<MovementClaimDoc>(access, INVENTORY_MOVEMENTS_COLLECTION).compareAndSet(
			stockClaimId(key),
			null,
			{
				kind: "stock",
				sku: "BOOK",
				direction: "restock",
				qty: 7,
				createdAt: "2026-09-01T00:00:00Z",
			},
		);
		await expect(clean.restock("BOOK", 7, key)).rejects.toMatchObject({
			code: "INVENTORY_MOVEMENT_RECONCILIATION_REQUIRED",
		});
		expect(await clean.getOnHand("BOOK")).toBe(273);
	});

	test("an adjustment resolves its durable answer if promotion and eviction race its final witness read", async () => {
		const access = storage();
		const clean = make(access);
		await clean.seedOnHand("BOOK", 10);
		const held = await clean.reserve("BOOK", 2, idempotencyKey("answer-race-hold"));
		if (!held.ok) throw new Error("the seed hold must succeed");
		const key = idempotencyKey("answer-race-adjust");
		const crash = failCall(access[INVENTORY_MOVEMENTS_COLLECTION]!, isUpdateWrite, {
			mode: "instead",
		});
		await expect(
			make(withCollection(access, INVENTORY_MOVEMENTS_COLLECTION, crash.collection)).adjust(
				held.reservationId,
				3,
				key,
			),
		).rejects.toThrow(InjectedCrashError);
		const parked = parkRead(access[INVENTORY_COLLECTION]!, (call) => call.method === "get");
		const late = make(withCollection(access, INVENTORY_COLLECTION, parked.collection)).adjust(
			held.reservationId,
			3,
			key,
		);
		await parked.arrived;
		try {
			expect(await clean.adjust(held.reservationId, 4, idempotencyKey("newer-adjust"))).toEqual({
				ok: true,
				reservationId: held.reservationId,
			});
			await laterRestocks(clean);
		} finally {
			parked.release();
		}
		expect(await late).toEqual({ ok: true, reservationId: held.reservationId });
		expect(await clean.getOnHand("BOOK")).toBe(262);
	}, 60_000);

	test("reserve adjustment and stock movement witnesses keep their separate idempotency scopes", async () => {
		const access = storage();
		const clean = make(access);
		await clean.seedOnHand("BOOK", 10);
		const held = await clean.reserve("BOOK", 2, idempotencyKey("hold"));
		if (!held.ok) throw new Error("the seed hold must succeed");
		const key = idempotencyKey("shared-ledger-key");
		const crash = failCall(access[INVENTORY_MOVEMENTS_COLLECTION]!, isUpdateWrite, {
			mode: "instead",
		});
		await expect(
			make(withCollection(access, INVENTORY_MOVEMENTS_COLLECTION, crash.collection)).restock(
				"BOOK",
				7,
				key,
			),
		).rejects.toThrow(InjectedCrashError);
		expect(await clean.adjust(held.reservationId, 3, key)).toEqual({
			ok: true,
			reservationId: held.reservationId,
		});
		expect(await clean.restock("BOOK", 7, key)).toEqual({ ok: true, onHand: 15 });
		expect(await clean.adjust(held.reservationId, 3, key)).toEqual({
			ok: true,
			reservationId: held.reservationId,
		});
		expect(await clean.getOnHand("BOOK")).toBe(14);
	});
}
