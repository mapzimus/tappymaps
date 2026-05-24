# Tappymaps Reimagining — Phase 0 (Foundation + Audit Fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 10-item Phase 0 punch list from the design spec — audit-fix work with no design decisions, no new architecture, no new files in `src/`. Closes the gap between the current live state and a clean foundation for Phase 1's mode router + Editor refresh.

**Architecture:** Surgical edits to the single-file `index.html`. No build step. Each task lands as one commit + one push to `master` (auto-deploys via Vercel). Validation is via `node --check` on extracted `<script>` blocks (cartographer agent's existing pattern) + `chrome-devtools-mcp` for browser-side observation.

**Tech Stack:** Vanilla HTML/CSS/JS (the existing tappymaps stack), Node (for `--check`), Python (for the JS extractor helper), `chrome-devtools-mcp` (for verification), `gh` CLI + git via PowerShell.

**Source spec:** `docs/superpowers/specs/2026-05-23-tappymaps-reimagining-design.md` (commit `5e62f6d` on origin)

---

## File structure

**Files modified in Phase 0** (all in `C:\Users\mhowe\tappymaps\`):
- `index.html` — Tasks 2–9 all edit this single file (~9,900 lines)
- `HANDOVER.md` — Task 10 appends a Phase 0 completion section

**Files created** (gitignored — will not be committed):
- `_validate.py` — Task 1's JS extractor + `node --check` helper (matches existing `_*.py` ignore pattern)
- `_phase0_screens/` — temporary local screenshot dir for before/after comparisons (gitignore the dir manually or use `/c/Users/mhowe/AppData/Local/Temp/` since `.png`/`.PNG` at repo root are already gitignored)

**Files explicitly NOT touched in Phase 0** (deferred to Phase 1+):
- `.claude/CLAUDE.md` — gets the mode-router + new module map in Phase 1
- `.claude/agents/tappymaps-cartographer.md` — needs mode-router context that doesn't exist yet
- `api/stripe/*.js` — no Phase 0 changes (Pro plumbing is already solid post-`1ed6036`)
- All Notion databases — Dev Log entries are nice but not blocking

**External (not a code task):**
- Reddit Developer account application (Task 11) — runs in parallel with code work since Reddit approval takes days

---

## Pre-flight (do once before Task 1)

- [ ] **Verify dev env is ready**

Run from PowerShell:
```powershell
Set-Location C:\Users\mhowe\tappymaps
git status --short --branch
node --version
python --version
```

Expected: clean working tree on `master`, sync with `origin/master`, Node ≥18, Python ≥3.10.

- [ ] **Start local dev server in a background terminal**

Open a separate PowerShell window (keep it open during all Phase 0 work):
```powershell
Set-Location C:\Users\mhowe\tappymaps
python -m http.server 8000
```

Tappymaps will be reachable at `http://localhost:8000/` for fast iteration without needing to push between tests.

---

## Task 1: Validation helper (`_validate.py`)

**Purpose:** Reusable JS syntax check used by every subsequent task. Cartographer agent's tribal-knowledge pattern — extracts the two `<script>` blocks from `index.html`, runs `node --check` on each, reports PASS/FAIL.

**Files:**
- Create: `C:\Users\mhowe\tappymaps\_validate.py`

- [ ] **Step 1: Write the validator script**

Use Write tool to create `C:\Users\mhowe\tappymaps\_validate.py`:

```python
"""Phase 0 validator: extract <script> blocks from index.html and node --check each.

Cartographer agent pattern. Run after every JS edit before committing.

Exit code 0 if both blocks pass. Non-zero if any block fails (so you can chain
into && in shell).
"""
import os
import re
import subprocess
import sys

REPO = r"C:\Users\mhowe\tappymaps"
INDEX = os.path.join(REPO, "index.html")

html = open(INDEX, "r", encoding="utf-8").read()
# Match both inline <script> blocks (skip <script src=...>)
scripts = [
    s for s in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.DOTALL)
    if len(s) > 1000
]

if not scripts:
    print("ERROR: no inline <script> blocks found in index.html")
    sys.exit(2)

all_pass = True
for i, body in enumerate(scripts):
    tmp = os.path.join(REPO, f"_check{i}.js")
    open(tmp, "w", encoding="utf-8").write(body)
    r = subprocess.run(
        ["node", "--check", tmp],
        capture_output=True,
        text=True,
    )
    os.unlink(tmp)
    if r.returncode == 0:
        print(f"Block {i} ({len(body):>6} chars): PASS")
    else:
        print(f"Block {i} ({len(body):>6} chars): FAIL\n{r.stderr}")
        all_pass = False

sys.exit(0 if all_pass else 1)
```

- [ ] **Step 2: Run the validator (baseline — should PASS)**

```powershell
Set-Location C:\Users\mhowe\tappymaps
python _validate.py
```

Expected output:
```
Block 0 (NNNNNN chars): PASS
Block 1 (NNNNNN chars): PASS
```

If it FAILs on baseline, stop — there's a pre-existing syntax bug in `index.html` that needs fixing before any Phase 0 work. (Unlikely; the live site loads fine.)

- [ ] **Step 3: Confirm `_validate.py` is gitignored**

```powershell
git status --short _validate.py
```

Expected: empty output (file ignored). The existing `.gitignore` line `_*.py` covers it.

**No commit for Task 1** — `_validate.py` is a local helper, gitignored. It just needs to exist and run.

---

## Task 2: Drop diagonal "tappymaps.com" text watermark + enlarge pin+wordmark logo

**Purpose:** Spec §9 + Q11. The current diagonal text watermark dominates the live canvas (live audit flagged "a bit dominant on the live canvas, not just the export"). Removing it and enlarging the pin+wordmark logo is the brand-presence/visual-noise trade we made.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Find the diagonal watermark in source**

```powershell
Set-Location C:\Users\mhowe\tappymaps
```

Use Grep tool with pattern `tappymaps\.com` in `index.html`, output_mode=content, `-n` true. Note every line number that's part of a `<text>` or SVG `<g>` rendering the diagonal text.

Cross-reference with the live audit screenshot at `C:\Users\mhowe\AppData\Local\Temp\tm-audit-desktop-initial.png` to confirm which element is the diagonal watermark vs the pin+wordmark logo at the bottom.

- [ ] **Step 2: Take a "before" screenshot via chrome-devtools**

Open `http://localhost:8000/` via chrome-devtools-mcp `new_page` (or reuse existing tab via `list_pages` + `select_page`). Take screenshot:
```
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase0-t2-before.png", fullPage=true)
```

Expected: screenshot shows the diagonal "tappymaps.com" text on the live map.

- [ ] **Step 3: Remove the diagonal watermark SVG element**

Use Edit tool on `index.html`. Remove the SVG `<text>` (or `<g>`) element that renders the diagonal "tappymaps.com" text. Preserve the `nonColorable` set, the state SVG paths, and the bottom pin+wordmark logo group untouched.

Typical removal target (will need actual line range from Step 1):
```html
<!-- BEFORE removal -->
<text x="500" y="380" transform="rotate(-12 500 380)" font-size="..." fill-opacity="0.18" ...>tappymaps.com</text>

<!-- AFTER: line gone entirely (no replacement) -->
```

- [ ] **Step 4: Locate the pin+wordmark logo group and increase scale + opacity**

Use Grep for `translate(350, 575) scale(0.72)` (cartographer agent's documented coordinates for the watermark `<g>`). Change to:

```html
<!-- BEFORE -->
<g transform="translate(350, 575) scale(0.72)" opacity="0.45">...</g>

<!-- AFTER -->
<g transform="translate(330, 570) scale(1.0)" opacity="0.7">...</g>
```

Position shift (350→330, 575→570) is a small offset to keep the enlarged logo centered roughly where the old one sat. Eyeball-tune later if it lands awkwardly; this is a starting point.

- [ ] **Step 5: Validate JS syntax (no changes to JS in this task, but run anyway)**

```powershell
python _validate.py
```

Expected: both blocks PASS.

- [ ] **Step 6: Take "after" screenshot**

Reload the localhost page (`navigate_page(type="reload")`). Screenshot:
```
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase0-t2-after.png", fullPage=true)
```

Expected: no diagonal "tappymaps.com" text; bigger pin+wordmark logo visible in the bottom-center of the map. If the logo lands in a weird spot (overlapping Texas, etc.), tune the `translate(...)` numbers in `index.html` and re-screenshot.

- [ ] **Step 7: Commit**

```powershell
git add index.html
git commit -m @'
brand: drop diagonal text watermark, enlarge pin+wordmark logo

- Removes the rotated "tappymaps.com" diagonal <text> from the canvas
  (live audit flagged it as dominating the live map, not just exports).
- Pin+wordmark logo scale 0.72 -> 1.0, opacity 0.45 -> 0.7 so the
  brand stays present on every export.
- Per spec section 9: logo is always visible on all exports for all
  tiers; no Pro option to remove. Every shared map = stealth billboard.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

Wait ~30s for Vercel auto-deploy.

- [ ] **Step 8: Verify on production**

In the chrome-devtools tab, navigate to `https://tappymaps.com/` (hard refresh — Ctrl+Shift+R). Take screenshot. Confirm change is live.

---

## Task 3: Remove "Show Logo" toggle entirely

**Purpose:** Spec §9. Logo is now mandatory. The "Show Logo" toggle in the Display section becomes confusing dead UI.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Find the toggle and its handler**

Grep `index.html` for:
- `showLogo` (the appState field)
- `mobileToggleLogo` (the mobile UI checkbox id from cartographer agent's audit knowledge)
- `Show Logo` (the UI label)
- `appState.showLogo` (read sites)
- `#logoWatermark` (the element being toggled)

Note every line number where any of these appear.

- [ ] **Step 2: Establish failing observation via JS probe**

In chrome-devtools-mcp, evaluate on `http://localhost:8000/`:
```js
() => ({
  toggleExists: !!document.getElementById('mobileToggleLogo'),
  desktopToggleExists: !!document.getElementById('toggleLogo'),
  showLogoField: typeof appState !== 'undefined' && 'showLogo' in appState,
})
```

Expected (current state): all three values `true`.

- [ ] **Step 3: Remove the UI elements**

Edit `index.html`:
- Delete the `<div>` / `<label>` containing the desktop "Show Logo" toggle (the `<input id="toggleLogo">` and surrounding markup).
- Delete the corresponding mobile toggle row (`<input id="mobileToggleLogo">` and its label).

- [ ] **Step 4: Remove the JS handlers + state field**

Edit `index.html`:
- Remove the `wire('mobileToggleLogo', 'change', function(e) {...})` block (the cartographer agent doc shows this is around line 7625 in the current file — Grep for the exact ID).
- Remove the desktop `document.getElementById('toggleLogo')?.addEventListener(...)` if present.
- Remove `appState.showLogo = true` (or similar default) from the initial state declaration.
- Find all reads like `if (appState.showLogo)` — replace each with the bare unconditional path (i.e., logo always renders).
- Find any `#logoWatermark` element manipulations that toggle `display` based on `showLogo` — remove the toggle code. The logo element stays in the DOM, always visible.

Grep pattern to catch read-sites: `appState\.showLogo|showLogo`. Audit each carefully.

- [ ] **Step 5: Run validator**

```powershell
python _validate.py
```

Expected: both blocks PASS.

- [ ] **Step 6: Verify removal via JS probe**

Reload localhost. Re-run the Step 2 probe. Expected:
```json
{ "toggleExists": false, "desktopToggleExists": false, "showLogoField": false }
```

Also check the logo element is still rendering:
```js
() => ({
  logoElement: !!document.getElementById('logoWatermark'),
  logoDisplay: getComputedStyle(document.getElementById('logoWatermark')).display,
})
```

Expected: `{ "logoElement": true, "logoDisplay": "block" }` (or whatever the natural inline display is — but not `"none"`).

- [ ] **Step 7: Visual confirm**

Screenshot the Color panel (mobile portrait) and the Display section (desktop sidebar) — confirm no "Show Logo" toggle anywhere.

- [ ] **Step 8: Commit + push**

```powershell
git add index.html
git commit -m @'
brand: remove Show Logo toggle entirely, logo always visible

Spec section 9: logo is mandatory on all exports for all users (no Pro
removal). The "Show Logo" toggle becomes confusing dead UI when there's
no toggling left to do.

- Drops the mobile + desktop toggle <input> elements.
- Drops the wire() handler + appState.showLogo field.
- All read-sites that branched on appState.showLogo now unconditional.
- #logoWatermark element stays in DOM, always rendered.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 4: Fix landscape `display:none` on `#mapTitle`

**Purpose:** Live audit found `#mapTitle` is `display:none` in landscape on mobile — title is invisible AND missing from exports captured in landscape. Spec §4 fixes this properly with a top-bar element in Phase 1; this is the Phase 0 patch to make the title visible in landscape now.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Find the offending CSS rule**

Grep `index.html` for patterns like `#mapTitle` and `display:\s*none` near each other, and `@media.*landscape`. Note the line number of the rule(s) that hide the title in landscape.

- [ ] **Step 2: Establish failing observation**

In chrome-devtools-mcp:
```
emulate(viewport="844x390x3,mobile,touch,landscape", userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1")
navigate_page(type="reload")
evaluate_script(function="() => ({ titleDisplay: getComputedStyle(document.getElementById('mapTitle')).display, titleVisible: document.getElementById('mapTitle').getBoundingClientRect().height > 0 })")
```

Expected: `{ "titleDisplay": "none", "titleVisible": false }` (the bug).

- [ ] **Step 3: Remove the `display:none` rule for landscape**

Edit `index.html`. The exact rule will look like one of:
```css
/* offending */
@media (orientation: landscape) and (max-width: 900px) {
  #mapTitle { display: none; }
}

/* fix: just delete the #mapTitle line; the rest of the media query likely has other rules */
```

If `#mapTitle { display: none; }` is the ONLY rule in that media query, remove the whole `@media` block. If it shares the block with other rules, just delete the `#mapTitle` line.

- [ ] **Step 4: Run validator (no JS change, but confirm)**

```powershell
python _validate.py
```

Expected: PASS.

- [ ] **Step 5: Verify fix**

Re-run the Step 2 evaluate. Expected: `{ "titleDisplay": "block" (or "inline-block"), "titleVisible": true }`.

Take a landscape screenshot — confirm title is visible at top of the canvas.

- [ ] **Step 6: Commit + push**

```powershell
git add index.html
git commit -m @'
fix: show map title in mobile landscape

Live audit found #mapTitle hidden via display:none in the landscape
media query. Title was invisible to the user and missing from exports
captured in landscape orientation.

Phase 0 patch: remove the landscape display:none rule. Title now
visible. Phase 1's top-bar redesign will make the title a fixed
chrome element where it can't be hidden.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 5: Fix landscape onboarding overflow

**Purpose:** Live audit found "I've been here before" link off-screen when the welcome modal is shown in landscape orientation. First-time users in landscape can't dismiss onboarding.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Reproduce the bug**

In chrome-devtools-mcp, ensure landscape iPhone emulation is still active (from Task 4). Clear the visited flag:
```
evaluate_script(function="() => { localStorage.removeItem('tappymaps_visited'); }")
navigate_page(type="reload")
```

Expected: the onboarding modal appears, but the "I've been here before" link is below the visible viewport (clipped at bottom).

Take screenshot:
```
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase0-t5-before.png")
```

- [ ] **Step 2: Find the onboarding modal CSS**

Grep `index.html` for `Welcome to Tappymaps` or `tappymaps_visited`. Trace up to the parent modal container (likely a `<div>` with class like `onboarding-overlay` or `welcome-modal`). Note the CSS that sizes it.

- [ ] **Step 3: Make the modal scroll within the viewport in landscape**

The modal needs `max-height: 90vh` and `overflow-y: auto` on landscape phones so the contents scroll within the modal instead of overflowing the page. Edit the modal's CSS — either inline or in the landscape `@media` rule:

```css
@media (orientation: landscape) and (max-height: 500px) {
  .welcome-modal, .onboarding-overlay { /* whatever the actual class is */
    max-height: 90vh;
    overflow-y: auto;
  }
}
```

Use the actual class name found in Step 2. If the modal uses inline `style="..."`, prefer adding a CSS class instead of editing inline style (cleaner).

- [ ] **Step 4: Run validator**

```powershell
python _validate.py
```

Expected: PASS.

- [ ] **Step 5: Verify fix**

Reload localhost in landscape, clear `tappymaps_visited` again, reload. The onboarding modal should now be scrollable; "I've been here before" reachable by scrolling within the modal.

Take screenshot:
```
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase0-t5-after.png")
```

- [ ] **Step 6: Commit + push**

```powershell
git add index.html
git commit -m @'
fix: scroll onboarding modal within viewport on landscape phones

Live audit: in landscape orientation on phones, the welcome modal
overflowed the viewport and "I've been here before" was off-screen.
First-time landscape users couldn't dismiss onboarding.

Adds max-height 90vh and overflow-y auto on the welcome modal in the
landscape <=500px-tall media query. Content scrolls inside the modal
now instead of clipping below the fold.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 6: Fix portrait empty band (temporary)

**Purpose:** Live audit found ~270px of wasted dark space between map and bottom palette in portrait. Phase 1's landscape-required rotate overlay solves this properly. Phase 0 patch: reduce the gap so portrait at least looks intentional until Phase 1 ships.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Reproduce + measure**

In chrome-devtools-mcp, switch to portrait:
```
emulate(viewport="390x844x3,mobile,touch", userAgent="<iPhone Safari UA>")
navigate_page(type="reload")
evaluate_script(function="() => { const m = document.querySelector('#mapContainer, .map-container'); const p = document.querySelector('.mobile-color-bar') || document.querySelector('.color-palette'); if (!m || !p) return {missing:true}; const mr = m.getBoundingClientRect(); const pr = p.getBoundingClientRect(); return { mapBottom: Math.round(mr.bottom), paletteTop: Math.round(pr.top), gap: Math.round(pr.top - mr.bottom) }; }")
```

Expected: gap around 250-300px (the wasted band).

- [ ] **Step 2: Identify the offending CSS**

The gap likely comes from a fixed-height or large `min-height` on either the map container, the stats bar, or empty `<div>` separators. Inspect via chrome-devtools-mcp `take_snapshot()` to find what's between the map and the palette in DOM order.

Common culprits in this codebase (per cartographer agent): map container has `flex: 1` and `min-height: 60vh`-ish which oversizes in tall portrait viewports.

- [ ] **Step 3: Apply the patch**

Edit `index.html`. The minimal fix is to shrink the map container's `min-height` in portrait so the gap collapses. In the portrait media query (likely `@media (max-width: 600px) and (orientation: portrait)`):

```css
@media (max-width: 600px) and (orientation: portrait) {
  #mapContainer, .map-container {
    min-height: auto; /* let it size to content aspect */
    /* if there's an existing height/flex rule that fights this, override here */
  }
}
```

If the audit found the legend renders inline below the map (per Phase 1's intent already partially shipped — commit `f9f260b`), the patch should leave that working — just close the gap to the palette below.

- [ ] **Step 4: Run validator + verify gap closes**

```powershell
python _validate.py
```

Re-run Step 1's probe. Expected: gap now <50px (close to 0 — palette directly below the legend).

- [ ] **Step 5: Take before/after screenshots**

```
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase0-t6-after.png", fullPage=true)
```

Compare with the pre-existing live-audit screenshot at `C:\Users\mhowe\AppData\Local\Temp\tm-audit-iphone-portrait-initial.png`.

- [ ] **Step 6: Commit + push**

```powershell
git add index.html
git commit -m @'
fix: close ~270px portrait wasted band between map and palette

Live audit found a big dark dead zone in portrait between the map's
bottom edge and the bottom color palette. Phase 1's rotate-overlay
will eliminate portrait editing entirely; this is the Phase 0 stopgap.

Sets map container min-height to auto in the portrait media query so
the canvas sizes to its content aspect and the palette sits right
under the legend.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 7: Fix dead Supabase analytics URL

**Purpose:** Live audit found `https://qbhqdicppoahhvnuvcwd.supabase.co/rest/v1/analytics` returns `ERR_NAME_NOT_RESOLVED` on every page load. Either resurrect or remove.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Confirm dead URL on production**

In chrome-devtools-mcp, navigate to `https://tappymaps.com/` and check console:
```
list_console_messages(types=["error"])
```

Expected: at least one `Failed to load resource: net::ERR_NAME_NOT_RESOLVED` for the Supabase analytics URL.

- [ ] **Step 2: Decide resurrect vs remove**

Check the actual Supabase project status. Visit https://supabase.com/dashboard manually — does the `qbhqdicppoahhvnuvcwd` project still exist?

- **If project exists and just needs to be unpaused:** unpause it via the Supabase dashboard. Skip to Step 5 below (verification only — no code change needed; the URL was correct, the backend was just sleeping).
- **If project is gone / renamed:** proceed to Step 3 (Path A — point to a new endpoint).
- **If you don't want analytics at all right now:** proceed to Step 4 (Path B — remove the call).

For Phase 0, Path B (remove) is the safest if there's any doubt — analytics can be re-wired in Phase 1 when the new `user_maps`/`game_scores` schemas land in Supabase anyway.

- [ ] **Step 3: Path A — Point to new endpoint (if applicable)**

Grep `index.html` for `qbhqdicppoahhvnuvcwd`. Replace the URL with the new Supabase project URL. Confirm `SUPABASE_ANON_KEY` constant in the file still matches the new project. Verify the `analytics` table exists in the new project with the same column shape (or matching RLS-enabled schema).

- [ ] **Step 4: Path B — Remove the analytics call**

Grep `index.html` for `appendAnalyticsEvent` (or similar function name) and the `fetch(` call to the analytics URL. Remove the function body's network code, leave the function as a no-op (so call sites don't break):

```js
// BEFORE
function appendAnalyticsEvent(event) {
  // localStorage + fetch to Supabase ...
  fetch('https://qbhqdicppoahhvnuvcwd.supabase.co/rest/v1/analytics', {...});
}

// AFTER (Phase 0 patch — Phase 1 wires new analytics)
function appendAnalyticsEvent(event) {
  // No-op until Phase 1 re-wires analytics to the new Supabase project.
  // Local storage logging preserved for offline debugging.
  try {
    const log = JSON.parse(localStorage.getItem('tm_analytics') || '[]');
    log.push({ event, ts: Date.now() });
    if (log.length > 500) log.shift();
    localStorage.setItem('tm_analytics', JSON.stringify(log));
  } catch (_) { /* localStorage full or disabled — ignore */ }
}
```

Keep the localStorage path for local debug; just kill the network call.

- [ ] **Step 5: Run validator**

```powershell
python _validate.py
```

Expected: PASS.

- [ ] **Step 6: Verify no failed network call**

Reload `http://localhost:8000/` in chrome-devtools-mcp. Check:
```
list_console_messages(types=["error"])
list_network_requests(...)  # if available — confirm no request to qbhqdicppoahhvnuvcwd
```

Expected: no `ERR_NAME_NOT_RESOLVED` error, no request to the dead Supabase URL.

- [ ] **Step 7: Commit + push**

For Path B:
```powershell
git add index.html
git commit -m @'
fix: stop firing dead Supabase analytics request on every page load

Live audit: every page load triggered a failed fetch to
qbhqdicppoahhvnuvcwd.supabase.co/rest/v1/analytics (ERR_NAME_NOT_RESOLVED).
The Supabase project is gone or paused.

Phase 0 patch: appendAnalyticsEvent() becomes localStorage-only. Phase 1
will rewire analytics writes to whatever new Supabase project the gallery
schemas land in.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

For Path A, adjust the commit message to "fix: point analytics endpoint to live Supabase project."

---

## Task 8: Add basic SEO head tags

**Purpose:** Live audit found ZERO SEO on the current site. Phase 1 will add per-route head tags when routes exist; Phase 0 fixes the immediate gap for the single existing route (the editor at `/`).

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Confirm current head is empty of SEO**

Probe in chrome-devtools-mcp:
```
evaluate_script(function="() => ({ title: document.title, description: document.querySelector('meta[name=description]')?.content || null, ogImage: document.querySelector('meta[property=\"og:image\"]')?.content || null, twitterCard: document.querySelector('meta[name=\"twitter:card\"]')?.content || null, canonical: document.querySelector('link[rel=canonical]')?.href || null, h1Count: document.querySelectorAll('h1').length })")
```

Expected: `{ title: "Tappymaps", description: null, ogImage: null, twitterCard: null, canonical: null, h1Count: 0 }`.

- [ ] **Step 2: Add SEO tags to `<head>`**

Edit `index.html`. In the `<head>` block (after the existing `<meta charset>` and viewport), add:

```html
<title>Tappymaps — Tap. Color. Share.</title>
<meta name="description" content="Make beautiful colored maps of the United States. Tap states, build a legend, share or export. Free.">

<!-- Open Graph -->
<meta property="og:title" content="Tappymaps — Tap. Color. Share.">
<meta property="og:description" content="Make beautiful colored maps of the United States. Tap states, build a legend, share or export. Free.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://tappymaps.com/">
<meta property="og:image" content="https://tappymaps.com/assets/social-og-image.png">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Tappymaps — Tap. Color. Share.">
<meta name="twitter:description" content="Make beautiful colored maps of the United States. Tap states, build a legend, share or export. Free.">
<meta name="twitter:image" content="https://tappymaps.com/assets/social-og-image.png">

<link rel="canonical" href="https://tappymaps.com/">
```

If `<title>` already exists with another value, replace it (don't duplicate).

- [ ] **Step 3: Add an `<h1>` element in the body**

The audit found `h1Count: 0`. Add an `<h1>` somewhere semantically meaningful but visually quiet (so the design doesn't change). Options:
- Inside the existing logo area: wrap the visible logo text in `<h1>` (preserves visual style)
- A visually-hidden `<h1>` at the top of `<body>` for screen readers:

```html
<h1 class="sr-only">Tappymaps — Tap. Color. Share.</h1>
```

Add the corresponding CSS rule:
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

(Phase 1 will properly promote the visible brand wordmark to `<h1>` and the editable map title to `<h2>`. This is the Phase 0 minimum-viable SEO patch.)

- [ ] **Step 4: Confirm the OG image asset exists or copy one in**

```powershell
Test-Path "C:\Users\mhowe\tappymaps\assets\social-og-image.png"
```

If missing: copy `C:\Users\mhowe\Downloads\tappymaps-brand\social-og-image.png` into `assets/`:
```powershell
Copy-Item "C:\Users\mhowe\Downloads\tappymaps-brand\social-og-image.png" "C:\Users\mhowe\tappymaps\assets\social-og-image.png"
```

- [ ] **Step 5: Run validator (no JS change but confirm)**

```powershell
python _validate.py
```

Expected: PASS.

- [ ] **Step 6: Verify SEO tags present**

Reload localhost. Re-run Step 1's probe. Expected:
```json
{
  "title": "Tappymaps — Tap. Color. Share.",
  "description": "Make beautiful colored maps...",
  "ogImage": "https://tappymaps.com/assets/social-og-image.png",
  "twitterCard": "summary_large_image",
  "canonical": "https://tappymaps.com/",
  "h1Count": 1
}
```

- [ ] **Step 7: Commit + push**

```powershell
git add index.html assets/social-og-image.png
git commit -m @'
seo: add basic head tags, OG/Twitter cards, and h1 element

Live audit found ZERO SEO on tappymaps.com: no <meta description>, no
OG tags, no Twitter cards, no h1, default <title>.

Phase 0 minimum-viable SEO patch:
- <title>, meta description, canonical
- OG title/description/type/url/image
- Twitter card (summary_large_image), title/description/image
- Visually-hidden <h1> for screen reader semantics

Phase 1 will replace this with per-route head tags once the mode router
exists.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 9: Verify all fixes on production simultaneously

**Purpose:** End-of-Phase-0 sanity check. All commits from Tasks 2-8 are live on tappymaps.com. Confirm nothing regressed.

**Files:** None (verification only)

- [ ] **Step 1: Hard reload production**

In chrome-devtools-mcp, navigate to `https://tappymaps.com/` with cache bypass:
```
navigate_page(type="reload", ignoreCache=true)
```

- [ ] **Step 2: Run the omnibus probe**

```js
() => ({
  // Task 2: watermark + logo
  diagonalWatermark: !!document.querySelector('text')?.textContent?.includes('tappymaps.com'),
  logoGroupTransform: document.querySelector('g[transform*="translate(330"]')?.getAttribute('transform') || null,

  // Task 3: show logo toggle gone
  showLogoToggle: !!document.getElementById('mobileToggleLogo') || !!document.getElementById('toggleLogo'),
  showLogoField: typeof appState !== 'undefined' && 'showLogo' in appState,

  // Task 4: map title in landscape (need to manually emulate landscape to test)
  mapTitleExists: !!document.getElementById('mapTitle'),

  // Task 7: no analytics request fired
  analyticsCallSite: typeof appendAnalyticsEvent === 'function' ? appendAnalyticsEvent.toString().includes('fetch') : null,

  // Task 8: SEO
  hasTitle: document.title === 'Tappymaps — Tap. Color. Share.',
  hasOgImage: !!document.querySelector('meta[property="og:image"]'),
  h1Count: document.querySelectorAll('h1').length,
})
```

Expected (all good):
```json
{
  "diagonalWatermark": false,
  "logoGroupTransform": "translate(330, 570) scale(1.0)",
  "showLogoToggle": false,
  "showLogoField": false,
  "mapTitleExists": true,
  "analyticsCallSite": false,
  "hasTitle": true,
  "hasOgImage": true,
  "h1Count": 1
}
```

If any check fails: identify which task's commit didn't take effect; investigate.

- [ ] **Step 3: Console error check**

```
list_console_messages(types=["error", "warn"])
```

Expected: zero errors. Some warnings OK (likely a11y warnings — those get fixed in Phase 1).

- [ ] **Step 4: Take final "Phase 0 complete" screenshots**

```
emulate(viewport="1440x900")
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase0-final-desktop.png", fullPage=true)

emulate(viewport="390x844x3,mobile,touch", userAgent="<iPhone Safari UA>")
navigate_page(type="reload")
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase0-final-portrait.png", fullPage=true)

emulate(viewport="844x390x3,mobile,touch,landscape", userAgent="<iPhone Safari UA>")
navigate_page(type="reload")
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase0-final-landscape.png", fullPage=true)
```

---

## Task 10: Update HANDOVER.md with Phase 0 completion

**Purpose:** Keep the source-of-truth status doc current. The spec sits in `docs/superpowers/specs/`; the live status sits in `HANDOVER.md` at repo root.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\HANDOVER.md`

- [ ] **Step 1: Read current HANDOVER.md**

Read the file to find a sensible insertion point — likely just after the "Genuinely open items" section, or before the "Architecture Overview" section.

- [ ] **Step 2: Add a Phase 0 completion section**

Edit `HANDOVER.md` to insert:

```markdown
## Reimagining — Phase 0 shipped (2026-05-XX)

Design spec at `docs/superpowers/specs/2026-05-23-tappymaps-reimagining-design.md`.
Phase 0 punch list complete (commits TBD):

- ✅ Diagonal "tappymaps.com" text watermark removed
- ✅ Pin+wordmark logo enlarged (scale 0.72 → 1.0, opacity 0.45 → 0.7)
- ✅ "Show Logo" toggle removed (logo always present per §9)
- ✅ Landscape map title visible (was display:none — audit bug)
- ✅ Landscape onboarding modal scrolls within viewport
- ✅ Portrait wasted-band gap closed (temp until Phase 1's landscape-required)
- ✅ Dead Supabase analytics URL removed (Phase 1 rewires)
- ✅ Basic SEO head tags added (per-route SEO in Phase 1)
- ✅ Reddit Developer account applied (status: pending Reddit review)
- ✅ .superpowers/ gitignored

Next: Phase 1 — mode router + Hub Layout B + Editor refresh.
Plan at `docs/superpowers/plans/2026-05-XX-tappymaps-reimagining-phase-1.md` (TBD).
```

Replace the date and "commits TBD" with actual values once Phase 0 commits land. Replace "2026-05-XX" with the actual ship date.

- [ ] **Step 3: Commit + push**

```powershell
git add HANDOVER.md
git commit -m @'
docs: mark Phase 0 of reimagining complete in HANDOVER

Phase 0 of the reimagining (audit fixes + foundation) shipped. Section
added to HANDOVER for at-a-glance status. Spec lives in
docs/superpowers/specs/; per-phase plans in docs/superpowers/plans/.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 11 (parallel, external): Apply for Reddit Developer account

**Purpose:** Devvit is Phase 3 MVP work. Reddit's commercial-use review takes days. Start now so the account is ready when Phase 3 code is written.

**Files:** None (external task)

- [ ] **Step 1: Visit Reddit Apps + Devvit**

- Sign in to Reddit with the account you want to publish the Tappymaps Devvit app under.
- Visit https://developers.reddit.com/ and create a developer profile if not already.
- Skim the Devvit docs at https://developers.reddit.com/docs to confirm commercial-use rules + Web View component availability for the architecture we want.

- [ ] **Step 2: Reserve the app name**

- Create a Devvit app named `tappymaps` (or similar — confirm desired slug).
- Don't publish; just reserve the name.

- [ ] **Step 3: Note the developer credentials**

- Save the Devvit CLI auth token / app ID / username somewhere secure (1Password, password manager, etc.).
- Add to a private `.env.dev` (NOT committed; the existing `.env*` gitignore line covers it):
  ```
  DEVVIT_USERNAME=...
  DEVVIT_APP_ID=...
  DEVVIT_TOKEN=...
  ```

- [ ] **Step 4: Log status**

Add a note to `HANDOVER.md` under the Phase 0 section (replace the line in Task 10's text):
```
- ✅ Reddit Developer account applied — status: approved / pending review (date)
```

**No commit needed for this task** if the only artifact is a `.env.dev` file (gitignored). The status update on HANDOVER goes in Task 10's commit.

---

## End-of-Phase-0 checklist

After all 11 tasks complete:

- [ ] All commits visible in `git log --oneline -15` on `master`
- [ ] tappymaps.com (production) shows all Phase 0 changes via hard refresh
- [ ] No console errors on the live page
- [ ] `HANDOVER.md` updated with Phase 0 completion section
- [ ] Reddit Developer account submitted (status documented, even if still pending)
- [ ] No outstanding work in `_phase0_screens/` or `_validate.py` that needs to be committed (both gitignored)
- [ ] Ready to invoke `superpowers:writing-plans` again for Phase 1 (mode router + Hub + Editor refresh)

---

## Notes for the implementer

- **`captureMapImage()` is the export entry point — never add a second.** Cartographer agent's tribal knowledge. Several Phase 0 tasks touch SVG / logo / `<text>` elements that live near the export pipeline; do not refactor `captureMapImage()` while you're in there.
- **`onStateClick` requires `const pathEl`.** Don't touch `onStateClick` in Phase 0. If you do for some reason, grep for `const pathEl` after the edit.
- **Cartographer agent is going to be out-of-date after Phase 1.** Don't update it in Phase 0 — the mode router doesn't exist yet. Phase 1 plan will include the agent update.
- **Live tappymaps.com auto-deploys on push.** Every commit ships in ~30s. If you push a broken commit, the live site breaks. ALWAYS run `python _validate.py` before pushing.
- **PowerShell's git can be flaky on long commit messages.** If a commit fails with quoting issues, save the message to `.gitmsg` and use `git commit -F .gitmsg` (the file is gitignored). Cartographer agent has this pattern documented.

---

## Source materials

- Design spec: `docs/superpowers/specs/2026-05-23-tappymaps-reimagining-design.md` (commit `5e62f6d`)
- Cartographer agent: `.claude/agents/tappymaps-cartographer.md`
- Live audit screenshots: `C:\Users\mhowe\AppData\Local\Temp\tm-audit-*.png`
- Brainstorm mockups: `C:\Users\mhowe\tappymaps\.superpowers\brainstorm\149-1779608315\content\` (gitignored)
