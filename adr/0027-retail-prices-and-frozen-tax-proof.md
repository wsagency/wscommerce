# 0027. Retail prices and tax proof are frozen at checkout

- Status: accepted
- Date: 2026-09-30
- Amends: ADR-0021's shipping-only tax jurisdiction and digital tax exemption only.

## Context

EUR retail catalog prices may already include VAT. Adding tax to those prices
charges the buyer twice. Invoice and compatibility projections also need the
actual tax calculation at purchase time; recomputing from current tax rates or
reverse engineering old order totals cannot establish that calculation.

## Decision

Each product may declare `priceTaxMode: "exclusive" | "inclusive"`. Its variants
inherit this policy. An absent policy preserves the existing exclusive behavior.
The merchant pricing editor saves this field through the guarded product edit
command. Catalog unit prices retain their stated mode; shipping rates remain net.

Coupon allocation runs over catalog line subtotals before tax. For an inclusive
line, the engine rounds the net amount of the whole discounted line to the
nearest cent, with ties rounded up, using integer arithmetic. Its tax is the
discounted gross amount minus that net. Exclusive lines retain the existing
rounded tax calculation. A mixed cart uses each line's own policy. Every quote
obeys `sum(line.netCents) + shippingNetCents + taxCents === totalCents`.

The quote accepts a coarse `taxDestination` independent of delivery. Checkout
uses the validated billing address first, with shipping as the legacy fallback.
Both jurisdictions use the configured exact-code zones; clients cannot supply a
zone ID. Digital orders with a destination resolve tax normally. If zones are
configured, a new digital checkout without billing or a legacy shipping address
is refused before an order is minted. Tax is determined by configured rules;
this policy does not invent rates for countries or historic orders.

Checkout writes the selected line's `taxClassId`, `priceTaxMode`, `rateBps`,
`subtotalNetCents`, `discountedCents`, `netCents`, `grossCents` and `taxCents` in the
same immutable order document as its unit price and quantity. Net and gross are
discounted **line** amounts, not unit amounts. The totals' `taxBreakdown` repeats
the line proof and stores `shippingNetCents`, `shippingTaxCents`,
`shippingRateBps`, `taxDestination` and the root mode (`exclusive`, `inclusive`, or
`mixed`). A replay reads these fields without consulting the mutable catalog or
tax rules.

The storefront's visible variant selector resolves the chosen variant's SKU,
price and availability on the server, then submits that SKU to the existing
cart command. New order lines freeze `variantId` as `productId:variantKey`; SKU
renames cannot change the identity exported by invoices or compatibility APIs.
Base product lines use null. Legacy lines keep their absent identity and tax
proof, so downstream consumers can distinguish unknown historical evidence.

## Consequences and upgrades

These are additive document fields; there is no schema migration or backfill.
Existing products remain exclusive. Existing orders retain their original
arithmetic and missing proof. Consumers must refuse calculations that require
unknown historical tax rates rather than filling them from today's catalog.
Upgrade pricing writers and consumers together: old checkout binaries ignore an
inclusive policy and can add tax again. Mixed-version checkout is unsupported
once a merchant enables inclusive prices.

The engine, checkout and persistence contracts run against migrated SQLite and
local D1. The plugin client and merchant editor have behavioral tests, and the
variant route is exercised through the workerd sandbox. Storefront browser and
payment acceptance remain separate integration checks.
