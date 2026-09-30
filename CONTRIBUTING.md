# Contributing to WSCommerce

Thanks for helping improve Websolutions Commerce. Start with the [developer guide](docs/development/README.md). Read [DEVELOPMENT.md](DEVELOPMENT.md) for the engineering rules, [README.md](README.md) for scope and [NOTICE.md](NOTICE.md) for source provenance. Existing `@otta-sh/*` and `@emdash-commerce/*` names remain compatibility identifiers.

## Set up

Use Node.js 22.16 or newer and the pinned pnpm 11.10.0. Install pnpm with `npm install --global pnpm@11.10.0`, or use your version manager to select the pinned version.

```sh
git clone https://github.com/wsagency/wscommerce.git
cd wscommerce
pnpm install --frozen-lockfile
```

The reference shop starts with `pnpm -C sites/staging dev`; complete the first-run wizard and follow [DEPLOYMENT.md](DEPLOYMENT.md) for sample pricing/stock and local configuration. Do not commit credentials or local database/configuration files.

## Make a change

Keep each PR focused. Use a descriptive branch such as `fix/receipt-replay` or `codex/receipt-replay`. A systemic architectural decision belongs in an [ADR](adr/README.md).

For feature/bug behavior, start with a failing behavioral test, implement the change and rerun the affected contract. Documentation and metadata changes do not need tests that merely mirror the edit.

- Money stays in branded integer minor units with an explicit currency.
- The domain imports no IO; dependency-cruiser enforces that boundary.
- Store contracts run on actual migrated databases. Do not replace persistence with a DB mock.
- Replay and crash recovery are part of the contract. Test interruption, retries and financial/stock conservation where affected.
- Provider acceptance is distinct from deterministic local adapter tests. A successful HTTP refund request is not a completed refund.
- Source identifiers, comments, API contracts and documentation stay English. User-facing reference-shop and commerce merchant copy supports English and Croatian; follow the [localization guide](docs/development/localization.md) and never dictionary-transform merchant/customer content or protocol values.
- Preserve original license notices for imported code/data, record source paths and commits in `NOTICE.md`, and keep dependency licenses intact. WooCommerce is a protocol/functional reference, not PHP source to paste into this MIT implementation.

## Validate

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm exec vitest run --maxWorkers=3
pnpm build
```

Use `pnpm format` to apply formatting. Run typecheck and build sequentially because the bundler cleans shared generated declarations. If switching Node versions, install a matching native SQLite build before running tests.

Additional tiers:

```sh
PG_CONNECTION_STRING=<disposable-postgres-url> pnpm test:pg
pnpm test:d1
pnpm test:e2e
```

The PostgreSQL tier exercises concurrent database writers. D1 runs locally inside workerd using a separate Vitest configuration; it needs no Cloudflare credentials. Browser acceptance needs a running, configured reference shop; a green server-free harness does not certify live checkout. See [docs/validation.md](docs/validation.md) for configuration and evidence boundaries.

CI runs workspace checks/build/tests, PostgreSQL integration and the D1 release gate on `main`. D1 also runs on pull requests targeting `main`, nightly and on demand. Release checks must not run real billing, payment or carrier operations without an explicitly configured acceptance environment.

## Submit

Explain the concrete problem, resulting behavior and validation. Include an ADR or provenance update when relevant. Keep package names and persisted plugin IDs stable unless an explicit migration plan accompanies the change. Package versions are inherited and are not independently published as WSCommerce; do not publish to upstream npm scopes.

Optional commit/PR area tags are `[Domain]`, `[Adapters]`, `[Plugin]`, `[Site]`, `[Test]`, `[CI]` and `[Docs]`. Add a changeset when a releaseable package's public behavior changes.

Use [GitHub issues](https://github.com/wsagency/wscommerce/issues) for bugs and proposals. Follow [SECURITY.md](SECURITY.md) for private security reports and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community participation. For integration or commercial support, contact [hello@ws.agency](mailto:hello@ws.agency).
