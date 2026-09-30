# Croatian and English interfaces implementation plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task by task. The independent storefront and merchant presentation tasks may run in parallel with disjoint file ownership.

**Goal:** Keep the module/docs English while making the reference shop and commerce application usable in Croatian and English.

**Architecture:** Localization is explicit presentation code, independent of commerce state. The storefront owns request locale, dictionaries and safe return navigation. Merchant UI owns its React language context/dictionaries and translates authored presentation copy without rewriting record data or command identifiers.

**Tech stack:** TypeScript, Astro, React, existing Vitest/native-store contracts and Playwright.

**Spec:** [HR/EN design](../specs/2026-09-30-hr-en-interface-design.md).

## Global constraints

- English source identifiers/comments/documentation; EN/HR user-facing presentation.
- No changes to monetary arithmetic, immutable financial/billing snapshots, native IDs, auth, capability URLs or provider/API enum values.
- No live provider or production writes.
- Preserve the existing MIT/Unicode notices and Otta compatibility identifiers.
- Do not change the separate client repository or expose its private content.

## Review focus

- Query strings and private order capabilities survive switching; known Stripe redirect-only fields are discarded and external return URLs never redirect.
- Unknown/malformed locale input falls back without failing checkout.
- Changing locale never changes stock/action/idempotency/financial values.
- Customer names, product titles, notes and operator-authored instructions are not dictionary-transformed.
- English remains available; Croatian labels, formatting, accessibility and plural forms agree.

## Task 1: Reference storefront localization

**Files:** `sites/staging/src/lib/site-locale.ts`, new locale dictionaries/helpers and language route/middleware as needed; `sites/staging/src/pages`, components, layout, relevant tests and `sites/staging/README.md`.

**Interfaces:** Consume request/cookie preference and existing plugin `locale` input. Produce bilingual rendered pages and a safe persisted language switch; retain English fallback and native command/form values.

- [x] Add failing behavioral tests for locale selection/persistence, safe return targets and translated checkout/navigation/formatting.
- [x] Run the focused tests and confirm missing behavior fails.
- [x] Implement explicit dictionary rendering and propagate request locale to plugin view models.
- [x] Run storefront tests and build; inspect rendered EN/HR views and unchanged purchase inputs.
- [x] Commit the self-contained storefront change.

## Task 2: Merchant application localization

**Files:** `packages/admin-react/src`, `packages/admin-presentation/src` where shared authored copy requires localization, their tests, and plugin-facing presentation only where a safe explicit locale seam exists.

**Interfaces:** Produce an EN/HR merchant language choice, typed presentation translation and localized fixed copy. Preserve current English APIs and underlying command/status/data identities.

- [x] Add failing DOM/presentation tests for switching/persistence, Croatian action/confirmation/validation labels and untouched record/command data.
- [x] Run focused cases and confirm the current English-only behavior fails.
- [x] Implement context/dictionaries and explicit translation at authored-copy call sites.
- [x] Run admin/presentation tests and relevant plugin contracts; verify data and mutations remain identical across locales.
- [x] Commit the self-contained merchant change.

## Task 3: Integrated documentation, verification and publication

**Files:** `docs/development`, `README.md`, `CHANGELOG.md`, final integrated sources/fixtures only if review finds a defect.

- [x] Document locale selection, supported surfaces, dictionary extension and content/financial boundaries in English.
- [x] Review both final diffs, reproduce critical issues before fixing, and verify no private client content is added.
- [x] Run full local checks/build/workspace/browser contracts and the PostgreSQL/D1 gates. Inspect the final publication CI separately.
- [ ] Publish final commits to `wsagency/wscommerce` and verify remote SHA, public MIT metadata and CI results.
