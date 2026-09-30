# WSCommerce React merchant console

This package provides the native EmDash Orders and Pricing & inventory pages. It calls the existing authenticated commerce admin route; localization does not introduce another data path or change native mutation payloads.

## English and Croatian presentation

Both screens expose a labeled EN/HR choice and set `lang` on the commerce renderer. The choice writes the `wscommerce_admin_locale` cookie with a one-year lifetime, `Path=/` and `SameSite=Lax`; HTTPS adds `Secure`. Local storage under the same key is a fallback. The cookie takes priority so sandboxed commerce pages and React pages share one preference. Restricted storage does not prevent the mounted page from switching language.

`AdminLocaleProvider`, `AdminLanguageChoice`, `useAdminLocale` and `useAdminPresentation` are exported from `@otta-sh/admin-react/admin`. Direct components outside a provider retain English behavior, including existing component tests.

```tsx
import { AdminLocaleProvider, AdminLanguageChoice } from "@otta-sh/admin-react/admin";

<AdminLocaleProvider initialLocale="hr">
  <AdminLanguageChoice />
  <MerchantPanel />
</AdminLocaleProvider>;
```

Use `useAdminLocale().t` for typed authored templates and `useAdminPresentation()` for shared copy and formatters. The exact authored-string adapter is only for controlled interface labels and notices. Plugin actions compose their human notices with the request's language preference; already translated copy passes through unchanged. Browser transport failures keep client-owned presentation metadata outside the unchanged failure object. Their HTTP recovery instructions and network explanations can switch language while server/provider diagnostics remain literal. Unknown plugin notices also pass through unchanged.

Customer names, product and variant titles, SKUs, tax-class names, notes, merchant instructions, addresses and frozen financial snapshots are content. They must not enter a translation dictionary. Native option values, action IDs, UUIDs, idempotency keys, URLs and money/quantity input strings remain canonical. Open stock and order confirmations can change language without replacing the queued action.

Focused checks:

```sh
pnpm exec vitest run --project admin-react --project admin-presentation
```

The host CMS editor, sidebar and static plugin descriptors remain owned by EmDash. See [localization](../../docs/development/localization.md) for the repository-wide boundaries and verification guidance.
