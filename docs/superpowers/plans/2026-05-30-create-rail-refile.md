# Create Rail Refile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the Create-mode left rail so Quick Fill lives under Color and the legend builder + map decorations live together under a renamed "Map Elements" panel — fixing the "Legend menu feels pointless" and "Quick Fill shouldn't be in Legend" feedback.

**Architecture:** Pure re-parenting + relabeling inside the single-file app `index.html`. No logic changes, no event re-wiring. Phase 1's `setupCreateCutover()` uses `appendChild` to home live DOM nodes into rail panels, and `appendChild` preserves attached listeners — so changing *which panel* a node lands in (and renaming a panel) is enough; every control keeps working untouched. The rail stays 5 icons (`Map · Color · Map Elements · Data · Pro`); only the 3rd panel is renamed and three `slot()` targets move.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step, no test framework. Verification is `python _validate.py` (two-`<script>`-block `node --check`) plus mandatory live browser verification.

**Spec:** `docs/superpowers/specs/2026-05-30-create-rail-refile-design.md` (approved by Max 2026-05-30, committed `2a3ff46`).

---

## File Structure

Only one file changes: **`C:\Users\mhowe\tappymaps\index.html`**. There are five touch-points across two `<script>`-adjacent regions of the file, all in the main app markup + Block 0 script:

| Region | Line (re-confirmed 2026-05-30) | What it is |
|---|---|---|
| Rail button | 2897–2899 | The 3rd `.rail-btn` (was "Legend"): `data-panel` attr, aria/title, and its SVG glyph |
| Panel section | 2922–2925 | The `<section id="createPanelLegend">` + its `<h3>` heading + the HTML comment above it |
| `switchPanel()` ids array | 3827 | The array of panel ids that `switchPanel` hides/shows |
| `setupCreateCutover()` slot block | 3905–3913 | The `slot()` calls that `appendChild`-home each control into a panel |

No CSS rule changes (panels are generic `.create-panel-content`; the rail button is styled by class, not id). No other file changes.

### Why two tasks (decomposition rationale)

- **Task 1 is the behavioral refile** and must be **atomic** — the `data-panel` attribute, the panel `id`, the `switchPanel` ids array, and the `slot()` target string form one contract (`switchPanel` builds the target id as `'createPanel' + Cap(name)`). Renaming any one without the others silently breaks the panel. So all four land in one commit. This task also moves Quick Fill → Color and the Display block → Map Elements via the slot block.
- **Task 2 is the glyph swap** — purely cosmetic, edits a *different child* (the `<svg>`) of the same button, and is independently testable. It depends on Task 1 only in commit order. Splitting keeps each edit small and the behavioral change reviewable on its own.

---

## Constraints — DO NOT TOUCH (carry into every task)

- **`gateProFeature('legend')` at lines 7681 / 7685 / 9001** — this is the PRO-feature *key* for legend functionality, NOT the panel id. Leave the string `'legend'` exactly as-is. Renaming it breaks the legend's Pro gate.
- **`#mapTitle`** and **`captureMapImage()`** — export path, out of scope, unchanged.
- **`#sourceInput`** rides along inside `secDisplay` when it moves to Map Elements. Re-parenting via `appendChild` preserves all attributes + listeners, so its three-layer autofill defeat (`readonly` / `autocomplete="off"` / `data-1p-ignore` / `data-lpignore` / `name="map-source-citation"` + the CSS `:-webkit-autofill` override + the JS email-clearing sweeps) stays intact. **Do not strip or simplify any layer.**
- **PRO chips stay at subsection level.** Quick Fill's `pro-badge-inline` (line ~3115) and the Ramps chip (line ~2996) ride along into Color. Color becomes a *mixed* free/PRO panel — intended. Never promote a chip to the Color panel header (free users would think the whole palette is gated).
- **Block 1 (Mobile-UX IIFE)** — untouched. Its char count must stay **33,371** as proof the edit didn't disturb it.
- **`_createCutoverDone` guard** — the cutover still runs exactly once; we only change *where* nodes land.
- **`TESTER_MODE`** and all tester-code logic — untouched.

---

### Task 1: Atomic taxonomy refile (rename panel + move Quick Fill + move Display block)

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html` (4 edits — rail button attrs @2897, panel section @2922–2924, switchPanel array @3827, slot block @3905–3913)

> All four edits MUST be committed together. After edit 1 alone the panel id no longer matches `switchPanel`, so the panel would not show — only the full set keeps working software.

- [ ] **Step 1: Edit the rail button attributes (line 2897)**

This edit changes ONLY the `<button>` opening tag attributes. The glyph on line 2898 is left alone (Task 2 swaps it).

old_string:
```html
        <button type="button" class="rail-btn" data-panel="legend" aria-label="Legend" title="Legend">
```
new_string:
```html
        <button type="button" class="rail-btn" data-panel="elements" aria-label="Map Elements" title="Map Elements">
```

- [ ] **Step 2: Rename the panel section id, heading, and stale comment (lines 2922–2924)**

old_string:
```html
        <!-- Legend panel: legend builder -->
        <section class="create-panel-content" id="createPanelLegend" style="display:none">
          <h3 class="create-panel-heading">Legend</h3>
```
new_string:
```html
        <!-- Map Elements panel: legend builder + map decorations -->
        <section class="create-panel-content" id="createPanelElements" style="display:none">
          <h3 class="create-panel-heading">Map Elements</h3>
```

- [ ] **Step 3: Update the `switchPanel()` ids array (line 3827)**

old_string:
```javascript
      const ids = ['createPanelMap', 'createPanelColor', 'createPanelLegend', 'createPanelData', 'createPanelUpgrade'];
```
new_string:
```javascript
      const ids = ['createPanelMap', 'createPanelColor', 'createPanelElements', 'createPanelData', 'createPanelUpgrade'];
```

- [ ] **Step 4: Retarget + reorder the slot block (lines 3905–3913)**

This is a whole-block replacement (reordering lines is error-prone as individual edits). Net effect: `secDisplay` leaves the Map group; Quick Fill moves to Color (below the palette); the legend builder + Display block sit together under Map Elements, legend builder first.

old_string:
```javascript
      slot('secTemplatesBtn',  'createPanelMap');    // Browse Templates
      slot('secDisplay',       'createPanelMap');    // labels/arrow/scale/legend pos/colors/SOURCE
      slot('secProFeatures',   'createPanelMap');    // County View
      slot('secActions',       'createPanelMap');    // Clear All (undo/redo also top-bar)
      slot('secColorPalette',  'createPanelColor');  // palette + custom color + ramps
      slot('legendContent',    'createPanelLegend'); // legend builder
      slot('quickFillSection', 'createPanelLegend'); // region/geo/fun fill
      slot('dataMapSection',   'createPanelData');   // ACS datasets
      slot('secExport',        'createSharePopover');// export/share/save/load
```
new_string:
```javascript
      slot('secTemplatesBtn',  'createPanelMap');      // Browse Templates
      slot('secProFeatures',   'createPanelMap');      // County View
      slot('secActions',       'createPanelMap');      // Clear All (undo/redo also top-bar)
      slot('secColorPalette',  'createPanelColor');    // palette + custom color + ramps
      slot('quickFillSection', 'createPanelColor');    // region/geo/fun fill (moved from Legend)
      slot('legendContent',    'createPanelElements'); // legend builder
      slot('secDisplay',       'createPanelElements');  // north arrow/scale/labels/title/bg/SOURCE
      slot('dataMapSection',   'createPanelData');     // ACS datasets
      slot('secExport',        'createSharePopover');  // export/share/save/load
```

Resulting child orders:
- **Map:** Templates → County View → Clear All (lost the Display block)
- **Color:** `<h3>Color</h3>` → palette → Quick Fill
- **Map Elements:** `<h3>Map Elements</h3>` → legend builder → Display block (north arrow / scale / labels / title color / background / source)

- [ ] **Step 5: Validate both script blocks**

Run:
```powershell
Set-Location C:\Users\mhowe\tappymaps
python _validate.py
```
Expected: `Block 0 (NNN chars): PASS` and `Block 1 (33371 chars): PASS`. **Block 1 must read exactly 33371** — any other number means the Mobile-UX IIFE was disturbed; stop and diff. Non-zero exit = a syntax error was introduced; fix before continuing.

- [ ] **Step 6: Live-verify in a browser**

`/design/make` hard-loaded under `python -m http.server` 404s (no Vercel rewrite locally). Load `/` then navigate via the console:
```powershell
python -m http.server 8000
```
In the browser console at `http://localhost:8000/`:
```javascript
Router.navigate('/design/make')
```
Confirm:
1. Rail reads `Map · Color · Map Elements · Data · Pro`; the 3rd icon's tooltip + aria say "Map Elements".
2. **Color** panel shows the palette **and** Quick Fill below it, Quick Fill still PRO-chipped.
3. **Map Elements** panel shows the legend builder (title + entries + Add Colors from Map + Add Entry Manually) **and** north arrow, scale bar, show-labels, title color, background, source citation.
4. **Map** panel shows Browse Templates, County View, Undo/Redo, Clear All — and no longer the Display block.
5. Click a Quick Fill chip (e.g. a Census Region), toggle the north arrow, type in the Source field — all still function (listeners preserved). Source field still resists email autofill.

This is a UI change; do NOT mark the task done on static reading alone.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(create): refile Create rail — Quick Fill to Color, Legend panel to Map Elements

Quick Fill (a state-selection tool) moves from the Legend panel to the
Color panel below the palette. The Legend panel is renamed "Map Elements"
and gains the Display block (north arrow / scale / labels / title / bg /
source), folding the legend builder in as one element among several.
Re-parenting only — appendChild preserves listeners, no logic changes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Swap the rail glyph (Legend → Map Elements)

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html` (1 edit — the SVG on line 2898)

> Cosmetic only. The old glyph is legend-rows (lines + bullets); the new one is a stacked-layers diamond, which reads as "map elements / decorations." Width/height/viewBox/stroke stay identical to sibling rail icons so the rail keeps a consistent look.

- [ ] **Step 1: Replace the rail button's SVG (line 2898)**

old_string:
```html
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="4" height="4"/><rect x="3" y="11" width="4" height="4"/><rect x="3" y="17" width="4" height="2"/><line x1="10" y1="7" x2="21" y2="7"/><line x1="10" y1="13" x2="21" y2="13"/><line x1="10" y1="18" x2="21" y2="18"/></svg>
```
new_string:
```html
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 L21 8 L12 13 L3 8 Z"/><path d="M3 13 L12 18 L21 13"/></svg>
```

- [ ] **Step 2: Validate both script blocks**

Run:
```powershell
Set-Location C:\Users\mhowe\tappymaps
python _validate.py
```
Expected: `Block 0 (NNN chars): PASS`, `Block 1 (33371 chars): PASS`. (This edit is markup-only, but run anyway — the validator is the cheap guard against accidentally breaking a `<script>` boundary.)

- [ ] **Step 3: Live-verify the glyph**

Reload `http://localhost:8000/`, `Router.navigate('/design/make')`, and confirm the 3rd rail icon now shows the layered-diamond glyph at the same size/stroke as its neighbors, and still selects the Map Elements panel when clicked.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
feat(create): swap rail glyph for Map Elements panel

Replace the legend-rows icon with a stacked-layers diamond that reads as
"map elements / decorations." Dimensions + stroke match sibling rail icons.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Acceptance criteria (whole plan)

1. Rail reads `Map · Color · Map Elements · Data · Pro`; 3rd icon labeled "Map Elements" with the new layered glyph; tooltip + aria match.
2. **Color** shows palette **and** Quick Fill (regions / geography / fun / fill-all-empty-invert / multi-select), Quick Fill still PRO-chipped.
3. **Map Elements** shows the legend builder **and** north arrow, scale bar, show-labels, title color, background, source citation.
4. **Map** shows Browse Templates, County View, Undo/Redo, Clear All — no Display block.
5. Quick Fill chips, legend auto-populate, north arrow / scale toggles, and the Source field all still function (verified live).
6. `python _validate.py` → `Block 0: PASS`, `Block 1: PASS`, **Block 1 char count unchanged at 33,371**.
7. Source field still resists Chrome email autofill after the move.
8. The rail is used at all viewport sizes in Create mode — confirm the panels render on a phone-width viewport before calling it fully done (candidate until device-verified, per the mobile-verification rule).
