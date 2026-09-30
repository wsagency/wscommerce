# EmDash Commerce implementation plan

> For agentic workers: use executing-plans for orchestration and dispatching-parallel-agents for independent inventory, refund and compatibility tasks. Follow TDD for behavior changes.

**Goal:** Deliver the approved reusable EmDash Commerce fork, harden known correctness failures, and implement invoice and WooCommerce compatibility foundations with a runnable reference shop and documentation.

**Architecture:** Preserve Otta's domain and CAS adapter as the authority. Add provider packages and a selected WooCommerce REST/webhook profile, with thin host route adapters and durable integration state. Each shop owns its deployment and secrets.

**Tech stack:** TypeScript, pnpm, EmDash 1.0.1, Astro, Cloudflare Workers/D1/R2, Stripe, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-emdash-commerce-design.md`.

## Global constraints

- Base `15ebd751`; EmDash and @emdash-cms host packages pinned to 1.0.1.
- Integer money, immutable order snapshots, no IO in domain, scoped HTTP transport in sandbox.
- Preserve upstream MIT attribution; do not copy WooCommerce or vendor PHP code into this MIT distribution.
- Native order/store data is authoritative; external protocol compatibility is explicit and partial.
- No real credentials in source, tests, logs or Git; no live external mutations.
- Keep acshop unchanged. Implement in the independent local repository.

## Review focus

- Checkout interrupted before adoption, followed by cart quantity edits: frozen order and inventory quantities must agree.
- Provider HTTP success with pending/failed refund status: local financial records must remain truthful.
- Long-delayed movement replay after 256 newer movements: stock conservation must hold.
- REST writes with insufficient scopes or unsupported fields: reject the whole write without side effects.
- Unknown invoice outcome/retry and tax/rounding mismatch: never issue a blind duplicate or claim reconciled totals.

## Task 1: Repository and provenance

Files: root README/NOTICE, docs/research, design/plan, env examples, changesets and deployment instructions.

- [x] Preserve the audited integration history in a separate local repository and record source commits/licenses.
- [x] Install from the locked workspace and confirm baseline checks; capture any inherited failures.
- [x] Document core modules, per-shop isolation and precise implementation/acceptance status.

## Task 2: Quantity and movement correctness

Files: `packages/domain/src/orders/create-order-from-cart.ts`, inventory port, `packages/store-emdash/src/emdash-inventory-store.ts`, inventory documents and corresponding contract/crash tests.

Interfaces: existing `InventoryStore` reservation/adoption and idempotent movement commands; preserve backward compatibility for unaffected callers.

- [x] Add failing real-store tests: persist qty 2, interrupt adoption, edit cart qty 1 and qty 3, retry original checkout; never pay with mismatched holds.
- [x] Add failing real-store test: failed claim completion, 256 subsequent movements, replay first restock; final stock remains 273.
- [x] Enforce frozen expected quantities and durable movement replay protection; document forward compatibility of existing rows.
- [x] Run store/domain regression suites and D1 tier, then commit the focused change.

## Task 3: Refund truthfulness

Files: `packages/payments-stripe/src/index.ts`, payment gateway/refund ports, refund use cases/stores and webhook adapter if required.

Interfaces: `RefundResult` must distinguish completed money movement from awaiting/unverified/terminal outcomes. Existing admin reconciliation must preserve reserved/unknown amounts accurately.

- [x] Add failing tests for Stripe pending, failed, canceled and requires_action responses; no case may mark an order refunded.
- [x] Implement provider-status handling, durable references and the required reconciliation/event path; no unsafe second request after unknown issuance.
- [x] Test succeeded, partial, replay, ambiguous timeout and eventual completion/failure using actual order/refund storage.
- [x] Run adapter/domain/admin tests, typecheck and commit the focused change.

## Task 4: WooCommerce accounting compatibility

Files: new `packages/compat-woocommerce`, profile docs and thin native route composition in the sample site's `/wp-json` route.

Interfaces: a typed backend port owns reads and guarded mutations; handler accepts a Web `Request` and returns a Web `Response`; signing function accepts the exact serialized payload bytes. Persistent IDs are owned by a store port, not hash helpers.

- [x] Verify official e-racuni connector and vendor plugin source requirements; distinguish remote REST, legacy API and PHP runtime assumptions.
- [x] Add failing HTTP contract tests for auth/scopes, order/product mapping, pagination headers, stable IDs, metadata, invalid writes and webhook signatures.
- [x] Implement the declared supported profile and explicit unsupported errors; retain native state-machine constraints.
- [x] Wire route/discovery and document e-racuni setup and the real-account acceptance gate.
- [x] Run profile tests/build/typecheck and commit.

## Task 5: Invoice providers and durable work

Files: new `packages/invoicing`, provider transport modules, integration-job storage/composition, tests, settings/env and provider documentation.

Interfaces: `InvoiceSnapshot` contains immutable amounts/billing/correlation data; `InvoiceProvider` uses an injected fetch-like transport and returns typed confirmed/retryable/terminal/unknown results; the dispatcher persists provider references and guards lease/replay before external calls.

- [x] Add failing tests for provider wire mapping, total equality, safe error redaction and ambiguous outcomes.
- [x] Implement Solo and documented e-racuni JSON API clients; configure the organization-specific e-racuni endpoint explicitly.
- [x] Implement durable invoice work with replay safety and observable state. Configure a single invoice owner per shop to prevent both a direct provider and Woo connector issuing the same invoice.
- [x] Wire native order snapshot/route/cron seams; test issue/retry/lookup/correction capability accurately.
- [x] Document credential placement and live acceptance separately, then commit.

## Task 6: Shop completeness and integrated acceptance

Files: pricing/quote policy, offline payment adapter, storefront product/checkout pages, plugin settings, shipping extensions, operations docs and native integration tests.

- [x] Add failing tests for inclusive prices and digital destination, bank/COD public checkout vs authorized confirmation, and variant selection.
- [x] Implement explicit pricing/offline flows and variant storefront UX through existing native ports. Shipping additions use confirmed local methods/contracts.
- [x] Integrate independent commits, run lint/typecheck/build/full suite/D1, investigate inherited sandbox cleanup failures and run a local storefront smoke check.
- [x] Document remaining external acceptance gates and unsupported optional commerce modules, add changesets and commit the reviewable integrated result.

## Execution

The user explicitly requested immediate implementation of the previously proposed design. Execute in this session. Independent tasks 2–4 use isolated local worktrees; root owns invoicing, composition, documentation and final integration. No additional approval is required for local code or reversible repository work.
