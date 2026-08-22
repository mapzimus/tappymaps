# Tappymaps — Monetization / Auth / Serverless API Audit
**Date:** 2026-08-21 · **Scope:** `index.html` (client gates), `api/**`, `supabase/migrations/**`
**Method:** full read of every backend file + Playwright reproduction against the local dev server (`127.0.0.1:8123`, `/api/*` stubbed, Supabase unreachable). No production network calls were made. Scripts: `<SP>/work/money/p1..p8*.mjs`. Screenshots: `<SP>/shots/money-*.png`.

## Verdict

**No. This app cannot safely take money today.** Not because of one hole — because the paid product has no server-side enforcement anywhere, and the one tier that *is* server-enforced is broken by a typo.

Three things compound:

1. **Every Pro and Classroom entitlement is a client-side boolean.** `isPro()` returns `appState.proUnlocked`. Two console assignments unlock unlimited exports, county view, Census data maps, CSV import, cloud My Maps, SVG export, share/embed links, subtitles, class codes and the Classroom worksheet pack. Nothing on the server re-checks entitlement at the point of use.
2. **The anonymous export gate is a localStorage boolean**, and anonymous exports are deliberately *unwatermarked*. Clearing one key — or just opening a private window — yields unlimited, full-resolution, unbranded exports with no account at all.
3. **`window._supabase` is never assigned**, so the signed-in free tier (the entire 3-exports/month, server-enforced path) throws on every export and fails closed. Signed-in free users can *never* export. `/api/stripe/track-export` is never called by the client — the "server-enforced quota" is dead code that has never run.

The net effect: the only working export path in production is the anonymous one, it is unmetered in practice, and it produces a *cleaner* file than what Pro is advertised to deliver. Meanwhile the funnel actively punishes the desired behaviour — the anon block says "Sign up for a free account to continue exporting," and signing up takes you from one working export to zero.

The serverless layer is the better half of the codebase — signature-verified webhook, JWT-gated checkout, a genuinely tight price allowlist, a well-guarded Census proxy. But it is bypassed by the client, not consulted by it. Separately, there is **no cancellation path, no billing portal, no Terms of Service, no Privacy Policy and no refund policy anywhere in the product** — a hard blocker for charging consumers regardless of the code.

**Counts:** P0 × 3 · P1 × 6 · P2 × 14 · P3 × 8 (31 findings)

---

## P0

### [P0] `window._supabase` is undefined — signed-in free users can never export, and the server-side quota has never once run
- **Area:** `index.html` — `checkExportPermission()` / `recordExport()`; `api/stripe/track-export.js`
- **Repro:**
  1. Load `/design/make`.
  2. Console: `appState.currentUser = { id:'u1', email:'free@example.com' }` (simulates a signed-in free user).
  3. `await checkExportPermission()`.
  4. Click **Save as Image**.
- **Evidence:**
  ```
  4 SIGNED-IN FREE {"perm":{"allowed":false,"isPro":false,"remaining":0,"serverError":true},
                    "_supabaseType":"undefined"}
    console: Export permission check error: TypeError: Cannot read properties of undefined (reading 'auth')
             at checkExportPermission (index.html:11668)
    API CALLS: []          <-- /api/stripe/track-export was never requested
  4 SIGNED-IN FREE | toasts: ["error: Could not verify export quota — please check your connection and try again"] | downloads: []
  5 recordExport API calls made: []
    console: Export record error: TypeError: Cannot read properties of undefined (reading 'auth')
  ```
  ```js
  11668:  const session = await window._supabase.auth.getSession();   // checkExportPermission
  11709:  const session = await window._supabase.auth.getSession();   // recordExport
  ```
  `grep -n "_supabase" index.html` returns **only those two read sites**. Nothing ever assigns `window._supabase`. The only client is the lexical `const supabaseClient` at `index.html:11280`, which is not on `window`.
- **Location:** `index.html:11668`, `index.html:11709` (client is at `index.html:11280`)
- **Impact:** The entire signed-in free tier is dead. A user follows the app's own upgrade prompt ("Sign up for a free account to continue exporting"), creates an account, and goes from 1 working export to 0 — greeted by a false error blaming their connection. That is the top of the paid funnel, broken. Secondly: because `recordExport()` also throws, `/api/stripe/track-export` has **never been called by any client**, so `export_counts` is empty and the documented "3/month server-enforced" quota has never executed in production. Any future fix to `_supabase` will suddenly start metering users who currently believe they are unlimited.
- **Fix:** Replace both `window._supabase` reads with the real client (`supabaseClient`), or assign `window._supabase = supabaseClient` next to line 11280. Then add a smoke test that asserts `/api/stripe/track-export` is actually requested during a signed-in free export. Separately, stop returning "check your connection" for an internal TypeError — distinguish transport failure from a client bug.

### [P0] All Pro and Classroom entitlements are client-side booleans — two console assignments unlock the whole paid product
- **Area:** `index.html` — `isPro()`, `isClassroom()`, `updateProGates()`, every `gateProFeature()` call site
- **Repro:**
  1. Load `/design/make` as a signed-out visitor.
  2. Console: `appState.proUnlocked = true; appState.classroomUnlocked = true; updateProGates(); updateClassroomUI();`
  3. Use any Pro or Classroom feature.
- **Evidence:**
  ```
  === FREE (default) ===
  gateProFeature(legend) -> false | toasts: ["MODAL: showUpgradeModal"]
  === FLIP proUnlocked + classroomUnlocked ===
  gateProFeature(legend) -> true       | toasts: []
  isClassroom            -> {"pro":true,"classroom":true}
  classroom tools visible -> {"tools":"block","upsell":"none"}
  worksheet pack gate    -> "ran"      (proceeded to build the 3-PNG pack)
  proBadges hidden       -> ["none","none","none","none"]
  ```
  ```js
  11282: function isPro()       { return !!appState.proUnlocked; }
  11285: function isClassroom() { return !!appState.classroomUnlocked; }
  12215: function gateProFeature(featureName) { if (isPro()) return true; showUpgradeModal(); return false; }
  ```
  Also reachable without touching flags at all, because every gated action is a `window` global with the check *inside* it:
  ```
  F globals reachable from console:
   { countyDirect: "function"        // loadCountyView('06') skips openCountySelector's gate entirely
   , executeDataMapLoad: "function", fetchCensusData: "function"
   , exportWorksheetPack: "function", classroomCreateOrRefreshCode: "function" }
  7 BYPASS captureMapImage direct -> {"w":3252,"h":2286,"dataUrlLen":949518}   // 3252×2286 PNG, no permission check
  ```
- **Location:** `index.html:11282-11287` (definitions), `12177-12218` (`updateProGates` / `gateProFeature`), `13928` (county gate), `13552` (Census `dataset.pro` gate), `6814`/`6930` (Classroom gates), `11773` (`captureMapImage`, ungated)
- **Impact:** Every advertised paid feature — $9/mo Pro *and* $12/mo Classroom — is free to anyone who opens devtools. Nothing on the server re-validates entitlement when the feature is used: `verify-subscription` is consulted once at sign-in and its answer is cached in a mutable JS object. Since Classroom's two differentiators (class codes, worksheet PNG pack) are pure client-side capabilities, the $12 tier has *no* server-side substance at all to protect.
- **Fix:** Move the enforcement to where the value is produced. Concretely: (a) render Pro-quality exports server-side through an authenticated `/api/render` variant that re-checks the subscription per request, leaving the client path watermarked/limited; (b) make `/api/census` require a JWT and check `isPro` server-side for `pro:true` datasets; (c) enforce Classroom in RLS (see the `classroom_codes` finding) so class codes cannot be minted without a Classroom subscription. Client flags should be presentation only.

### [P0] Anonymous export gate is one localStorage boolean, and anonymous exports are deliberately unwatermarked
- **Area:** `index.html` — `getAnonymousExportUsed()` / `setAnonymousExportUsed()`, `cleanExport`
- **Repro:**
  1. Load `/design/make`, colour a state, click **Save as Image** → PNG downloads.
  2. Click again → blocked with "Sign up for a free account to continue exporting".
  3. Console: `localStorage.removeItem('tappymaps_anon_export')` (or just open a private window / clear site data).
  4. Click **Save as Image** again.
- **Evidence:**
  ```
  1 ANON #1             | toasts: ["info: Exporting PNG...","success: PNG exported successfully"] | downloads: [ 'my-us-map.png' ]
  2 ANON #2             | toasts: ["info: Sign up for a free account to continue exporting"]       | downloads: []
  3 BYPASS localStorage | toasts: ["info: Exporting PNG...","success: PNG exported successfully"] | downloads: [ 'my-us-map.png' ]
  ```
  ```js
  11646: return localStorage.getItem('tappymaps_anon_export') === 'true';
  11649: localStorage.setItem('tappymaps_anon_export', 'true');
  11660: return { allowed: true, isPro: false, remaining: 0, anonymous: true };
  12038: const cleanExport = perm.anonymous || isPro();      // anonymous == clean, same as Pro
  12052: if (!cleanExport) { ...ctx.fillText('tappymaps.com', ...) }
  ```
- **Location:** `index.html:11645-11650`, `11657-11663`, `12038-12058` (PNG), `12146-12158` (clipboard), `12246-12292` (SVG)
- **Impact:** Unlimited, unmetered, unbranded, full-resolution (3252×2286) exports with no account and no payment. Combined with the `_supabase` P0 above, this is the *only* export path that works in production — so in practice Tappymaps currently gives its core paid deliverable away for free, in higher quality than the advertised Pro output, to everyone. The "1 free export" number is decorative.
- **Fix:** Anonymous exports should be watermarked (invert the `cleanExport` logic — `anonymous` should mean *stamped*, not clean), and the anonymous allowance should be metered server-side by a signed, short-lived token issued by `/api/…` rather than by a localStorage flag. Accept that a determined user will still bypass it; the goal is that the *default* free artifact is visibly free.

---

## P1

### [P1] `user_subscriptions` and `export_counts` have no migration in the repo — the RLS on the two money tables is unversioned and unauditable
- **Area:** `supabase/migrations/` (absent), `api/stripe/*.js`
- **Repro:** static analysis. `ls supabase/migrations/` → `20260716_analytics_events.sql`, `20260801_classroom_codes.sql`, `20260801_gallery_public.sql`, `20260801_user_maps.sql`. `grep -rl "user_subscriptions\|export_counts" .` matches only JS, README and docs — **no DDL, no policy definitions**.
- **Evidence:** `.claude/CLAUDE.md`: *"Tables (in the working project): `user_subscriptions`, `export_counts` — both with RLS."* That claim cannot be verified from the repository, and the four tables that *do* have migrations were all created later, suggesting these two predate the migration discipline. Tables created via the Supabase SQL editor do **not** get RLS enabled automatically.
- **Location:** `supabase/migrations/` (missing files); consumers at `api/stripe/verify-subscription.js:69`, `api/stripe/track-export.js:52`, `api/stripe/webhook.js:82`
- **Impact:** **UNVERIFIED (no network access to Supabase from this environment) but potentially P0.** The publishable key `sb_publishable_wRYolYcDWeiUzobTmaCnrQ__J0quzOq` is in the shipped client (`index.html:11279`). If `user_subscriptions` lacks RLS or carries a permissive `insert` policy, any signed-in user can `POST /rest/v1/user_subscriptions` with `{user_id: <own uid>, status: 'active'}` and become Pro *server-side* — which would defeat `verify-subscription`, `track-export`, and any future server-side gate simultaneously. Same shape for `export_counts` (self-reset to 0).
- **Fix:** Verify immediately in the Supabase dashboard that both tables have `enable row level security` and **no** anon/authenticated `insert`/`update` policies (service-role writes only; `verify-subscription` reads via service role, so users need no direct access at all). Then commit the DDL + policies as `supabase/migrations/*.sql` so this is reviewable. This is the single highest-value 10-minute check on the list.

### [P1] Any transient `verify-subscription` failure silently downgrades a paying customer to free, with no error and no retry
- **Area:** `index.html:11380-11416` — `checkSubscriptionStatus()`
- **Repro:** `page.route('**/api/stripe/verify-subscription*', …)` injecting each failure mode, then `await checkSubscriptionStatus('FAKE.JWT')` with `appState.currentUser` set.
- **Evidence:**
  ```
  A server says isPro:true          -> {"pro":true,"classroom":true,"sub":{"status":"active"}}
  B server 500 (paying user, outage)-> {"pro":false,"classroom":false,"sub":null}
  C server malformed JSON           -> {"pro":false,"classroom":false,"sub":null}
  D server 401                      -> {"pro":false,"classroom":false,"sub":null}
  E network abort                   -> {"pro":false,"classroom":false,"sub":null}
  ```
  ```js
  11402:  if (res.ok) {            // <-- non-ok: no else, no message, no retry
  11404:    appState.proUnlocked = !!body.isPro;
  11413:  } catch (err) { console.error('Subscription check error:', err); }
  ```
- **Location:** `index.html:11398-11415`
- **Impact:** A paying customer who loads the page during a Vercel cold-start error, a Supabase blip, a corporate proxy, or an ad-blocker rule against `/api/stripe/*` sees a plain free account for the entire session — Pro features locked, upgrade modals firing, "0 free exports remaining" — and is given **no** indication that anything failed. The only recovery is a reload they have no reason to attempt. This is the fail-closed misfire the brief asked about, and it is worse than a leak: it looks like the product stole their money. It is also silent in analytics, so you would never learn it was happening.
- **Fix:** On a non-ok/throw path, leave the previous entitlement in place, retry with backoff (2–3 attempts), and if it still fails show a distinct "Couldn't confirm your subscription — retrying" state rather than silently rendering the free UI. Cache the last successful verification (with its `current_period_end`) in `sessionStorage` and honour it during an outage.

### [P1] `past_due` instantly revokes Pro on the first failed charge, mid-paid-period
- **Area:** `api/stripe/webhook.js:154-172`, `api/stripe/verify-subscription.js:73`
- **Repro:** static analysis. `invoice.payment_failed` → `status: 'past_due'`. `verify-subscription` selects `.in('status', ['active','trialing'])` → a `past_due` row yields `isPro: false`.
- **Evidence:**
  ```js
  // webhook.js:159-164
  .from('user_subscriptions').update({ status: 'past_due', ... })
  // verify-subscription.js:70-74
  .from('user_subscriptions').select('*').eq('user_id', userId)
  .in('status', ['active', 'trialing']).single();
  ```
- **Location:** `api/stripe/webhook.js:154`, `api/stripe/verify-subscription.js:73`
- **Impact:** Stripe's default dunning retries a failed charge over ~2–3 weeks before giving up, and the customer has already paid for the current period. Tappymaps revokes access on the *first* decline — an expired card on renewal day locks a paying annual subscriber out of the product they paid for, mid-term. That produces chargebacks and refund requests, which is materially more expensive than the leakage it prevents.
- **Fix:** Treat `past_due` as entitled until `current_period_end` (plus a short grace window), and show an in-app "update your payment method" banner instead of a hard lock. Keep `canceled`/`unpaid`/`incomplete_expired` as revoking.

### [P1] `verify-subscription` trusts a stale DB row forever — one dropped `customer.subscription.deleted` webhook = permanent free Pro
- **Area:** `api/stripe/verify-subscription.js`
- **Repro:** static analysis. The query filters on `status` only; `current_period_end` is selected and returned but **never compared to `now()`**. There is no reconciliation job and no fallback call to the Stripe API.
- **Evidence:**
  ```js
  69:  const { data: subscriptions } = await supabase
  70:    .from('user_subscriptions').select('*')
  72:    .eq('user_id', userId).in('status', ['active','trialing']).single();
  81:  const isPro = !!subscriptions;               // no period_end check
  89:  currentPeriodEnd: subscriptions.current_period_end,   // returned, never enforced
  ```
- **Location:** `api/stripe/verify-subscription.js:69-81`
- **Impact:** Stripe retries a failing webhook for ~3 days and then stops. Any window where the endpoint is broken (bad `STRIPE_WEBHOOK_SECRET` after a key rotation, a deploy that 500s, a Supabase pause — which the repo documents as having already happened twice) permanently strands rows at `status:'active'`. Those users keep Pro forever, for free, and nothing will ever notice. This is the most likely *silent, ongoing* revenue leak on the server side.
- **Fix:** Add `.gt('current_period_end', new Date(Date.now() - GRACE_MS).toISOString())` to the query so a stale row expires on its own. Belt-and-braces: when a row is within, say, 24h of `current_period_end`, re-fetch the subscription from Stripe and refresh the row.

### [P1] No cancellation path, no billing portal, and no Terms of Service / Privacy Policy / refund policy anywhere in the product
- **Area:** whole app
- **Repro:**
  1. `grep -n -i "billing.portal\|customer.portal\|manage subscription\|billingPortal" index.html api/**/*.js` → **no matches**.
  2. `grep -n -i ">Terms<\|>Privacy<\|Privacy Policy\|/terms\|/privacy\|refund" index.html` → **no matches**.
  3. Browse `/pricing` — the only support affordance is `mailto:mhowe.gis@gmail.com`.
- **Evidence:** `/pricing` rendered text (screenshot `money-pricing.png`) ends with: *"Questions about billing or the product? Email Maxwell."* The pricing card says "Cancel anytime" (`index.html:4496`) while offering no mechanism to do so.
- **Location:** `index.html:4486-4528` (pricing page), `api/stripe/` (no portal endpoint)
- **Impact:** "Cancel anytime" with no cancel button is a promise the product cannot keep — subscribers must email a person, which is exactly the pattern card networks and the FTC's negative-option rules target, and which drives chargebacks instead of cancellations. No ToS means no limitation of liability and no stated refund terms when someone disputes a charge. No Privacy Policy while the app collects emails and writes `analytics_events` (including, see below, sign-up email addresses) is a straightforward GDPR/CCPA gap. Stripe's own agreement requires a published refund/cancellation policy.
- **Fix:** Add `POST /api/stripe/create-portal-session` (JWT-auth'd, `stripe.billingPortal.sessions.create({ customer, return_url })`) and a "Manage subscription" button wherever the Pro badge appears. Publish `/terms` and `/privacy` as real routes — the Marketing mode already exists, so this is markup plus two `Router.register` calls.

### [P1] `checkout.session.completed` without `client_reference_id` returns 200 and silently drops a paid subscription
- **Area:** `api/stripe/webhook.js:61-104`
- **Repro:** static analysis. If `session.client_reference_id` is falsy the handler `console.warn`s, `break`s, and falls through to `res.status(200)`.
- **Evidence:**
  ```js
  63:  const userId = session.client_reference_id;
  65:  if (!userId) { console.warn('checkout.session.completed: no client_reference_id'); break; }
  185:  res.status(200).json({ received: true });
  ```
  The sibling case has the same shape: `customer.subscription.updated` does `.update(...).eq('stripe_subscription_id', id)` — if no row exists (because the `checkout.session.completed` above was dropped), Supabase reports success on 0 matched rows and the handler returns 200.
- **Location:** `api/stripe/webhook.js:65-68`, `115-124`
- **Impact:** A customer is charged and never provisioned, and the system reports success to Stripe so nothing retries and nothing alerts. Reachable today via any Stripe Payment Link, Dashboard-created subscription, or manual invoice — none of which set `client_reference_id`. The customer's only recourse is emailing the owner, and the owner has no dashboard showing "paid but unprovisioned".
- **Fix:** Fall back to resolving the user by `customer_email` / Stripe customer, and if that fails return a 5xx (so Stripe retries) *and* emit a loud alert. For `customer.subscription.updated`, upsert rather than update, and check the affected row count.

---

## P2

### [P2] Webhook raw body is assembled by string concatenation — a multi-byte character split across chunks breaks signature verification
- **Area:** `api/stripe/webhook.js:18-29`
- **Repro:** static analysis. `getRawBody` does `data += chunk` on a stream of `Buffer`s, coercing each chunk to a UTF-8 string independently.
- **Evidence:**
  ```js
  20:  let data = '';
  21:  req.on('data', (chunk) => { data += chunk; });      // Buffer -> string per chunk
  49:  event = stripe.webhooks.constructEvent(rawBody, signature, ...);
  ```
- **Location:** `api/stripe/webhook.js:18-29`
- **Impact:** Node splits streams on arbitrary byte boundaries. If a boundary lands inside a multi-byte UTF-8 sequence (a customer name with an accent, a non-Latin product name, an emoji in metadata), each half decodes to U+FFFD, the reconstructed body no longer matches the signed bytes, `constructEvent` throws, and the handler returns 400. Stripe retries the *same* payload, which fails identically, until Stripe gives up — a permanently lost paid conversion, invisible except in the Stripe dashboard. Low probability per event, but the failure is total and silent when it happens.
- **Fix:** `const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks)));` and pass the Buffer straight to `constructEvent`.

### [P2] Webhook has no idempotency key and no ordering guard — a replayed or out-of-order event can resurrect a canceled subscription
- **Area:** `api/stripe/webhook.js:60-183`
- **Repro:** static analysis. `event.id` is never recorded or checked; no `event.created` / subscription version comparison guards the writes.
- **Evidence:** every branch performs an unconditional `upsert`/`update` keyed only on `user_id` or `stripe_subscription_id`. Nothing prevents a `customer.subscription.updated` carrying `status:'active'` from landing *after* the `customer.subscription.deleted` that set `status:'canceled'`.
- **Location:** `api/stripe/webhook.js:106-152`
- **Impact:** Stripe explicitly does not guarantee delivery order, and retries mean the same event can arrive more than once. A cancel-then-stale-update sequence leaves a canceled customer permanently entitled. The individual writes are idempotent, so replay alone is mostly harmless — ordering is the real exposure.
- **Fix:** Persist processed `event.id`s in a `stripe_events` table with a unique constraint and short-circuit duplicates. Guard status writes with `.lte('updated_at', new Date(event.created * 1000))` or store the subscription's `livemode`/version and refuse to apply older events.

### [P2] `create-checkout` never reuses the Stripe customer and never checks for an existing subscription — the same user can be billed twice
- **Area:** `api/stripe/create-checkout.js:134-150`
- **Repro:** static analysis. The session is created with `customer_email: userEmail` and no `customer` lookup, and there is no query against `user_subscriptions` before creating it.
- **Evidence:**
  ```js
  134:  const session = await stripe.checkout.sessions.create({
  135:    mode: 'subscription',
  136:    customer_email: userEmail,      // new Stripe Customer every time
  ...
  145:    client_reference_id: userId,
  ```
  And `webhook.js:95` upserts `{ onConflict: 'user_id' }` — so a *second* subscription overwrites the first row and the original subscription becomes invisible to the app while continuing to bill.
- **Location:** `api/stripe/create-checkout.js:134-150`, `api/stripe/webhook.js:82-96`
- **Impact:** A user who upgrades Pro→Classroom (or just double-clicks, or checks out again after the `handleCheckoutReturn` poll times out with "Pro activation is taking longer than expected. Please refresh") ends up with two live subscriptions, two Stripe customers on one email, and only one visible in the app. They are charged $9 + $12/mo and the product shows a single tier. That is a refund-and-chargeback generator, and the orphaned subscription's future webhooks silently match zero rows.
- **Fix:** Look up or create one Stripe customer per `user_id` (store `stripe_customer_id`), pass `customer` instead of `customer_email`, and before creating a session check for an existing `active`/`trialing`/`past_due` row — if one exists, send the user to the billing portal to switch plans rather than to a new checkout.

### [P2] `track-export` quota increment is a read-then-write race
- **Area:** `api/stripe/track-export.js:69-112`
- **Repro:** static analysis (and currently unreachable — see the `_supabase` P0).
- **Evidence:**
  ```js
  69:  const { data: existing } = await supabase.from('export_counts')
  70:    .select('id, count').eq('user_id', user.id).eq('month', monthKey).single();
  76:  const currentCount = existing?.count || 0;
  ...
  96:    .update({ count: existing.count + 1, ... }).eq('id', existing.id);
  ```
- **Location:** `api/stripe/track-export.js:69-112`
- **Impact:** N concurrent `increment` requests all read the same `count` and all write `count + 1`, so N exports are recorded as one. Trivially scriptable, and the insert path can also race into a duplicate-row error if no unique constraint exists on `(user_id, month)`. The blast radius is small (the limit is 3) but the mechanism is the standard one.
- **Fix:** Do it in one statement — a Postgres function `increment_export(uid, month, limit)` that performs `insert … on conflict (user_id, month) do update set count = export_counts.count + 1 where export_counts.count < limit returning count`, called via `supabase.rpc`. Add the unique constraint.

### [P2] `/api/census` is an open, unauthenticated proxy — it hands the "Pro" Census datasets to anyone and burns the shared API key
- **Area:** `api/census.js`
- **Repro:** from the browser (against the local stub, but the handler has no auth code path at all):
  ```
  F /api/census unauthenticated: {"status":200,"body":"[[\"NAME\",\"VALUE\",\"state\"],[\"State 01\",...]"}
  ```
  Client-side, the Pro gate is only `if (dataset.pro && !isPro())` at `index.html:13552` — the network call behind it is unguarded.
- **Evidence:** `api/census.js` has no `Authorization` handling anywhere. The SSRF guard is good (`/^\d{4}$/` year in 2005–2030, `/^[A-Z0-9_,]+$/` vars ≤500 chars, `survey` allowlisted to `acs1|acs5`, fixed `&for=state:*` template), and `CENSUS_API_KEY` is never echoed — the error strings at lines 67/70/73 are static. **No key exfiltration and no SSRF.**
- **Location:** `api/census.js:24-81`; client gate at `index.html:13552`
- **Impact:** Two separate issues. (1) Revenue: "Census data maps + county view" is a headline Pro feature and its data source is a public, CORS-friendly endpoint on your own domain — `curl 'https://tappymaps.com/api/census?year=2023&vars=B19013_001E'` needs no account. (2) Availability/cost: no auth, no rate limit, and CDN caching keyed on the query string, so an attacker cycling variable codes bypasses the cache and can exhaust the Census key's quota, taking every data map down for real users.
- **Fix:** Require a valid Supabase JWT, check `isPro` server-side for datasets marked `pro`, and rate-limit per user. Keep the free sample dataset on an unauthenticated path if it must stay open.

### [P2] `/api/keepalive` is publicly callable with the service-role client, no cron secret, and leaks DB error text
- **Area:** `api/keepalive.js`
- **Repro:** static analysis — the handler has no method check, no auth check, and no `CRON_SECRET` verification.
- **Evidence:**
  ```js
  8:  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  13: export default async function handler(req, res) {
  15:   const { error } = await supabase.from('user_subscriptions').select('id', { count:'exact', head:true });
  20:   return res.status(500).json({ ok:false, error: error.message });   // raw DB error to caller
  ```
- **Location:** `api/keepalive.js:13-26`
- **Impact:** Any unauthenticated caller drives a service-role query against your production database, as fast as they can request it — unauthenticated amplification into the resource whose availability the endpoint exists to protect, on the free Supabase tier that this project has already had paused twice. The `error.message` passthrough discloses Postgres/PostgREST internals (table names, policy errors) to whoever triggers a failure.
- **Fix:** Verify Vercel's cron header (`req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET`) and 401 otherwise; reject non-GET; return `{ok:false}` without `error.message`.

### [P2] `/api/render` is an unauthenticated, cache-bustable rasterizer — an attacker can bill you for CPU
- **Area:** `api/render.js:162-191`
- **Repro:** static analysis. `m` is arbitrary attacker-supplied base64; each distinct `m` is a distinct cache key; the response is `immutable`, so the CDN never coalesces distinct values.
- **Evidence:**
  ```js
  176:  res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  183:  const width = Math.min(2400, Math.max(600, parseInt(req.query.w || '1200', 10) || 1200));
  184:  const png = new Resvg(svg, { fitTo: { mode:'width', value: width }, background:'white' }).render().asPng();
  ```
  Positives worth recording: `w` **is** clamped to 600–2400; `legend` is sliced to 8; all text goes through `escapeXml`; `safeColor` (`api/render.js:57`) restricts fills to `#hex` or a bare colour word, so serving `format=svg` as `image/svg+xml` on the site origin is **not** a stored-XSS vector.
- **Location:** `api/render.js:162-191`
- **Impact:** Each request rasterizes a full 51-path US map at up to 2400px in a serverless function. Varying one character of the title changes `m`, misses the cache, and forces a fresh render. A single machine can sustain thousands of cold renders, and Vercel bills GB-hours. Cold starts also fetch the TopoJSON from jsdelivr (`api/render.js:38`), adding an external dependency to the money-adjacent OG path.
- **Fix:** Sign the `m` parameter (HMAC issued when a share/embed link is minted) and reject unsigned requests, or rate-limit per IP. Bundle the TopoJSON with the function instead of fetching it.

### [P2] `classroom_codes` RLS lets any anonymous visitor dump every active class code, teacher UUID, and class map
- **Area:** `supabase/migrations/20260801_classroom_codes.sql:59-64`
- **Repro:** static analysis. The publishable key is in the shipped client (`index.html:11279`); PostgREST honours the policy for any caller holding it, and the policy has no per-row predicate beyond `is_active`.
- **Evidence:**
  ```sql
  59: drop policy if exists "anyone can read active class codes" on public.classroom_codes;
  60: create policy "anyone can read active class codes"
  61:   on public.classroom_codes
  62:   for select to anon, authenticated
  63:   using (is_active = true);
  ```
  A bare `GET /rest/v1/classroom_codes?select=*` therefore returns **every** active row — `code`, `teacher_id`, `map_hash`, `title`.
- **Location:** `supabase/migrations/20260801_classroom_codes.sql:59-64`
- **Impact:** Codes themselves are hard to *guess* (6 chars from a 32-symbol alphabet ≈ 1.07 × 10⁹), but they never need guessing — the whole table is readable in one request. That exposes every teacher's `auth.users` UUID and every class assignment map, and lets anyone join any class. For a product being sold to K-12 teachers, an enumerable roster of classrooms is a meaningful privacy problem.
- **Fix:** Replace the blanket SELECT with a `security definer` RPC that takes a code and returns only that row (`create function join_class(p_code text) returns table(...)`), and drop the anon SELECT policy. Add rate limiting on the RPC to stop brute force.

### [P2] Classroom entitlement is not enforced in the database — any signed-in free user can mint class codes
- **Area:** `supabase/migrations/20260801_classroom_codes.sql:36-41`; `index.html:6813`
- **Repro:** static analysis. `classroomCreateOrRefreshCode()` checks `isClassroom()` in the client (line 6814) and then writes directly to PostgREST with the user's own JWT. The insert policy checks only ownership.
- **Evidence:**
  ```sql
  36: create policy "teachers insert own codes" on public.classroom_codes
  39:   for insert to authenticated with check (auth.uid() = teacher_id);   -- no subscription check
  ```
  ```js
  6814:  if (!isClassroom()) { ...openUpgradePanel('Class codes are a Classroom feature ($12/mo).'); return null; }
  6850:  const { error } = await supabaseClient.from('classroom_codes').upsert({ ... });
  ```
- **Location:** `supabase/migrations/20260801_classroom_codes.sql:36-41`, `index.html:6813-6871`
- **Impact:** The $12/mo tier's flagship feature is enforced by an `if` statement in the browser and by nothing else. Any free account can `POST /rest/v1/classroom_codes` directly. The worksheet pack (`exportWorksheetPack`, `index.html:6929`) is pure client-side rendering, so the whole Classroom tier is unprotected. (Credit where due: the update policy's `using (auth.uid() = teacher_id)` **does** correctly stop one teacher from hijacking another's code via the `onConflict:'code'` upsert.)
- **Fix:** Add a `with check` that joins `user_subscriptions` (`exists (select 1 from user_subscriptions s where s.user_id = auth.uid() and s.price_id = <classroom price> and s.status in ('active','trialing'))`), or route code creation through an authenticated API route that verifies the tier server-side.

### [P2] `user_maps` RLS lets any authenticated user write cloud maps — "Cloud My Maps sync" is Pro in the UI only
- **Area:** `supabase/migrations/20260801_user_maps.sql:40-53`; `index.html:6105-6108`
- **Repro:** static analysis. `galleryCloudEnabled()` requires `isPro()`; the RLS policies require only `auth.uid() = user_id`.
- **Evidence:**
  ```js
  6105: function galleryCloudEnabled() {
  6108:   return !!(… && typeof isPro === 'function' && isPro()); }
  ```
  ```sql
  40: create policy "users insert own maps" on public.user_maps
  43:   for insert to authenticated with check (auth.uid() = user_id);
  ```
- **Location:** `supabase/migrations/20260801_user_maps.sql:40-53`, `index.html:6105-6108`, `6417-6425`
- **Impact:** A free signed-in user can `POST /rest/v1/user_maps` and get the advertised Pro benefit (cross-device sync) for nothing, and can store unbounded rows in your database. Listed as a Pro feature on `/pricing` ("Cloud My Maps sync") and in the Create Upgrade panel.
- **Fix:** Same pattern as Classroom — subscription-aware `with check`, or write through an authenticated API route. Add a per-user row cap.

### [P2] `gallery_publish_counts` is client-written with an arbitrary value — the publish rate limit resets itself
- **Area:** `index.html:6244-6266`; `supabase/migrations/20260801_gallery_public.sql:67-71`
- **Repro:** static analysis. The client computes `next` and upserts it; RLS permits the user to update their own row to any value.
- **Evidence:**
  ```js
  6252:  const next = current + 1;
  6253:  const { error } = await supabaseClient.from('gallery_publish_counts')
  6255:    .upsert({ user_id: …, day: day, count: next, … }, { onConflict: 'user_id,day' });
  ```
  ```sql
  67: create policy "users update own publish counts" on public.gallery_publish_counts
  69:   for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  ```
  The migration's own comment concedes it: *"Daily publish rate limit (free 5 / Pro 20 — enforced in client; table is source of truth)."*
- **Location:** `index.html:6244-6266`, `supabase/migrations/20260801_gallery_public.sql:46-71`
- **Impact:** One `PATCH … {count: 0}` restores the daily allowance, so the public Recent gallery has no effective spam control — and the only moderation is a report queue reviewed by hand in the Supabase dashboard. A single actor can flood the front page. (The `user_maps_lock_featured` trigger correctly prevents self-featuring, which is the right instinct applied to the wrong table.)
- **Fix:** Move the increment into a `security definer` function that reads and writes the count atomically and refuses over-limit publishes; revoke the client's UPDATE on the counter table.

### [P2] `analytics_events` accepts unlimited anonymous inserts and receives user email addresses
- **Area:** `supabase/migrations/20260716_analytics_events.sql:22-27`; `index.html:11601-11642`
- **Repro:** static analysis. The publishable key is in the client; the policy's `with check (true)` imposes no constraint.
- **Evidence:**
  ```sql
  23: create policy "anon can insert analytics" on public.analytics_events
  25:   for insert to anon, authenticated with check (true);
  ```
  ```js
  11435:  trackEvent('sign_up', { email: data.user.email });      // email lands in analytics_events.meta
  11629:  fetch(SUPABASE_URL + '/rest/v1/analytics_events', { … 'apikey': SUPABASE_ANON_KEY … })
  ```
- **Location:** `supabase/migrations/20260716_analytics_events.sql:22-27`, `index.html:11435`, `11629-11638`
- **Impact:** Anyone can script unbounded inserts of arbitrary JSON into your production database — storage cost, and a plausible route to pushing the free-tier project over its limit, which (per your own keepalive comment) takes down sign-in, checkout and quota together. Separately, writing sign-up email addresses into an analytics table is PII sprawl with no Privacy Policy covering it.
- **Fix:** Insert analytics through a serverless route that rate-limits by IP and strips PII, or add a `with check` constraining `event` to a known enum and `meta` to a size limit. Stop passing `email` to `trackEvent`; the `user_id` is already attached.

### [P2] "Exports without the tappymaps.com stamp" is sold as a Pro benefit that no free user is ever actually denied
- **Area:** `index.html:4423`, `12038`, `12146`, `12246`
- **Repro:** export as an anonymous user (reproduction #1 above) and inspect the result — `cleanExport` is true, so no stamp is drawn.
- **Evidence:**
  ```html
  4423: <p class="create-panel-lede">Unlock spreadsheet → map, cloud My Maps sync, unlimited exports,
        Census data maps, county view, and exports without the tappymaps.com stamp.</p>
  ```
  ```js
  12038: const cleanExport = perm.anonymous || isPro();
  ```
  The only tier for which `cleanExport` is false is the signed-in free user — who cannot export at all (P0 #1). **Zero exports in production carry the stamp.**
- **Location:** `index.html:4423` (copy), `12038`/`12146`/`12246` (logic)
- **Impact:** A paid benefit advertised in the upgrade panel that the buyer already had. Minor in dollars, corrosive in trust, and the sort of thing that shows up in a refund request.
- **Fix:** Decide which it is. Either stamp all non-Pro exports (fix the `perm.anonymous` term) or remove the claim from the upgrade copy.

### [P2] The free tier's export limits are never disclosed on the pricing page
- **Area:** `index.html:4486-4528`
- **Repro:** open `/pricing` and read it (screenshot `money-pricing.png`).
- **Evidence:** The page says *"The editor and geography games are free"* and lists "Unlimited high-resolution exports" under Pro. The actual free allowance — 1 export anonymous, 3/month signed in — appears nowhere. It surfaces only as an in-editor counter after the user has already invested in a map.
- **Location:** `index.html:4488-4489`, `4497-4502`
- **Impact:** Users discover the limit at the moment of maximum investment, which reads as a bait-and-switch even though it is a normal freemium design. It also makes the current breakage invisible: nobody can tell that "3/month" is really "0".
- **Fix:** Add a Free column to the pricing grid stating the export allowance explicitly.

---

## P3

### [P3] Export counter tells new signed-in users they have 2 exports when the limit is 3
- **Area:** `index.html:11747`
- **Repro:** static analysis — `appState._cachedRemaining` is unset until an export completes, so the `??` default is what a fresh signed-in user sees.
- **Evidence:** `11747: const remaining = appState._cachedRemaining ?? 2;` versus `api/stripe/track-export.js:8  const FREE_MONTHLY_LIMIT = 3;`
- **Location:** `index.html:11747`
- **Impact:** Understates the free allowance by a third on first render. Cosmetic today (the path is broken anyway), wrong the moment P0 #1 is fixed.
- **Fix:** Default to `FREE_MONTHLY_LIMIT` fetched from the `check` response, not a literal.

### [P3] `ADMIN_EMAILS` ships two real personal addresses in the client bundle
- **Area:** `index.html:11375`
- **Repro:** view source.
- **Evidence:** `const ADMIN_EMAILS = ['max@mapparatus.org', 'mhowe.gis@gmail.com'];` — and `checkSubscriptionStatus` grants Pro **and Classroom** to those addresses before it ever calls the server (`index.html:11387-11396`).
- **Location:** `index.html:11375`, `11387-11396`
- **Impact:** Publishes the owner's two email addresses (one a personal Gmail) and advertises that compromising either yields the full product. It is not a security boundary — but it is a published, named phishing target, and the client-side grant means no server-side audit trail exists for admin access.
- **Fix:** Move the admin grant server-side into `verify-subscription` (read the allowlist from an env var), so the client learns entitlement only from the API and the addresses stay out of the bundle.

### [P3] Sign-in with Supabase unreachable hangs ~12s and surfaces a raw "Failed to fetch"
- **Area:** `index.html:11439-11459`
- **Repro:** the local environment has no route to Supabase. Open `/design/make`, `showUpgradeModal('auth')`, fill credentials, Sign In.
- **Evidence:** `B sign-in after 12608ms {"done":true,"err":null,"msg":"Failed to fetch","user":null}` · `netfails: https://tylnxovujbhdmagugjew.supabase.co/auth/v1/token?grant_type=password :: net::ERR_CONNECTION_RESET`. Screenshot `money-signin-supabase-down.png`.
- **Location:** `index.html:11446-11447`
- **Impact:** Degrades safely (no hang, no thrown error, button stays usable) but the user waits 12s staring at "Signing in..." and is then shown a browser-internals string. During a real Supabase outage — which this project has had twice — every visitor sees that.
- **Fix:** Wrap the call in an 8s timeout and map transport failures to "Can't reach the server right now — try again in a minute."

### [P3] `/class/<CODE>` shows "Opening your class map…" indefinitely when Supabase is unreachable
- **Area:** `index.html:7028-7060`
- **Repro:** `Router.navigate('/class/ABC123')` with Supabase unreachable.
- **Evidence:** after 4s the ComingSoon host still reads `Class ABC123 / Opening your class map…` (screenshot `money-class-join-down.png`). `classroomLoadAssignment` awaits a PostgREST call with no timeout.
- **Location:** `index.html:6902-6915`, `7046-7051`
- **Impact:** The first experience a classroom of students has with the paid product is a spinner with no timeout and no error. Worst-affected audience: 30 kids on school wifi.
- **Fix:** Race the query against a timeout and show the existing "Class code not found — ask your teacher" path on failure.

### [P3] Not-found stub renders a broken sentence
- **Area:** `index.html:5655-5659`
- **Repro:** `Router.navigate('/tap-in')` (correctly retired — confirmed it falls through to the not-found stub, and `#upgradeAccessCodeSection` no longer exists).
- **Evidence:** rendered text: `Page not found` / `is coming in the Tappymaps URL tree.` — the label is missing from the body sentence.
- **Location:** `index.html:5655-5659`, `Modes.ComingSoon.enter`
- **Impact:** Cosmetic, but it is what a mistyped `/pricing` shows a would-be buyer.
- **Fix:** Give `__notFound__` its own body copy instead of reusing the ComingSoon template.

### [P3] Serverless handlers return raw internal error messages to the caller
- **Area:** `api/stripe/create-checkout.js:155`, `api/stripe/verify-subscription.js:100`, `api/stripe/webhook.js:188`, `api/keepalive.js:20`, `api/render.js:189`
- **Repro:** static analysis.
- **Evidence:** e.g. `res.status(500).json({ error: error.message })` — Stripe SDK and PostgREST messages reach the browser verbatim, and `startStripeCheckout` renders them straight into a toast (`index.html:11499-11500`).
- **Location:** as listed
- **Impact:** Discloses table names, policy names, price IDs and Stripe API details to anyone who can trigger an error. Low on its own; useful to someone probing the gates.
- **Fix:** Log the detail server-side, return a generic message plus a correlation id.

### [P3] Documentation still describes the retired $5/$48 pricing and a watermark that no longer exists
- **Area:** `.claude/CLAUDE.md:22`, `HANDOVER.md:179`
- **Repro:** `grep -rn '\$5\b|\$48' .claude/CLAUDE.md HANDOVER.md`
- **Evidence:** CLAUDE.md: *"Payments: Stripe subscription ($5/mo, $48/yr)"*. HANDOVER.md: *"Free tier with watermark + 3 exports/month; Pro tier at $5/mo or $48/yr"*. **The user-facing UI is fully consistent at $9/$72/$12** — pricing page (`index.html:4495`, `4510`), upgrade modal (`5240`, `5243`, `5247`), upgrade banner (`5121`) and route meta (`5645-5647`) all agree; the only `$5` in the UI is the correct grandfathering note at `4496`. This is documentation drift only.
- **Location:** `.claude/CLAUDE.md:22`, `HANDOVER.md:179`
- **Impact:** No customer-facing risk. Real risk is to future work: the next session reads "free tier with watermark" and reasons from a model of the product that has not been true since Phase 0 removed the watermark.
- **Fix:** Update both files; note that the diagonal watermark is gone and that the only differentiator left is the (currently inert) `tappymaps.com` stamp.

### [P3] `track-export` month key is server-local, and `share.js` trusts `x-forwarded-host`
- **Area:** `api/stripe/track-export.js:66-67`, `api/share.js:44-46`
- **Repro:** static analysis. Local `share.js` exercise (dependency-free, run directly):
  ```
  3b x-forwarded-host og:image: https://evil.com/api/render?m=…&format=png
  ```
- **Evidence:** `monthKey = ${now.getFullYear()}-${MM}` from `new Date()` — UTC on Vercel, so a UTC-8 user's quota resets at 4pm local on the last day of the month.
  `share.js` positives worth recording: the `h` charset guard at line 34 **works** — an injected `</script><script>alert(1)</script>` is discarded, and a hostile `title` inside the decoded state comes out HTML-escaped (`&lt;/title&gt;&lt;img src=x…`). **No reflected XSS, no open redirect** (`location.replace` target is a fixed `/design/make#…` path).
- **Location:** `api/stripe/track-export.js:66-67`, `api/share.js:44-46`
- **Impact:** Both minor. The month boundary is a mild fairness quirk. The host-header trust only affects `og:image` in a response an attacker would have to get a crawler to fetch; on Vercel the header is platform-set.
- **Fix:** Derive the month in the user's timezone (or document UTC). Pin `share.js` to a known host constant rather than the request header.

---

## Threat model

**How much is realistically leakable, and by whom?**

**Everything, by anyone who wants it — but the practical loss today is bounded by the fact that almost nobody is paying yet.** Ranked by how likely each actor is to actually appear:

1. **Ordinary users, no skill required, happening right now.** Anonymous export is the only working path, it is unmetered in practice (private window / clear site data), and it produces a *clean* 3252×2286 PNG. There is no skill floor here at all — the natural user behaviour of "hmm, let me try that again" defeats the gate. Every export Tappymaps serves today is, in effect, a free Pro export. **Leak: 100% of export value.**
2. **Signed-in free users, unintentionally, in the opposite direction.** These users can't export at all and are told it's their connection. This isn't leakage, it's the conversion funnel destroying itself: the app's own CTA sends people from a working state to a broken one. Whatever the current free→paid conversion rate is, this is a plausible explanation for it.
3. **Anyone who opens devtools once.** `appState.proUnlocked = true` unlocks $9/mo of features; adding `classroomUnlocked` unlocks the $12 tier. A single screenshot of that one-liner on Reddit converts this from a theoretical bypass into a public one. **Leak: 100% of Pro + Classroom feature value.**
4. **Anyone with the publishable key (i.e. anyone).** Direct PostgREST writes give free cloud My Maps (`user_maps`), free class-code minting (`classroom_codes`), unlimited gallery publishing (`gallery_publish_counts`), and a full dump of every active class code and teacher UUID. No devtools needed beyond `curl`.
5. **Someone with a grudge and a shell.** `/api/render` (cache-bustable rasterization) and `/api/keepalive` (unauthenticated service-role queries) both convert anonymous HTTP requests into your Vercel and Supabase bills. `/api/census` converts them into exhaustion of a shared API key that takes every data map down.
6. **Silent server-side leakage, no attacker required.** A single dropped `customer.subscription.deleted` webhook grants that customer Pro forever, because `verify-subscription` never checks `current_period_end`. Given this project has already had its Supabase project paused twice, this has a real chance of having happened already.

**The asymmetry that matters most:** the things that leak revenue (everything above) are all recoverable — you can add server-side gates later and the lost dollars were mostly hypothetical. The things that *destroy* revenue are not: a customer whose card declines once loses access mid-paid-period; a customer whose `verify-subscription` call 500s sees a free account with no explanation; a customer who checks out twice is billed twice with no portal to fix it; and none of them can cancel without emailing a person. Every one of those produces a chargeback, and chargebacks cost more than the subscription. **Fix the paying-customer-denied bugs before the leak-prevention bugs.**

**Genuinely solid, and worth not breaking:** the Stripe price allowlist in `create-checkout.js` (a caller cannot pass an arbitrary price, quantity, trial, coupon or redirect — success/cancel URLs are computed from a validated origin and client-supplied values are ignored); the webhook's signature verification and its 500-on-DB-failure retry semantics; the SSRF guard and key handling in `census.js`; `safeColor`/`escapeXml` in `render.js`; and the base64 charset guard in `share.js`. That is a better-than-average serverless layer. The problem is not that it is weak — it is that the client never asks it anything.

---

## Ideas

A ground-up rebuild should keep the single-file spirit and change exactly one thing about the money path: **make the server the only thing that knows who is Pro.**

1. **Entitlement lives in a signed token, not a boolean.** On sign-in, `/api/session` returns a short-lived (15 min) JWT containing `tier` and `exp`, derived from `user_subscriptions` joined against `current_period_end`. The client caches it and refreshes it. `appState.proUnlocked` becomes a render hint that the server re-derives on every privileged call, so flipping it changes only what buttons look like.
2. **Gate the artifact, not the button.** Pro-quality exports render through an authenticated `/api/render` that checks the token and stamps anything below Pro. The client keeps a fast local preview path that is always watermarked. This is the single change that makes console bypasses worthless, because the valuable thing is produced on a machine the user does not control.
3. **RLS is the entitlement layer, not a convenience.** Every table the browser touches gets a policy that joins `user_subscriptions` — `user_maps` for Pro sync, `classroom_codes` for Classroom. Rate-limit counters move into `security definer` functions so the client can never write a count. Commit every table's DDL as a migration; a table without a migration is a table nobody can review.
4. **Ship the customer lifecycle on day one.** Billing portal endpoint, "Manage subscription" in the account menu, `/terms`, `/privacy`, a stated refund policy, and a `stripe_events` idempotency table. Treat `past_due` as entitled through `current_period_end`. These are not polish — they are the difference between revenue and chargebacks.
5. **Make failures loud in exactly one direction.** Entitlement checks fail *open* for users who were Pro a minute ago (cached last-good verification) and fail *closed* for everyone else, and any degraded state says so in the UI. A paying customer should never silently see the free product.
6. **Reconcile, don't just listen.** A daily cron that walks `user_subscriptions` and re-fetches anything past `current_period_end` from the Stripe API turns webhooks from a single point of failure into an optimization. Pair it with a "paid but unprovisioned" query so a dropped `client_reference_id` surfaces as an alert instead of a support email.
7. **Metering that survives a page reload.** Anonymous allowances should be server-issued and IP/fingerprint-scoped, and the quota increment should be one atomic Postgres statement. Accept that anonymous metering is porous — design the free artifact so bypassing it isn't worth the effort (watermark), rather than pretending the counter is authoritative.
8. **Rate-limit every unauthenticated endpoint that costs money to serve.** `/api/render`, `/api/census`, `/api/keepalive`. Sign the `m` parameter so only links your app minted can be rendered, and require the cron secret on keepalive.
