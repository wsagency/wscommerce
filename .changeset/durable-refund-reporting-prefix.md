---
"@otta-sh/store-emdash": patch
---

Replay native refund reporting through a durable financial revision journal. Newer reversals finish
missing predecessors, counter/checkpoint crashes are recoverable, and refund-driven state changes
share the same guarded witness. Guarded rebuilds checkpoint journals and immediately heal missing
prior transitions on old order days instead of leaving false refund or status counters until cron.
