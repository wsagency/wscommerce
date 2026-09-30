# Local developer setup

## Toolchain and install

Use Node.js 22.16 or newer and the root's pinned pnpm 11.10.0. CI selects Node 22; the foundation's recorded local acceptance used Node 26.9.0. Native SQLite must be installed for the Node runtime that runs the suite.

```sh
npm install --global pnpm@11.10.0
git clone https://github.com/wsagency/wscommerce.git
cd wscommerce
pnpm install --frozen-lockfile
pnpm -C sites/staging dev
```

The reference shop needs no separate commerce service. Astro/EmDash uses local Worker/D1 simulation. Open the URL printed by the server and complete the setup wizard. Select sample content to create the demo CMS products. For local-only development, the site's [README](../../sites/staging/README.md) documents the dev-bypass route; never treat it as a production claim flow.

Astro can detect an agent environment and daemonize. To keep a dev server owned by your terminal/test harness, set `ASTRO_DEV_BACKGROUND=1` when starting it. The [Playwright configuration](../../playwright.config.ts) does this for its optional managed stack.

## Make demo products sellable

CMS product content and native commerce are separate. In the authenticated admin console, open **Pricing & inventory** and set a SKU, two-decimal currency price and stock. Publishing content alone does not seed commercial prices or inventory.

The optional [demo-commerce seed](../../sites/staging/scripts/seed-demo-commerce.ts) uses the site's own authenticated admin API:

```sh
SITE_URL=http://localhost:4321 EMDASH_TOKEN=<local-admin-api-token>   pnpm dlx tsx@4 sites/staging/scripts/seed-demo-commerce.ts
```

Set `SITE_URL` to the actual printed URL. The token must read content and call the merchant route. The script skips products that already have a SKU; it does not overwrite merchant pricing. Keep tokens out of committed files and captured shell output.

Configure tax and shipping rules in the console for the destination being tested. For bank transfer/COD, enable the desired method and its instructions/payment window in Settings. Bank orders remain pending until a private receipt; unpaid COD acceptance can permit dispatch. Unconfigured card payments remain unavailable.

## Local provider configuration

For optional invoice/Woo configuration:

```sh
cp sites/staging/.dev.vars.example sites/staging/.dev.vars
```

Keep `INVOICE_OWNER=disabled` and `INVOICE_LIVE_ENABLED=false` until account acceptance. Set the canonical `COMMERCE_PUBLIC_URL` to the actual local origin. Woo HTTP credentials can be local dummy values; the explicit localhost HTTP override is only for loopback development.

Public build-time endpoints go in the site's ignored `.env`, following [`.env.example`](../../sites/staging/.env.example). They grant provider hosts to the plugin. Secret invoice/Woo bindings remain server-only in `.dev.vars`; existing Stripe/email credentials are write-only admin settings. `STRIPE_PUBLIC_KEY` is the publishable browser key; restarting dev or rebuilding is required after changing it. Follow [the integration guide](../integrations.md) for the complete configuration table.

Do not point a local smoke test at a real invoice, email or carrier destination unless you deliberately configured and authorized that acceptance environment.

## Fast developer loop

```sh
pnpm lint
pnpm typecheck
pnpm exec vitest run --project invoicing
pnpm format:check
```

The root [Vitest configuration](../../vitest.config.ts) aggregates package projects; each package config defines its project name. For a focused file, run Vitest from that package, for example:

```sh
pnpm -C packages/invoicing exec vitest run
pnpm -C packages/compat-woocommerce exec vitest run
```

Do not run typecheck and build concurrently in the same checkout: the bundler cleans `dist`, including declarations consumed by TypeScript project references. See [testing and releases](testing-and-releases.md) for the full gates.

## Common setup problems

| Symptom | Check |
| --- | --- |
| Native SQLite ABI error | Reinstall/rebuild the native dependency under the Node version running tests. |
| Empty product page after first boot | Sample content is applied by the wizard; commercial SKU/price/stock still needs merchant configuration. |
| Checkout has no payment method | Configure offline Settings, or both Stripe server secrets plus the publishable key. |
| Invoice integration stays disabled | Both ownership and explicit live opt-in are required; credentials/allowlisting alone do not issue. |
| Provider request is refused by the plugin | Verify the build-time host grant; configuration changes may require rebuilding. |
| Missing generated declarations | Stop concurrent build/typecheck and run `pnpm exec tsc -b --force`, then the checks sequentially. |

Resource provisioning, encryption keys, claiming a fresh deployment and build/deploy ordering are in [DEPLOYMENT.md](../../DEPLOYMENT.md).
