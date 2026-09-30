# EmDash commerce source comparison

> Historical review conducted on 2026-09-30, before the WSCommerce implementation. Findings apply to the listed revisions, not today's upstream projects or the completed foundation of this fork. See the [current README](../../README.md) and [validation record](../validation.md) for the implemented scope.

The review compared local copies of DashCommerce, Otta, WooCommerce and EmDash, including relevant development branches. Its purpose was to choose a reusable commerce foundation for multiple independent shops.

**Decision:** use Otta's MIT domain/store/plugin architecture and selected development changes, with WooCommerce as a functional/protocol reference. Otta supplied conditional storage, reservations, order snapshots and recovery. DashCommerce declared broader module coverage, but the reviewed checkout, webhook, inventory and refund paths required correctness work before reuse. Neither reviewed EmDash project alone covered the intended retail/accounting scope.

The review used local storage and substituted provider HTTP transport. No real payment, invoice or carrier credentials were used. Historical scratch probes/logs are not part of this distribution; links below identify public source revisions.

## Audited sources

| Project | Revision | Public source |
| --- | --- | --- |
| DashCommerce | `0.2.0`, main `7666c14e1ccae5678dfa31403675e65b1b3ff23d` | [README](https://github.com/emdashCommerce/dashcommerce/blob/7666c14e1ccae5678dfa31403675e65b1b3ff23d/README.md) |
| Otta | Package versions `0.0.1`, descriptor `0.1.0`, main `7c63e6c2b21927b4760d396cc79da321de131f15` | [README](https://github.com/UrumiAI/otta.sh/blob/7c63e6c2b21927b4760d396cc79da321de131f15/README.md) |
| WooCommerce development | `11.3.0-dev`, trunk `bf2861944100fff0e1ff7eae8e56c3247e318bd0` | [README](https://github.com/woocommerce/woocommerce/blob/bf2861944100fff0e1ff7eae8e56c3247e318bd0/README.md) |
| WooCommerce stable | `11.1.2`, `2316335b1bce366178ce865d4e61a4c5e2219352` | [Plugin](https://github.com/woocommerce/woocommerce/blob/2316335b1bce366178ce865d4e61a4c5e2219352/plugins/woocommerce/woocommerce.php) |
| EmDash | Tag `1.0.1`, `0e8977c221dd8e5111511eb226faa3d164c829ef`; additional main `18d6aa3f00f0c059df4207de921462b65c8c9413` | [Host package](https://github.com/emdash-cms/emdash/blob/18d6aa3f00f0c059df4207de921462b65c8c9413/packages/core/package.json) |

Otta and DashCommerce have MIT licenses. WooCommerce's root license/manifests specify GPL-2.0-or-later; its plugin README identifies GPLv3. WSCommerce preserves imported Otta attribution and independently implements protocol behavior. No WooCommerce implementation, test source or templates are included. See [NOTICE.md](../../NOTICE.md).

## Development branches reviewed

All five DashCommerce upstream heads and 164 Otta upstream heads were fetched, along with selected fork PR heads and the history needed for ancestry checks. Many Otta branches were already ancestors of the reviewed main; a branch name alone was not evidence of a missing feature.

| Source | Change | Decision or boundary |
| --- | --- | --- |
| DashCommerce [PR 28](https://github.com/emdashCommerce/dashcommerce/pull/28), `563d20b752aa0a61c10624152e7278b7636f993e` | EmDash 0.38 compatibility; three commits ahead of its base, eleven behind reviewed main | Tests/types/Cloudflare build passed, but an explicit 0.38 runtime version was still refused; no 1.x support or reviewed lifecycle fixes. |
| DashCommerce [PR 18](https://github.com/emdashCommerce/dashcommerce/pull/18), `a9d62af9b4eca2ad43500d7a1a65b5235a0ed69d` | PaymentProvider, Stripe and mock adapters; 36 commits behind main | Nineteen adapter tests passed, but operational checkout/webhook/refund/subscription routes did not use the registry. |
| DashCommerce [PR 27](https://github.com/emdashCommerce/dashcommerce/pull/27), `75a26f9cc597c51e743b6d465536962556055f95` | Versions/changelog | No added commerce behavior; the other two upstream branches were already merged. |
| Otta [PR 322](https://github.com/UrumiAI/otta.sh/pull/322), `c83577a37d503fbc9391be1ef02ce17cdb83a4fa` | EmDash 1.0.1 and peer range `>=1.0.1 <2.0.0` | Selected pinned 1.0.1 support; the peer range does not establish testing of every future 1.x release. |
| Otta [PR 326](https://github.com/UrumiAI/otta.sh/pull/326), `7f213081afa2ae7ed896a7aeb5418d5dee5dcf0e` | Sellable SKU variants and order snapshots | Selected backend change; the storefront selector was subsequent WSCommerce work. |
| Otta [PR 299](https://github.com/UrumiAI/otta.sh/pull/299), `2271db66b44cb6b4ef316d5faf2e3db7bf7294c6` | Remove dependency checks for the deleted service | Selected tooling alignment with in-process commerce. |
| Otta `feat/aws-container-deploy`, `ci/e2e-gate`, `fix/price-input-validation` | Older service/container, E2E and CMS-form changes | Deltas inspected; incompatible with the reviewed main's removed service and changed content model, so not blindly merged. Two other unmerged branches were documentation. |
| WooCommerce trunk and stable 11.1.2 | Development compared with released core | Core behavior spot-checked in both sources. |
| WooCommerce PRs [69208](https://github.com/woocommerce/woocommerce/pull/69208), [69207](https://github.com/woocommerce/woocommerce/pull/69207), [69220](https://github.com/woocommerce/woocommerce/pull/69220), [69154](https://github.com/woocommerce/woocommerce/pull/69154), [69073](https://github.com/woocommerce/woocommerce/pull/69073) | Shipping filter order, delivery/pickup tests, shipping tax, gateway settings and consistent postcode validation | Specific heads/deltas informed scenario coverage; development PRs were not represented as released features. |

WooCommerce had over two thousand remote heads. The review inspected trunk, stable and these five relevant PRs, not every historical branch.

## Feature comparison at the audited revisions

An implemented path is evidence of source coverage, not proof of a real end-to-end payment, email, invoice or delivery.

| Capability | DashCommerce | Otta main/development | WooCommerce core |
| --- | --- | --- | --- |
| Products, media, categories, SEO | CMS collections and commerce metadata | EmDash content with separate commerce data | WordPress content/media/taxonomy |
| Sellable SKU variants | Model exists; ownership/activity checks failed in reviewed cart/checkout | Model exists; backend sale in PR 326, selector missing | Parent/variation stock and sale rules |
| Grouped/external products | Schema exists; grouped purchase incomplete | No complete product types | Included; grouped differs from bundles |
| Physical/digital products | Download grants/redirects; incomplete refund revocation/private proxy | Entitlements; incomplete storefront file delivery/refund revocation | Virtual/downloadable flags and permissions |
| Server carts/guest checkout | Present; stale coupon/shipping defects | Reservations and capability tokens | Sessions and persistent customer cart |
| Quote/order/payment totals | Reproduced mismatch | Shared pricing with reviewed tax/checkout defects | Extensive calculation and captured totals |
| Stripe cards | Hosted Checkout/Payment Element; lifecycle defects | PaymentIntents/Payment Element/signed settlement | Separate Stripe or WooPayments plugin |
| Bank transfer/COD | Absent; PR 18 not wired into routes | Absent in reviewed upstream | BACS/COD in core |
| Retry and webhook deduplication | Dedupe written before unfinished effects | Recovery and sweeps; reviewed correctness gaps | Core lifecycle plus gateway-dependent behavior |
| Inventory/concurrent checkout | Soft locks/read-put decrement; race and own-hold defects | CAS reservations/adoption/expiry; two reviewed defects | Expiring reservations, locking and guarded decrement |
| Inclusive VAT prices | Tax modes but incomplete checkout wiring | Exclusive totals; gross-input policy needed | Inclusive/exclusive input/display/rounding |
| Destination/class tax | Table helper not connected | Zone/class rates; digital-only destination gap | Locations/classes/compound/shipping/exemptions |
| Coupons | Broader types/eligibility; stale percentage defect | Fixed/percentage cart discount and limits | Product/cart/percentage restrictions and limits |
| Shipping | Flat/free/pickup/weight/class; stale free-shipping defect | Flat/free and zones; no dedicated pickup/weight methods | Zones/flat/free/pickup/classes/packages |
| Orders and snapshots | Paid orders could lack items | States/timeline/notes/cancel/reconciliation | HPOS and captured line/tax/shipping data |
| Partial/full refunds | Provider path exists; failed status handling defective | Reserved refund amounts; provider status ignored | Refund records/restock; transfer needs gateway |
| Tracking/fulfillment | Order workflow; no carrier booking | Single fulfillment record/manual tracking | Partial fulfillment/tracking paths hidden by default |
| MBE booking/labels/sync | Absent | Absent | Separate carrier integration |
| Solo invoices/corrections | Absent | Absent | Separate accounting integration |
| Customers/accounts | Records and email-gated billing portal; full account flow unconfirmed | Magic links/accounts/orders; no complete address editor | Accounts/addresses/downloads/payment methods |
| Merchant permissions | Admin UI; commerce permission model needed | Admin shell; commerce permission model needed | Shop-manager and entity/report capabilities |
| Transactional email | Templates; no durable retry outbox | Durable outbox/provider configuration | Templates/events; transport configuration |
| Reporting | Truncation/mixed-currency/refund issues | Sales/status/product/stock; not an accounting ledger | Analytics and CSV exports |
| CSV import/export | Complete workflow unconfirmed | Complete workflow absent | Product CSV tools; not full data migration |
| Privacy export/erase | Complete workflow unconfirmed | Complete workflow absent | Export/erase/retention tools |
| Reviews/moderation | Present; public email exposure | Absent | Verified-owner/moderation |
| Subscriptions | Modules; lifecycle unaccepted | Absent | Separate extension |
| Marketplace/commissions | Connect modules; single-vendor order restriction | Absent | Separate extension |
| Multiple currencies | Price maps/exponent helper | Currency fields; Stripe rejects zero/three-decimal | Store/order currency; conversion separate |
| Cloudflare Workers | Bundle builds with older-host constraints | Native CMS Worker/storage; 1.0.1 integration validated locally | PHP/WordPress/database origin |

## Findings that determined the foundation

### DashCommerce

A 1,000-minor-unit item, 100-unit discount and 25% tax produced a quote of 1,125, while Hosted Checkout sent the original 1,000 price. [The reviewed checkout source](https://github.com/emdashCommerce/dashcommerce/blob/7666c14e1ccae5678dfa31403675e65b1b3ff23d/packages/core/src/routes/checkout.ts#L480) used original `unitPrice`; the table-tax resolver was not connected to that path.

[The webhook source](https://github.com/emdashCommerce/dashcommerce/blob/7666c14e1ccae5678dfa31403675e65b1b3ff23d/packages/core/src/routes/webhook.ts#L69) wrote deduplication before side effects. An initial failure could therefore become a successful duplicate response without completing the order. Unpaid checkout completion with a processing PaymentIntent could create a paid order.

Other local probes demonstrated foreign/inactive variant repricing, paid orders missing items, failed refunds counted as refunded, stale coupon/free-shipping values, own-hold retry errors, public review email exposure and subscription event-ordering problems. The stock race used controlled mock interleaving, not a real D1 benchmark.

Fourteen main-branch lifecycle probes reproduced the defects. PR 28 reproduced all fourteen plus two version-guard cases. PR 18 reproduced the original nine lifecycle cases and four adapter cases covering unpaid-as-success, refund reference, amount/idempotency and currency formatting. Passing these probes meant reproducing a defect, not establishing correctness.

### Otta

A captured two-unit order could retain a mutable cart after interruption before adoption. Changing its quantity to one or three and retrying the same checkout key left the two-unit financial snapshot but adopted the changed stock quantity. This was reproduced on real migrated EmDash SQLite storage, including the development integration. [The reviewed adoption path](https://github.com/UrumiAI/otta.sh/blob/7c63e6c2b21927b4760d396cc79da321de131f15/packages/domain/src/orders/create-order-from-cart.ts#L152) did not carry expected quantities into adoption.

The reviewed Stripe refund parser accepted ID/amount/currency without distinguishing `pending`, `failed`, `canceled` and `requires_action`. A request could therefore be counted as completed refunded money. [The source](https://github.com/UrumiAI/otta.sh/blob/7c63e6c2b21927b4760d396cc79da321de131f15/packages/payments-stripe/src/index.ts#L974) was checked against [Stripe's refund object](https://docs.stripe.com/api/refunds/object).

Tax needed an explicit inclusive/exclusive policy and digital billing destination. [Quote handling](https://github.com/UrumiAI/otta.sh/blob/7c63e6c2b21927b4760d396cc79da321de131f15/packages/domain/src/pricing/quote.ts#L83) ignored digital-only destination, and [totals](https://github.com/UrumiAI/otta.sh/blob/7c63e6c2b21927b4760d396cc79da321de131f15/packages/domain/src/pricing/compute-totals.ts#L46) added tax to input prices.

Seven local probes reproduced the reviewed checkout/inventory/refund defects. Those probes used native storage/fault injection and substituted Stripe HTTP; they made no charges. Subsequent WSCommerce fixes and regression evidence are recorded in [validation](../validation.md).

## Selected Otta integration

The integration selected `3bf1802` and `c83577a` from PR 322, the variant commit `7f21308` from PR 326 and `2271db6` from PR 299. Older PR 326 ancestors already represented on main were not reapplied. Four conflicts were resolved while preserving newer shipping/address checks; a duplicated old shipping test block was excluded.

Two integration-only assertions were adjusted: the commerce port had 28 methods instead of 27, and the D1 schema test allowed EmDash 1.0.1's additional redirect trigger while still requiring revision triggers. These were not host patches or commerce correctness fixes.

The base integration is `15ebd751c7302ad69bb2f4fecde003e756c9e505`, six commits above reviewed upstream main. At that point backend variant sales existed but the reference PDP still selected the parent SKU. Later WSCommerce commits completed the selector/cart path and correctness work. See [provenance](../../NOTICE.md).

## Historical validation

| Source | Checks/results | Boundary |
| --- | --- | --- |
| DashCommerce main | Frozen Bun install; 103 upstream tests; types and Node/Cloudflare builds passed | No deployed/Stripe acceptance; real bindings required |
| DashCommerce PR 28 | Frozen install; 85 tests; types/build; 14 lifecycle and 2 compatibility reproductions | Older branch and defective guard; no 1.x support |
| DashCommerce PR 18 | 19 adapter tests; 9 lifecycle and 4 adapter reproductions | Registry not used by operational routes; no full branch build |
| Otta main | Frozen install/lint/types/build; 551 local D1 tests passed | No PostgreSQL or production acceptance |
| Otta full suite | First: 5,229 passed, 863 skipped, 1 TODO plus teardown timeout. Bounded retry: 5,228 passed, 1 failed, 863 skipped, 1 TODO plus cleanup timeout | Upstream full suite was not green; skipped PostgreSQL tests were not passes |
| Otta PR 326 | 18 selected domain/checkout pipeline tests passed | Not full storefront acceptance |
| Otta development integration | Frozen install/types/lint/build; 142 selected tests and 551 D1 tests passed | Count/schema assertions adjusted only in integration |
| Otta defect probes | 7/7 on main; same defects on the integration | Native local storage/fault injection; substituted payment HTTP |
| WooCommerce | Source/tag/stable spot checks, test/CI inspection and five development PRs | No PHP/Composer environment; WordPress checkout tests not run |
| EmDash | Plugin API/CAS inspection; 1.0.1 integration builds and runs D1 tests | Not every host feature or development-main revision tested |

These are historical review results. The final foundation's passing gates are in [docs/validation.md](../validation.md). A successful build or large unit suite cannot replace live purchase/refund/invoice/delivery acceptance.

## Reuse and implementation boundaries

Reuse Otta's domain/IO separation, stock/order state machine, captured orders, conditional stores, recovery tests, email outbox and EmDash integration. Use DashCommerce to compare module coverage and UI/configuration patterns. Use WooCommerce for retail/protocol scenarios while implementing native TypeScript behavior independently.

Each shop owns a Worker, database, media and credentials. Native cross-document operations and provider side effects need replayable completion, durable jobs and reconciliation; a read/save translation of database locking is insufficient. [EmDash's audited CAS implementation](https://github.com/emdash-cms/emdash/blob/18d6aa3f00f0c059df4207de921462b65c8c9413/packages/core/src/database/repositories/plugin-storage.ts#L187) is the concrete host primitive.

The original sequence was: harden checkout/stock/refunds/tax, complete retail and invoice/remote accounting flows, qualify production/provider behavior, then version the reusable platform. Carrier integration, dedicated pickup, general data migration/privacy tools, subscriptions, marketplace and complete digital delivery require separate work. Cloudflare Queues consumption was a proposal, not an implemented transport. Client-specific catalogs, assets and private prototype configuration are not distributed.
