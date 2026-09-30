# WSCommerce admin presentation

Dependency-free, IO-free presentation helpers shared by the React console and sandboxed commerce pages. English is the default; supported Croatian regional tags normalize to `hr` and unsupported or malformed preferences fall back to `en`.

```ts
import {
  ADMIN_LOCALE_COOKIE,
  adminMessage,
  adminPresentation,
  normalizeAdminLocale,
} from "@otta-sh/admin-presentation";

const locale = normalizeAdminLocale("hr-HR");
const heading = adminMessage(locale, "Order #{id}", { id: "ord-example" });
const copy = adminPresentation(locale);
const amount = copy.formatAmount(12345, "EUR");
// heading: Narudžba #ord-example
// amount: 123,45 €
// ADMIN_LOCALE_COOKIE: wscommerce_admin_locale
```

`AdminLocale` is `"en" | "hr"`. `adminMessage` checks named template slots at compile time and interpolates supplied values once. Brace-containing identifiers and names remain literal. The dictionary parity test checks that Croatian messages preserve every English named slot.

`adminPresentation(locale)` explicitly projects known module constants and binds pure helpers to the preference. `translateAdminAuthored` performs an exact lookup for controlled authored labels; unknown strings pass through unchanged. Neither helper traverses response objects or translates record data.

Money/date/status/stock helpers accept an optional locale. Dates remain UTC with minute precision. Croatian count words use `Intl.PluralRules`; large display quantities use Croatian number grouping. `formatAdminQuantity` is display-only. Money arithmetic stays in integer minor units, while input parsers and canonical mutation strings keep their existing behavior.

Customer names, titles, SKUs, notes, merchant instructions, coupon codes, provider diagnostics, immutable order snapshots and API enum/action values are outside localization. Call the relevant formatter or template only at explicit presentation slots.

Focused checks:

```sh
pnpm exec vitest run --project admin-presentation
```

See [localization](../../docs/development/localization.md) for preference persistence, plugin request handling and adding messages.
