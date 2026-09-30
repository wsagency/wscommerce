# 0030. Refund reporting replays a durable financial prefix

- Status: accepted
- Date: 2026-09-30
- Refines: [ADR-0023](./0023-reporting-rollup-is-a-guarded-delta.md), for native refund reporting;
  ordinary transitions and legacy positive refund events retain its write profile.

## Context

A succeeded refund can later fail or require action. Its native ledger changes before reporting runs,
so a newer reversal can report before a paused success. Flooring the negative delta at zero consumes
its claim; the delayed success then leaves false refunded money indefinitely on an older, already
reconciled order creation day. A claim's diagnostic `appliedAt` cannot distinguish a crash before its
counter write from a crash after it. Full refunds also move status and revenue counters, so ordering
only returned money is insufficient.

## Decision

Native refund reports carry an explicit immutable `nativeRefundId` and monotonic `financialRevision`.
The native order's frozen refund row verifies identity, amount, currency and revision. Odd financial
revisions add the frozen amount and even revisions reverse it. Refund-driven state events capture the
same identity and revision in the native order write; their status and revenue deltas accompany that
financial revision. No opaque event ID is parsed as business evidence.

`reporting_refund_journals` stores each refund's immutable binding and completed prefix. A newer
revision completes every missing predecessor, including a claimed or interrupted one. Any peer may
help; a paused caller never owns an exclusive lease.

Each day has one bounded pending operation, a unique token and a financial installation sequence.
Installing it increments that sequence after a day read preceding the prefix read. This prevents a
stale prefix reader from installing an already completed revision. Applying its numeric deltas and
marking its witness applied is **one** guarded write. The prefix checkpoint follows; only then is the
witness cleared. A crash after the delta, before or after the checkpoint, is replayable without
reapplying money. Generic transitions remain independent numeric writes and do not contend on this
financial sequence.

A rebuild pins the existing epoch and sequence, scans native orders and prepares immutable checkpoint
manifest chunks of at most 100 bindings. Its guarded absolute write records the manifest witness in
the same statement. Peers finish its checkpoints before another financial operation. Legacy claims
remain absorbed before the epoch changes, so an old delayed transition cannot replay a companion
after a rebuild. An unapplied financial operation can be cancelled by a rebuild; an applied one is
checkpointed first. A missing prior state delta triggers this guarded rebuild immediately and emits
`refund_rebuilt`, including for old days; it never floors financial proof or waits for a future cron.

Legacy positive events remain supported. An existing ambiguous legacy claim causes native financial
reporting to migrate through a guarded rebuild, rather than infer success from its diagnostic stamp.
A negative legacy event without native identity and revision is refused. Deploys remain atomic as
required by ADR-0023; older software does not understand these witnesses.

## Consequences

- Newer/older replay, failed prerequisites and interrupted rebuild checkpoints preserve exact native
  financial truth without an old-day sweep.
- Day documents have constant journal overhead. Journal bindings and immutable rebuild manifests
  scale as separate documents; abandoned prepared manifests cannot apply themselves.
- Native refunds serialize briefly within one day/currency while ordinary transition writes retain
  their existing concurrency profile. Native storage writes and provider calls remain independent of
  reporting; an actual storage outage can still require replay or an explicit guarded rebuild.
- Recovery work is bounded: a native refund financial revision is limited to 1000 in this profile,
  each recovery invocation has a 1000-operation budget, and rebuild scans/manifests use the existing
  page budget. A refusal is explicit; it cannot silently discard a signed financial delta.
- SQLite and local D1 run the same real-storage regressions, including old-day reversal, both sides
  of counter/checkpoint crashes, stale helper barriers, legacy migration, opaque IDs, full-refund
  status counters, delayed/missing paid reports and paged rebuild checkpoints.
