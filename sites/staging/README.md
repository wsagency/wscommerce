# @otta-sh/site-staging

The WSCommerce **reference storefront and admin**: an EmDash site on Cloudflare Workers backed by
a D1 content database and an R2 media bucket, with the Otta plugin registered **trusted
in-process**. See [ADR-0006](../../adr/0006-trusted-in-process-deployment.md) for why that is
allowed and what stays forbidden.

Pages are thin theme shims per [ADR-0003](../../adr/0003-storefront-plugin-routes.md): the
CMS query runs in the page, the plugin's public routes return JSON view models in-process
(`locals.emdash.handlePublicPluginApiRoute`), the page renders HTML. The `/cart/*` POST
endpoints own the `otta_cart` cookie (the plugin returns a cookie *descriptor*; the
endpoint applies it verbatim) and forward form-embedded idempotency keys — they never mint
one at POST time, so a double-submit replays instead of duplicating.

## Local development

```bash
pnpm --filter @otta-sh/site-staging dev
```

Nothing else has to be running: commerce is **in-process** in this site's own Worker
(ADR-0006), so there is no second process to start and no service URL to point at.

In `astro dev` the fastest path to a populated catalog is the dev-only bypass, which
applies the full seed including the 3 sample products:
`/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`. What first boot does and does
not seed in a real deployment is covered in [`DEPLOYMENT.md`](../../DEPLOYMENT.md) §2.2.

### English and Croatian presentation

The reference storefront supports `en` and `hr`. The header's native language form
sets the `wscommerce_locale` preference cookie through an origin-guarded `POST
/language`, then returns to the current page. A valid explicit preference wins over
the browser's weighted `Accept-Language` list; unsupported or malformed preferences
fall back to a supported browser language and finally English. Locale varies by
`Cookie` and `Accept-Language`; cart, checkout, payment, receipt and account responses
are private and are not stored in caches.

Authored interface messages live in [`src/lib/messages.ts`](src/lib/messages.ts).
Call `storefrontPresentation(Astro)` at explicit interface callsites and pass the
same locale to plugin presentation inputs, country labels and local account money
formatting. Named interpolation keeps customer and merchant values verbatim, and
quantity helpers use Croatian one/few/other plural forms. URLs, form names and values,
status enums, IDs, SKUs, stock and immutable financial snapshots stay unchanged.

The payment page reads only the original private order capability to obtain its
localized immutable total. It never requotes the cart or creates another payment;
the place-time stash label remains the fallback if that guarded read is unavailable
or expired. The Payment Element receives the same locale, including its unthemed
retry; authored browser failure messages arrive in escaped data attributes.

Language return targets accept only validated local absolute paths. They retain
private capability/query bytes. The narrow exception is Stripe's transport fields
`payment_intent`, `payment_intent_client_secret` and `redirect_status`: language
targets and receipt polling discard them, retaining all other parameters. Those
fields never supply payment truth or plugin inputs. Receipt pages use a `same-origin`
referrer policy so native local POSTs keep their real Origin while external
destinations receive no Referer or private URL.

[`src/lib/demo-content.ts`](src/lib/demo-content.ts) provides explicit display-only
translations for the reference seed's tagline, menu and three product descriptions.
Products must match their seed slug and exact source title/description; settings
and the entire menu must match their exact reference source. EmDash creates new
content IDs while seeding, so the stable seed slug is the content mapping key.
Changing merchant copy disables the mapping and displays the edit verbatim. Legacy
Otta seed titles also map to WSCommerce display branding. The seed's existing
IDs/slugs/SKUs and commerce input/title snapshots are preserved. New merchant
content needs its own explicitly authored localization model; it is never passed
through an interface dictionary. EmDash host/admin chrome outside commerce and the
developer styleguide are separate localization boundaries.

Focused tests include rendered Croatian pages/components, locale negotiation,
guarded preference POSTs, private query retention, uncalculated totals and immutable
payment reads. `e2e/storefront-language.spec.ts` exercises a real browser language
POST and verifies that a controlled external navigation receives no private Referer.

### Plugin settings are namespaced by plugin id

A setting saved under one plugin id is not visible to another. The Block Kit screens and the
React console both read `otta`'s.

### Running the stack from a non-interactive shell (agents, CI sandboxes)

`astro dev` is a long-running foreground process: started in the usual way it holds the
terminal and never returns. In an automated or agent-driven environment, start it **detached**
and wait until it reports its URL before driving it — a request issued before the server is
listening fails in a way that looks like an application error.

`STRIPE_PUBLIC_KEY` is read by the process that starts, not per request: it is baked as a
Vite `define`. **Changing it means restarting the dev server** — there is no runtime
override, in dev any more than in production. Setting it in a later shell has no effect on a
server that is already up.

## The STRIPE_PUBLIC_KEY build-time contract

The checkout's Payment Element needs a Stripe **publishable** key, baked in
`astro.config.ts` as a Vite `define`: shell env → `sites/staging/.env` → absent.
**Changing it means rebuild + redeploy.** The variable is **`STRIPE_PUBLIC_KEY`** — the name
matters, see below. It is not put in wrangler `vars` because the guard test forbids any
`vars` key matching `/SECRET|KEY|TOKEN|PASSWORD/i`, and that guard is worth keeping.

Three behaviours, deliberately distinct:

| `STRIPE_PUBLIC_KEY` | What happens |
|---|---|
| a valid `pk_test_…` / `pk_live_…` | full checkout: review → pay → confirmation |
| **unset** | Card payment is unavailable. Enabled bank transfer/COD can still create pending orders; their authenticated receipt actions supply payment evidence. |
| set but malformed | **the build FAILS** |

That last row is the point. An absent key and a *misspelt variable name* look identical at
runtime — both degrade quietly while a valid key may sit unread — so a present-but-malformed
value throws instead of degrading, and `test/checkout-config.test.ts` pins the variable's
exact spelling as test data. See [ADR-0012](../../adr/0012-storefront-checkout-loads-stripe-elements-in-the-browser.md).

**A build without the key tree-shakes the payment step away entirely** (the branch is
constant-folded). That is correct, but it means any QA of the payment step must build *with*
the key.

## Deploying

The deploy runbook for this site lives in the root [`DEPLOYMENT.md`](../../DEPLOYMENT.md):
resource creation, the build/deploy ordering, first boot + claim, and failed-first-boot
recovery are §2; the `global_fetch_strictly_public` ⇒ D1-`session`-off pairing invariant is
§2.4; the secrets checklist is §3. Provision `EMDASH_ENCRYPTION_KEY` before first boot
and the optional `OTTA_WH_TOKEN` webhook edge gate. Existing Stripe/email settings use
the authenticated console. New Solo/e-racuni/Woo credentials use server runtime bindings;
see [.dev.vars.example](.dev.vars.example) and [integration setup](../../docs/integrations.md).
Production deployment and external account acceptance remain separate gates.

## Notes

- **The checkout is built** (ADR-0012): `/checkout` (review + honest totals + contact and
  ship-to), `POST /checkout/place`, `/checkout/pay` (the Payment Element — the site's only
  third-party script, `js.stripe.com` its only third-party origin; the one other client
  script is the hold ribbon's bundled countdown, `src/components/HoldRibbon.astro`), and
  `/orders/<orderId>` (the capability-URL confirmation page, which polls with a bounded
  `<meta http-equiv="refresh">` and never claims "paid" on the strength of Stripe's
  redirect — verified settlement supplies payment evidence). Bank transfer and COD
  freeze their instructions and due dates into the order. COD acceptance permits dispatch
  while unpaid; a receipt records the exact frozen amount/currency. Declared variants
  have independent SKU/price/stock, managed in the authenticated Pricing & inventory
  screen and selected before adding to the cart. `POST /checkout/new-cart` is the way out
  of the dead-cart trap. Browser-to-Stripe traffic is separate from the plugin's scoped egress.
  Native inventory keeps cart/order reservations and durable replay claims; commercial
  writes must use its ports rather than raw CMS stock fields.
- **Accounting compatibility:** `/wp-json` and `/wp-json/wc/v3` expose the documented
  scoped Woo REST profile, including frozen order/variant amounts and signed durable
  created/updated webhooks. These are remote protocol interfaces; PHP Woo plugins do not
  execute in this site. Direct Solo/e-racuni invoice jobs are disabled by default and
  have a single configured owner. See [profile](../../packages/compat-woocommerce/README.md)
  and [operations](../../docs/operations.md) for recovery and live acceptance.
- **Still a follow-up:** the x402 payment gate (designed to live at THIS Astro page layer)
  and the digital-download delivery page (the plugin route authorizes; the site serves the
  bytes / signed URL). Note for that task: `entitlements/download` is a public existence oracle
  (it confirms whether an orderId/buyerRef/sku combination is entitled) — the delivery
  page must rate-limit and/or tokenize access to it rather than exposing raw probing.
- **Customer account pages (issue #306, ADR-0004).** Magic-link sign-in:
  `/account/login` (email form → `POST /account/login/request` → the same generic
  "if an account exists…" notice for every address), `/account/verify` (where the
  emailed link lands — it renders a button and redeems NOTHING on the GET, so a
  mail scanner's pre-fetch cannot spend the single-use token; `POST
  /account/verify/confirm` redeems it and applies the plugin's session-cookie
  descriptor verbatim, HttpOnly/Secure/SameSite=Lax), `/account/orders` and
  `/account/orders/<id>` (read through the session; guest orders under the same
  address are claimed at sign-in), and `POST /account/logout` (revokes server-side,
  always clears the cookie). Every POST runs the origin guard first; account pages
  are `private, no-store`. The header carries a theme-owned "Account" link unless the
  CMS menu already links into `/account`. Saved addresses
  (`storefront/account/addresses`) have no page yet.
  **Operator setup, required for sign-in:** in the plugin's Settings, set **Sign-in link
  page** (`settings:loginLinkUrl`) to this site's absolute verify URL, e.g.
  `https://shop.example/account/verify`. The emailed link points there and nowhere else.
  The request's origin is never used, because a spoofed `Host` could otherwise aim a
  victim's link at another domain. While the setting is unset, the login form still
  shows its generic notice but no link is sent, and the plugin logs that once.
- No secrets anywhere in this package: `.env` is gitignored, `.env.example` holds
  placeholders, `wrangler.jsonc` `vars` must never grow a secret-shaped key (pinned by
  `test/wrangler-config.test.ts`).
