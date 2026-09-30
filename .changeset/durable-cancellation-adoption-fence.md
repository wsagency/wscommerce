---
"@otta-sh/domain": patch
"@otta-sh/store-emdash": patch
---

Prevent delayed adoption by a cancelled order after its recovery brackets closed.
An order-scoped release preserves a cart hold while recording a durable adoption
fence in the same inventory CAS. Cart edits, expiry and adoption by another order
remain valid; singular and batch adoption both honor the fence without eviction.
