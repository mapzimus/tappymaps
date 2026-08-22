# Tappymaps — Accessibility, SEO & Performance Audit

**Date:** 2026-08-21 · **Target:** `/home/user/tappymaps/index.html`
**Method:** axe-core via Playwright 1.56 (Chromium) against the local dev server (`:8123`, SPA rewrites + vendored CDN libs + `/api/*` stubs), CDP for throttling and metrics, `curl` for headers and the no-JS crawler view.
**Raw data:** `scratchpad/work/a11y2/*.json`. Scripts: `scratchpad/work/a11y2/*.mjs`.

---

## Verdict

**Tappymaps is a polished, fast, leak-free product that cannot be used without a mouse and cannot be found by a search engine.**

Those are the two structural findings; everything else is detail.

The core loop — *pick a colour, tap a state* — **has no keyboard path at all.** All 51 state paths and all 24 colour swatches are non-focusable, unlabelled `<div>`s and bare `<path>`s. Measured directly: a mouse click paints Texas (`style.fill` → `rgb(102,126,234)`); `focus()` + Enter + Space on Ohio changes nothing, because `path.tabIndex === -1` and focus will not even move there. A full Tab walk of the editor with the Colours panel open is 26 stops and not one is a state or a swatch. The group-fill buttons are the obvious escape hatch and they do not work either — activating "Northeast" left every north-eastern state uncoloured. Every Arcade game and all of GeoDraft are "tap the named state", so the entire games surface is affected too. A keyboard user can reach Undo, Share and Export, and use them to export a blank map. This is one architectural omission — `onStateClick` was wired to `click` and nothing else, then copied into four independently-built maps — not a scatter of small defects.

SEO fails one layer earlier than the code suggests. The router's per-route meta is genuinely well built: seven routes, seven distinct titles, seven correct canonicals. But **no crawler sees any of it without executing JavaScript**, and what a raw fetch returns is byte-identical HTML on every URL (744,054 b each) declaring `<link rel="canonical" href="https://tappymaps.com/">` — actively telling Google that `/pricing`, `/about` and `/games/arcade` are duplicates of the homepage. There is no `<noscript>`, so tag-stripping a response yields the inline CSS as "body text". `robots.txt` and `sitemap.xml` both return the 744 KB app with `content-type: text/html`, because the `vercel.json` rewrite excludes `.json` but not `.txt` or `.xml`. Effective indexable surface: one page.

Automated scanning badly understates the a11y picture and should not be trusted here. axe-core across seven routes in their default state returns just **35 violation nodes** and **zero** label failures — because four of the five editor panels are `display:none` until clicked. Driving them reveals **13 visible form fields with no accessible name**, seven of which are `<select>`s with no cue of any kind (three offering identical option lists). The whole file contains **two** `<label for>` associations. That closes out the known-open Phase-1 item with a definitive list.

Contrast is a systemic token problem, not a styling slip: **12 of 13 theme accents fail AA against white text**, 8 fail even the large-text threshold, and the default brand button measures **2.77:1**. One rule pairing `background: var(--accent)` with `color: #fff` was written once and inherited by sixteen themes.

Performance is the good news, with one correction to the brief's premise: **Vercel gzips, so the real transfer is 169 KB, not 744 KB.** Desktop boot is genuinely quick (FCP 144 ms, DCL 271 ms, **zero long tasks**) and there is **no memory leak** — 140 router navigations *reduced* nodes by 625 and heap by 3.4 MB. The real costs are elsewhere: **677 KB of the 971 KB of JavaScript parsed at boot never executes** (supabase-js runs 11.8 % of itself; three render-blocking `<head>` tags with no `defer` include a games-only confetti library), Slow 3G + 4× CPU takes **7.7 s to a usable editor**, and `/` is served `no-store` — so the homepage re-downloads 169 KB every visit, ~3.1 MB wasted per returning user over 20 visits, while the identical bytes at `/design/make` are conditionally cacheable because the header rules only match `/` and `/index.html`.

**Counts: 1 P0 · 8 P1 · 9 P2 · 4 P3** (22 findings). Two are recorded as clean passes: no memory leak, and correct per-route client-side meta.

*Line numbers are a snapshot — `index.html` was being edited concurrently during this audit. Markup line numbers (4300–5200) were re-verified stable; JS line numbers below ~5700 may drift.*

---

## Findings

### [P0] The core task cannot be performed with a keyboard — states and colour swatches are not focusable or operable
- **Area:** a11y — `/design/make` (and every other map surface: `/games/arcade`, `/games/draft/*`, `/`)
- **Repro:** (`work/a11y2/k4-fill.mjs`) Load `/design/make`, open the Colors panel, click a swatch, then compare a **mouse** click against a **keyboard** activation on a state path, measuring `path.style.fill`:
  1. `await page.click('[data-state="Texas"]')` → fill changes.
  2. `path.focus()` then `keydown{Enter}`, `keydown{Space}` on `[data-state="Ohio"]` → nothing changes.
- **Evidence:**

  | Action | target | fill before | fill after | worked |
  |---|---|---|---|---|
  | Mouse click | `[data-state="Texas"]` | `""` (computed `rgb(42,42,74)`) | `rgb(102,126,234)` | **yes** |
  | `focus()` + Enter + Space | `[data-state="Ohio"]` | `""` | `""` | **no** |

  - Every state path: `tabIndex === -1`, and `path.focus()` **does not move focus** (`document.activeElement === p` → `false`).
  - `#mapSVG`: `role: null`, `aria-label: null`, `paths: 51`, `pathsTabbable: 0`, `pathsRoled: 0`, `pathsLabeled: 0`.
  - Colour swatches: `count: 24`, `tags: ["DIV"]`, **`tabbable: 0`, `labeled: 0`, `ariaPressed: 0`**. Markup is literally:
    `<div class="color-swatch" style="background-color: rgb(102, 126, 234);"></div>` — no role, no text, no title, no label.
  - Selection state is conveyed by class only: after clicking, the swatch is `class="color-swatch active"` with `aria-pressed: null` and `aria-selected: null`.
  - **Full Tab walk, Colors panel open: 26 stops, cycles, and not one is a state path or a colour swatch** (`swatchTabbable: false`, `pathTabbable: false`). The 26 stops are the panel collapse button, `#colorPicker`, `#addCustomColor`, `#colorblindBtn`, `#resetPaletteBtn`, `#morePalettesBtn`, `#desktopMultiSelect`, the four fill buttons, and 15 region buttons.
  - **Result reproduces 3/3 runs** — `mouseWorked: true`, `keyboardWorked: false` on every repeat.
  - **The "region button" escape hatch does not work either.** Activating the reachable `Northeast` button left `[data-state="Maine"]` unchanged (`computed: rgb(42,42,74)` before and after) and the total coloured-state count stayed at **1** (the one state coloured earlier by mouse). There is exactly one `Northeast` button in the DOM and it *is* visible (inside `#quickFillSection`, not the dormant legacy sidebar — verified), so this is not a case of clicking a hidden duplicate. `Fill All` (`#selectAllBtn`) behaved the same way: `#statsBar` stayed at `"0 of 50 states colored"` and no path gained a fill, with **no console or page errors** logged. So there is no keyboard route to colouring even a *group* of states.
  - *Separately worth a functional check by the team:* the bulk-fill controls appearing to no-op even under mouse control may be a plain bug rather than an a11y issue. It is called out here because these buttons are the only keyboard-reachable colouring affordance, so whether they work determines whether the keyboard gap is total or merely severe. As measured, it is total.
- **Location:**
  - State paths built with `click` / `contextmenu` / `mouseenter` / `mousemove` / `mouseleave` listeners only — no `keydown`, no `tabindex`, no `role`, no `aria-label`. Editor map `index.html:~9870`; Arcade map `index.html:~8764`; GeoDraft map `index.html:~7534`; Hub map `index.html:~5685`.
  - Swatches: `document.createElement('div')` + a single `click` listener, `index.html:~10050`.
- **Impact:** WCAG 2.1.1 **Keyboard (Level A)** failure on the product's *only* primary function. Keyboard-only users, switch-access users and screen-reader users cannot colour a state, cannot choose a colour, and cannot play any of the five Arcade games or GeoDraft — every one of which is "tap the named state". They can reach Undo, Share, Export and the whole rail, so the experience is: navigate a full toolbar, then export a blank map. This is one architectural omission repeated in four places, not a scatter of small defects.
- **Fix:** Both halves are small because all four maps share one build shape.
  1. **Swatches → real buttons.** `createElement('button')`, `type="button"`, `aria-label="Colour ${name}"` (or the hex), and mirror `.active` with `aria-pressed`. ~4 lines; removes half the blocker and fixes the missing accessible name at the same time.
  2. **States → focusable, labelled targets.** Add `tabindex="0"` (or a roving tabindex across the 51), `role="button"`, `aria-label="${stateName}"`, and a `keydown` handler for Enter/Space calling the same `onStateClick`. Give the `<svg>` `role="group"` + `aria-label="United States — colour states"`. Arrow-key spatial navigation is the polish; Tab + Enter is the compliance floor and is a one-day change.
  3. Do it once, in a shared `buildStateMap({ onActivate, label })` factory — the `onStateTap` dispatcher Phase 1 skipped — so the fifth map does not repeat it.

---

### [P1] Every URL serves byte-identical HTML declaring `canonical = https://tappymaps.com/` — no route is indexable as a distinct page
- **Area:** seo — all routes
- **Repro:** `for r in / /pricing /about /games/arcade; do curl -s http://127.0.0.1:8123$r | grep -o '<title>[^<]*</title>'; done` (no JS executed, exactly what a crawler fetch returns).
- **Evidence:**

  | URL | HTTP | bytes | `<title>` served | `<link rel=canonical>` served |
  |---|---|---|---|---|
  | `/` | 200 | 744,054 | `Tappymaps: Tap. Color. Share.` | `https://tappymaps.com/` |
  | `/pricing` | 200 | 744,054 | `Tappymaps: Tap. Color. Share.` | `https://tappymaps.com/` |
  | `/about` | 200 | 744,054 | `Tappymaps: Tap. Color. Share.` | `https://tappymaps.com/` |
  | `/games/arcade` | 200 | 744,054 | `Tappymaps: Tap. Color. Share.` | `https://tappymaps.com/` |

  All four responses are byte-identical (744,054 b each). The router *does* rewrite the head correctly once JS runs — `updateMetaTags()` at `index.html:5426` sets title / description / `og:*` / canonical, and each mode supplies a real canonical (`index.html:5603, 5649, 5740, 6017, 6775, 8600-8621, 9649-9669`). That is good work, but it happens **after** the crawler has already parsed a document that says "I am a duplicate of the homepage."
- **Location:** `index.html:6` (`<title>`), `index.html:22` (`<link rel="canonical" href="https://tappymaps.com/">`), applied by `vercel.json` rewrite `"/((?!api|assets|favicon|.*\\.(?:png|svg|ico|webmanifest|json)).*)" → /index.html`.
- **Impact:** A hardcoded self-referencing canonical pointing at `/` on every URL is a stronger de-indexing signal than having no canonical at all — it explicitly tells Google that `/pricing`, `/about`, `/games/arcade` etc. are duplicates and should be dropped from the index. Googlebot does render JS and may correct this, but canonical conflicts between the raw and rendered HTML are resolved unpredictably, and Bing / Slack / Facebook / most LLM crawlers never execute JS at all. Effective indexable surface today: **one page**.
- **Fix:** Either (a) remove line 22 entirely so the crawler falls back to the request URL, which is strictly better than the wrong answer, or (b) properly: a Vercel edge middleware that injects per-route `<title>` / `description` / `canonical` / `og:*` into the shell before it is served. The router's `meta()` functions are already the single source of truth — lift them into a module the middleware and the client both import so they cannot drift.

---

### [P1] `robots.txt` and `sitemap.xml` do not exist — both return the 744 KB HTML app with `content-type: text/html`
- **Area:** seo — site-wide
- **Repro:** `curl -sI http://127.0.0.1:8123/robots.txt` / `/sitemap.xml`.
- **Evidence:** `/robots.txt` → **200, 744,054 bytes, `text/html`**. `/sitemap.xml` → **200, 744,054 bytes, `text/html`**. Neither file exists on disk (`ls /home/user/tappymaps` shows no `public/`, no `robots.txt`, no `sitemap.xml`). The cause is the `vercel.json` rewrite negative-lookahead, which excludes `png|svg|ico|webmanifest|json` but **not `txt` or `xml`**, so both paths fall through to the SPA.
- **Location:** `vercel.json:11` (rewrite source regex).
- **Impact:** A `robots.txt` that returns HTML with a 200 is worse than a 404 — crawlers must guess. No sitemap means the client-routed URLs (`/design/make`, `/games/arcade`, `/games/draft`, `/design/gallery`, `/pricing`, `/about`) have **no discovery path at all** except in-page links that only exist after JS runs.
- **Fix:** Add both as real files and extend the rewrite exclusion to `txt|xml`. Exact contents proposed:

  `robots.txt`
  ```
  User-agent: *
  Allow: /
  Disallow: /api/
  Disallow: /embed
  Sitemap: https://tappymaps.com/sitemap.xml
  ```

  `sitemap.xml`
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://tappymaps.com/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
    <url><loc>https://tappymaps.com/design/make</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
    <url><loc>https://tappymaps.com/design/gallery</loc><changefreq>daily</changefreq><priority>0.7</priority></url>
    <url><loc>https://tappymaps.com/games/arcade</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
    <url><loc>https://tappymaps.com/games/draft</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
    <url><loc>https://tappymaps.com/pricing</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
    <url><loc>https://tappymaps.com/about</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
  </urlset>
  ```

  `vercel.json` rewrite source becomes:
  `"/((?!api|assets|favicon|robots.txt|sitemap.xml|.*\\.(?:png|svg|ico|webmanifest|json|txt|xml)).*)"`

---

### [P1] The map is invisible to assistive technology — no accessible name, no text alternative, on any route
- **Area:** a11y — all map-bearing routes
- **Repro:** read `role` / `aria-label` off each visible `<svg>` and its paths (`work/a11y2/k1-keyboard.mjs`).
- **Evidence:** measured on every map-bearing surface:

  | Route | SVG | `role` | `aria-label` | paths | labelled | focusable |
  |---|---|---|---|---|---|---|
  | `/design/make` | `#mapSVG` | `null` | **`null`** | 51 | **0** | 0 |
  | `/games/draft/category` | `#draftMapSvg` | `null` | `"US states map — tap a state to draft it"` | 51 | **0** | 0 |
  | `/` (hub) | `#hubMapSvg` | `null` | **`null`** | 51 | **0** | 0 |

  GeoDraft is the only surface that names its map at all — and even there the instruction it gives ("tap a state to draft it") describes an action a screen-reader user cannot perform, and none of the 51 states inside it is individually labelled. A screen reader announces the editor's entire content as nothing. Other in-page SVGs (icons) are also mostly unlabelled, though one correctly carries `aria-hidden="true"`.
- **Impact:** Even setting the keyboard blocker aside, there is no way to perceive which states are coloured, what colour they are, or what the legend says. The product's data has no non-visual representation anywhere.
- **Fix:** (a) `role="img"`/`role="group"` + `aria-label` on the `<svg>`, and `<title>` per path; (b) higher value — render a visually-hidden text mirror of the map ("Texas: Blue — Visited; Ohio: not coloured…") built from the same state the app already holds. That single function serves screen-reader users, makes the data copy-pasteable, and gives crawlers something indexable on `/design/make`.

---

### [P1] Form controls with no accessible name — the definitive list (13 visible fields, `/design/make`)
- **Area:** a11y — `/design/make` (the known-open Phase-1 item, now enumerated)
- **Repro:** (`work/a11y2/a2-deep.mjs`) open each of the 5 rail panels in turn (`[aria-label="Map settings" | "Colors" | "Map Elements" | "Data Maps" | "Pro upgrade"]`), and for every **visible** `input`/`select`/`textarea` test for `aria-label` → `aria-labelledby` → `label[for]` → wrapping `<label>` → `title`.
- **Evidence:** the whole file contains only **two** `<label for>` associations (`classCodeJoinInput`, `lbNameInput`). Per panel: Map settings **1/1** unnamed · Colors **2/3** · Map Elements **11/16** · Data Maps **2/2** · Pro upgrade **1/1**. Unique visible offenders:

  | # | id | element | placeholder / cue | index.html |
  |---|---|---|---|---|
  | 1 | `createMapTitleInput` | `input[text]` | `My US Map` | **4320** |
  | 2 | `colorPicker` | `input[color]` | — (visual swatch only) | **4872** |
  | 3 | `legendTitleInput` | `input[text]` | `Legend title` | **4917** |
  | 4 | `arrowPositionSelect` | `select` | — | **4940** |
  | 5 | `arrowColorPicker` | `input[color]` | — | **4946** |
  | 6 | `arrowStyleSelect` | `select` | — | **4948** |
  | 7 | `scalePositionSelect` | `select` | — | **4960** |
  | 8 | `scaleUnitSelect` | `select` | — | **4965** |
  | 9 | `scaleColorPicker` | `input[color]` | — | **4969** |
  | 10 | `scaleStyleSelect` | `select` | — | **4971** |
  | 11 | `legendPositionSelect` | `select` | — | **4979** |
  | 12 | `sourceInput` | `input[text]` | `e.g. U.S. Census Bureau, 2024` | **5000** |
  | 13 | `csvPasteInput` | `textarea` | CSV sample data | **4406** |

  Seven of the thirteen are `<select>` elements with **no cue whatsoever** — no placeholder, no title, no adjacent programmatic label. A screen reader announces them as "combo box, North East" (the first option) with no indication of whether that controls the arrow, the scale bar, or the legend. Three of them (`arrowPositionSelect`, `scalePositionSelect`, `legendPositionSelect`) offer *identical* option lists, so they are mutually indistinguishable by ear.
- **Note:** an additional **26 unnamed fields are present but hidden** (`display:none`) in the dormant legacy mobile chrome, on every route. They are not user-facing today, but they are 26 latent violations that will surface the moment that markup is ever un-hidden.
- **Impact:** WCAG 4.1.2 (Name, Role, Value) and 3.3.2 (Labels or Instructions), both Level A. The Map Elements panel — the app's densest control surface — is unusable non-visually.
- **Fix:** One pass, 13 attributes. `aria-label` is the least invasive since these are laid out in tight inline rows where a visible `<label>` would break the design: e.g. `aria-label="North arrow position"`, `"North arrow colour"`, `"North arrow style"`, `"Scale bar position"`, `"Scale bar units"`, `"Scale bar colour"`, `"Scale bar style"`, `"Legend position"`, `"Legend title"`, `"Map title"`, `"Colour picker"`, `"Source citation"`, `"Paste CSV data"`. Then add a smoke assertion — "every visible input/select/textarea has an accessible name" — so this cannot regress.

---

### [P1] Dynamic feedback is never announced — game prompts, correct/wrong, and the state counter are all silent
- **Area:** a11y — `/games/arcade`, `/games/draft/*`, `/design/make`
- **Repro:** (`work/a11y2/a3-live.mjs`) start an Arcade run, snapshot the text of every `[aria-live]` node, tap a state, snapshot again.
- **Evidence:**
  - Five `aria-live` regions exist in the file (`csvImportStatus` 4412, `arcadeToast` 4591, `arcadeShareStatus` 4616, `draftShareStatus` 4707, `draftTerrShareStatus` 4793). **All five are share/import status lines. None carries gameplay or editor feedback.**
  - Tapping a state during an Arcade run left every live region **empty before and after** (`arcadeLiveChanged: false`; all five texts `""`). Correct/wrong is communicated purely by transient CSS classes.
  - The actual prompt — `<div class="arcade-prompt" id="arcadePrompt">Find the state</div>` at **index.html:4570** — has **no `aria-live`, no `role="status"`**. It changes text every round and announces nothing.
  - The big centre-screen pop `#arcadePromptPop` (**4583**) is correctly `aria-hidden="true"` + `pointer-events:none`, so it is not a duplicate-announcement risk — but that means the *only* accessible copy of the prompt would have to be `#arcadePrompt`, and it is silent.
  - Editor: `#statsBar` (**5178**) renders `"0 of 50 states colored"` with `aria-live: null`, `role: null`. The single most useful progress signal in the product updates silently.
- **Impact:** Even after the P0 keyboard fix, every game would still be unplayable non-visually: the player is never told which state to find, whether the last tap was right, or what the score is. WCAG 4.1.3 (Status Messages, AA).
- **Fix:** Four attributes, no logic changes. `aria-live="assertive"` on `#arcadePrompt` (round changes should interrupt); `role="status"` on `#statsBar` and on the score/streak container; and a small visually-hidden `<div role="status">` that game code writes `"Correct — Ohio"` / `"Wrong — that was Iowa"` into on each resolve. `#arcadeToast` already does this correctly and is the pattern to copy.

---

### [P1] White-on-accent fails AA in 12 of 13 themes — the brand's primary button is 2.77:1
- **Area:** a11y — every route, every theme
- **Repro:**
  1. Live: measure computed `color` / effective background on `.btn.primary` at `/design/make` (`work/a11y2/a4-contrast.mjs`).
  2. Systemic: extract every `--accent` token from the `[data-theme]` blocks in `index.html` and compute the WCAG ratio against `#ffffff`.
- **Evidence:** measured live, default dark theme —

  | Probe | selector | foreground | background | size | ratio | AA |
  |---|---|---|---|---|---|---|
  | Primary button | `.btn.primary` | `rgb(255,255,255)` | `rgb(14,165,233)` | 13px | **2.77:1** | **FAIL** (needs 4.5) |
  | Plain button | `.btn` | `rgb(255,255,255)` | `rgb(14,165,233)` | 13px | **2.77:1** | **FAIL** |
  | Danger button | `.btn.danger` | `rgb(239,68,68)` | `rgb(15,52,96)` | 13px | **3.32:1** | **FAIL** |
  | Stats bar | `#statsBar` | `rgb(160,160,160)` | `rgb(15,52,96)` | 12px | 4.78:1 | pass |
  | Map title | `#mapTitle` | `rgb(14,165,233)` | `rgb(22,31,51)` | 52px | 5.93:1 | pass |
  | Panel heading / input text | `h3`, `#createMapTitleInput` | `rgb(224,224,224)` | `rgb(22,33,62)` | 13–14px | 12.04:1 | pass |

- **Evidence (cont.):** all themes, white text on `--accent` —

  | theme | `--accent` | ratio | AA (4.5) | AA-large (3.0) |
  |---|---|---|---|---|
  | forest | `#4ade80` | **1.74:1** | FAIL | **FAIL** |
  | nord | `#88c0d0` | **2.00:1** | FAIL | **FAIL** |
  | ocean | `#38bdf8` | **2.14:1** | FAIL | **FAIL** |
  | dracula | `#bd93f9` | **2.41:1** | FAIL | **FAIL** |
  | mint | `#10b981` | **2.54:1** | FAIL | **FAIL** |
  | rose | `#f472b6` | **2.65:1** | FAIL | **FAIL** |
  | **default (`:root`)** | `#0EA5E9` | **2.77:1** | FAIL | **FAIL** |
  | sunset | `#f97316` | **2.80:1** | FAIL | **FAIL** |
  | solarized | `#268bd2` | 3.68:1 | FAIL | pass |
  | cherry | `#ef4444` | 3.76:1 | FAIL | pass |
  | cyberpunk | `#a855f7` | 3.96:1 | FAIL | pass |
  | lavender | `#8b5cf6` | 4.23:1 | FAIL | pass |
  | sepia | `#8b6914` | 5.09:1 | pass | pass |

  **12 of 13 fail AA; 8 fail even the large-text threshold.** The worst (`forest`, 1.74:1) is close to invisible.
- **Location:** `:root { --accent: #0EA5E9 }` at `index.html:~33`; per-theme overrides in the `[data-theme="…"]` blocks; the failing rule is the shared button style that pairs `background: var(--accent)` with `color: #fff`.
- **Impact:** WCAG 1.4.3 (Contrast, AA). This is not a stray swatch — it is every primary call-to-action on every screen in every theme, including "Go Pro", "Export" and the games' start buttons. Users with low vision, and anyone outdoors on a phone, lose the primary action.
- **Fix:** Introduce a **paired token**: `--accent` and `--on-accent`, and set `--on-accent` per theme to whichever of `#fff` / near-black clears 4.5:1 (for `forest`, `nord`, `ocean`, `mint`, `rose` that is a dark foreground). Change the button rule to `color: var(--on-accent)`. Then add a build-time or smoke-time assertion over the theme table so theme 17 cannot ship a failing pair — the whole reason 12 themes fail is that the pairing was never expressed anywhere it could be checked.

---

### [P1] `prefers-reduced-motion` is honoured in exactly one place — confetti, pops and 61 transitions ignore it
- **Area:** a11y — `/games/arcade`, `/games/draft/*`, `/design/make`
- **Repro:** `grep -n 'prefers-reduced-motion' index.html` and `grep -c '@media (prefers-reduced-motion'`.
- **Evidence:**
  - **`@media (prefers-reduced-motion: reduce)` CSS blocks: `0`.** There is no CSS opt-out anywhere in the file.
  - The single reference is JS, at `index.html:5735`, inside the **Hub** map animation: `const interval = reduce ? 520 : 260; const perTick = reduce ? 2 : 3;`. Credit where due — that is a thoughtful implementation, and the comment explains the reasoning. It is also the *only* one.
  - Unguarded motion elsewhere: **10 `@keyframes`**, **11 `animation:`** declarations, **61 `transition:`** declarations, and **7 `confetti(...)` call sites** (`index.html:8227, 8228, 8261, 9146, 9576, 13406, …`) firing 70–110 particles on medals, run completion and match clinch. None is behind a reduced-motion check.
  - The games' signature effects — the full-screen `#arcadePromptPop` prompt, `#draftCategoryPop`, the accelerating `draftRevealRound` sequence (`240 + i*90` ms), and the winner colour-wash — all animate unconditionally.
- **Impact:** WCAG 2.3.3 (Animation from Interactions, AAA) and, for the full-screen pops and particle bursts, a genuine vestibular-disorder and photosensitivity risk. Users who set the OS preference get the full show anyway on precisely the surfaces designed to be maximally kinetic.
- **Fix:** One CSS block covers ~90 % of it:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
  Then guard the 7 confetti sites behind a single shared `const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches` (the Hub already computes this — hoist it), and swap the pop animations for an instant show/hide when it is set.

---

### [P1] 70 % of the JavaScript parsed at boot never executes — 677 KB of 971 KB is unused
- **Area:** perf — `/design/make` (representative; the same bundle loads on every route)
- **Repro:** `page.coverage.startJSCoverage()`, load `/design/make`, settle 4.5 s, then compute unused as the union of V8 ranges with `count === 0` (`work/a11y2/p3-cov.mjs`).
- **Evidence:**

  | Script | parsed | used at boot | unused | used % |
  |---|---|---|---|---|
  | inline block 0 (main app) | 458 KB | 146 KB | **312 KB** | 31.9 % |
  | `supabase-js@2` | 207 KB | 24 KB | **183 KB** | **11.8 %** |
  | `html2canvas@1.4.1` | 193 KB | 95 KB | **98 KB** | 49.1 % |
  | `chroma-js@2.4.2` | 45 KB | 15 KB | **30 KB** | 33.6 % |
  | inline block 1 (dormant Mobile IIFE) | 34 KB | 9 KB | **25 KB** | 26.2 % |
  | `dom-to-image-more@3.4.5` | 16 KB | 1 KB | 15 KB | **9.3 %** |
  | `canvas-confetti@1.9.3` | 11 KB | 1 KB | 9 KB | **13.6 %** |
  | `topojson-client@3` | 7 KB | 1 KB | 6 KB | 20.2 % |
  | **TOTAL** | **971 KB** | **294 KB** | **677 KB** | **30.3 %** |

  Three of the six CDN tags are **render-blocking in `<head>` with no `defer`** (`index.html:25-27`: `chroma-js`, `dom-to-image-more`, `canvas-confetti`) — and those three are 72 KB of which **17 KB executes**. `canvas-confetti` is games-only yet blocks first paint on the pricing page. `supabase-js` is the single largest library at 207 KB and runs **11.8 %** of itself at boot — it is only needed once a user signs in.
- **Impact:** On a mid-range phone this is parse/compile work and main-thread time spent on code that will never run for most sessions. Every route pays for every other route's dependencies.
- **Fix:** in order of leverage —
  1. Add `defer` to all six `<script>` tags — nothing in them is needed before `DOMContentLoaded` (`init()` already drives everything). Free, one line each, removes the render-blocking penalty immediately.
  2. Lazy-load `supabase-js` on first auth interaction (`import()` or an injected tag) — **−207 KB** from every boot.
  3. Lazy-load `canvas-confetti` at the games routes and `html2canvas` at first export (it is the *fallback* exporter; `dom-to-image-more` is primary) — another **−204 KB** off the default path.

---

### [P2] No `<noscript>`, no server-rendered content — a non-JS crawler extracts CSS source text as the page body
- **Area:** seo — all routes
- **Repro:** `curl -s http://127.0.0.1:8123/about | sed 's/<[^>]*>/ /g'`
- **Evidence:** `grep -c '<noscript' index.html` → **0**. Stripping tags from the raw `/about` response yields, as the first several hundred characters of "body text": `* { margin: 0; padding: 0; box-sizing: border-box; } /* ── Design Tokens ── */ :root { --accent: #0EA5E9; ...` — i.e. the inline `<style>` block. There is no human-readable copy in the served HTML at all; every mode's markup is either `display:none` legacy chrome or built by JS on `enter`.
- **Location:** `index.html:29` onward (inline `<style>`); no `<noscript>` anywhere in the file.
- **Impact:** Non-rendering crawlers, link unfurlers, reader modes and text-only clients see a page whose only extractable content is CSS. Combined with the canonical finding above, the site presents as a single thin page.
- **Fix:** Add a `<noscript>` block immediately after `<body>` containing the hub's real copy (product description, a plain `<ul>` of links to `/design/make`, `/games/arcade`, `/games/draft`, `/pricing`, `/about`) — ~20 lines, zero effect on the JS path, and it gives every crawler and reader-mode something true to index.

---

### [P2] No structured data (JSON-LD) anywhere
- **Area:** seo — all routes
- **Evidence:** `grep -c 'application/ld+json' index.html` → **0**.
- **Impact:** No rich-result eligibility. `WebApplication` on `/`, `Product` + `Offer` on `/pricing`, and `Game`/`SoftwareApplication` on the game routes are all applicable and all absent.
- **Fix:** One `<script type="application/ld+json">` in `<head>` for the site-level `WebApplication` (name, url, applicationCategory `DesignApplication`, `offers` free tier), plus a router-injected block per route. Static site-level JSON-LD is ~15 lines and works without JS.

---

### [P2] Automated scanning under-reports by design — panels are `display:none`, so axe never sees most of the app
- **Area:** a11y — process finding, `/design/make`
- **Evidence:** axe-core on `/design/make` in its **default** state reports `color-contrast:5`, `landmark-one-main:1`, `region:4` — and **zero** `label` or `select-name` violations. Yet the panel-by-panel walk above finds **13 unlabelled visible fields**. axe only evaluates rendered nodes, and 4 of the 5 rail panels are `display:none` until clicked, so a scan of the loaded page inspects roughly one-fifth of the editor's controls. The same blind spot hid the two unlabelled `<select>` groups entirely.
- **Impact:** Any future CI a11y gate that just loads each route will report a nearly clean site while the real defect count is several times higher. The audit method has to drive the UI.
- **Fix:** Whatever a11y checking gets added to `scripts/smoke.mjs`, make it click through the 5 rail panels, the gallery tabs and the upgrade modal before asserting — the harness already boots every mode, so it is a loop, not new infrastructure.

---

### [P2] Modals have no dialog semantics — no `role`, no `aria-modal`, no accessible name
- **Area:** a11y — `/design/make`, all routes (the upgrade modal is a body-level sibling reachable from every mode)
- **Evidence:** `#upgradeModal` → `role: null`, `aria-modal: null`, name: `null`. `#onboardingOverlay` → `role: null`, `aria-modal: null`, name: `null`.
- **Impact:** Screen readers do not announce a dialog opening, do not scope reading to it, and the background stays reachable — so a user can Tab out of the upgrade modal into the editor behind it without ever being told the modal exists or how to close it. The onboarding overlay is the *first* thing a new user meets.
- **Fix:** `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the existing heading, move focus to the dialog on open, restore it on close, and Escape-to-close. Apply `inert` (or `aria-hidden`) to `.container` while open.

---

### [P2] Heading hierarchy is broken on every route — two `<h1>`s everywhere, and the editor starts at `<h3>`
- **Area:** a11y / seo — all routes
- **Repro:** enumerate visible `h1…h6` per route (`work/a11y2/a1-scan.mjs`).
- **Evidence:**

  | Route | visible heading levels, in DOM order | problem |
  |---|---|---|
  | `/` | `h1, h1` | two `<h1>` |
  | `/design/make` | `h3, h1` | starts at **h3**; h2 skipped; h1 last |
  | `/design/gallery/mine` | `h2, h3, h1` | h1 last |
  | `/games/arcade` | `h2, h1` | h1 last |
  | `/games/draft/category` | `h4, h4, h1` | starts at **h4**; h2 and h3 skipped |
  | `/about` | `h1, h2, h2, h2, h1` | two `<h1>` |
  | `/pricing` | `h1, h2, h2, h1` | two `<h1>` |

  The duplicate `<h1>` is `<h1 class="sr-only">Tappymaps</h1>` at **index.html:4849**, which is always in the DOM regardless of mode, alongside each mode's own `<h1>`. The editor and GeoDraft start mid-hierarchy because their panel headings were authored as `h3`/`h4` for visual size.
- **Impact:** Screen-reader users navigate long pages by heading level; "jump to h1" lands on a generic wordmark, and the editor's outline claims to be a subsection of a document that has no sections. Also weakens per-page topical signals for search.
- **Fix:** Delete the global sr-only `<h1>` (every mode now sets its own — it was a pre-router stopgap) and re-level panel headings so each route reads `h1` → `h2` → `h3` with nothing skipped. Purely markup; no JS touched.

---

### [P2] Four of seven routes have no `<main>` landmark, and most content sits outside any landmark
- **Area:** a11y — `/design/make`, `/design/gallery/*`, `/games/arcade`, `/games/draft/*`
- **Evidence:** axe `landmark-one-main` (moderate) fires on `/design/make`, `/design/gallery/mine`, `/games/arcade`, `/games/draft/category`. Only three `<main>` elements exist in the file — `.hub-main` (**4278**), `#marketingAbout` (**4473**), `#marketingPricing` (**4486**) — so Hub, About and Pricing are covered and the four application routes are not. axe `region` (moderate) additionally reports **1–4 nodes per route** of content outside any landmark.
- **Impact:** No "skip to main content" target and no landmark navigation on exactly the routes where the content is densest. There is also no skip link anywhere in the file, so a keyboard user re-tabs the top bar on every route.
- **Fix:** Wrap each mode's root (`#modeCreate`, `#modeGallery`, `#modeArcade`, `#modeDraft`) in `<main>` or add `role="main"`, mark the rail as `<nav aria-label="Editor panels">`, and add a `<a class="skip-link" href="#main">Skip to content</a>` as the first focusable element.

---

### [P2] `/` is served `no-store`, so the landing page re-downloads 169 KB on every single visit
- **Area:** perf — `/` and `/index.html`
- **Repro:** `curl -sI https://tappymaps.com/` and read `vercel.json` `headers`.
- **Evidence:** `Cache-Control: no-cache, no-store, must-revalidate` on both `/` and `/index.html`. `no-store` forbids the browser from keeping *any* copy, so there is not even a conditional request to answer with a 304 — the full gzipped **169 KB** comes down every time.
  - Cost model: 1 visit = 169 KB · 5 visits = **844 KB** · 20 visits = **3,375 KB**, versus 169 KB once plus 19 near-zero 304s. **~3.1 MB wasted per returning user over 20 visits.**
  - On Slow 3G that is **3.4 s of pure download before any paint**, repeated every visit.
  - The rules are also **inconsistent**: `vercel.json` `headers` only match the literal sources `/index.html` and `/`. The SPA-rewritten routes — `/design/make`, `/design/gallery`, `/games/arcade`, `/games/draft`, `/about`, `/pricing`, `/embed` — match no header rule and fall back to Vercel's default, which permits revalidation. So the *same bytes* are uncacheable at `/` and conditionally cacheable at `/design/make`. That is an accident of the rewrite rules, not a decision.
- **Impact:** The homepage — the page most likely to be hit repeatedly and shared — is the one page guaranteed to never be cached.
- **Fix:** Short term, replace `no-store` with `no-cache` (or `max-age=0, must-revalidate`). `no-cache` still forces revalidation on every request but *allows* the 304, cutting a repeat visit from 169 KB to a few hundred bytes with identical freshness guarantees. Long term, the correct shape is a small HTML shell on `must-revalidate` plus content-hashed `app.[hash].js` / `.css` on `public, max-age=31536000, immutable` — repeat visits drop to ~1 KB and deploys still invalidate instantly. That requires the build step discussed in Ideas.

---

### [P2] axe-core totals — 35 violation nodes across 7 routes, concentrated in 3 rules
- **Area:** a11y — all routes
- **Repro:** axe-core (`wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice`) per route in its default loaded state (`work/a11y2/a1-scan.mjs`).
- **Evidence:** by route —

  | Route | nodes | breakdown |
  |---|---|---|
  | `/design/make` | **10** | color-contrast 5 · landmark-one-main 1 · region 4 |
  | `/design/gallery/mine` | 8 | color-contrast 3 · landmark-one-main 1 · region 4 |
  | `/games/draft/category` | 7 | color-contrast 2 · landmark-one-main 1 · region 4 |
  | `/games/arcade` | 5 | color-contrast 1 · landmark-one-main 1 · region 3 |
  | `/` | 2 | color-contrast 1 · region 1 |
  | `/about` | 2 | color-contrast 1 · region 1 |
  | `/pricing` | 1 | region 1 |
  | **Total** | **35** | |

- **Evidence (cont.):** by rule, with failing selectors —

  | Rule | Impact | Nodes | Routes | Example selectors |
  |---|---|---|---|---|
  | `region` | moderate | **18** | 7 | `#mapTitle`, `#arcadeTileGrid`, `#arcadeDailyCard`, `#draftTurnLabel`, `#draftMatch > .arcade-timer-track` |
  | `color-contrast` | serious | **13** | 6 | `#createShareBtn`, `#clearAllBtn`, `#countyViewBtn`, `.arcade-tile-mode-btn`, `.draft-pips > .ai` |
  | `landmark-one-main` | moderate | 4 | 4 | `html` |

- **Impact:** triage — which of these is real user harm —
  - **`color-contrast` (13) — real harm.** Same root cause as the P1 contrast finding; these are the concrete instances on live buttons.
  - **`landmark-one-main` (4) — real, low severity.** Genuinely blocks landmark navigation and skip-links on the four app routes. Cheap to fix.
  - **`region` (18) — largely noise, one real signal.** `region` is a best-practice rule, and much of the count is decorative wrappers. But `#arcadeTileGrid` and `#arcadeDailyCard` being outside any landmark is the same underlying gap as `landmark-one-main` — fixing the landmarks removes most of these too.
  - **Crucially, the automated total badly understates reality.** Zero `label` / `select-name` violations appear here, because the 13 unlabelled fields live in `display:none` panels (see the scanner blind-spot finding). Treat 35 as a floor, not a total.
- **Fix:** wrap each mode root in `<main>` (clears `landmark-one-main` and most of `region` together), then apply the `--on-accent` token fix for the 13 `color-contrast` nodes. Re-run axe **with panels driven** to get a true baseline before calling any of it done.

---

### [P2] Per-route meta is genuinely correct client-side (pass) — but every route shares one `og:image`
- **Area:** seo — all routes
- **Evidence:** after JS runs, each route carries a distinct, well-written title, description and **correct** canonical:

  | Route | `<title>` | canonical | `og:image` |
  |---|---|---|---|
  | `/` | `Tappymaps — Tap. Color. Share.` | `…/` | `…/assets/social-og-image.png` |
  | `/design/make` | `My US Map — Tappymaps` | `…/design/make` | *same* |
  | `/design/gallery/mine` | `Gallery · My Maps — Tappymaps` | `…/design/gallery/mine` | *same* |
  | `/games/arcade` | `Arcade — Tappymaps` | `…/games/arcade` | *same* |
  | `/games/draft/category` | `Category Draft — Tappymaps GeoDraft` | `…/games/draft/category` | *same* |
  | `/about` | `About Tappymaps — A lightweight US map maker` | `…/about` | *same* |
  | `/pricing` | `Tappymaps Pricing — Pro $9 and Classroom $12` | `…/pricing` | *same* |

  This is a **pass** and worth stating plainly: the router's `updateMetaTags()` does the right thing. The problem is purely that it runs too late for non-rendering crawlers (see the canonical finding).
- **The remaining gap:** all seven routes emit the identical generic `og:image`. `/api/render` already exists and produces a real per-map PNG, and `mapOgImageUrl()` already wires it up for shared editor/embed links — but the games, gallery, pricing and about routes all fall back to the brand image.
- **Impact:** Every Tappymaps link shared to Slack, Discord, iMessage or Twitter looks identical regardless of what it points to, which flattens click-through on exactly the viral-sharing loop the product is built around.
- **Fix:** Give Arcade, GeoDraft, Gallery and Pricing their own static OG images (four PNGs), and keep the dynamic `/api/render` image for map links. Set `og:image:width`/`height` too — currently absent, which makes some unfurlers render a small thumbnail instead of a large card.

---

### [P3] No web app manifest and no `apple-touch-icon` — PWA/installability is unreachable
- **Area:** seo / distribution
- **Evidence:** `/manifest.webmanifest` → **404**; `/apple-touch-icon.png` → **404**. `grep 'rel="manifest"' index.html` → none. The only icon is an inline emoji SVG data URI (`index.html:24`), which iOS ignores for home-screen bookmarks.
- **Impact:** "Add to Home Screen" produces a screenshot-thumbnail icon and a browser-chrome launch on iOS. CLAUDE.md lists PWA/Capacitor as the planned mobile distribution path; this is its missing prerequisite.
- **Fix:** Ship `manifest.webmanifest` (name, short_name `Tappymaps`, `start_url: "/"`, `display: "standalone"`, `theme_color: "#1a1a2e"`, `background_color: "#1a1a2e"`, 192/512 PNG icons), a 180×180 `apple-touch-icon.png`, and `<link rel="manifest">` + `<link rel="apple-touch-icon">` in `<head>`. Note `webmanifest` is already excluded from the SPA rewrite, so it will serve correctly once the file exists.

---

### [P3] No memory leak — 140 router navigations *reduce* node, listener and heap counts (clean pass)
- **Area:** perf — router
- **Repro:** load `/`, snapshot CDP `Performance.getMetrics`, then `Router.navigate()` through all 7 modes × 20 (140 hops), force GC, re-snapshot (`work/a11y2/p2-deep.mjs`).
- **Evidence:**

  | metric | before | after 140 hops | delta |
  |---|---|---|---|
  | DOM nodes | 5,242 | 4,617 | **−625** |
  | JS event listeners | 664 | 663 | **−1** |
  | JS heap | 5.3 MB | 1.9 MB | **−3.4 MB** |
  | Documents | 3 | 1 | −2 |

- **Impact:** None — this is a pass, recorded because it was worth checking. Mode `exit()` handlers are cleaning up correctly and the re-parenting architecture does not accumulate. Long editing/gaming sessions are safe.
- **Fix:** none required. Worth keeping a variant of this check in `scripts/smoke.mjs` so a future mode handler that forgets to clean up is caught early.

---

### [P3] Two primary controls have no focus indicator, and the rest rely on the UA default ring
- **Area:** a11y — `/design/make`
- **Repro:** Tab through the editor, reading computed `outline` / `box-shadow` at each stop (`work/a11y2/a5-focus.mjs`).
- **Evidence:** of 17 sampled tab stops, **2 have no visible focus ring at all**:
  - `#createMapTitleInput` — `outline: none 0px`, `box-shadow: none`. This is the map-title field in the top bar, a primary control.
  - `#mapTitle` — `outline: none 0px`, `box-shadow: none`. The editable on-map title.

  **4 CSS rules in the document remove the outline on `:focus`.** The other 15 stops have no author-defined focus style either — they fall through to the UA default, computing as `outline: auto 1px rgb(16,16,16)`, i.e. a near-black ring against the `#1a1a2e` dark surface. Chrome's `auto` ring is drawn two-tone so it remains visible, but the app is relying on browser behaviour rather than specifying anything.
- **Impact:** WCAG 2.4.7 (Focus Visible, AA) fails outright on the two controls with the outline removed. Elsewhere the indicator is un-designed and un-tested across the 16 themes.
- **Fix:** Delete the 4 `:focus { outline: none }` rules and add one global token-driven rule: `:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }` with `--focus-ring` defined per theme to clear 3:1 against that theme's surface.

---

### [P3] `maximum-scale=5.0` on the viewport caps pinch-zoom
- **Area:** a11y — all routes
- **Evidence:** `index.html:5` — `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">`.
- **Impact:** WCAG 1.4.4 (Resize Text) expects at least 200 % and most guidance says do not cap at all; 5× is generous and `user-scalable=yes` is correctly set, so this is minor — but low-vision users on phones who need more than 5× are blocked, and iOS Safari has historically respected the cap. The app has its own in-map pinch-zoom (1–6×), which is presumably why the cap exists.
- **Fix:** Drop `maximum-scale` entirely. The app's own map zoom is independent of browser page zoom, so removing the cap costs nothing.

---

## Measurements

### Boot — desktop 1440×900, unthrottled, local dev server (no gzip), vendored CDN libs

| Metric | `/` | `/design/make` |
|---|---|---|
| Requests | 8 | 8 |
| Total bytes (uncompressed) | 1,288 KB | 1,288 KB |
| `responseEnd` | 33.3 ms | 36.5 ms |
| `domInteractive` | 270.8 ms | 267.2 ms |
| **`responseEnd` → `domInteractive`** (inline parse + exec) | **237.5 ms** | **230.7 ms** |
| DOMContentLoaded | 271.1 ms | 267.7 ms |
| Load | 271.3 ms | 267.9 ms |
| First Contentful Paint | 144 ms | 196 ms |
| Long tasks | **0** | **0** |
| ScriptDuration | 0.039 s | 0.035 s |
| RecalcStyle / Layout | 0.035 s / 0.084 s | 0.016 s / 0.045 s |
| JS heap | 5.4 MB | 4.7 MB |
| DOM nodes (CDP) / elements | 5,242 / 2,191 | 5,196 / 2,140 |
| Event listeners | 664 | 674 |

### Payload composition

| Asset | raw | note |
|---|---|---|
| `index.html` | **744 KB** (15,819 lines) | **173 KB gzipped** (4.3× ratio) |
| — inline script block 0 (main app) | 458 KB | render-relevant |
| — inline script block 1 (dormant Mobile IIFE) | 34 KB | hidden at every breakpoint |
| `supabase-js@2` | 207 KB | 11.8 % used at boot |
| `html2canvas@1.4.1` | 193 KB | export **fallback** |
| `chroma-js@2.4.2` | 45 KB | **render-blocking in `<head>`, no `defer`** |
| `dom-to-image-more@3.4.5` | 16 KB | **render-blocking in `<head>`**, 9.3 % used |
| `canvas-confetti@1.9.3` | 11 KB | **render-blocking in `<head>`**, games-only |
| `topojson-client@3` | 7 KB | |
| `states-albers-10m.json` | 80 KB | topology |
| **CDN JS total** | **480 KB** | 137 KB used at boot |

### Throttled — `/design/make`, mobile 390×844, **gzip enabled** (models real Vercel transfer)

| Metric | Slow 3G + 4× CPU (400 kbps, 400 ms RTT) | Fast 3G + 4× CPU (1.6 Mbps, 150 ms RTT) |
|---|---|---|
| Document encoded / decoded | 169 KB / 728 KB | 169 KB / 728 KB |
| Total transferred (8 reqs) | 325 KB | 325 KB |
| `responseEnd` | 6,465 ms | 1,665 ms |
| First Contentful Paint | 1,924 ms | 716 ms |
| DOMContentLoaded | 6,508 ms | 1,820 ms |
| **Time to usable** (51 states painted + rail present) | **7,668 ms** | **2,360 ms** |

For contrast, the same Slow-3G run **without** gzip (raw 744 KB) put `responseEnd` at 25,079 ms and time-to-usable at **26,559 ms** — confirming the transfer, not the parse, dominates on slow links.

### Cache cost of `no-store` on `/`

| Visits to `/` | Bytes transferred (current, `no-store`) | With `no-cache` (304 after first) |
|---|---|---|
| 1 | 169 KB | 169 KB |
| 5 | 844 KB | ~169 KB |
| 20 | 3,375 KB | ~169 KB |

**~3.1 MB wasted per returning user over 20 visits**, and 3.4 s of unavoidable download per visit on Slow 3G.

### Memory / DOM stability — 140 router navigations

| metric | before | after | delta |
|---|---|---|---|
| DOM nodes | 5,242 | 4,617 | −625 |
| Listeners | 664 | 663 | −1 |
| JS heap | 5.3 MB | 1.9 MB | −3.4 MB |

### a11y totals

| Measure | Value |
|---|---|
| axe violation nodes, 7 routes, default state | **35** (`region` 18 · `color-contrast` 13 · `landmark-one-main` 4) |
| Visible form fields with no accessible name (`/design/make`) | **13** |
| Hidden (dormant mobile chrome) fields with no accessible name | 26 |
| `<label for>` associations in the entire file | **2** |
| Theme accents failing AA for white text | **12 of 13** (8 fail AA-large) |
| State paths focusable / labelled (all 4 maps) | **0 / 51** |
| Colour swatches focusable / labelled | **0 / 24** |
| CSS `@media (prefers-reduced-motion)` blocks | **0** |
| `aria-live` regions carrying gameplay or editor feedback | **0** (5 exist, all share/import status) |
| Routes with a `<main>` landmark | 3 of 7 |
| `<noscript>` blocks | **0** |

---

## Ideas

**Does the single-file, no-build architecture now cost more than it saves? Yes — but the fix is a build step, not a rewrite.**

The original bet paid off when this was a 3,000-line map editor: one file, no toolchain, push to deploy, and any change is a `grep` away. At 15,819 lines and 8 routes the bet has flipped, and the audit can price the change precisely:

- **677 KB of 971 KB of JavaScript parsed at boot never runs** (30.3 % used). There is no mechanism to fix this without splitting, because there is nothing to split *with*.
- **Every route ships every other route's markup and dependencies** — the pricing page render-blocks on a confetti library.
- **The cache story is unfixable as-is.** Because HTML and code are the same artifact, any change to any line invalidates all 169 KB. Content-hashed assets are impossible without a build, which is why `/` ended up on `no-store` — a reasonable response to an unsolvable problem.
- **SEO has a hard ceiling.** With no build and no server render, there is no seam to inject per-route head tags into, which is the root cause of the P1 canonical finding.
- **The a11y scanner blind spot is a symptom too:** everything is in the DOM at once, `display:none`, so tools that inspect rendered output see a fraction of the app.

None of that requires abandoning vanilla JS or the push-to-deploy model. **esbuild with a ~20-line config** would give code-splitting, content-hashed `immutable` assets, and a real cache story while keeping every existing line of code. That is the single highest-leverage change available and it is roughly a day of work.

Seven more, roughly in order of value per hour:

1. **Build the shared `onStateTap` dispatcher the original spec called for — keyboard-first this time.** `CLAUDE.md` records that Phase 1 skipped it, and the result is four independently-built SVG maps (editor, arcade, draft, hub) that each independently forgot `tabindex`, `role`, `aria-label` and `keydown`. One `buildStateMap({ onActivate, label })` factory fixes the P0 finding in all four places at once and stops the fifth map from repeating it.

2. **Add a text mirror of the map.** A visually-hidden list or `<table>` of "state → colour → legend label", built from state the app already holds, simultaneously: gives screen-reader users the content, makes the data copy-pasteable, gives crawlers something real to index on `/design/make`, and hands you a CSV export for free. Probably the highest ratio of user value to effort in this report.

3. **Prerender the head at the edge.** A Vercel middleware injecting per-route `<title>`/`description`/`canonical`/`og:*` into the shell fixes the canonical collapse, the crawler invisibility and the identical-`og:image` finding in one change. The router's `meta()` functions are already the source of truth — lift them into a module both the client and the middleware import so they cannot drift.

4. **Make a11y a smoke assertion, not a review checklist.** `scripts/smoke.mjs` already boots every mode and asserts zero console errors — the natural home for "every visible input/select/textarea has an accessible name", "the state map exposes ≥51 focusable, labelled targets", and an axe run **with the panels opened**. Every critical failure in this report survived because the shallow check looked clean.

5. **Introduce paired colour tokens (`--accent` / `--on-accent`) before theme 17.** Sixteen themes fail contrast because a single rule assumed every accent would be dark. A paired token plus a build-time assertion over the theme table turns "12 of 13 fail" into "a test that fails on the PR that introduces one".

6. **`defer` the six CDN tags today, lazy-load three of them this month.** `defer` is six characters × six tags and removes the render-blocking penalty immediately. Then load `supabase-js` on first auth interaction (−207 KB), `canvas-confetti` at the games routes, and `html2canvas` at first export (−204 KB more). That is 411 KB off the default boot path with no architectural change.

7. **Delete the dormant legacy mobile chrome.** Both `CLAUDE.md` and `HANDOVER.md` already mark it safe to remove. It is 34 KB of Block-1 JS (26.2 % used) plus a mobile markup tree parsed on every route, and it contributes **26 unlabelled form fields** to the latent a11y backlog. Removing it shrinks the payload, the DOM and the backlog at once.

**Suggested sequence.** Week 1, ship the cheap high-impact set: `defer` on six tags, `no-store` → `no-cache`, `robots.txt` + `sitemap.xml`, delete the hardcoded `<link rel="canonical">`, add `<noscript>`, the reduced-motion CSS block, and the 13 `aria-label`s. That is a day's work and closes 2 P1s and most of the P2/P3 tail. Week 2, the P0: the shared keyboard-capable map factory plus `aria-live` on the game prompt and stats bar. Then the build step, and let it unlock the cache and SEO work behind it.
