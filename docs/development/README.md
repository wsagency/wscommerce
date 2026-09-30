# Developer documentation

This guide is for developers installing, extending and operating **WSCommerce (Websolutions Commerce)**. The current source is a locally validated foundation pinned to EmDash 1.0.1. Provider-account acceptance and production deployment remain explicit gates.

## Reading order

1. [Local setup](local-setup.md): toolchain, sample catalog, payment settings and targeted commands.
2. [Architecture and source map](architecture.md): ownership, composition, native state, routes and extension boundaries.
3. [Building integrations](integrations.md): payment/invoice adapters, Woo-compatible APIs/webhooks and provider configuration.
4. [English and Croatian interfaces](localization.md): locale selection, dictionaries, content boundaries and safe switching.
5. [Testing and releases](testing-and-releases.md): meaningful contract tiers, browser acceptance, CI and deployment checks.

Also read the root [engineering practices](../../DEVELOPMENT.md), [contributor guide](../../CONTRIBUTING.md) and [architecture decisions](../../adr/README.md). The [operator integration guide](../integrations.md), [deployment runbook](../../DEPLOYMENT.md) and [operations guide](../operations.md) complement these developer instructions.

## Stable identifiers

The public project is WSCommerce. Its inherited `@otta-sh/*` packages, new `@emdash-commerce/*` packages, `otta` plugin ID, `otta-console` native admin ID and existing route/cookie/storage names remain stable. They are compatibility and persistence contracts. Do not rename them as a cosmetic cleanup: a rename needs a migration and review of credentials, storage, permissions, cookies and callers.

Packages currently resolve within the pnpm workspace. Root/package versions are not an independently published WSCommerce npm distribution. Clone the repository and consume the workspace; do not publish to the upstream Otta namespace.

## Contribution and support

A new behavior needs a contract and evidence for its failure/replay boundary. A new provider needs its actual protocol, configured account profile and acceptance results. See [NOTICE.md](../../NOTICE.md) before importing code or data; protocol compatibility does not authorize relicensing third-party implementation code.

For custom integrations, shop implementation or commercial support, contact [hello@ws.agency](mailto:hello@ws.agency). Public bugs/proposals use [GitHub issues](https://github.com/wsagency/wscommerce/issues); security reports follow [SECURITY.md](../../SECURITY.md).
