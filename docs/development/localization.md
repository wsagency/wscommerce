# English and Croatian interfaces

WSCommerce keeps its source identifiers, comments, API contracts and documentation in English. Its reference storefront and commerce merchant interfaces provide English and Croatian presentation. Locale is a display preference; it never identifies a product, changes an order snapshot or selects an accounting owner.

## Reference storefront

The Astro reference shop resolves `en` or `hr` from the `wscommerce_locale` cookie, then the browser's supported `Accept-Language` preferences, then English. Supported regional tags normalize to their language; malformed or unsupported values fall back safely.

The visible language selector posts to `/language`. The route applies the normal same-origin form guard, sets a one-year, site-wide, HttpOnly preference cookie and redirects with HTTP 303. HTTPS cookies are secure. Return targets must be local absolute paths; external URLs, network-path references, malformed escapes and control characters are rejected. The current path and query survive switching, including private order capabilities, except known Stripe redirect-only fields (`payment_intent`, `payment_intent_client_secret`, `redirect_status`), which are discarded. Never move a private token into an external redirect, analytics event or translation service.

Request locale must reach every plugin view model used by a page, including catalog, product, cart, checkout and order. Set the document's `lang` from that same locale and use the locale dictionaries for authored interface copy, accessible labels and errors. Money, country names, dates and quantity phrases use the same presentation language. Locale-dependent responses vary by Cookie and Accept-Language; private checkout/order responses remain private.

The source seams are:

- [`site-locale.ts`](../../sites/staging/src/lib/site-locale.ts): request negotiation, normalization, safe return targets and response variation.
- [`language.ts`](../../sites/staging/src/pages/language.ts): guarded preference write.
- [`Base.astro`](../../sites/staging/src/layouts/Base.astro): document language and persistent navigation.
- The reference site's dictionaries and explicit presentation call sites in `sites/staging/src`.

CMS titles, descriptions, menu labels and operator instructions are authored content. They must not be passed through a generic interface dictionary. The reference demo can supply explicit translated content for its own known seed entries, with source guards that leave customized content untouched. A real shop must maintain its own content translations; interface localization does not automatically translate a merchant's catalog.

## Commerce merchant application

The React orders and pricing/inventory screens expose a language choice. The shared `wscommerce_admin_locale` cookie persists that preference. Local storage provides a client-side fallback. Storefront and merchant preferences are independent so changing a shopping language does not change an operator's workspace.

EmDash strips cookies and authentication headers from plugin request metadata, including trusted plugins. The reference host therefore registers [commerce-locale.ts](../../sites/staging/src/middleware/commerce-locale.ts) through `middleware.outer` in [emdash-options.ts](../../sites/staging/src/emdash-options.ts). It uses the exported [forwardAdminLocale](../../packages/plugin/src/admin/locale-host.ts) helper before EmDash's pipeline: only a POST to the configured commerce admin route receives the normalized `x-wscommerce-admin-locale` header. Authentication still runs normally and its credentials remain stripped from plugin metadata. URL, body bytes, native values and other headers are preserved.

Custom EmDash hosts must install this narrow bridge or explicitly supply `input.locale`. For an Astro host, export the following from its configured outer middleware module:

```ts
import type { MiddlewareHandler } from "astro";
import { forwardAdminLocale } from "@otta-sh/plugin";

export const onRequest: MiddlewareHandler = (context, next) =>
  next(forwardAdminLocale(context.request, "/_emdash/api/plugins/otta/admin"));
```

Set EmDash's `middleware.outer` to that module's path or URL, and pass the actual admin route path if the host uses a different prefix. Only `en` or `hr` crosses this bridge. Never expose raw authentication cookies to the plugin to recover a presentation preference.

Shared presentation utilities live in `@otta-sh/admin-presentation`:

```ts
import { adminMessage, normalizeAdminLocale } from "@otta-sh/admin-presentation";

const locale = normalizeAdminLocale("hr-HR");
const title = adminMessage(locale, "Order #{id}", { id: "ord-example" });
// Narudžba #ord-example
```

`AdminLocale` is `"en" | "hr"`. `adminMessage` accepts a typed, authored English template and requires its named values. It replaces those values once; an identifier or name containing braces remains literal. Formatting helpers accept an optional locale while preserving their English default for existing consumers.

`translateAdminAuthored` is a narrow adapter for known strings produced by shared authored-copy helpers. Use it only where the source of the text is controlled. Do not feed it response objects, product titles, customer names, notes, coupon codes, country codes or provider messages.

Sandboxed Reports, Settings, Coupons, Tax, Shipping and Integrations use a request-local translator in [`localization.ts`](../../packages/plugin/src/admin/localization.ts). Explicit `input.locale` takes priority over the host-forwarded header, then a cookie if a custom host supplies it; absent or invalid preferences resolve to English. Each renderer and action response receives its own translator. No module-level mutable current language is allowed: requests from two merchants may interleave in the same Worker.

Native console mutations compose human notices in the request's language while read DTOs, vocabulary values and native codes remain canonical. Browser-owned HTTP/network failures keep presentation metadata separately from their serialized failure shape: translate the controlled title and recovery instruction, and retain the served diagnostic or network error literally. Never recover translation slots by parsing arbitrary response text.

Native action notices retain the language of the request that produced them; a changed preference applies to subsequent requests. Browser-owned local receipts retain their numeric or authored arguments so they can reformat when the current language changes.

The host's general CMS editor, navigation chrome and static plugin descriptors remain owned by EmDash. These commerce translations do not replace EmDash's own localization layer. Provider/API error codes and machine diagnostics also stay canonical; the interface adds its own translated explanation where available.

## Adding or changing messages

1. Add a failing rendered or DOM case at the surface where a user sees the new behavior.
2. Add the authored English template and its Croatian translation to that surface's dictionary. Keep source keys and named slots English and stable.
3. Translate only at explicit label, description, validation, confirmation or status-display call sites. Render merchant content separately.
4. Use locale-aware date, money and plural helpers. Croatian quantity forms cannot use the English `count === 1` rule.
5. Assert that both languages submit identical native values and preserve financial amounts, IDs, action names and idempotency keys.

For example, translated option labels must retain values such as `bank-transfer`, `cash-on-delivery`, `pending` and `processing`. Display formatting must not feed a localized amount back into a money parser or a Woo/Solo/e-racuni request. A saved invoice or historical order retains its original immutable data when the user changes language.

## Verification

Focused suites cover request negotiation, persistence, redirects, rendered checkout, merchant DOM switching and actual sandbox/native-store handlers. The host bridge regression uses the installed EmDash header sanitizer to verify that the locale survives while authentication headers remain stripped. Add interleaved HR/EN cases for server renderers so a shared-language bug cannot pass serial tests. Exercise long Croatian messages against Block Kit label/banner budgets and small-screen layouts.

Browser acceptance should switch English → Croatian → English on catalog, cart/checkout, private order and merchant screens, navigate between screens, reload, and compare the underlying submitted values. Use a disposable local shop with external providers disabled. See [testing and releases](testing-and-releases.md) and the [validation record](../validation.md) for the distinction between interface checks, database tiers and real account acceptance.
