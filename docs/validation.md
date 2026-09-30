# Validation record

Status: the foundation is integrated, independently reviewed and validated locally. All stated combined gates and fresh browser acceptance pass. No production deployment or external account acceptance is implied.

## Reproduce the combined gates

Use the locked workspace and a Node runtime whose native SQLite ABI matches its installed `better-sqlite3` binary. This run uses Node 26.9.0, pnpm 11.10.0 and pinned EmDash 1.0.1. PostgreSQL is deliberately unset for the SQLite/workerd run.

Run typecheck and build sequentially in one checkout: the package bundler cleans `dist`, which contains TypeScript's referenced declarations. Concurrent execution can delete declarations while another compiler consumes them. Rebuilding those declarations with `pnpm exec tsc -b --force` repairs that local tooling state; it is not a source-code fix.

```sh
pnpm lint
pnpm typecheck
pnpm format:check
pnpm exec vitest run --maxWorkers=3
pnpm -C packages/store-emdash exec vitest run --config vitest.d1.config.ts --fileParallelism=false
pnpm build
```

The workspace Vitest tier includes pure domain contracts, actual migrated SQLite stores, workerd plugin routes, React DOM behavior, invoice HTTP/job contracts, Woo HTTP/persistence/signatures and theme endpoints. The separate D1 tier exercises the adapter against local workerd/D1. Optional PostgreSQL suites require an isolated `PG_CONNECTION_STRING`; they were not run here. SQLite cases that require simultaneous database writers remain conditional; deterministic parked-CAS crash/interleaving cases still run on SQLite and D1.

One inherited `test.todo` remains: issue #287, a reports widget whose low-stock settings read fails. It is explicitly outside the passing count. The audited upstream baseline also had sandbox cleanup timeouts. This fork adds bounded teardown for its local test harness; final gate results below report the current branch rather than treating that old baseline as permission to skip checks. See [source comparison](research/2026-09-30-codebase-audit.md).

The final workspace/build gates pass against source revision `5a6398c`, including the browser-discovered guest-contact fix. The separate D1 gate passed at `c254540`; its adapter and test sources are unchanged by the final Woo contact projection:

| Gate | Result |
| --- | --- |
| TypeScript workspace and E2E types | Passed |
| Lint and dependency boundaries | Passed; 1,691 modules / 3,728 dependencies |
| Formatting | Passed; 800 matched files |
| Workspace Vitest | 292 files passed; 17 skipped. 5,581 tests passed; 975 skipped; 1 inherited TODO. 100.83 seconds |
| Local workerd/D1 | 25 files and 662 tests passed. 188.45 seconds |
| Package and Astro production build | Passed, including generated declarations, Astro check and Cloudflare server/assets build |
| Fresh local browser retail, merchant and Woo smoke | Passed; bank/COD, native variant purchase/receipt replay, merchant stock intents, scoped Woo reads and guest contact |
| Committed Playwright harness and checkout-origin regression | 12 tests passed; 2.5 seconds |

## Browser acceptance

Local browser checks use isolated Chrome contexts and the actual reference site's HTTP routes. No browser provider response or native commerce state is mocked. EmDash's local development sign-in is used only at loopback; the first-visit welcome dialog is dismissed before exercising the merchant controls. Invoice issuance and external webhook/email destinations are disabled.

The exercised workflows are:

- Buy a EUR 18.00 inclusive-price physical product with HR delivery: EUR 14.40 net goods, EUR 3.00 net shipping and EUR 4.35 VAT give EUR 21.75 total. Bank transfer stays pending until an exact private receipt; COD can advance to unpaid processing, then record its receipt without regressing fulfillment.
- Declare Blue / large and Red / small in CMS content. Save Blue's SKU and EUR 20.00 inclusive price in the merchant console; add its stock through the confirmation dialog. Leave Red unpriced. The storefront exposes the priced variant, preserves its SKU through cart/checkout, and freezes its selected title/amount.
- Save Blue's price at EUR 20.01 and back to EUR 20.00. In both parent and variant stock controls, add three, remove three and add three again through actual confirmation dialogs. Each confirmed intent has a distinct UUID and the native count changes for every intent, including returning to a prior count.
- Buy one Blue item with the same shipping profile: EUR 16.00 net goods and EUR 4.75 combined VAT give EUR 23.75 total. A repeated old receipt command cannot capture or deduct stock twice. The public order page omits operator attribution, and an anonymous merchant write is rejected with 401.
- Read the mounted Woo API using local dummy consumer credentials: anonymous reads return 401; authenticated responses carry pagination headers, paid/offline state, frozen guest email, billing country, decimal net prices, reconciled totals and a persistent variation ID matching the selected product variation. This does not substitute for the vendor's actual import/write profile.

The browser origin/privacy regression is committed as `sites/staging/e2e/checkout-origin.spec.ts`. It submits a real invalid checkout form so no order/provider request is possible, proving that the browser supplies the store's own Origin and reaches validation. A locally fulfilled external-link probe confirms that the checkout URL is not sent as Referer. The old `no-referrer` document policy generated `Origin:null` in Chromium; the corrected `same-origin` policy preserves the existing origin guard.

```sh
OTTA_E2E_BASE_URL=http://127.0.0.1:4500 OTTA_E2E_REQUIRE_SITE=1 \
  pnpm exec playwright test sites/staging/e2e/harness.spec.ts sites/staging/e2e/checkout-origin.spec.ts
```

The browser policy case requires a priced/stocked demo mug and HR shipping configuration. The full retail smoke above additionally requires the stated VAT/flat-shipping/offline settings and a disposable local database. The harness verifies that the dev server belongs to this checkout. The server-free harness contract has 11 passing tests; the browser policy regression has 1 passing test. The final combined Playwright run passed all 12 on the rebuilt shop. Browser contexts were isolated, external destinations were disabled, and the purchase checks recorded zero external browser requests.

## Review and external boundaries

Independent reviews reproduce the inventory movement/adoption, refund lifecycle/reporting and merchant replay boundaries on actual native stores. Review findings receive focused failing regression tests before fixes are integrated; final combined gates are run after those commits.

No Critical or Important findings remain in the reviewed slices. The last reserve reviewer reran the original stranded-hold reproduction against the integrated root, plus 86 SQLite and 78 D1 cases. Separate reviews covered the financial journal, terminal inventory winner/count bounds, merchant command identities and product edit watermarks.

The fresh variant browser check then reproduced a missing Woo billing email for a real guest order. Two migrated-SQLite HTTP cases fail before the fix; five guest-contact cases cover empty billing/address, explicit frozen billing contact, opaque claims and projection overrides. The projection is read-only and never reconstructs contact data from a current customer profile.

Independent review of `5a6398c` found no Critical or Important issue and reran all 28 native SQLite/HTTP and 43 Woo compatibility tests.

Six deterministic native SQLite/D1 regressions reproduce stale product/variant drafts after same-tick merchant edits, CMS refreshes, clock rollback and returning price/metadata values. They fail before the monotonic edit-token fix; no arbitrary delay is added to hide a real-clock conflict.

Twelve additional native SQLite/D1 cases exercise completion of abandoned reserve claims: opposing out-of-stock/success schedules, interrupted durable receipt writes and witness eviction, every movement-ring writer, and SKU transfer/recovery. The original six race/eviction cases fail against the preceding implementation. The corrected SKU CAS preserves one decision and stock conservation even when a peer returns stock before the terminal receipt is written.

No real Stripe charge/refund, Solo/e-racuni invoice, provider email, ERP stock synchronization, carrier purchase, backup restoration or production deploy was executed. A successful local schema migration is not a production migration/restore drill. [Integration acceptance](integrations.md) and [operations](operations.md) describe the remaining account/deployment gates.
