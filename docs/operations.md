# Operations and release gates

## Shop isolation and deployment

Use a separate Worker, D1 database, R2 bucket and credential set per shop. The reference site uses the trusted standard-format plugin plus a separate native React admin descriptor. Its scoped `ctx.http` allowlist still applies. The underlying host is EmDash 1.0.1; upgrade it through a tested compatibility branch.

Follow the resource setup and migration commands in [DEPLOYMENT.md](../DEPLOYMENT.md). Set the public endpoints in `sites/staging/.env`, create an ignored `wrangler.local.jsonc` from the template, build, run the local preview, provision secrets, then use the adapter-generated deployment config. Never deploy the raw source with an alternate Wrangler config that bypasses the build redirect. No production deployment was performed for this implementation.

Make the root directory of the built Astro site available under the canonical origin, including `/wp-json`, `/webhooks/stripe` and `/_emdash` paths. Ensure a Worker minute cron reaches EmDash's scheduled entrypoint. Storefront route traffic bootstraps the integration task; verify the registered cron task and durable job counts after deployment.

## State and recovery

Enable bank transfer or COD in authenticated payment settings only after entering buyer instructions and a window of 1–720 hours. Defaults are disabled. A bank order holds stock pending its exact receipt; COD acceptance permits dispatch while unpaid. Use the private order actions to accept COD and record received money with the exact frozen amount/currency, a unique receipt reference, a command key and operator attribution. The attribution is entered by the operator; it is not a verified individual staff identity. Granular staff authorization is a separate module.

Both pending offline actions adopt holds against frozen SKU/quantity before changing state. After interrupted checkout, a changed or lost reservation stays pending without capture/dispatch. Cancellation also writes an order-specific adoption fence into a reservation still owned by the cart. A paused stale checkout cannot adopt it after cancellation/recovery checkpoints complete, even if the process dies before cleanup. The fence preserves the cart's quantity and expiry; a legitimate different order can still adopt it. Reconcile lost holds rather than manufacturing receipt evidence. A receipt on accepted COD preserves fulfillment progress, and unpaid COD does not contribute sales revenue. Expired orders require manual reconciliation instead of automatic settlement.

Flat and free-shipping rules are configured by ISO country/subdivision and currency. A zero-priced flat method may be named for domestic collection; it still requires checkout address input. Dedicated collection scheduling and carrier labels are not implemented. MBE procurement/integration awaits an actual qualified carrier contract and API.

| State | Operator response |
| --- | --- |
| Unknown/expired Solo issue | Check the provider for the original correlated order; do not issue again merely because the local response was lost |
| Invoice gross/currency mismatch | Retain both frozen evidence and returned document; reconcile accounting before changing state |
| e-racuni unconfirmed response | Qualify the account response decoder with an actual test organization; HTTP 200 is insufficient |
| Pending/requires-action refund | Keep refund capacity reserved; wait for authenticated provider outcome or verified reconciliation |
| Failed/canceled refund | Capacity may be released by the native confirmed lifecycle; preserve the attempt and provider reference |
| Legacy unfinished inventory claim without witness | Drain old writers and reconcile it; never delete/replay the ambiguous claim blindly |
| Terminal webhook delivery | Inspect destination, status, credentials and profile; retain the exact signed payload and delivery identity for controlled recovery |

Inventory movement claims are durable replay evidence. Preserve them in backups and during migrations. Upgrade all inventory writers together after draining old writer versions. A stock read does not repair an unknown past movement, and a successful API response is not proof of accounting reconciliation.

Each confirmed merchant stock intent has a fresh UUID `commandId`, bound to its resource, SKU, direction and quantity. A transport retry retains the original body and identity. The React console retains an uncertain command in the tab's session storage and offers **Retry stock movement**; resolve it before submitting a fresh stock intent. Reading today's stock cannot identify whether an older movement succeeded. Seed/client callers must construct the body once per intent and reuse it for retries. A valid replay returns the original movement receipt before evaluating a stale stock watermark; reusing the identity for an altered body is rejected.

Native product/variant `updatedAt` is also the merchant's edit equality token. Applying data or lifecycle writes advance it inside their CAS even when the clock has not advanced. It may be a few milliseconds ahead of wall-clock time; reuse the exact returned value for an edit, without deriving it from the CMS content timestamp or the local clock. Same-key replay and administrative cleanup of a completed SKU transfer preserve that token.

The first durable reservation terminal answer wins. Commit/release helpers finish inventory pruning according to that answer; a losing commit reports a lost reservation rather than consuming released units. Batch replay also heals terminal records whose inventory pruning was interrupted. Available stock plus live held units must remain within the safe integer range in the same guarded write. An invalid historical count requires merchant reconciliation.

Completing an abandoned reserve claim also records an out-of-stock decision inside the SKU's guarded write. A concurrent stock return cannot turn that same command into a successful hold. Its bounded inventory witness is promoted into the durable command receipt before eviction; failure during promotion leaves the witness intact for retry. Preserve both the inventory witness and reservation key/index documents in recovery, including across SKU transfers. A fresh reserve intent needs a fresh command identity.

Historical rows that already pair a failed reservation index with a live hold require explicit inventory reconciliation. This release prevents that race but does not automatically repair an already-corrupt historical result.

Refund reporting uses explicit native refund identity/revision, `reporting_refund_journals` and `reporting_refund_rebuilds`. Ordinary replay completes pending financial witnesses and missing predecessors. Missing earlier state counters trigger a guarded native-day rebuild immediately and report `refund_rebuilt` after recovery. Reporting failure does not roll back an actual payment/refund. After a persistent storage outage, replay the event or call the adapter's guarded `reportingStore.reconcile({from,to})` for the affected native order-creation days. Preserve pending witnesses, journal bindings and immutable rebuild manifests; do not floor a negative delta or delete evidence to suppress an anomaly. Upgrade the host's declared reporting collections and all writers together; see [ADR-0030](../adr/0030-refund-reporting-replays-a-durable-financial-prefix.md).

Invoice-owner changes require disabling the prior provider/connector first and reviewing existing jobs. Old jobs retain their original provider/snapshot; changing configuration does not reassign or recreate them. Do not delete a job, refund row, external ID or movement claim to make a repeated operation appear new.

## Backup and restore

Back up D1 commercial and CMS data together with R2 objects and the deployment revision. Keep secret provisioning references outside the backup repository. Perform a restore drill in a separate test Worker before using backup existence as a recovery claim. Restore numeric Woo IDs and metadata/outbox state with native orders so remote accounting identities remain stable. Do not restore only the catalog and then allocate new external order IDs.

Include reservation indices/fences, movement claims, reporting days/claims/refund journals/rebuild manifests, integration jobs and Woo delivery/identity documents in the same commercial backup. Their replay witnesses are part of financial and stock correctness.

## Release acceptance

Local tests prove the implementations under their stated runtime/storage profiles. Production acceptance additionally requires a successful deploy, real setup/authentication, product/cart/variant/offline/card checkout, signature-verified settlement, stock conservation, invoice reconciliation, remote Woo import and a successful restore drill. See [integrations.md](integrations.md) for provider/account-specific gates and [validation.md](validation.md) for the actual local evidence.

Unsupported optional modules remain explicit: legacy Woo API, Store API, WordPress PHP extensions, subscriptions/marketplace settlement, generalized cross-border tax, automated fiscal certificates, carrier label procurement and full digital-file delivery. Add them as separately qualified modules; do not infer support from source projects or similarly named hooks.
