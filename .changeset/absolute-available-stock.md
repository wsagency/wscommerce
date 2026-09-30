---
"@otta-sh/domain": minor
"@otta-sh/store-emdash": minor
---

Add an atomic absolute available-stock setter that preserves active holds and
uses durable stock-movement replay witnesses. Replaying a target never resets
subsequent stock changes. Unknown SKUs and invalid targets cannot create stock.
