# Tappymaps — Code Health, Architecture & Client-Side Security Audit
_Target: `/home/user/tappymaps/index.html` (15,855 lines / 742 KB, snapshot taken mid-edit — see note in §6) + `/home/user/tappymaps/api/*`_
_Method: static AST analysis (espree), eslint@10 on both extracted `<script>` blocks, and live Playwright reproduction against the local dev server._

## Verdict

**19 findings: 0 P0, 2 P1, 7 P2, 4 P3, 6 INFO.** No proven remotely-triggerable XSS, no prototype pollution, no app-bricking input. That is a better security result than the brief anticipated, and it is not luck — `sanitizeColorMap`/`sanitizeLegendEntries` (index.html:11198-11215) survived 22 hostile hashes including five prototype-pollution shapes, `galleryEscape` covers every other-user field in the Gallery, and map title/subtitle/source reach the DOM only through `.textContent`. 42 hostile localStorage loads across 7 routes produced zero failures.

The two things that are actually wrong are both about **failure being invisible**. "Save to My Maps" shows a green success toast while storing nothing when the quota is blocked (PROVEN — §8, P1); and there are no security headers at all, on an app that loads six unpinned third-party scripts (§9, P1). The proven XSS (§3, P2) is localStorage-sourced and so not standalone-exploitable, but it is precisely the thing that converts any *future* one-shot execution — most plausibly a compromised `topojson-client@3` or `@supabase/supabase-js@2`, both floating and un-SRI'd — into persistent XSS that survives the CDN being fixed. Those three findings are one story, not three.

A fourth proven issue is separate and worth its own attention: `exportWorksheetPack` blanks the **live** editor state twice across a 3.4-second run and its `finally { restoreSnapshot() }` blindly overwrites anything the user did meanwhile — a simulated tap at t=1225 ms was destroyed (§10, P2). It is the one place where the codebase mutates shared state across awaits without guarding input.

**The historical TDZ bug class is closed.** Three independent AST passes (top-level, interprocedural, scope-recursive), all validated against a positive fixture, found **zero** hits in either block. The lazy-accessor discipline is holding. But nothing enforces it: `npm run validate` is parse-only and `npm run smoke` is deliberately not in CI, so the app's most consequential failure mode is guarded by human memory alone.

**Does single-file no-build still serve this project?** Yes, with two named exceptions. The evidence for keeping it is real: 991 functions in 9,509 lines with max nesting depth 5, no dependency graph to reason about, instant deploys, and — the strongest argument — the Phase-1 cutover moved live DOM nodes between layouts and kept every listener attached, which is a trick a component framework would have made *harder*, not easier. The file is not incoherent; it is organised, heavily commented, and the risky parts (`captureMapImage`, the autofill defeat, the games' SVG isolation) are documented at the point of use. The two exceptions are (a) inline scripts force `'unsafe-inline'` in any CSP, permanently capping how much a CSP can protect you, and (b) 4,240 lines of CSS in one `<style>` is the part with no discipline holding it together. Neither requires a bundler — extracting CSS to `/assets/app.css` and the two blocks to `/assets/app.js` would be a build-free change that unlocks a real CSP. Do that when CSP becomes a priority, not before.

**Smallest change, biggest payoff:** add the interprocedural TDZ check to `scripts/validate.mjs`. Second: a `lsSet()` wrapper that returns a boolean, which fixes both silent-data-loss findings. Third: SRI + exact pins on all six CDN scripts — a six-line diff that closes the largest realistic compromise path.

### Findings index
| Sev | Finding | § |
|---|---|---|
| P1 | "Save to My Maps" reports success while saving nothing (PROVEN) | 8 |
| P1 | No security headers whatsoever (no CSP / nosniff / Referrer-Policy / frame-ancestors) | 9 |
| P2 | Stored XSS: localStorage game scores interpolated into `innerHTML` (PROVEN) | 3 |
| P2 | Nothing prevents the TDZ bug class from returning | 1 |
| P2 | Game XP + leaderboard silently discarded on storage failure (PROVEN) | 8 |
| P2 | Dormant Mobile IIFE: 91 listeners, 52 permanently unreachable | 6 |
| P2 | Six CDN scripts, no SRI, two floating majors | 9 |
| P2 | Four SVG builders + two zoom implementations | 7 |
| P3 | `sanitizeColorMap` has no entry cap (20k keys accepted) | 4 |
| P3 | Non-string hash `title` renders as `[object Object]` | 4 |
| P2 | `exportWorksheetPack` destroys user edits during its 3.4s run (PROVEN) | 10 |
| P3 | Swallowed Supabase read makes publish-quota check fail open | 8 |
| P3 | Sign-out can be overwritten by in-flight subscription check | 10 |
| INFO | TDZ hunt clean across 3 passes | 1 |
| INFO | No real `no-undef`; no second `window._supabase` | 2 |
| INFO | Hash fuzz: 0/22 crashed, 0/5 pollution attempts landed | 4 |
| INFO | localStorage corruption: 42 hostile loads, 0 failures | 5 |
| INFO | `/api` failure on data maps handled correctly | 8 |
| INFO | 11 of 18 `require-atomic-updates` hits are benign | 10 |

---
## 1. TDZ hunt — the historical bug class is currently CLOSED

### [INFO] No remaining top-level reads of later-declared lexical bindings
- **Area:** architecture / tooling
- **Repro:** three independent AST passes over both extracted blocks:
  - `tdz.mjs` — top-level + IIFE immediate-evaluation walk (hard + soft/callback classes)
  - `tdz2.mjs` — **interprocedural**: follows every function invoked during immediate top-level evaluation, transitively (depth 6), and flags reads of `const`/`let` declared after the call site. This is the pass that would have caught the historical Arcade/GeoDraft bug, because function *bodies* are hoisted and `validate.mjs` parse-checking can never see it.
  - `tdz3.mjs` — generalized scope-aware version that recurses into nested immediately-evaluated scopes (needed for Block 1, which is one big IIFE and therefore has **zero** program-level lexical declarations for pass 1 to see).
- **Evidence:**
  ```
  block0.js (index.html:5339-14811)   HARD TDZ: 0   SOFT: 0   INTERPROCEDURAL: 0
  block1.js (index.html:15044-15817)  HARD TDZ: 0   SOFT: 0   INTERPROCEDURAL: 0
  top-level lexical bindings in block0: 97   hoisted (var/function): 324
  immediate top-level call sites: block0 52, block1 37
  ```
  Detector validated against a positive fixture (`tdzfixture.js`) that reproduces all three shapes; it correctly reported 1 hard + 1 soft + the interprocedural hit. So the zero result is a real zero, not a broken detector.
- **Location:** n/a
- **Impact:** The documented "kills the entire main block at load" failure mode is not currently present. The lazy-accessor discipline (`arcadeStateNames()`, `arcadeDuelSets()`, `draftCategories()`) is being followed.
- **Fix:** None needed — but see the next finding.

### [P2] Nothing prevents the TDZ bug class from coming back
- **Area:** tooling
- **Repro:** `npm run validate` is `vm.compileFunction` on each block — pure parse. `npm run smoke` boots routes and would catch it, but only if run, and it is explicitly *not* in CI (`.github/workflows/ci.yml` is validate-only and advisory).
- **Evidence:** `package.json` `test` = `validate && api-subscription-test`. Neither executes a single line of `index.html` JS. The CI workflow is validate-only by design ("to keep it to a few seconds").
- **Impact:** The single highest-consequence bug in this codebase's history (whole-app blank page) has **no automated guard**. It is caught only by a human remembering to run `smoke` on a machine with Playwright.
- **Fix:** Add `tdz2.mjs`-style interprocedural check to `scripts/validate.mjs` — it is ~120 lines of espree, runs in <1s, needs no browser, and would run in the existing advisory CI. That is the smallest change with the largest payoff in this report. (Script is at `<scratchpad>/work/health/tdz2.mjs`, ready to adapt.)

---

## 2. Lint sweep

### [INFO] eslint@10 baseline on both blocks
- **Evidence:**
  ```
  118  no-undef            (42 distinct names)
   75  no-unused-vars
   40  no-empty            (empty catch blocks — see §8)
   18  require-atomic-updates
    4  no-redeclare
  block0.js: 134 messages   block1.js: 121 messages
  ```
- **Triage of the 118 `no-undef`:** 116 are **cross-block references** — Block 1 (dormant Mobile IIFE) calling into Block 0's globals (`appState` ×42, `updateURL` ×8, `gateProFeature` ×6, `selectColor` ×5, `updateLegendDisplay` ×5, …). Classic scripts share one global scope, so these resolve at runtime. Not bugs, but they are the measurable coupling between the two blocks: **40 distinct Block-0 symbols are reached from Block 1**, which is exactly why the dormant IIFE cannot simply be deleted without an audit (§6).
- The remaining 2 (`File` at index.html:12077, `ClipboardItem` at index.html:12177) are legitimate browser globals absent from my audit config. **No real `no-undef` bug found.**

### [INFO] `window.X` read-never-assigned scan (the `window._supabase` shape) — clean
- **Repro:** `<scratchpad>/work/health/winprops.mjs` — AST-walks both blocks, partitions every `window.<ident>` member expression into read vs. assignment target, subtracts a browser-builtin allowlist.
- **Evidence:** 5 survivors, all explained:
  ```
  window.AudioContext / window.webkitAudioContext  index.html:7337  — browser builtin (feature detect)
  window.dispatchEvent                             index.html:10228 — browser builtin
  window.chroma                                    index.html:13038, 13496 — set by the chroma-js CDN UMD bundle
  window.supabase                                  index.html:11280 (×2)   — set by the @supabase/supabase-js CDN UMD bundle
  ```
  And **0** `window.X = …` assignments that are never read back — i.e. no orphaned export surface.
- **Impact:** The specific class of bug that broke the signed-in export path has no other instance. Note the residual fragility: `window.chroma` and `window.supabase` are *only* defined if their CDN script loaded (see §9 — no SRI, floating major version).
- **Fix:** none required; keep `winprops.mjs` as a periodic check.

---
## 3. XSS surface

**Sink inventory:** 64 `innerHTML` assignments, **0** `outerHTML`, **0** `insertAdjacentHTML`, **0** `document.write`, **0** `eval`, **0** `new Function`. Two escapers exist: `escapeHTML()` (index.html:11615, textContent round-trip — does *not* escape `"`, so it is safe for text nodes only) and `galleryEscape()` (index.html:6464, regex-based, **does** escape `"` and is therefore attribute-safe).

**What is escaped correctly (good news, stated for the record):**
- The whole **Gallery** surface — `galleryRenderMineCards` (index.html:6505) and `galleryRenderPublic` (index.html:6753) run every field of *other users'* maps (`m.title`, `m.subtitle`, `m.hash`, `m.id`, thumb URL, edit href) through `galleryEscape`, including in `alt="…"` / `href="…"` / `data-publish="…"` attribute positions. No injection found. Cloud gallery titles come back from Supabase and are handled.
- The on-map **legend** is built with `document.createElement` + `textContent`; only the legend *title* goes through `innerHTML`, and it is `escapeHTML`-wrapped (index.html:10789).
- **Map title / subtitle / source** are written exclusively with `.textContent` (index.html:5984, 6994, 7019, 9993-9994, 10961, 11239-11248). The `<img src=x onerror>`-in-title attack does **not** fire.
- CSV import status (index.html:13003-13024) and the leaderboard **name** field (index.html:8539) are escaped.

### [P2 — PROVEN] Stored XSS: localStorage game scores are interpolated into `innerHTML` unescaped
- **Area:** security
- **Repro:** (script: `<scratchpad>/work/health/xss2.mjs`, run against the live dev server)
  ```js
  const PAY = '<img src=x onerror="window.__pwn=(window.__pwn||0)+1">';
  localStorage.setItem('tappymaps_arcade_find-state_best', JSON.stringify({score: PAY, medal:'gold'}));
  localStorage.setItem('tappymaps_leaderboard', JSON.stringify({'find-state':[{name:'AAA',medal:'gold',score:PAY}]}));
  // then load /games/arcade
  ```
- **Evidence:** payload executes on both surfaces, no console errors:
  ```
  VECTOR A (arcade hub tiles)  -> window.__pwn = 6     (one per tile/mode button)
  VECTOR B (leaderboard panel) -> window.__pwn = 12
  rendered: <span class="lb-score"><img src="x" onerror="window.__pwn=(window.__pwn||0)+1"></span>
  ```
- **Location:**
  - `index.html:8313` — `const label = game.modes[m].label + (best ? ' · ' + medalFor(best) + best.score : ' →')` then `div.innerHTML = …`
  - `index.html:8332` — `'<span class="arcade-tile-best">' + best.score + '</span>'`
  - `index.html:8542` — `'<span class="lb-score">' + e.score + '</span>'` — note `escapeHTML(e.name)` is on the **immediately preceding line**; the author escaped the string field and assumed the score field was numeric. It is `JSON.parse`'d from localStorage, so it is whatever the storage says.
  - Same shape in `progRenderChip` (index.html:8511) for `s.xp`/`s.level` and `arcadeRenderDaily` (index.html:8441) for the streak count.
- **Impact:** Not directly remote-triggerable (localStorage is same-origin), so this is not a standalone P0. Its real cost is as an **amplifier**: any one-shot script execution on `tappymaps.com` (a future gallery/embed bug, a compromised CDN — see §9) converts into *persistent* XSS that re-fires on every visit to `/games/arcade`, surviving reload and outliving the original bug. It also makes the storage layer a security boundary that no current code treats as one.
- **Fix:** `escapeHTML(String(e.score))` at each site, or better: coerce on read — make `arcadeGetBest`/`progGetBoard` validate shape (`typeof score === 'number' && isFinite(score)`) and drop anything else. Same-class fix should cover all 64 sinks at once via a small `h()` tagged-template helper.

---

## 4. Hash deserialization (`loadStateFromURL`) — much stronger than expected

### [INFO] 22-case fuzz of `/design/make#<payload>`: no crash, no pollution, no bricking
- **Repro:** `<scratchpad>/work/health/hash-ls.mjs` — loads `/design/make#<case>` in a fresh context per case and asserts the map still renders (51 paths), `({}).polluted`/`[].polluted` are undefined, and the Create rail is visible.
- **Evidence:** all 22 cases render 51 state paths and leave the rail visible. **Prototype pollution: 0/5 attempts landed.**
  ```
  __proto__ in colors        -> {} unpolluted   (sanitizeColorMap writes onto a fresh {}; a string value is a no-op for the __proto__ setter, an object value fails isSafeColor)
  __proto__ str color        -> unpolluted
  constructor.prototype key  -> unpolluted      (never read)
  __proto__ inside a legend entry -> unpolluted (sanitizeLegendEntries rebuilds each entry as a 2-key literal)
  state key = "__proto__"    -> unpolluted
  non-base64 / base64-of-non-JSON -> caught by decodeStateFromURL's try/catch, app loads clean
  JSON scalars (42 / null / [1,2,3]) / wrong shape -> ignored, defaults applied
  deep nesting (2000 levels)  -> no stack overflow
  color "red;background:url(javascript:1)" -> rejected by isSafeColor regex
  ```
- **Impact:** Positive finding. `isSafeColor` (`/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,30})$/`) + the rebuild-don't-merge pattern in both sanitizers is genuinely the right design, and it holds under attack. Share / embed / gallery all route through it.

### [P3] `sanitizeColorMap` has no entry cap while `sanitizeLegendEntries` does
- **Area:** architecture / robustness
- **Repro:** `/design/make#<base64 of {colors:{S0..S19999:'red'}}>`
- **Evidence:** `appState.stateColors` ends up with **20,000 keys** (only ~51 can ever render); `appState.legendEntries` is correctly clamped to 12 by `MAX_LEGEND_ENTRIES`. Page load 2777 ms vs 2692 ms baseline, so not a DoS — but the oversized object is then snapshotted by `saveHistory()` on every subsequent mutation (stack depth 50) and is what `saveCurrentMapToGallery` would persist.
- **Location:** index.html:11198 (`sanitizeColorMap`) vs index.html:11207 (`sanitizeLegendEntries`, which does `.slice(0, MAX_LEGEND_ENTRIES)` at the call site).
- **Impact:** Low. Memory amplification through the 50-deep history stack; junk written to My Maps.
- **Fix:** Filter keys against the known state/county name set (the app already has `fipsToState`), or cap at a few thousand entries.

### [P3] Non-string `title`/`subtitle` from the hash render literally on the map
- **Repro:** `/design/make#` + base64 of `{"colors":{},"legend":[],"title":{"a":1}}`
- **Evidence:** on-map `#mapTitle` reads `[object Object]`; an array title renders `1,2`. `state.title || 'My US Map'` (index.html:11235) has no type guard, unlike `sanitizeLegendEntries` which does `String(e.label == null ? '' : e.label)`.
- **Impact:** Cosmetic corruption only — the value reaches `.textContent`, never `innerHTML`, so it is not an XSS. It does flow into `document.title`, the OG meta, and `/api/render`.
- **Fix:** `appState.mapTitle = typeof state.title === 'string' ? state.title.slice(0, 200) : 'My US Map'` (and the same for subtitle/source/legendTitle).

---

## 5. localStorage trust

### [INFO] Corruption sweep: 42 hostile loads, zero failures
- **Repro:** `<scratchpad>/work/health/ls-probe.mjs` — writes each of 6 hostile values into **all 14** `tappymaps*` keys simultaneously, then loads 7 routes in a fresh page.
  - Keys: `tappymaps_my_maps`, `tappymaps-theme`, `tappymaps_arcade_*_best`, `tappymaps_anon_export`, `tappymaps_xp`, `tappymaps_leaderboard`, `tappymaps_daily`, `tappymaps_visited`, `tappymaps_events`, `tappymaps_player_name`, `tappymaps_classroom_code`, `tappymaps_draft_diff`, `tappymaps_sfx_muted`, `tappymaps_terr_seen`
  - Values: `{not json`, `null`, `12345`, `[1,2,3]`, a 200 KB string, `{"__proto__":{"polluted":"YES"}}`
  - Routes: `/`, `/design/make`, `/design/gallery/mine`, `/games/arcade`, `/games/draft`, `/embed`, `/pricing`
- **Evidence:** **0 broken loads.** No page errors, no console errors, every route rendered content. Every read site is wrapped in `try { JSON.parse(...) } catch (_) { return <default> }` (e.g. `arcadeGetBest` index.html:8281, `progAllBoards` index.html:8493, `progPlayerName` index.html:8490).
- **Impact:** Positive finding — the app degrades rather than bricks. This is the single most consistently-applied defensive pattern in the file.
- **Caveat:** "does not crash" is not "is trusted" — the same values that fail to brick the app *do* execute as HTML (§3). Robustness and safety were solved separately here, and only the first one was solved everywhere.

---

> **Note on line numbers:** `index.html` changed during this audit (another session is editing it — Block 0 grew 467,223 → 468,903 chars, file 15,819 → 15,855 lines). All line numbers below are against the **final** state, snapshotted at `<scratchpad>/work/health/snapshot.html`. Block 1 stayed at exactly **34,471 chars** — the tracked baseline is intact. All TDZ and lint results were re-run against the updated file and are unchanged.

## 6. Dead / dormant code

### [P2] The dormant Mobile-UX IIFE attaches 91 live listeners, 52 of them to permanently unreachable elements
- **Area:** dead code
- **Repro:** `<scratchpad>/work/health/dormant2.mjs` — patches `EventTarget.prototype.addEventListener` via `addInitScript` (so it wraps *before* any app script runs), records the max `index.html` line number in each registration's stack, and attributes it to Block 0 (<15080) or Block 1 (15080-15853). Then hit-tests every Block-1 listener target.
- **Evidence (route `/design/make`, 1440×900):**
  ```
  listeners total                661
    from Block 0 (main app)      570
    from Block 1 (Mobile IIFE)    91
  Block-1 listeners whose target is display:none or 0×0   52   (57%)
  Block-1 listeners whose target id does not exist         0
  ```
  Runtime proof the handlers can never fire — `.mobile-icon-bar` is hidden at *all* viewport sizes by `body[data-mode] .mobile-* { display:none !important }`:
  ```
  mobile-icon-bar: display=none, getBoundingClientRect() = {w:0, h:0}
  document.elementFromPoint(center) -> does NOT hit it (returns .onboarding-overlay)
  ```
  The 52 dead targets are the `mobile*`-prefixed controls: `mobileTitleInput`, `mobileSourceInput`, `mobileMultiSelect`, `mobileBrowseTemplates`, `mobileToggleLabels/NorthArrow/ScaleBar`, `mobileThemeToggle`, `mobileHelp`, `mobileColorPicker`, `mobileHexInput`, `mobileAddColor`, `mobileDefaultPalette`, `mobileColorblindPalette`, `mobileMorePalettes`, `mobileAutoLegend`, `mobileAddLegend`, `mobileSelectAll`, `mobileFillEmpty`, `mobileInvert`, `mobileRandom`, `mobileTitleColor`, `mobileBgColor`, `mobileUndo/Redo{Tap,Color,Share}`, `mobileClearAll`, `mobileExportPNG`, `mobileExportSVG`, `mobileCopyClipboard`, `mobileShareLink`, `mobileSaveConfig`, `mobileLoadConfig`, plus `iconBarTap/Color/Share/Data/Account` and `mobilePanelBackdrop`.
  The IIFE has **no viewport guard** — `const isMobile = () => window.innerWidth <= 900` exists but there is no early return, so all of this runs on every page load on every device.
- **DOM weight:** the hidden mobile chrome is **602 of 2,139 DOM nodes (28%)**; the legacy `.container` itself is down to 17 descendants (the Phase-1 cutover already moved the real content out).
- **Impact:** Modest but real — ~91 listener registrations and 602 parked DOM nodes on every load, and a permanent source of confusion (a maintainer reading `wire('mobileExportPNG', 'click', exportPNG)` has no way to tell from the source that it is dead).
- **Deletion risk:** **Non-trivial, and this is the important part.** Block 1 reaches **40 distinct Block-0 symbols** (`appState` ×42 references, `updateURL`, `gateProFeature`, `selectColor`, `updateLegendDisplay`, `saveHistory`, `updateStatsBar`, `updateLegendPosition`, `exportPNG`, `undo`/`redo`, …). Critically, it is **not purely dead**: it also *publishes* `window.createMapZoomIn/Out/Reset` (index.html:15840-15850), which the live Create rail calls at index.html:5900-5902. So the block cannot be deleted wholesale — the zoom API has to be lifted out first.
- **Fix:** Two steps. (1) Lift the ~40-line map-zoom section out of the IIFE into Block 0 next to `makeMapZoom` (they are near-duplicates already — see §7). (2) Then delete the remaining IIFE and the `.mobile-*` markup together, in one commit, verified with `npm run smoke`. Do **not** delete the markup and IIFE separately — `wire()` no-ops on missing elements, so a half-deletion is silent.

---

## 7. Duplication

### [P2] Four independent US-map SVG builders + two zoom implementations
- **Area:** architecture
- **Evidence — SVG builders (all consume the same cached `us-atlas` TopoJSON):**
  | builder | lines | location | target |
  |---|---|---|---|
  | `renderStatesFromTopology` | 136 | index.html:9827 | editor `#statesGroup` (export-critical) |
  | `loadCountyView` | 183 | index.html:13759 | editor, county mode |
  | `arcadeBuildMap` | 34 | index.html:7540 | `#arcadeStatesGroup` |
  | `draftBuildMap` | 32 | index.html:8772 | `#draftStatesGroup` |
  | `draftTerrBuildMap` | 32 | index.html:9264 | Territory Draft |
  | `buildMapSVG` | 81 | `api/render.js:80` | server-side poster SVG (Node) |
  Six code paths, ~500 lines, that all do *feature-extract → path-d → append*. Three of them (`arcadeBuildMap`, `draftBuildMap`, `draftTerrBuildMap`) are near-identical: all three contain the byte-identical line
  `const name = fipsToState[fips] || feature.properties?.name || ('Unknown ' + feature.id);`
  (index.html:7559, 8789, 9281).
- **Evidence — zoom:** `makeMapZoom(wrapId, svgId)` (116 lines, index.html:7595) is a proper factory used by Arcade and GeoDraft. The editor map does **not** use it — it uses a separate pinch/pan/`resetZoom` implementation inside the Mobile IIFE (index.html:15779-15853) that is only reachable through the three `window.createMapZoom*` globals. Two implementations of the same gesture set.
- **Evidence — lookup tables:** `fipsToState` (index.html:9811) and `appState.stateAbbreviations` (index.html:5390) are two separate 50-entry state tables; `nonColorable` is a third. `api/render.js` carries its own copy server-side.
- **Impact:** This is the *deliberate* isolation decision from CLAUDE.md ("Arcade renders its OWN independent SVG… touches none of `#mapContainer` / `captureMapImage`") and that call was correct — protecting the export path from games code is worth real duplication. But the decision was "don't share the *editor's* map", and it has been over-applied into "don't share anything": the three **games** builders have no reason not to share, and neither do the state tables.
- **Fix (smallest useful shape):** one `buildStatesSVG(topology, { target, onTap, idPrefix })` helper serving Arcade + both Draft modes (removes ~65 duplicated lines and the triple-maintained name-resolution line), and one exported `STATES` table that `fipsToState` / `stateAbbreviations` / `nonColorable` are derived from. Leave `renderStatesFromTopology`, `loadCountyView` and `captureMapImage` alone — the isolation there is load-bearing.

---

## 8. Error handling

40 empty blocks (`no-empty`), almost all `catch (_) {}`. **Most are defensible and well-commented** — they guard `localStorage`/`sessionStorage` access (Safari private mode, blocked third-party storage in the `/embed` iframe) and best-effort re-layout calls (`requestAnimationFrame(() => { try { updateLegendPosition(); } catch (_) {} })`). I am not flagging those. Three swallows do reach the user as nothing:

### [P1 — PROVEN] "Save to My Maps" reports **success** while saving nothing
- **Area:** error handling
- **Repro:** `<scratchpad>/work/health/errproof2.mjs` — colour two states, make `Storage.prototype.setItem` throw `QuotaExceededError` (exactly what a full quota, Safari private browsing, or storage-blocked iframe does), then call `saveCurrentMapToGallery()`.
- **Evidence:**
  ```
  {"coloured":2, "before":0, "after":0,
   "toast":"Saved on this device — sign in with Pro to sync across devices",
   "cls":"confirmation-message show success", "threw":null}
  /design/gallery/mine then renders the EMPTY state.
  ```
  A green success toast, zero maps stored, no error anywhere.
- **Location:** index.html:6125 and index.html:6129 — `try { localStorage.setItem(GALLERY_MINE_KEY, JSON.stringify(mine)); } catch (_) {}`. The caller shows its toast unconditionally, because the writer cannot report failure.
- **Impact:** Silent data loss on the app's only "save my work" affordance, with positive confirmation that it worked. Worst on iOS Safari, which is the primary target platform and the one most likely to deny storage.
- **Fix:** Make `gallerySaveMine` return a boolean and branch the toast: `showMessage(ok ? 'Saved on this device…' : 'Could not save — device storage is full or blocked', ok ? 'success' : 'error')`.

### [P2 — PROVEN] Game progress (XP + leaderboard) is silently discarded on a storage failure
- **Repro:** same harness; seed `tappymaps_xp='1000'` and a leaderboard, block `setItem`, then `progAddXp(500)` + `progSubmitScore('find-state','classic',999,'gold','ME')`.
- **Evidence:** `{"threw":null, "toastAfter":<unchanged>, "xp":"1000", "board":"{\"find-state\":[{\"name\":\"OLD\",\"score\":1,...}]}"}` — a 999-point gold run and 500 XP both vanish; the completion screen still congratulates the player.
- **Location:** index.html:8218 (`arcadeComplete` best-score write), index.html:8503 (`progSubmitScore`), plus `progAddXp`.
- **Impact:** Lower stakes than the map save, but it is the retention mechanic. Same root cause.
- **Fix:** One shared `lsSet(key, val) -> boolean` wrapper; callers that show confirmation must check it.

### [P3] Swallowed Supabase read makes the publish-quota check fail *open*
- **Location:** index.html:6346 — `try { …supabase.from(...).maybeSingle(); alreadyPublic = !!(data && data.is_public); } catch (_) {}`
- **Evidence (static):** on any throw, `alreadyPublic` keeps its initial `false`, so the code proceeds to `galleryIncrementPublishCount()` — i.e. a transient network error causes an already-public map to be counted against the user's publish quota a second time.
- **Fix:** distinguish "confirmed not public" from "could not determine"; on the latter, skip the increment.

### [INFO] `/api` failure on the data-maps path IS handled correctly
- **Repro:** `page.route('**/api/**', r => r.abort())`, then `executeDataMapLoad(...)`.
- **Evidence:** `{"toastAfter":"Failed to load data: Failed to fetch","visible":"confirmation-message error","rejections":[]}` — no unhandled rejection, correct error toast. Stated for contrast: the pattern the codebase needs already exists, it just is not applied to the storage writes.

---

## 9. Headers / supply chain

### [P1] No security headers at all
- **Area:** security
- **Evidence:** `vercel.json` `headers` contains exactly two entries, both `Cache-Control` (for `/index.html` and `/`). A repo-wide grep for `Content-Security-Policy|X-Content-Type-Options|Referrer-Policy|Permissions-Policy|X-Frame-Options|frame-ancestors|Strict-Transport` returns **zero** hits outside `node_modules`. The API handlers set only CORS, `Cache-Control` and `Content-Type`.
- **Missing, in payoff order:**
  1. **`Content-Security-Policy`** — the big one. Even a permissive starter (`script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; object-src 'none'; base-uri 'none'`) would have blocked the §3 payload from doing anything useful and would defang a compromised CDN. `'unsafe-inline'` is unavoidable while the app is two inline blocks + inline `onclick` handlers (index.html:11780) — that is a real cost of the single-file architecture, and it is worth naming.
  2. **`X-Content-Type-Options: nosniff`** — free, no downside.
  3. **`Referrer-Policy: strict-origin-when-cross-origin`** — matters here because **map state lives in the URL** and titles/subtitles are user text.
  4. **`Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()`** — free.
  5. **`frame-ancestors`** — this is where the tension is. `/embed` exists *to be* iframed, so a blanket `X-Frame-Options: DENY` or `frame-ancestors 'none'` would break the Phase-3 distribution feature. Resolve it per-path in `vercel.json`: `frame-ancestors 'none'` on `/`, `/design/*`, `/pricing`; `frame-ancestors *` on `/embed` only. Today *every* route is framable, so the editor (including the signed-in account UI) can be clickjacked.

### [P2] Six CDN scripts, zero SRI, two on floating major versions
- **Evidence:**
  ```
  index.html:25    chroma-js@2.4.2                       pinned,   no SRI
  index.html:26    dom-to-image-more@3.4.5               pinned,   no SRI   <-- primary export renderer
  index.html:27    canvas-confetti@1.9.3                 pinned,   no SRI
  index.html:5335  topojson-client@3                     FLOATING, no SRI   <-- every map's geometry
  index.html:5336  html2canvas@1.4.1 (cdnjs)             pinned,   no SRI   <-- export fallback
  index.html:5337  @supabase/supabase-js@2               FLOATING, no SRI   <-- auth + gallery + JWTs
  ```
  Zero `integrity=` and zero `crossorigin=` attributes in the file.
- **Impact:** Six third parties have script execution on `tappymaps.com`, with no CSP to contain them (§9) and no SRI to detect tampering. The two floating ones (`topojson-client@3`, `@supabase/supabase-js@2`) mean jsDelivr can serve *new code you have never seen* on any page load — and `@supabase/supabase-js` is the library that holds session JWTs. Combined with §3, a single bad CDN response yields **persistent** XSS that survives the CDN being fixed. This is the largest realistic compromise path in the app.
  Confirmed dependency: `window.chroma` (index.html:13038, 13496) and `window.supabase` (index.html:11280) are read with no fallback — if a CDN 404s, those paths throw.
- **Fix:** (a) pin `topojson-client@3.1.0` and `@supabase/supabase-js@2.43.4` to exact versions — both are already exact in `package.json`, so the client is *less* pinned than the server; (b) add `integrity="sha384-…"` + `crossorigin="anonymous"` to all six; (c) longer term, self-host these six files under `/assets/` — it removes all six third parties, is compatible with no-build (they are static files), and lets CSP drop the CDN origins entirely.

---

## 10. Async state races (`require-atomic-updates`)

18 hits. Five are cosmetic (`btn.disabled` after an await). Thirteen assign to shared state across an await boundary; two of those are real.

### [P2 — PROVEN] `exportWorksheetPack` wipes the live map for 3.4 s and destroys any edit made in that window
- **Area:** architecture / data loss
- **Repro:** `<scratchpad>/work/health/race.mjs` — colour three states, set `classroomUnlocked`, call `exportWorksheetPack()` **without awaiting**, poll `appState.stateColors` every 120 ms and inject a user edit (`stateColors['Utah']`) the moment the map goes blank.
- **Evidence:**
  ```
  before: 3 states   after: 3 states   totalMs: 3391
  minSeen: 0            <- appState.stateColors emptied to {} on the LIVE editor
  approxBlankWindowMs: ~240ms x 2 separate blanking phases within the 3.4s run
  tapAt: 1225ms         <- simulated user edit during the blank window
  hasUtahAfter: false   <- the edit was DESTROYED by restoreSnapshot()
  ```
  Timeline sample: `n=3` … `t=1945ms n=0` … `t=2202ms n=1` … `t=3236ms n=0` … then restore to 3.
- **Location:** index.html:6955-7053. The function mutates `appState.stateColors` / `legendEntries` / `mapSubtitle` in place (index.html:7015-7017, 7030-7034) between three `await captureMapImage()` calls and two `await classroomSleep(450)`, then a `finally { restoreSnapshot() }` (index.html:7050) overwrites whatever is there with the snapshot taken at t=0.
- **Impact:** For 3.4 seconds the Classroom user sees their map blank itself and rebuild twice, and **any tap in that window is silently reverted**. Nothing disables input. `restoreSnapshot()` is a blind overwrite, not a merge, so it cannot tell a stale value from a new user edit.
- **Fix:** Set a `appState.exportInProgress` flag, have `onStateClick` early-return while it is set, and show a blocking "Building worksheet pack…" overlay. (The `showMessage('Building worksheet pack (3 PNGs)…')` toast at index.html:7007 is informational only — it does not block.) Longer term this function should render off-screen clones rather than mutating the live editor state, which is the same isolation principle Arcade and GeoDraft already follow.

### [P3] Sign-out can be overwritten by an in-flight subscription check, leaving Pro unlocked
- **Area:** security (client-side gate)
- **Evidence (static):** `initializeAuth`'s `onAuthStateChange` handler (index.html:11410) does `await checkSubscriptionStatus(session.access_token)` on sign-in, and on sign-out synchronously sets `appState.proUnlocked = false`. `checkSubscriptionStatus` assigns `appState.proUnlocked / classroomUnlocked / subscription` *after* its own awaits (index.html:11430-11432, flagged by `require-atomic-updates`). If a SIGNED_OUT event lands while a sign-in's `verify-subscription` request is still in flight, the late response reassigns `proUnlocked = true` after sign-out already cleared it.
- **Impact:** Client-side Pro gate only. `CLAUDE.md` is explicit that this is not a security boundary and `verify-subscription` is authoritative server-side, so the impact is a wrong UI state (Pro features appear enabled for a signed-out user until reload), not free Pro.
- **Fix:** Capture a monotonic request id / the user id before the await and drop the result if `appState.currentUser` changed while it was in flight.

### [INFO] The other 11 are benign
`countyTopology` reassignment after fetch (index.html:13764, worst case a duplicate fetch), `dataCache[stat.id]` (index.html:7770, idempotent), and `list.innerHTML` in the Draft reveal (index.html:9232, 9242).

---

## Metrics

| Metric | Value |
|---|---|
| `index.html` total | **15,855 lines / 742 KB** (grew 15,819 → 15,855 *during this audit*) |
| — CSS (`<style>`) | 4,240 lines (27%) |
| — Block 0 (main app JS) | 9,509 lines / 468,903 chars, index.html:5339-14847 |
| — Block 1 (Mobile IIFE) | 774 lines / **34,471 chars** — baseline intact, index.html:15080-15853 |
| — HTML markup | ~1,300 lines |
| Documented → actual line growth | 13,600 (CLAUDE.md / HANDOVER.md) → 15,855 = **+16.6%**, and both docs are now stale |
| Functions, Block 0 | **991** (350 named, 641 anonymous), max nesting depth 5 |
| Functions, Block 1 | 121 (18 named, 103 anonymous) |
| Longest function | **`attachEventListeners` — 288 lines** (index.html:13999) |
| Runner-up | `captureMapImage` — 240 lines (index.html:11819) |
| Functions > 100 lines | 8 (Block 0) |
| Top-level statements, Block 0 | 451 |
| Top-level lexical bindings / hoisted | 98 / 324 |
| Router modes | 9 (`Hub, Create, Gallery, Arcade, Draft, Embed, Marketing, ClassJoin, ComingSoon`) |
| DOM nodes on `/design/make` | 2,139 — of which **602 (28%)** are the hidden mobile chrome |
| Event listeners on `/design/make` | 661 — 570 Block 0, **91 Block 1 (52 on unreachable elements)** |
| `innerHTML` sinks | 64 · `eval`/`new Function`/`document.write`/`insertAdjacentHTML`: **0** |
| eslint (audit config) | 118 no-undef (116 = cross-block, 2 = config gaps, **0 real**), 75 no-unused-vars, 40 no-empty, 18 require-atomic-updates, 4 no-redeclare |
| Serverless code | 1,103 lines across 7 handlers |
| Test/tooling code | 1,278 lines across 10 scripts |
| Third-party scripts | 6, **0 with SRI**, 2 on floating majors |
| Security headers | **0** |

---

## Ideas

1. **Fold `tdz2.mjs` into `scripts/validate.mjs`.** ~120 lines of espree, no browser, sub-second, runs in the existing advisory CI. It closes the one bug class with a documented history of taking the whole app down and that parse-checking provably cannot see. Highest value-per-line change in this report.
2. **One `lsSet(key, value) -> boolean` helper.** Replaces ~20 `try { localStorage.setItem(...) } catch (_) {}` sites and makes "did the save work?" answerable. Fixes the P1 and the P2 above together.
3. **One `h` tagged template for HTML building.** `` el.innerHTML = h`<span>${score}</span>` `` escaping every interpolation by default turns 64 hand-audited sinks into 64 safe-by-construction ones, and would have caught the `escapeHTML(e.name)` / raw `e.score` asymmetry at index.html:8542 automatically.
4. **Self-host the six CDN files under `/assets/`.** Compatible with no-build (they are static files), removes six third parties, and makes a strict CSP achievable.
5. **Per-path `frame-ancestors`.** `'none'` everywhere, `*` on `/embed`. Keeps the distribution feature and stops the editor being clickjackable.
6. **Guard input during multi-await exports.** An `appState.exportInProgress` flag checked in `onStateClick`, plus a blocking overlay — three lines that close the §10 data-loss race. Better still, render worksheet variants from an off-screen clone instead of mutating the live editor.
7. **Split `attachEventListeners` (288 lines, index.html:13999).** It is the single hardest function to review and the natural home for wiring bugs.
8. **Extract the map-zoom section out of the Mobile IIFE**, then delete the IIFE and `.mobile-*` markup in one commit. Removes 774 lines, 91 listeners and 602 DOM nodes. Do it as one commit, not two — `wire()` silently no-ops on missing elements, so a half-done deletion leaves no trace.
9. **Share one `buildStatesSVG()` across Arcade + both Draft modes.** Keep the editor's `renderStatesFromTopology` and `captureMapImage` isolated — that separation is load-bearing and should stay.
10. **Refresh the docs.** `CLAUDE.md` and `HANDOVER.md` both say "~13,600 lines"; it is 15,855. The Block-1 baseline number in `CLAUDE.md` (34,471) is still exactly right and remains a genuinely good idea worth keeping.
11. **A one-line `state.title` type guard** removes the whole class of "non-string from the hash renders as `[object Object]`".
