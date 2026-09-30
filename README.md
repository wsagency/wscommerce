# EmDash Commerce

Reusable TypeScript commerce for EmDash 1.0.1 on Cloudflare Workers, D1 and R2. This independent MIT fork preserves Otta history and attribution. Existing `@otta-sh/*` names and plugin ID `otta` remain stable in this first integration.

## Modules

| Module | Responsibility |
| --- | --- |
| `packages/domain` | Integer money, quotes, coupons, shipping, tax, checkout, inventory and order rules |
| `packages/store-emdash` | Native aggregates, compare-and-set writes and durable replay witnesses |
| `packages/plugin` | EmDash hooks, admin/storefront routes, cron and integrations |
| `packages/admin-react` | React product, stock and order console |
| `packages/payments-stripe` | PaymentIntents, verified settlement and truthful refunds |
| `packages/invoicing` | Frozen invoice snapshots, durable jobs, Solo and e-racuni clients |
| `packages/compat-woocommerce` | Selected REST v3 profile, numeric IDs, metadata and signed webhooks |
| `sites/staging` | Runnable Astro reference shop and Cloudflare host adapters |

Catalog content belongs to EmDash; commercial state belongs to commerce. Every shop owns a Worker, database, media bucket and credentials. Historic order amounts and billing are immutable evidence, never recomputed from today's catalog or customer address book.

## Retail workflows

Products and sellable variants have native prices and stock. The reference shop carries the selected variant through cart, shipping/coupon quotes, separate billing details, checkout and order instructions. Inclusive and exclusive retail prices can coexist; each order freezes its net amount, VAT rate, rounding and gross total. A billing destination is required for taxable digital checkout too.

Stripe uses verified settlement and provider-confirmed refund states. Bank transfer and cash on delivery have explicit instructions and payment windows. Bank orders remain pending until an exact private receipt; COD orders can be accepted for dispatch while unpaid. Receipt replay cannot capture twice, and frozen stock quantities are checked before either transition. Unpaid COD is excluded from revenue.

Shipping supports configured flat rates and threshold-based free shipping. A separately named zero-priced flat rate can represent domestic collection, but checkout still requires an address; a dedicated pickup flow and carrier label API need further implementation and account acceptance.

## Run and validate

```sh
pnpm install --frozen-lockfile
pnpm -C sites/staging dev
```

Complete EmDash's first-run setup at the printed local URL. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for local storage, sample seed and Cloudflare provisioning. Tracked resource IDs are placeholders. Use a supported Node version and a matching native SQLite build for SQLite tests.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm -C packages/store-emdash test:d1
pnpm build
```

PostgreSQL, deployment and provider acceptance need separately configured environments. No live invoice or payment provider is enabled by default.

## Core integration contracts

[WooCommerce compatibility](packages/compat-woocommerce/README.md) is a core **HTTP compatibility profile**, including `/wp-json/wc/v3`, discovery and signed order webhooks. It targets remote accounting connectors such as modern e-racuni WooCommerce. It does not execute WordPress PHP, filters, `$wpdb`, arbitrary Woo plugins, Store API or legacy API. Vendor-account acceptance remains a release gate.

[Integration setup](docs/integrations.md) documents secrets, supported billing profiles and reconciliation. Select exactly one invoice owner: `disabled`, `solo`, `e-racuni`, `woocommerce-connector`. Connector ownership disables direct issuance. Unknown Solo issuance requires reconciliation instead of an automatic duplicate request.

The initial release prioritizes physical retail checkout and accounting. Marketplace settlement, subscriptions, generalized EU B2B tax, automatic fiscal certificates, carrier labels and complete digital-file delivery require further modules and acceptance tests. WooCommerce ecosystem support is not evidence of implementation here.

See the [approved design](docs/superpowers/specs/2026-09-30-emdash-commerce-design.md), [implementation plan](docs/superpowers/plans/2026-09-30-emdash-commerce-foundation.md), [source comparison](docs/research/2026-09-30-codebase-audit.md), [provenance](NOTICE.md), [operations](docs/operations.md) and [validation record](docs/validation.md). Follow [DEVELOPMENT.md](DEVELOPMENT.md); decisions live in [adr](adr/README.md). The original introduction is archived in [upstream README](docs/research/upstream-otta-readme.md).
