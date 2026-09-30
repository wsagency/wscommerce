# EmDash Commerce design

## Intent and approval

Build a reusable, locally runnable EmDash commerce distribution for multiple client shops. The user approved the architecture and four-stage sequence in the 2026-09-30 codebase comparison and explicitly requested implementation in this session, with documentation. They additionally require e-racuni invoicing and WooCommerce integration compatibility as core capabilities. This document records that approved direction; it does not claim production deployment or provider acceptance.

## Source and ownership

- Base: Otta main `7c63e6c`, with selected PR 322 (EmDash 1.0.1), PR 326 (sellable variants), and PR 299 (dependency boundaries), integrated at `15ebd751`.
- Workspace: the independent WSCommerce repository at `wsagency/wscommerce`. The foundation was integrated on `codex/emdash-commerce-foundation`.
- Preserve MIT copyright and the original Otta package names initially to minimize interface churn. Public repository branding is Websolutions Commerce (WSCommerce); inherited runtime/package identifiers remain stable.
- DashCommerce provides MIT reusable pure helpers where appropriate; any borrowed implementation must carry its attribution. WooCommerce provides protocol specifications and behavioral requirements, not copied GPL implementations.
- Every deployed shop has its own Worker, D1/R2 data, API credentials and settings. Shared versioned packages do not share customer records.

## Commerce invariants

Money is integer minor units with an explicit currency. Cart quotes, immutable order snapshots, payment amount/currency and invoice totals must agree. Tax-inclusive retail prices require an explicit rounding policy; they must not be treated as net input. Digital tax destination is independent of physical shipping. Changing a cart after a persisted checkout cannot change the quantities adopted into its order.

Stock movements must have durable replay witnesses; a bounded in-document history cannot authorize a duplicate increment. Positive payment evidence and completed-refund evidence are separate. Pending/failed/canceled/requires-action refunds cannot become completed financial records. Unknown external outcomes stay visible for reconciliation and cannot trigger a blind second invoice/refund/shipment.

## Component boundaries

Retain Otta's pure domain, EmDash document/CAS stores, plugin and admin integration, Stripe/x402 adapters and Astro sample shop. New packages own HTTP protocol compatibility and invoice providers. Integration operations enter native use cases and native stores; there is no second mutable commerce ledger.

Invoice ports carry a frozen order/billing/tax snapshot and an external correlation key. Solo and e-racuni are interchangeable providers, with issue/lookup/correction capabilities explicitly advertised. Durable integration jobs record queued, leased, successful, retryable, terminal and unknown outcomes. A provider without confirmed idempotency uses lookup or operator reconciliation after an unknown result. Credentials enter only through server settings/secrets and injected scoped HTTP transport.

Offline payments support bank transfer and COD as native order payment methods, with buyer instructions and authorized manual confirmation. Unverified public input cannot mark an order paid. Shipping has configured flat/free methods and a carrier adapter boundary. A zero-priced named collection method uses the existing address-based flat-rate flow; dedicated pickup scheduling remains a further module. MBE implementation and live booking require its actual API contract; an invented endpoint is prohibited.

## WooCommerce compatibility is a core feature

The native domain remains authoritative. A separate compatibility profile exposes selected WooCommerce REST API v3 contracts at `/wp-json/wc/v3`, plus API discovery and signed outbound webhook payloads. Numeric external IDs must be persistent and stable; they must not be derived from lossy UUID hashes.

The accounting/ERP profile targets orders, products/variations, customers, order notes/refunds, permitted stock updates and metadata, pagination/filtering, Basic consumer-key authentication, and `X-WC-Webhook-*` headers/HMAC-SHA256 signatures. Write access is scoped and status changes go through native guards. Unsupported endpoints and unsupported financial mutation fields return explicit errors; no silently discarded writes and no fake WordPress capability advertisement.

Network integrations can be compatible when they use this supported REST/webhook subset. WordPress/PHP plugins using `add_action`, `apply_filters`, `$wpdb`, WC classes or admin screens cannot execute inside EmDash/Workers. Matching a hook name does not implement the WordPress runtime. e-racuni supports a direct shop connector and a separate WordPress administrative plugin; their requirements must be documented separately. Initial interoperability is contract-tested locally; acceptance by the real e-racuni connector requires its account/configuration and captured request profile.

## User-facing completion

The sample storefront must provide a real variant choice and use variant price/stock through checkout. Provider settings and supported API scopes are documented with secret-free examples. Invoice state must be observable separately from order/payment/fulfillment state. Documentation includes setup, architecture, source provenance, compatibility support, operations/recovery, credentials, deployment and the remaining acceptance gates.

## Verification and rollout

Regression tests first for interrupted quantity adoption, asynchronous refund outcomes and stock movement replay beyond 256 subsequent writes. Exercise actual migrated SQLite and local D1 storage, not mocked databases. Contract tests exercise compatibility HTTP requests, signature bytes, auth/scopes, IDs, mapping and pagination, and provider wire requests/responses with injected external transport.

Run lint, strict typecheck, builds, focused tests, the full suite and D1 gate on the integrated branch. Report skipped PG and unexecuted live calls accurately. Upstream full-suite sandbox cleanup failures are a baseline issue to investigate, not permission to report green. Local preview and storefront smoke checks do not establish Stripe/Solo/e-racuni/MBE acceptance.

No live invoice, refund, carrier booking, email to a third party or production migration is part of this implementation. Prepare concrete code and deployment instructions; exercise external service state only with an explicitly approved test account/operation.
