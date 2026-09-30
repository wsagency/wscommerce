# WooCommerce accounting profile

Status: protocol, native frozen-order projection, credentials, persistence and durable webhook delivery are implemented and tested locally. The reference plugin implements `WooBackendPort` with `createNativeWooBackend` over real native commerce stores. Site mounting, authentication configuration and webhook scheduling are composed by the distribution. Live e-racuni acceptance is **unverified**.

This is an explicit subset of WooCommerce's WP REST API v3 at `/wp-json/wc/v3`. The native commerce domain owns orders, payments and stock. WordPress/PHP plugins using `add_action`, `apply_filters`, `WC_Order`, other WC classes, `$wpdb`, or WordPress administration screens **cannot execute in EmDash/Workers**. No WordPress runtime or legacy API is advertised. No WooCommerce or vendor PHP implementation is copied into this MIT package.

## Implemented protocol matrix

Every route supports authenticated `GET`/`HEAD`; `OPTIONS` describes permitted methods. `/wp-json` and `/wp-json/wc/v3` expose public, explicit profile discovery.

| Resource | Implemented reads | Permitted write port |
| --- | --- | --- |
| `/orders`, `/orders/{id}` | Frozen totals, billing/shipping, line items, tax/shipping lines, payment reference, completed refunds, metadata | `PUT`/`PATCH` of `meta_data`; guarded `processing`, `completed`, `cancelled` when a native adapter supports them |
| `/orders/{id}/notes`, `/{note_id}` | Private append-only notes | `POST` of `note` with `customer_note:false` |
| `/orders/{id}/refunds`, `/{refund_id}` | Confirmed native refunds only | None |
| `/products`, `/products/{id}` | Simple/variable catalog, price strings, SKU, stock, attributes, images, metadata | Guarded absolute `stock_quantity` through the native inventory adapter |
| `/products/{id}/variations`, `/{variation_id}` | Variation resources belonging to the requested parent | Same guarded stock port |
| `/customers`, `/customers/{id}` | Native customer profile and addresses | None |

The matrix describes the package's ports. A host may explicitly reject stock/status mutations it cannot implement atomically. The initial reference composition rejects combined metadata/status writes because they span separate native documents. Unsupported endpoints return `404`; unsupported methods return `405` with `Allow`; unsupported write fields reject the complete request with `400`. There are no create/delete/batch order/product/customer endpoints, price writes, webhook subscription-management API, Store API, or `/wc-api/v3` legacy API.

`set_paid`, monetary totals, line items, billing/shipping snapshots, payment method/reference, refund creation, and unsupported statuses cannot be written. A pending/failed/cancelled/refunded order cannot become processing/completed through this API. Native mutation ports must preserve state-machine/payment evidence, inventory holds, and replay rules; they must never call a raw payment flip on behalf of a public request. Custom Woo statuses and public customer-note delivery are unsupported.

## Authentication and queries

Use `Authorization: Basic base64(ck_…:cs_…)` over HTTPS. Query-string credentials are rejected. Credentials are shop-local server secrets; the credential repository stores SHA-256 of the high-entropy consumer secret, an enabled flag, principal ID and explicit resource scopes. The authenticator accepts conventional 40-hex-digit `ck_`/`cs_` credentials. Revocation is checked on each request. There is no ambient session/cookie authorization.

Scopes: `orders:read`, `orders:write`, `products:read`, `products:write`, `customers:read`. Writes accept an `Idempotency-Key` header and pass a principal-prefixed key into the native command for durable replay. Standard headerless metadata-only/stock-only `PUT`/`PATCH` receives a fresh native command identity per request; repeated unchanged metadata upserts and absolute stock targets are naturally idempotent. A later A→B→A request applies A again. A headerless client cannot distinguish a retry from a new command after an intervening update, so an ambiguous retry can reapply its older target; supply an explicit key when durable once-only replay is required. Notes and state transitions require an explicit key. The actual vendor write shape remains part of live acceptance. Never log request authorization/bridge envelopes.

List queries support `page` (default 1), `per_page` (1–100, default 10), `order`, `orderby` (`date`, `modified`, `id`), `after`, `before`, `modified_after`, `modified_before`, `include`, `exclude`, `search`, and `context` (`view`/`edit`). Orders add `status` (`any` or the declared Woo statuses) and `customer`; products add `sku`, `status`, `type`, `stock_status`; customers add `email`. Unknown, repeated or malformed filters return `400`. `include`/`exclude` contain persistent **external numeric IDs**; `customerId` is resolved to its native ID before entering the backend. The native backend owns filtering, ordering, stable tie breaks and page/count consistency. Responses carry `X-WP-Total`, `X-WP-TotalPages`, navigation `Link` and `Cache-Control:no-store`.

Amounts are decimal strings formatted directly from integer minor units, with explicitly configured currency exponents, including zero/three-digit currencies. No float arithmetic is used. Order-line `price` derives from the **discounted frozen net line total divided by quantity**, including inclusive/mixed catalogs. Whole minor-unit prices retain currency precision. Fractional prices use half-up decimal rounding at currency precision plus at least four guard places, increasing to the quantity's decimal-digit count for large quantities; unnecessary trailing zeros are trimmed. Multiplying that serialized price by quantity and rounding to currency precision recovers the frozen net line total, including recurring fractions such as `1.00 / 3 → 0.333333`. Accounting imports must use captured line subtotals/totals/taxes and order totals as authoritative amounts. Native `paid`/`processing`/`shipped`/`delivered` project to Woo `processing`; native `expired` projects to `cancelled`. Pending bank-transfer/COD orders project to `on-hold`; bank transfer uses Woo `bacs` and COD uses `cod`. Use `nativeWooOrderStatus` for exact backend status filtering so awaiting payment remains truthful.

`nativeOrderSnapshot` requires frozen `taxBreakdown.priceTaxMode` and per-line `priceTaxMode`, `rateBps`, `netCents`, `grossCents`, `subtotalNetCents`, `taxCents`, plus shipping net/tax/rate proof for nonzero shipping. Every line needs explicit captured rate proof: a zero tax amount may be rounded VAT, and never implies a zero rate. Captured tax entries retain their rates when amounts round to zero. Inclusive retail tax is never added twice. Mixed catalogs require each line's captured mode and export normalized net line amounts with `prices_include_tax:false`; shipping remains native net. Historical orders lacking that proof return an explicit projection error; current catalog tax rates cannot repair a historical snapshot. The mapper reconciles line, shipping, tax and grand totals before export. Absent captured billing/payment dates stay absent. Frozen `variantId` becomes variation identity. Native order lines that lack it export SKU/product identity and `variation_id:0`; they are never resolved through a mutable catalog.

## Host composition and persistence

```ts
const handler = createWooCommerceHandler({
  backend: nativeBackend,
  ids: new EmDashWooExternalIdStore(collectionOf(storage, "woo_ids")),
  authenticate: createWooCredentialAuthenticator(serverCredentialStore),
  currencyDecimals: { EUR: 2, JPY: 0, KWD: 3 },
});
const response = await handler(request);
```

Register `WOO_STORAGE_LAYOUT` on the plugin descriptor: `woo_ids`, `woo_metadata`, `woo_webhooks` (the last indexes `availableAt`, `state`). The EmDash adapters operate on injected `StorageCollection` CAS primitives. Tests use real migrated SQLite via `@otta-sh/store-emdash/testing`, never a mock database.

The reference native backend reads pending orders as valid orders, maps pending bank transfer/COD to Woo `on-hold`, and exposes `date_paid` only when succeeded captures in the order currency sum exactly to the frozen total. A state-change event alone is insufficient. Only finalized refunds are exported; reserved/unverified provider outcomes never become refunded money. It supports metadata-only CAS writes, guarded native status commands and idempotent private notes. Combined metadata/status patches are rejected before any write. Stock writes delegate to native `InventoryStore.setOnHandAbsolute` for an atomic **available** count that preserves existing holds. Explicit-key replay returns the original result without resetting later stock movements. Only physical resources with a known native SKU/inventory row can be changed; missing inventory is never seeded by a public write. Variation writes carry the HTTP-verified parent identity into the backend, and reject foreign/deleted/orphaned resources.

Lists use bounded native document scans of 100 rows per page, with a ceiling of 10,000 documents (or child variants/notes). Overflow returns `503`; results are never silently truncated. Pagination totals, filters and ordering are applied to the complete bounded set. Orders apply those operations to raw captured rows and project financial snapshots only for the selected page, so an invalid historical snapshot outside the page/filter cannot block an otherwise valid export. Selecting an invalid snapshot still returns explicit `503`. This reference adapter is intended for small shops; larger shops require an indexed backend that implements the same port. Native customers have no captured modification timestamp, so customer `date_modified` is `null` and modified-date filters/order are rejected with `400`.

CMS-owned images, descriptions, slug and permalink arrive through the optional read-only `NativeWooProductContentPort.getMany(nativeIds)` fifth constructor argument. The backend reads one CMS batch for a result page and preserves the returned fields; it does not invent product links or descriptions when that source is absent. The native commerce title cache remains the product-name source.

Numeric IDs use a monotonic CAS counter, immutable per-native-entity assignment and per-numeric-ID reverse documents. A losing allocator may leave a gap. A crash between assignment and reverse completion is repaired by retrying `getOrAssign`; no externally returned identity changes. IDs are never hash-derived, recycled or bounded to a truncating history. Back up all three kinds of document together.

Metadata updates preserve stable numeric IDs and validate complete batches before CAS. Reserved native/payment/address keys and prototype keys are rejected. Replay fingerprints and original responses are durable. The default envelope stops before 1,000 unique mutation keys or 512 KiB; configurable lower limits are tested. At capacity, writes fail explicitly and old witnesses remain. Do not evict them or reset the entity to resume writes; migrate to an adapter with separate immutable command documents.

For a host that JSON-parses plugin requests, use `encodeWooHttpRequest` on the site route, `handleWooHttpBridge` inside the anonymous plugin route, and `decodeWooHttpResponse` on the result. This thin bridge preserves status/headers/body and forwards only Authorization, Content-Type and Idempotency-Key, dropping ambient cookies. The host must not replace backend error statuses with HTTP 200.

## Durable outbound webhooks

`buildWooWebhook` signs the **exact serialized UTF-8 bytes** with HMAC-SHA256/base64 and produces `X-WC-Webhook-Source`, `Topic`, `Resource`, `Event`, `ID`, `Delivery-ID`, `Signature`. It supports `order`, `product`, `customer` created/updated/deleted topics. Use the mapped REST object for a payload; `JSON.stringify` exactly once before signing. Retries reuse those bytes, signature and delivery ID.

`EmDashWooWebhookOutbox.enqueue` persists an immutable delivery before egress. `dispatchWooWebhook` claims a CAS lease, uses the injected `WooWebhookTransport`, and records delivered/retryable/terminal outcomes. Leases recover after expiry. 2xx confirms delivery; 408/429/5xx and transport failures retry with bounded exponential delay; other HTTP responses are terminal. Ten attempts is the default retry budget. Terminal records remain visible for operator reconciliation; provider error bodies are not persisted. A crash after remote success can cause an identical redelivery, so receivers must deduplicate `X-WC-Webhook-Delivery-ID`. This is at-least-once delivery, not a claim of exactly-once remote effects.

The host injects permitted HTTPS destinations and a transport that enforces `allowedHosts`, disables redirects and bounds request timeout below the lease. Schedule native event enqueue/recovery; an ephemeral callback that merely invokes the signing helper is not durable integration. Protect stored payloads as customer data and never store the signing secret in the outbox.

## e-racuni connector evidence and setup

The official [Croatian WooCommerce connector manual](https://e-racuni.com/Croatian/WikiPage-1003FD4) distinguishes **WooCommerce** (Legacy v3) from **WooCommerce 3.6+** (WP REST API integration v3). The latter takes the shop's HTTPS root URL and consumer key/secret. It describes order import, stock synchronization, optional catalog/price import/export, and created/updated webhooks delivered to a provider-generated Web Hook URL. The modern selection is this profile's target; legacy is unsupported. This source is stronger evidence than a marketing compatibility list.

Select a single invoice owner per shop: `disabled`, direct `solo`, direct `e-racuni`, or `woocommerce-connector`. When the external connector owns invoices, disable native provider issuance; REST metadata updates are annotations, never invoice/payment proof. Start with an orders/products/customer read credential. Enable only native writes that the connector actually requests and the host can safely implement. Disable provider catalog/price export because those endpoints are not supported here. Configure the generated e-racuni webhook URL and its server-held signing secret explicitly.

The separate [WordPress administration plugin manual](https://e-racuni.com/Croatian/WikiPage-1003FDE) requires an existing shop connector and WordPress administration. Its [public download](https://e-racuni.com/files/WPWebShopPlugin.zip), inspected as data on 2026-09-30 (622,296 bytes, 247 members), contains WordPress hooks, `WC_Order`, `$wpdb`, PHP administration code and bundled vendors. It was not executed or copied. That plugin is not an EmDash integration target.

The [tax-number manual](https://e-racuni.com/Croatian/WikiPage-1002D0E) describes a custom checkout field for B2B identifiers. Its exact account-dependent field/metadata convention must be captured in acceptance; no guessed universal Woo tax-number field is advertised. Direct invoicing is a separate integration: [Eurofaktura's JSON API](https://eurofaktura.com/rit/ApiDocumentation) posts to an organization-specific `/WebServices/API` using `username`, `secretKey`, organization `token`, `method` and `parameters`. Those credentials are unrelated to Woo consumer credentials.

Live acceptance is pending an approved test organization and configuration: capture the modern connector's discovery/auth/list/get/filter requests; import a known taxed and discounted order; verify billing/B2B identifiers, currency, methods and variation SKUs; verify incremental pagination/backfill; capture optional metadata/stock/status requests and idempotency behavior; deliver created/updated webhooks including retry/replay; verify one invoice owner and one invoice per native order. Local contracts cannot prove the vendor's undocumented request subset or their receiver's signature enforcement. No live invoice, email, external stock change or production migration has been performed.

Protocol references: [WooCommerce REST documentation](https://woocommerce.github.io/woocommerce-rest-api-docs/) and the audited WooCommerce controller/webhook source in `acshop/materials/commerce-audit/2026-09-30/sources/woocommerce`. Only protocol facts are used; GPL implementation is not included.
