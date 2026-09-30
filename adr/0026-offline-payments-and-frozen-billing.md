# ADR-0026: Offline receipts, COD dispatch, and frozen billing

Status: accepted for the approved EmDash Commerce implementation.

## Decision

Bank transfer and cash on delivery are explicit per-store payment capabilities.
Neither has a public payment-confirmation proof. The private authenticated admin
route and its existing admin-token gate authorize receipt and COD acceptance
commands. An operator name is audit attribution, never a caller role or permission.
Granular staff permissions remain a separate module.

Bank transfer starts pending and keeps stock held until its configured payment
deadline. An exact amount/currency receipt atomically writes a succeeded capture,
payment evidence, and the pending-to-paid transition. A receipt reference and
command key are claimed globally before that write; retries heal the same intent.
Different receipts cannot capture an order twice. Expired/cancelled orders refuse
automatic settlement and require the existing manual reconciliation workflow.

Physical COD starts pending. Private acceptance atomically moves it to processing
while explicitly unpaid and records a stock commit intent, permitting the ordinary
shipping/delivery pipeline. A later private receipt captures the exact frozen total
without resetting processing, shipped, delivered, or completed. Generic pending
orders cannot enter processing; generic paid transitions cannot bypass offline
receipts. COD does not grant digital access before payment and is restricted to
physical carts. Unpaid COD fulfillment is excluded from revenue/product sales.
Report event history preserves payment-received evidence for recomputation.

The existing durable hold brackets cover COD acceptance and receipt capture.
Stock commits once; retries and the native sweeper complete any interrupted commit.
Accepted COD is no longer pending, so the pending-order expiry sweep cannot release
its dispatched stock. Before acceptance, its explicit configured deadline applies.
Provider-paid methods retain their current checkout deadlines and confirmation flow.

The payment settings form enables each method only with `true`, buyer-facing
instructions, and an explicit window of 1–720 whole hours (at most 30 days).
`bankTransferEnabled`, `bankTransferInstructions`, `bankTransferWindowHours`,
`codEnabled`, `codInstructions`, and `codWindowHours` use the `settings:` KV
namespace. All default disabled. Invalid settings are refused before the submit
writes any field. Each created order freezes its instructions, reference and
deadline; subsequent configuration changes cannot rewrite them. The public order
projection exposes only that buyer instruction envelope, never billing identity,
operator names, command keys or receipt evidence.

Each order may capture a billing address plus nullable company, tax number and VAT
identifier. This is an immutable copy of checkout input, not a pointer to a customer
profile or address book. Legacy absent billing is null. Billing jurisdiction drives
tax at quote and placement. Invoice code consumes the frozen snapshot; any legacy
shipping fallback requires an explicit admin same-as-shipping choice.

## Verification

The shared port contract runs against the fake and migrated SQLite (Postgres in
its configured tier). It checks unpaid COD dispatch, receipt replay, frozen money,
global reference binding, deadlines, and generic paid-transition refusal. A native
reporting regression verifies zero revenue before receipt, once-only captured
revenue afterwards, and agreement after absolute recomputation. Public route and
sandbox authorization checks accompany the checkout/admin integration.
