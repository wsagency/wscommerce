# Invoice and WooCommerce integration

## Configuration boundary

The reference site's `src/emdash-commerce-plugin.ts` supplies server runtime bindings to the plugin. New invoice and Woo secrets are never written to plugin KV, browser state, Vite defines, source control or status responses. Existing upstream Stripe configuration remains in the authenticated settings workflow.

For local development copy `sites/staging/.dev.vars.example` to `.dev.vars` and enter secrets there. For deployment use `wrangler secret put NAME --config wrangler.local.jsonc` from `sites/staging`, targeting the real Worker configuration described in [deployment](../DEPLOYMENT.md). Public provider endpoints also need to be set at **build time** in the site's `.env` so that the descriptor grants their hosts to `ctx.http`. Allowlisting an endpoint never enables issuance.

| Binding | Meaning |
| --- | --- |
| `COMMERCE_SHOP_ID` | Stable unique shop identifier used in invoice correlation |
| `COMMERCE_PUBLIC_URL` | Canonical HTTPS origin for links and webhook source |
| `INVOICE_OWNER` | `disabled`, `solo`, `e-racuni`, `woocommerce-connector` |
| `INVOICE_LIVE_ENABLED` | Literal `true` only after account acceptance |
| `SOLO_API_TOKEN` | Solo runtime secret |
| `SOLO_API_URL` | Build-time `https://api.solo.com.hr/racun` grants the direct client's fixed API host |
| `SOLO_SERVICE_TYPE`, `SOLO_INVOICE_TYPE` | Solo account choices, default 1 |
| `SOLO_COD_PAYMENT_TYPE` | COD remittance: 1 bank, 2 cash, 5 other; default 1 |
| `ERACUNI_API_URL` | Organization JSON API endpoint; also build-time allowlist |
| `ERACUNI_USERNAME`, `ERACUNI_SECRET_KEY`, `ERACUNI_ORG_TOKEN` | Runtime API credentials |
| `ERACUNI_BUSINESS_UNIT`, `ERACUNI_COST_POSITION` | Optional account identifiers |
| `WOO_CONSUMER_KEY`, `WOO_CONSUMER_SECRET` | Runtime `ck_` / `cs_` REST credentials |
| `WOO_SCOPES` | Comma-separated resource scopes |
| `WOO_ALLOW_INSECURE_LOCALHOST` | Explicit local-only HTTP opt-in; production requires HTTPS |
| `WOO_WEBHOOK_ID` | Positive connector webhook identity, default 1 |
| `WOO_WEBHOOK_DELIVERY_URL`, `WOO_WEBHOOK_SECRET` | Provider-issued runtime destination and HMAC secret; treat a generated destination as potentially sensitive |
| `WOO_WEBHOOK_API_ORIGIN` | Public HTTPS provider origin used for the build-time allowlist; never copy destination tokens into build config |

Never paste production credentials into a tracked example. Issuance defaults to disabled even when credentials exist. Disabling direct issuance does not disable an external connector; disable that connection before changing invoice ownership.

## Native jobs and billing profile

Checkout captures billing separately from shipping. Issue requests use frozen net/gross/discount/VAT allocation and currency, never live catalog prices, rates or customer addresses. Before queueing and before dispatch, a succeeded captured-payment total must exactly match the frozen amount/currency. Accepted unpaid COD orders cannot issue a direct invoice. A refund arriving before issuance parks the job for manual accounting; an already-issued invoice needs a separate correction workflow. Old orders lacking frozen rate/allocation proof require reconciliation, including positive taxable amounts whose tax rounds to zero. Shipping may serve as legacy billing only with `INVOICE_ALLOW_LEGACY_SHIPPING_BILLING=true`.

Direct clients currently support domestic Croatian EUR retail and supported Croatian VAT rates. Solo is B2C; company, buyer tax-number and VAT-ID billing is rejected before egress in this profile. No unsupported frozen identity field is silently discarded. Generalized cross-border, reverse charge and fiscal policy require qualified account-specific profiles.

`commerce_invoice_jobs` holds one immutable job per native order ID. States: `queued`, `issuing`, `retry`, `issued`, `failed`, `reconciliation`. Job leases serialize workers; a provider lease enforces account spacing. Completion is fenced by the lease token. Saved provider ID, document number, currency and returned total must match the frozen order. Raw provider errors and credentials are not stored.

Solo uses documented form encoding, explicit net prices and comma decimals. Rate limiting retries after the documented delay. A timeout, ambiguous response or expired issue lease requires reconciliation because public Solo documentation does not establish idempotent invoice creation.

e-racuni JSON uses `SalesInvoiceCreate` and stable `apiTransactionId`. Public documentation establishes idempotent correlation, but not every organization's success envelope. The strict decoder requires an issued document, ID, number, currency and gross amount. A differing response stays unconfirmed until the account profile is qualified. HTTP 200 or a Woo synchronization status is insufficient issuance proof.

Private routes expose configuration presence (`commerce/integrations/status`), a job summary or blocking code (`commerce/invoices/order`) and a bounded worker run (`commerce/invoices/run`). The Integrations admin page shows counts. Storefront traffic registers the minute task `commerce-integrations`; Worker cron drives it and upstream maintenance. Issuance and a concurrent refund cannot be an atomic transaction across two providers; corrections remain an account acceptance requirement.

Invoice lookup, credit notes, invoice cancellation, PDF emailing, fiscal certificate setup and automatic corrections are not claimed as implemented. Verify ambiguous issuance in the provider UI and retain an audit record before repairing state. Never delete an unknown job merely to force another issue request.

## Modern e-racuni WooCommerce connector

Choose **WooCommerce 3.6+ / WP REST API integration v3** and enter the canonical root URL with its consumer key/secret. The [official Croatian instructions](https://e-racuni.com/Croatian/p-1003FD4) distinguish this from legacy v3 and from the WordPress admin plugin. They document hourly order import, stock synchronization and created/updated webhooks; nightly backfill remains with webhooks enabled.

Set `INVOICE_OWNER=woocommerce-connector`. The [supported REST profile](../packages/compat-woocommerce/README.md) preserves decimal strings, numeric identities and pagination headers. Basic authentication is scoped and HTTPS-only. Unsupported writes fail before changing native state. A Woo status update cannot manufacture payment proof. The native read adapter deliberately caps scans at 10,000 documents; exceeding capacity returns 503 instead of incomplete totals. Add indexed projections before supporting larger shops.

Woo billing contacts come from the frozen billing address, with an email-shaped frozen guest `buyerRef` filling an absent email. Current customer profiles are never used to reconstruct an older order. Opaque session claims remain private; an explicit projection billing override retains priority.

The tracked example grants read scopes only. Enable `orders:write` for qualified metadata/notes/status commands and `products:write` for qualified stock synchronization. This profile's `stock_quantity` is the native **available** count, excluding active cart/order holds. A physical warehouse count must account for those reservations before setting the available target. Verify the ERP's stock convention under live reservations before granting that write scope; do not equate physical and available counts.

Provision independent high-entropy Woo consumer credentials: `ck_` and `cs_`, each followed by 40 hexadecimal characters. Set them as shop runtime secrets and enter the same pair in the connector. These credentials are generated for the native shop; they are separate from Solo and e-racuni JSON API credentials. Start with the documented read scopes.

Stock is per SKU: a variable parent's stock describes its independently purchasable base SKU, and each variation describes its own stock. Parent stock/status does not aggregate the variations. Qualify the connector's variation reads and SKU mapping, including a sold-out base SKU with an available variation.

The reference site mounts `/wp-json` and `/wp-json/wc/v3` through a public EmDash route that verifies Woo credentials itself. Its host adapter reads CMS descriptions, product links and actual image references using `content:read` and `media:read`; it has no media write capability. Commercial fields come from native commerce storage. Do not expose or log the ephemeral Basic-auth bridge envelope. The private `commerce/woocommerce/status` route returns configuration presence and delivery counts without credentials or token-bearing destination URLs.

Set the generated provider webhook URL/secret as runtime bindings and allowlist only the provider's public origin at build time. The durable outbox signs exact persisted bytes with Woo's HMAC-SHA256/base64 convention. Delivery is at least once; receivers must deduplicate stable delivery IDs. A CAS-prepared message survives interruption before enqueue/checkpoint; retry preserves the bytes, signature and ID. A bounded native sweep scans 25 orders and attempts one delivery per invocation. It detects changes for eventual created/updated delivery and may coalesce intermediate changes; it is not a complete PHP action-hook trace. The first scan publishes existing orders as current `order.created` snapshots. Polling remains available without webhooks. Drain pending deliveries before rotating the signing secret or destination. The minute task is `commerce-woo-webhooks`.

The [WordPress admin plugin](https://e-racuni.com/Croatian/p-1003FDE) requires WordPress/PHP/Woo objects and cannot run in Workers. Matching PHP hook names in TypeScript does not supply that runtime. Remote REST integration is feasible; arbitrary PHP plugins require a bridge or reimplementation.

## Account acceptance gate

1. Use a test shop and accounting organization. Verify billing, variants, shipping, coupon allocation, each VAT class and payment method.
2. Match an issued direct invoice's response, ID/number, currency and gross amount to the provider document and frozen order; qualify the decoder where needed.
3. Confirm paginated Woo import, paid and offline pending orders, metadata, stock synchronization under reservations, and signed created/updated delivery.
4. Replay REST/payment/refund/webhook deliveries and interrupt workers around provider completion; verify no duplicate invoice or stock mutation.
5. Verify pending/failed/canceled refunds and accounting corrections. Subscribe Stripe to `refund.created`, `refund.updated`, `refund.failed` as well as payment settlement events.
6. Verify backup restoration, operator permissions and invoice ownership before enabling production credentials/live issuance.

No real provider mutation was used during implementation. Local wire tests do not replace account acceptance.

Primary references: [Solo creation](https://solo.com.hr/api-dokumentacija/izrada-racuna), [Solo payments](https://solo.com.hr/api-dokumentacija/nacini-placanja), [e-racuni JSON API](https://eurofaktura.com/rit/ApiDocumentation), [Woo REST](https://woocommerce.github.io/woocommerce-rest-api-docs/).
