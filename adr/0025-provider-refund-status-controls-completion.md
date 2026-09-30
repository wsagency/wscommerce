# 0025. Provider refund status controls financial completion

- Status: accepted
- Date: 2026-09-30
- Refines: ADR-0008 and ADR-0023

## Context

A successful HTTP response from Stripe creates a refund object, but its status
can be pending, requires_action, succeeded, failed or canceled. Treating every
created object as completed money marked orders refunded before customers had
received a refund. Stripe can also report a later bank return after success.
Its event delivery is asynchronous and can be duplicated or arrive out of order.
See [Stripe refunds](https://docs.stripe.com/refunds) and the
[Refund object](https://docs.stripe.com/api/refunds/object).

## Decision

Reserve capacity before issuance as before. Only `succeeded` becomes a recorded
financial refund. Keep the existing ledger states and add optional provider
evidence: the original payment reference, refund reference, provider status and
last applied event. Pending/requires_action use the held `unverified` state;
failed/canceled use `voided`. Unknown transport outcomes stay held and cannot
trigger a second issuance under the same key. A released failed attempt still
spends its key; an intentional replacement uses a distinct key.

Native Stripe refund creation writes `order_id` and `refund_key` metadata.
Subscribe the existing verified settlement endpoint to `refund.created`,
`refund.updated` and `refund.failed`; the deprecated `charge.refund.updated`
is accepted for compatibility. Each event must match an existing reservation's
order, gateway, captured payment, amount, currency and any known refund reference.
Events do not create refunds or issue money. Out-of-band refunds without native
correlation remain an explicit manual reconciliation path.

Apply provider evidence and order state atomically in the order aggregate.
Events supersede delayed creation responses. Event creation time rejects older
snapshots; predecessor status orders same-second changes. When same-second
ordering cannot be proved, prefer a known failure or held capacity over a
claim of completion. A definitive failed/canceled row cannot be resurrected:
its capacity may already have funded a replacement refund.

A later succeeded-to-failed/requires_action change removes the recorded amount,
emits an idempotent signed reporting correction, flags reconciliation, and
restores the exact order state preceding the full-refund transition. This is a
provider correction with an audit event, not a general admin transition out of
the refunded state. Repeated transition pairs carry an occurrence number from
the durable audit history. Financial refund changes carry an increasing revision;
their signed deltas alternate completion and reversal. Reporting reconstruction
absorbs every revision so a delayed delta cannot double-count an absolute rebuild.
Frozen order lines/totals, fulfillment and inventory are unchanged.
Refunded-email enqueueing retains the existing once-per-order rule.

## Consequences

Pending funds are visible and reserved without claiming they were returned.
Partial refunds sum only after each completion. Admin capacity exhaustion is
shown as awaiting completion when the completed total is below the ceiling.
Existing manual recording and compare-and-clear reconciliation remain available.

Legacy rows have no provider evidence; this change does not manufacture it or
rewrite historical financial facts. They require provider-backed reconciliation.
Lost webhook deliveries leave capacity held; operators must re-deliver verified
events or reconcile against the provider before issuing another refund.
Reporting remains the existing best-effort delta projection; durable ledger
truth and the order transition commit together. Tests use migrated SQLite and
local D1 with simulated external transport; no live Stripe acceptance is claimed.
