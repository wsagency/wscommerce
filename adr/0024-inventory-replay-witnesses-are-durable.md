# 0024. Frozen adoption and durable movement replay witnesses

- Status: accepted
- Date: 2026-09-30
- Supersedes: ADR-0019's accepted inventory movement eviction residual and periodic-healer assumption only.

## Context

A persisted order can outlive an interrupted adoption while its cart remains
mutable. Adopting by reservation ID alone then pays for the frozen order quantity
while committing a different live quantity. Stock movement claims also span two
documents: a crash after the inventory write can leave the claim unfinished.
Evicting that result from a 256-entry ring previously authorized a duplicate
restock. There is no movement healer in the deployed cron path, and a periodic
schedule cannot guarantee completion before eviction under arbitrary load.

## Decision

Checkout supplies each persisted order line's SKU and quantity to `adoptMany`.
Adoption compares the live hold to these values inside the same inventory CAS,
including its retry and already-adopted replay paths. Mismatched holds classify
as lost and remain owned by the cart. The existing abandonment path expires the
order, releases only its adopted sibling holds and frees its coupon; it creates
no payable intent. Optional guards on the inventory port preserve older callers.

Every movement writer persists an evicted ring entry's original result to its
per-key claim before writing the inventory document that removes the witness.
Failure to persist prevents eviction and the new movement. CAS retries repeat
the check against the new revision. Each replay also reads its claim after
pinning the inventory revision, so a late caller cannot mistake a peer's eviction
for an unapplied intent. Stock and adjustment witnesses use their separate ledger
scopes. The ring stays at 256 entries; once-only protection has no time horizon.

## Consequences and upgrades

No database migration, new collection or background job is required. A full ring
adds a durable promotion check before a movement; storage failures can defer a
new movement rather than erase the only witness. Applied claims must be retained
for the lifetime of their idempotency keys.

New claims carry `witnessVersion: 1`. Existing applied claims and surviving ring
or hold witnesses remain valid. A legacy unfinished claim with no witness cannot
distinguish a crash before movement from a crash after eviction. It requires
operator reconciliation and throws a typed error without changing stock; adding
the version marker or using a different key would not resolve that uncertainty.
Drain writes and upgrade all inventory writers together. Older binaries can
still discard witnesses, so mixed-version inventory writers are unsupported.

The regression contracts run against migrated SQLite and local workerd/D1.
Postgres remains the tier for simultaneous writers; local interleaving tests do
not establish production concurrency or external payment acceptance.
