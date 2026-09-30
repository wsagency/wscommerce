---
"@otta-sh/domain": patch
---

Preserve refund capacity when a reservation creator sees an already-refunded provider balance while a same-key peer may be completing issuance. Keep the row unverified for reconciliation and permit the peer's confirmed completion to finalize it.
