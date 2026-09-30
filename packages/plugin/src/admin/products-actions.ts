import { englishTranslate, type PluginTranslate } from "./localization.js";
/**
 * The Pricing & inventory WRITE path, as structured actions (ADR-0015 Decision 2).
 *
 * WHAT THIS REPLACES, and why the replacement was a rewrite rather than a
 * deletion. Until this module existed, the React console did not have a write
 * path of its own: it constructed the Block Kit Pricing & inventory page
 * handler, MINTED A `block_id` CARRIER so a browser payload would look like the
 * `form_submit` that handler read, forwarded the write through it, and then
 * SCRAPED the outcome back out of the rendered block tree — the banner off the
 * render, and an empty tree read as "nothing applied". The Block Kit renderer
 * was therefore load-bearing for the screen that replaced it. Each action below
 * is that write, re-expressed as a function returning a
 * {@link ProductsActionResult}: the applied/refused flag and the notice. No page
 * handler, no synthesized interaction, no carrier, no notice-scraping.
 *
 * THE FORM FIELDS ARE PLAIN ARGUMENTS NOW. Orders was entirely buttons, so its
 * console forwarded a click verbatim; four of this screen's five writes were
 * Block Kit FORMS whose context (`productId`, `expectedUpdatedAt`, `onHand`)
 * rode invisibly in a carrier rather than as visible fields. That mechanism
 * existed so an operator was never asked to "pick" a `productId` from a
 * single-option select — a rendering concern, and it retires with the renderer.
 * The console sends one flat payload and each action reads the keys it needs.
 *
 * THE STALE-WATERMARK REFUSAL IS CARRIED VERBATIM (ADR-0015 Decision 3). A
 * reworded check is a failed port, not a port. **DA-3a:** the `onHand` the
 * operator SAW is re-read against live truth before any stock moves and the
 * fresh write REFUSES on a mismatch — including the case where the re-read comes back
 * with NO inventory record at all, which gets its own sentence rather than being
 * reported as a count nobody took. An ABSENT or unparseable watermark refuses
 * fail-closed, with no re-read: see {@link parseOnHand}. The EDIT path carries
 * its own watermark, `expectedUpdatedAt`, guarded on the SAME terms — absent or
 * blank refuses here, before anything is sent — and re-checked by the service's
 * optimistic concurrency behind it. Both watermarks are guarded at THIS tier,
 * deliberately. The native client compares live stock after checking whether
 * this command already has a durable outcome; replay recovers that outcome.
 *
 * MONEY IS INTEGER MINOR UNITS. Nothing here parses money with a float:
 * {@link parsePriceMinorUnits} reads an exact decimal string into integer minor
 * units and refuses anything else, including a non-positive amount (the domain's
 * own `price > 0` invariant — a free product is "unpriced", not priced at 0).
 * A blank compare-at or unit cost is an explicit CLEAR (`null`), never a zero,
 * and a blank price is omitted from the wire rather than sent as one.
 *
 * STOCK COMMANDS HAVE ONE IDENTITY PER CONFIRMED INTENT (F-2a's 2026-09-30
 * amendment). A count may return to an earlier value, so content plus onHand
 * cannot distinguish two deliberate movements. Stock keys hash the resource
 * and a confirmed command UUID. Native claims bind SKU, operation and quantity;
 * retries retain the same identity and body. Edit keys remain content hashes
 * of the submitted wire plus `expectedUpdatedAt`.
 *
 * EVERY FIELD ARRIVING HERE IS UNTRUSTED operator-round-tripped input, exactly
 * as a decoded carrier was: closed sets are re-checked, watermarks are
 * re-checked for PRESENCE as well as for equality, and nothing is coerced.
 *
 * `products:remove-stock-review` IS GONE, LEFT UNPORTED AS UNREACHED SURFACE.
 * It was DA-3 state 1 → state 2 for the Block Kit screen: it staged a parsed
 * quantity server-side so a second render could draw a confirm button, because
 * a Block Kit form cannot show a dialog over the values just typed. React can,
 * so the React screen composes its own confirm and posts
 * {@link ACTION_REMOVE_STOCK} directly — which is why the console's gate has
 * excluded the review id since INC-21, and why nothing reachable has ever
 * called it. Its own checks went with it, and only one of them was a check the
 * reachable path lacks: the **DA-3c bound check** (`qty` against the on-hand
 * just re-read). That gap is not new and is not widened here — the console
 * could never reach that step — and an over-removal is refused by the SERVICE's
 * guarded decrement as `insufficient_stock`, which {@link removeStockNotice}
 * renders by name. Re-introducing a server-side two-step confirm means WRITING
 * that check against the shape of the new flow, not restoring it.
 */
import {
	ADD_STOCK_INVALID_QTY,
	NO_TAX_CLASS,
	PRODUCT_DELETED_SINCE_LOADED,
	PRODUCT_NOT_FOUND_TITLE,
	parseOnHandWatermark,
	parseStockQty as parseStockQtyShared,
	unitWord,
} from "@otta-sh/admin-presentation";
import {
	type AdminProductsSurface,
	type ProductEditWire,
	type RestockResult,
	type StockRemovalResult,
	type AdminVariantEditWire,
	type AdminVariantEditResult,
} from "./admin-products-surface.js";
import { parseMinorUnitsInput } from "./money-input.js";
import { readString, screenActions, type Notice } from "./scaffold/index.js";

/** This screen's namespaced action ids. */
const PRODUCTS_ACTIONS = screenActions("products");
/** The three split edit-form submits (F-5a) — one per sibling group. The split
 *  is legal here, and ONLY here among the console's PUT/PATCH forms, because
 *  `updateProduct` is a verified sparse PATCH at every layer: a field absent
 *  from the payload is omitted from the wire, never nulled. */
const ACTION_SAVE_IDENTITY = PRODUCTS_ACTIONS.custom("save-identity");
const ACTION_SAVE_PRICE = PRODUCTS_ACTIONS.custom("save-price");
const ACTION_SAVE_SHIPPING = PRODUCTS_ACTIONS.custom("save-shipping");
/** Restock stays DA-4: one-shot, no staging, no confirm. */
const ACTION_RESTOCK = PRODUCTS_ACTIONS.custom("restock");
/** The screen's ONE destructive act (DA-5's second exception: a removal is
 *  reversible only by a separate, forgettable manual operation). The surface
 *  confirms it for itself before this ever runs. */
const ACTION_REMOVE_STOCK = PRODUCTS_ACTIONS.custom("remove-stock");
const ACTION_SAVE_VARIANT = PRODUCTS_ACTIONS.custom("save-variant");
const ACTION_VARIANT_RESTOCK = PRODUCTS_ACTIONS.custom("variant-restock");
const ACTION_VARIANT_REMOVE = PRODUCTS_ACTIONS.custom("variant-remove-stock");

/**
 * What a write returns instead of a block tree.
 *
 * `ok: true` means the request was UNDERSTOOD and dispatched, not that anything
 * was written — a refusal is a `notice` with `variant: "error"`, which is the
 * shape the operator reads either way. `notice: null` is the quiet success the
 * Block Kit screen expressed as "re-render with no banner".
 *
 * THERE IS NO STAGED OR DRAFT MEMBER. Both existed for the retired
 * `remove-stock-review` step: a staged outcome carried the parsed quantity plus
 * the watermark into a server-rendered state 2, and a draft carried the
 * operator's raw text back into a server-rendered refusal. A surface that
 * composes its own confirm holds the operator's input the whole time and never
 * needs either handed back.
 */
export interface ProductsActionResult {
	readonly ok: true;
	readonly notice: Notice | null;
	/**
	 * WHICH FIELD THE OUTCOME IS ABOUT, when it is about exactly one — the only
	 * machine-readable member of this result. A refusal an operator can only fix
	 * by changing one input belongs BESIDE that input, and the surface cannot
	 * work that out from the sentence without re-deriving the copy, which is the
	 * one thing that must not happen twice. Absent (the common case) means the
	 * outcome is about the record as a whole and reports at the top of the
	 * screen, exactly as every outcome did before.
	 */
	readonly field?: "sku";
}

/** A write's payload: the flat string record the caller carried. Untrusted,
 *  exactly as a decoded Block Kit carrier was. */
export type ProductsActionPayload = Readonly<Record<string, string>>;

type ProductsAction = (
	client: AdminProductsSurface,
	payload: ProductsActionPayload,
	t: PluginTranslate,
) => Promise<ProductsActionResult>;

/** The refusal/unreadable-payload notice shared by every action on this screen
 *  whose payload fails to read (DA-3b): "nothing was changed", never a silent
 *  redirect and never a quiet success. */
function unreadableNotice(t: PluginTranslate): Notice {
	return {
		variant: "error",
		title: t("Not changed"),
		description: t(
			"That action could not be read — nothing was changed. Reload the product and try again.",
		),
	};
}

/** The one outcome constructor. A refusal is an `error`-variant notice, not a
 *  different shape — see {@link ProductsActionResult}. `field` is set only by an
 *  outcome about a single input, and omitted (not `undefined`) otherwise, so the
 *  wire carries the member only when it means something. */
const applied = (notice: Notice | null, field?: "sku"): ProductsActionResult =>
	field === undefined ? { ok: true, notice } : { ok: true, notice, field };

// -- money input parsing (NO float arithmetic — CLAUDE.md) --------------------
// The exact-integer-string parse lives in `./money-input.js`, SHARED with the
// Shipping console; the one behavioral fork (whether zero is a valid amount) is
// that module's explicit `allowZero` parameter. Prices are strictly positive
// (the domain's own `price > 0` invariant: a free product is "unpriced", not
// priced at 0).

/** Parse a merchant-entered decimal price into integer MINOR UNITS; null for
 *  any non-conforming or NON-POSITIVE input (never throws). Exported for its
 *  own unit test. */
export function parsePriceMinorUnits(input: string): number | null {
	return parseMinorUnitsInput(input, { allowZero: false });
}

/** Parse a merchant-entered stock quantity into a POSITIVE WHOLE number.
 *
 *  RE-EXPORTED from `@otta-sh/admin-presentation`: the React screen checks the
 *  quantity in the browser before it opens the remove-stock confirm, so a second
 *  parser here would let an operator read a dialog for a quantity the write then
 *  refuses. */
export const parseStockQty = parseStockQtyShared;

/** Read the `onHand` watermark out of an untrusted payload — a plain
 *  non-negative integer string, or `null` for anything else (B-2: money and
 *  count watermarks never cross as floats or negatives).
 *
 *  A MISSING WATERMARK IS AN UNREADABLE PAYLOAD, NOT A REASON TO SKIP DA-3a.
 *  Every stock control carries the count the operator saw, so an absent one has
 *  exactly two sources and refusing is right for both: a payload edited in
 *  devtools, or a browser tab rendered before the watermark existed — which is
 *  precisely the stale view DA-3a is for. Tolerating it would write with no
 *  staleness check at all. */
function parseOnHand(value: unknown): number | null {
	return parseOnHandWatermark(readString(value));
}

// -- the guarded commerce edit (split three ways, F-5a) -----------------------

type BuildEditResult = { ok: true; wire: ProductEditWire } | { ok: false; message: string };

/**
 * Assemble a validated {@link ProductEditWire} from ONE of the three split
 * forms' submitted values — whichever submitted, since a stateless submit only
 * ever carries the ONE form's own fields (the other two forms' keys are simply
 * absent from the payload, which this function already treats as "field not in
 * the form ⇒ preserve"). So this single function serves all three; no per-form
 * variant is needed.
 *
 * NO `title` AND NO `active`, STRUCTURALLY (G2 / ADR-0013). Both fields are
 * CMS-owned: `product_commerce.title` is a single-writer cache the sync upserts
 * on every publish, and `active` is the CMS's publish gate. `ProductEditWire`
 * has no member for either, so nothing below can put one on the wire however
 * hostile the payload is.
 *
 * Boundary validation (mirrors the service's zod + the domain's `price > 0`):
 * a bad price/currency/dimension is a per-field message, never an opaque save.
 */
function buildEditWire(
	t: PluginTranslate,
	values: Readonly<Record<string, unknown>>,
	expectedUpdatedAt: string,
): BuildEditResult {
	const wire: ProductEditWire = { expectedUpdatedAt };

	const mode = readString(values.priceTaxMode);
	if (mode !== undefined) {
		if (mode !== "exclusive" && mode !== "inclusive")
			return { ok: false, message: t("Choose whether prices include tax.") };
		wire.priceTaxMode = mode;
	}

	const sku = readString(values.sku)?.trim();
	if (sku !== undefined && sku.length > 0) wire.sku = sku;

	// The row currency (shared by price / compare-at / cost). Parsed ONCE so all
	// three money fields agree by construction.
	const currencyStr = readString(values.currency)?.trim().toUpperCase();
	const currency =
		currencyStr !== undefined && /^[A-Z]{3}$/.test(currencyStr) ? currencyStr : undefined;

	const priceStr = readString(values.price)?.trim();
	if (priceStr !== undefined && priceStr.length > 0) {
		const minorUnits = parsePriceMinorUnits(priceStr);
		if (minorUnits === null) {
			return {
				ok: false,
				message: t("Price must be a positive amount like 19.99 (up to two decimal places)."),
			};
		}
		if (currency === undefined) {
			return { ok: false, message: t("Currency must be a 3-letter ISO-4217 code like USD.") };
		}
		wire.price = { amount: minorUnits, currency };
	}

	// compare-at / unit cost: a BLANK entry clears the field (null); a value is
	// parsed to minor units and MUST carry the row currency.
	for (const [field, key] of [
		["compareAt", "compareAtPrice"],
		["unitCost", "unitCost"],
	] as const) {
		const raw = readString(values[field]);
		if (raw === undefined) continue; // field not in the form ⇒ preserve.
		const trimmed = raw.trim();
		if (trimmed.length === 0) {
			wire[key] = null; // explicit clear.
			continue;
		}
		const minorUnits = parsePriceMinorUnits(trimmed);
		if (minorUnits === null) {
			return {
				ok: false,
				message: t("{value} must be a positive amount like 29.99, or blank to clear.", {
					value: t(field === "compareAt" ? "Compare-at price" : "Unit cost"),
				}),
			};
		}
		const rowCurrency = currency ?? (wire.price !== undefined ? wire.price.currency : undefined);
		if (rowCurrency === undefined) {
			return {
				ok: false,
				message: t(
					"Set the product's price and currency before adding a compare-at price or unit cost.",
				),
			};
		}
		wire[key] = { amount: minorUnits, currency: rowCurrency };
	}

	const productKind = readString(values.productKind);
	if (productKind === "physical" || productKind === "digital") wire.productKind = productKind;

	// taxClass: the sentinel `NO_TAX_CLASS` (or a blank) clears it (null); any
	// other value is the chosen `TaxClass.id`.
	const taxClass = readString(values.taxClass);
	if (taxClass !== undefined) {
		const trimmed = taxClass.trim();
		wire.taxClass = trimmed.length === 0 || trimmed === NO_TAX_CLASS ? null : trimmed;
	}

	// weight/dims: blank ⇒ preserve (omit); present ⇒ a non-negative whole number.
	const numericFields = ["weightGrams", "lengthMm", "widthMm", "heightMm"] as const;
	for (const field of numericFields) {
		const raw = readString(values[field])?.trim();
		if (raw === undefined || raw.length === 0) continue;
		if (!/^\d+$/.test(raw)) {
			return {
				ok: false,
				message: t("{field} must be a non-negative whole number.", { field: field }),
			};
		}
		const n = Number.parseInt(raw, 10);
		if (!Number.isSafeInteger(n))
			return { ok: false, message: t("{field} is too large.", { field: field }) };
		wire[field] = n;
	}

	return { ok: true, wire };
}

/** Stable content-derived idempotency key for an edit save (F-2a, `Edit /
 *  save` row: "content hash of the submitted wire + `expectedUpdatedAt`").
 *  FNV-1a twice with independent seeds — dependency-free and sandbox-safe.
 *
 *  KNOWN FOOTGUN, INHERITED VERBATIM AND UNREACHABLE TODAY. `?? null`
 *  canonicalises an ABSENT field and an EXPLICIT `null` identically, so "clear
 *  the compare-at" and "leave the compare-at alone" hash to the same key. That
 *  cannot bite across the three forms this screen ships: each carries its
 *  clearable fields in every submit, so a form that can send `null` never omits
 *  the field, and one that omits it can never send `null`. A FOURTH form that
 *  submits a clearable field only sometimes would collide the two — and, under a
 *  once-only store, silently drop the second write. Whoever adds one must
 *  distinguish the cases here (an absent sentinel, not `null`) rather than
 *  assume this holds. */
function deriveEditIdempotencyKey(productId: string, wire: ProductEditWire): string {
	const canonical = JSON.stringify([
		productId,
		wire.expectedUpdatedAt,
		wire.sku ?? null,
		wire.price ?? null,
		wire.priceTaxMode ?? null,
		// No `title` component — the wire cannot carry one (ADR-0013).
		wire.taxClass ?? null,
		wire.compareAtPrice ?? null,
		wire.unitCost ?? null,
		wire.weightGrams ?? null,
		wire.lengthMm ?? null,
		wire.widthMm ?? null,
		wire.heightMm ?? null,
		wire.productKind ?? null,
	]);
	return `${productId}:edit:${fnv1a(canonical, 0x811c9dc5)}${fnv1a(canonical, 0x01234567)}`;
}

function fnv1a(input: string, seed: number): string {
	let hash = seed >>> 0;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(36);
}

/**
 * The three split forms' Save handler (F-5a — one handler serves all three
 * submits). Reads `productId`/`expectedUpdatedAt` off the payload, validates,
 * then PATCHes under the optimistic-concurrency watermark.
 *
 * THE WATERMARK IS MANDATORY, AND BLANK COUNTS AS ABSENT. An absent or empty
 * `expectedUpdatedAt` refuses before anything is sent, rather than PATCHing
 * without a usable one — a save with no watermark is a clobber of whatever
 * landed since the form was drawn. The empty case is refused HERE, on the same
 * terms {@link parseOnHand} refuses a blank on-hand, rather than being left to
 * the service: this screen has two watermarks, and two watermarks guarded
 * asymmetrically in one module is a trap even while the looser one happens to
 * fail closed downstream.
 */
const saveAction: ProductsAction = async (client, payload, t) => {
	const productId = readString(payload["productId"]);
	const expectedUpdatedAt = readString(payload["expectedUpdatedAt"]);
	if (
		productId === undefined ||
		expectedUpdatedAt === undefined ||
		expectedUpdatedAt.trim().length === 0
	) {
		return applied(unreadableNotice(t));
	}
	const built = buildEditWire(t, payload, expectedUpdatedAt);
	if (!built.ok) {
		return applied({
			variant: "error",
			title: t("Check the highlighted value"),
			description: built.message,
		});
	}
	const key = deriveEditIdempotencyKey(productId, built.wire);
	const result = await client.updateProduct(productId, built.wire, key);
	// The surface re-reads the product after every write, so a stale save leaves
	// the operator looking at the latest row — and the OTHER two split forms
	// remount with it, which is the sibling-discard hazard the screen warns about.
	return editOutcome(t, result);
};

/** A sku as it appears INSIDE a sentence: quoted, so a sku with a space or a
 *  trailing character is still copyable exactly; or a plain phrase when the
 *  service named none, because an empty pair of quotes reads as a sku called
 *  nothing. */
function namedSku(value: string | null, fallback: string): string {
	return value === null ? fallback : `"${value}"`;
}

/**
 * Map an edit outcome to what the operator reads — the notice, and the field it
 * belongs beside when the refusal is about exactly one.
 *
 * THIS IS THE ONLY PLACE THESE SENTENCES ARE WRITTEN. The service answers a
 * machine code plus operands (both skus, or the sku and how many holds); the
 * console renders what comes back verbatim. A second copy of any sentence on the
 * React side would be free to drift from this one, and the operator would have
 * no way to tell which of the two they were reading.
 */
function editOutcome(
	t: PluginTranslate,
	result: Awaited<ReturnType<AdminProductsSurface["updateProduct"]>>,
): ProductsActionResult {
	if (result.ok) {
		return applied({
			variant: "default",
			title: t("Saved"),
			description: t("The product's commerce fields were updated."),
		});
	}
	switch (result.reason) {
		case "stale":
			return applied({
				variant: "error",
				title: t("This product changed since you opened it"),
				description: t(
					"Your edit was NOT applied — the latest values are shown below. Re-apply your changes and save again.",
				),
			});
		case "currency_mismatch":
			return applied({
				variant: "error",
				title: t("Currency cannot be changed here"),
				description: t(
					"This product is priced in {value}. A price edit keeps the same currency; re-currencying a product is not supported on this page.",
					{ value: result.currency ?? t("its existing currency") },
				),
			});
		case "sku_taken":
			return applied({
				variant: "error",
				title: t("SKU already in use"),
				description: t(
					'SKU "{value}" is already used by another live product. Choose a different SKU.',
					{ value: result.sku ?? "" },
				),
			});
		// THE TWO RENAME REFUSALS. Both name the sku(s) so the sentence can be acted
		// on without opening a database, and both say NOTHING MOVED out loud: the
		// rename and the stock carry are one transaction, so a refusal leaves the
		// product on its old sku with its units where they were.
		case "sku_stock_conflict": {
			const from = namedSku(result.fromSku, t("this product's SKU"));
			const to = namedSku(result.toSku, t("the SKU you asked for"));
			return applied(
				{
					variant: "error",
					title: t("That SKU already has stock of its own"),
					// The sku is never the first word of a sentence: a fallback phrase
					// would arrive lower-case there, and a real sku would arrive with
					// whatever case the merchant typed. Both read as a typo.
					description: t(
						"Nothing was changed. Stock is never merged between SKUs, and {to} already has its own inventory record — so {from} was not renamed onto it. Rename to a SKU that has never held stock, or move the units under {to2} elsewhere first.",
						{ to: to, from: from, to2: to },
					),
				},
				"sku",
			);
		}
		case "sku_held_stock": {
			const held = namedSku(result.sku, t("this SKU"));
			// THE WHOLE SENTENCE AGREES WITH THE COUNT — subject, verb, and the
			// pronoun the advice refers back with. Assembling a pluralised noun and
			// leaving anything downstream of it fixed is how "1 live reservation still
			// hold units … once those have been paid" ships, and ONE is the commonest
			// count there is.
			const one = result.liveHolds === 1;
			const holds =
				result.liveHolds === null
					? t("live reservations still hold units of {held}", { held })
					: one
						? t("1 live reservation still holds units of {held}", { held })
						: t("{count} live reservations still hold units of {held}", {
								count: result.liveHolds,
								held,
							});
			const settled = one ? "it has" : "those have";
			return applied(
				{
					variant: "error",
					title: t("This SKU has reservations in flight"),
					description: t(
						"Nothing was changed: {holds}, and a reservation cannot follow a rename — its units would return to the old SKU when the cart or order finishes. Try the rename again once {settled} been paid, cancelled or expired, usually a few minutes.",
						{ holds: holds, settled: settled },
					),
				},
				"sku",
			);
		}
		case "invalid":
			return applied({
				variant: "error",
				title: t("Invalid value"),
				description: t(
					'The field "{value}" is out of range — price must be greater than zero and measurements must be non-negative whole numbers.',
					{ value: result.field ?? t("input") },
				),
			});
		case "not_found":
			return applied({
				variant: "error",
				title: t(PRODUCT_NOT_FOUND_TITLE),
				description: t(PRODUCT_DELETED_SINCE_LOADED),
			});
		default:
			return applied({
				variant: "error",
				title: t("Save failed"),
				description: t("The change could not be saved — retry in a moment."),
			});
	}
}

// -- merchant stock movements -------------------------------------------------

/** A confirmed intent owns one UUID. Native claims bind its SKU, operation and quantity. */
function stockCommandId(payload: ProductsActionPayload): string | null {
	const value = readString(payload["commandId"]);
	return value !== undefined &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
		? value.toLowerCase()
		: null;
}

function stockMovementKey(
	productId: string,
	variantKey: string | null,
	commandId: string,
): Promise<string> {
	return variantCommandKey(["stock-command", productId, variantKey, commandId]);
}

/**
 * The restock handler (DA-4 — one-shot, no staging, no confirm; restocking is
 * not the destructive act on this screen). Reads `productId`/`onHand` off the
 * payload, validates the qty, then POSTs under the derived key.
 */
const restockAction: ProductsAction = async (client, payload, t) => {
	const productId = readString(payload["productId"]);
	const commandId = stockCommandId(payload);
	if (productId === undefined || commandId === null) return applied(unreadableNotice(t));
	const onHand = parseOnHand(payload["onHand"]);
	if (onHand === null) return applied(unreadableNotice(t));
	const qty = parseStockQty(readString(payload["qty"]));
	if (qty === null) {
		return applied({
			variant: "error",
			title: t(ADD_STOCK_INVALID_QTY.title),
			description: t(ADD_STOCK_INVALID_QTY.description),
		});
	}
	const key = await stockMovementKey(productId, null, commandId);
	const result = await client.restock(productId, qty, key);
	return applied(restockNotice(t, result, qty));
};

/** A refusal on the stock-changed-since-render path (DA-3a).
 *
 *  `null` is its own sentence, never a count: the re-read came back with NO
 *  inventory record for the sku (INC-23 — the wire says that now instead of
 *  calling it zero), and "0 units are on hand now" would be a count nobody
 *  took. */
function stockChangedNotice(t: PluginTranslate, liveOnHand: number | null): Notice {
	if (liveOnHand === null) {
		return {
			variant: "error",
			title: t("Stock changed — nothing was removed"),
			description: t(
				"This SKU no longer has an inventory record, so there is no count to remove from. Reload the product to see it as it stands now.",
			),
		};
	}
	const unit = liveOnHand === 1 ? "unit is" : "units are";
	return {
		variant: "error",
		title: t("Stock changed — nothing was removed"),
		description: t(
			"Stock on hand changed since you started — {liveOnHand} {unit} on hand now. Re-enter the amount below to try again.",
			{ liveOnHand: liveOnHand, unit: unit, count: liveOnHand },
		),
	};
}

/**
 * The stock-moving write — the screen's one destructive act, which the surface
 * confirms for itself before this runs. It is the ONLY removal handler: the
 * `-review` step that used to precede it is not ported, so every guard a removal
 * gets is in this function or in the service behind it.
 *
 * DA-3a, MANDATORY: refuse a fresh movement on a live watermark mismatch.
 * Native recovery precedes that comparison for an already dispatched command.
 * Operator A opens a confirm for 5
 * units; operator B removes 12; A's dialog still says "Remove 5 units" against a
 * count that is already false.
 *
 * THE SERVICE APPLIES A GUARDED DECREMENT, so removing more than is on hand is
 * refused cleanly (never a negative and never an oversell) — the live re-read
 * here catches the common case before the write; that is the backstop, and it is
 * what the retired review step's client-side bound check has left behind.
 */
const removeStockAction: ProductsAction = async (client, payload, t) => {
	const productId = readString(payload["productId"]);
	const commandId = stockCommandId(payload);
	if (productId === undefined || commandId === null) return applied(unreadableNotice(t));
	const qty = parseStockQty(readString(payload["qty"]));
	const observedOnHand = parseOnHand(payload["onHand"]);
	// Both are re-checked for PRESENCE as well as for shape, and an absent
	// watermark refuses here with NO re-read (see `parseOnHand`). A bad QUANTITY
	// gets the same payload-level refusal rather than the field-level
	// `REMOVE_STOCK_INVALID_QTY` line: that copy belonged to the retired review
	// step's form, and the surface parses the quantity with the same shared
	// `parseStockQty` before it opens its confirm, so an unparseable one arriving
	// here means the payload was hand-made rather than that someone mistyped.
	if (qty === null || observedOnHand === null) return applied(unreadableNotice(t));
	const key = await stockMovementKey(productId, null, commandId);
	const result = await client.removeStock(productId, qty, key, observedOnHand);
	return applied(removeStockNotice(t, result, qty));
};

/** Map a restock outcome to the notice shown above the reloaded detail. */
function restockNotice(t: PluginTranslate, result: RestockResult, qty: number): Notice {
	if (result.ok) {
		return {
			variant: "default",
			title: t("Stock added"),
			description: t(
				"Added {qty} {value}. This movement recorded available stock of {onHand}; the refreshed product shows the current count.",
				{ qty: qty, value: unitWord(qty), onHand: result.onHand, count: qty },
			),
		};
	}
	return stockFailureNotice(t, result.reason);
}

/** Map a stock-removal outcome to the notice. */
function removeStockNotice(t: PluginTranslate, result: StockRemovalResult, qty: number): Notice {
	if (result.ok) {
		return {
			variant: "default",
			title: t("Stock removed"),
			description: t(
				"Removed {qty} {value}. This movement recorded available stock of {onHand}; the refreshed product shows the current count.",
				{ qty: qty, value: unitWord(qty), onHand: result.onHand, count: qty },
			),
		};
	}
	if (result.reason === "insufficient_stock") {
		return {
			variant: "error",
			title: t("Not enough stock to remove"),
			description: t("Only {onHand} {value} on hand — you cannot remove {qty}.", {
				onHand: result.onHand,
				value: unitWord(result.onHand),
				qty: qty,
				count: result.onHand,
			}),
		};
	}
	if (result.reason === "stock_changed") return stockChangedNotice(t, result.onHand);
	if (result.reason === "not_found")
		return {
			variant: "error",
			title: t("Nothing was removed"),
			description: t(
				"Stock could not be re-checked, so nothing was applied. Reload and try again.",
			),
		};
	return stockFailureNotice(t, result.reason);
}

/** Shared mapping for the non-success stock-movement reasons common to both
 *  restock and removal (no_sku / no_inventory_row / invalid / not_found /
 *  error). */
function stockFailureNotice(
	t: PluginTranslate,
	reason: "not_found" | "no_sku" | "no_inventory_row" | "invalid" | "error",
): Notice {
	switch (reason) {
		case "no_sku":
			return {
				variant: "error",
				title: t("No SKU set"),
				description: t(
					"This product has no SKU yet, so it has no stock to manage. Set a SKU on Identity above first.",
				),
			};
		case "no_inventory_row":
			// SHOULD NEVER HAPPEN since PR 1a: a stock record is created the moment
			// a product gets a SKU, on both write paths (this edit form and the
			// integrator PUT) — including a SKU rename, since the seed follows the
			// row's resulting sku. Kept as defence for the two cases still able to
			// reach it: a product priced BEFORE 1a (there is no backfill), and a
			// write that bypasses the use-case. Re-saving the SKU here fixes both.
			return {
				variant: "error",
				title: t("No stock record yet"),
				description: t(
					"This product has a SKU but no stock record, so there is nothing to add to or remove from. Re-save the SKU on Identity above to create one.",
				),
			};
		case "invalid":
			return {
				variant: "error",
				title: t("Invalid quantity"),
				description: t("The quantity must be a positive whole number."),
			};
		case "not_found":
			return {
				variant: "error",
				title: t(PRODUCT_NOT_FOUND_TITLE),
				description: t(PRODUCT_DELETED_SINCE_LOADED),
			};
		default:
			return {
				variant: "error",
				title: t("Stock change failed"),
				description: t("The change could not be saved — retry in a moment."),
			};
	}
}

// -- declared variants --------------------------------------------------------

/** A compact deterministic key includes identity, observed watermarks and all command fields. */
async function variantCommandKey(command: readonly unknown[]): Promise<string> {
	const bytes = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(JSON.stringify(command)),
	);
	return `admin-variant:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

const saveVariantAction: ProductsAction = async (client, payload, t) => {
	const productId = readString(payload["productId"]);
	const variantKey = readString(payload["variantKey"]);
	const expectedUpdatedAt = readString(payload["expectedUpdatedAt"]);
	if (!productId || !variantKey || !expectedUpdatedAt || client.updateVariant === undefined)
		return applied(unreadableNotice(t));
	const sku = readString(payload["sku"])?.trim();
	const rawPrice = readString(payload["priceCents"])?.trim();
	const currency = readString(payload["currency"])?.trim().toUpperCase();
	const amount = rawPrice ? parseOnHand(rawPrice) : null;
	if (
		(rawPrice && (amount === null || amount <= 0 || !currency || !/^[A-Z]{3}$/.test(currency))) ||
		(!sku && !rawPrice)
	)
		return applied({
			variant: "error",
			title: t("Variant not saved"),
			description: t(
				"Enter a SKU or a positive whole price in minor units with its 3-letter currency. Leave an unset price blank.",
			),
		});
	const body: AdminVariantEditWire = {
		expectedUpdatedAt,
		...(sku ? { sku } : {}),
		...(rawPrice && amount !== null && currency ? { price: { amount, currency } } : {}),
	};
	const result = await client.updateVariant(
		productId,
		variantKey,
		body,
		await variantCommandKey(["edit", productId, variantKey, body]),
	);
	return applied(variantEditNotice(t, result));
};

function variantEditNotice(t: PluginTranslate, result: AdminVariantEditResult): Notice {
	if (result.ok)
		return {
			variant: "default",
			title: t("Variant saved"),
			description: t(
				"The declared variant's SKU and price were saved. Its CMS key and name are unchanged.",
			),
		};
	const messages: Record<Extract<AdminVariantEditResult, { ok: false }>["reason"], string> = {
		VARIANT_NOT_FOUND:
			"This variant is missing, orphaned, or belongs to another product. Restore its declaration in the CMS before editing it.",
		STALE_EDIT:
			"This variant changed after you opened it. Reload and review its current values before saving again.",
		CURRENCY_MISMATCH:
			"The variant currency must match its existing currency and the product currency.",
		INVALID_FIELD: "Check the SKU, positive integer price and currency before saving again.",
		SKU_TAKEN: "That SKU already belongs to another sellable product or variant.",
		SKU_STOCK_CONFLICT:
			"The target SKU already has stock. Choose an unused SKU; stock is never merged during a rename.",
		SKU_HELD_STOCK:
			"This SKU has held stock in live carts or orders. Wait for those holds to finish before renaming it.",
	};
	return {
		variant: "error",
		title: t("Variant not saved"),
		description: t(messages[result.reason]),
	};
}

function variantStockAction(direction: "restock" | "removal"): ProductsAction {
	return async (client, payload, t) => {
		const productId = readString(payload["productId"]);
		const variantKey = readString(payload["variantKey"]);
		const expectedUpdatedAt = readString(payload["expectedUpdatedAt"]);
		const commandId = stockCommandId(payload);
		const qty = parseStockQty(readString(payload["qty"]) ?? "");
		const onHand = parseOnHand(payload["onHand"]);
		if (
			!productId ||
			!variantKey ||
			!expectedUpdatedAt ||
			commandId === null ||
			qty === null ||
			onHand === null ||
			client.moveVariantStock === undefined
		)
			return applied(unreadableNotice(t));
		const body = { direction, qty, onHand, expectedUpdatedAt };
		const result = await client.moveVariantStock(
			productId,
			variantKey,
			body,
			await stockMovementKey(productId, variantKey, commandId),
		);
		if (result.ok)
			return applied({
				variant: "default",
				title: direction === "restock" ? t("Variant stock added") : t("Variant stock removed"),
				description: t(
					"This movement recorded available stock of {onHand}. The refreshed variant shows the current count. Existing held units are preserved.",
					{ onHand: result.onHand },
				),
			});
		return applied({
			variant: "error",
			title: t("Variant stock not changed"),
			description:
				result.reason === "stale" || result.reason === "stock_changed"
					? t(
							"The variant or available count changed. Reload and review before submitting another movement.",
						)
					: result.reason === "command_reused"
						? t(
								"That command identity already belongs to another SKU, quantity or stock operation. Retry the original command unchanged or start a new confirmed movement.",
							)
						: result.reason === "insufficient_stock"
							? t(
									"Only available units can be removed. The requested quantity exceeds available stock; held units are protected.",
								)
							: t(
									"A live declared variant with a SKU and stock record is required. Missing, orphaned and deleted variants cannot be changed here.",
								),
		});
	};
}

// -- dispatch -----------------------------------------------------------------

/**
 * Every Pricing & inventory write, keyed by the action id that names it.
 *
 * ONE HANDLER SERVES THE THREE SAVES, exactly as the Block Kit screen's did: a
 * submit carries only its own form's fields, and an absent key means "preserve"
 * rather than "clear", so the split is a rendering arrangement rather than three
 * different writes.
 *
 * An id here that NO control can send is dead surface, which is why
 * `products:remove-stock-review` is absent: the React screen composes its own
 * confirm and has never had a staged step to render into.
 */
const PRODUCTS_ACTIONS_BY_ID: Readonly<Record<string, ProductsAction>> = {
	[ACTION_SAVE_IDENTITY]: saveAction,
	[ACTION_SAVE_PRICE]: saveAction,
	[ACTION_SAVE_SHIPPING]: saveAction,
	[ACTION_RESTOCK]: restockAction,
	[ACTION_REMOVE_STOCK]: removeStockAction,
	[ACTION_SAVE_VARIANT]: saveVariantAction,
	[ACTION_VARIANT_RESTOCK]: variantStockAction("restock"),
	[ACTION_VARIANT_REMOVE]: variantStockAction("removal"),
};

/**
 * The action ids this screen recognizes (MOD-2), read straight off the dispatch
 * table so the gate and the table cannot disagree about what exists.
 */
export const PRODUCTS_ACTION_IDS: ReadonlySet<string> = new Set(
	Object.keys(PRODUCTS_ACTIONS_BY_ID),
);

/**
 * Run one Pricing & inventory write.
 *
 * `undefined` means the id is not one this screen offers — a stale tab after a
 * deploy that renamed one, or a caller bug. It is deliberately NOT an outcome:
 * reporting an unknown action as a quiet success is how a stock movement that
 * never happened gets rendered as done.
 */
export async function dispatchProductsAction(
	actionId: string,
	payload: ProductsActionPayload,
	client: AdminProductsSurface,
	t: PluginTranslate = englishTranslate,
): Promise<ProductsActionResult | undefined> {
	const action = PRODUCTS_ACTIONS_BY_ID[actionId];
	if (action === undefined) return undefined;
	return await action(client, payload, t);
}
