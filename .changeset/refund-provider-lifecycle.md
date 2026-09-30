---
"@otta-sh/domain": patch
"@otta-sh/store-emdash": patch
"@otta-sh/payments-stripe": patch
"@otta-sh/plugin": patch
"@otta-sh/admin-react": patch
---

Only succeeded provider refunds count as completed money. Stripe pending and
requires_action outcomes retain their refund reference and reserved capacity;
verified failed/canceled outcomes release capacity without marking the order
refunded. Signed refund events complete or correct the existing reservation,
including later bank returns, with order/payment/money bindings and protection
against stale responses, duplicates and out-of-order events. Reporting applies
signed corrections and identifies repeated refund transitions and correction
revisions so a rebuild agrees with the durable ledger. Admin refunds show
known pending/action outcomes and avoid claiming a fully refunded order while
pending refunds hold the remaining capacity. Manual recording remains available
for verified out-of-band refunds and unknown outcomes stay held for reconciliation.
