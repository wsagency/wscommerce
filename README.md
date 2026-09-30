# WSCommerce

**Websolutions Commerce** is an open-source TypeScript commerce platform for [EmDash](https://github.com/emdash-cms/emdash), with a runnable Astro storefront for Cloudflare Workers, D1 and R2.

[![CI](https://github.com/wsagency/wscommerce/actions/workflows/ci.yml/badge.svg)](https://github.com/wsagency/wscommerce/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Buy the author a coffee](https://img.shields.io/badge/Ko--fi-Buy%20a%20coffee-ff5e5b.svg)](https://ko-fi.com/klukacin)

Maintained by **Websolutions**. Built on the MIT-licensed [Otta](https://github.com/UrumiAI/otta.sh) foundation, with its original attribution and Git history preserved.

## What is included

- EmDash catalog content, sellable products and SKU variants, a React merchant console, guest carts and customer accounts.
- Native stock reservations, conditional writes, replayable checkout and recovery after interrupted operations.
- Integer money, coupons, location-based VAT, inclusive/exclusive prices and frozen order-time financial and billing snapshots.
- Stripe PaymentIntents, verified payment webhooks and provider-confirmed partial/full refunds.
- Bank transfer and cash on delivery with payment windows, explicit instructions and private receipt confirmation. Unpaid COD stays outside revenue.
- Flat-rate and threshold-based free shipping, fulfillment records, order reporting and a configurable transactional email outbox.
- Durable invoice jobs and direct **Solo** and **e-racuni** adapters, with reconciliation for uncertain provider outcomes.
- A core **WooCommerce REST v3 compatibility profile** and signed, durable order webhooks for remote accounting integrations.

**Current status:** the foundation is implemented, reviewed and validated locally against pinned **EmDash 1.0.1**. Production deployment, real payment/invoice transactions and vendor connector acceptance are separate gates. See the [validation record](docs/validation.md) for exactly what was tested. This repository is the installation source; the inherited package versions are not a WSCommerce npm release.

## Architecture

Commerce runs inside the same Worker as the EmDash site. CMS content belongs to EmDash; prices, stock, carts and orders live in native commerce aggregates on the site's database. Every shop has its own Worker, D1 database, R2 bucket and credentials. Historic orders never recompute their amounts or billing from today's catalog or address book.

| Module | Responsibility |
| --- | --- |
| `packages/domain` | Money, pricing, tax, coupons, shipping, inventory, checkout and order rules |
| `packages/store-emdash` | Native storage, compare-and-set writes and durable replay evidence |
| `packages/plugin` | EmDash hooks, authenticated admin/storefront routes, cron and integration wiring |
| `packages/admin-react` | React product, stock and order console |
| `packages/admin-presentation` | Shared money, date and order-status presentation |
| `packages/payments-stripe` | PaymentIntents, verified settlement and refund lifecycle |
| `packages/payments-x402` | Inherited facilitator adapter; no complete storefront payment gate yet |
| `packages/invoicing` | Frozen invoice snapshots, durable jobs, Solo and e-racuni clients |
| `packages/compat-woocommerce` | Selected REST v3 resources, persistent numeric IDs, metadata and signed webhooks |
| `sites/staging` | Runnable Astro reference shop and Cloudflare host adapters |

Existing `@otta-sh/*` / `@emdash-commerce/*` package names and plugin IDs `otta` / `otta-console` remain stable for compatibility. They identify inherited runtime contracts; the project and repository are WSCommerce.

## Quick start

Prerequisites: **Node.js 22.16 or newer** and **pnpm 11.10.0**. Install the pinned pnpm version with `npm install --global pnpm@11.10.0` if needed. SQLite tests require a native `better-sqlite3` build matching your Node runtime; reinstall dependencies if you switch Node versions.

```sh
git clone https://github.com/wsagency/wscommerce.git
cd wscommerce
pnpm install --frozen-lockfile
pnpm -C sites/staging dev
```

Open the printed local URL and complete EmDash's first-run setup. Enable sample content if you want the demo catalog. Price and stock the sample products in **Pricing & inventory** before trying checkout; content alone does not make a product sellable.

Payment and invoice providers start unconfigured. Enable the offline methods in admin Settings, or follow the integration guide to configure Stripe and accounting. For optional local invoice/Woo settings, copy `sites/staging/.dev.vars.example` to `.dev.vars` in the same directory; real credentials belong in ignored local configuration or server-side Worker secrets.

[DEPLOYMENT.md](DEPLOYMENT.md) covers local storage, the demo-commerce seed and the complete Cloudflare setup: resources, bindings, build, deployment, immediate admin claim and cron. Tracked resource IDs are placeholders.

## Payments, accounting and WooCommerce compatibility

Stripe orders settle only after verified provider confirmation. Bank orders remain pending until an exact private receipt; COD can move to dispatch while unpaid. Replayed receipt commands cannot capture twice or deduct stock twice. Refund HTTP acceptance does not mean the refund completed.

Select exactly one invoice owner: `disabled`, `solo`, `e-racuni` or `woocommerce-connector`. Connector ownership disables direct issuance. An uncertain Solo issuance requires reconciliation before another request, protecting against duplicate documents. Read [integration setup and acceptance](docs/integrations.md) before enabling a provider.

[WooCommerce compatibility](packages/compat-woocommerce/README.md) exposes a selected HTTP profile at `/wp-json/wc/v3`, discovery and signed order webhooks. It is designed for **remote REST/webhook connectors**, including qualification of modern e-racuni WooCommerce integrations. WordPress PHP plugins, PHP actions/filters, `$wpdb`, WooCommerce Store API and legacy API do not run on Workers. Existing Woo integrations must be checked against the documented supported profile and accepted with the vendor account; universal plugin compatibility is not claimed.

## Scope and roadmap

The first foundation focuses on physical retail, order correctness and accounting. Dedicated local pickup, carrier booking/labels, MBE integration, invoice corrections, complete digital-file delivery, CSV migration and privacy export/erase workflows need further implementation or acceptance. A zero-priced named flat rate can represent collection, but checkout still requires an address.

Marketplace settlement, subscriptions, reviews, generalized EU B2B tax, automatic fiscal certificate handling and currency conversion are future modules. Stripe currently accepts the supported two-decimal currency profile. The inherited x402 adapter is not a complete storefront flow. See the [design](docs/superpowers/specs/2026-09-30-emdash-commerce-design.md) and [implementation plan](docs/superpowers/plans/2026-09-30-emdash-commerce-foundation.md) for decisions and remaining gates.

## Development and validation

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm exec vitest run --maxWorkers=3
pnpm test:d1
pnpm build
```

Run typecheck and build sequentially: the bundler cleans the generated declarations used by TypeScript project references. The D1 tier runs locally inside workerd without a Cloudflare account. PostgreSQL concurrency tests use a separately configured, disposable database via `PG_CONNECTION_STRING`; browser acceptance needs a running configured shop.

The GitHub workflow runs lint, formatting, types, builds and the workspace tests, a PostgreSQL integration tier and the D1 release gate. Start with the [developer documentation](docs/development/README.md) for setup, architecture, extension points, adapters and release procedures. Follow [CONTRIBUTING.md](CONTRIBUTING.md) and [DEVELOPMENT.md](DEVELOPMENT.md). Architecture decisions live in [adr](adr/README.md); operational recovery and upgrade procedures are in [operations](docs/operations.md).

## Integration and support

For shop implementation, custom integrations, migrations or commercial support, contact **Websolutions** at [hello@ws.agency](mailto:hello@ws.agency).

Bug reports and feature requests belong in [GitHub issues](https://github.com/wsagency/wscommerce/issues). Report security issues privately as described in [SECURITY.md](SECURITY.md). Community participation follows our [Code of Conduct](CODE_OF_CONDUCT.md).

If this project helps you, you can [buy the author a coffee on Ko-fi](https://ko-fi.com/klukacin). Thank you for supporting its development.

## Acknowledgments and license

Thank you to **Vedanshu and the Otta contributors**, the **EmDash and Cloudflare teams**, and the maintainers of **Astro, React, TypeScript, pnpm, Kysely, SQLite, PostgreSQL, Vitest, Playwright and Unicode CLDR**. Their work makes this project possible. We also thank **DashCommerce** and **WooCommerce** for the functional and protocol references used during the design and interoperability review.

See [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md) for project links, [NOTICE.md](NOTICE.md) for source provenance and [the archived Otta README](docs/research/upstream-otta-readme.md) for the upstream introduction.

WSCommerce source is released under the **[MIT License](LICENSE)**. Original Otta copyright notices are retained; Websolutions additions use the same license. Dependencies and bundled Unicode data retain their own licenses and notices.
