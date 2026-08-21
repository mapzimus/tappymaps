# Create Editor Audit — `/design/make`

*Audited 2026-08-21 against `/home/user/tappymaps/index.html` (15,809 lines) with Playwright against the
local dev server `127.0.0.1:8123` (production-style SPA rewrites, vendored CDN libs, deterministic
`/api/*` stubs). Every finding below was reproduced in a live browser unless explicitly marked
**UNVERIFIED (static analysis)**. Screenshots live in the audit scratchpad as `shots/<name>.png`.*

## Summary

**21 findings: 3 × P0 · 5 × P1 · 9 × P2 · 3 × P3.** Full verdict at the end of the document.

| # | Severity | Finding |
|---|---|---|
| 1 | **P0** | `encodeStateToURL()` throws on any non-Latin-1 char — Share / Embed / hash die silently |
| 2 | **P0** | …and every Data Map legend label contains an en dash, so Pro maps can never be shared or saved |
| 3 | **P0** | County View: one Undo destroys the county map, undoes nothing, leaves a broken hybrid state |
| 4 | P1 | Share hash drops legend position, title/bg colour, labels, map furniture, county colours |
| 5 | P1 | County colours are in no save path at all — reload and they are gone |
| 6 | P1 | Top-bar title edits never reach the URL hash — reload silently reverts the title |
| 7 | P1 | A long title collapses the map SVG to **zero height** — the map vanishes |
| 8 | P1 | North arrow + scale bar hard-coded `#ffffff` — invisible on every light theme, baked into exports |
| 9 | P1 | `Ctrl+Z` in a text field undoes a *map* action **and** wipes the field |
| 10-18 | P2 | Stale-until-blur title/legend commits, appearance edits invisible to Undo, unlabelled rail buttons, 1s-debounce data loss, top-bar Undo/Redo never disable, zoom button over the stats bar, low unpainted-state contrast |
| 19-21 | P3 | Per-click undo granularity, docs drift, data-map stub limitation |

---

### [P0] `encodeStateToURL()` throws on any non-Latin-1 character — emoji or an en-dash silently kills Share / Embed / hash persistence

- **Area:** `/design/make` → URL hash state, Share link, Embed code, Save to My Maps
- **Repro:**
  1. Load `/design/make`.
  2. In the console: `appState.mapTitle = 'My 🗺 Map'; encodeStateToURL()`.
  3. Same with a legend label containing an en-dash: `appState.legendEntries=[{color:'#ff0000',label:'500,000 – 1,851,547'}]; encodeStateToURL()`.
- **Evidence** (live, `work/create-editor/v1.mjs`):
  ```
  enDash: "THROWS: InvalidCharacterError: Failed to execute 'btoa' on 'Window':
           The string to be encoded contains characters outside of the Latin1 range."
  emoji:  "THROWS: InvalidCharacterError: ..."
  accent ("Café"): ok   ← Latin-1 accents survive; anything above U+00FF does not
  ```
- **Location:** `index.html:11144-11153` (`encodeStateToURL`), consumed at `index.html:11186`
  (`updateURL`, inside a `setTimeout` with **no try/catch**), `index.html:11253` (`copyShareLink`),
  `index.html:11265` (`copyEmbedLink`).
- **Impact:** Titles are free text and emoji in map titles are the norm for the target audience. When it
  throws inside `updateURL`'s `setTimeout` the exception is swallowed by the task queue — the address-bar
  hash silently **freezes at its last valid value**, so reload/back restores an *older* map. From
  `copyShareLink` / `copyEmbedLink` it throws before `navigator.clipboard.writeText`, so the button
  appears to do nothing at all. No error is surfaced to the user in any path.
- **Fix:** Replace `btoa(JSON.stringify(s))` with a UTF-8-safe encoder
  (`btoa(String.fromCharCode(...new TextEncoder().encode(json)))`, decode with `TextDecoder`), keep
  backward compat by trying the new decode then falling back to plain `atob`. Wrap `updateURL` and both
  copy paths in `try/catch` that calls `showMessage(..., 'error')` instead of failing mute.

### [P1] The share hash drops most of the map's appearance — a shared link is not the map you made

- **Area:** `/design/make` → `encodeStateToURL` / `loadStateFromURL`
- **Repro:** set every appearance field, encode, inspect the payload keys.
- **Evidence** (live): the encoded object contains exactly
  `["colors","legend","title","subtitle","legendTitle","source"]`. Fields set on `appState`
  immediately before encoding that were **not** in the payload:
  `legendPosition`, `titleColor`, `bgColor`, `exportAspect`, `showLabels`, `scaleUnit`,
  `arrowPosition/arrowColor/arrowStyle`, `scalePosition/scaleColor/scaleStyle`, `stateLabels`,
  county colours, theme.
- **Location:** `index.html:11144-11153`.
- **Impact:** The recipient of a share/embed link sees the map with the legend back in the default
  `bottom-right`, default title colour, no custom background, labels forced back on, and any per-state
  custom label gone. For a product whose whole output is "a picture of a map", the shared artefact
  differing from the authored artefact is the worst possible silent failure. It also means "Save to My
  Maps" (which stores `encodeStateToURL()`) cannot round-trip a map the user spent time styling.
- **Fix:** Version the payload (`{v:2, ...}`) and include the full appearance block; keep the v1 decode
  path for old links. Theme is a deliberate exclusion (documented) — everything else should ride along.
  Consider a compact key map to stay under the 8000-char cap in `updateURL` (`index.html:11185`).

### [P0] County View: Undo destroys the county map, does not undo county colouring, and leaves the editor in a broken hybrid state

- **Area:** `/design/make` → County View + Undo
- **Repro:**
  1. Load `/design/make`, colour Texas (state view).
  2. Enter County View for Texas (`loadCountyView('48')` / the County Map button).
  3. Click three counties — they fill, stats bar reads "3 of 254 counties colored".
  4. Press Undo once.
- **Evidence** (live, `work/create-editor/v4.mjs`, `shots/ce-county-colored.png` → `shots/ce-county-after-undo.png`):
  ```
  after colouring : countyPaths=254  filled=3  stats="3 of 254 counties colored"  appState.countyColors=null
  after ONE undo  : countyPaths=0    statePaths=51   backToStatesBtn still visible
                    stats="3 of 254 counties colored"   title reverted "Texas Counties" → "My US Map"
  re-enter county : refilled=3       ← the county colours were never undone
  ```
- **Location:** county colours live in a **module-level `const countyColors = {}` at `index.html:13734`**,
  but `captureHistorySnapshot()` (`index.html:10924-10933`) and `applyHistorySnapshot()`
  (`index.html:10936-10960`) read/write **`appState.countyColors`**, which is never declared on
  `appState` (`index.html:5354`) and is `null` at runtime. `applyHistorySnapshot` then calls
  `renderMap()` (`index.html:10955`), which rebuilds `#statesGroup` with the 51 *state* paths while
  `countyMode` is still `true`.
- **Impact:** Four bugs in one. (a) One Undo silently throws away the county map the user was working
  on. (b) County colouring is not undoable at all — the "undo" is a no-op against a phantom object.
  (c) The UI is left inconsistent (state map + county stats + Back button). (d) Because every county
  click still calls `saveHistory()` (`index.html:13828`), colouring 50 counties **evicts the user's
  entire real undo history** through the 50-entry cap at `index.html:10963`.
- **Fix:** Move county colours onto `appState.countyColors` (one rename at `index.html:13734` and its
  ~8 call sites) so the existing snapshot code starts working; make `applyHistorySnapshot` branch on
  `countyMode` and call `loadCountyView(currentFips)` instead of `renderMap()`; snapshot `countyMode` +
  `countyStateName` too so undo can cross the view boundary coherently.

### [P1] County colours are not in the share hash and not in any save — leave the view and they exist only in RAM

- **Area:** `/design/make` → County View persistence
- **Repro:** colour counties, return to state view, reload the page (or copy the share link and open it).
- **Evidence:** `encodeStateToURL()` payload keys are `colors, legend, title, subtitle, legendTitle,
  source` — no county key. `updateURL()` is never called by the county click handler
  (`index.html:13827-13837` calls only `updateStatsBar()`), so even the address bar never learns.
  Verified live: after colouring counties the hash is byte-identical to before.
- **Location:** `index.html:13734` (`countyColors`), `index.html:11144` (`encodeStateToURL`),
  `index.html:13827` (click handler).
- **Impact:** County maps — a headline feature — cannot be shared, embedded, saved to My Maps, or even
  survive a refresh. A user who spends 20 minutes colouring 254 Texas counties loses all of it to an
  accidental reload with no warning.
- **Fix:** Add `counties` to the encoded payload (FIPS→colour is compact) and call `updateURL()` from
  the county click handler. Also restore county colours in `loadStateFromURL`.

### [P1] Editing the map title in the top bar never updates the URL hash — reload silently reverts the title

- **Area:** `/design/make` → title sync (`#createMapTitleInput` ↔ `#mapTitle`)
- **Repro:**
  1. Click into the on-map title, type `Typed Title`, click away (blur). Wait 1.5s.
  2. Now type `TopbarOnly` into the top-bar title field. Wait 2s.
  3. Read `appState.mapTitle` and the decoded `location.hash`.
- **Evidence** (live, `work/create-editor/v3.mjs`):
  ```
  after on-map blur : appState.mapTitle="Typed Title"   hash.title="Typed Title"   ✅
  after top-bar edit: appState.mapTitle="TopbarOnly"    hash.title="Typed Title"   ❌ stale
  ```
- **Location:** the top-bar listener at `index.html:5957-5960` sets `mapTitle.textContent` and
  `appState.mapTitle` but **never calls `updateURL()`**. The on-map path commits via the `blur` handler
  at `index.html:9970-9973`, which does call `updateURL()`.
- **Impact:** The top-bar field is the *primary, most discoverable* title control after the Phase-1
  rebuild, and it is the one that doesn't persist. Reload, browser back, or restoring the tab silently
  reverts the title to whatever it was before. (Share/Embed/Save re-encode live, so those are fine —
  which makes the bug harder to notice.)
- **Fix:** Add `updateURL()` to the top-bar `input` handler (debounced — `updateURL` already debounces
  1s internally).

### [P2] `appState.mapTitle` is stale while the on-map title has focus

- **Area:** `/design/make` → title commit timing
- **Repro:** click the on-map title, type, and **without clicking away** trigger Export / Share / Save.
- **Evidence** (live): mid-typing → `{app:"My US Map", dom:"Typed Title", inp:"Typed Title"}`. The DOM
  and the top-bar mirror show the new text; `appState` still holds the old one.
- **Location:** `index.html:9970` — commit happens only on `blur`; the `input` listener at
  `index.html:5961` syncs only the top-bar mirror.
- **Impact:** Export uses `#mapTitle` (DOM) so PNGs are correct, but Share link, Embed code, Save to My
  Maps and the OG image all read `appState.mapTitle` → they carry the *old* title. On touch devices
  "click away to commit" is not a natural gesture, so this fires often.
- **Fix:** Commit on `input` (the handler already exists at `index.html:5961` — add
  `appState.mapTitle = mapTitle.textContent; updateURL();`), keep `blur` as a safety net.

### [P2] Legend labels only commit on `change` — type a label and export/share immediately and the label is empty

- **Area:** `/design/make` → Elements panel → legend builder
- **Repro:**
  1. Colour a state, open the Elements panel, click "+ Add" to create a legend row.
  2. Click the label field and type `States I Visited`. **Do not blur.**
  3. Read `appState.legendEntries` and the on-map legend.
- **Evidence** (live, `work/create-editor/v6.mjs`):
  ```
  mid-type : appState.legendEntries labels = [""]   on-map legend text = "Legend"   ← nothing
  after Tab: appState.legendEntries labels = ["States I Visited"]  ✅
  ```
- **Location:** `index.html:10757` — `labelInput.addEventListener('change', ...)`.
- **Impact:** Same family as the title bug. The on-map legend shows no live feedback while typing, which
  reads as "the legend is broken", and any export/share triggered from the keyboard (or from a tap on a
  toolbar button that doesn't blur first on iOS) captures an empty label.
- **Fix:** Listen on `input` and debounce the `saveHistory()` call (coalesce keystrokes into one undo
  entry) rather than listening on `change`.

### [P2] Appearance settings are invisible to Undo, and two of them call `updateURL()` for a field the URL doesn't carry

- **Area:** `/design/make` → Elements/Display panel → legend position, title colour, background colour
- **Repro:** change legend position / title colour / background colour, then press Undo.
- **Evidence** (live, `work/create-editor/v3.mjs` undo matrix — history length after each action with the
  stack pre-cleared): `titleColorPicker → NO HISTORY`, `applyTheme → NO HISTORY`,
  `selectColor → NO HISTORY`. `captureHistorySnapshot()` (`index.html:10924`) stores only
  `stateColors, countyColors, legendEntries, selectedColor, mapTitle, mapSubtitle, mapSource, legendTitle`
  — `legendPosition`, `titleColor`, `bgColor`, `showLabels`, arrow/scale settings are all absent.
- **Location:** handlers at `index.html:14176-14190` (`legendPositionSelect`, `titleColorPicker`,
  `bgColorPicker`); snapshot at `index.html:10924-10933`.
- **Impact:** Undo is unpredictable: it silently skips past every appearance change and lands on the
  previous *colouring* action, so users lose paint work they didn't intend to undo. Worse,
  `titleColorPicker` calls `updateURL()` (`index.html:14186`) even though `titleColor` is not in the
  encoded payload — the call rewrites the hash to a value that does not contain the change the user
  just made, which is pure churn.
- **Fix:** Widen `captureHistorySnapshot`/`applyHistorySnapshot` to the full appearance block (it is
  already a JSON round-trip, so this is a field list, not an architecture change) and add `saveHistory()`
  to the three handlers. Drop the pointless `updateURL()` or fix the payload (see the P1 above).

### [P2] The rail's five panel buttons have no text and no accessible name

- **Area:** `/design/make` → `#createRail`
- **Evidence** (live, `work/create-editor/v6b.mjs`): enumerating `#createRail .rail-btn` returns
  `["map:", "color:", "elements:", "data:", "upgrade:"]` — the `data-panel` value is present, the
  rendered `textContent` is empty for all five.
- **Location:** rail markup + the delegate at `index.html:5868-5881`.
- **Impact:** Screen-reader users hear five unlabelled buttons; the whole editor is unnavigable. Also
  hurts sighted first-time users who have to guess what each glyph means.
- **Fix:** `aria-label` on each rail button (and a visible text label under the icon — there is room).

### [P3] Documentation drift: the Create rail panels are `map / color / elements / data / upgrade`

- **Area:** `.claude/CLAUDE.md` vs. the shipped DOM
- **Evidence** (live): the rail exposes `createPanelMap / createPanelColor / **createPanelElements** /
  createPanelData / createPanelUpgrade`. `CLAUDE.md` documents `createPanelLegend`, and says
  `#sourceInput` "lands in the Create Map panel" — it is actually inside `secDisplay` **inside
  `createPanelElements`**.
- **Impact:** Costs any future agent or contributor a debugging cycle (it cost this audit two).
- **Fix:** Update the "Mode Router (Phase 1)" section of `CLAUDE.md`.

### [P1] A long map title collapses the map to zero height — the map disappears entirely

- **Area:** `/design/make` → on-map title (`#mapTitle`)
- **Repro:**
  1. Load `/design/make`.
  2. Click the on-map title and paste/type a long title (400 characters — or realistically ~10 words at
     a narrow window width).
- **Evidence** (live, `work/create-editor/v8.mjs`, screenshot `shots/ce-long-title.png`):
  ```
  titleH = 870px   containerH = 856px   overflowsContainer = true   svgH = 0
  ```
  The screenshot shows the entire canvas filled with title text and **no map at all**.
- **Location:** `#mapTitle` at `index.html:5128` (`contenteditable`, no `maxlength`, no clamp); the map
  container is a flex column so the title takes all the height it asks for and starves the SVG.
- **Impact:** Trivially reachable by pasting a sentence into the title. The user's map vanishes with no
  error and no obvious way back other than deleting text they may not realise is the cause. Export from
  this state produces a PNG of nothing but title.
- **Fix:** Cap the title element (`max-height: 20%`, `overflow: hidden`, `-webkit-line-clamp: 2`) and
  give the SVG `flex: 1 1 0; min-height: 0` so it can never be squeezed out. Add a soft character limit
  (the top-bar mirror should get a `maxlength`) with a visible counter.

### [P2] Programmatic writes to `#mapTitle` desync the top-bar mirror (no `input` event fires)

- **Area:** `/design/make` → title sync
- **Evidence** (live, `shots/ce-long-title.png`): after setting `#mapTitle.textContent`, the on-map title
  shows the new text while the top bar still reads "My US Map". The same asymmetry exists for the ~12
  code paths that write `#mapTitle.textContent` directly (`index.html:11215, 12401, 13530, 13748, 13927`)
  — e.g. **entering County View sets the title to "Texas Counties" but the top-bar field never updates**.
- **Location:** two-way sync is `input`-event-based only (`index.html:5957-5963`).
- **Impact:** The top bar — the most prominent title UI — routinely lies about the current title.
- **Fix:** Route all title writes through a single `setMapTitle(text)` that updates `appState`, `#mapTitle`,
  the top-bar input and `updateURL()`; or observe `#mapTitle` with a `MutationObserver`.

### [P2] Any edit made in the last second before a reload / navigation is lost (1s hash debounce, no flush)

- **Area:** `/design/make` → `updateURL()` persistence
- **Repro:** load `/design/make`, click one state, immediately reload.
- **Evidence** (live, `work/create-editor/v8.mjs`):
  ```
  before reload: 1 state coloured, location.hash length = 0   ← debounce not yet flushed
  after  reload: 0 states coloured, hash length = 0           ← the colouring is gone
  ```
- **Location:** `index.html:11182-11191` — `setTimeout(..., 1000)` with no `beforeunload`/`pagehide` flush
  and no `visibilitychange` handler.
- **Impact:** Tap-a-state-then-close-the-tab is a completely normal mobile interaction, and the work
  silently vanishes. Combined with the P0 `btoa` bug and the missing-fields P1, the hash is not a
  trustworthy persistence layer at all.
- **Fix:** Flush on `pagehide`/`visibilitychange` (call the pending encode synchronously), and shorten
  the debounce to ~250ms. Longer term, persist to `localStorage` on every mutation and treat the hash as
  a share format rather than the save format.

### [P3] Every individual click is its own undo step — 20 taps on one state = 22 history entries

- **Area:** `/design/make` → history granularity
- **Evidence** (live): 20 rapid clicks on Ohio → `appState.history.length = 22`; final DOM fill and
  `appState.stateColors` agreed (`consistent: true`), so there is no corruption — only granularity.
- **Location:** `onStateClick` calls `saveHistory()` unconditionally (`index.html:10480`); cap is 50
  (`index.html:10963`).
- **Impact:** Drag-painting or a burst of taps blows through the 50-entry cap in seconds, so the *real*
  earlier states (a loaded template, a data map) fall off the end and become unrecoverable.
- **Fix:** Coalesce same-gesture mutations (time-window or pointer-down/up boundary) into one entry.

### Confirmed working (do not regress in a rebuild)

- **Click-to-toggle** is exact: tapping a state twice with the same colour removes it; DOM fill and
  `appState.stateColors` never disagree, even under 20 rapid synthetic clicks.
- **DC / territories:** clicking District of Columbia colours nothing and the counter stays
  `0 of 50 states colored`; colouring every colourable state reads exactly `50 of 50 states colored`.
- **Legend anchoring** is genuinely correct. Measured at all four corners against the *computed SVG
  content rect* (not the container): the legend is inside the content box in every case, including a
  severely letterboxed 644×706 SVG whose real content box is only 644×453. `pointer-events: none` is
  applied so taps pass through. (`work/create-editor/v5.mjs`)
- **Legend lifecycle:** add / label / recolor / remove / auto-populate all behave, each pushing exactly
  one history entry. `recolorLegendEntry` (wired to the swatch picker's `change` event,
  `index.html:10731`) correctly cascades the colour change to every matching state, so the legend and map
  never decouple through the UI path.
- **Templates:** the first six of 28 all load, and editing legend row 0 *after* the load takes effect
  (`editOk: ok` for every one) — the documented stale-closure hazard is genuinely fixed by
  `updateLegendBuilder()`.
- **Source field autofill defeat** does **not** eat legitimate input: after a real click (which clears
  `readonly` via the `focus` handler at `index.html:11153`), typing `U.S. Census Bureau, ACS 2023` lands
  in the field, `appState.mapSource`, and the on-map `#mapSource`; a deliberately typed
  `me@example.com` is also respected (the `userTypedSource` flag works), and a pasted
  `research@university.edu` survives too.
- **No console errors** were produced by any of the interactions above (colouring, legend edits,
  templates, county view, undo/redo, theme switches) — the error array was empty in all seven probe runs.

### [P0 — corollary] The P0 encoder bug is *guaranteed* by every Data Map: end-to-end reproduction

- **Area:** `/design/make` → Data panel → any Census data map → Share / Embed / Save to My Maps
- **Repro:**
  1. Build the exact legend labels `applyDataMap()` produces (`index.html:13548-13553` join ranges with
     **U+2013 EN DASH**, e.g. `"100,000 – 7,880,000"`).
  2. Put them in `appState.legendEntries`, colour a state, then `updateURL()`, `copyEmbedLink()`,
     `saveCurrentMapToGallery()`.
- **Evidence** (live, `work/create-editor/v13.mjs`):
  ```
  sampleLabel  : "100,000 – 7,880,000"    hasEnDash: true
  encodeStateToURL()  : THROWS InvalidCharacterError
  updateURL()         : hashChanged=false, hash length 0     ← address bar never updates
  copyEmbedLink()     : THROWS InvalidCharacterError         ← button silently does nothing
  saveCurrentMapToGallery() : "no throw" but localStorage tappymaps_my_maps has 0 entries
  console            : "pageerror: Failed to execute 'btoa' ... outside of the Latin1 range."
  ```
- **Location:** label construction `index.html:13548-13553`; encoder `index.html:11152`;
  `saveCurrentMapToGallery` is `async` (`index.html:6429`) so the throw becomes an **unhandled promise
  rejection** — the user gets no toast at all, which is why this has gone unnoticed.
- **Impact:** The flagship Pro feature (Data Maps) produces maps that **cannot be shared, embedded, or
  saved**, and the failure is completely silent in the Save path. Every Pro subscriber hits this.
- **Fix:** as in the first P0 — UTF-8-safe base64 + a `try/catch` around each consumer that surfaces
  `showMessage(..., 'error')`. Adding `.catch()` to the async save path is a one-line stop-gap.

### [P1] North arrow and scale bar are hard-coded `#ffffff` in every theme — invisible on all light themes, on screen and in exports

- **Area:** `/design/make` → map furniture vs. Theme system
- **Repro:** switch to the Light theme (or Sepia / Warm / Solarized / Mint / Lavender) with the north
  arrow and scale bar enabled.
- **Evidence** (live, `work/create-editor/v11.mjs` + screenshot `shots/ce-theme-light.png`): all north-arrow
  and scale-bar child elements resolve to `fill/stroke = "#ffffff"`; `appState.arrowColor` and
  `appState.scaleColor` are `"#ffffff"` for **all 16 themes** (measured while cycling `themeList`). The
  light-theme screenshot shows a barely-visible white compass at top-right and an invisible white scale
  bar at bottom-left over a pale-blue map.
- **Location:** defaults at `index.html:5374` / `index.html:5377`; `applyTheme` (`index.html:12450`) never
  touches them; renderers at `index.html:12691+` interpolate `appState.arrowColor` / `scaleColor` directly.
- **Impact:** Two Pro map-furniture features are effectively broken on half the themes, and the defect is
  baked into the exported PNG — the user only discovers it after sharing.
- **Fix:** Default `arrowColor` / `scaleColor` to a theme token (`var(--text)` resolved at render time) and
  only pin a literal once the user explicitly overrides it.

### [P2] The map zoom-reset button sits on top of the stats bar text

- **Area:** `/design/make` → map controls
- **Evidence** (live, `work/create-editor/v11.mjs`): `#statsBar` rect `[x 56, y 861, w 1084]`,
  `#createZoomReset` rect `[x 68, y 848, w 40]` → **overlap = true**. Visible in
  `shots/ce-theme-light.png`, where the reset glyph covers the start of "0 of 50 states colored".
- **Impact:** The "X of 50" counter is the primary progress signal in the whole app and it is partially
  occluded at the default desktop size.
- **Fix:** Inset the stats bar's left padding past the zoom stack, or move the zoom cluster to the map's
  right edge.

### [P2] Every theme renders unpainted states at ~1.0–1.9:1 contrast against the map background

- **Area:** `/design/make` → theme system, map legibility
- **Evidence** (live, `work/create-editor/v9.mjs`, computed luminance ratio between the unpainted
  `.state-path` fill and `#mapContainer`'s background across all 16 themes):
  `cyberpunk 1.03`, `nord 1.19`, `dark 1.20`, `rose 1.23`, `ocean 1.29`, `mint 1.29`, `cherry 1.34`,
  `lavender 1.38`, `slate 1.45`, `dracula 1.48`, `warm 1.69`, `sepia 1.85`, `solarized 1.85`,
  `light 1.90`, `sunset 1.95`.
- **Impact:** The country's silhouette is carried entirely by hairline state borders. On `cyberpunk`
  (1.03) the unpainted map is essentially invisible — a first-time user sees a blank canvas. It also means
  the exported PNG of a *partially* coloured map has no readable geography.
- **Fix:** Give unpainted states a per-theme fill token with a minimum 1.6:1 target against the map
  background, and thicken the border stroke on the lowest-contrast themes.
  *(Note: I initially suspected legend text contrast too — measured properly with alpha it is fine
  (dark text on 85% white in every light theme). Not a finding.)*

### [P3] Data maps could not be exercised end-to-end on the local stub

- **Area:** `/design/make` → Data panel
- **Evidence:** `executeDataMapLoad('population', ds.colorScale)` completed with `0` states coloured and
  `0` legend entries, no console error and no history entry. `window.chroma` is loaded, so the
  `!window.chroma` guard (`index.html:13532`) is not the cause; the local `/api/census` stub returns a
  header of `["NAME","VALUE","state"]` which does not match what `fetchCensusData` expects to map back
  through `FIPS_TO_STATE`.
- **Impact:** None in production (almost certainly a stub-shape artefact) — recorded so a future auditor
  does not re-chase it. **UNVERIFIED (stub limitation)** whether the live Census response applies cleanly.
- **Fix:** Note that `applyDataMap` returns silently when `values.length === 0` after a `showMessage`;
  worth a louder failure. Also `executeDataMapLoad(id, null)` (a null ramp) produces a blank map with no
  error — `chroma.scale(null)` should be guarded.

### [P1] Ctrl+Z inside a text field undoes a *map* action and wipes the field you were typing in

- **Area:** `/design/make` → global keyboard shortcut vs. text inputs
- **Repro:**
  1. Colour three states.
  2. Open the Elements panel, click into the Source field, type `Census Bureau`.
  3. Press **Ctrl+Z** (the reflex for "undo my last word").
- **Evidence** (live, `work/create-editor/v14.mjs`):
  ```
  before: 3 states coloured, sourceInput = "Census Bureau"
  after Ctrl+Z: 2 states coloured, sourceInput = ""
  ```
  Both the map *and* the text are destroyed: the shortcut runs the app's `undo()`, which pops a snapshot
  and then rewrites `sourceInput.value` from it (`index.html:10952`).
- **Location:** the global keydown handler is not scoped away from `input` / `textarea` /
  `[contenteditable]`; `applyHistorySnapshot` writes back into `#sourceInput` / `#mobileSourceInput`.
- **Impact:** Users lose paint work by pressing the most reflexive shortcut in existence, and the native
  browser text-undo they expected never runs. Doubly bad because the field text is also clobbered.
- **Fix:** Early-return from the shortcut handler when
  `document.activeElement` matches `input, textarea, select, [contenteditable="true"]`.

### [P2] The top-bar Undo/Redo buttons never disable

- **Area:** `/design/make` → top bar
- **Evidence** (live, `work/create-editor/v14.mjs`, with both stacks emptied and `updateUndoRedoButtons()`
  called): `createUndoBtn.disabled = false`, `createRedoBtn.disabled = false`, while the legacy
  `undoBtn` / `redoBtn` correctly report `disabled = true`.
- **Location:** `updateUndoRedoButtons()` (`index.html:~10950`) enumerates only the legacy ids
  `['undoBtn','mobileUndoTap',...]` / `['redoBtn','mobileRedoTap',...]` — the Phase-1 top-bar ids were
  never added.
- **Impact:** The primary Undo/Redo affordance always looks available; pressing it on an empty stack is a
  silent no-op (`undo()` returns early at `index.html:10970` before the "Undone" toast), so the user gets
  zero feedback and assumes the editor is frozen.
- **Fix:** Add `'createUndoBtn'` / `'createRedoBtn'` to the two id arrays, and give the empty-stack path a
  `showMessage('Nothing to undo', 'info')`.

### Additional confirmed-working checks

- **`captureMapImage()`**: produced a `3252 × 2286` canvas, forced `#mapTitle` visible
  (`display: block`), and **fully restored** `#mapContainer`'s inline styles afterwards
  (before/after `cssText` identical). The single-source export contract holds. (`work/create-editor/v14.mjs`)
- **Empty legend** degrades cleanly: with zero entries `#legendDisplay` is `display: none`, height 0 —
  no empty chrome baked into the export.
- **Multi-select**: entering multi-select mode, selecting three states and applying pushes exactly **one**
  history entry, undo restores correctly, and no stale `.multi-selected` classes are left on the paths.
- **Browser back / forward**: `/design/make` → Hub → Back → Forward → Back round-trips correctly.
  `body[data-mode]` tracks (`design/make` ↔ `__hub__`), the hash survives (153 chars both times), the
  coloured state is preserved and the map re-renders visible.

---

## Verdict

The core interaction loop is in good shape and the Phase-1 re-parenting cutover has held: click-to-toggle
is exact, the DC/territory exclusion is honoured in both the map and the counter, the legend anchors
correctly to the **SVG content rect** at every corner (verified at a severely letterboxed 644×453 content
box), all 28 templates load and remain editable afterwards, multi-select is a clean single undo step,
`captureMapImage()` renders 3252×2286 and restores every style it touched, and I logged **zero console
errors** across eleven probe runs of ordinary editing.

What is broken is **persistence**. `encodeStateToURL()` is raw `btoa()`, so a single emoji — or the en
dash that *every* Data Map legend label contains by construction — makes Share, Embed, the address-bar
hash, and Save to My Maps fail, two of them completely silently. The payload it produces carries only 6
of ~20 user-visible fields, so even a working share link loses legend position, title colour, background
colour, labels and every piece of map furniture. County colours live in a module-level `const` that
history and the encoder have never heard of, so one Undo in County View destroys the county map, undoes
nothing, and leaves a state map with a county stats bar. And a 1-second debounce with no unload flush
means the last edit before any reload simply evaporates.

**One-line verdict: a solid, well-tested drawing surface bolted onto a save/share layer that silently
loses data — fix the encoder, widen the payload, and move county colours onto `appState` before anything
else.**

## Ideas

1. **One state object, one serializer, one schema version.** Everything the user can change lives on
   `appState` (county colours included), and a single versioned `serialize()/deserialize()` pair is the
   only way state ever leaves or enters the app — used identically by the hash, Save to My Maps, the
   embed route and `/api/render`. Round-trip it in a test that asserts *every* key survives, so
   "silently dropped field" becomes impossible rather than merely unlikely.
2. **UTF-8-safe encoding, and never fail silently.** `TextEncoder` + base64url; every consumer wrapped in
   a `try/catch` that surfaces a real error toast. A save/share path that can throw invisibly is worse
   than one that refuses loudly.
3. **A command/undo stack instead of full-state snapshots.** Named commands (`colorState`,
   `setLegendLabel`, `loadTemplate`, `applyDataMap`, `setLegendPosition`) with `do`/`undo` pairs give
   you free coalescing (a burst of taps = one entry), correct behaviour across the county/state view
   boundary, a readable history ("Undo: load template"), and a natural home for "nothing to undo".
   Cap by memory, not by a magic 50 that 20 taps can blow through.
4. **Commit on `input`, everywhere.** The title, the subtitle, the legend labels and the source field all
   commit on `blur`/`change` today, which means the app's idea of the map and the screen's idea of the map
   diverge for as long as a field has focus. One `setX()` helper per field, called from `input`, that
   updates state + DOM + mirror + URL.
5. **Persist continuously, share deliberately.** Write to `localStorage` on every mutation (and flush on
   `pagehide`) so a reload never loses work; treat the URL hash purely as a share artefact generated on
   demand. Users should never be able to lose a map by closing a tab.
6. **Theme-aware map furniture.** North arrow, scale bar, title colour, unpainted-state fill and border
   stroke all derive from theme tokens with a contrast floor (unpainted states currently sit at 1.03:1
   against the background on `cyberpunk`), with an explicit "user overrode this" flag so switching themes
   never clobbers a deliberate choice. No `#ffffff` literals in `appState`.
7. **A layout budget for the canvas.** The title should be clamped (`max-height`, line-clamp) and the SVG
   given `flex: 1 1 0; min-height: 0` so no amount of text can collapse the map to zero height; the zoom
   cluster and the stats bar should occupy reserved, non-overlapping gutters.
8. **Keyboard and screen-reader parity from day one.** Labelled rail buttons, states as focusable
   `role="button"` elements with `aria-label="California, coloured Visited"`, number keys for palette
   slots, and `Ctrl+Z` scoped away from text fields. Cheap to build in, expensive to retrofit — as the
   current `Ctrl+Z`-eats-your-map bug demonstrates.
