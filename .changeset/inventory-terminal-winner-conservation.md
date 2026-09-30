---
"@otta-sh/domain": patch
"@otta-sh/store-emdash": patch
---

Preserve the first durable reservation terminal state when commit and release
race. Singular and batch settlement now prune according to that winner, report
lost commits, and heal interrupted terminal records on batch replay. Bound
available stock plus retained held units to safe integers within the stock CAS,
including absolute targets, additions, adjustment and release arithmetic.
