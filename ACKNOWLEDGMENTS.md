# Acknowledgments

Thank you to the maintainers and contributors whose work supports WSCommerce.

## Foundation and runtime

- **[Otta](https://github.com/UrumiAI/otta.sh)** — Vedanshu, the UrumiAI team and contributors. The MIT commerce foundation supplies the domain, native stores, payment adapters, EmDash integration, admin surfaces and extensive contract tests. We preserve its history, original copyright and selected development-branch provenance.
- **[EmDash](https://github.com/emdash-cms/emdash)** — the CMS, plugin interfaces, storage primitives and admin host, developed by the EmDash and Cloudflare teams and contributors.
- **[Cloudflare workerd](https://github.com/cloudflare/workerd) and [Workers SDK](https://github.com/cloudflare/workers-sdk)** — the Worker runtime, Wrangler, local simulation and D1 test tooling used by the reference deployment.
- **[Astro](https://github.com/withastro/astro)** and **[React](https://github.com/facebook/react)** — the storefront framework and merchant interface.
- **[Kysely](https://github.com/kysely-org/kysely)**, **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)**, **[SQLite](https://sqlite.org/)**, **[PostgreSQL](https://www.postgresql.org/)** and **[node-postgres](https://github.com/brianc/node-postgres)** — host storage and database-backed validation.
- **[Unicode CLDR](https://github.com/unicode-org/cldr)** — country and subdivision data. The applicable Unicode notices are retained in the domain and plugin packages.

## Build and verification

Thanks to the teams behind **[TypeScript](https://github.com/microsoft/TypeScript)**, **[pnpm](https://github.com/pnpm/pnpm)**, **[tsdown](https://github.com/rolldown/tsdown)**, **[Oxlint and Oxfmt](https://github.com/oxc-project/oxc)**, **[dependency-cruiser](https://github.com/sverweij/dependency-cruiser)**, **[Changesets](https://github.com/changesets/changesets)**, **[Vitest](https://github.com/vitest-dev/vitest)**, **[Playwright](https://github.com/microsoft/playwright)** and **[fast-check](https://github.com/dubzzz/fast-check)**. Their tooling lets us test financial and inventory behavior against real native stores and the Worker runtime.

## Functional and integration references

- **[DashCommerce](https://github.com/emdashCommerce/dashcommerce)** — commerce module and UI coverage used in the comparative design audit; a reference project, without copied implementation source in this tree.
- **[WooCommerce](https://github.com/woocommerce/woocommerce)** and **[its REST API documentation](https://woocommerce.github.io/woocommerce-rest-api-docs/)** — retail feature coverage and remote integration contracts used for an independently implemented HTTP compatibility profile.
- **[Stripe](https://docs.stripe.com/)**, **[Solo](https://solo.com.hr/api-dokumentacija)** and **[e-racuni](https://e-racuni.com/)** — documented payment/accounting interfaces. Provider adapters still require acceptance with the intended account and supported profile.
- **[Contributor Covenant](https://www.contributor-covenant.org/)** — the community Code of Conduct template, with its original attribution retained.

For exact source/licensing boundaries, see [NOTICE.md](NOTICE.md). Thank you also to everyone who reports bugs, reviews changes, improves documentation and supports the author [with a coffee](https://ko-fi.com/klukacin).
