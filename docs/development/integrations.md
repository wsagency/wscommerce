# Building integrations

This is the developer companion to [the operator integration guide](../integrations.md). The core extension seams are typed ports and server-side composition, not a runtime loader for arbitrary WordPress plugins.

## Existing integration points

| Extension | Contract and implementation |
| --- | --- |
| Payment gateway | [PaymentGateway](../../packages/domain/src/ports/payment-gateway.ts), [Stripe adapter](../../packages/payments-stripe/src/index.ts), [gateway resolution](../../packages/plugin/src/payments/resolve-payment-gateways.ts) |
| Invoice provider | [InvoiceProvider and frozen types](../../packages/invoicing/src/types.ts), [Solo](../../packages/invoicing/src/solo.ts), [e-racuni](../../packages/invoicing/src/e-racuni.ts), [durable jobs](../../packages/invoicing/src/jobs.ts) |
| Remote Woo-compatible backend | [WooBackendPort](../../packages/compat-woocommerce/src/types.ts), [native backend](../../packages/compat-woocommerce/src/native.ts), [HTTP handler](../../packages/compat-woocommerce/src/http.ts) |
| Outbound webhook delivery | [outbox and dispatcher](../../packages/compat-woocommerce/src/outbox.ts), [signature/security helpers](../../packages/compat-woocommerce/src/security.ts) |
| CMS product descriptions/media | [content adapter](../../sites/staging/src/lib/woo-product-content.ts), [plugin content port](../../packages/plugin/src/integrations/woocommerce-content.ts) |
| Transactional email | [EmailSender](../../packages/domain/src/ports/email-sender.ts), [restricted HTTP sender](../../packages/plugin/src/email/ctx-http-email-sender.ts) |

The reference [server entry](../../sites/staging/src/emdash-commerce-plugin.ts) composes `withInvoiceIntegrations` and `withWooCommerceIntegrations` around the existing plugin. It loads runtime bindings through `integrationConfigurationFromBindings` and `wooConfigurationFromBindings`, and injects the CMS content adapter. Use that real implementation as the host-composition example.

## Configuration and transport

Public provider origins are selected at build time in [the Astro configuration](../../sites/staging/astro.config.ts), which grants allowed hosts to the descriptor. New Solo/e-racuni/Woo credentials are runtime Worker bindings, loaded only in server code. Existing Stripe/email credentials stay in the authenticated, write-only settings flow. Never put a secret in a Vite define, browser response or tracked resource configuration.

Adapters receive an injected transport. In a plugin, use `ctx.http.fetch` so the host's capabilities/allowed-host perimeter applies. Bound timeouts below durable lease lifetimes, refuse unintended redirects and store redacted/static outcome codes. Credentials do not imply that a provider is enabled or accepted.

Each deployment has one canonical URL and stable shop identity. Use the [complete binding table](../integrations.md) and the [Worker deployment order](../../DEPLOYMENT.md) when adapting the host to a new shop.

## Add a payment gateway

1. Define the real business/payment-method contract, supported currencies and proof of success. Current payment methods are a closed domain union; a new gateway requires an explicit domain/configuration/UI change, not only adding a class.
2. Implement `PaymentGateway` with injected IO. Preserve order amount/currency, captured description/address and stable provider idempotency keys.
3. Normalize only verified settlement signals. Add raw-body signature verification at the provider boundary and fail closed for mismatched or incomplete events.
4. Model refund acceptance separately from confirmed completion. Respect `refundable`, lifecycle states, event correlation and reconciliation.
5. Wire the gateway into shared resolution so checkout and merchant refund actions use the same implementation. Configure the build-time host and server credentials.
6. Test duplicate/out-of-order/late events, retry after interruption, wrong amount/currency/order, unsupported currency and provider-refused/unknown refund outcomes. Qualify the actual provider account separately.

Use the [domain gateway contract](../../packages/domain/src/testing/payment-gateway-contract.ts) and native order/refund regressions as the starting evidence, not a client-side redirect as payment proof.

## Add or qualify invoice behavior

`InvoiceSnapshot` is frozen billing and financial evidence. The `InvoiceProvider.issue` outcome is one of:

| Outcome | Meaning |
| --- | --- |
| `issued` | A decoded document ID/number, currency and total confirm issuance. |
| `retryable` | A proven safe retry with a static code and delay. |
| `terminal` | A known refusal requiring configuration/operator attention. |
| `unknown` | Uncertain external completion; preserve evidence and reconcile. |

`idempotentIssue` must reflect the provider's documented behavior for this exact operation. Solo's public creation profile does not prove idempotency, so uncertain creation/expired issuance leases park for reconciliation. e-racuni uses a stable `apiTransactionId`; its organization-specific success envelope still needs qualification.

Current `DirectInvoiceProvider` identifiers are `solo` and `e-racuni`. A third provider needs the closed identifiers, ownership/configuration selection, dispatch composition and durable acceptance behavior updated together. Register any additional storage/indexes explicitly and retain immutable snapshots and lease fencing.

Select one invoice owner (`disabled`, `solo`, `e-racuni`, `woocommerce-connector`). Direct issuance also requires `INVOICE_LIVE_ENABLED=true`. A connector's ownership disables direct issuance. Accepted unpaid COD cannot trigger a direct invoice. Unsupported billing identities or old tax snapshots must block before egress; do not silently discard fields.

Provider-account testing must confirm actual issued documents and matching totals, not just HTTP 200. Corrections, lookup, cancellation, fiscal setup and PDF emailing need additional qualified implementations; they are not implied by the creation adapter.

## Extend Woo-compatible HTTP integration

The [compatibility README](../../packages/compat-woocommerce/README.md) is the endpoint/profile contract. Maintain `/wp-json/wc/v3`, decimal string amounts, persistent numeric IDs, complete bounded pagination and scoped HTTPS authentication. Reject unsupported operations before any native mutation.

`WooBackendPort` separates protocol mapping from native stores. Current reads cover orders, products, variations, customers, notes and finalized refunds. Guarded writes delegate permitted metadata/status/notes/stock operations to native commands. A Woo status or metadata patch cannot manufacture payment or invoice confirmation.

The reference scans at most 10,000 native documents and returns an explicit 503 on overflow. Larger shops need an indexed backend behind the same port. Available stock excludes active holds; an ERP physical count must account for reservations before writing an available target. Each variation must retain its verified parent and native SKU identity.

The site/plugin HTTP bridge retains status, headers and body and forwards only required authorization/content/idempotency headers. It drops ambient cookies. Never return HTTP 200 for a backend refusal or log the Basic-auth bridge envelope.

A remote e-racuni connector can be qualified against this profile. WordPress PHP hooks, filters, `WC_Order` and `$wpdb` are unavailable in Workers; matching hook names is not PHP runtime compatibility. Capture the vendor's actual discovery, pagination, variation and mutation requests before widening the profile.

## Durable webhooks

Sign exactly the persisted UTF-8 body bytes using Woo HMAC-SHA256/base64 and preserve the delivery ID, signature and bytes on retry. Persist an immutable outbox message before egress; CAS leases fence competing dispatchers. Remote delivery is at least once, so receivers must deduplicate delivery IDs.

The reference integration sweeps native orders for eventual created/updated snapshots and may coalesce intermediate changes. It is not a complete PHP action trace. The generic signer supports more topic shapes; mounting a new producer still requires durable enqueue/checkpoint/recovery work.

Drain pending deliveries before changing destination/signing secrets. Back up the outbox, metadata and all external ID assignments together. Use fake HTTP endpoints for local tests and qualify signatures/replay with the actual receiver before enabling production.

## Integration acceptance

Record the tested commit, host/account profile, configured permissions, frozen sample amounts, provider IDs, replay/interruption behavior and any remaining gates. Keep credentials and customer data out of public artifacts. Follow [testing and releases](testing-and-releases.md) and [operations](../operations.md) for reconciliation and recovery.
