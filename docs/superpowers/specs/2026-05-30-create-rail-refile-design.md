# Create Rail Refile — Panel Taxonomy Cleanup (Design)

**Status:** Brainstormed + approved by Max on 2026-05-30. Ready for `writing-plans` to convert into an implementation plan.

**Source:** Follows the Phase 1 mode-router + 5-panel Create rail (shipped `619e309`, 2026-05-29). This is a post-Phase-1 polish pass on the *contents and labels* of the Create-mode left rail — no router, routing, or Hub changes.

**Trigger:** User feedback while using the live editor — "the legend menu seems pointless almost… rethinking the categories" and "the quick fill menu in legend shouldn't be there." Diagnosis confirmed by reading the panels: Quick Fill (a state-*selection* tool) was misfiled under Legend purely because the old sidebar stacked them adjacently, and the Legend got its own top-level panel despite its display half being a map decoration like north arrow / scale bar.

**Approach (locked during brainstorm):** Option C — "Keep friendly names, just refile." No GIS jargon ("symbology" rejected as too technical for the casual/playful brand). Smallest conceptual change: keep the casual panel names, move the two misfiled pieces, rename one panel. All work is re-parenting + relabeling — no logic changes, no event re-wiring (Phase 1's cutover uses `appendChild`, which preserves attached listeners).

---

## Scope locked

| Question | Answer |
|---|---|
| Taxonomy | Keep friendly names; refile two pieces; rename Legend → Map Elements |
| "Symbology" naming | Rejected (too technical for casual brand) |
| Quick Fill home | Color panel (below the palette) |
| Legend builder fate | Kept (demoted from own panel into Map Elements), auto-populate leads |
| Undo/Redo/Clear All | Stay in Map panel for now (top-bar move deferred, not bundled) |
| Map decorations (north arrow/scale/title/bg/source) | Move from Map panel → Map Elements |
| Router / Hub / mobile IIFE | Untouched |

---

## Target state

**Rail stays 5 icons:** `Map · Color · Map Elements · Data · Pro`. Only the 3rd icon (was "Legend") changes label + glyph.

| Panel | Contents | Delta vs. today |
|---|---|---|
| **Map** | Browse Templates · County View (+ Back to States) · Undo / Redo · Clear All | **loses** the Display block (moves to Map Elements) |
| **Color** | palette grid · custom color · colorblind-safe · more palettes · color ramps (PRO) · **Quick Fill (PRO)** | **gains** Quick Fill |
| **Map Elements** *(renamed from "Legend")* | **Legend** (title + entries + "Add Colors from Map" + position) · **North arrow** (toggle/position/color/style) · **Scale bar** (toggle/position/unit/color/style) · **Show labels** · **Title color** · **Background** · **Source citation** | **renamed**; **gains** the Display block; **loses** Quick Fill |
| **Data** | ACS datasets (PRO) | unchanged |
| **Pro** | upgrade CTA | unchanged |

Rationale for the fix:
- **Quick Fill → Color**: it applies the *currently selected color* to a *selection of states* (regions / coastal / Original 13 / fill-empty / invert). It belongs next to where you pick the color, not the legend.
- **Legend demoted into Map Elements**: the legend's two jobs split — *building* the color→label list (mostly auto-populated via "Add Colors from Map") and *displaying* it (show + corner position). The display half is a map decoration, identical in kind to north arrow and scale bar. Folding the whole legend into "Map Elements" makes it one element among several instead of a top-level category — which is what removes the "pointless" feeling. The builder is **kept** (exported maps still need a legend to explain colors); it is not deleted, just relocated, with auto-populate as the primary action.

---

## Exact code touch-points (`index.html`, main `<script>` block — Block 0)

All line numbers are as of this writing; grep to re-confirm before editing (the file has two `<script>` blocks and line numbers drift).

**1. Rail button — line 2897.** Change the 3rd `.rail-btn`:
- `data-panel="legend"` → `data-panel="elements"`
- `aria-label="Legend"` `title="Legend"` → `"Map Elements"`
- Swap the legend-rows SVG glyph for a decorations/layers-style glyph (e.g. stacked map-pin + compass, or layered squares). Keep `width/height/viewBox/stroke` identical to siblings for visual consistency.

**2. Panel section — line 2923.** Rename the section + heading:
- `id="createPanelLegend"` → `id="createPanelElements"`
- `<h3 class="create-panel-heading">Legend</h3>` → `Map Elements`

**3. `switchPanel()` ids array — line 3827.** Replace `'createPanelLegend'` with `'createPanelElements'`. (The `'createPanel' + Cap(name)` convention means `data-panel="elements"` → `createPanelElements`, so the button and array must agree.)

**4. `setupCreateCutover()` slot targets.** Three `slot()` calls change. Panel child order equals slot() **call order** (each `slot` does an `appendChild`), so order matters — `secDisplay` currently executes early (targeting Map) and `legendContent` late (targeting Legend). Do this:
- `slot('quickFillSection', 'createPanelLegend')` → `slot('quickFillSection', 'createPanelColor')` (retarget in place)
- `slot('legendContent', 'createPanelLegend')` → `slot('legendContent', 'createPanelElements')` (retarget in place)
- **Move** the `slot('secDisplay', …)` call out of the Map group and place it **immediately after** the `legendContent` line, retargeted to `'createPanelElements'`.

Resulting Map Elements child order: `<h3>Map Elements</h3>` → legend builder (`legendContent`) → Display block (`secDisplay`: north arrow / scale / labels / title / bg / source). If minimal-diff is preferred over this order, retargeting `secDisplay` in place (Display block above the legend builder) is acceptable — but pick deliberately; do not leave it to accident.

**No other files change.** No CSS rule changes required (panels are generic `.create-panel-content`; the rail button styling is class-based, not id-based).

---

## Do NOT touch (constraints)

- **`gateProFeature('legend')` at lines 7681 / 7685 / 9001** — this is the PRO-feature *key* for legend functionality, NOT the panel id. Renaming it would break the legend's Pro gate. Leave as `'legend'`.
- **`#mapTitle`** (on-map title) and **`captureMapImage()`** — export path, out of scope, unchanged.
- **`#sourceInput`** keeps its full autofill-defeat attribute set (`readonly` / `autocomplete="off"` / `data-1p-ignore` / `data-lpignore` / `name="map-source-citation"`) when it moves with `secDisplay`. Re-parenting via `appendChild` preserves all attributes and listeners, so the three-layer defeat stays intact — do not strip or simplify it.
- **PRO chips stay at subsection level.** Quick Fill's `pro-badge-inline` (line 3115) and Ramps' chip (line 2996) ride along into the Color panel. Color thereby becomes a *mixed* free/PRO panel — that is intended. The chips must remain pinned to the Quick Fill / Ramps subsections, never promoted to the Color panel header, or free users will think the whole palette is gated.
- **Block 1 (Mobile-UX IIFE)** — untouched. Its char count must stay constant (33,371) as proof the edit didn't disturb it. The dormant mobile chrome is hidden by `body[data-mode] .mobile-*`, so no mobile-side changes are needed.
- **`_createCutoverDone` guard** — the cutover still runs exactly once; we only change *where* nodes land, not the guard.

---

## Defaults chosen (flag to change)

1. **Manual legend builder kept** inside Map Elements, auto-populate ("Add Colors from Map") leading. Not deleted.
2. **Undo / Redo / Clear All stay in the Map panel.** A top-bar relocation is a sensible follow-up but is explicitly out of scope here.
3. **Label "Map Elements."** Alternatives on request: "Extras", "Decorations", "Layout".

---

## Out of scope / deferred

- Top-bar relocation of Undo/Redo/Clear All.
- Per-element regrouping inside Map Elements (e.g. extracting the "Legend position" select out of the `secDisplay` block to sit directly under the legend builder, and relabeling `secDisplay`'s "Display" sub-title). The minimal refile moves `secDisplay` wholesale; a tighter element-by-element grouping is a later polish.
- Any Hub, router, routing, mobile-IIFE, or export-path change.
- Removing the legend builder entirely / going auto-only.

---

## Acceptance criteria

1. Rail reads `Map · Color · Map Elements · Data · Pro`; 3rd icon labeled "Map Elements" with a new glyph; tooltip + aria match.
2. Clicking **Color** shows palette **and** Quick Fill (regions / geography / fun / fill-all-empty-invert / multi-select), with Quick Fill still PRO-chipped.
3. Clicking **Map Elements** shows the legend builder (title + entries + Add Colors from Map + Add Entry Manually) **and** north arrow, scale bar, show-labels, title color, background, source citation.
4. Clicking **Map** shows Browse Templates, County View, Undo/Redo, Clear All — and no longer shows the Display block.
5. Quick Fill chips, legend auto-populate, north arrow / scale toggles, and the Source field all still function (listeners preserved by re-parenting) — verified live, not from static reading.
6. `python _validate.py` → `Block 0: PASS`, `Block 1: PASS`, **Block 1 char count unchanged at 33,371**.
7. Source field still resists Chrome email autofill after the move.

---

## Validation & testing

- Run `python _validate.py` after the edit (mandatory — two-script-block syntax check).
- Live-verify in a browser (the rail is interactive UI; static analysis is insufficient per project rule). Hard-load of `/design/make` 404s under `python -m http.server` (no Vercel rewrite locally) — load `/` then `Router.navigate('/design/make')` in the console, or verify on the deployed preview.
- Per the mobile-verification rule: any mobile-relevant claim ships as "candidate, please verify on phone." This change is desktop-rail-focused and the mobile IIFE is dormant, but the rail is used at all viewport sizes in Create mode, so confirm on a phone before calling it done.
