# Tappymaps — Export Pipeline Audit
_Audit date: 2026-08-21 · target: `/home/user/tappymaps/index.html` (~15.8k lines) + `/home/user/tappymaps/api/render.js`_
_Method: Playwright 1.56 against the local dev server (`http://127.0.0.1:8123`, SPA rewrites + vendored CDN libs + `/api/*` stubs). Every finding below was reproduced in a real browser unless explicitly marked UNVERIFIED._

## Verdict

**The export pipeline's core is excellent and its edges are broken.** The landscape PNG path — the one everybody exercises — is deterministic to the byte, restores the live editor perfectly across 173 nodes, produces a genuinely handsome 3252x2286 poster, and throws no console errors under any condition I could construct. The single-source `captureMapImage()` discipline is real and it is paying off: the save/restore `finally` block is the most reliable code in this audit.

Everything *around* that core has drifted. Two P0s: the html2canvas fallback is **dead** (one `color-mix()` declaration on the legend makes it throw, so a dom-to-image failure means "Export failed" with no image), and a Phase-1 CSS rule (`max-height: 100%`) silently caps the capture frame so that **three of the four Instagram presets never receive the frame the code computes for them** — which is why the story export pastes the legend over New England. Beyond those: county exports lose the mandatory logo, SVG exports lose the title and legend entirely (while still charging a quota unit), mobile exports render the subtitle larger than the title, the scale bar is wrong by 20-30%, and the `/api/render` OG image looks like a different product from the map it represents.

None of this is architectural rot — every one of these is a small, local, well-understood fix. The pipeline is one focused day of work away from being genuinely strong.

**Counts:** 2 P0 · 6 P1 · 5 P2 · 6 P3 · 7 PASS.

---

## Critical — P0


### [P0] ROOT CAUSE — `#createMap > #mapContainer { max-height: 100% }` silently defeats the export frame for every non-landscape aspect
- **Area:** Phase-1 Create-rail CSS vs. `captureMapImage()` frame forcing
- **Repro:** `work/export/A2-legendprobe.mjs` wraps `domtoimage.toPng` to measure the live DOM at the exact instant of capture.
- **Evidence:** `captureMapImage` sets `mapContainer.style.height = captureHeight + 'px'`, but the container's **actual rendered height never changes**:

| aspect | intended captureHeight | measured container height | measured SVG box height |
|---|---|---|---|
| landscape | 762 | **762** ✅ | 631 |
| square | 1084 | **856** ❌ | 953 |
| portrait | 1355 | **856** ❌ | 1224 |
| story | 1927 | **856** ❌ | 1796 |

  `getComputedStyle(#mapContainer).maxHeight === "100%"` with `parentElement === #createMap` (height 856px). The inline `height` is capped; the SVG child overflows it. Landscape only works because 762 < 856, i.e. it *shrinks*.
- **Location:** **index.html:4000** — `#createMap > #mapContainer { min-height: 0; max-height: 100%; }` (added by the Phase-1 cutover). Interacts with index.html:11883-11885.
- **Impact:** Everything the export clamp computes downstream is measured against an **856px box that does not correspond to the exported frame**:
  - the legend's `bottom:12px` resolves against 856px, so `getComputedStyle(legend).top` comes back as `694px`. dom-to-image-more inlines **computed** styles onto its clone, which converts the `bottom/right` anchor into an over-constrained `top:694px; left:930px; bottom:12px; right:12px`; per CSS, `top`/`left` win — so the legend is pinned 694px down a 1927px story frame (36%), i.e. right on top of New England.
  - `legendEl.style.maxHeight = captureHeight - titleClearance - inset` is computed from the intended height, so it is inert.
  - The intent of the "EXPORT-ONLY LEGEND CLAMP" comment block (index.html:11884-11912) is completely unrealised for 3 of the 4 aspects.
- **Fix (verified):** `work/export/A3-fixtest.mjs` injects `#createMap > #mapContainer { max-height: none !important; }` and re-runs the same three captures. Container heights become **1084 / 1355 / 1927** — exactly the intended values — and the legend's measured gap from the container bottom is **12px in all three cases** (computed `top` resolves to 922 / 1193 / 1765). Evidence: `out/A3-fixed-story.png` now has the legend correctly in the bottom-right corner instead of over Maine.
  - Recommended implementation: have `captureMapImage()` set `mapContainer.style.maxHeight = 'none'` alongside the existing `flex:'none'` / `flexBasis:'auto'` opt-outs (index.html:11883), and restore it in the `finally` block with the same save/restore pattern used for the other 14 properties. That keeps the live-editor `max-height:100%` behaviour intact and is a ~3-line change entirely inside the export function.
- **Also worth fixing:** the `top`/`left`-vs-`bottom`/`right` over-constraint is a latent trap independent of the height bug. When the clamp anchors to a corner it should explicitly null the opposing axis (`legendEl.style.top='auto'` is already done *before* the corner assignment, but the *computed* value is what dom-to-image reads). Belt-and-braces: after positioning, read back `getBoundingClientRect()` and re-assert the anchor as explicit `top`/`left` pixels so the clone can only interpret it one way.


### [P0] The html2canvas fallback is DEAD — it throws on `color-mix()`, so a dom-to-image failure means no export at all
- **Area:** `captureMapImage()` fallback branch
- **Repro:** `work/export/A4-multi.mjs` — replace `domtoimage.toPng` with `() => Promise.reject(...)` (exactly what the existing 12-second hang-timeout race does in production) and call `captureMapImage({aspect:'landscape'})`.
- **Evidence:** the call rejects with

  ```
  Error: Attempting to parse an unsupported color function "color"
  ```

  No canvas is produced. In production this propagates out of `captureMapImage` into `exportPNG`'s `catch`, which logs `Export failed:` and shows the user the toast **"Export failed"** — with no image and no explanation.
- **Location:** index.html:11974-11986 (the fallback), triggered by the CSS at index.html:1012 `background: color-mix(in srgb, var(--surface) 78%, transparent)` on `.legend-group` (plus any theme token that resolves to a modern `color()` / `color-mix()` function). html2canvas 1.4.1 (index.html:5336) predates CSS Color 4 and its parser hard-throws rather than degrading.
- **Impact:** **This is the single most serious finding in the export pipeline.** The architecture is explicitly documented as "dom-to-image-more is primary, html2canvas is fallback; both paths must work on Safari". The safety net does not exist. Every condition the fallback was built for — the documented dom-to-image-more hang on certain SVG content, iOS Safari quirks, a CSP/CORS hiccup on the data-URL decode — now produces a total export failure instead of a slightly-softer image. Given that dom-to-image-more failing is exactly the scenario nobody can reproduce on demand, this will surface as unattributable "Export failed" reports.
- **Fix (in order of preference):**
  1. Stop emitting `color-mix()` in the capture subtree. Give `.legend-group` a plain `rgba()` background (compute the same 78% blend at theme-definition time — there are only 16 themes, so it is 16 static rgba values) and keep `color-mix()` only as a progressive enhancement behind `@supports`. This alone should revive the fallback.
  2. Harden the fallback: before calling `html2canvas`, walk the capture subtree and overwrite any computed background/color/border-color containing `color-mix(`/`color(`/`oklch(`/`lab(` with the browser's already-resolved `rgb()` value (available via a throwaway `getComputedStyle` on a probe element), restoring afterwards in the same `finally`.
  3. Upgrade html2canvas (1.4.1 is from 2022) or replace the fallback with a `<canvas>`-native SVG serialisation path (`XMLSerializer` + `Blob` + `img.decode()`), which has no CSS parser at all.
  4. Regardless: make the failure legible. `showMessage('Export failed')` should distinguish "we could not render your map" from a quota problem, and should log which renderer failed.


### [P0-supporting] Exactly one element causes the fallback failure, and the fallback is otherwise perfect
- **Repro:** `work/export/A5-diag.mjs` walks every element under `#mapContainer` checking 13 computed colour properties for `color-mix()` / `color()` / `oklch()` / `lab()`.
- **Evidence:** **exactly 2 hits, both on the same node** —
  ```
  DIV#legendDisplay.legend-group  background-color  color(srgb 0.0862745 0.129412 0.243137 / 0.78)
  DIV#legendDisplay.legend-group  background         color(srgb 0.0862745 0.129412 0.243137 / 0.78) none repeat scroll ...
  ```
  Three controlled runs in the same page:
  | condition | forced dom-to-image failure → fallback |
  |---|---|
  | as shipped | ❌ `Attempting to parse an unsupported color function "color"` |
  | `.legend-group{background:rgba(26,26,46,.78)}` patched in | ✅ **3252x2286, 752,340 bytes** |
  | legend hidden (`display:none`) | ✅ succeeds |
- **Consequence:** the fallback breaks precisely for maps that *have a legend* — i.e. every finished map. A map with no legend still falls back fine, which is why this has probably never been caught.
- **Quality of the recovered fallback:** `out/A5-fallback-h2c-fixed.png` is **visually indistinguishable from the dom-to-image output** at the same 3252x2286 — all 51 paths, correct fills, legend, compass rose, scale bar, logo, title/subtitle/source all correct and sharp. So the fallback is not a degraded last resort; it is a genuinely good second renderer that is currently unreachable. Fixing one CSS declaration restores a working safety net.



## Major — P1


### [P1] Story / portrait presets letterbox the map into a small band — most of the frame is empty background
- **Area:** `EXPORT_ASPECT_RATIOS` + the "grow the frame, let `preserveAspectRatio="xMidYMid meet"` letterbox" strategy
- **Repro:** `captureMapImage({aspect:'story'})` at any viewport.
- **Evidence:** `out/A1-story.png` — **3252x5781 (9:16, exact)**. The map artwork occupies roughly the middle **35%** of the frame: ~30% dead background above the map (below the title) and ~28% dead below it. `out/A1-portrait.png` (3252x4065, 4:5 exact) has the same problem, less severely.
- **Location:** index.html:11770 `EXPORT_ASPECT_RATIOS`, index.html:11838-11870 (frame forcing; the SVG is stretched to `captureHeight - titleH - subtitleH` and the map just centres inside it)
- **Impact:** The Instagram Story export — the single most viral-oriented output the product has — is mostly empty navy. On a phone the map reads as a small strip. Title sits ~1600px away from the artwork it labels. This undercuts the whole "made for sharing" pitch.
- **Fix:** Don't stretch the SVG to the full residual height. Compute the map's real drawn height (`contentW / 1.4225`) and lay the frame out deliberately: title block directly above the map, legend + source + logo directly below it, whole stack vertically centred (or top-weighted with ~10% breathing room). For `story` specifically, consider scaling the map up to fill the width AND promoting the legend into the empty band below the map rather than on top of it (see next finding).


### [P1] Legend lands ON TOP of the map (New England) in the story preset instead of the frame corner
- **Area:** export-only legend clamp vs. the live `updateLegendPosition()`
- **Repro:** `captureMapImage({aspect:'story'})` with `appState.legendPosition = 'bottom-right'` (the default).
- **Evidence:** `out/A1-story.png` — the legend card sits at roughly 36-44% down the frame, hard against the right edge of the *map artwork*, and **completely covers Maine, New Hampshire, Massachusetts, Rhode Island and part of Vermont/Connecticut**; it also collides with the compass rose. The export-only clamp at index.html:11888-11912 explicitly sets `position:absolute; bottom:12px; right:12px` on the capture frame, so the rendered position contradicts the code's intent.
- **Location:** index.html:11888-11912 (the clamp), index.html:12006 (`updateLegendDisplay()` in `finally`)
- **Impact:** Story exports silently destroy the Northeast. A user colouring New England gets a legend pasted over their answer.
- **Fix:** see the mechanism finding below.


### [P1] On mobile the subtitle renders LARGER than the title — in every exported PNG
- **Area:** export typography
- **Repro:** `work/export/A6-modes.mjs` measures `getComputedStyle` on `#mapTitle` / `#mapSubtitle` at the instant of capture, desktop vs iPhone.
- **Evidence:**
  | viewport | title font-size | subtitle font-size |
  |---|---|---|
  | 1440x900 | **52px** (weight 800) | 18px |
  | 390x844 (iPhone) | **16px** (weight 800) | **18px** |
  Visible in `out/A4-mobile-portrait-390x844.png`: "States I Have Visited" is physically smaller than "A totally scientific ranking" underneath it.
- **Location:** **index.html:1843-1846** — inside the `max-width: 900px` block, `.map-title { font-size: 16px; padding: 6px 10px 0; }`. There is **no matching `.map-subtitle` override**, so it stays on `var(--text-h2)` = 18px (index.html:92). The desktop rule is `.map-title { font-size: var(--text-display) }` = 52px (index.html:90, 1207).
- **Impact:** every export produced from a phone has an inverted typographic hierarchy. Relative to the frame the title is 2.0% of image width on mobile vs 4.8% on desktop — less than half the visual weight, and outranked by its own subtitle. `captureMapImage` deliberately forces `titleEl.style.display='block'` to defeat this same media query (index.html:11833) but does not neutralise the font-size it also sets.
- **Fix:** in `captureMapImage`, override title/subtitle font-size for the duration of the capture the same way `display` is overridden (save + restore), e.g. force the export title to a size proportional to `captureWidth` (`captureWidth * 0.048`) and the subtitle to about a third of it. That also makes exports device-independent, which pairs with the resolution finding above.


### [P1] County-view exports lose the mandatory tappymaps logo
- **Area:** county mode vs the brand rule "logo is mandatory on every export for every tier"
- **Repro:** `work/export/A7-county.mjs` — `loadCountyView('06')`, colour a third of the 58 California counties, `captureMapImage({aspect:'landscape'})`.
- **Evidence:** `out/A7-county-export.png` — **3252x2286, 58 county paths, title/subtitle/legend all correct, and no logo anywhere in the frame.** At capture time `#logoWatermark` reports `display:inline; opacity:0.7`, i.e. it is "visible" — but it is an SVG `<g transform="translate(330, 570)">` in the *national* Albers coordinate space (index.html:5152), and county mode re-fits the SVG viewBox to the single state, so the logo is translated off-canvas.
- **Location:** index.html:5152 (`<g id="logoWatermark" transform="translate(330,570) scale(1.0)">`), county viewBox re-fit inside `loadCountyView` (index.html:13759+, viewBox change around index.html:13791).
- **Impact:** Phase 0 made the logo mandatory on every export precisely as the distribution/attribution mechanism. County exports — arguably the most impressive-looking output the product makes — ship unbranded. Anything shared from county mode carries no path back to tappymaps.com.
- **Fix:** make the logo position viewBox-relative rather than a fixed translate. Either re-place `#logoWatermark` whenever the viewBox changes (county mode already recomputes the fit, so it can compute a bottom-centre offset from the new viewBox), or lift the logo out of the SVG into an absolutely-positioned HTML element inside `#mapContainer` so it is anchored to the *frame* instead of the *projection*. The latter also makes it survive future zoom/pan and aspect changes.
- **Related (P2):** county mode correctly hides the north arrow and scale bar (both measured `display:none` — correct, since a national scale bar would be meaningless), but the county map letterboxes into roughly the middle 30% of the 1010:710 landscape frame with large empty margins left and right, and county labels overlap heavily in the Bay Area / Sacramento Valley (`Lake`/`Colusa`, `Sacramento`/`Solano`, `Contra Costa`/`Alameda`/`San Mateo` all collide). A county export would benefit from its own aspect ratio derived from the state's bounding box, and from label decluttering (drop labels whose polygon is below an area threshold, as the national map already does implicitly).


### [P1] `/api/render` (the OG image) does not look like the real export — 12 concrete divergences
- **Area:** server-side OG renderer vs client `captureMapImage()`
- **Repro:** static comparison of `/home/user/tappymaps/api/render.js` (191 lines) against the client export path; corroborated by `out/A1-landscape.png`.
- **Evidence / divergences:**
  | # | client export | `api/render.js` | line |
  |---|---|---|---|
  | 1 | background = `appState.bgColor \|\| (darkMode ? #1a1a2e : #f5f5f5)` — **dark navy by default** | `BG = '#ffffff'` hardcoded, and Resvg is additionally passed `background:'white'` | render.js:91, 184 |
  | 2 | uncoloured states use theme `--state-fill` (dark) | `UNCOLORED = '#e2e8f0'` (light grey) | render.js:89 |
  | 3 | legend corner honours `appState.legendPosition` (default **bottom-right**) | legend is hardcoded **bottom-left** (`bx = 24`) | render.js:122 |
  | 4 | all legend entries render | `legend.slice(0, 8)` — silently drops entries 9+ | render.js:83 |
  | 5 | full labels | labels truncated to 26 chars | render.js:135 |
  | 6 | system UI font stack | `Arial, Helvetica, sans-serif` | render.js:110+ |
  | 7 | two-letter **state labels** drawn on every state | no state labels at all | render.js:96-102 |
  | 8 | compass rose + scale bar present | neither | — |
  | 9 | non-Pro exports carry a `tappymaps.com` watermark | never watermarked | — |
  | 10 | logo at `translate(330,570) scale(1.0)` opacity 0.7, bottom-centre | logo at `translate(700,628) scale(0.9)` opacity 0.85, bottom-right | render.js:145 vs index.html:5152 |
  | 11 | landscape **1.4225** (1010:710) | **1200x986 = 1.217** (viewBox `-20 -120 1010 830`) | render.js:106-107 |
  | 12 | county view supported | reads `topology.objects.states` only — a county map renders as the plain 50-state map | render.js:95 |
- **Root constraint:** `encodeStateToURL()` (index.html:11170-11180) only serialises `{colors, legend, title, subtitle, legendTitle, source}`. **`bgColor`, `darkMode`, `legendPosition`, `countyColors` and the county/data-map view are not in the hash at all**, so `render.js` *cannot* match items 1, 2, 3 or 12 no matter how it is written.
- **Impact:** the OG image is the first impression of every shared link on Slack/Discord/Facebook/Twitter. Right now a user shares a dark-navy poster and the unfurl shows a white, label-less, differently-proportioned, differently-laid-out map. It reads as a different product. It also breaks the visual promise of the share.
- **Fix:**
  1. Extend the share payload with `bg` (resolved background colour), `pos` (legend corner) and a `dark` flag — additive keys, old links keep working because every field is already read defensively.
  2. Port the missing composition into `buildMapSVG`: state labels, the compass/scale decision, the same logo transform, the same 1010:710 frame, legend corner from `pos`, no entry cap.
  3. Match the frame: `VB`/`W`/`H` should produce 1.4225 so the unfurl crop matches what the user saw.
  4. Add a parity test — render both paths for a fixture state and diff the two PNGs' layout anchors; this is exactly the kind of drift that silently reappears.
- **Also (P3):** `buildMapSVG` emits the title as a single `<text>` with no wrapping at `font-size 46` in a 1010-unit-wide viewBox after `.slice(0,80)`. An 80-character title is roughly 1800 units wide and will run off both edges. The client title wraps.


### [P1] `exportSVG()` silently drops the title, subtitle and legend — and still burns a quota unit
- **Area:** the SVG export path
- **Repro:** `work/export/B1-restore-svg.mjs` reproduces `exportSVG()`'s clone step verbatim and searches the serialised output for the live title/subtitle/source/legend strings.
- **Evidence:** with title `"States I Have Visited"`, subtitle `"A totally scientific ranking"`, source `"Source: Audit Bureau 2026"` and 3 legend entries:
  ```
  hasTitleText: false
  hasSubtitle:  false
  hasLegendLabels: []        <- none of the 3 labels present
  hasSource:    true
  hasLogo:      true
  hasScaleBar:  true
  ```
- **Location:** index.html:12259-12262 — `exportSVG` clones `#mapSVG` only. `#mapTitle`, `#mapSubtitle` and `#legendDisplay` are **HTML siblings of the SVG inside `#mapContainer`**, not SVG children, so the clone can never contain them. `#mapSource`, `#logoWatermark` and `#scaleBar` survive because they *are* SVG nodes (index.html:5152, 5166, 5175).
- **Impact:** a user who picks "Export SVG" gets a coloured map with **no title, no subtitle and no legend** — an uninterpretable image. And the quota is spent first: `exportSVG` calls `checkExportPermission()` and `recordExport()` (index.html:12240-12250) *before* building the clone, so a free user pays one of their three monthly exports for an unusable file. This is a worse outcome than the PNG failure mode because it succeeds silently — the user only discovers it when they open the file.
- **Fix:** compose the SVG the way `api/render.js` already does — draw the title/subtitle as `<text>` and the legend as a `<g>` of `<rect>`+`<text>` into the clone before serialising. `buildMapSVG()` in render.js is 80 lines of exactly this logic and could be shared, which would also close most of the OG-parity gap in one move.
- **Related (P3):** the clone is stamped `width="1200" height="850"` (ratio **1.4118**) while the viewBox is `-20 -30 1010 710` (ratio **1.4225**). The map letterboxes with uneven padding rather than filling the declared canvas.



## Moderate — P2


### [P2] Square export leaves the legend floating mid-frame and a dead band across the bottom
- **Area:** same root cause as above
- **Repro / Evidence:** `out/A1-square.png` — 3252x3252 (1:1 exact). The legend sits at ~62-73% of frame height rather than the bottom-right corner, and the bottom ~12% of the frame is empty background below the scale bar / source line.
- **Location:** index.html:4000 + index.html:11888
- **Impact:** cosmetic rather than destructive (the square map happens to fill the width well and the legend lands in open ocean next to Florida), but it is not the composition the code intends.
- **Fix:** the `max-height` fix above corner-anchors it; then consider vertically centring the whole title+map+legend stack in the square frame rather than top-aligning it.


### [P2] Mobile exports are ~26% lower resolution than desktop exports
- **Area:** `const captureWidth = Math.max(mapContainer.offsetWidth, 800)` (index.html:11844)
- **Repro:** same run as above.
- **Evidence:** desktop 1440x900 → **3252x2286**; iPhone 390x844 → **2400x1686** (the 800px floor x3). Same map, same aspect, 45% fewer pixels.
- **Impact:** the export resolution silently depends on the user's browser window. A phone user posting to Instagram gets a 2400px asset where a desktop user gets 3252px; a user on a small laptop window gets something in between. Exports should be device-independent.
- **Fix:** decouple capture resolution from layout width — set a fixed logical `captureWidth` (e.g. 1200) for the *frame*, or keep the layout width but raise the dom-to-image `dtiScale` so the output always lands on a target long edge (e.g. `dtiScale = TARGET_W / captureWidth`). A constant output size also makes the Instagram presets predictable.


### [P2] Watermark visibility is keyed to `appState.darkMode`, not to the actual background colour
- **Area:** `exportPNG` / `copyImageToClipboard` non-Pro watermark
- **Repro:** set `appState.bgColor = '#ffffff'` while `appState.darkMode` is true, export, inspect the bottom-right.
- **Evidence:** `out/A4-wm-crop-lightbg-darkflag.png` vs `out/A4-wm-crop-dark.png`. The fill is chosen as `appState.darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)'` (index.html:12063-12064) while the canvas background two lines earlier is chosen as `appState.bgColor || (appState.darkMode ? '#1a1a2e' : '#f5f5f5')` (index.html:11914) — i.e. the background honours a custom `bgColor` and the watermark does not.
- **Impact:** a user who picks a custom light background while on a dark theme gets a white-on-white watermark (invisible → free tier is un-branded); the inverse gives black-on-navy (invisible). Not destructive, but it means the free-tier attribution silently disappears for a subset of users.
- **Fix:** derive the watermark colour from the resolved `bgColor` luminance, not the theme flag.


### [P2] The scale bar is a hardcoded 180 units labelled "400 mi" — it understates distance by 20-30%
- **Area:** cartographic accuracy of the exported map
- **Repro:** `work/export/A8-scale-datamap.mjs` measures `getBBox()` on states with known ground dimensions and compares against the fixed scale-bar geometry.
- **Evidence:** the bar is drawn as a literal `<line x1="0" x2="180">` with static labels `0 / 200 / 400 mi` (index.html:5166-5174; regenerated identically by `renderScaleBar()` at index.html:12694+, where `midVal`/`endVal` are string constants `'200'`/`'400 mi'` — never computed).
  | reference | SVG bbox | true ground size | implied mi/unit | ⇒ 180 units = |
  |---|---|---|---|---|
  | Colorado E-W (7° lon @ 39°N) | 130.69 | 376.2 mi | 2.879 | **518 mi** |
  | Colorado N-S (4° lat) | 103.54 | 276.4 mi | 2.669 | **481 mi** |
  | Wyoming E-W (7° lon @ 43°N) | 125.52 | 354.1 mi | 2.821 | **508 mi** |
  | Wyoming N-S (4° lat) | 104.51 | 276.4 mi | 2.645 | **476 mi** |
  Four independent measurements converge on **2.65-2.88 mi/unit**; the printed label implies **2.22 mi/unit**. The bar should read roughly **"500 mi"**, or be redrawn at ~145 units to mean 400 mi. The metric variant (`640 km`) is internally consistent with the wrong mile figure, so it is wrong by the same margin.
- **Impact:** every exported map carries a measurably incorrect scale bar. For a product whose parent company is positioning a professional GIS tool (Mapparatus), a wrong scale bar on shared artwork is a credibility problem, and it is the kind of thing map-literate people on Reddit notice and comment on.
- **Secondary (P3):** the scale bar is shown on an **Albers USA composite** projection, in which Alaska is scaled to roughly 0.35x and Hawaii is repositioned. A single scale bar is not valid for a composite projection at all — it can only ever describe the CONUS portion. Either restrict the bar visually to the CONUS area with a note, or drop it. (County mode already hides it, which is the right call.)
- **Fix:** derive the bar from the projection. `d3.geoAlbersUsa().scale(1300)` gives ≈ 3959/1300 ≈ 3.05 mi per unit at the standard parallels; the measured 2.75 average reflects Albers' equal-area distortion. Compute the label from the measured value and pick a round number (250 / 500 mi), or size the bar to hit a round number exactly.



## Minor — P3


### [P3] The anonymous tier gets a *cleaner* export than the signed-in free tier
- **Area:** `const cleanExport = perm.anonymous || isPro()` (index.html:12053, repeated at index.html:12157 in `copyImageToClipboard`)
- **Evidence:** `checkExportPermission()` (index.html:11689-11694) returns `anonymous: true` for a not-signed-in user's one free export, so that export carries **no `tappymaps.com` watermark**. A signed-in free user's 3 monthly exports **do** carry it.
- **Impact:** the least-invested user produces the most shareable, least-branded asset, and signing up visibly downgrades the output. That is backwards for both growth (no attribution on the most-shared asset) and conversion (sign-up is a punishment).
- **Fix:** watermark the anonymous export too, or drop the watermark for free signed-in users and differentiate Pro on something else.


### [P3] `copyImageToClipboard` hardcodes the watermark offsets that `exportPNG` computes
- **Location:** index.html:12167-12168 uses `canvas.width - 48, canvas.height - 24`; index.html:12065-12066 uses `canvas.width - (16 * scaleFactor), canvas.height - (8 * scaleFactor)`. They agree only because `scaleFactor` happens to be 3 in both. `copyImageToClipboard` also omits the `ctx.save()`/`ctx.restore()` pair that `exportPNG` wraps around the draw.
- **Fix:** extract a single `drawWatermark(canvas, scaleFactor)` helper; two copies of the same branding rule will drift.



## Verified working


### [PASS] Core landscape export is correct and deterministic
- **Area:** `captureMapImage()` landscape path
- **Repro:** `work/export/A1-core.mjs` — build a 12-state / 3-entry-legend map at 1440x900, call `captureMapImage({aspect:'landscape'})`.
- **Evidence:** `out/A1-landscape.png` — **3252x2286, ratio 1.4226** (target 1010/710 = 1.42254). Title, subtitle, source line, legend, compass rose, scale bar and pin+wordmark logo all present and inside the frame; nothing clipped; all 51 paths render.
- **Location:** index.html:11783 `captureMapImage`
- **Impact:** none — this is the good path.
- **Notes:** exported 3x at scale 3; three consecutive landscape captures produced **byte-identical PNGs** (md5 `e061820c672d` x3), and a full before/after snapshot of `#mapContainer` (width/height/flex/flex-basis/overflow), `#mapSVG` (flex/height/width/transform/min-height/transition), `#mapTitle` display, `#legendDisplay` cssText + computed corner + client rect, `#statsBar` display/visibility and `window.scrollY` showed a **zero-item diff** after four captures across four aspect ratios. Restore discipline in the `finally` block is genuinely airtight. **Zero console errors** throughout.


### [PASS] Portrait mobile export still produces a correct landscape 1010:710 frame
- **Area:** the historic mobile-portrait crop bug
- **Repro:** `work/export/A4-multi.mjs` §1 — 390x844 viewport, `isMobile`/`hasTouch`, DPR 3, iPhone UA.
- **Evidence:** live `#mapContainer` measured **390 x 748** (a tall portrait box). Export came out **2400x1686, ratio 1.4235** — landscape, not portrait, nothing cropped from the bottom. `out/A4-mobile-portrait-390x844.png`. `#mapTitle` computed `display:block` at capture. Zero console errors.
- **Notes:** the `flex:'none'` / `flexBasis:'auto'` opt-out at index.html:11883 is doing its job here; this regression has not returned.


### [PASS] No diagonal text watermark has returned
- **Evidence:** `#freeWatermark` measured at capture time has `childElementCount === 0` and `display:none`; `updateProGates()` (index.html:12208-12212) actively empties it on every call. The only on-canvas brand element is the `#logoWatermark` pin+wordmark, which is present in every export at every aspect ratio and for every tier.


### [PASS] Florida overlap does NOT reproduce on desktop landscape at any legend size
- **Area:** the known-unresolved "Florida overlap on bottom-right export" item
- **Repro:** `work/export/A4-multi.mjs` §2 — sweep `legendEntries` over 3 / 6 / 9 / 12 entries with `legendPosition:'bottom-right'`, measuring the legend rect against Florida's path rect at the instant of capture.
- **Evidence:**
  | legend entries | legend rect | Florida rect | overlap px² | % of Florida covered |
  |---|---|---|---|---|
  | 3 | 934,644 194x150 | 729,576 138x120 | **0** | 0% |
  | 6 | 934,554 194x240 | same | **0** | 0% |
  | 9 | 934,464 194x330 | same | **0** | 0% |
  | 12 | 926,374 202x420 | same | **0** | 0% |
  Florida's right edge is at x=867; the legend's left edge never comes further left than x=926. A 59px gutter survives even a 12-entry legend.
- **Assessment:** the mitigation noted in CLAUDE.md (translucent legend + smaller export sizing) appears to have actually **closed** this at desktop landscape. It should be re-checked in the taller aspects once the `max-height` P0 is fixed, because that changes where the legend lands; and note the *square* aspect scales the map up to fill the width, moving Florida ~150px right, which is the remaining risk surface.


### [PASS] Data-map / choropleth export captures correctly
- **Repro:** `work/export/A9-datamap.mjs` — all 51 paths on a 5-step sequential ramp, 5-entry legend titled "Total Population (2023)", census-style source line, no subtitle.
- **Evidence:** `out/A9-datamap-choropleth.png` — 3252x2286. All 51 states filled, legend bottom-right and fully inside the frame, legend title rendered, source line correct, logo and compass and scale bar present, no clipping. Notably **state labels stay legible across the whole ramp** — the label fill flips to dark on light ramp steps (CA/UT/MN/MO/KY/AL/GA/SC all readable on near-white fills, WA/CO/NE on dark fills readable in white), so luminance-aware label contrast is working.
- **Note (P3, UNVERIFIED in production):** `executeDataMapLoad('population')` against the local `/api/census` stub **resolved successfully but applied nothing** — 0 states recoloured, legend untouched, no thrown error, no console output, no user-facing message. The stub's column header differs from the real ACS variable code, so this is most likely a stub artifact rather than a production bug; but it does demonstrate that an unexpected Census response shape fails *silently* rather than surfacing "couldn't load this dataset". Worth a defensive check on the parsed row count.


### [PASS] Restore is effectively perfect — the live editor is unchanged after exporting
- **Repro:** `work/export/B2-delta.mjs` walks all **173** descendant nodes of `#createMap` before and after an export, comparing bounding rect + `display`/`opacity`/`visibility`/`font-size`/`transform`/`background-color`. `work/export/B3-control.mjs` establishes a screenshot noise floor.
- **Evidence:** **0 differences across 173 nodes.** Two consecutive `#createMap` element screenshots with no export between them are byte-identical (control passes, so the harness is not noisy). After an export the screenshot differs by **4 bytes out of 136,377** — no measurable geometry or style change, consistent with the legend's `backdrop-filter: blur(8px)` layer being recomposited by the `updateLegendDisplay()` call in the `finally` block. Visually undetectable.
- **Also verified:** a live pinch-zoom transform (`scale(1.8) translate(30px,-20px)`) is cleared for the capture and **restored exactly** afterwards (`svg.style.transform` reads back identical), and three consecutive exports across three different aspect ratios leave the editor in its original state.


### [PASS] Zero console errors anywhere in the export pipeline
Across **9 separate Playwright runs** — desktop and iPhone viewports, four aspect ratios, county mode, choropleth, forced-fallback, zoomed capture, repeated captures — the harness collected **no console errors, no page errors and no failed network requests**. The only error surfaced in the entire audit was the deliberately-forced html2canvas failure.

## Ideas

1. **One composition module, three consumers.** The client PNG export, `exportSVG()` and `api/render.js` each re-implement "where does the title / legend / source / logo go" — and all three disagree. Extract a single `composeMap(state, frame)` that returns positioned primitives, and have all three render from it. This closes the OG-parity gap, fixes the SVG export's missing title and legend, and makes future aspect ratios a one-line change instead of a three-file change.

2. **Make the export frame device-independent.** Right now `captureWidth = max(mapContainer.offsetWidth, 800)` means output resolution *and* typography depend on the user's window size — 3252px wide on desktop, 2400px on a phone, with a 52px title in one and a 16px title in the other. Pin a logical export canvas (say 1200x843) and a typography scale derived from it, and let `dtiScale` hit a constant target long edge. Exports then look identical from every device, which is also a prerequisite for any golden-image testing.

3. **Lay out the tall aspects instead of letterboxing them.** Story exports are ~35% map and ~65% empty navy. Rather than stretching the SVG to the full residual height and centring the artwork, stack the blocks deliberately: title, map at its natural 1.4225 aspect, then legend + source + logo in the band underneath. The empty space in a 9:16 frame is not a problem to be centred around — it is room for the legend, which currently has to sit on top of the map.

4. **Golden-image regression tests in `npm run smoke`.** Every bug in this report except the fallback would have been caught by capturing at four aspects plus county plus choropleth and asserting on *layout anchors* — title bbox, legend bbox, logo bbox, states bbox, output dimensions — against committed baselines. Anchors rather than pixels keeps it stable across font rendering. The smoke harness already boots every mode; this is a natural extension of it.

5. **Anchor the logo to the frame, not the projection.** `#logoWatermark` is an SVG `<g>` at a fixed `translate(330,570)` in national-Albers space, which is why county mode loses it. Moving it to an absolutely-positioned HTML element inside `#mapContainer` makes the brand rule structurally true — it survives county mode, zoom, and any future projection or aspect change, instead of being true by coincidence at one viewBox.

6. **Instrument which renderer actually ran.** `trackEvent('export_png', …)` already fires; add `renderer: 'dom-to-image' | 'html2canvas'` and a `failed` flag. Nobody currently knows how often the primary path fails in the wild — which is exactly why a dead fallback survived. One extra field turns an invisible failure mode into a dashboard number.

7. **Assert that no modern colour function appears inside `#mapContainer`.** The fallback died because a purely cosmetic frosted-glass tweak on the legend emitted `color-mix()`, which html2canvas 1.4.1 cannot parse. A five-line smoke assertion walking the capture subtree for `color-mix(` / `oklch(` / `lab(` would have caught it at the commit that introduced it, and will catch the next one.

8. **Round-trip the whole map in the share payload.** `encodeStateToURL()` carries only colours, legend, title, subtitle, legendTitle and source. Background colour, legend corner, county view and county colours are all lost — so a shared link cannot reproduce the map the author made, and `api/render.js` *cannot* match it however well it is written. Adding `bg`, `pos` and county state is additive and backward-compatible, and it is the unlock for the OG image finally looking like the real thing.
