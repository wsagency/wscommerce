---
"@otta-sh/domain": patch
"@otta-sh/store-emdash": patch
---

Guard checkout adoption with the immutable order's SKU and quantity. Persist stock
movement and adjustment results before evicting their bounded inventory witnesses,
and require reconciliation for legacy unfinished movements with unknown outcomes.
