# Tappymaps audit — Gallery + Embed/Share + Mobile/Responsive
Run: 2026-08-21. Target: /home/user/tappymaps/index.html (15,819 lines), api/render.js, api/share.js.
Harness: local dev server http://127.0.0.1:8123 (SPA rewrites, vendored CDN, **stubbed /api/render + /api/share** — thumbnails render as flat blue SVG in-browser; that is the harness, not a product bug).

## Verdict
See the full **Verdict** section at the end of this report.

## Findings

## A. Gallery

### [PASS] My Maps round-trip is exact
- **Area:** `/design/make` → Save to My Maps → `/design/gallery/mine` → Open
- **Repro:** `work/gallery/g1-mymaps.mjs` — paint 8 states in 3 colours, set title `Audit Map Alpha`, subtitle `sub/line+with=chars`, 2 legend entries, Save to My Maps, navigate to My Maps, click Open.
- **Evidence:** card renders with correct title / subtitle / `Aug 21, 2026 · this device`; stored hash === `encodeStateToURL()` byte-for-byte; after Open, `JSON.stringify({stateColors,mapTitle,mapSubtitle,legendEntries})` is **identical** before vs after (`ROUNDTRIP EXACT: true`). On-map `#mapTitle`, `#createMapTitleInput` and `#mapSubtitle` all re-synced. Zero console errors. `shots/gal-mine-1card.png`, `shots/gal-open-restored.png`.
- **Dedupe:** saving the same map 3× leaves exactly 1 entry (`gallerySaveMine` filters by hash then unshifts). Confirmed.

### [P1] The Gallery's default tab — and every single link into the Gallery — points at `Recent`, which is dead in production
- **Area:** `/design/gallery`, Hub footer, Hub tile, editor "View Gallery" button
- **Repro:** load `/design/gallery` (no sub-route), or click any gallery link anywhere in the app.
- **Evidence:** `Modes.Gallery.enter` uses `const tab = (route && route.sub) || 'recent'`. Every `a[data-route]` href containing "gallery" in the app resolves to `["/design/gallery/recent" ×4, "/design/gallery/featured", "/design/gallery/mine"]` — the two default entry points (Hub footer `gallery`, editor `#viewGalleryBtn`) are both `/recent`. With `user_maps` absent the page renders **"Couldn't load Recent"** (`shots/gal-featured-tablemissing.png`). The one tab that actually works (My Maps) is never the landing tab.
- **Location:** index.html:6762 (`|| 'recent'`), index.html:4305, index.html:5110, index.html:4301
- **Impact:** 100% of Gallery visitors land on an error state. CLAUDE.md claims the default is `mine`; the code disagrees.
- **Fix:** default `sub` to `mine`, and point `#viewGalleryBtn` / the Hub footer at `/design/gallery/mine` until the migration is applied.

### [P2] User-facing error copy leaks internal infrastructure language
- **Area:** `/design/gallery/{recent,featured}`, Publish
- **Evidence (live, table-missing simulated via a PostgREST `42P01` stub — `work/gallery/g4-realerr.mjs`):**
  - Gallery: **"Public gallery needs the Supabase migration applied. Your My Maps still work."**
  - Publish: **"Publish failed — check connection or run the Gallery migration"**
- **Location:** index.html:6704, index.html:6376
- **Impact:** end users are told to "run a migration". It reads like a broken deploy (which it is) and it names our vendor.
- **Fix:** user-facing copy ("The community gallery isn't open yet — your My Maps still work"), keep the migration hint in `console.warn` only.

### [P1] `Recent` / `Featured` hang on "Loading …" forever if the Supabase request doesn't resolve — no timeout, no fallback
- **Area:** `/design/gallery/recent`, `/design/gallery/featured`
- **Repro:** open `/design/gallery/recent` with Supabase unreachable (blocked network, paused project — a documented Tappymaps failure mode; both projects were found paused on 2026-07-16).
- **Evidence:** `shots/gal-recent-nobackend.png` — after 6+ s the page is empty except `● Loading Recent…`. `galleryFetchPublicMaps` only handles a *returned* `error`; a never-settling `await` leaves the placeholder in place indefinitely.
- **Location:** index.html:6697-6706 (`galleryRenderPublic`), index.html:6267 (`galleryFetchPublicMaps`)
- **Impact:** the dead-tab error state at least offers a route out; the hang offers nothing.
- **Fix:** `Promise.race` the query against an ~8 s timeout and fall through to the existing empty state.

### [P1] `Save to My Maps` reports success even when the localStorage write throws — silent data loss
- **Area:** `/design/make` → Save to My Maps (and Publish, which saves locally first)
- **Repro:** `work/gallery/g2-cap-degrade.mjs` — monkey-patch `localStorage.setItem` for `tappymaps_my_maps` to throw `QuotaExceededError` (this is exactly what Safari Private Browsing and "block all cookies/site data" do to *every* write), then click Save to My Maps.
- **Evidence:** `{"threw":true,"before":60,"after":60}` — the entry count does not change, and the user still gets the green **"Saved on this device"** toast.
- **Location:** index.html:6099 and index.html:6103 — `try { localStorage.setItem(...) } catch (_) {}`; the caller at index.html:6412 never learns.
- **Impact:** the user believes their map is saved. It isn't, and there is no other copy — this is the only persistence path for a free/anonymous user.
- **Fix:** make `gallerySaveMine` return a boolean; show an honest error ("Couldn't save — your browser is blocking site storage") when it fails.

### [P2] `GALLERY_MAX` (60) is only enforced on write, and eviction is silent
- **Evidence:** seeding 70 entries directly renders **70 cards**; the next save through `gallerySaveMine` silently truncates to 60, dropping 10 maps in one go (`{"n":60,"first":"Newest Map","last":"Map 58"}`). No warning, no undo, no export.
- **Location:** index.html:6098 (`mine.slice(0, GALLERY_MAX)`)
- **Impact:** low-frequency but unrecoverable. A prolific user quietly loses their oldest maps.
- **Fix:** warn at the cap ("My Maps is full — the oldest map will be replaced"), or offer a JSON export of the list.

### [P2] `galleryMigrateLocalToCloud` burns its one-shot flag even when every upsert fails
- **Evidence (static + code path):** the flag `tappymaps_cloud_migrated_<uid>` is written unconditionally after the loop, regardless of `n`. With `user_maps` missing (today's production state) every upsert fails, `n === 0`, and the flag is still set.
- **Location:** index.html:6396-6398
- **Impact:** when the Gallery migration is finally applied, every existing Pro user's local My Maps will **never** be pushed to the cloud — the migration is permanently marked done. Silent and invisible.
- **Fix:** only set the flag when `n === local.length` (or store `{done:true, count}` and retry if 0).

### [PASS] No cloud failure destroys a local map
- Verified end-to-end with the table-missing stub while signed-in: `saveCurrentMapToGallery` and `publishCurrentMapToGallery` both call `gallerySaveMine(...)` *before* any network call; local count went 0 → 1 → 1 across a failed sync and a failed publish. `galleryRenderMine` falls back to `local.slice()` when `galleryFetchCloudMine()` returns `null`, and `galleryMergeMineLists` unions cloud over local (never subtracts). `shots/gal-mine-cloudfail.png` shows the local card intact with the honest "On this device only" banner. **The P0 the brief was worried about does not exist.**

### [P2] Publish quota is client-authoritative and non-atomic
- **Evidence (static):** `galleryIncrementPublishCount` does read-then-`upsert` with a client-computed `count`. Any signed-in user can `supabaseClient.from('gallery_publish_counts').upsert({count:0})` from the console, or race two tabs to publish past the 5/day free limit.
- **Location:** index.html:6244-6266
- **Impact:** the anti-spam floor for the public gallery is decorative. This matters *before* Recent goes live, not after.
- **Fix:** enforce in a Postgres trigger / RPC (`security definer`) that increments server-side, or an edge function.

### [P2] The first-run onboarding overlay survives client-side navigation and covers whatever route you land on
- **Area:** any route reached from `/design/make` on a first visit
- **Repro (realistic, mobile):** `work/mobile/m6-onboard.mjs` @375×667 — land on the Hub `/`, tap **Make a map**, then press the browser **Back** button.
- **Evidence (mobile):** back on `/` the overlay is still `onboarding-overlay active`, `display:flex`, `z-index:3000`, and `coversViewport: true`. Hit-testing the Hub's own **Make a map** CTA returns `onboarding-step-text` — `ctaReachable: false`. The Hub is completely dead. `shots/mob-375-onboarding-blocks-hub.png`.
- **Repro (desktop):** fresh profile → `/design/make` (welcome card shows) → navigate to `/design/gallery/mine` **without dismissing it**.
- **Evidence:** `shots/gal-onboarding-over-gallery.png` — `#onboardingOverlay.onboarding-overlay.active`, `z-index: 3000`, `1440×900`, `pointer-events: auto`, still painted over the Gallery. Hit-testing the "Recent" tab returns `onboarding-overlay active`, **not** the tab: `{"hit":"onboarding-overlay active","isTab":false}`. Every control on the underlying route is unclickable.
- **Location:** `showOnboarding()` is called from `Modes.Create.enter` (index.html:6027); no mode `exit()` clears `.active`.
- **Impact:** recoverable — the card carries its own **Let's Make a Map** / **I've been here before** buttons, so one tap clears it (`shots/mob-375-onboarding-blocks-hub.png`). But until then the Hub or Gallery is entirely unusable, and the card's copy ("Pick a color from the palette", "Save as Image") is nonsense on those pages. Not a dead end; a confusing one. Downgraded from P1 for that reason.
- **Fix:** hide `#onboardingOverlay` in `Router.dispatch` (or in `Modes.Create.exit`).

## B. Embed + Share + `/api/render`

### [PASS] `/embed#<hash>` is chrome-less, faithful, and correctly gated
- **Repro:** `work/gallery/e2-embed.mjs` / `e3-iframe.mjs` with a hash containing all three risky base64 chars (`+`, `/`, `=`).
- **Evidence (`shots/embed-default.png`):** title `Café Map`, subtitle, 5 coloured states, on-map `#logoWatermark`, source line, compass, scale bar, legend anchored bottom-right **inside the SVG content rect** (not the letterbox), footer "Made with tappymaps.com". `#mapContainer.parentElement === #embedMapHost` (the appendChild-move worked). `#statsBar` computed `display:none`; `#mapTitle` / `#mapSubtitle` both `contenteditable="false"` and not focusable. Legacy `.container` `display:none`. Zero console errors.
- **Footer gating:** default `flex`; `?chrome=0` → `none`; `?source=devvit` → `none`. Both confirmed live.
- **Iframe sizes** (`shots/embed-iframes.png`): 320×240, 640×480, 1200×630 and 300×150 all render with `overflowX = 0`, `overflowY = 0`, SVG not clipped, legend not clipped. Nothing overflows.

### [P3] Title chrome eats 28–45% of a small embed
- **Evidence:** at 320×240 the SVG starts at `y = 67` of a 240px frame (28%); at 300×150 it is 67 of 150 (**45%**), leaving the map 83px tall. The `@media (max-height:360px)` rule already claws back the footer but nothing shrinks the title band.
- **Location:** index.html:3698-3707 (embed media queries)
- **Fix:** add a `@media (max-height: 320px)` rule that drops `#mapSubtitle` and reduces `#mapTitle` to ~13px, or hide both under ~260px height (the on-map logo carries the brand).

### [P3] Attribution silently disappears on short embeds
- `@media (max-height: 360px) { .embed-footer { display: none } }` — a `height="300"` iframe (a very common paste size) ships with **no** "Made with tappymaps.com". The on-map logo remains, so this is deliberate, but it means the distribution surface loses its click-through link exactly where it is cheapest to place one.
- **Location:** index.html:3703

### [PASS] Editor embed `/design/make?embed=1` — the link-lock holds
- **Repro:** `work/gallery/e4-breakout.mjs`, `e5-breakout2.mjs`. Enumerated every visible `a[data-route]` across all five rail panels and clicked each.
- **Evidence:** exactly two escape-capable links are ever visible — `/` (wordmark) and `/pricing` (Upgrade panel). Clicking either leaves `body.dataset.mode === 'design/make'` and `location.pathname === '/design/make'`. Zero visible plain `<a href>` without `target="_blank"`. `#viewGalleryBtn` is inside a collapsed panel and is `width:0` (unreachable). No route escape found.

### [P2] The upgrade modal (auth + Stripe) is reachable *inside* a third-party embed and is a dead end
- **Area:** `/design/make?embed=1` (and any real cross-origin iframe)
- **Repro:** in the embed, open the Upgrade panel or the upgrade banner.
- **Evidence:** `#upgradeModal` renders at `display:flex`, `z-index:2000` **inside the frame**, with `authSignInBtn` / `authSignUpBtn` / "Maybe Later" (`shots/editor-embed-upgrade.png`).
- **Location:** index.html:11530-11531 — `window.location.href = result.url` (Stripe Checkout URL)
- **Impact:** **UNVERIFIED (static analysis)** for the Stripe leg — Stripe Checkout serves `frame-ancestors 'none'`, so a "Go Pro" click would navigate the *iframe* to a page the browser refuses to display, killing the embedded map on someone else's site. Supabase email/password sign-in inside a partitioned third-party frame is likewise unreliable in Chrome/Safari. The link-lock was built precisely to stop the frame from stranding a visitor; the paid + auth flows walk straight around it.
- **Fix:** when `body.is-embedded`, make Sign In / Go Pro call `window.open('https://tappymaps.com/pricing', '_blank', 'noopener')` instead of rendering the modal in-frame.

### [PASS] Hash integrity for `+`, `/`, `=`
- Test hash (392 chars, contains `+`, `/`, **and** trailing `=`; produced by a Latin-1 title/source, i.e. any accented character — `Café`, `Español`) survived: `/embed#<hash>` (title, subtitle, source, 5 colours, 2 legend rows all exact), `/design/gallery/mine` → Open (`/design/make#<hash>`), and `galleryThumb()` (`encodeURIComponent` applied). `copyShareLink()` converts to base64url via `stateToBase64Url()` (`+`→`-`, `/`→`_`, strip `=`) and `api/share.js` reverses it with `fromBase64Url` + `padBase64`. No breakage found on any of the four paths.
- **`/s/` round trip proved byte-exact:** client `stateToBase64Url()` strips all three risky chars (`base64url has + / = : false false false`), the result is safe as a raw URL path segment (`encodeURIComponent(b64u) === b64u`), and `padBase64(fromBase64Url(b64u))` reproduces the original **392-char hash exactly** (`SHARE ROUND TRIP EXACT: true`, 392 → 391 → 392). `galleryThumb`'s `decodeURIComponent(encodeURIComponent(hash)) === hash`.

### [PASS] `/api/render` output is complete and correctly escaped — no XSS
- **Repro:** `work/gallery/r1-render.mjs`, importing the real `api/render.js` in Node with `topojson-client` + `@resvg/resvg-js`.
- **Evidence:** real client hash → **51 `<path>` elements** (all 50 states + DC), title band, subtitle, legend box with `legendTitle` + both swatches, source line, pin+wordmark logo; 115,314-byte SVG → 139,488-byte PNG (`shots/render-real.png`, read and verified visually).
- **Injection battery** (title / subtitle / source / legendTitle / legend label / **colors** all set to `</text><script>alert()</script>`, `<img src=x onerror=…>`, `"><foreignObject>…`): output contains **no** `<script`, no `<img`, no `<foreignObject`, no `onerror`; `&lt;script` present instead; **zero stray `<`** after stripping the known tag set; the attacker colour never reaches a `fill=` attribute (`safeColor` regex holds). `api/render.js:43` `escapeXml`, `api/render.js:53` `safeColor`. **The P0 the brief was hunting for is not present.**

### [PASS] `/api/share` OG tags are genuinely server-rendered and injection-safe
- Handler emits `og:title` / `og:description` / `og:image` / `twitter:*` / `canonical` into the HTML string **before** any script runs — a non-JS crawler gets real tags. `h` is charset-allowlisted (`/^[A-Za-z0-9+/=_-]*$/`) and everything is `esc()`-ed; the inline `location.replace` uses `JSON.stringify(...).replace(/</g,'\\u003c')`. Battery of 6 hostile `h` values (raw `</head><script>`, `</title><script>` inside the decoded title, 20 KB payload): **all 200, zero XSS**, malformed `h` degrades to the generic "A US map".

### [P1] Client `btoa()` is Latin-1, server `Buffer.toString('utf8')` is not — every accented character corrupts the OG image, the gallery thumbnail, and `og:title`
- **Area:** `/api/render`, `/api/share`, `galleryThumb()`
- **Repro:** make a map titled `Café Map` (or `España`, `90° North`, `£5 a month` — all valid `btoa` input), copy the share link, load `/api/render?m=<hash>`.
- **Evidence:** `shots/render-real.png` renders the title as literal **`Caf<?> Map`** with a replacement glyph, and the source line as `Src o-<?>i3<?>B<?><?><?>`. Programmatic sweep:
  ```
  ascii only     OK   title="My Map"        | og:title -> "My Map"
  Cafe accent    OK   title="Caf� Map" | og:title -> "Caf� Map"
  Espanol        OK   title="Espa�a"   | og:title -> "Espa�a"
  degree sign    OK   title="90� North"
  pound          OK   title="�5 a month"
  ```
  Some byte sequences don't merely mangle — they break `JSON.parse` outright and the endpoint returns **400 Invalid map state**, i.e. **no OG image and a broken `<img>` in My Maps**.
- **Location:** index.html:11179 (`btoa(JSON.stringify(state))`) vs api/render.js:62 (`Buffer.from(b64,'base64').toString('utf8')`) and api/share.js:39 (same).
- **Impact:** the OG image is the single most-seen marketing artefact this product produces, and it renders a mojibake glyph for anything outside plain ASCII. Pairs with the already-filed P0 that `btoa` *throws* for anything outside Latin-1.
- **Fix:** replace `btoa(JSON.stringify(s))` with a UTF-8-safe encoder (`btoa(String.fromCharCode(...new TextEncoder().encode(json)))` or `encodeURIComponent`+`unescape`), and decode with `toString('utf8')` on both servers. Must be rolled out with a `latin1` fallback so existing links keep working.

### [P1] `/api/render` returns HTTP 500 on hand-crafted-but-decodable state
- **Repro:** 15-case hostile battery in `work/gallery/r1-render.mjs`.
- **Evidence:**
  ```
  empty            400 Missing map state (m)      ✓
  not-base64       400 Invalid map state          ✓
  b64 garbage      400 Invalid map state          ✓
  b64 null/number/string/array   200 (default map) ✓ acceptable
  deep nesting (20k)  200 (5 ms)                  ✓ no hang
  huge 2 MB payload   200 (8 ms)                  ✓ no hang
  10k colors / 5k legend  200 (7 ms / 5 ms)       ✓ no hang
  wrong types  {title:{a:1}}   *** 500 *** "(state.title || 'My US Map').slice is not a function"
  legend:[null]                *** 500 *** "Cannot read properties of null (reading 'color')"
  ```
- **Location:** api/render.js:85-88 (unguarded `.slice()` on `title`/`subtitle`/`source`/`legendTitle`), api/render.js:135 (`legend.forEach(e => ... e.color)`).
- **Impact:** not exploitable, but it's the wrong status code on a public GET, it burns Vercel function-error budget, and a crawler retrying a 500 sees a broken unfurl. No hangs or timeouts anywhere — the DoS surface is clean.
- **Fix:** `String(state.title ?? '')` for every text field and `legend.filter(e => e && typeof e === 'object')` before the loop; return 400 for anything else.

### [P2] The server render is not the map the user made — legend position, theme and fonts all diverge
- **Evidence (`shots/render-real.png` vs `shots/embed-default.png`, same hash):**
  - Legend is hard-coded **bottom-left** in `buildMapSVG` (`bx = 24`), while the editor/export put it wherever the user chose (bottom-right by default). Legend position isn't in the hash at all, so the server *can't* honour it.
  - The server always renders **light** (`BG = '#ffffff'`, uncoloured `#e2e8f0`); a dark-theme map gets a white thumbnail/OG image.
  - `font-family="Arial, Helvetica, sans-serif"` — neither font exists on the render host, so resvg falls back. In this sandbox the 46px title and 15px source rendered as a **serif italic** while the subtitle and legend rendered sans. **UNVERIFIED (static analysis) for Vercel specifically**, but Vercel's Node runtime ships very few system fonts, so some fallback is certain.
- **Location:** api/render.js:100-155
- **Impact:** the share preview and every gallery thumbnail misrepresent the map. Users who carefully positioned a legend get it moved.
- **Fix:** add `legendPos` + `theme` to the encoded state (they're already tracked client-side), and bundle a woff2 through `Resvg`'s `font.fontFiles` so typography is deterministic.

### [P3] `/api/share` with an invalid `h` still advertises an `og:image` that 400s
- `h` failing the charset test is blanked, so `og:image` becomes `/api/render?m=&format=png`, which returns `400 Missing map state`. Crawlers get a broken image rather than no image. Emit a static fallback OG asset instead.

## C. Mobile / responsive

Sweep: 7 routes × 8 viewports = **56 page loads** (`work/mobile/m1-sweep.mjs`, raw data `work/mobile/sweep.json`).
Caveat up front: this is Chromium with touch emulation. **Touch emulation is not a real finger** — every measurement below is geometry and DOM state, which is reliable; nothing about gesture feel, pinch inertia, iOS Safari's actual zoom-on-focus, or hit slop is verified. Anything that needs a hand is marked **NEEDS DEVICE TEST**.

### [PASS] Zero horizontal overflow, zero phantom scroll, zero console errors — at every viewport, on every route
- `document.documentElement.scrollWidth - innerWidth === 0` for all 56 combinations. `scrollHeight === innerHeight` on every route at every size (no route scrolls the page body at all).
- **0 console errors and 0 page errors** across all 56 loads.
- This is the strongest result in the whole audit. There is no offending element to name because there isn't one.

### [PASS] The dormant legacy mobile chrome is genuinely inert
- **Repro:** `work/mobile/m1-sweep.mjs` (computed style + rects) and `work/mobile/m4-shots.mjs` (45-stop keyboard Tab walk on `/design/make` @375×667).
- **Evidence:** at every route and viewport, `.container`, `.mobile-icon-bar`, `.mobile-panel`, `.mobile-panel-backdrop`, `.mobile-account-menu`, `#sidebarSheet` are all `display:none` and `0×0`. `scrollHeight === innerHeight` proves the hidden `.container` adds **no** scroll height. The 45-stop Tab walk produced **0 focus stops inside any legacy container** — first stop is the Create wordmark, then `#createMapTitleInput`, `#helpBtn`, `#themeToggle`, `#createShareBtn`, `#createAccountBtn`, the five rail buttons, the three zoom buttons. Nothing leaks, nothing is tab-focusable, nothing intercepts taps. **Item 10 closes clean.**

### [P1] Portrait phones waste half the screen on empty letterbox — the map renders smaller than a business card
- **Area:** `/design/make` at every portrait size
- **Repro:** `work/mobile/m5-layout.mjs`; visual `shots/mob-375-create.png`
- **Evidence (measured, CSS px):**

  | Viewport | SVG box | actual drawn map | dead letterbox | % of viewport |
  |---|---|---|---|---|
  | 320×568 | 320×381 | 305×**179** | 202 px | 36% |
  | 375×667 | 375×480 | 358×**209** | 271 px | 41% |
  | 393×852 (iPhone 15 Pro) | 393×665 | 375×**219** | **446 px** | **52%** |
  | 852×393 (landscape) | 802×262 | 356×208 | 54 px | 14% |

  The SVG `viewBox` is `1010×710` (~1.42:1 landscape) with `preserveAspectRatio="xMidYMid meet"`, so in a 0.6:1 portrait box it letterboxes hard. On a modern tall phone **more than half the screen is blank**, and the country is drawn 219 px tall.
- **Location:** index.html:1848-1911 (portrait map CSS), the `#mapContainer` flex box in the Create rail
- **Impact:** this is the root cause of every small-state complaint below. Landscape is 3.7× better use of the same pixels — which is presumably why the app used to force landscape.
- **Fix:** in portrait, either (a) crop the viewBox to CONUS and float AK/HI as insets so the map fills the width at a taller aspect, or (b) auto-apply an initial zoom-to-fit that scales the map to the box width instead of `meet`.

### [P1] Small states are untappable on a phone — and maximum zoom does not rescue them
- **Repro:** `work/mobile/m3-zoom.mjs` at 375×667, measuring `getBoundingClientRect()` on the real `<path>` nodes.
- **Evidence** (44×44 is the Apple/WCAG floor; **bold** = still below it):

  | State | Editor 1× | Editor **max (4×)** | Arcade 1× | Arcade **max (6×)** |
  |---|---|---|---|---|
  | District of Columbia | 1.3×1.6 | **5.4×6.4** | 1.3×1.6 | **8.0×9.7** |
  | Rhode Island | 4.9×7.0 | **19.8×28.2** | 4.9×7.0 | **29.6×42.3** |
  | Delaware | 6.6×11.1 | **26.6**×44.4 | 6.6×11.1 | **39.9**×66.6 |
  | New Jersey | 8.5×19.4 | **33.9**×77.8 | 8.5×19.4 | 50.8×116.7 |
  | New Hampshire | 10.4×22.0 | **41.8**×88.1 | 10.4×22.0 | 62.7×132.2 |
  | Vermont | 10.7×20.1 | **42.8**×80.6 | 10.7×20.1 | 64.2×120.9 |
  | Connecticut | 11.0×10.8 | **43.8×43.2** | 11.0×10.8 | 65.7×64.8 |
  | Massachusetts | 22.0×12.2 | 88.0×48.6 | 22.0×12.2 | 132.0×72.9 |
  | Maryland | 28.7×14.3 | 114.9×57.4 | 28.7×14.3 | 172.4×86.1 |

- **At 1× not one of the nine reaches 44 px in either dimension.** In the **editor** (max zoom 4×), **7 of 9 are still under 44 px wide** — Rhode Island is 20 px, DC is 5 px. Connecticut misses by 0.2 px in both directions, which is almost comic.
- **Documented helpers, checked:** GeoDraft has real rescue — `#draftListToggle` / `#draftTerrListToggle` "☰ Pick from list" chip panel plus an **NE** region-zoom button (index.html:4742-4750). **Arcade has none** (`arcade has name-list fallback? false`) — only pinch/buttons to 6×. **The editor has none either** — 50 non-interactive `.state-label` texts and 4× zoom, no list, no NE button, no hit-area padding. Arcade at least excludes DC from its prompt pool (`arcadeStateNames().includes('District of Columbia') === false`).
- **NEEDS DEVICE TEST:** the exact miss rate with a real thumb. Geometry says Rhode Island in the editor is a 20 px target at maximum zoom; a fingertip contact patch is ~45-57 px.
- **Fix:** port GeoDraft's "Pick from list" + NE zoom into the editor and Arcade; or give every state an invisible `stroke-width` hit-halo (a transparent stroke of 12-16 px on the small-state set expands the hit area without changing the render).

### [P2] The editor loads on a phone with no visible controls — five unlabelled icons and a map
- **Evidence:** `shots/mob-375-create.png` and `m5-layout.mjs` — at 320/375/393 portrait, `#createBody` carries neither `panel-open` nor `panel-collapsed`, the sheet is closed, and `#colorGrid` is **not visible** on load. The only affordances on screen are the 44 px top bar, a 52 px rail of **five icon-only buttons with no text** (they do carry `aria-label`: Map settings / Colors / Map Elements / Data Maps / Pro upgrade), the map, three zoom buttons and a 24 px stats bar.
- Meanwhile the onboarding card that fires on the same screen says **"1. Pick a color from the palette"** — and there is no palette on screen.
- **Impact:** the first-run instruction does not match the first-run UI on the device where most casual traffic lands.
- **Fix:** open the Colors panel by default on portrait first run (or add text labels under the rail glyphs), and reword step 1 to "Tap the palette icon".

### [P2] The zoom-reset button overlaps the stats bar in portrait
- **Evidence:** at 375×667, `#createZoomReset` occupies y 611-655; `#statsBar` starts at y 643 — a **12 px overlap**. Visible in `shots/mob-375-create.png`, where the ⤾ button sits on top of the "0 of 50 states colored" bar and the label's descenders are clipped by the viewport edge. Same geometry at 320×568 (505→544) and 393×852 (796→828).
- **Location:** the `.arcade-zoom-controls`-style stack in `#modeCreate` vs `#statsBar`
- **Fix:** add `bottom: calc(24px + env(safe-area-inset-bottom) + 8px)` to the zoom stack.

### [P2] Six `<select>` elements and one `<textarea>` are 11 px — iOS Safari will auto-zoom the page on focus
- **Repro:** `work/mobile/m2-focus.mjs`, visible-only (`offsetParent !== null`) inputs at 375×667, panel by panel.
- **Evidence:**
  ```
  Map Elements panel:  arrowPositionSelect 11px  arrowStyleSelect 11px
                       scalePositionSelect 11px  scaleUnitSelect 11px
                       scaleStyleSelect 11px     legendPositionSelect 11px
  Data panel:          csvPasteInput (textarea) 11px  347x118
  ```
  The good news: `#createMapTitleInput` is exactly **16px** and `#mapTitle` / `#mapSubtitle` contenteditables are 16/18px — the fields users touch most do **not** trigger the zoom.
- **NEEDS DEVICE TEST** (Chromium never auto-zooms; this is iOS Safari behaviour), but the ≥16px rule is well established.
- **Fix:** bump those seven controls to `font-size: 16px` and shrink with `transform: scale()` or padding if the layout needs it.

### [P2] Tap targets under 44×44 (enumerated, 375×667)
| Route | Element | Measured |
|---|---|---|
| `/design/make` | `a.create-wordmark` | **15×14** |
| `/design/make` | `button#helpBtn` | 18×27 |
| `/design/make` | `button#themeToggle` | 36×28 |
| `/design/make` | `button#createShareBtn` | 60×27 |
| `/design/make` | `input#createMapTitleInput` | 151×32 |
| `/design/make` | `button#onboardingSkip` | 104×**12** |
| `/` (Hub) | footer `gallery / about / pricing / go pro` | 33-40×**15** |
| `/` (Hub) | `Find the State / Stat Duel / GeoDraft / Gallery` | 74-116×31 |
| `/about`, `/pricing` | nav `About / Pricing / Make a map` | 37-77×16 |
| `/games/arcade` | `a.arcade-tile-mode-btn` Classic/Shuffle | 141×35 |
| `/games/arcade` | `a.arcade-wordmark` | 140×28 |
| `/games/draft/category` | `button#draftListToggle` | 127×40 |
| `/design/gallery/mine` | `a.arcade-wordmark` (only offender) | 140×28 |
- The **rail buttons and zoom buttons are correctly 44×44 at phone widths** — they drop to **40×40 at 768×1024 and 1024×768** (the tablet/desktop rule), which is the wrong direction but a minor one.
- The worst offenders are the 12-16 px-tall text links: `#onboardingSkip` (12 px), the Hub footer row (15 px) and the marketing nav (16 px). `a.create-wordmark` at **15×14** is the single smallest interactive element in the app.
- **Fix:** `min-height:44px` + vertical padding on `.hub-footer a`, `.marketing-nav a`, `.onboarding-skip`, `.create-wordmark`, `.arcade-wordmark`.

### [PASS] Safe-area handling is present
- `<meta name="viewport" … viewport-fit=cover>` (index.html:5) plus **24 uses of `env(safe-area-inset-*)`** across the stylesheet, including `.arcade-toast { bottom: max(18px, env(safe-area-inset-bottom)) }`. **NEEDS DEVICE TEST** for the notch/home-indicator overlap in practice, but the mechanism is wired.

### [PASS / correction] There is no forced-landscape rotate overlay any more
- The brief's premise is out of date. index.html:2825 reads *"Forced-landscape rotate overlay removed — the editor works in portrait."* Create has **no** rotate gate, and GeoDraft has none either.
- What survives is a single **non-blocking hint pill** — `.arcade-rotate-hint`, "Best played in landscape — rotate your phone." — `position:absolute; top:8px; z-index:3`, shown only by `@media (max-width:720px) and (orientation:portrait)` and only inside `#modeArcade` (index.html:3279, markup index.html:4589). It is `aria-hidden="true"`, has no dismiss control, and never covers the map.
- *(Note for anyone reading the raw sweep JSON: `sweep.json` reports `.arcade-rotate-hint` as `display:block` on `/design/make` too. That is a measurement artefact — `getComputedStyle` returns the element's own `display` even inside a `display:none` ancestor, and the pill lives inside the hidden `#modeArcade`. `document.getElementById` / `offsetParent` checks confirm it is not rendered outside Arcade.)*
- **Product opinion:** removing the forced overlay was right, and the remaining pill should go too. A modal "rotate your phone" gate on a casual, link-shared, one-tap product is a hard bounce — the visitor arrived from a share link, not from an app store, and has no investment yet. But the pill is currently *honest*: portrait genuinely is bad (52% letterbox, 20 px Rhode Island). **Fix the portrait layout, then delete the pill.** Keeping a nag that says "this is worse here" while shipping a portrait experience that *is* worse is the worst of both.

## Viewport matrix

Each cell: horizontal overflow (px) · count of visible interactive elements under 44x44 · console+page errors. All 56 loads: **overflow 0, errors 0**.

| Viewport | `/` | `/design/make` | `/design/gallery/mine` | `/games/arcade` | `/games/draft/category` | `/about` | `/pricing` |
|---|---|---|---|---|---|---|---|
| **320x568** | ovX 0 · tap<44: 8 · err 0 | ovX 0 · tap<44: 9 · err 0 | ovX 0 · tap<44: 1 · err 0 | ovX 0 · tap<44: 3 · err 0 | ovX 0 · tap<44: 1 · err 0 | ovX 0 · tap<44: 4 · err 0 | ovX 0 · tap<44: 4 · err 0 |
| **375x667** | ovX 0 · tap<44: 8 · err 0 | ovX 0 · tap<44: 9 · err 0 | ovX 0 · tap<44: 1 · err 0 | ovX 0 · tap<44: 3 · err 0 | ovX 0 · tap<44: 1 · err 0 | ovX 0 · tap<44: 4 · err 0 | ovX 0 · tap<44: 4 · err 0 |
| **393x852** | ovX 0 · tap<44: 8 · err 0 | ovX 0 · tap<44: 9 · err 0 | ovX 0 · tap<44: 1 · err 0 | ovX 0 · tap<44: 3 · err 0 | ovX 0 · tap<44: 1 · err 0 | ovX 0 · tap<44: 5 · err 0 | ovX 0 · tap<44: 4 · err 0 |
| **852x393** | ovX 0 · tap<44: 8 · err 0 | ovX 0 · tap<44: 11 · err 0 | ovX 0 · tap<44: 1 · err 0 | ovX 0 · tap<44: 3 · err 0 | ovX 0 · tap<44: 1 · err 0 | ovX 0 · tap<44: 4 · err 0 | ovX 0 · tap<44: 4 · err 0 |
| **412x915** | ovX 0 · tap<44: 8 · err 0 | ovX 0 · tap<44: 9 · err 0 | ovX 0 · tap<44: 1 · err 0 | ovX 0 · tap<44: 3 · err 0 | ovX 0 · tap<44: 1 · err 0 | ovX 0 · tap<44: 5 · err 0 | ovX 0 · tap<44: 4 · err 0 |
| **768x1024** | ovX 0 · tap<44: 8 · err 0 | ovX 0 · tap<44: 23 · err 0 | ovX 0 · tap<44: 13 · err 0 | ovX 0 · tap<44: 6 · err 0 | ovX 0 · tap<44: 5 · err 0 | ovX 0 · tap<44: 5 · err 0 | ovX 0 · tap<44: 7 · err 0 |
| **1024x768** | ovX 0 · tap<44: 8 · err 0 | ovX 0 · tap<44: 23 · err 0 | ovX 0 · tap<44: 11 · err 0 | ovX 0 · tap<44: 6 · err 0 | ovX 0 · tap<44: 5 · err 0 | ovX 0 · tap<44: 5 · err 0 | ovX 0 · tap<44: 4 · err 0 |
| **1440x900** | ovX 0 · tap<44: 8 · err 0 | ovX 0 · tap<44: 23 · err 0 | ovX 0 · tap<44: 17 · err 0 | ovX 0 · tap<44: 6 · err 0 | ovX 0 · tap<44: 5 · err 0 | ovX 0 · tap<44: 5 · err 0 | ovX 0 · tap<44: 6 · err 0 |

## Ideas

**Does mobile deserve a different IA, or is one-rail-fits-all fine?**

The rail is fine. The *map* is not. One-rail-fits-all was the right call and the measurements back it: zero overflow at every width from 320 to 1440, zero console errors, 44×44 rail and zoom buttons on phones, the legacy chrome provably inert, and the Gallery / Arcade / GeoDraft / marketing pages all reflow cleanly. Nobody should spend a sprint building a second navigation.

What actually needs a portrait-specific answer is the **canvas**, not the chrome. A 1010×710 landscape viewBox dropped into a 393×665 portrait box wastes 52% of the screen and shrinks Rhode Island to 5 px. Three things would fix the phone experience without any IA change:

1. **A portrait map projection/framing.** Crop the viewBox to CONUS and float Alaska and Hawaii as corner insets so the map fills the width. The country goes from 219 px tall to ~500 px, every state roughly doubles, and the letterbox disappears. This is one change that fixes the letterbox *and* the small-state problem at once.
2. **Port GeoDraft's small-state helpers everywhere.** GeoDraft already solved this — "☰ Pick from list" plus an NE region-zoom button. The editor and Arcade both need it. Cheap: the code exists.
3. **Open the Colors panel on portrait first run.** The onboarding says "pick a color from the palette" on a screen with no palette. One line.

**Gallery.** The backend absence degrades *honestly* on the tab that matters (My Maps keeps working, nothing is destroyed) but the product ships every gallery link pointed at the one tab that is broken. Repointing the default to `mine` is a one-word change that converts "the Gallery is broken" into "the Gallery is My Maps for now". Do that before anything else in this report.

**Distribution.** The embed is the best-built surface in the app — chrome-less, pixel-faithful, correctly gated, no overflow at any iframe size, link-locked. `/api/share` is genuinely server-rendered and injection-safe. The one thing undermining all of it is that the server renderer disagrees with the client about text encoding, so the picture the world sees says `Caf<?> Map`. Fix the encoder before promoting the share link anywhere.

**One more, unprompted:** the whole My Maps feature rests on a single `localStorage` key with a silent `catch (_) {}` around the write and a 60-item guillotine. That is fine for a nice-to-have and not fine for the thing the Save button promises. A "Download my maps (.json)" button in the Gallery would cost an hour and make the failure modes survivable.

## Verdict

**Gallery is shipped-but-unplugged, Embed and Share are genuinely good, and the app is usable on a phone — just not *good* on a phone.**

The backend-absent state degrades honestly: nothing destroys a local map, cloud failures fall back to local, and the sync banners tell the truth. But the default Gallery tab, and every link into the Gallery, points at Recent — the one tab that cannot work — so 100% of visitors meet an error that says "run the Supabase migration". Two P1s hide behind that: a save that reports success when `localStorage` throws, and Recent/Featured hanging forever with no timeout when Supabase is merely slow rather than broken. No P0 was found — notably, no cloud failure destroys a local map, and neither server endpoint has an injection hole.

Embed and `/api/render` came through the hostile battery clean — no XSS in the SVG renderer, no XSS in the share HTML, no hangs on 2 MB / 20k-deep / 10k-key payloads, and the editor-embed link-lock resisted every route trigger I could click. The two real defects there are a Latin-1/UTF-8 mismatch that mojibakes every non-ASCII title in the OG image and thumbnail, and two hostile shapes that return 500 instead of 400.

Mobile is structurally sound and visually cramped. 56 viewport/route combinations produced zero horizontal overflow and zero console errors, the dormant legacy chrome is provably dead, and safe-area handling is wired. The problem is geometry, not architecture: on an iPhone 15 Pro the map draws 219 px tall inside 665 px of box, and at maximum zoom in the editor seven of the nine small states are still under 44 px wide.

**Counts:** 0 P0 · 7 P1 · 11 P2 · 3 P3 · 11 PASS (32 findings).
