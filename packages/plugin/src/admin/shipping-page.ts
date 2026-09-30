import { moneyLocale, requestTranslator, type PluginTranslate } from "./localization.js";
import { COUNTRY_CODES, parseZoneRegions, validateZoneRegionsInput } from "@otta-sh/domain";
import { formatMoney } from "../presentation/format-money.js";
import { cents as toCents, currency as toCurrency } from "../presentation/money.js";
import type {
	AccordionBlock,
	ActionsBlock,
	AdminPageConfig,
	BannerBlock,
	Block,
	ButtonElement,
	FieldsBlock,
	FormBlock,
	RouteHandler,
	SelectOption,
	TableBlock,
} from "../types.js";
import { makeAdminClients } from "./make-admin-clients.js";
import {
	type AdminRulesSurface,
	type RulesCasUpdateResult,
	type RulesCreateResult,
	type RulesDeleteResult,
	type RulesUpdateResult,
	type ShippingMethodWire,
	type ShippingRateWire,
	type ShippingZoneWire,
} from "./admin-rules-surface.js";
import { formatMinorUnitsInput, parseMinorUnitsInput } from "./money-input.js";
import {
	asRecord,
	backButton,
	carriedForm,
	createListDetailHandler,
	customAction,
	decodePath,
	emptyState,
	encodePath,
	failClosedResponse,
	filterSummary,
	listLevel,
	noticeBanner,
	PATH_FIELD,
	readString,
	screenActions,
	type ListDetailInput,
	type NavPath,
	type Notice,
	type ScreenActions,
} from "./scaffold/index.js";

/**
 * The admin Shipping console page (design spec §12.4 — the deepest of the
 * seven admin screens, drilling zones → methods → rates). Built on the shared
 * list/detail scaffold (`./scaffold`) and `AdminRulesSurface`, both already
 * proven by `orders-page.ts`/`tax-page.ts` — this is the FIRST production
 * screen to actually reach depth 3 (the scaffold's own synthetic geo fixture,
 * `scaffold/testing/geo-screen.ts`, is what proved the N-level nav core works
 * before any real screen needed it).
 *
 * L-9: the zones and methods levels render as a per-row `accordion` list
 * (edit form + "View …" drill-in button + delete, all collapsed) ONLY when
 * the fetched page is complete (`nextCursor === null`) AND `items.length <=
 * 25` — otherwise a `table` + a standalone `combobox` drill-in form (L-7),
 * with editing moving to the next level's list. Both branches ship; the
 * sandbox suite asserts the branch at 25 rows and at 26. The zones/methods
 * registries have no real cursor pagination (`AdminRulesSurface.listZones`/
 * `listMethods` return everything in one GET), so in practice `nextCursor` is
 * always `null` and the branch is decided by row count alone.
 *
 * L-9a: the RATES level is EXEMPT. A rate's identity is `(methodId,
 * currency)` and the service exposes only a single-currency `GET
 * .../rates?currency=` read — a 0-or-1-row lookup, never a true list — so one
 * accordion wrapping one row would cost a click and save nothing. It keeps
 * its existing inline `fields` + edit-or-create form shape.
 *
 * REGIONS ARE ISO CODES (ADR-0021). Checkout DERIVES the buyer's shipping/tax
 * zone from their address by matching these codes — an ISO 3166-1 country
 * (`US`) or an ISO 3166-2 subdivision (`US-CA`), exactly, the most specific
 * zone winning. So the console refuses anything else on write (naming each bad
 * token, with a hint), refuses a code another zone already lists (an overlap
 * would make the match ambiguous), labels the stored tokens that can never
 * match (zones written before the rule), and warns about such zones on this
 * landing screen and on the zone's own methods screen. How matching works does
 * not fit the zones level's ≤140-char page context, so it lives as one
 * `context` line on the "New shipping zone" create screen (F-8) — the one place
 * an operator is about to type into the field it explains.
 *
 * NO METHOD/RATE COUNT ON A ZONE OR METHOD LABEL (D-6): `ShippingZoneWire` is
 * `{id, name, regions}` and `ShippingMethodWire` carries no rate count either
 * — neither is on the wire, and fetching it per row would cost up to 200
 * extra `ctx.http` round trips per render at this level's `limit: 200`. Filed
 * as a listing gap (§12.4 shows a bare-noun zone label for exactly this
 * reason already); the PER-ROW DELETE-vs-DA-7 conditional the listing also
 * shows has the same defect and is NOT built for the same reason — see the
 * module's PR body for the full disclosure. Delete stays unconditional (DA-2)
 * and the existing "in_use" conflict is reported by the post-attempt banner,
 * exactly as it already was before this layout pass.
 *
 * THE PRICE IS THE ONE EXCEPTION TO THAT, AND IT IS PAID FOR DELIBERATELY.
 * A method's price is not on `ShippingMethodWire` either, and the service
 * exposes no cross-method rates read — only `GET
 * /admin/shipping/methods/:id/rates?currency=`, a 0-or-1-row lookup. So the
 * methods list used to name a method and its type and never the number the
 * operator came for: you could not see what express costs without drilling two
 * levels down. Unlike a rate COUNT (which nothing can price against), the
 * amount IS the screen's subject, so it is fetched — bounded and honestly:
 *
 *   - ONE `getRate` per method, in parallel, and ONLY on the L-9 accordion
 *     branch, so the fan-out can never exceed 25 (past that the level renders
 *     the table branch, which shows no price and fires no rate reads at all).
 *   - Each lookup is SECONDARY and independently contained: a failed one
 *     degrades that row to "Price unavailable" and never fails the level —
 *     the method list is the primary read, and losing the rates surface must
 *     not blank a screen whose other affordances still work.
 *   - A missing rate renders "No rate set", NEVER "Free" and never a zero
 *     amount. A free_shipping method with no rate row costs the buyer nothing
 *     to see here, but it is also not configured, and the two must not look
 *     alike.
 *
 * A rate is keyed by (methodId, currency), so a price cannot be read without
 * naming a currency: the methods level therefore carries the SAME currency
 * filter its rates level already had, defaulting to `DEFAULT_RATE_CURRENCY`,
 * and states that currency ONCE in the level's context line rather than per
 * row (G1). The two filters are independent — drilling in re-opens the rates
 * level at its own default, as every level's filter already resets on a
 * drill-in or a write (the engine re-lists with `filterFromValues({})`).
 */
export const SHIPPING_PAGE: AdminPageConfig = {
	path: "/shipping",
	label: "Shipping",
	icon: "truck",
};

/** This screen's namespaced action ids — the four scaffold nav verbs plus
 *  the zone/method/rate side-effecting verbs. */
const SHIPPING_ACTIONS: ScreenActions = screenActions("shipping");
const ACTION_CREATE_ZONE = SHIPPING_ACTIONS.custom("create-zone");
const ACTION_SAVE_ZONE = SHIPPING_ACTIONS.custom("save-zone");
const ACTION_DELETE_ZONE = SHIPPING_ACTIONS.custom("delete-zone");
const ACTION_OPEN_CREATE_ZONE = SHIPPING_ACTIONS.custom("open-create-zone");
const ACTION_CREATE_METHOD = SHIPPING_ACTIONS.custom("create-method");
const ACTION_SAVE_METHOD = SHIPPING_ACTIONS.custom("save-method");
const ACTION_DELETE_METHOD = SHIPPING_ACTIONS.custom("delete-method");
const ACTION_OPEN_CREATE_METHOD = SHIPPING_ACTIONS.custom("open-create-method");
const ACTION_CREATE_RATE = SHIPPING_ACTIONS.custom("create-rate");
const ACTION_SAVE_RATE = SHIPPING_ACTIONS.custom("save-rate");
const ACTION_DELETE_RATE = SHIPPING_ACTIONS.custom("delete-rate");
/** Leave either create screen — re-lists the level the operator came from
 *  (the path rides in the button's own `value`, L-6). */
const ACTION_CANCEL_NEW = SHIPPING_ACTIONS.custom("cancel-new");

/**
 * The action ids the admin-route dispatcher recognizes as belonging to the
 * Shipping console. Every `block_action`/`form_submit` this page can emit is
 * namespaced `shipping:*` and listed here, so none falls through the
 * dispatcher to the `{blocks:[]}` dead-end.
 */
export const SHIPPING_ACTION_IDS: ReadonlySet<string> = SHIPPING_ACTIONS.actionIds(
	"create-zone",
	"save-zone",
	"delete-zone",
	"open-create-zone",
	"create-method",
	"save-method",
	"delete-method",
	"open-create-method",
	"create-rate",
	"save-rate",
	"delete-rate",
	"cancel-new",
);

/** The em-dash BlockInteraction envelope this page consumes (the scaffold's
 *  input shape — `type`/`action_id`/`values`/`value`). */
export type ShippingPageInput = ListDetailInput;

/**
 * What a custom action asks the zones/methods levels to render NOW, beyond
 * the notice banner: WHICH CREATE SCREEN the operator asked for (INC-14's
 * promoted button, or the empty state's own action — E-2), and, after a
 * refusal, what they had typed into it. Nothing else on this screen needs the
 * channel: every other write is DA-4 (one-shot) or DA-2 (unconditional
 * delete), none of which stages a confirm.
 *
 * `draft` IS THE REFUSAL PATH (DA-3a-i). It used to be true that a create
 * error "stays visible via B-5" — the operator had the group open, its
 * `block_id` did not change, so the client kept what they had typed. That
 * argument rested on the CLIENT keeping a form mounted; now the values come
 * back from the server as `initial_value`, which holds whatever the client
 * does with the tree. Raw operator text, never a parsed value (DA-3a-iii
 * property 5). Within-request only.
 */
type ShippingRenderState =
	| { kind: "new-zone"; draft?: ZoneDraft }
	| { kind: "new-method"; draft?: MethodDraft };

/** The "New shipping zone" form's three fields, as submitted. */
interface ZoneDraft {
	id: string;
	name: string;
	regions: string;
}

/** The "New shipping method" form's three fields, as submitted. `type` is a
 *  `select` value, so {@link createMethodForm} resolves it against its own
 *  options before prefilling (X-23). */
interface MethodDraft {
	id: string;
	name: string;
	type: string;
}

/** The rates level's filter: a currency narrow that ALWAYS has a value (no
 *  "unfiltered" state exists — see the module doc's rates-identity note).
 *  Defaults to `"USD"`. The methods level carries the same shape, for the same
 *  reason: a rate is keyed by (methodId, currency), so neither level can name
 *  a price without naming a currency. */
interface RatesFilterForm {
	currency: string;
}

const DEFAULT_RATE_CURRENCY = "USD";

/** Read the currency filter off a submitted filter form — shared by the
 *  methods and rates levels so the two can never disagree about what an empty
 *  or whitespace value means (it means the default, never `""`). */
function currencyFromValues(values: Record<string, unknown>): RatesFilterForm {
	const currency = readString(values.currency)?.trim().toUpperCase();
	return {
		currency: currency !== undefined && currency.length > 0 ? currency : DEFAULT_RATE_CURRENCY,
	};
}

/** ISO-4217's shape. Not a membership test — the service owns the real code
 *  list; this only separates "a currency the store may not price in" from
 *  "not a currency code at all". */
const CURRENCY_CODE_SHAPE = /^[A-Z]{3}$/;

/**
 * The methods level's filter: the shared currency parse plus a validity flag.
 * The flag exists because this level spends a READ PER ROW on the filter
 * value: a typo would otherwise fire up to 25 requests that are all going to
 * fail, and then paint the whole list "Price unavailable" — blaming the
 * service for the operator's `usd ` fat-finger. Invalid ⇒ read nothing, price
 * nothing, and say which of the two it is.
 *
 * Kept OFF the rates level on purpose: that level passes the operator's
 * currency straight to a single read whose failure is already visible and
 * already correctly attributed, and silently substituting a default there
 * would turn a typo into a wrong answer rather than an error.
 */
interface MethodsFilterForm {
	/** Trimmed and upper-cased; the default when the field was blank. */
	currency: string;
	/** `currency` is not a 3-letter ISO-4217 shape. */
	invalid: boolean;
}

function methodsFilterFromValues(values: Record<string, unknown>): MethodsFilterForm {
	const { currency } = currencyFromValues(values);
	return { currency, invalid: !CURRENCY_CODE_SHAPE.test(currency) };
}

function badCurrencyNotice(t: PluginTranslate): Notice {
	return {
		variant: "error",
		title: t("Prices not shown"),
		description: t("Enter a 3-letter currency code like USD."),
	};
}

/** L-7's "nothing selected yet" sentinel — never `""` (F-6a/X-23: a `select`/
 *  `combobox` option value must never be the empty string). */
const NONE = "none";

/** A registry level renders as a per-row accordion list (L-9) only when the
 *  fetched page is complete and small; otherwise table + drill-in. */
function isRegistryAccordion(nextToken: string | undefined, itemCount: number): boolean {
	return nextToken === undefined && itemCount <= 25;
}

export function createShippingPageHandler(): RouteHandler<ShippingPageInput> {
	return async (routeCtx, ctx) => {
		const t = requestTranslator(routeCtx);
		return createListDetailHandler<ShippingRenderState>({
			actions: SHIPPING_ACTIONS,
			translate: t,
			// THE TIER IS THE FACTORY'S DECISION, not this screen's (work order 02,
			// INC-B10c-i): `makeAdminClients` hands back either the `ctx.http` client
			// this line used to construct or the in-process one over the plugin's own
			// document store, and the page cannot tell which — everything below is
			// typed against `AdminRulesSurface`, the structural surface both answer to.
			//
			// NO TOKENS: `X-Internal-Token` / `X-Service-Token` were transport
			// credentials for the commerce service, and there is no service to
			// authenticate to (ADR-0014 D3, INC-D3a).
			async createClient(clientCtx) {
				const clients = await makeAdminClients(clientCtx);
				return clients.rules;
			},
			// The zones level's per-row "View methods" BUTTON and the methods
			// level's per-row "View rates" BUTTON (§12.7) carry the FULL encoded
			// target path in `value.target` — a button carries no `block_id` (B-1),
			// so `parseOpen` must read `input.value?.target`. The L-9 FALLBACK
			// tables' standalone combobox drill-in (L-7) instead fires a
			// `form_submit`, whose target rides in `input.values.target`. One
			// `parseOpen` resolves either, at any depth.
			parseOpen(input) {
				const encoded =
					readString(asRecord(input.value)?.target) ?? readString(input.values?.target);
				if (encoded === undefined) return undefined;
				const targetPath = decodePath(encoded);
				return targetPath === null ? undefined : { targetPath };
			},
			levels: [zonesLevel(t), methodsLevel(t), ratesLevel(t)],
			customActions: {
				[ACTION_CREATE_ZONE]: createZoneAction(t),
				[ACTION_SAVE_ZONE]: saveZoneAction(t),
				[ACTION_DELETE_ZONE]: deleteZoneAction(t),
				[ACTION_OPEN_CREATE_ZONE]: openCreateZoneAction(),
				[ACTION_CREATE_METHOD]: createMethodAction(t),
				[ACTION_SAVE_METHOD]: saveMethodAction(t),
				[ACTION_DELETE_METHOD]: deleteMethodAction(t),
				[ACTION_OPEN_CREATE_METHOD]: openCreateMethodAction(),
				[ACTION_CREATE_RATE]: createRateAction(t),
				[ACTION_SAVE_RATE]: saveRateAction(t),
				[ACTION_DELETE_RATE]: deleteRateAction(t),
				[ACTION_CANCEL_NEW]: cancelNewAction(),
			},
		})(routeCtx, ctx);
	};
}

// -- level 0: shipping zones ---------------------------------------------------

function zonesLevel(t: PluginTranslate) {
	return listLevel<AdminRulesSurface, Record<string, never>, ShippingZoneWire, ShippingRenderState>(
		{
			// No service-side pagination on the zones registry (`GET
			// /admin/shipping/zones` returns the full list) — same small-registry
			// shape as the Tax console's classes level.
			limit: 200,
			filterFromValues: () => ({}),
			async fetchPage(client) {
				const zones = await client.listZones();
				return { items: zones, nextCursor: null };
			},
			render({ items, nextToken, notice, renderState }) {
				return zonesBlocks(t, items, nextToken, notice, renderState);
			},
			onError: () => zonesFailClosed(t),
		},
	);
}

/**
 * The zones registry. INC-14 puts "New shipping zone" at the TOP, as a button
 * directly under the intro line — it used to be an `accordion` at the very
 * bottom (L-8), the least prominent thing on the screen an empty store has to
 * start from. A button is one row tall and holds no input, so P-1's "data
 * inside the first screenful" survives the promotion; the FORM stays off this
 * screen entirely by living on a drill-in ({@link newZoneScreen}), the same
 * button-drill-in idiom the per-row "View methods" already uses (§12.7).
 */
function zonesBlocks(
	t: PluginTranslate,
	zones: ShippingZoneWire[],
	nextToken: string | undefined,
	notice: Notice | undefined,
	renderState: ShippingRenderState | undefined,
): Block[] {
	if (renderState?.kind === "new-zone") return newZoneScreen(t, renderState.draft, notice);
	const blocks: Block[] = [
		{ type: "header", text: t("Shipping zones") },
		{
			type: "context",
			text: t("A zone groups the shipping methods you offer for a set of destinations."),
		},
		createActionBlock("ship:create-zone-action", ACTION_OPEN_CREATE_ZONE, t("New shipping zone")),
	];
	if (notice !== undefined) blocks.push(noticeBanner(notice));
	blocks.push(...zoneRegionWarnings(t, zones));

	if (zones.length === 0) {
		blocks.push(
			emptyState({
				title: t("No shipping zones yet"),
				description: t(
					"Create a zone to start grouping the shipping methods you offer by destination.",
				),
				size: "base",
				// Same verb and same words as the button above: one act, named once.
				actions: [
					{ type: "button", action_id: ACTION_OPEN_CREATE_ZONE, label: t("New shipping zone") },
				],
			}),
		);
		return blocks;
	}

	if (isRegistryAccordion(nextToken, zones.length)) {
		for (const zone of zones) blocks.push(zoneAccordion(t, zone));
	} else {
		blocks.push(zonesFallbackTable(t, zones));
		blocks.push(openZoneForm(t, zones));
	}
	return blocks;
}

/** INC-14's promoted create affordance, shared by both registry levels:
 *  `primary`, one row tall, directly under the intro line. `path` rides in the
 *  button's own `value` (L-6 — a button echoes no `block_id`, B-1) so the
 *  create screen knows which level it belongs to; omitted at the root. */
function createActionBlock(
	blockId: string,
	actionId: string,
	label: string,
	path?: NavPath,
): ActionsBlock {
	return {
		type: "actions",
		block_id: blockId,
		elements: [
			{
				type: "button",
				action_id: actionId,
				label,
				style: "primary",
				...(path !== undefined && path.length > 0
					? { value: { [PATH_FIELD]: encodePath(path) } }
					: {}),
			},
		],
	};
}

/** One zone's per-row group (L-9): edit form, the "View methods" drill-in
 *  (§12.7), and delete — all collapsed (L-9's own "zero open groups" rule). */
function zoneAccordion(t: PluginTranslate, zone: ShippingZoneWire): AccordionBlock {
	return {
		type: "accordion",
		label: `${zone.id} — ${zone.name}`,
		default_open: false,
		// A PLAIN key, not a minted carrier: this accordion never echoes
		// `block_id` back (only `form`/`table` do — B-1), so there is nothing to
		// decode. `zone.id` is the zone's own unique id, safe to interpolate
		// directly — unlike `encodeCarrier`'s NAMESPACE argument, which must stay
		// a constant literal (CLAUDE.md's carrier-namespace trap), a plain key is
		// just a string with no grammar to violate.
		block_id: `ship:zone:${zone.id}`,
		blocks: [
			{ type: "context", text: zoneMatchSummary(t, zone.regions) },
			editZoneForm(t, zone),
			{
				type: "actions",
				elements: [
					{
						type: "button",
						action_id: SHIPPING_ACTIONS.open,
						label: t("View methods"),
						// FULL target path, never a bare id — required at any drill depth
						// (§12.7), and load-bearing at depth 3 for this screen's rates level.
						value: { target: encodePath([zone.id]) },
					},
				],
			},
			deleteZoneActions(t, zone),
		],
	};
}

/** Full-replace edit (LWW, no CAS — a zone carries no money): the form always
 *  submits BOTH `name` and `regions`, pre-filled from the loaded row, so an
 *  edit can never silently omit `regions` (the service 400s an omitted key —
 *  `AdminRulesSurface.updateZone`'s doc). `zoneId` rides invisibly in the
 *  carrier, not as a visible field (F-2, F-3 — no more single-option
 *  "carrier" select). */
function editZoneForm(t: PluginTranslate, zone: ShippingZoneWire): FormBlock {
	return carriedForm({
		namespace: "ship:zone-save",
		context: { zoneId: zone.id },
		form: {
			type: "form",
			fields: [
				{
					type: "text_input",
					action_id: "name",
					label: t("Name"),
					initial_value: zone.name,
					placeholder: t("e.g. United States"),
				},
				{
					type: "text_input",
					action_id: "regions",
					label: t("Regions (comma-separated, blank = none)"),
					initial_value: formatRegionsForInput(zone.regions),
				},
			],
			// A verb phrase naming the result, no id (M-7) — the enclosing
			// accordion's label already names the zone.
			submit: { label: t("Save zone"), action_id: ACTION_SAVE_ZONE },
		},
	});
}

function deleteZoneActions(t: PluginTranslate, zone: ShippingZoneWire): ActionsBlock {
	const button: ButtonElement = {
		type: "button",
		action_id: ACTION_DELETE_ZONE,
		label: t("Delete zone"), // no id (M-7) — the accordion label already names it
		style: "danger",
		value: { zoneId: zone.id },
		confirm: {
			title: t("Delete zone {id}?", { id: zone.id }),
			text: t(
				"This only works while the zone has no shipping methods — delete those first if this fails. This cannot be undone.",
			),
			confirm: t("Yes, delete"),
			deny: t("Keep it"),
			style: "danger",
		},
	};
	return { type: "actions", elements: [button] };
}

/** The "New shipping zone" create screen (INC-14) — `header` · back · notice ·
 *  context · the form, the shape every other non-list level on this console
 *  already has. The banner sits above the form because it explains the values
 *  the form below has just put back. */
function newZoneScreen(
	t: PluginTranslate,
	draft: ZoneDraft | undefined,
	notice: Notice | undefined,
): Block[] {
	const blocks: Block[] = [
		{ type: "header", text: t("New shipping zone") },
		// No path: this screen belongs to the ROOT registry.
		backButton(ACTION_CANCEL_NEW, t("← Back to shipping zones")),
	];
	if (notice !== undefined) blocks.push(noticeBanner(notice));
	blocks.push({
		type: "context",
		text: t(
			"Regions are ISO codes: a country (US) or state/province (US-CA). Addresses match exactly; the most specific zone wins.",
		),
	});
	blocks.push(createZoneForm(t, draft));
	return blocks;
}

/** `draft` is the refusal path (DA-3a-i): what was submitted comes back as
 *  `initial_value`, so a rejected duplicate id costs one edit and not three
 *  retypes. */
function createZoneForm(t: PluginTranslate, draft?: ZoneDraft): FormBlock {
	return carriedForm({
		namespace: "ship:zone-create",
		form: {
			type: "form",
			fields: [
				{
					type: "text_input",
					action_id: "id",
					label: t("Zone ID"),
					placeholder: t("e.g. us"),
					...prefill(draft?.id),
				},
				{
					type: "text_input",
					action_id: "name",
					label: t("Name"),
					placeholder: t("e.g. United States"),
					...prefill(draft?.name),
				},
				{
					type: "text_input",
					action_id: "regions",
					label: t("Regions (comma-separated, blank = none)"),
					placeholder: t("e.g. US"),
					...prefill(draft?.regions),
				},
			],
			submit: { label: t("Create zone"), action_id: ACTION_CREATE_ZONE },
		},
	});
}

/** A text field's draft prefill, or nothing. An EMPTY draft value renders no
 *  `initial_value` at all rather than `""` — that is what an untouched field
 *  looks like to `blocks/form.tsx`. */
function prefill(value: string | undefined): { initial_value?: string } {
	return value !== undefined && value.length > 0 ? { initial_value: value } : {};
}

/** L-9 fallback (>25 rows, or an incomplete page): table + L-7 drill-in.
 *  T-7/L-9b: every L-9 fallback table sets `empty_text`. */
function zonesFallbackTable(t: PluginTranslate, zones: ShippingZoneWire[]): TableBlock {
	return {
		type: "table",
		columns: [
			{ key: "id", label: t("Zone ID"), format: "code" },
			{ key: "name", label: t("Name") },
			{ key: "regions", label: t("Regions") },
		],
		rows: zones.map((z) => ({ id: z.id, name: z.name, regions: regionsSummary(t, z.regions) })),
		page_action_id: SHIPPING_ACTIONS.page, // never fires: the registry has no paging
		empty_text: t("No shipping zones yet — create one below."),
	};
}

/** L-7's standalone drill-in, used only by the fallback branch (the
 *  accordion branch uses the per-row "View methods" button instead — §12.7).
 *  ALWAYS a `combobox`: the option value is an opaque encoded path, and a
 *  `select` would render that in its trigger (R-17a, X-22). The label is the
 *  zone's name plus its regions as a disambiguator — never the id (M-7). */
function openZoneForm(t: PluginTranslate, zones: ShippingZoneWire[]): FormBlock {
	// Wrapped in `carriedForm` even though `NONE` is a constant sentinel, never
	// record-derived data (R-12a — a record picker never prefills, so there is
	// no staleness for a change token to guard against): every prefilling
	// control still goes through the one mechanism, matching `orders-page.ts`'s
	// own L-7 picker.
	return carriedForm({
		namespace: "ship:open-zone",
		form: {
			type: "form",
			fields: [
				{
					type: "combobox",
					action_id: "target",
					label: t("Open zone"),
					options: [
						{ value: NONE, label: t("Choose a zone…") },
						...zones.map((z) => ({
							value: encodePath([z.id]),
							label: `${z.name} — ${regionsSummary(t, z.regions)}`,
						})),
					],
					initial_value: NONE,
				},
			],
			submit: { label: t("Open"), action_id: SHIPPING_ACTIONS.open },
		},
	});
}

function zonesFailClosed(t: PluginTranslate) {
	return failClosedResponse({
		header: t("Shipping zones"),
		title: t("Shipping zones are unavailable"),
		description: t(
			"Shipping zones could not be loaded. Retry in a moment; if it keeps failing, this is a fault in the console itself — not your data.",
		),
		toast: t("Could not load shipping zones"),
	});
}

// -- level 1: a zone's shipping methods -----------------------------------------

function methodsLevel(t: PluginTranslate) {
	return listLevel<AdminRulesSurface, MethodsFilterForm, MethodRow, ShippingRenderState>({
		limit: 200,
		filterFromValues: methodsFilterFromValues,
		async fetchPage(client, path, filter) {
			const zoneId = path[0];
			if (zoneId === undefined) return { items: [], nextCursor: null };
			const methods = await client.listMethods(zoneId);
			const items = await pricedMethods(client, methods, filter);
			// SECONDARY and contained, like the price reads: the zone is read only for
			// its legacy-regions warning, and losing it must not blank the level.
			try {
				const zone = (await client.listZones()).find((z) => z.id === zoneId);
				if (zone !== undefined) METHODS_ZONE.set(items, zone);
			} catch (err) {
				console.error("[otta] admin shipping zone read for the methods level failed:", err);
			}
			return { items, nextCursor: null };
		},
		render({ path, filter, items, nextToken, notice, renderState }) {
			const zoneId = path[0] ?? "";
			const blocks = methodsBlocks(t, zoneId, filter, items, nextToken, notice, renderState);
			const zone = METHODS_ZONE.get(items);
			const warnings = zone === undefined ? [] : zoneRegionWarnings(t, [zone]);
			if (warnings.length === 0 || renderState?.kind === "new-method") return blocks;
			// Under the intro, above the rows — the same place the landing puts them.
			const at = blocks.findIndex((b) => b.type === "actions");
			return [...blocks.slice(0, at + 1), ...warnings, ...blocks.slice(at + 1)];
		},
		onError: () => methodsFailClosed(t),
	});
}

/**
 * What this render could learn about a method's price in the filter currency.
 * FOUR outcomes, kept apart on purpose — an amount, a service that says there
 * is none, a lookup that did not answer, and a lookup never attempted. None of
 * them may collapse into another, and none but the first may render as a
 * number.
 *
 * `not-priced` is the one that looks redundant and is not. It marks "we did
 * not ask", which is true of the table branch and of a rejected currency, and
 * it exists so that a future change — service-side paging on this registry,
 * say, letting a priced-looking row reach `render` un-priced — cannot print
 * `Price unavailable` and blame the service for a read nobody made.
 */
type MethodPrice =
	| { kind: "amount"; rate: ShippingRateWire }
	| { kind: "none" }
	| { kind: "unknown" }
	| { kind: "not-priced" };

/** A method ROW as this level renders it: the wire shape plus its price in the
 *  level's filter currency (see the module doc's price note for the bound). */
interface MethodRow extends ShippingMethodWire {
	price: MethodPrice;
}

/**
 * Attach each method's price in the filter currency, or mark the row
 * `not-priced` when no read is going to be made: past 25 rows (the table
 * branch has no price column) or on a currency that is not a currency code at
 * all. Either way the level costs ZERO rate reads rather than up to
 * `limit: 200` of them.
 *
 * THE FAN-OUT IS PER RENDER OF THIS LEVEL, NOT PER DRILL-IN. `SandboxedPluginPage`
 * replaces the whole block tree on every interaction, so the ≤25 reads recur on
 * the drill-in, on every filter apply, and on every post-write `showList` —
 * a create/save/delete round trip pays for them again. That is affordable at
 * this bound and on this screen (a registry an operator configures once, not a
 * storefront path), and it is the reason the bound is 25 and not `limit`.
 *
 * FOLLOW-UP, deliberately not built here: these reads carry no `AbortSignal`
 * and no deadline, so a service that hangs rather than fails holds the render
 * open for as long as `ctx.http` will wait. Containment today is per-row and
 * on the ERROR path only. Wiring cancellation belongs with a timeout policy for
 * every admin read, not with a label change.
 */
async function pricedMethods(
	client: AdminRulesSurface,
	methods: ShippingMethodWire[],
	filter: MethodsFilterForm,
): Promise<MethodRow[]> {
	// This level's `fetchPage` always returns `nextCursor: null` (the registry
	// has no service-side paging), so the branch is decided by row count alone
	// and can be asked here, before `render` asks it again for real.
	if (filter.invalid || !isRegistryAccordion(undefined, methods.length)) {
		return methods.map((method) => ({ ...method, price: { kind: "not-priced" } }));
	}
	return Promise.all(
		methods.map(async (method) => ({
			...method,
			price: await methodPrice(client, method.id, filter.currency),
		})),
	);
}

/** One method's price lookup, CONTAINED: this is a secondary read (the method
 *  list is the primary one), so a failure degrades this row alone. `null` from
 *  the client is the service's own "no rate in that currency" 404 — a fact,
 *  reported as such; a throw is an absence of information, reported as such. */
async function methodPrice(
	client: AdminRulesSurface,
	methodId: string,
	currency: string,
): Promise<MethodPrice> {
	try {
		const rate = await client.getRate(methodId, currency);
		return rate === null ? { kind: "none" } : { kind: "amount", rate };
	} catch (err) {
		console.error("[otta] admin shipping method price read failed:", err);
		return { kind: "unknown" };
	}
}

/**
 * The leading token of a method's row label. Money goes through `formatMoney`
 * (via `formatCentsForDisplay`); the three non-amounts are named honestly and
 * never dressed up as a price.
 *
 * `No rate set` IS CURRENCY-SCOPED, AND THE CONTEXT LINE IS WHERE IT SAYS SO
 * ({@link methodsBlocks}). The read establishes only that this method has no
 * rate IN THE FILTER CURRENCY; a store pricing solely in EUR, read under the
 * USD default, would otherwise be told every method is unconfigured while its
 * configuration is complete — the same false absence this module refuses to
 * render as `Free`. Scoping it in the row instead ("No rate set for this
 * currency") reads better in isolation and was tried first: it makes a
 * realistic label 63 characters against X-11's 60-char accordion budget, and
 * the budget is the older constraint. So the qualifier lives once in the
 * context line, with the currency it qualifies — which is also where G1 wants
 * the currency named, rather than as an ISO code per row.
 */
function methodPriceLabel(t: PluginTranslate, price: MethodPrice): string {
	switch (price.kind) {
		case "amount":
			return formatCentsForDisplay(t, price.rate.amountCents, price.rate.currency);
		case "none":
			return t("No rate set");
		case "unknown":
			return t("Price unavailable");
		case "not-priced":
			return t("Price not loaded");
	}
}

/** The level's one context line. On the priced branch it carries the currency
 *  AND what an unpriced row means in it — the whole of `No rate set`'s scope,
 *  stated once (G1, X-11's 140-char page-context budget: 138). Off that branch
 *  it claims no currency, because nothing was priced in one. */
function methodsContextText(t: PluginTranslate, currency: string, pricesShown: boolean): string {
	// The wire values stay `flat_rate`/`free_shipping` (see `methodTypeField`);
	// only the operator-facing copy is human.
	const types = t(
		'"Flat rate" always charges its rate; "Free shipping" charges nothing above its threshold.',
	);
	return pricesShown
		? t('{types} Prices in {currency} — "No rate set" means no {currency3} rate.', {
				types: types,
				currency: currency,
				currency3: currency,
			})
		: types;
}

function methodsBlocks(
	t: PluginTranslate,
	zoneId: string,
	filter: MethodsFilterForm,
	methods: MethodRow[],
	nextToken: string | undefined,
	notice: Notice | undefined,
	renderState: ShippingRenderState | undefined,
): Block[] {
	// The context line is where this level states its currency — ONCE, for the
	// whole list (G1), never repeated as an ISO code per row. It claims a
	// currency only when rows were actually priced in it.
	const accordionBranch = isRegistryAccordion(nextToken, methods.length);
	const pricesShown = accordionBranch && methods.length > 0 && !filter.invalid;
	if (renderState?.kind === "new-method") {
		return newMethodScreen(t, zoneId, renderState.draft, notice);
	}
	const blocks: Block[] = [
		{ type: "header", text: t("Shipping methods — {zoneId}", { zoneId: zoneId }) },
		backButton(SHIPPING_ACTIONS.back, t("← Back to zones"), [zoneId]),
		{ type: "context", text: methodsContextText(t, filter.currency, pricesShown) },
		// INC-14: the create action, promoted from an accordion at the very
		// bottom to a button under the intro line. It carries the drill path
		// (L-6) — this level is depth 1, so without it the create screen would
		// open at the root registry.
		createActionBlock(
			`ship:create-method-action:${zoneId}`,
			ACTION_OPEN_CREATE_METHOD,
			t("New shipping method"),
			[zoneId],
		),
	];
	if (notice !== undefined) blocks.push(noticeBanner(notice));
	// G5: a rejected filter is a banner inside a 200, never a refused render —
	// the method list is unaffected by it and stays on screen, editable.
	if (filter.invalid) blocks.push(noticeBanner(badCurrencyNotice(t)));

	if (methods.length === 0) {
		blocks.push(
			emptyState({
				title: t("No shipping methods yet"),
				description: t("Add a method to start offering shipping for this zone."),
				size: "base",
				// Same verb and same words as the button above.
				actions: [
					{
						type: "button",
						action_id: ACTION_OPEN_CREATE_METHOD,
						label: t("New shipping method"),
						value: { [PATH_FIELD]: encodePath([zoneId]) },
					},
				],
			}),
		);
		return blocks;
	}

	if (accordionBranch) {
		// L-2: one filter field renders INLINE, no accordion. It is the price
		// column's currency, so it ships with the priced branch and not with the
		// table branch, which prices nothing. It renders on a REJECTED currency
		// too — that is the field the operator has to fix.
		blocks.push(methodCurrencyForm(t, zoneId, filter));
		for (const method of methods) blocks.push(methodAccordion(t, zoneId, method));
	} else {
		blocks.push(methodsFallbackTable(t, methods));
		blocks.push(openMethodForm(t, zoneId, methods));
	}
	return blocks;
}

/** The currency the per-row price is read in. Same field, same submit verb and
 *  same default as the rates level's own `currencyFilterForm` one level down —
 *  deliberately, so the control an operator learns here is the control they
 *  meet there. Carries the depth-1 drill path INVISIBLY (L-6), so
 *  `apply-filter` re-lists THIS zone's methods and not the root. */
function methodCurrencyForm(
	t: PluginTranslate,
	zoneId: string,
	filter: MethodsFilterForm,
): FormBlock {
	return carriedForm({
		namespace: "ship:method-currency",
		context: { [PATH_FIELD]: encodePath([zoneId]) },
		form: {
			type: "form",
			fields: [
				{
					type: "text_input",
					action_id: "currency",
					label: t("Price currency (ISO-4217, e.g. USD)"),
					initial_value: filter.currency,
				},
			],
			submit: { label: t("Apply filters"), action_id: SHIPPING_ACTIONS.applyFilter },
		},
	});
}

/** The human name for a method `type`, matching the create/edit select's
 *  option labels verbatim. The WIRE VALUE is untouched — `flat_rate` /
 *  `free_shipping` still go over `ctx.http` and still come back; only the copy
 *  an operator reads is human. */
function methodTypeName(t: PluginTranslate, type: string): string {
	return type === "free_shipping" ? t("Free shipping") : t("Flat rate");
}

/** {@link methodTypeName} lowercased for mid-label use (D-6) — never a bare
 *  code, and never the select's raw value (that wart is confined to the
 *  `select` trigger itself, R-17a). */
function methodTypeLabel(t: PluginTranslate, type: string): string {
	return type === "free_shipping" ? t("free shipping") : t("flat rate");
}

/**
 * One method's per-row group (L-9). THE PRICE LEADS THE LABEL: it is the
 * number the operator came for, and before this it was not on the screen at
 * all — not in the row, not even inside the expanded row, only two levels down
 * under the rates drill-in. Leading with it also starts every row's amount at
 * the same left edge, so a zone's methods can be compared down the column
 * (the slug, which varies in length, moves to second position — in FULL: a
 * method id is a readable natural key, not an opaque uuid).
 */
function methodAccordion(t: PluginTranslate, zoneId: string, method: MethodRow): AccordionBlock {
	return {
		type: "accordion",
		label: `${methodPriceLabel(t, method.price)} — ${method.name} · ${method.id} · ${methodTypeLabel(t, method.type)}`,
		default_open: false,
		block_id: `ship:method:${zoneId}:${method.id}`,
		blocks: [
			editMethodForm(t, zoneId, method),
			{
				type: "actions",
				elements: [
					{
						type: "button",
						action_id: SHIPPING_ACTIONS.open,
						label: t("View rates"),
						value: { target: encodePath([zoneId, method.id]) },
					},
				],
			},
			deleteMethodActions(t, zoneId, method),
		],
	};
}

function methodTypeField(
	t: PluginTranslate,
	actionId: string,
	initial: string,
): FormBlock["fields"][number] {
	const options: SelectOption[] = [
		{ value: "flat_rate", label: t("Flat rate") },
		{ value: "free_shipping", label: t("Free shipping (threshold-based)") },
	];
	return { type: "select", action_id: actionId, label: t("Type"), options, initial_value: initial };
}

function editMethodForm(t: PluginTranslate, zoneId: string, method: ShippingMethodWire): FormBlock {
	return carriedForm({
		namespace: "ship:method-save",
		context: { zoneId, methodId: method.id },
		form: {
			type: "form",
			fields: [
				{ type: "text_input", action_id: "name", label: t("Name"), initial_value: method.name },
				methodTypeField(t, "type", method.type),
			],
			submit: { label: t("Save method"), action_id: ACTION_SAVE_METHOD },
		},
	});
}

function deleteMethodActions(
	t: PluginTranslate,
	zoneId: string,
	method: ShippingMethodWire,
): ActionsBlock {
	const button: ButtonElement = {
		type: "button",
		action_id: ACTION_DELETE_METHOD,
		label: t("Delete method"),
		style: "danger",
		value: { zoneId, methodId: method.id },
		confirm: {
			title: t("Delete method {id}?", { id: method.id }),
			text: t(
				"This only works while the method has no rates — delete those first if this fails. This cannot be undone.",
			),
			confirm: t("Yes, delete"),
			deny: t("Keep it"),
			style: "danger",
		},
	};
	return { type: "actions", elements: [button] };
}

/** The "New shipping method" create screen (INC-14) — what the promoted button
 *  and the empty state's own action both drill into. */
function newMethodScreen(
	t: PluginTranslate,
	zoneId: string,
	draft: MethodDraft | undefined,
	notice: Notice | undefined,
): Block[] {
	const blocks: Block[] = [
		{ type: "header", text: t("New shipping method — {zoneId}", { zoneId: zoneId }) },
		backButton(ACTION_CANCEL_NEW, t("← Back to shipping methods"), [zoneId]),
	];
	if (notice !== undefined) blocks.push(noticeBanner(notice));
	blocks.push(createMethodForm(t, zoneId, draft));
	return blocks;
}

/** `draft` is the refusal path (DA-3a-i). `type` is resolved against the
 *  select's own options first (X-23), so an unknown value falls back to the
 *  default rather than rendering a blank trigger. */
function createMethodForm(t: PluginTranslate, zoneId: string, draft?: MethodDraft): FormBlock {
	const type =
		draft?.type === "free_shipping" || draft?.type === "flat_rate" ? draft.type : "flat_rate";
	return carriedForm({
		namespace: "ship:method-create",
		context: { zoneId },
		form: {
			type: "form",
			fields: [
				{
					type: "text_input",
					action_id: "id",
					label: t("Method ID"),
					placeholder: t("e.g. standard"),
					...prefill(draft?.id),
				},
				{
					type: "text_input",
					action_id: "name",
					label: t("Name"),
					placeholder: t("e.g. Standard shipping"),
					...prefill(draft?.name),
				},
				methodTypeField(t, "type", type),
			],
			submit: { label: t("Add method"), action_id: ACTION_CREATE_METHOD },
		},
	});
}

function methodsFallbackTable(t: PluginTranslate, methods: ShippingMethodWire[]): TableBlock {
	return {
		type: "table",
		columns: [
			{ key: "id", label: t("Method ID"), format: "code" },
			{ key: "name", label: t("Name") },
			// `Type` keeps its badge (T-5's own exception): a two-value closed set
			// (flat_rate/free_shipping) genuinely distinguished at a glance, and
			// this level's only badge column. The badge reads the HUMAN name — the
			// raw enum was the last operator-facing place this screen leaked one.
			{ key: "type", label: t("Type"), format: "badge" },
		],
		rows: methods.map((m) => ({ id: m.id, name: m.name, type: methodTypeName(t, m.type) })),
		page_action_id: SHIPPING_ACTIONS.page, // never fires: no paging at this level
		empty_text: t("No shipping methods yet for this zone."),
	};
}

function openMethodForm(
	t: PluginTranslate,
	zoneId: string,
	methods: ShippingMethodWire[],
): FormBlock {
	// See `openZoneForm`'s note: carried even though `NONE` is a constant.
	return carriedForm({
		namespace: "ship:open-method",
		context: { zoneId },
		form: {
			type: "form",
			fields: [
				{
					type: "combobox",
					action_id: "target",
					label: t("Open method"),
					options: [
						{ value: NONE, label: t("Choose a method…") },
						...methods.map((m) => ({
							value: encodePath([zoneId, m.id]),
							label: `${m.name} (${methodTypeLabel(t, m.type)})`,
						})),
					],
					initial_value: NONE,
				},
			],
			submit: { label: t("Open"), action_id: SHIPPING_ACTIONS.open },
		},
	});
}

function methodsFailClosed(t: PluginTranslate) {
	return failClosedResponse({
		header: t("Shipping methods"),
		title: t("Shipping methods are unavailable"),
		description: t(
			"Shipping methods could not be loaded. Retry in a moment; if it keeps failing, this is a fault in the console itself — not your data.",
		),
		toast: t("Could not load shipping methods"),
	});
}

// -- level 2: a method's rates (currency-keyed, L-9a EXEMPT from the accordion list) --

function ratesLevel(t: PluginTranslate) {
	return listLevel<AdminRulesSurface, RatesFilterForm, ShippingRateWire>({
		limit: 1, // a rate is keyed by (methodId, currency) — at most one row per filter
		filterFromValues: currencyFromValues,
		async fetchPage(client, path, filter) {
			const methodId = path[1];
			if (methodId === undefined) return { items: [], nextCursor: null };
			const rate = await client.getRate(methodId, filter.currency);
			return { items: rate === null ? [] : [rate], nextCursor: null };
		},
		render({ path, filter, items, notice }) {
			const zoneId = path[0] ?? "";
			const methodId = path[1] ?? "";
			return ratesBlocks(t, zoneId, methodId, filter, items, notice);
		},
		onError: () => ratesFailClosed(t),
	});
}

function ratesBlocks(
	t: PluginTranslate,
	zoneId: string,
	methodId: string,
	filter: RatesFilterForm,
	rows: ShippingRateWire[],
	notice: Notice | undefined,
): Block[] {
	const blocks: Block[] = [
		{ type: "header", text: t("Shipping rates — {methodId}", { methodId: methodId }) },
		backButton(SHIPPING_ACTIONS.back, t("← Back to methods"), [zoneId, methodId]),
		{
			type: "context",
			text: t("A rate is keyed by currency — one method can price differently per currency."),
		},
	];
	if (notice !== undefined) blocks.push(noticeBanner(notice));

	blocks.push(currencyFilterForm(t, zoneId, methodId, filter));
	if (filter.currency !== DEFAULT_RATE_CURRENCY) {
		const summary = filterSummary([t("currency: {currency}", { currency: filter.currency })]);
		if (summary !== undefined) {
			const clearButton: ButtonElement = {
				type: "button",
				action_id: SHIPPING_ACTIONS.applyFilter,
				label: t("Clear filters"),
				value: { [PATH_FIELD]: encodePath([zoneId, methodId]) },
			};
			blocks.push({ type: "section", text: summary, accessory: clearButton });
		}
	}

	const row = rows[0];
	if (row === undefined) {
		blocks.push({
			type: "context",
			text: t("No rate set for that currency yet — use the form below."),
		});
		blocks.push(createRateForm(t, zoneId, methodId, filter));
	} else {
		blocks.push(rateFields(t, methodId, row));
		blocks.push(editRateForm(t, zoneId, methodId, row));
		blocks.push(deleteRateActions(t, zoneId, methodId, row));
	}
	return blocks;
}

function currencyFilterForm(
	t: PluginTranslate,
	zoneId: string,
	methodId: string,
	filter: RatesFilterForm,
): FormBlock {
	// L-2: a single filter field renders INLINE (no accordion). Carries the
	// depth-2 drill path INVISIBLY via the carrier so `apply-filter` re-lists
	// THIS method's rates, never the root — required at depth > 0 (L-6).
	return carriedForm({
		namespace: "ship:rate-lookup",
		context: { [PATH_FIELD]: encodePath([zoneId, methodId]) },
		form: {
			type: "form",
			fields: [
				{
					type: "text_input",
					action_id: "currency",
					label: t("Currency (ISO-4217, e.g. USD)"),
					initial_value: filter.currency,
				},
			],
			// L-5 wants the standard verb phrase, not "Look up rate".
			submit: { label: t("Apply filters"), action_id: SHIPPING_ACTIONS.applyFilter },
		},
	});
}

/** A 0-or-1-row lookup is `fields`, not a 1-row `table` (P-3, L-9a). */
function rateFields(t: PluginTranslate, methodId: string, row: ShippingRateWire): FieldsBlock {
	return {
		type: "fields",
		block_id: "shipping:rate",
		fields: [
			{ label: t("Currency"), value: row.currency },
			{ label: t("Amount"), value: formatCentsForDisplay(t, row.amountCents, row.currency) },
			{
				label: t("Free-shipping threshold"),
				value:
					row.minSubtotalCents === null
						? t("No minimum")
						: formatCentsForDisplay(t, row.minSubtotalCents, row.currency),
			},
			{ label: t("Method"), value: methodId },
		],
	};
}

function createRateForm(
	t: PluginTranslate,
	zoneId: string,
	methodId: string,
	filter: RatesFilterForm,
): FormBlock {
	return carriedForm({
		namespace: "ship:rate-create",
		context: { zoneId, methodId },
		form: {
			type: "form",
			fields: [
				{
					type: "text_input",
					action_id: "currency",
					label: t("Currency (ISO-4217, e.g. USD)"),
					initial_value: filter.currency,
				},
				{
					type: "text_input",
					action_id: "amount",
					label: t("Amount (up to 2 decimals, e.g. 4.99 — 0 is allowed)"),
					placeholder: "4.99",
				},
				{
					type: "text_input",
					action_id: "minSubtotal",
					label: t("Free-shipping threshold (blank = none)"),
					placeholder: "35.00",
				},
			],
			submit: { label: t("Add rate"), action_id: ACTION_CREATE_RATE },
		},
	});
}

/**
 * The rate edit form (CAS on `amountCents`): `expectedAmountCents` rides
 * invisibly in the carrier alongside `zoneId`/`methodId`/`currency`, holding
 * the value THIS render loaded (B-3's change token) — a concurrent edit that
 * changed it in the meantime loses the CAS and the reloaded list shows the
 * fresh value with a "reload" notice, never a silent clobber.
 * `minSubtotalCents` is required-nullable on the wire, so the form always
 * submits it (blank ⇒ explicit clear).
 */
function editRateForm(
	t: PluginTranslate,
	zoneId: string,
	methodId: string,
	row: ShippingRateWire,
): FormBlock {
	return carriedForm({
		namespace: "ship:rate-save",
		context: {
			zoneId,
			methodId,
			currency: row.currency,
			expectedAmountCents: String(row.amountCents),
		},
		form: {
			type: "form",
			fields: [
				{
					type: "text_input",
					action_id: "amount",
					label: t("Amount for {currency} (up to 2 decimals)", { currency: row.currency }),
					initial_value: formatMinorUnitsInput(row.amountCents),
				},
				{
					type: "text_input",
					action_id: "minSubtotal",
					label: t("Free-shipping threshold (blank = none)"),
					...(row.minSubtotalCents !== null
						? { initial_value: formatMinorUnitsInput(row.minSubtotalCents) }
						: {}),
				},
			],
			submit: { label: t("Save rate"), action_id: ACTION_SAVE_RATE },
		},
	});
}

function deleteRateActions(
	t: PluginTranslate,
	zoneId: string,
	methodId: string,
	row: ShippingRateWire,
): ActionsBlock {
	const button: ButtonElement = {
		type: "button",
		action_id: ACTION_DELETE_RATE,
		label: t("Delete rate"),
		style: "danger",
		value: { zoneId, methodId, currency: row.currency },
		confirm: {
			title: t("Delete the {currency} rate for {methodId}?", {
				currency: row.currency,
				methodId: methodId,
			}),
			text: t(
				"In-flight carts recompute their shipping without this rate the next time they're touched. Orders already placed are unaffected — an order snapshots the shipping fee it was charged at purchase time.",
			),
			confirm: t("Yes, delete"),
			deny: t("Keep it"),
			style: "danger",
		},
	};
	return { type: "actions", elements: [button] };
}

function ratesFailClosed(t: PluginTranslate) {
	return failClosedResponse({
		header: t("Shipping rates"),
		title: t("Shipping rates are unavailable"),
		description: t(
			"Shipping rates could not be loaded. Retry in a moment; if it keeps failing, this is a fault in the console itself — not your data.",
		),
		toast: t("Could not load shipping rates"),
	});
}

// -- custom action: create a zone ------------------------------------------------

function createZoneAction(t: PluginTranslate) {
	return customAction<AdminRulesSurface, ShippingRenderState>(
		async ({ input, client, showList }) => {
			const values = input.values ?? {};
			const id = (readString(values.id) ?? "").trim();
			const name = (readString(values.name) ?? "").trim();
			// EVERY refusal below re-renders the create screen with what was typed
			// (DA-3a-i) — see ShippingRenderState.
			const draft: ZoneDraft = {
				id: readString(values.id) ?? "",
				name: readString(values.name) ?? "",
				regions: readString(values.regions) ?? "",
			};
			if (id.length === 0 || name.length === 0) {
				return showList(
					undefined,
					{
						variant: "error",
						title: t("Zone not created"),
						description: t("Enter both a zone ID and a name."),
					},
					{ kind: "new-zone", draft },
				);
			}
			const checked = await checkZoneRegions(t, client, readString(values.regions) ?? "", null);
			if (!checked.ok) {
				return showList(undefined, checked.notice(t("Zone not created")), {
					kind: "new-zone",
					draft,
				});
			}
			const result = await client.createZone({ id, name, regions: checked.codes });
			const notice = createZoneNotice(t, result, id, name);
			// A SERVICE refusal keeps the draft too (a duplicate id is one edit
			// away); success drops it, which is what returns the operator to the
			// registry.
			return result.ok
				? showList(undefined, notice)
				: showList(undefined, notice, { kind: "new-zone", draft });
		},
	);
}

function createZoneNotice(
	t: PluginTranslate,
	result: RulesCreateResult<ShippingZoneWire>,
	id: string,
	name: string,
): Notice {
	if (result.ok) {
		return {
			variant: "default",
			title: t("Zone created"),
			description: t('"{name}" ({id}) was added.', { name: name, id: id }),
		};
	}
	return {
		variant: "error",
		title: t("Zone not created"),
		description: t(
			'Could not create "{id}" — check the zone ID isn\'t already in use, then try again.',
			{ id: id },
		),
	};
}

// -- custom action: edit a zone (LWW) ---------------------------------------------

function saveZoneAction(t: PluginTranslate) {
	return customAction<AdminRulesSurface>(async ({ input, carried, client, showList }) => {
		const zoneId = carried?.zoneId;
		if (zoneId === undefined) return showList();
		const values = input.values ?? {};
		const name = (readString(values.name) ?? "").trim();
		if (name.length === 0) {
			return showList(undefined, {
				variant: "error",
				title: t("Zone not saved"),
				description: t("Name cannot be blank."),
			});
		}
		const checked = await checkZoneRegions(t, client, readString(values.regions) ?? "", zoneId);
		if (!checked.ok) return showList(undefined, checked.notice(t("Zone not saved")));
		const result = await client.updateZone(zoneId, { name, regions: checked.codes });
		return showList(undefined, saveZoneNotice(t, result));
	});
}

function saveZoneNotice(t: PluginTranslate, result: RulesUpdateResult<ShippingZoneWire>): Notice {
	if (result.ok) {
		return { variant: "default", title: t("Zone saved"), description: t("The zone was updated.") };
	}
	if (result.reason === "not_found") {
		return {
			variant: "error",
			title: t("Zone not found"),
			description: t("This zone no longer exists — it may have already been deleted."),
		};
	}
	return {
		variant: "error",
		title: t("Zone not saved"),
		description: t("The change could not be saved — retry in a moment."),
	};
}

// -- custom action: delete a zone (forbid-if-methods) ------------------------------

function deleteZoneAction(t: PluginTranslate) {
	return customAction<AdminRulesSurface>(async ({ input, client, showList }) => {
		const payload = asRecord(input.value);
		const zoneId = readString(payload?.zoneId);
		if (zoneId === undefined) return showList();
		const result = await client.deleteZone(zoneId);
		return showList(undefined, deleteZoneNotice(t, result));
	});
}

function deleteZoneNotice(t: PluginTranslate, result: RulesDeleteResult): Notice {
	if (result.ok) {
		return {
			variant: "default",
			title: t("Zone deleted"),
			description: t("The zone was removed."),
		};
	}
	if (result.reason === "not_found") {
		return {
			variant: "default",
			title: t("Already deleted"),
			description: t("This zone was already removed."),
		};
	}
	if (result.reason === "in_use") {
		return {
			variant: "error",
			title: t("Zone not deleted"),
			description: t(
				"This zone still has shipping methods — delete its methods first, then retry.",
			),
		};
	}
	return {
		variant: "error",
		title: t("Zone not deleted"),
		description: t("The zone could not be deleted — retry in a moment."),
	};
}

// -- custom actions: open and leave a create screen -------------------------------

/** INC-14's promoted button, and E-2's empty-state button — one verb, because
 *  they are one act. No draft: nothing has been typed yet. */
function openCreateZoneAction() {
	return customAction<AdminRulesSurface, ShippingRenderState>(async ({ showList }) => {
		return showList(undefined, undefined, { kind: "new-zone" });
	});
}

/** "← Back to …" on either create screen: re-list the level the button's own
 *  `value` names (the root registry when it carries none). Whatever was typed
 *  is dropped, and only ever by this explicit click. */
function cancelNewAction() {
	return customAction<AdminRulesSurface, ShippingRenderState>(async ({ carriedPath, showList }) =>
		showList(carriedPath),
	);
}

// -- custom action: create a method -----------------------------------------------

function createMethodAction(t: PluginTranslate) {
	return customAction<AdminRulesSurface, ShippingRenderState>(
		async ({ input, carried, client, showList }) => {
			const zoneId = carried?.zoneId;
			if (zoneId === undefined) return showList();
			const values = input.values ?? {};
			const id = (readString(values.id) ?? "").trim();
			const name = (readString(values.name) ?? "").trim();
			const type = readString(values.type) ?? "";
			// EVERY refusal below re-renders the create screen with what was typed
			// (DA-3a-i) — see ShippingRenderState.
			const draft: MethodDraft = {
				id: readString(values.id) ?? "",
				name: readString(values.name) ?? "",
				type,
			};
			if (
				id.length === 0 ||
				name.length === 0 ||
				(type !== "flat_rate" && type !== "free_shipping")
			) {
				return showList(
					[zoneId],
					{
						variant: "error",
						title: t("Method not created"),
						description: t("Enter a method ID, a name, and a valid type."),
					},
					{ kind: "new-method", draft },
				);
			}
			const result = await client.createMethod(zoneId, { id, name, type });
			const notice = createMethodNotice(t, result, id, name);
			return result.ok
				? showList([zoneId], notice)
				: showList([zoneId], notice, { kind: "new-method", draft });
		},
	);
}

function createMethodNotice(
	t: PluginTranslate,
	result: RulesCreateResult<ShippingMethodWire>,
	id: string,
	name: string,
): Notice {
	if (result.ok) {
		return {
			variant: "default",
			title: t("Method created"),
			description: t('"{name}" ({id}) was added.', { name: name, id: id }),
		};
	}
	return {
		variant: "error",
		title: t("Method not created"),
		description: t(
			'Could not create "{id}" — check the method ID isn\'t already in use, then try again.',
			{ id: id },
		),
	};
}

// -- custom action: edit a method (LWW) --------------------------------------------

function saveMethodAction(t: PluginTranslate) {
	return customAction<AdminRulesSurface>(async ({ input, carried, client, showList }) => {
		const zoneId = carried?.zoneId;
		const methodId = carried?.methodId;
		if (zoneId === undefined || methodId === undefined) return showList();
		const values = input.values ?? {};
		const name = (readString(values.name) ?? "").trim();
		const type = readString(values.type) ?? "";
		if (name.length === 0 || (type !== "flat_rate" && type !== "free_shipping")) {
			return showList([zoneId], {
				variant: "error",
				title: t("Method not saved"),
				description: t("Enter a name and a valid type."),
			});
		}
		const result = await client.updateMethod(methodId, { name, type });
		return showList([zoneId], saveMethodNotice(t, result));
	});
}

function saveMethodNotice(
	t: PluginTranslate,
	result: RulesUpdateResult<ShippingMethodWire>,
): Notice {
	if (result.ok) {
		return {
			variant: "default",
			title: t("Method saved"),
			description: t("The method was updated."),
		};
	}
	if (result.reason === "not_found") {
		return {
			variant: "error",
			title: t("Method not found"),
			description: t("This method no longer exists — it may have already been deleted."),
		};
	}
	return {
		variant: "error",
		title: t("Method not saved"),
		description: t("The change could not be saved — retry in a moment."),
	};
}

// -- custom action: delete a method (forbid-if-rates) -------------------------------

function deleteMethodAction(t: PluginTranslate) {
	return customAction<AdminRulesSurface>(async ({ input, client, showList }) => {
		const payload = asRecord(input.value);
		const zoneId = readString(payload?.zoneId);
		const methodId = readString(payload?.methodId);
		if (zoneId === undefined || methodId === undefined) return showList();
		const result = await client.deleteMethod(methodId);
		return showList([zoneId], deleteMethodNotice(t, result));
	});
}

function deleteMethodNotice(t: PluginTranslate, result: RulesDeleteResult): Notice {
	if (result.ok) {
		return {
			variant: "default",
			title: t("Method deleted"),
			description: t("The method was removed."),
		};
	}
	if (result.reason === "not_found") {
		return {
			variant: "default",
			title: t("Already deleted"),
			description: t("This method was already removed."),
		};
	}
	if (result.reason === "in_use") {
		return {
			variant: "error",
			title: t("Method not deleted"),
			description: t("This method still has rates — delete its rates first, then retry."),
		};
	}
	return {
		variant: "error",
		title: t("Method not deleted"),
		description: t("The method could not be deleted — retry in a moment."),
	};
}

// -- custom action: open the "New shipping method" create screen ------------------

/** INC-14's promoted button, and E-2's empty-state button. Both carry the zone
 *  path in `value` (L-6): without it the create screen would open at the root
 *  registry, which is the one failure this level's depth makes possible. */
function openCreateMethodAction() {
	return customAction<AdminRulesSurface, ShippingRenderState>(async ({ carriedPath, showList }) => {
		return showList(carriedPath, undefined, { kind: "new-method" });
	});
}

// -- custom action: create a rate ---------------------------------------------------

function createRateAction(t: PluginTranslate) {
	return customAction<AdminRulesSurface>(async ({ input, carried, client, showList }) => {
		const zoneId = carried?.zoneId;
		const methodId = carried?.methodId;
		if (zoneId === undefined || methodId === undefined) return showList();
		const values = input.values ?? {};
		const currency = (readString(values.currency) ?? "").trim().toUpperCase();
		if (!/^[A-Z]{3}$/.test(currency)) {
			return showList([zoneId, methodId], {
				variant: "error",
				title: t("Rate not created"),
				description: t("Currency must be a 3-letter ISO-4217 code like USD."),
			});
		}
		const amountCents = parseAmountInput(readString(values.amount) ?? "");
		if (amountCents === null) {
			return showList([zoneId, methodId], {
				variant: "error",
				title: t("Rate not created"),
				description: t(
					"Amount must be 0 or a positive number like 4.99 (up to two decimal places).",
				),
			});
		}
		const minSubtotalRaw = (readString(values.minSubtotal) ?? "").trim();
		let minSubtotalCents: number | null = null;
		if (minSubtotalRaw.length > 0) {
			minSubtotalCents = parseAmountInput(minSubtotalRaw);
			if (minSubtotalCents === null) {
				return showList([zoneId, methodId], {
					variant: "error",
					title: t("Rate not created"),
					description: t(
						"Free-shipping threshold must be 0 or a positive number like 35.00, or blank for none.",
					),
				});
			}
		}
		const result = await client.createRate(methodId, { currency, amountCents, minSubtotalCents });
		return showList([zoneId, methodId], createRateNotice(t, result, currency));
	});
}

function createRateNotice(
	t: PluginTranslate,
	result: RulesCreateResult<ShippingRateWire>,
	currency: string,
): Notice {
	if (result.ok) {
		return {
			variant: "default",
			title: t("Rate created"),
			description: t("The {currency} rate was added.", { currency: currency }),
		};
	}
	return {
		variant: "error",
		title: t("Rate not created"),
		description: t(
			"Could not create a {currency} rate — check a rate for this currency doesn't already exist, then try again.",
			{ currency: currency },
		),
	};
}

// -- custom action: edit a rate (CAS on amountCents) ---------------------------------

function saveRateAction(t: PluginTranslate) {
	return customAction<AdminRulesSurface>(async ({ input, carried, client, showList }) => {
		const zoneId = carried?.zoneId;
		const methodId = carried?.methodId;
		const currency = carried?.currency;
		const expectedAmountCentsRaw = carried?.expectedAmountCents;
		if (
			zoneId === undefined ||
			methodId === undefined ||
			currency === undefined ||
			expectedAmountCentsRaw === undefined
		) {
			return showList();
		}
		const expectedAmountCents = Number.parseInt(expectedAmountCentsRaw, 10);
		const values = input.values ?? {};
		const amountCents = parseAmountInput(readString(values.amount) ?? "");
		if (amountCents === null) {
			return showList([zoneId, methodId], {
				variant: "error",
				title: t("Rate not saved"),
				description: t(
					"Amount must be 0 or a positive number like 4.99 (up to two decimal places).",
				),
			});
		}
		const minSubtotalRaw = (readString(values.minSubtotal) ?? "").trim();
		let minSubtotalCents: number | null = null;
		if (minSubtotalRaw.length > 0) {
			minSubtotalCents = parseAmountInput(minSubtotalRaw);
			if (minSubtotalCents === null) {
				return showList([zoneId, methodId], {
					variant: "error",
					title: t("Rate not saved"),
					description: t(
						"Free-shipping threshold must be 0 or a positive number like 35.00, or blank for none.",
					),
				});
			}
		}
		const result = await client.updateRate(methodId, currency, {
			amountCents,
			minSubtotalCents,
			expectedAmountCents,
		});
		return showList([zoneId, methodId], saveRateNotice(t, result));
	});
}

function saveRateNotice(
	t: PluginTranslate,
	result: RulesCasUpdateResult<ShippingRateWire>,
): Notice {
	if (result.ok) {
		return {
			variant: "default",
			title: t("Rate saved"),
			description: t("The shipping rate was updated."),
		};
	}
	if (result.reason === "stale") {
		return {
			variant: "error",
			title: t("This rate changed since you loaded it — reload"),
			description: t(
				"Your edit was NOT applied — the latest value is shown below. Re-apply your change and save again.",
			),
		};
	}
	if (result.reason === "not_found") {
		return {
			variant: "error",
			title: t("Rate not found"),
			description: t("This shipping rate no longer exists — it may have already been deleted."),
		};
	}
	return {
		variant: "error",
		title: t("Rate not saved"),
		description: t("The change could not be saved — retry in a moment."),
	};
}

// -- custom action: delete a rate ------------------------------------------------------

function deleteRateAction(t: PluginTranslate) {
	return customAction<AdminRulesSurface>(async ({ input, client, showList }) => {
		const payload = asRecord(input.value);
		const zoneId = readString(payload?.zoneId);
		const methodId = readString(payload?.methodId);
		const currency = readString(payload?.currency);
		if (zoneId === undefined || methodId === undefined || currency === undefined) return showList();
		const result = await client.deleteRate(methodId, currency);
		return showList([zoneId, methodId], deleteRateNotice(t, result));
	});
}

function deleteRateNotice(t: PluginTranslate, result: RulesDeleteResult): Notice {
	if (result.ok) {
		return {
			variant: "default",
			title: t("Rate deleted"),
			description: t("The shipping rate was removed."),
		};
	}
	if (result.reason === "not_found") {
		return {
			variant: "default",
			title: t("Already deleted"),
			description: t("This shipping rate was already removed."),
		};
	}
	return {
		variant: "error",
		title: t("Rate not deleted"),
		description: t("The rate could not be deleted — retry in a moment."),
	};
}

// -- regions (opaque, string[]-or-null) helpers ---------------------------------

/**
 * The regions input → the ISO codes to store (ADR-0021), or a refusal the
 * screen shows as-is. Two checks, both before any write:
 *  - every token is a country or a real `CC-SUB` code (the domain's
 *    `validateZoneRegionsInput`) — each bad token is named, with a hint;
 *  - no code is already listed by ANOTHER zone: an overlap would make an
 *    address match two zones (checkout would take the lowest id and log it).
 * Blank ⇒ `null` (no regions — a zone that matches no address).
 */
async function checkZoneRegions(
	t: PluginTranslate,
	client: AdminRulesSurface,
	raw: string,
	selfId: string | null,
): Promise<
	{ ok: true; codes: string[] | null } | { ok: false; notice: (title: string) => Notice }
> {
	const validated = validateZoneRegionsInput(raw);
	if (!validated.ok) {
		const bad = validated.invalid.map((token) => regionHint(t, token)).join("; ");
		return {
			ok: false,
			notice: (title) => ({
				variant: "error",
				title,
				description: t(
					"Not ISO region codes: {bad}. Use a country code (US) or a state/province code (US-CA).",
					{ bad: bad },
				),
			}),
		};
	}
	if (validated.codes === null) return { ok: true, codes: null };
	const zones = await client.listZones();
	for (const other of zones) {
		if (other.id === selfId) continue;
		const theirs = parseZoneRegions(other.regions).codes;
		const shared = validated.codes.find((code) => theirs.includes(code));
		if (shared !== undefined) {
			return {
				ok: false,
				notice: (title) => ({
					variant: "error",
					title,
					description: t(
						'{shared} is already in the zone "{name}" ({id}). A code can belong to one zone only — remove it there first.',
						{ shared: shared, name: other.name, id: other.id },
					),
				}),
			};
		}
	}
	return { ok: true, codes: validated.codes };
}

/** One refused token, with the likeliest fix. */
function regionHint(t: PluginTranslate, token: string): string {
	const upper = token.trim().toUpperCase();
	if (upper === "UK") return t("UK (use GB)");
	if (upper === "EU") return t("EU (not a country — list its countries)");
	const prefixed = /^([A-Z]{2})-/.exec(upper);
	if (prefixed !== null && COUNTRY_CODES.has(prefixed[1] ?? "")) {
		return t("{token} (not a {value2} subdivision)", { token: token, value2: prefixed[1] ?? "" });
	}
	return t("{token} (not a code)", { token: token });
}

/** What a stored zone matches, for its row: its valid codes, and every legacy
 *  token labelled as never matching. */
function zoneMatchSummary(t: PluginTranslate, regions: unknown): string {
	const { codes, invalid } = parseZoneRegions(regions);
	const matches =
		codes.length > 0 ? t("Matches: {items}", { items: codes.join(", ") }) : t("Matches no address");
	const legacy = invalid.map((token) =>
		t("{token} (not a region code — never matches)", { token }),
	);
	return [matches, ...legacy].join(" · ");
}

/**
 * The landing (and methods-screen) warnings about zone regions checkout cannot
 * use (ADR-0021), in this order:
 *  - a zone that MATCHES NO ADDRESS — no valid code at all (`null`, `[]`, or
 *    only legacy text). Before ADR-0021 a blank regions list was normal; now
 *    such a zone's methods are never offered, and a store whose zones all match
 *    nothing refuses every physical checkout;
 *  - stored tokens that are not codes (zones written before the rule).
 */
function zoneRegionWarnings(
	t: PluginTranslate,
	zones: ReadonlyArray<ShippingZoneWire>,
): BannerBlock[] {
	const warnings: BannerBlock[] = [];
	const unmatched = zones.filter((zone) => parseZoneRegions(zone.regions).codes.length === 0);
	if (unmatched.length > 0) {
		warnings.push({
			type: "banner",
			block_id: NO_MATCH_ZONES_BLOCK_ID,
			variant: "alert",
			title: t("Some zones match no address"),
			description: fitDescription(
				t,
				t(
					"These zones list no ISO code, so no order can be delivered through them. Add codes such as US, US-CA: ",
				),
				unmatched.map((zone) => `${zone.name} (${zone.id})`),
			),
		});
	}
	const legacy = legacyRegionsWarning(t, zones);
	if (legacy !== null) warnings.push(legacy);
	return warnings;
}

const NO_MATCH_ZONES_BLOCK_ID = "ship:no-match-zones";

/** A banner description's budget (X-11, §1). */
const BANNER_DESCRIPTION_MAX = 240;

/**
 * `prefix` + as many entries as fit, then "and N more" + ".", within the banner
 * budget — a store can have any number of affected zones, with names of any
 * length. At least the first entry's name is attempted; an entry that alone
 * would overflow is cut to fit.
 */
function fitDescription(t: PluginTranslate, prefix: string, entries: readonly string[]): string {
	const room = BANNER_DESCRIPTION_MAX - prefix.length - 1; // the closing "."
	const shown: string[] = [];
	for (const [i, entry] of entries.entries()) {
		const rest = entries.length - i - 1;
		const tail = rest > 0 ? t("; and {count} more", { count: rest }) : "";
		const candidate = [...shown, entry].join("; ") + tail;
		if (candidate.length <= room) {
			shown.push(entry);
			continue;
		}
		if (shown.length === 0) {
			// The first entry alone overflows: show as much of it as fits.
			const cut = entry.slice(0, Math.max(0, room - tail.length - 1));
			return `${prefix}${cut}…${tail}.`;
		}
		return `${prefix}${shown.join("; ")}${t("; and {count} more", { count: entries.length - shown.length })}.`;
	}
	return `${prefix}${shown.join("; ")}.`;
}

/** Stored region tokens that are not codes, or `null` when there are none. */
function legacyRegionsWarning(
	t: PluginTranslate,
	zones: ReadonlyArray<ShippingZoneWire>,
): BannerBlock | null {
	const affected = zones
		.map((zone) => ({ zone, invalid: parseZoneRegions(zone.regions).invalid }))
		.filter((entry) => entry.invalid.length > 0);
	if (affected.length === 0) return null;
	return {
		type: "banner",
		block_id: LEGACY_REGIONS_BLOCK_ID,
		variant: "alert",
		title: t("Some zone regions can never match an address"),
		description: fitDescription(
			t,
			t(
				"These entries are not ISO codes, so they never match an address. Replace them with codes (e.g. US, US-CA): ",
			),
			affected.map(({ zone, invalid }) => `${zone.name} (${zone.id}): ${invalid.join(", ")}`),
		),
	};
}

const LEGACY_REGIONS_BLOCK_ID = "ship:legacy-regions";

/**
 * The methods screen's zone, looked up by `fetchPage` for its warning. Keyed by
 * the rows array the level hands `render` (the scaffold passes it through by
 * reference), because `render` is synchronous and the level's rows are methods,
 * not the zone. Weak, so a render's entry dies with it.
 */
const METHODS_ZONE = new WeakMap<object, ShippingZoneWire>();

/** Pre-fill the regions text input from whatever the wire returned — only a
 *  `string[]` round-trips to a comma list; anything else (a legacy shape, or
 *  simply absent) renders blank rather than guessing. */
function formatRegionsForInput(regions: unknown): string {
	if (Array.isArray(regions) && regions.every((r): r is string => typeof r === "string")) {
		return regions.join(", ");
	}
	return "";
}

/** The zones-list column summary — honest about non-array/absent shapes
 *  rather than silently rendering "—" for a legacy non-array value. */
function regionsSummary(t: PluginTranslate, regions: unknown): string {
	if (Array.isArray(regions)) {
		return regions.length > 0 ? regions.join(", ") : t("— (none)");
	}
	if (regions === null || regions === undefined) return t("— (none)");
	return typeof regions === "string" ? regions : JSON.stringify(regions);
}

// -- money input parsing (NO float arithmetic — CLAUDE.md) ----------------------
// The exact-integer-string parse/format pair lives in `./money-input.js`,
// SHARED with the Products console; the one behavioral fork (whether zero is
// a valid amount) is that module's explicit `allowZero` parameter. This thin
// wrapper pins the Shipping screens' choice — ZERO is accepted (a $0 flat
// rate, or a free-shipping method's below-threshold fallback, are both
// legitimate; the service's own `shippingRateBody`/`shippingRateUpdateBody`
// schemas use `nonnegative()`, not `positive()`) — in one place instead of at
// every call site.

/** Parse a merchant-entered decimal amount into integer minor units; null
 *  for any non-conforming or NEGATIVE input (never throws). */
function parseAmountInput(input: string): number | null {
	return parseMinorUnitsInput(input, { allowZero: true });
}

/** Display-format (with currency symbol) for the rate readout — falls back to
 *  a plain `CUR amount` string if `Intl`/the branding constructors reject the
 *  wire value (never throws into the render path). */
function formatCentsForDisplay(
	t: PluginTranslate,
	minorUnits: number,
	currencyCode: string,
): string {
	try {
		return formatMoney(toCents(minorUnits), toCurrency(currencyCode), moneyLocale(t));
	} catch {
		return `${currencyCode} ${formatMinorUnitsInput(minorUnits)}`;
	}
}
