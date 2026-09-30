# Testing and releases

Tests prove local behavior at a stated source/configuration. Production deployment and account-specific provider acceptance are separate evidence. The [validation record](../validation.md) reports the current foundation's coverage and limits.

## Test tiers

| Tier | Command | Evidence |
| --- | --- | --- |
| Lint/dependency boundaries | `pnpm lint` | Domain purity and source lint. |
| Formatting | `pnpm format:check` | Repository formatter policy. |
| TypeScript | `pnpm typecheck` | Workspace project references, branded money and E2E types. |
| Workspace contracts | `pnpm exec vitest run --maxWorkers=3` | Domain behavior, real SQLite adapters, workerd plugin routes, React, invoice/Woo and theme contracts. |
| PostgreSQL concurrency | `PG_CONNECTION_STRING=<disposable-url> pnpm test:pg` | Actual concurrent database writers and shared store contracts. |
| Worker/D1 contracts | `pnpm -C packages/store-emdash exec vitest run --config vitest.d1.config.ts --fileParallelism=false` | Host storage and reservations on local workerd/D1. |
| Package/reference build | `pnpm build` | Declarations, package bundles, Astro checks and Cloudflare server/assets. |
| Browser contracts | `pnpm test:e2e` | Server-free harness plus configured browser cases; skips must be reported. |

Run typecheck and build sequentially in one checkout; the bundler removes generated declarations. Keep sandbox/Worker concurrency bounded rather than deleting test files or weakening timeouts. Do not count skipped PostgreSQL/live-browser suites as passing acceptance.

## Focused regression development

Start with the failing behavior and exercise the affected seam. Pure domain tests can use deterministic port fixtures; storage contracts must use migrated real stores. Extend a shared contract when behavior applies to all storage dialects. The [SQLite/PostgreSQL harness](../../packages/store-emdash/test/describe-each-dialect.ts) and [D1 configuration](../../packages/store-emdash/vitest.d1.config.ts) show the actual host setup.

For inventory, include replay, competing terminal decisions, abandonment, witness durability and conservation. For payments/refunds, distinguish requested/pending/failed/confirmed outcomes and correlate exact order/amount/currency. For invoices and webhooks, inject HTTP transport, interrupt around remote completion and verify durable retry/reconciliation.

Run the narrow cases while editing and the required combined gates before release. Documentation/metadata changes need link/configuration/format review, not assertions that simply mirror written text.

## Browser acceptance

Install the pinned browser tooling with `pnpm exec playwright install chromium`. Use a disposable local shop, enable the necessary payment/tax/shipping settings and seed commercial SKU/price/stock. The [harness](../../sites/staging/e2e/harness.ts) checks loopback endpoints and that the responding dev server belongs to this checkout.

`OTTA_E2E_REQUIRE_SITE=1` turns missing-site skips into failures. `OTTA_E2E_START_STACK=1` can let Playwright own the foreground dev server; it does not configure the shop or merchant sign-in fixture for you. The base URL and seeded contents must match the selected cases.

The committed harness and checkout-origin regression can be run as documented in [validation](../validation.md):

```sh
OTTA_E2E_BASE_URL=http://127.0.0.1:4500 OTTA_E2E_REQUIRE_SITE=1   pnpm exec playwright test sites/staging/e2e/harness.spec.ts sites/staging/e2e/checkout-origin.spec.ts
```

That case needs the configured demo mug and HR shipping rules described in the validation record. The full retail smoke additionally checks variant purchase, bank/COD receipts/replay, private merchant actions and Woo projections. Do not substitute a green server-free harness for a real configured checkout run.

The interface regressions use the same disposable shop. They cover shopper language persistence, private receipt navigation, unchanged catalog identities, and the merchant preference across React and sandboxed pages:

```sh
OTTA_E2E_BASE_URL=http://127.0.0.1:4500 OTTA_E2E_REQUIRE_SITE=1 \
  pnpm exec playwright test sites/staging/e2e/storefront-language.spec.ts sites/staging/e2e/merchant-language.spec.ts
```

These cases require the priced/stocked demo mug and a populated merchant catalog. They use the harness's sign-in-only development route and do not reseed the shop on each login or issue provider transactions.

## CI

[The GitHub workflow](../../.github/workflows/ci.yml) runs unit checks/builds/workspace tests, a dependent PostgreSQL integration job and an independent D1 gate. D1 runs on `main` pushes, PRs targeting `main`, manual dispatch and nightly. The workflow uses read-only repository permissions and no payment/accounting secrets.

Repository branch protection can require the `unit`, `integration` and `d1` checks. Configure that policy for the chosen collaboration/release model; a workflow file alone does not enable branch protection. A failed or skipped required acceptance tier must remain visible in release notes.

## Release procedure

1. Review the final diff, source attribution, supported profile and migrations. Run the relevant complete gates and record the source commit, environment and exact results.
2. Update [CHANGELOG.md](../../CHANGELOG.md), public documentation and [NOTICE.md](../../NOTICE.md) for imported code/data. Package names and current versions are inherited; a WSCommerce package publication needs a separately chosen owned npm scope/version plan. Do not publish upstream scopes.
3. Confirm one invoice owner, provider-host grants, runtime secrets and account acceptance in a test organization. Test duplicate/out-of-order provider events, unknown issuance, pending refunds and receiver delivery replay.
4. Verify backup/restore and forward data compatibility with [operations](../operations.md). Preserve external numeric IDs, native snapshots, jobs and replay records.
5. Follow [DEPLOYMENT.md](../../DEPLOYMENT.md): select the real local resource configuration during build, set secrets against that configuration, then deploy using the adapter's generated redirect. Claim the admin immediately for a fresh site and confirm all scheduled tasks.
6. Run the deployed storefront/admin/provider smoke and record any unresolved limit before directing real shoppers to it. A successful repository push or local build is not that acceptance.

Avoid overlapping old/new Workers across an incompatible stored-schema migration. Rollback requires the documented data/reporting reconciliation, not only switching the code revision. Versioned Git releases may identify source deployments; publishing this repository does not automatically publish npm packages, deploy a store or activate external providers.
