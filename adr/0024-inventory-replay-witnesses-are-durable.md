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

## Absolute stock synchronization (2026-09-30)

`setOnHandAbsolute(Sku, quantity, idempotencyKey)` sets the **available** count,
matching `getOnHand`. It records `direction: "absolute"` in the existing stock
ledger and preserves the current holds in the same inventory CAS. Target zero
is valid with active holds: those reserved units remain backed; release returns
them and commit consumes them. A physical count feed must subtract its reserved
units before supplying this available target.

The operation uses the same claim and eviction ordering as stock deltas. A replay
returns its original target and cannot reset newer stock. Key reuse across stock
operations, SKU or target is rejected; invalid targets write nothing and an
unknown SKU does not consume the key. No collection or migration is added. Drain
and upgrade all inventory writers before using absolute operations: older
writers do not understand the new direction. Shared port tests and native CAS,
crash and ring-eviction regressions run on migrated SQLite and local D1.

## Cancellation fences for delayed adoption (2026-09-30)

Cancellation can finish its release before a delayed checkout or offline
settlement adopts the cart hold. A post-adoption state check compensates a live
writer, but does not protect a writer that dies after the inventory CAS, once
cancellation recovery has already closed the order's hold brackets.

An order-scoped `releaseAdopted` therefore records the released order in a
cart-held reservation's optional `adoptionBlockedFor` field. The fence and every
singular or batch adoption guard use the same SKU document CAS. A stale adoption
must either lose its revision or observe the fence on retry. The cart keeps its
quantity, ownership and deadline; it may still adjust, expire, or supply the hold
to a different legitimate order. Adopted holds are still released only by their
owning order. Post-adoption terminal-state cleanup remains useful compensation.

Fences are never evicted while a hold is live. Every mutable hold rewrite
preserves them. After pruning, the reservation's durable terminal records prevent
the same identity from being recreated, so retaining the fence beyond the hold
is unnecessary. There is no new collection, index, schema migration or background
healer. Legacy absent fields mean no recorded fence. Upgrade all writers together;
older adoption code does not enforce this protection.

The shared inventory contract verifies both adoption operations, cart quantity
changes, other-order adoption, once-only cart release, and retention past 256
other cancellation fences. Native SQLite and local D1 regressions park a stale
adoption CAS and reproduce a bank/COD writer dying after cancellation recovery
closed both brackets. Those cases also drive the actual cart expiry sweep and
verify that held units return once, without any order post-adoption cleanup.

## Concurrent terminal settlement and integer conservation

The first `reservation_index.terminalState` CAS is the immutable winner of a
commit/release race. Its caller returns that winner to the settlement path;
every prune uses it, rather than the losing caller's requested state. A release
losing to commit cannot return spent units. A commit losing to release reports
`ReservationCommitLostError`, or the ID in `commitMany.lost`, after completing
the correct once-only stock return. Batch replays also finish terminal records
whose inventory prune was interrupted, including released records.

Available units plus all retained holds must fit `Number.MAX_SAFE_INTEGER`.
The stock CAS checks this total on every attempt, so an absolute target cannot
pass a stale bound after a concurrent reservation adds a hold. Additions and
adjustment/release arithmetic are checked before their inventory writes too.
Overflow throws `RangeError` without changing stock; quantities are never
rounded or clamped. There is no schema migration. Previously invalid aggregate
counts require an explicit merchant stock correction before an overflowing
release can be completed; this change does not guess lost inventory quantities.

Native SQLite and local D1 regressions park terminal and inventory writes to
exercise both race directions, singular and batch commits, normal and scoped
releases, interrupted batch completion, and the concurrent absolute-target bound.
The shared absolute-stock port contract covers exact safe-boundary adjustment
and release plus overflow rejection with held stock.

## Same-key reserve decisions and bounded failure witnesses

An abandoned reserve claim can be completed by multiple peers. Finalizing
`OUT_OF_STOCK` from a stock read outside the inventory CAS allowed another peer
to apply its hold while the failure caller marked the key and reverse index as
failed. The live hold then spent stock that neither release nor commit could
resolve. Both the original schedule and its inverse must return one decision.

Every existing claim now records its decision in the SKU document CAS: success
stores the hold and decrement together; failure stores `kind: "reserve"` with
the original reservation ID and failed result in `appliedMovements`. A stale
failure read loses the revision to a successful hold, and a later successful
attempt sees the failed witness even if stock has returned. Each attempt reads
the durable key after pinning the inventory revision so eviction or a successful
hold's completed prune cannot authorize a second reservation.

The ring remains bounded at 256 entries. Every ring writer promotes an evicted
reserve failure to its original key and failed reverse-index state before the
inventory CAS can remove it. A failed or contradictory promotion prevents that
write. Restock, removal, absolute targets, both adjustment outcomes and claimed
reserve failures use this same promotion path. SKU transfer stamp, target apply,
clear and recovery writes preserve `appliedMovements`; their separate transfer
ring cannot evict a reserve witness. Pristine target withdrawal also refuses to
delete a document carrying the witness.

The new-key initial out-of-stock shortcut is retained: its terminal key
create-if-absent arbitrates before any claim or hold for that key. New unknown
SKUs still leave the key usable. If an existing claim finds an absent inventory
document, its failed decision creates only a zero-stock witness with a
create-if-absent CAS, preventing a competing recreation from escaping the guard.

No collection, index or schema migration is required. Drain and upgrade all
inventory writers together; an older writer does not understand the new witness
kind. Durable key records must be retained. Previously corrupted failed terminal
records with a live hold require explicit reconciliation; this change does not
guess their intended outcome or mutate historical stock to repair them. Existing
legacy stock/adjustment witness refusal remains unchanged.

Portable migrated SQLite and local D1 cases reproduce both decision directions,
either key-writer order, crashed outcome copying, failed promotion at eviction,
every evicting writer, and interrupted SKU transfer completion. The tests use
actual native storage with barriers and injected crashes, without mocked data.
