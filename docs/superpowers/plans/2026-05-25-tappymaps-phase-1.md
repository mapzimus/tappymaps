# Tappymaps Reimagining — Phase 1 (Mode Router + Hub + Create Mode Rebuild) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the mode router + Hub at `/` + Create mode 5-panel rail rebuild atomically. Replaces today's mobile-bottom-nav + desktop-sidebar dual-rendering with a single landscape-first 5-panel layout. Unlocks Phases 2–5.

**Architecture:** Build all new infrastructure (Router, Hub, ComingSoon, new Create markup) as dormant additive code (display:none + dispatch disabled). Each Phase 1A task ships safely — legacy editor keeps rendering. Then one atomic cutover commit (Task 15) moves the existing `<svg id="mapSVG">` + `#mapTitle` into the new Create markup, enables Router.dispatch, registers all modes, and deletes the legacy mobile-bottom-nav + sidebar + templates-modal markup. No feature flag, no coexistence period.

**Tech Stack:** Vanilla HTML/CSS/JS (the existing tappymaps stack), Node (for `--check`), Python (for `_validate.py`), `chrome-devtools-mcp` (for probes + screenshots), `gh` CLI + git via PowerShell.

**Source spec:** `docs/superpowers/specs/2026-05-25-tappymaps-phase-1-implementation-design.md` (commit `8dd2f5c`)

**Source product spec:** `docs/superpowers/specs/2026-05-23-tappymaps-reimagining-design.md` (commit `5e62f6d`)

**Phase 0 status:** Complete on `master`. HANDOVER.md has the completion section. Tester mode + access code `tap26` live.

---

## File structure

**Files modified in Phase 1** (all in `C:\Users\mhowe\tappymaps\`):
- `index.html` — Tasks 1–16 all edit this single file (~9,900 lines)
- `HANDOVER.md` — Task 17 appends a Phase 1 completion section
- `.claude/CLAUDE.md` — Task 16 updates with mode-router context + new module map
- `.claude/agents/tappymaps-cartographer.md` — Task 16 updates with router context

**Files created:**
- `vercel.json` — repo root, Task 1 (if not already present)

**Files NOT touched in Phase 1:**
- `api/stripe/*.js` — webhook, checkout, verify-subscription, track-export all keep working
- `assets/*` — no asset changes
- `_validate.py` — exists from Phase 0 (gitignored), reused unchanged

---

## Reference: known file landmarks (from grep at plan time)

For orientation when editing `index.html`. Line numbers drift — re-grep on each task.

| Element / function | Approx line | Notes |
|---|---|---|
| `<aside class="sidebar" id="sidebarSheet">` | 2302 | Desktop sidebar — DELETED in cutover |
| `<input id="sourceInput">` (desktop) | 2446 | KEEP — moves into new `#createPanelMap` |
| `<div class="upgrade-banner" id="upgradeBanner">` | 2552 | Legacy upgrade trigger — replaced by Upgrade rail panel |
| `<div id="mapContainer">` | 2560 | Legacy wrapper around SVG — DELETED in cutover after SVG moves |
| `<div id="mapTitle" contenteditable>` | 2561 | KEEP — moves into new `#createTopBar` |
| `<svg id="mapSVG" viewBox="-20 -30 1010 710">` | 2563 | KEEP — moves into new `#createMap`; cartographer-locked |
| `function onStateClick(e, stateName)` | 3624 | UNCHANGED — keeps `const pathEl` |
| `function updateLegendDisplay()` | 3912 | UNCHANGED |
| `function handleProCodeSubmit()` | 4247 | UNCHANGED (tester mode access code) |
| `function encodeStateToURL()` | 4330 | UNCHANGED |
| `function loadStateFromURL()` | 4364 | UNCHANGED |
| `function isPro()` | 4422 | UNCHANGED |
| `function renderMap()` | 5577 | UNCHANGED |
| `function loadTemplate(templateId)` | 7107 | UNCHANGED |
| `<div class="mobile-panel-backdrop" id="mobilePanelBackdrop">` | 7285 | DELETED in cutover |
| `<div class="mobile-panel" id="tapPanel">` | 7314 | DELETED in cutover (content migrated to `#createPanelMap`) |
| `<input id="mobileSourceInput">` | 7323 | DELETED in cutover (replaced by single `#sourceInput` in new panel) |
| `<div class="mobile-panel" id="colorPanel">` | 7359 | DELETED in cutover (content migrated to `#createPanelColor`) |
| `<div class="mobile-panel" id="sharePanel">` | 7437 | DELETED in cutover (Share is a top-bar action, not a rail panel) |
| `<div class="mobile-panel" id="dataPanel">` | 7459 | DELETED in cutover (content migrated to `#createPanelData`) |
| `<div class="mobile-panel" id="morePalettesMobilePanel">` | 7471 | DELETED in cutover |
| `function closeAllPanels()` | 7529 | DELETED in cutover |
| `function wire(id, event, handler)` | 7951 | KEPT only if still needed; most call sites delete |

---

## Pre-flight (do once before Task 1)

- [ ] **Verify dev env is ready**

Run from PowerShell:
```powershell
Set-Location C:\Users\mhowe\tappymaps
git status --short --branch
node --version
python --version
python _validate.py
```

Expected: clean working tree on `master` synced with `origin/master`; Node ≥18; Python ≥3.10; `_validate.py` reports both blocks PASS.

If working tree dirty: commit or stash first.
If `_validate.py` missing: it's gitignored — recreate it per Phase 0 Task 1 (the cartographer agent doc has the source inline). Won't take more than a minute.
If baseline validation FAILS: stop. There's a pre-existing syntax error in `index.html` that must be fixed before any Phase 1 work. (Unlikely; live site loads fine.)

- [ ] **Start local dev server in a background terminal**

Open a separate PowerShell window (keep it open during all Phase 1 work):
```powershell
Set-Location C:\Users\mhowe\tappymaps
python -m http.server 8000
```

Tappymaps reachable at `http://localhost:8000/`.

- [ ] **Open a chrome-devtools-mcp tab to localhost**

```
new_page(url="http://localhost:8000/")
```

Reuse this tab across tasks via `list_pages` + `select_page` (saves re-emulating).

---

## Task 1: Add `vercel.json` with SPA rewrites

**Purpose:** Vercel needs to serve `index.html` for any unknown path so the client-side router can handle `/design/make`, `/games/arcade/find-state`, etc. Without this, `/design/make` returns 404 on production.

**Files:**
- Create (or modify if exists): `C:\Users\mhowe\tappymaps\vercel.json`

- [ ] **Step 1: Check whether `vercel.json` already exists**

```powershell
Test-Path C:\Users\mhowe\tappymaps\vercel.json
```

If `True`: read the existing file with the Read tool and merge the new `rewrites` block into the existing JSON (don't replace other config). If `False`: create a new file.

- [ ] **Step 2: Write `vercel.json`**

For the new-file case, use Write tool to create `C:\Users\mhowe\tappymaps\vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/((?!api|assets|favicon|.*\\.(?:png|svg|ico|webmanifest|json)).*)",
      "destination": "/index.html"
    }
  ]
}
```

For the merge case: insert the `rewrites` array as a top-level key alongside existing keys (use Edit tool, find the closing `}` and insert before it).

The regex excludes:
- `/api/*` — Stripe serverless functions keep working
- `/assets/*` — static images and the OG image
- `/favicon*` — favicon variants
- Any path ending in `.png`, `.svg`, `.ico`, `.webmanifest`, `.json` — direct static files

Everything else routes to `/index.html` and the client-side Router takes over.

- [ ] **Step 3: Validate JSON syntax**

```powershell
Get-Content C:\Users\mhowe\tappymaps\vercel.json | ConvertFrom-Json
```

Expected: parses without error.

- [ ] **Step 4: Run `_validate.py` (no JS change, but confirm)**

```powershell
python _validate.py
```

Expected: both blocks PASS.

- [ ] **Step 5: Commit + push**

```powershell
git add vercel.json
git commit -m @'
infra: add vercel.json SPA rewrites for client-side routing

Phase 1 needs Vercel to serve index.html for any path that isn't an API
function or static asset, so the client-side Router can dispatch routes
like /design/make and /games/arcade/find-state.

Regex excludes /api/*, /assets/*, favicon, and direct .png/.svg/.ico/
.webmanifest/.json paths. Everything else rewrites to /index.html.

No-op until the Router lands in subsequent commits — Vercel still serves
the same index.html as before; the router just dispatches on what it
sees.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

- [ ] **Step 6: Verify deploy didn't break production**

Wait ~30s for Vercel deploy. Hard refresh `https://tappymaps.com/` in chrome-devtools-mcp tab. Expected: legacy editor renders identically (router not added yet; rewrite is dormant for `/`).

---

## Task 2: Add SEO meta tag helpers (dormant utility functions)

**Purpose:** Per-route SEO calls `updateMetaTags(mode.meta(route))` on every dispatch. Define the helpers now as standalone functions — they're unused until Modes register `meta()` callbacks in later tasks.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Find the insertion point**

Grep `index.html` for the line just AFTER the first `<script>` opening tag (the main app block — roughly first 60% of file). The helpers go at the very top of the main script block, after the `appState` declaration but before any other function definitions.

```powershell
# example marker — actual line will differ
```

Use Grep with pattern `^\s*const appState` or `let appState` and output_mode=content, -n=true.

- [ ] **Step 2: Insert the helpers**

Use Edit tool to add these three functions right after the `appState` declaration block:

```js
    // --- Per-route SEO meta tag helpers (Phase 1) -------------------------
    // Used by Router to update <title>, meta description, OG/Twitter cards,
    // and canonical on every mode dispatch. Each Mode's meta(route) returns
    // { title, description, canonical?, ogImage? } — these helpers apply it.

    function updateMetaTags({ title, description, canonical, ogImage }) {
      const FALLBACK_OG = 'https://tappymaps.com/assets/social-og-image.png';
      document.title = title;
      setMeta('description', description);
      setMeta('og:title', title);
      setMeta('og:description', description);
      setMeta('og:url', canonical || window.location.href);
      setMeta('og:image', ogImage || FALLBACK_OG);
      setMeta('twitter:title', title);
      setMeta('twitter:description', description);
      setMeta('twitter:image', ogImage || FALLBACK_OG);
      setLink('canonical', canonical || window.location.href);
    }

    function setMeta(name, content) {
      const sel = name.startsWith('og:')
        ? `meta[property="${name}"]`
        : `meta[name="${name}"]`;
      let el = document.querySelector(sel);
      if (!el) {
        el = document.createElement('meta');
        if (name.startsWith('og:')) el.setAttribute('property', name);
        else el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    }

    function setLink(rel, href) {
      let el = document.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    }
```

- [ ] **Step 3: Validate JS syntax**

```powershell
python _validate.py
```

Expected: both blocks PASS. If FAIL, the inserted block has a syntax bug — re-check braces and the template-string backticks.

- [ ] **Step 4: Verify helpers defined but unused**

Reload `http://localhost:8000/` in chrome-devtools-mcp. Probe:
```
evaluate_script(function="() => ({ updateMetaTagsType: typeof updateMetaTags, setMetaType: typeof setMeta, setLinkType: typeof setLink })")
```

Expected: `{ updateMetaTagsType: 'function', setMetaType: 'function', setLinkType: 'function' }`.

Verify nothing changed about the rendered page — legacy editor still renders identically.

- [ ] **Step 5: Commit + push**

```powershell
git add index.html
git commit -m @'
seo: add per-route meta tag helpers (dormant until Router lands)

Defines updateMetaTags, setMeta, setLink — pure utility functions that
each Mode's meta(route) callback can leverage to update document.title,
meta description, OG/Twitter cards, and canonical link on dispatch.

No callers yet. Activated when Modes.Hub, Modes.Create, etc. register
meta() callbacks and Router.dispatch starts firing in the cutover commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 3: Add Router IIFE (dormant — no auto-dispatch yet)

**Purpose:** Build the Router infrastructure. Define `parseRoute`, `register`, `navigate`, `dispatch`. Do NOT attach the `DOMContentLoaded` listener yet — that lands in the cutover commit (Task 15). The Router object exists and is callable but never auto-fires.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Find the insertion point**

Right after the meta tag helpers from Task 2 (still near the top of the main `<script>` block). The Router defines a namespace `Modes` too (initially empty).

- [ ] **Step 2: Insert the Router IIFE**

Use Edit tool to add this block immediately after Task 2's helpers:

```js
    // --- Mode Router (Phase 1) --------------------------------------------
    // Single-page router. Modes register themselves with id + lifecycle
    // (enter, exit, optional meta). dispatch() reads window.location.pathname,
    // calls the matching mode's enter(). Hash component preserved across
    // pushState calls — state stays in hash, route in path.
    //
    // Phase 1 limits:
    //   * No nested route hierarchies
    //   * No route guards / async loading / transitions
    //   * No URL parameter parsing (modes do their own)
    //   * dispatch() not auto-called yet — that lands in the cutover commit

    const Modes = {}; // populated by later tasks: Modes.Hub, Modes.Create, etc.

    const Router = (function() {
      const modes = {};
      let current = null;

      function register(id, mode) {
        modes[id] = mode;
      }

      function parseRoute(pathname) {
        // '/' → { mode: '__hub__' }
        // '/design/make' → { mode: 'design/make' }
        // '/games/arcade/find-state' → { mode: 'games/arcade', sub: 'find-state' }
        // '/games/draft/category' → { mode: 'games/draft', sub: 'category' }
        // anything else → { mode: '__notFound__' }
        if (pathname === '/' || pathname === '') return { mode: '__hub__' };
        const trimmed = pathname.replace(/^\/+|\/+$/g, '');
        const parts = trimmed.split('/');
        // 1-segment routes ('/tap-in', '/pro', '/about', '/pricing')
        if (parts.length === 1) {
          return { mode: parts[0], sub: null };
        }
        // 2-segment routes ('/design/make', '/design/gallery', '/games/arcade', '/games/draft', '/embed/<hash>')
        if (parts.length === 2) {
          return { mode: parts[0] + '/' + parts[1], sub: null };
        }
        // 3-segment routes ('/design/gallery/featured', '/games/arcade/find-state', '/games/draft/category')
        if (parts.length === 3) {
          return { mode: parts[0] + '/' + parts[1], sub: parts[2] };
        }
        return { mode: '__notFound__' };
      }

      function dispatch() {
        const route = parseRoute(window.location.pathname);
        const next = modes[route.mode] || modes['__notFound__'] || modes['__hub__'];
        if (!next) {
          console.warn('Router: no mode registered for', route.mode, '(and no fallback)');
          return;
        }
        if (current && current.exit) current.exit();
        current = next;
        document.body.dataset.mode = route.mode; // CSS hook for mode-scoped styles
        next.enter(route);
        if (next.meta && typeof updateMetaTags === 'function') {
          updateMetaTags(next.meta(route));
        }
      }

      // popstate listener attaches now — but no modes registered yet, so
      // dispatch is a no-op (next is undefined → warn + return). Safe.
      window.addEventListener('popstate', dispatch);

      return {
        register,
        parseRoute,
        dispatch,
        navigate(path) {
          history.pushState({}, '', path);
          dispatch();
        },
      };
    })();
```

- [ ] **Step 3: Validate JS syntax**

```powershell
python _validate.py
```

Expected: both blocks PASS.

- [ ] **Step 4: Probe parseRoute via chrome-devtools**

Reload localhost. Probe:
```
evaluate_script(function="() => ({ hub: Router.parseRoute('/'), makeDeep: Router.parseRoute('/design/make'), arcadeSub: Router.parseRoute('/games/arcade/find-state'), draftSub: Router.parseRoute('/games/draft/category'), tapIn: Router.parseRoute('/tap-in'), unknown: Router.parseRoute('/foo/bar/baz/qux') })")
```

Expected:
```json
{
  "hub": { "mode": "__hub__" },
  "makeDeep": { "mode": "design/make", "sub": null },
  "arcadeSub": { "mode": "games/arcade", "sub": "find-state" },
  "draftSub": { "mode": "games/draft", "sub": "category" },
  "tapIn": { "mode": "tap-in", "sub": null },
  "unknown": { "mode": "__notFound__" }
}
```

- [ ] **Step 5: Verify dispatch is a no-op (no crash)**

Probe:
```
evaluate_script(function="() => { try { Router.dispatch(); return { ok: true, bodyMode: document.body.dataset.mode || null }; } catch (e) { return { ok: false, err: String(e) }; } }")
```

Expected: `{ ok: true, bodyMode: null }` — dispatch returned cleanly because no modes registered (the `if (!next) return` guard).

Verify the page still renders the legacy editor — nothing changed.

- [ ] **Step 6: Commit + push**

```powershell
git add index.html
git commit -m @'
feat(router): add Mode Router IIFE (dormant, no auto-dispatch)

Defines the Router with parseRoute, register, navigate, dispatch. Sets up
the empty Modes namespace that later tasks populate (Modes.Hub,
Modes.Create, Modes.ComingSoon).

dispatch() is callable now but no-ops gracefully when no modes match — the
DOMContentLoaded listener lands in the cutover commit (Task 15) once all
modes are registered. popstate listener attached early so any future
history navigation re-dispatches.

parseRoute handles 1/2/3-segment paths. State lives in URL hash, route in
path — pushState preserves the hash component automatically.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 4: Add ComingSoon stub mode + markup + register all stub routes

**Purpose:** One generic stub mode handles every not-yet-built route (Gallery, Arcade, GeoDraft, embed, marketing). Lets Phase 1 ship a complete URL tree where every Hub link goes somewhere sensible instead of 404'ing.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Add `#modeComingSoon` markup**

Find the `<body>` opening tag in `index.html`. Insert this block immediately AFTER `<body>` (top of body, before any existing content). Initially `display:none`.

```html
  <!-- Phase 1: Mode containers (Hub, ComingSoon, Create) -->
  <!-- ComingSoon stub — handles Gallery/Arcade/GeoDraft/embed/marketing -->
  <div class="mode" id="modeComingSoon" style="display:none">
    <div class="coming-soon-inner">
      <h2 class="coming-soon-label" id="comingSoonLabel">This</h2>
      <p class="coming-soon-body">is coming in <strong id="comingSoonPhase">a future phase</strong>.</p>
      <p class="coming-soon-sub">In the meantime, want to make a map?</p>
      <a href="/" data-route class="coming-soon-back">← Back to Tappymaps</a>
    </div>
  </div>
```

- [ ] **Step 2: Add ComingSoon CSS**

Find the main `<style>` block (top of `<head>`). Append at the end (just before `</style>`):

```css
      /* Phase 1 — mode containers */
      .mode { width: 100%; min-height: 100vh; }

      /* ComingSoon stub */
      #modeComingSoon {
        background: var(--bg);
        color: var(--text);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .coming-soon-inner {
        max-width: 480px;
        text-align: center;
      }
      .coming-soon-label {
        font-size: 28px;
        font-weight: 700;
        margin: 0 0 8px;
        color: var(--accent);
      }
      .coming-soon-body {
        font-size: 18px;
        margin: 0 0 16px;
        color: var(--text);
      }
      .coming-soon-sub {
        font-size: 14px;
        margin: 0 0 24px;
        color: var(--text-muted, var(--text));
        opacity: 0.7;
      }
      .coming-soon-back {
        display: inline-block;
        padding: 10px 20px;
        background: var(--accent);
        color: white;
        text-decoration: none;
        border-radius: var(--radius-md, 8px);
        font-weight: 600;
      }
      .coming-soon-back:hover { transform: translateY(-1px); }
```

- [ ] **Step 3: Add `Modes.ComingSoon` definition + register stub routes**

Find the spot in the main script block where Task 3 added the Router IIFE. Add this block immediately AFTER the Router IIFE:

```js
    // --- ComingSoon stub mode (Phase 1) -----------------------------------
    // Handles every route not yet implemented (Gallery, Arcade, GeoDraft,
    // embed, /about, /pricing). One markup div, content swapped per route.

    Modes.ComingSoon = {
      enter(route) {
        const el = document.getElementById('modeComingSoon');
        if (!el) return;
        el.style.display = 'flex';
        document.getElementById('comingSoonLabel').textContent = route.label || 'This';
        document.getElementById('comingSoonPhase').textContent = route.phaseTarget || 'a future phase';
      },
      exit() {
        const el = document.getElementById('modeComingSoon');
        if (el) el.style.display = 'none';
      },
      meta(route) {
        return {
          title: 'Tappymaps — ' + (route.label || 'Coming soon'),
          description: (route.label || 'This feature') + ' is coming in a future Tappymaps phase. Make a map in the meantime.',
          canonical: 'https://tappymaps.com' + window.location.pathname,
        };
      },
    };

    // Register all "coming soon" routes. Each gets its own label/phaseTarget so
    // the stub page text is specific. The Router's parseRoute resolves the
    // mode key (e.g. 'design/gallery'), so we wrap ComingSoon in a per-route
    // closure that injects label + phaseTarget into the route object.
    function registerComingSoon(modeId, label, phaseTarget) {
      Router.register(modeId, {
        enter(route) { Modes.ComingSoon.enter({ ...route, label, phaseTarget }); },
        exit() { Modes.ComingSoon.exit(); },
        meta(route) { return Modes.ComingSoon.meta({ ...route, label, phaseTarget }); },
      });
    }

    registerComingSoon('design/gallery', 'Gallery', 'Phase 4 — Gallery');
    registerComingSoon('games/arcade',   'Arcade',  'Phase 2 — Arcade');
    registerComingSoon('games/draft',    'GeoDraft','Phase 3 — GeoDraft');
    registerComingSoon('embed',          'Embed',   'Phase 5 — Distribution');
    registerComingSoon('about',          'About',   'Coming soon — Marketing');
    registerComingSoon('pricing',        'Pricing', 'Coming soon — Marketing');
    Router.register('__notFound__', {
      enter(route) { Modes.ComingSoon.enter({ ...route, label: 'Page not found', phaseTarget: 'the Tappymaps URL tree' }); },
      exit() { Modes.ComingSoon.exit(); },
      meta(route) { return Modes.ComingSoon.meta({ ...route, label: 'Not found', phaseTarget: 'Tappymaps' }); },
    });
```

- [ ] **Step 4: Validate JS syntax**

```powershell
python _validate.py
```

Expected: both blocks PASS.

- [ ] **Step 5: Probe ComingSoon dispatch manually**

Reload localhost. Probe:
```
evaluate_script(function="() => { Router.dispatch.call(null); /* still no-op for / */ const el = document.getElementById('modeComingSoon'); /* Manually fire as if /design/gallery */ const fakeRoute = { mode: 'design/gallery' }; const mode = { enter(r){ Modes.ComingSoon.enter({...r, label:'Gallery', phaseTarget:'Phase 4 — Gallery'}); }, exit(){ Modes.ComingSoon.exit(); }}; mode.enter(fakeRoute); return { display: el.style.display, label: document.getElementById('comingSoonLabel').textContent, phase: document.getElementById('comingSoonPhase').textContent }; }")
```

Expected: `{ display: 'flex', label: 'Gallery', phase: 'Phase 4 — Gallery' }`. The ComingSoon overlay should now visually cover the legacy editor.

- [ ] **Step 6: Hide it again before continuing**

```
evaluate_script(function="() => { Modes.ComingSoon.exit(); return document.getElementById('modeComingSoon').style.display; }")
```

Expected: `'none'`.

Verify the legacy editor is fully back.

- [ ] **Step 7: Commit + push**

```powershell
git add index.html
git commit -m @'
feat(router): add ComingSoon stub mode + register Gallery/Arcade/GeoDraft/embed routes

One generic stub mode handles every route not yet implemented in Phase 1.
Each route registers via registerComingSoon(modeId, label, phaseTarget) so
the stub page text is specific (e.g. "Gallery is coming in Phase 4 —
Gallery").

Registered stubs:
  /design/gallery   → Phase 4 — Gallery
  /games/arcade     → Phase 2 — Arcade
  /games/draft      → Phase 3 — GeoDraft
  /embed            → Phase 5 — Distribution
  /about            → Coming soon — Marketing
  /pricing          → Coming soon — Marketing
  __notFound__      → generic 404 (still uses ComingSoon markup)

Dormant until Router.dispatch fires on DOMContentLoaded (cutover commit,
Task 15). Markup hidden via inline display:none. Legacy editor unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 5: Add Hub markup + CSS + `Modes.Hub`

**Purpose:** The Hub at `/` shows two big cards (Design + Games) and a footer. Layout B from source spec §4. Two cards side-by-side on landscape ≥600px, stacked on portrait.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Add `#modeHub` markup**

In `index.html`, find the `<div class="mode" id="modeComingSoon">` block from Task 4. Insert the Hub markup IMMEDIATELY BEFORE it (so the Hub is the FIRST mode div in the body):

```html
  <!-- Hub at / — two-card layout per spec §4 -->
  <div class="mode" id="modeHub" style="display:none">
    <header class="hub-header">
      <h1 class="hub-wordmark">tappymaps</h1>
      <p class="hub-slogan">Tap. Color. Share.</p>
      <p class="hub-descriptor">The Design + Games suite for the US map.</p>
    </header>
    <main class="hub-cards">
      <a class="hub-card hub-card--design" href="/design/make" data-route>
        <div class="hub-card-label">DESIGN</div>
        <ul class="hub-card-list">
          <li>→ Create a map</li>
          <li>→ Browse Gallery</li>
        </ul>
      </a>
      <a class="hub-card hub-card--games" href="/games/arcade" data-route>
        <div class="hub-card-label">GAMES</div>
        <ul class="hub-card-list">
          <li>→ Find the State</li>
          <li>→ Speed Run</li>
          <li>→ GeoDraft</li>
          <li>→ All games</li>
        </ul>
      </a>
    </main>
    <footer class="hub-footer">
      <a href="/about" data-route>about</a>
      <span class="hub-footer-sep"> · </span>
      <a href="/pricing" data-route>pricing</a>
      <span class="hub-footer-sep"> · </span>
      <a href="/tap-in" data-route>tap in</a>
    </footer>
  </div>
```

- [ ] **Step 2: Add Hub CSS**

In the main `<style>` block (where Task 4 added ComingSoon CSS), append BEFORE `</style>`:

```css
      /* Hub at / */
      #modeHub {
        background: var(--bg);
        color: var(--text);
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        padding: 24px;
        box-sizing: border-box;
      }
      .hub-header {
        text-align: center;
        margin: 32px 0 24px;
      }
      .hub-wordmark {
        font-size: 48px;
        font-weight: 800;
        margin: 0;
        letter-spacing: -0.02em;
        color: var(--text);
      }
      .hub-slogan {
        font-size: 18px;
        margin: 8px 0 4px;
        color: var(--text);
        opacity: 0.85;
      }
      .hub-descriptor {
        font-size: 14px;
        margin: 0;
        color: var(--text);
        opacity: 0.6;
      }
      .hub-cards {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        max-width: 960px;
        margin: 0 auto;
        width: 100%;
        flex: 1;
        align-items: stretch;
        padding: 16px 0 32px;
      }
      .hub-card {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 24px;
        border-radius: 16px;
        text-decoration: none;
        color: white;
        transition: transform 0.15s ease;
        min-height: 240px;
      }
      .hub-card:hover { transform: translateY(-2px); }
      .hub-card--design { background: #0EA5E9; }
      .hub-card--games { background: #F97316; }
      .hub-card-label {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.12em;
        opacity: 0.85;
      }
      .hub-card-list {
        list-style: none;
        margin: 0;
        padding: 0;
        font-size: 22px;
        font-weight: 600;
        line-height: 1.5;
      }
      .hub-card-list li { padding: 2px 0; }
      .hub-footer {
        text-align: center;
        font-size: 13px;
        opacity: 0.6;
        padding: 16px 0;
      }
      .hub-footer a {
        color: var(--text);
        text-decoration: none;
      }
      .hub-footer a:hover { text-decoration: underline; }
      .hub-footer-sep { user-select: none; }

      /* Portrait phones: stack cards */
      @media (max-width: 600px) {
        .hub-cards { grid-template-columns: 1fr; }
        .hub-wordmark { font-size: 36px; }
      }
```

- [ ] **Step 3: Add `Modes.Hub` definition + register**

In the main script block, just after the ComingSoon registration from Task 4, append:

```js
    // --- Hub mode (Phase 1) -----------------------------------------------
    Modes.Hub = {
      enter() {
        const el = document.getElementById('modeHub');
        if (el) el.style.display = 'flex';
      },
      exit() {
        const el = document.getElementById('modeHub');
        if (el) el.style.display = 'none';
      },
      meta() {
        return {
          title: 'Tappymaps — Tap. Color. Share.',
          description: 'Make beautiful colored maps of the United States. The Design + Games suite for the US map. Free.',
          canonical: 'https://tappymaps.com/',
        };
      },
    };
    Router.register('__hub__', Modes.Hub);
```

- [ ] **Step 4: Validate JS syntax**

```powershell
python _validate.py
```

Expected: both blocks PASS.

- [ ] **Step 5: Probe Hub display manually**

Reload localhost. Probe:
```
evaluate_script(function="() => { Modes.Hub.enter(); return { hubVisible: getComputedStyle(document.getElementById('modeHub')).display, designHref: document.querySelector('.hub-card--design').getAttribute('href'), gamesHref: document.querySelector('.hub-card--games').getAttribute('href'), tapInHref: document.querySelector('.hub-footer a[href=\"/tap-in\"]').getAttribute('href') }; }")
```

Expected: `{ hubVisible: 'flex', designHref: '/design/make', gamesHref: '/games/arcade', tapInHref: '/tap-in' }`.

Take a screenshot:
```
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-t5-hub-desktop.png", fullPage=true)
```

Inspect — two cards visible (turquoise Design, orange Games), wordmark on top, footer at bottom.

Try landscape phone:
```
emulate(viewport="844x390x3,mobile,touch,landscape", userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1")
navigate_page(type="reload")
evaluate_script(function="() => { Modes.Hub.enter(); }")
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-t5-hub-landscape.png", fullPage=true)
```

Try portrait phone:
```
emulate(viewport="390x844x3,mobile,touch", userAgent="<same iPhone UA>")
navigate_page(type="reload")
evaluate_script(function="() => { Modes.Hub.enter(); }")
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-t5-hub-portrait.png", fullPage=true)
```

Expected: cards stack vertically in portrait.

- [ ] **Step 6: Hide Hub before continuing**

```
evaluate_script(function="() => { Modes.Hub.exit(); return getComputedStyle(document.getElementById('modeHub')).display; }")
emulate(viewport="1440x900")
navigate_page(type="reload")
```

Expected: `'none'`. Legacy editor visible again.

- [ ] **Step 7: Commit + push**

```powershell
git add index.html
git commit -m @'
feat(hub): add Hub markup + CSS + Modes.Hub registration

Hub at / per source spec §4 (Layout B). Two cards: DESIGN (turquoise
#0EA5E9, links to /design/make) and GAMES (orange #F97316, links to
/games/arcade). Wordmark + slogan + descriptor above; about/pricing/
tap-in footer below. Cards stack on portrait phones (<=600px).

Modes.Hub registered with Router under "__hub__" key (matched by
parseRoute("/")). Dormant until Router.dispatch fires in the cutover
commit. Markup hidden via inline display:none.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 6: Add TapIn mode + markup + `Modes.TapIn`

**Purpose:** `/tap-in` is one of four real Phase 1 routes (alongside `/`, `/design/make`, `/design/make#<hash>`). Minimal page surfacing the access-code unlock for testers + an entry point to Create. Reuses `handleProCodeSubmit()`.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Add `#modeTapIn` markup**

In `index.html`, find the `<div class="mode" id="modeComingSoon">` block. Insert TapIn markup IMMEDIATELY BEFORE it (after `#modeHub`):

```html
  <!-- Tap In landing — minimal Phase 1 implementation -->
  <div class="mode" id="modeTapIn" style="display:none">
    <div class="tap-in-inner">
      <h2 class="tap-in-title">Tap in to Tappymaps</h2>
      <p class="tap-in-sub">Enter your access code to unlock the Pro editor.</p>
      <form id="tapInForm" class="tap-in-form" autocomplete="off">
        <input
          type="text"
          id="tapInCodeInput"
          class="tap-in-input"
          placeholder="access code"
          autocomplete="off"
          spellcheck="false"
          maxlength="32">
        <button type="submit" class="tap-in-submit">Unlock</button>
      </form>
      <p class="tap-in-status" id="tapInStatus" aria-live="polite"></p>
      <a href="/design/make" data-route class="tap-in-skip">Skip — make a map without unlocking →</a>
    </div>
  </div>
```

- [ ] **Step 2: Add TapIn CSS**

Append to the main `<style>` block before `</style>`:

```css
      /* TapIn landing */
      #modeTapIn {
        background: var(--bg);
        color: var(--text);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        min-height: 100vh;
      }
      .tap-in-inner {
        max-width: 420px;
        width: 100%;
        text-align: center;
      }
      .tap-in-title {
        font-size: 28px;
        font-weight: 700;
        margin: 0 0 8px;
        color: var(--accent);
      }
      .tap-in-sub {
        font-size: 14px;
        margin: 0 0 24px;
        opacity: 0.7;
      }
      .tap-in-form {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
      .tap-in-input {
        flex: 1;
        padding: 12px 16px;
        border: 1px solid var(--border, rgba(255,255,255,0.15));
        border-radius: 8px;
        background: var(--surface, rgba(255,255,255,0.04));
        color: var(--text);
        font-size: 16px;
      }
      .tap-in-submit {
        padding: 12px 24px;
        background: var(--accent);
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
      }
      .tap-in-submit:hover { transform: translateY(-1px); }
      .tap-in-status {
        font-size: 13px;
        min-height: 20px;
        margin: 0 0 16px;
        opacity: 0.85;
      }
      .tap-in-skip {
        display: inline-block;
        font-size: 13px;
        color: var(--text);
        opacity: 0.6;
        text-decoration: none;
      }
      .tap-in-skip:hover { opacity: 1; text-decoration: underline; }
```

- [ ] **Step 3: Add `Modes.TapIn` definition + register**

In the main script block, after the `Router.register('__hub__', Modes.Hub)` line from Task 5, append:

```js
    // --- TapIn landing (Phase 1) ------------------------------------------
    // Minimal page surfacing the access-code unlock for testers. Reuses
    // handleProCodeSubmit() (defined later in the script) when the form
    // submits.

    Modes.TapIn = {
      enter() {
        const el = document.getElementById('modeTapIn');
        if (el) el.style.display = 'flex';
        // Reset status text on every entry
        const status = document.getElementById('tapInStatus');
        if (status) status.textContent = '';
      },
      exit() {
        const el = document.getElementById('modeTapIn');
        if (el) el.style.display = 'none';
      },
      meta() {
        return {
          title: 'Tappymaps — Tap in',
          description: 'Tap in to Tappymaps. Enter your access code to unlock the Pro editor.',
          canonical: 'https://tappymaps.com/tap-in',
        };
      },
    };
    Router.register('tap-in', Modes.TapIn);

    // Form handler — submits the code via existing handleProCodeSubmit if
    // available, else falls back to a local validate-and-redirect.
    document.addEventListener('submit', function(e) {
      if (e.target && e.target.id === 'tapInForm') {
        e.preventDefault();
        const input = document.getElementById('tapInCodeInput');
        const status = document.getElementById('tapInStatus');
        const code = (input && input.value || '').trim();
        if (!code) {
          if (status) status.textContent = 'Enter a code first.';
          return;
        }
        // Delegate to the existing tester-mode submitter if it exists.
        if (typeof handleProCodeSubmit === 'function') {
          // handleProCodeSubmit normally reads from its own input element.
          // Stash the value on the canonical input before calling.
          const canonical = document.getElementById('proCodeInput');
          if (canonical) canonical.value = code;
          try {
            handleProCodeSubmit();
            if (status) status.textContent = 'Unlocked. Redirecting…';
            setTimeout(function() { Router.navigate('/design/make'); }, 400);
          } catch (err) {
            if (status) status.textContent = 'Invalid code.';
          }
        } else {
          if (status) status.textContent = 'Code system not loaded yet — try the editor instead.';
        }
      }
    });
```

- [ ] **Step 4: Validate JS syntax**

```powershell
python _validate.py
```

Expected: both blocks PASS.

- [ ] **Step 5: Probe TapIn display manually**

Reload localhost. Probe:
```
evaluate_script(function="() => { Modes.TapIn.enter(); return { display: getComputedStyle(document.getElementById('modeTapIn')).display, hasInput: !!document.getElementById('tapInCodeInput'), hasSubmit: !!document.querySelector('.tap-in-submit'), title: document.querySelector('.tap-in-title').textContent }; }")
```

Expected: `{ display: 'flex', hasInput: true, hasSubmit: true, title: 'Tap in to Tappymaps' }`.

Take screenshot:
```
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-t6-tapin.png", fullPage=true)
```

Hide and verify legacy editor returns:
```
evaluate_script(function="() => { Modes.TapIn.exit(); return getComputedStyle(document.getElementById('modeTapIn')).display; }")
```

Expected: `'none'`.

- [ ] **Step 6: Commit + push**

```powershell
git add index.html
git commit -m @'
feat(tap-in): add minimal /tap-in mode with access-code unlock form

/tap-in is one of four real Phase 1 routes. Minimal page surfacing the
tester-mode access code unlock, plus a Skip link to /design/make.

Form delegates to the existing handleProCodeSubmit() (tester-mode tap26
unlock) via a document-level submit delegate. On success, Router.navigate
sends the user to /design/make so they land on a Pro-unlocked editor.

Markup + CSS scoped under #modeTapIn. Dormant until Router.dispatch fires
in the cutover commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 7: Add `data-route` click delegate

**Purpose:** Single document-level delegate intercepts every `<a data-route>` click and routes it through `Router.navigate()` instead of a full-page navigation. Cmd/Ctrl-click + middle-click + `target="_blank"` still open in new tabs.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Find insertion point**

The delegate goes in the main script block. Place it after the `Modes.TapIn` block from Task 6.

- [ ] **Step 2: Insert the delegate**

```js
    // --- data-route click delegate (Phase 1) ------------------------------
    // Intercepts <a data-route> clicks so internal navigation uses
    // Router.navigate (no full page reload). External links, modified
    // clicks (cmd/ctrl/shift/meta), target="_blank", and middle-clicks
    // get default behavior.

    document.addEventListener('click', function(e) {
      // Only act on primary-button clicks
      if (e.button !== 0) return;
      const a = e.target.closest('a[data-route]');
      if (!a) return;
      if (a.target === '_blank') return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const href = a.getAttribute('href');
      if (!href) return;
      Router.navigate(href);
    });
```

- [ ] **Step 3: Validate JS syntax**

```powershell
python _validate.py
```

Expected: PASS.

- [ ] **Step 4: Verify delegate doesn't fire until dispatch is wired**

Reload localhost. The legacy editor is visible. Click any link without `data-route` (e.g., the cartographer agent's "External link" if present) — should still navigate. Click on the Hub's Design card via manual probe:
```
evaluate_script(function="() => { Modes.Hub.enter(); }")
```

Take a screenshot to confirm Hub is visible. Then click the Design card:
```
click(uid="<obtain from take_snapshot>")
```

Expected: URL becomes `/design/make` (visible in chrome-devtools-mcp address bar). But since Modes.Create isn't registered yet, dispatch falls through to `__notFound__` (which is registered as ComingSoon) — the ComingSoon stub displays.

Hide everything and return to legacy:
```
evaluate_script(function="() => { Modes.Hub.exit(); Modes.ComingSoon.exit(); history.replaceState({}, '', '/'); }")
navigate_page(type="reload")
```

- [ ] **Step 5: Commit + push**

```powershell
git add index.html
git commit -m @'
feat(router): add data-route click delegate for in-app navigation

Document-level click delegate intercepts <a data-route> clicks and
routes them through Router.navigate instead of full-page reloads.
External links and modified clicks (cmd/ctrl/shift/alt, target=_blank,
middle-click, non-primary buttons) get default browser behavior.

Hub footer links + the two main cards already have data-route set
(added in Task 5). Future modes link with data-route to opt-in to
client-side routing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 8: Add landscape rotate-overlay markup + CSS

**Purpose:** Per spec §2: portrait phone in Create mode shows a rotating-phone overlay. Tester can dismiss for portrait fallback. CSS-driven (media query keyed off `body[data-mode="design/make"]`); JS only for the dismiss + orientation-change listener.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Add overlay markup**

In `index.html`, find the existing `<body>` opening tag. Insert the rotate-overlay markup as the FIRST child of `<body>` (above any mode divs):

```html
  <!-- Landscape rotate-overlay (Phase 1) — only fires on portrait phones in /design/make -->
  <div class="rotate-overlay" id="rotateOverlay">
    <div class="rotate-overlay-inner">
      <div class="rotate-overlay-icon" aria-hidden="true">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <rect x="20" y="8" width="24" height="40" rx="4" stroke="currentColor" stroke-width="2.5"/>
          <circle cx="32" cy="42" r="1.5" fill="currentColor"/>
          <path d="M50 24 L58 32 L50 40" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </div>
      <p class="rotate-overlay-title">Rotate your phone</p>
      <p class="rotate-overlay-body">Tappymaps Create is built for landscape. Turn your phone sideways to continue.</p>
      <a href="#" class="rotate-overlay-dismiss" id="rotateOverlayDismiss">Continue in portrait anyway →</a>
    </div>
  </div>
```

- [ ] **Step 2: Add overlay CSS**

Append to the main `<style>` block before `</style>`:

```css
      /* Landscape rotate-overlay (Phase 1) */
      .rotate-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.96);
        color: white;
        z-index: 9999;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 24px;
      }
      .rotate-overlay-inner { max-width: 360px; }
      .rotate-overlay-icon {
        margin: 0 auto 16px;
        color: var(--accent, #0EA5E9);
      }
      .rotate-overlay-title {
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 8px;
      }
      .rotate-overlay-body {
        font-size: 14px;
        margin: 0 0 24px;
        opacity: 0.85;
      }
      .rotate-overlay-dismiss {
        font-size: 13px;
        color: white;
        opacity: 0.6;
        text-decoration: none;
      }
      .rotate-overlay-dismiss:hover { opacity: 1; text-decoration: underline; }
      .rotate-overlay.dismissed { display: none !important; }
      /* Only fires when Create mode is active on a portrait phone */
      @media (max-width: 600px) and (orientation: portrait) {
        body[data-mode="design/make"] .rotate-overlay:not(.dismissed) { display: flex; }
      }
```

- [ ] **Step 3: Add dismiss + orientation-change handlers**

In the main script block, after the data-route delegate from Task 7, append:

```js
    // --- Rotate overlay handlers (Phase 1) --------------------------------
    // Dismiss link adds .dismissed class. NOT persisted — every Create
    // mode entry resets dismissal. Orientation change clears dismiss so
    // the overlay re-evaluates if the user rotates back to portrait.

    document.addEventListener('click', function(e) {
      if (e.target && e.target.id === 'rotateOverlayDismiss') {
        e.preventDefault();
        const ov = document.getElementById('rotateOverlay');
        if (ov) ov.classList.add('dismissed');
      }
    });
    window.addEventListener('orientationchange', function() {
      const ov = document.getElementById('rotateOverlay');
      if (ov) ov.classList.remove('dismissed');
    });
```

- [ ] **Step 4: Validate JS syntax**

```powershell
python _validate.py
```

Expected: PASS.

- [ ] **Step 5: Probe overlay behavior**

Reload localhost. Probe:
```
evaluate_script(function="() => { document.body.dataset.mode = 'design/make'; return { overlayExists: !!document.getElementById('rotateOverlay'), overlayDisplay: getComputedStyle(document.getElementById('rotateOverlay')).display, bodyMode: document.body.dataset.mode }; }")
```

Expected (desktop viewport): `{ overlayExists: true, overlayDisplay: 'none', bodyMode: 'design/make' }`. The media query requires `max-width: 600px` AND `orientation: portrait`, so it doesn't fire on desktop.

Switch to portrait phone:
```
emulate(viewport="390x844x3,mobile,touch", userAgent="<iPhone Safari UA>")
navigate_page(type="reload")
evaluate_script(function="() => { document.body.dataset.mode = 'design/make'; return { overlayDisplay: getComputedStyle(document.getElementById('rotateOverlay')).display }; }")
```

Expected: `{ overlayDisplay: 'flex' }`. Take screenshot to confirm overlay is visible covering the page.

Test dismiss:
```
click(uid="<from take_snapshot — the rotateOverlayDismiss link>")
evaluate_script(function="() => ({ overlayDisplay: getComputedStyle(document.getElementById('rotateOverlay')).display, hasDismissed: document.getElementById('rotateOverlay').classList.contains('dismissed') })")
```

Expected: `{ overlayDisplay: 'none', hasDismissed: true }`.

- [ ] **Step 6: Reset before continuing**

```
evaluate_script(function="() => { document.body.removeAttribute('data-mode'); document.getElementById('rotateOverlay').classList.remove('dismissed'); }")
emulate(viewport="1440x900")
navigate_page(type="reload")
```

Legacy editor visible at desktop size.

- [ ] **Step 7: Commit + push**

```powershell
git add index.html
git commit -m @'
feat(create): add landscape rotate-overlay for portrait phones in Create

Per source spec §2: Create mode is landscape-first. Portrait phones (max
600px wide) see a full-screen "Rotate your phone" overlay with an icon,
explanation, and a "Continue in portrait anyway" dismiss link.

CSS-driven via @media + body[data-mode="design/make"] hook. JS only
handles dismiss + orientationchange. Dismissal does NOT persist — every
Create entry and every rotation re-evaluates so users don't get stuck
with a degraded portrait layout.

Dormant on desktop and on landscape phones (media query bound).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 9: Add backward compat for legacy `/#<hash>` URLs

**Purpose:** Every shared map URL today is `/#<base64>`. After Phase 1, the editor lives at `/design/make`. The URL rewrite ensures legacy URLs still work: `/#<hash>` becomes `/design/make#<hash>` BEFORE the Router dispatches, so existing shared maps land in the new Create mode with their state restored.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Find the right insertion point**

The rewrite must run BEFORE `Router.dispatch()` is called. Since dispatch only fires on `popstate` (already wired) and on `DOMContentLoaded` (not yet wired — that lands in cutover Task 15), we have a window. Put the rewrite immediately after the Router IIFE so it executes at script-load time, before DOMContentLoaded fires.

Find the line `})();` that closes the Router IIFE (last line of Task 3's insertion). Add the rewrite immediately after.

- [ ] **Step 2: Insert the rewrite**

```js
    // --- Legacy URL compat (Phase 1) --------------------------------------
    // Before the Router dispatches, rewrite legacy "/#<base64>" URLs to
    // "/design/make#<base64>" so existing shared maps land in Create mode
    // with state intact. Hash component preserved by history.replaceState.
    //
    // Detection: pathname is exactly "/" and hash is long enough to plausibly
    // be a state blob. If atob/JSON.parse succeed AND the decoded object has
    // a known appState field, rewrite. Else leave the hash alone.

    (function rewriteLegacyHash() {
      if (window.location.pathname !== '/') return;
      if (!window.location.hash || window.location.hash.length < 10) return;
      try {
        const decoded = JSON.parse(atob(window.location.hash.slice(1)));
        // Heuristic: any legacy state will have at least one of these.
        if (decoded && (decoded.colors || decoded.legend || decoded.stateColors || decoded.legendEntries || decoded.mapTitle !== undefined)) {
          history.replaceState({}, '', '/design/make' + window.location.hash);
        }
      } catch (_) {
        // Not a valid base64+JSON blob — could be a regular fragment, leave it.
      }
    })();
```

- [ ] **Step 3: Validate JS syntax**

```powershell
python _validate.py
```

Expected: PASS.

- [ ] **Step 4: Probe rewrite behavior**

Reload localhost. Probe the function's behavior by constructing a known legacy URL:

```
evaluate_script(function="() => { const fakeState = btoa(JSON.stringify({ stateColors: { 'California': '#0EA5E9' }, legendEntries: [], mapTitle: 'Probe Map' })); history.replaceState({}, '', '/#' + fakeState); /* Re-run the rewrite manually since it only fires at script load */ (function(){ if (window.location.pathname !== '/') return; if (!window.location.hash || window.location.hash.length < 10) return; try { const decoded = JSON.parse(atob(window.location.hash.slice(1))); if (decoded && (decoded.colors || decoded.legend || decoded.stateColors || decoded.legendEntries || decoded.mapTitle !== undefined)) { history.replaceState({}, '', '/design/make' + window.location.hash); } } catch (_) {} })(); return { pathname: window.location.pathname, hashLength: window.location.hash.length }; }")
```

Expected: `{ pathname: '/design/make', hashLength: <length of fakeState + 1> }`.

Restore localhost:
```
evaluate_script(function="() => { history.replaceState({}, '', '/'); }")
navigate_page(type="reload")
```

Test it doesn't break non-state hashes:
```
evaluate_script(function="() => { history.replaceState({}, '', '/#section-foo'); /* run rewrite */ (function(){ if (window.location.pathname !== '/') return; if (!window.location.hash || window.location.hash.length < 10) return; try { const decoded = JSON.parse(atob(window.location.hash.slice(1))); if (decoded && (decoded.colors || decoded.legend || decoded.stateColors || decoded.legendEntries || decoded.mapTitle !== undefined)) { history.replaceState({}, '', '/design/make' + window.location.hash); } } catch (_) {} })(); return { pathname: window.location.pathname }; }")
```

Expected: `{ pathname: '/' }` — short non-base64 hash is left alone.

Restore:
```
evaluate_script(function="() => { history.replaceState({}, '', '/'); }")
navigate_page(type="reload")
```

- [ ] **Step 5: Commit + push**

```powershell
git add index.html
git commit -m @'
compat: rewrite legacy /#<base64> URLs to /design/make#<base64>

Every Tappymaps URL shared before Phase 1 is "/#<base64>" — Phase 1 moves
the editor to /design/make. This rewrite runs at script load (before
Router.dispatch fires) and replaces the pathname when the hash looks like
a legacy state blob (decodes to JSON with stateColors/legendEntries/
mapTitle/colors/legend).

Uses history.replaceState so no extra entry in the back stack. Hash
preserved exactly so loadStateFromURL can decode it once Create mode
loads.

Non-state hashes (regular #section anchors) are left alone.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 10: Build new Create mode shell (`#modeCreate` + top bar)

**Purpose:** Add the empty Create mode container with the top bar (wordmark, editable title placeholder, undo/redo, share, account). Map canvas + left rail + right panel are empty placeholders for now. Dormant via `display:none`. Legacy editor still renders.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Add `#modeCreate` shell markup**

Find the `<div class="mode" id="modeComingSoon">` block from Task 4. Insert IMMEDIATELY BEFORE it (so order in `<body>` is: rotate-overlay → modeHub → modeTapIn → **modeCreate** → modeComingSoon):

```html
  <!-- Create mode — 5-panel rail rebuild (Phase 1) -->
  <div class="mode" id="modeCreate" style="display:none">
    <header id="createTopBar">
      <a href="/" data-route class="create-wordmark">tappymaps</a>
      <input
        type="text"
        id="createMapTitleInput"
        class="create-map-title"
        placeholder="My US Map"
        maxlength="60"
        autocomplete="off"
        spellcheck="false">
      <div class="create-topbar-actions">
        <button type="button" class="create-icon-btn" id="createUndoBtn" aria-label="Undo">↶</button>
        <button type="button" class="create-icon-btn" id="createRedoBtn" aria-label="Redo">↷</button>
        <button type="button" class="create-action-btn create-action-btn--share" id="createShareBtn">Share</button>
        <button type="button" class="create-action-btn create-action-btn--account" id="createAccountBtn" aria-label="Account">●</button>
      </div>
    </header>
    <div id="createBody">
      <nav id="createRail" aria-label="Editor panels">
        <!-- Filled in Task 11 -->
      </nav>
      <div id="createMap">
        <!-- SVG mapSVG moves here in cutover (Task 15) -->
      </div>
      <aside id="createPanel" aria-label="Active panel content">
        <!-- 5 panel templates (Task 11) and active panel content -->
      </aside>
    </div>
  </div>
```

- [ ] **Step 2: Add Create mode CSS**

Append to the main `<style>` block before `</style>`:

```css
      /* Create mode (Phase 1) — landscape-first 5-panel rail layout */
      #modeCreate {
        display: none;            /* router toggles to flex */
        flex-direction: column;
        height: 100vh;
        overflow: hidden;
        background: var(--bg);
      }
      body[data-mode="design/make"] #modeCreate { display: flex; }

      #createTopBar {
        height: 44px;
        min-height: 44px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 12px;
        border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
        background: var(--surface, rgba(255,255,255,0.02));
        flex: 0 0 44px;
      }
      .create-wordmark {
        font-weight: 800;
        font-size: 15px;
        color: var(--text);
        text-decoration: none;
        letter-spacing: -0.01em;
      }
      .create-map-title {
        flex: 1;
        max-width: 360px;
        margin: 0 auto;
        padding: 6px 10px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        color: var(--text);
        font-size: 14px;
        font-weight: 600;
        text-align: center;
      }
      .create-map-title:focus {
        background: var(--surface-raised, rgba(255,255,255,0.04));
        border-color: var(--border, rgba(255,255,255,0.12));
        outline: none;
      }
      .create-topbar-actions {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .create-icon-btn {
        width: 30px;
        height: 30px;
        background: transparent;
        border: 1px solid var(--border, rgba(255,255,255,0.1));
        border-radius: 6px;
        color: var(--text);
        font-size: 16px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .create-icon-btn:hover { background: var(--surface-raised, rgba(255,255,255,0.06)); }
      .create-action-btn {
        padding: 6px 14px;
        border-radius: 6px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
      }
      .create-action-btn--share {
        background: var(--accent, #0EA5E9);
        color: white;
        border: none;
      }
      .create-action-btn--account {
        width: 30px;
        height: 30px;
        padding: 0;
        background: transparent;
        color: var(--text);
        border: 1px solid var(--border, rgba(255,255,255,0.1));
        font-size: 18px;
      }

      #createBody {
        flex: 1;
        display: flex;
        min-height: 0;             /* allow children to scroll */
        overflow: hidden;
      }
      #createRail {
        width: 56px;
        flex: 0 0 56px;
        background: var(--surface, rgba(255,255,255,0.02));
        border-right: 1px solid var(--border, rgba(255,255,255,0.08));
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 8px 0;
        gap: 6px;
      }
      #createMap {
        flex: 1 1 55%;
        min-width: 0;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg);
        overflow: hidden;
      }
      #createPanel {
        flex: 0 0 320px;
        background: var(--surface, rgba(255,255,255,0.02));
        border-left: 1px solid var(--border, rgba(255,255,255,0.08));
        overflow-y: auto;
        padding: 16px;
      }

      /* Portrait stack (when user dismisses rotate overlay) */
      @media (max-width: 600px) and (orientation: portrait) {
        #createBody {
          flex-direction: column;
        }
        #createRail {
          flex-direction: row;
          width: 100%;
          height: 56px;
          flex: 0 0 56px;
          border-right: none;
          border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
          justify-content: center;
        }
        #createPanel {
          flex: 0 0 60vh;
          border-left: none;
          border-top: 1px solid var(--border, rgba(255,255,255,0.08));
        }
      }
```

- [ ] **Step 3: Validate JS syntax**

```powershell
python _validate.py
```

Expected: PASS.

- [ ] **Step 4: Probe Create shell visually**

Reload localhost. Probe + reveal:
```
evaluate_script(function="() => { document.body.dataset.mode = 'design/make'; const c = document.getElementById('modeCreate'); return { display: getComputedStyle(c).display, topBarHeight: document.getElementById('createTopBar').getBoundingClientRect().height, hasWordmark: !!document.querySelector('.create-wordmark'), hasTitleInput: !!document.getElementById('createMapTitleInput'), shareBtn: !!document.getElementById('createShareBtn'), railWidth: document.getElementById('createRail').getBoundingClientRect().width, mapWidth: document.getElementById('createMap').getBoundingClientRect().width, panelWidth: document.getElementById('createPanel').getBoundingClientRect().width }; }")
```

Expected at desktop 1440×900:
```json
{
  "display": "flex",
  "topBarHeight": 44,
  "hasWordmark": true,
  "hasTitleInput": true,
  "shareBtn": true,
  "railWidth": 56,
  "mapWidth": <approx 1028>,
  "panelWidth": 320
}
```

Take screenshot:
```
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-t10-create-shell.png", fullPage=true)
```

Should show top bar, rail (empty), empty map area, empty right panel. Below the new shell, the legacy editor markup is also visible (it hasn't been deleted yet, and the new shell is `position: static` per CSS so legacy markup sits below).

This is expected mid-Phase-1. The cutover commit will delete the legacy markup so only the new shell renders.

- [ ] **Step 5: Reset before continuing**

```
evaluate_script(function="() => { document.body.removeAttribute('data-mode'); }")
navigate_page(type="reload")
```

Legacy editor only.

- [ ] **Step 6: Commit + push**

```powershell
git add index.html
git commit -m @'
feat(create): add new Create mode shell with top bar (rail + map + panel empty)

Adds <div id="modeCreate"> wrapping a 44px-tall top bar and a 3-column
body (rail, map, panel). Top bar contains: wordmark "tappymaps" linking
home, editable map title input, undo/redo + Share + Account buttons.

Rail (#createRail, 56px wide), map area (#createMap, flex), and right
panel (#createPanel, 320px wide) are empty placeholders. Filled in
Tasks 11–14.

CSS gated by body[data-mode="design/make"] — so the new shell only
shows when Router dispatches Create mode (still dormant pre-cutover).
Portrait fallback (after user dismisses rotate overlay) stacks rail
horizontally above panel as 60vh sheet.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 11: Build left rail (5 icon buttons) + 5 panel content templates

**Purpose:** Fill in `#createRail` with 5 `<button data-panel>` icons and `#createPanel` with 5 sibling `<div>` content templates (Map, Color, Legend, Data, Upgrade). Each template is initially `display:none`; `switchPanel(name)` (Task 13) toggles them.

For Phase 1, panel CONTENT initially references the **same DOM nodes** legacy markup uses (#sourceInput, #colorPalette, etc.). In the cutover task (Task 15), we MOVE those nodes out of legacy markup into the new panel templates. So the templates start empty-ish and we slot existing elements in later.

This task creates the EMPTY panel skeleton — the wrappers, headers, and section comments — but leaves the inner content for the cutover. That keeps this task small and reviewable.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Fill in the left rail buttons**

Use Edit tool on `index.html`. Find the `<nav id="createRail" aria-label="Editor panels">` line from Task 10. Replace its `<!-- Filled in Task 11 -->` comment with:

```html
        <button type="button" class="rail-btn" data-panel="map" aria-label="Map settings" title="Map">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3 L3 6 V21 L9 18 L15 21 L21 18 V3 L15 6 L9 3 Z"/><path d="M9 3 V18"/><path d="M15 6 V21"/></svg>
        </button>
        <button type="button" class="rail-btn" data-panel="color" aria-label="Colors" title="Color">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>
        </button>
        <button type="button" class="rail-btn" data-panel="legend" aria-label="Legend" title="Legend">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="4" height="4"/><rect x="3" y="11" width="4" height="4"/><rect x="3" y="17" width="4" height="2"/><line x1="10" y1="7" x2="21" y2="7"/><line x1="10" y1="13" x2="21" y2="13"/><line x1="10" y1="18" x2="21" y2="18"/></svg>
        </button>
        <button type="button" class="rail-btn" data-panel="data" aria-label="Data Maps" title="Data">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18 L9 12 L13 16 L21 6"/><path d="M16 6 H21 V11"/></svg>
        </button>
        <button type="button" class="rail-btn rail-btn--pro" data-panel="upgrade" aria-label="Pro upgrade" title="Pro">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 L15 9 L22 10 L17 15 L18 22 L12 18 L6 22 L7 15 L2 10 L9 9 Z"/></svg>
        </button>
```

- [ ] **Step 2: Add rail button CSS**

Append to the main `<style>` block before `</style>`:

```css
      /* Rail buttons */
      .rail-btn {
        width: 40px;
        height: 40px;
        background: transparent;
        border: none;
        border-radius: 8px;
        color: var(--text);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        opacity: 0.55;
        transition: opacity 0.12s ease, background 0.12s ease;
      }
      .rail-btn:hover { opacity: 0.85; background: var(--surface-raised, rgba(255,255,255,0.05)); }
      .rail-btn.is-active {
        opacity: 1;
        background: color-mix(in srgb, var(--accent, #0EA5E9) 20%, transparent);
        color: var(--accent, #0EA5E9);
      }
      .rail-btn--pro.is-active {
        background: color-mix(in srgb, #F97316 20%, transparent);
        color: #F97316;
      }
```

- [ ] **Step 3: Fill in the 5 panel content templates**

Find the `<aside id="createPanel" aria-label="Active panel content">` line. Replace its `<!-- 5 panel templates (Task 11) and active panel content -->` comment with:

```html
        <!-- Map panel: title/subtitle/source + Browse Templates inline grid -->
        <section class="create-panel-content" id="createPanelMap" style="display:none">
          <h3 class="create-panel-heading">Map</h3>
          <!-- Inner content slotted in cutover (Task 15) from legacy #sidebarSheet / #tapPanel -->
        </section>

        <!-- Color panel: palette, manage colors -->
        <section class="create-panel-content" id="createPanelColor" style="display:none">
          <h3 class="create-panel-heading">Colors</h3>
        </section>

        <!-- Legend panel: legend builder -->
        <section class="create-panel-content" id="createPanelLegend" style="display:none">
          <h3 class="create-panel-heading">Legend</h3>
        </section>

        <!-- Data panel: ACS datasets + ramp -->
        <section class="create-panel-content" id="createPanelData" style="display:none">
          <h3 class="create-panel-heading">
            Data Maps
            <span class="pro-chip">PRO</span>
          </h3>
        </section>

        <!-- Upgrade panel: Pro feature surfacing -->
        <section class="create-panel-content" id="createPanelUpgrade" style="display:none">
          <h3 class="create-panel-heading">Tappymaps Pro</h3>
          <p class="create-panel-lede">Unlock unlimited exports, no watermark, and Data Maps.</p>
          <button type="button" class="create-action-btn create-action-btn--share" id="createUpgradeCTA" style="width:100%;margin-top:12px">
            Upgrade
          </button>
          <p class="create-panel-sub">Already have an access code?</p>
          <form id="createPanelCodeForm" autocomplete="off">
            <input type="text" id="createPanelCodeInput" class="tap-in-input" placeholder="access code" maxlength="32">
            <button type="submit" class="tap-in-submit" style="width:100%;margin-top:8px">Unlock</button>
          </form>
        </section>
```

- [ ] **Step 4: Add panel content CSS**

Append:

```css
      /* Panel content templates */
      .create-panel-content {
        animation: panelFade 0.18s ease;
      }
      @keyframes panelFade {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .create-panel-heading {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin: 0 0 12px;
        color: var(--text);
        opacity: 0.7;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .pro-chip {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding: 2px 6px;
        border-radius: 4px;
        background: linear-gradient(90deg, var(--accent, #0EA5E9) 0%, #F97316 100%);
        color: white;
      }
      .create-panel-lede {
        font-size: 14px;
        margin: 0 0 12px;
        opacity: 0.85;
      }
      .create-panel-sub {
        font-size: 12px;
        margin: 16px 0 8px;
        opacity: 0.6;
      }
```

- [ ] **Step 5: Validate JS syntax**

```powershell
python _validate.py
```

Expected: PASS.

- [ ] **Step 6: Probe rail + panel templates**

Reload localhost. Probe:
```
evaluate_script(function="() => { document.body.dataset.mode = 'design/make'; const rail = document.getElementById('createRail'); const buttons = rail.querySelectorAll('.rail-btn'); const panels = ['Map','Color','Legend','Data','Upgrade'].map(n => 'createPanel' + n); return { railButtonCount: buttons.length, dataPanelValues: Array.from(buttons).map(b => b.dataset.panel), panelsExist: panels.map(id => !!document.getElementById(id)), proChipExists: !!document.querySelector('.pro-chip') }; }")
```

Expected:
```json
{
  "railButtonCount": 5,
  "dataPanelValues": ["map", "color", "legend", "data", "upgrade"],
  "panelsExist": [true, true, true, true, true],
  "proChipExists": true
}
```

Take screenshot:
```
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-t11-rail-panels.png", fullPage=true)
```

Should show 5 icon buttons in the rail, empty map area, empty panel.

- [ ] **Step 7: Reset + commit**

```
evaluate_script(function="() => { document.body.removeAttribute('data-mode'); }")
navigate_page(type="reload")
```

```powershell
git add index.html
git commit -m @'
feat(create): add 5-button rail + 5 panel content templates (skeletons)

Fills #createRail with 5 <button data-panel> icons (Map / Color / Legend
/ Data / Upgrade) using inline SVGs. Adds rail-btn styling + .is-active
state (turquoise for Design context, orange swap for the Pro rail btn).

Adds 5 sibling <section> panel templates inside #createPanel:
  #createPanelMap, #createPanelColor, #createPanelLegend,
  #createPanelData (with "PRO" chip), #createPanelUpgrade

Templates are skeletons — headings + comments marking where legacy
content slots in during the cutover (Task 15). Upgrade panel ships
populated (lede + CTA + access-code form) since it has no legacy
counterpart to migrate.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 12: Implement `switchPanel` + rail event delegate + Upgrade panel handlers

**Purpose:** Wire up the rail. Clicking a rail button calls `switchPanel(name)`, which:
1. Hides all 5 panel content sections
2. Shows the requested one
3. Marks the matching rail button `.is-active`

Also wire the Upgrade panel's CTA and code form (the only panel with non-legacy content in Task 11).

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Add `switchPanel` + rail delegate**

In the main script block, after the rotate-overlay handlers from Task 8, append:

```js
    // --- Create rail: panel switching (Phase 1) ---------------------------
    // switchPanel(name) hides all #createPanelXxx sections, shows the named
    // one, toggles .is-active on the matching rail button.

    function switchPanel(name) {
      const ids = ['createPanelMap', 'createPanelColor', 'createPanelLegend', 'createPanelData', 'createPanelUpgrade'];
      const targetId = 'createPanel' + name.charAt(0).toUpperCase() + name.slice(1);
      ids.forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === targetId) ? 'block' : 'none';
      });
      const rail = document.getElementById('createRail');
      if (rail) {
        rail.querySelectorAll('.rail-btn').forEach(function(btn) {
          btn.classList.toggle('is-active', btn.dataset.panel === name);
        });
      }
    }

    // Rail click delegate — single listener on #createRail, dispatches
    // based on clicked button's data-panel attribute.
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('#createRail .rail-btn');
      if (!btn) return;
      const name = btn.dataset.panel;
      if (name) switchPanel(name);
    });
```

- [ ] **Step 2: Add Upgrade panel handlers**

In the same script block, after the switchPanel block, append:

```js
    // --- Upgrade panel handlers (Phase 1) ---------------------------------
    // CTA: shows the full upgrade modal (when not in TESTER_MODE) or the
    //      access-code field (when in TESTER_MODE).
    // Form: delegates to handleProCodeSubmit() — same plumbing as /tap-in
    //      and the existing modal field.

    document.addEventListener('click', function(e) {
      if (e.target && e.target.id === 'createUpgradeCTA') {
        if (typeof showUpgradeModal === 'function') {
          showUpgradeModal();
        }
      }
    });

    document.addEventListener('submit', function(e) {
      if (e.target && e.target.id === 'createPanelCodeForm') {
        e.preventDefault();
        const input = document.getElementById('createPanelCodeInput');
        const code = (input && input.value || '').trim();
        if (!code) return;
        if (typeof handleProCodeSubmit === 'function') {
          // Stash on the canonical input the legacy fn reads from.
          const canonical = document.getElementById('proCodeInput');
          if (canonical) canonical.value = code;
          try { handleProCodeSubmit(); } catch (_) {}
        }
      }
    });
```

- [ ] **Step 3: Validate JS syntax**

```powershell
python _validate.py
```

Expected: PASS.

- [ ] **Step 4: Test switchPanel from console**

Reload localhost. Probe:
```
evaluate_script(function="() => { document.body.dataset.mode = 'design/make'; switchPanel('map'); return { mapDisplay: getComputedStyle(document.getElementById('createPanelMap')).display, colorDisplay: getComputedStyle(document.getElementById('createPanelColor')).display, activeBtn: document.querySelector('.rail-btn.is-active')?.dataset.panel || null }; }")
```

Expected: `{ mapDisplay: 'block', colorDisplay: 'none', activeBtn: 'map' }`.

Test switching:
```
evaluate_script(function="() => { switchPanel('legend'); return { legendDisplay: getComputedStyle(document.getElementById('createPanelLegend')).display, mapDisplay: getComputedStyle(document.getElementById('createPanelMap')).display, activeBtn: document.querySelector('.rail-btn.is-active')?.dataset.panel || null }; }")
```

Expected: `{ legendDisplay: 'block', mapDisplay: 'none', activeBtn: 'legend' }`.

Test by clicking the Upgrade icon:
```
take_snapshot()  # get uid of the rail's Pro button
click(uid="<uid for rail-btn--pro>")
evaluate_script(function="() => ({ upgradeDisplay: getComputedStyle(document.getElementById('createPanelUpgrade')).display, activeBtn: document.querySelector('.rail-btn.is-active')?.dataset.panel || null })")
```

Expected: `{ upgradeDisplay: 'block', activeBtn: 'upgrade' }`. Take screenshot:
```
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-t12-upgrade-panel.png", fullPage=true)
```

Visual: the Upgrade panel with "Tappymaps Pro" heading + Upgrade button + access-code form.

- [ ] **Step 5: Reset + commit**

```
evaluate_script(function="() => { document.body.removeAttribute('data-mode'); document.querySelectorAll('.create-panel-content').forEach(el => el.style.display = 'none'); document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('is-active')); }")
navigate_page(type="reload")
```

```powershell
git add index.html
git commit -m @'
feat(create): wire switchPanel + rail delegate + Upgrade panel handlers

switchPanel(name) hides all 5 #createPanelXxx sections, shows the named
one, and toggles .is-active on the matching rail button. Single
document-level delegate on #createRail dispatches clicks to switchPanel.

Upgrade panel:
  - CTA button calls showUpgradeModal() (existing fn — opens the modal
    with feature grid in non-tester mode, or the auth/code surface in
    tester mode).
  - Code form delegates to handleProCodeSubmit() — same plumbing as
    /tap-in and the existing modal field.

Still dormant — no DOMContentLoaded dispatch, so user-facing /design/make
doesn't render yet. switchPanel works when invoked manually for testing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 13: Add `Modes.Create` lifecycle (enter/exit/meta) — still dormant

**Purpose:** Build the Modes.Create object that orchestrates entering Create mode (show the shell, restore state from URL hash if present, ensure landscape, default to Map panel). Register it with Router. Dispatch still gated — runs only when manually called.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

- [ ] **Step 1: Add `Modes.Create`**

In the main script block, after the Upgrade panel handlers from Task 12, append:

```js
    // --- Modes.Create lifecycle (Phase 1) ---------------------------------
    Modes.Create = {
      enter(route) {
        const el = document.getElementById('modeCreate');
        if (el) el.style.display = 'flex';
        // Restore state from hash if present (legacy URL compat in Task 9
        // already rewrote /#<hash> → /design/make#<hash>).
        if (window.location.hash && typeof loadStateFromURL === 'function') {
          try { loadStateFromURL(); } catch (e) { console.warn('loadStateFromURL:', e); }
        }
        // Default to Map panel.
        if (typeof switchPanel === 'function') switchPanel('map');
      },
      exit() {
        const el = document.getElementById('modeCreate');
        if (el) el.style.display = 'none';
      },
      meta(route) {
        const titleField = (typeof appState !== 'undefined' && appState.mapTitle) ? appState.mapTitle : 'Create';
        return {
          title: titleField + ' — Tappymaps',
          description: 'Color a US states map. Tap. Color. Share.',
          canonical: 'https://tappymaps.com/design/make',
        };
      },
    };
    Router.register('design/make', Modes.Create);
```

- [ ] **Step 2: Validate JS syntax**

```powershell
python _validate.py
```

Expected: PASS.

- [ ] **Step 3: Probe Modes.Create.enter manually**

Reload localhost. Probe (note: SVG isn't moved into #createMap yet — that's the cutover. So Create mode will show an empty map area for now):
```
evaluate_script(function="() => { Modes.Create.enter({ mode: 'design/make' }); return { createDisplay: getComputedStyle(document.getElementById('modeCreate')).display, bodyMode: document.body.dataset.mode || null, activePanel: document.querySelector('.rail-btn.is-active')?.dataset.panel || null, mapPanelDisplay: getComputedStyle(document.getElementById('createPanelMap')).display }; }")
```

Expected: `{ createDisplay: 'flex', bodyMode: null, activePanel: 'map', mapPanelDisplay: 'block' }`.

Note: `bodyMode` is null because we're calling `Modes.Create.enter` directly, not `Router.dispatch`. The body attribute is only set inside `Router.dispatch`. That's fine for this test.

Take screenshot to confirm the new shell renders (legacy editor markup still underneath in the DOM but the new shell sits on top per the `body[data-mode="design/make"]` rule... wait, we haven't set `body[data-mode]`. So the new shell shows because `Modes.Create.enter` explicitly set `display:flex`, but its CSS positioning is `static` — it sits in document order. The legacy markup would appear below it on the page).

```
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-t13-modes-create.png", fullPage=true)
```

Verify:
- New shell visible (top bar, empty rail, empty map, empty/Map panel)
- Legacy editor markup visible BELOW the new shell (this is expected — cutover deletes it)

- [ ] **Step 4: Reset + commit**

```
evaluate_script(function="() => { Modes.Create.exit(); }")
navigate_page(type="reload")
```

```powershell
git add index.html
git commit -m @'
feat(create): add Modes.Create lifecycle + register with Router

Modes.Create.enter:
  1. Set #modeCreate display:flex
  2. If URL hash present, call loadStateFromURL (restores state from
     legacy /#<hash> URLs after rewrite, or from fresh /design/make#<hash>
     shares)
  3. switchPanel("map") — default rail selection

Modes.Create.exit: hide #modeCreate.

Modes.Create.meta returns dynamic title (uses appState.mapTitle if set,
else "Create") and canonical /design/make.

Registered with Router under "design/make" key. Still dormant —
Router.dispatch not auto-firing until cutover (Task 15). Can be invoked
manually for testing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 14: Pre-cutover audit — find every wire() call + legacy event listener that touches doomed markup

**Purpose:** The cutover deletes a lot of markup. Any wire() call or event listener referencing deleted IDs needs to either be deleted (legacy-only) or rewritten as a delegate on the new structure. This task does the audit only — no code changes. Output is a checklist the cutover task consumes.

**Files:**
- Read-only audit of `C:\Users\mhowe\tappymaps\index.html`
- Create: `C:\Users\mhowe\tappymaps\_phase1_audit.md` (gitignored — anything starting with `_` is)

- [ ] **Step 1: Find all `wire(` call sites**

```powershell
Set-Location C:\Users\mhowe\tappymaps
```

Use Grep with pattern `^\s*wire\s*\(` in `index.html`, output_mode=content, -n=true. Capture every line.

- [ ] **Step 2: Find all `addEventListener` call sites that reference doomed IDs**

Use Grep with pattern `getElementById\(['"](?:mobileSourceInput|mobileColorPanelOpenBtn|colorPanel|tapPanel|sharePanel|dataPanel|morePalettesMobilePanel|mobileTitleInput|mobileSubtitleInput|sidebarSheet|templatesModal|mobilePanelBackdrop)` in `index.html`, output_mode=content, -n=true.

Use Grep with pattern `querySelector\(['"]\.mobile-panel|querySelector\(['"]#sidebarSheet|querySelector\(['"]#templatesModal` in `index.html`, output_mode=content, -n=true.

- [ ] **Step 3: Find all `closeAllPanels` call sites**

Use Grep with pattern `closeAllPanels\s*\(` in `index.html`, output_mode=content, -n=true.

- [ ] **Step 4: Write audit doc**

Use Write tool to create `C:\Users\mhowe\tappymaps\_phase1_audit.md`:

```markdown
# Phase 1 Cutover Audit (gitignored, throwaway)

## wire() call sites (Mobile UX IIFE)
<paste all lines from Step 1>

## addEventListener / getElementById sites targeting doomed markup
<paste all lines from Step 2>

## closeAllPanels() call sites
<paste all lines from Step 3>

## Disposition plan

For each wire() call:
- [ ] If the ID it wires lives in deleted markup AND has a corresponding new
      element in #createPanelXxx → REWRITE as delegate in Task 15
- [ ] If the ID lives in deleted markup AND has NO new equivalent → DELETE
- [ ] If the ID lives in markup that stays (e.g., #upgradeModal, #onboardingModal)
      → KEEP as-is

For each addEventListener targeting doomed markup:
- [ ] Same triage. If the listener calls a function that's still needed,
      reattach to the equivalent new element via delegate.

For each closeAllPanels() call site:
- [ ] Delete — there are no panels-to-close in the new model. Bottom-sheet
      mobile panels are replaced by the always-on right rail panel.
```

Fill in the audit doc with actual line references from Steps 1-3.

- [ ] **Step 5: No commit (audit doc is gitignored)**

```powershell
git status --short _phase1_audit.md
```

Expected: empty output. The doc exists locally as a working reference for Task 15 but won't be committed.

Read the audit doc end-to-end. Confirm you understand which wire() calls migrate (Map/Color/Legend/Data panels) vs which delete (Share panel — Share is a top-bar action, not a rail panel; More Palettes — folded into Color panel).

---

## Task 15: THE CUTOVER — atomic commit

**Purpose:** The single big commit that flips Tappymaps from the legacy editor to the new Create mode. Many edits, one commit. After push, the live site renders the new structure.

This is the only Phase 1 task where the site visibly changes for users. All preceding tasks were additive + dormant.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\index.html`

**Critical invariants — DO NOT CHANGE during cutover (cartographer agent tribal knowledge):**
- `<svg id="mapSVG" viewBox="-20 -30 1010 710">` — viewBox unchanged, ID unchanged
- `#statesGroup transform="translate(5, -20) scale(0.95)"` — unchanged
- `function renderMap()`, `onStateClick`, `captureMapImage`, `updateLegendDisplay`, `loadStateFromURL`, `encodeStateToURL`, `isPro`, `loadTemplate`, `handleProCodeSubmit`, `enforceLandscape` — all unchanged in BODY (move location only if needed)
- `nonColorable` set — unchanged
- TESTER_MODE behavior — unchanged

- [ ] **Step 1: Move the SVG into `#createMap`**

In `index.html`:
1. Find `<svg id="mapSVG" viewBox="-20 -30 1010 710"` (use Grep). Note its current parent (currently `<div id="mapContainer">` per line 2560 grep).
2. Use Read tool to read the entire `<svg id="mapSVG" ...>...</svg>` block including all children (`<g id="statesGroup">`, `<text>` elements, `<g>` logo group). It's a large block — use offset/limit to read it.
3. Use Edit tool to REMOVE the entire `<svg id="mapSVG">...</svg>` block from its current location.
4. Use Edit tool to INSERT the same block as a child of `<div id="createMap">` (currently empty placeholder). The new `#createMap` location is inside `#modeCreate > #createBody > #createMap` from Task 10.

After this edit, the SVG is rendered ONLY inside the new Create shell. JS that queries by ID (e.g., `document.getElementById('mapSVG')`) keeps working.

Validate immediately:
```powershell
python _validate.py
```

Expected: PASS.

- [ ] **Step 2: Move `#mapTitle` into the top bar (or merge with `#createMapTitleInput`)**

The legacy `#mapTitle` (line 2561) is a `<div contenteditable>`. The new top bar has `<input id="createMapTitleInput">`. We want ONE editable title element. Two options:

**Option A (simpler):** Delete the legacy `<div id="mapTitle" contenteditable>`. Wire `#createMapTitleInput` to write to `appState.mapTitle` on input. Update existing code that read from `#mapTitle.textContent` to read from `#createMapTitleInput.value` (Grep for `mapTitle.textContent` and `mapTitle\.innerText`).

**Option B (preservation):** Keep `<div id="mapTitle">` but reposition it inside the top bar as a contenteditable span. Delete `<input id="createMapTitleInput">`. Update CSS to style `#mapTitle` to match the top-bar input.

Use **Option A** — cleaner break, less CSS gymnastics. Steps:

1. Delete the legacy `<div id="mapTitle" contenteditable="true">My US Map</div>` markup from line ~2561.
2. Update `#createMapTitleInput` to have its `value` set from `appState.mapTitle` when Create mode enters. Modify `Modes.Create.enter`:
   ```js
   // inside Modes.Create.enter, after the loadStateFromURL block:
   const titleInput = document.getElementById('createMapTitleInput');
   if (titleInput) titleInput.value = (typeof appState !== 'undefined' && appState.mapTitle) || '';
   ```
3. Add an input listener inside `Modes.Create.enter` (idempotent — only attach once). Actually, attach as a document delegate added at script-load time:
   ```js
   // Add OUTSIDE Modes.Create, near switchPanel:
   document.addEventListener('input', function(e) {
     if (e.target && e.target.id === 'createMapTitleInput') {
       if (typeof appState !== 'undefined') {
         appState.mapTitle = e.target.value;
         if (typeof encodeStateToURL === 'function') encodeStateToURL();
       }
     }
   });
   ```
4. Grep for `mapTitle.textContent` and `mapTitle\.innerText` in `index.html` — every read site needs to switch to `appState.mapTitle` (which is already kept in sync). Every write site needs to update `createMapTitleInput.value` instead.
5. Grep for `getElementById('mapTitle')` — every site needs review. Some are inside `captureMapImage()` (the export pipeline reads the title for the export). The cleanest fix is to expose a small helper:
   ```js
   function getMapTitleEl() {
     // Returns the current title element for legacy callers (e.g. captureMapImage).
     // After Phase 1 cutover, the title input is the top-bar input.
     return document.getElementById('createMapTitleInput');
   }
   ```
   Then update captureMapImage's references to use `.value` instead of `.textContent`.

Important: `captureMapImage()` ALSO renders a title visible on the exported PNG. That rendering uses the title text to draw onto the SVG-based capture. The text source switches from `mapTitle.textContent` to `createMapTitleInput.value`. Test export immediately after this step.

Validate:
```powershell
python _validate.py
```

- [ ] **Step 3: Delete legacy markup blocks**

In order (use Edit tool, removing entire blocks):

1. Delete `<aside class="sidebar" id="sidebarSheet">...</aside>` (line ~2302 — find with Grep, read the entire block to know its extent, then remove it as one Edit). Inside this aside lives `<input id="sourceInput">` (line ~2446) — that input gets RE-ADDED into `#createPanelMap` in Step 4 below. Take a copy of the relevant inner markup first.

2. Delete `<div class="map-container ocean-on" id="mapContainer">...</div>` wrapper that previously held the SVG. The SVG is already moved (Step 1) so this wrapper should be empty or near-empty. Remove the wrapper and any leftover legacy children.

3. Delete `<div class="mobile-panel-backdrop" id="mobilePanelBackdrop">` line.

4. Delete `<div class="mobile-panel" id="tapPanel">...</div>` (line ~7314).

5. Delete `<div class="mobile-panel" id="colorPanel">...</div>` (line ~7359).

6. Delete `<div class="mobile-panel" id="sharePanel">...</div>` (line ~7437). Share becomes a top-bar action (already in #createTopBar from Task 10) — no panel needed.

7. Delete `<div class="mobile-panel" id="dataPanel">...</div>` (line ~7459).

8. Delete `<div class="mobile-panel" id="morePalettesMobilePanel">...</div>` (line ~7471).

9. Delete `<div class="modal-overlay" id="templatesModal">...</div>` if present (Grep to find — was a full-screen modal; templates now inline in Map panel).

After each block deletion, run `python _validate.py` to catch syntax errors early. If a block deletion leaves orphaned tags or comments, fix immediately.

- [ ] **Step 4: Slot the existing inputs/controls into the new panel templates**

For each new panel, find equivalent content from the deleted legacy markup (you took copies in Step 3) and insert into the matching `#createPanelXxx` template:

**Map panel (`#createPanelMap`):**
Inside `<section ... id="createPanelMap">`, after the heading, add (copy from the deleted sidebar/tapPanel):
```html
          <label class="create-field-label">Title</label>
          <input type="text" id="mapTitleInput" class="create-panel-input" placeholder="My US Map" maxlength="60" autocomplete="off">
          <label class="create-field-label">Subtitle</label>
          <input type="text" id="mapSubtitleInput" class="create-panel-input" placeholder="Optional subtitle" maxlength="80" autocomplete="off">
          <label class="create-field-label">Source</label>
          <input type="text" id="sourceInput" class="create-panel-input" name="map-source-citation" autocomplete="off" data-1p-ignore data-lpignore="true" readonly placeholder="e.g. U.S. Census Bureau, 2024" maxlength="100">
          <button type="button" class="create-panel-btn" id="openTemplatesBtn">Browse Templates</button>
          <button type="button" class="create-panel-btn create-panel-btn--ghost" id="clearAllBtn">Clear All States</button>
          <div id="inlineTemplatesGrid" style="display:none">
            <!-- Templates grid is rendered dynamically by loadTemplate / renderTemplates -->
          </div>
```

The `#sourceInput` carries through ALL the legacy attributes (`readonly`, `autocomplete="off"`, `data-1p-ignore`, `data-lpignore`, `name="map-source-citation"`) — these are part of the autofill defeat (commit `187cad1`). DO NOT drop any of them.

Add CSS:
```css
      .create-field-label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.6;
        margin: 12px 0 4px;
      }
      .create-panel-input {
        width: 100%;
        padding: 6px 10px;
        font-size: 13px;
        background: var(--surface-raised, rgba(255,255,255,0.04));
        border: 1px solid var(--border, rgba(255,255,255,0.12));
        border-radius: 6px;
        color: var(--text);
        box-sizing: border-box;
      }
      .create-panel-btn {
        width: 100%;
        padding: 10px;
        margin-top: 12px;
        background: var(--accent, #0EA5E9);
        color: white;
        border: none;
        border-radius: 6px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
      }
      .create-panel-btn--ghost {
        background: transparent;
        color: var(--text);
        border: 1px solid var(--border, rgba(255,255,255,0.15));
      }
```

**Color panel (`#createPanelColor`):**
Copy the legacy color palette + manage colors markup from the deleted `#colorPanel` and `#morePalettesMobilePanel`. The palette + swatch wiring already works via IDs (e.g., `#colorPalette`, `#morePalettesBtn`). Place the markup inside `#createPanelColor`. Don't rename IDs.

**Legend panel (`#createPanelLegend`):**
Copy the legacy legend builder markup. ID `#legendBuilder` and its children stay the same.

**Data panel (`#createPanelData`):**
Copy the legacy data maps markup from the deleted `#dataPanel`. IDs stay the same.

**Upgrade panel (`#createPanelUpgrade`):**
Already populated in Task 11. No legacy content to migrate.

After this step, every legacy ID that needs to keep working is present in the new panel templates.

Validate:
```powershell
python _validate.py
```

- [ ] **Step 5: Delete legacy wire() calls + closeAllPanels function**

Open `_phase1_audit.md` from Task 14. For each wire() call site:

- If wire targets a deleted ID with no new equivalent → DELETE the wire() call.
- If wire targets an ID that moved into a new panel → DELETE the wire() call and add an equivalent delegate (Step 6 below). Easier: most input/change events bubble, so a per-panel delegate is sufficient.

Delete `function closeAllPanels() { ... }` entirely.
Delete every `closeAllPanels()` call site.

Validate:
```powershell
python _validate.py
```

- [ ] **Step 6: Add per-panel event delegates**

After `switchPanel` in the main script block, add four delegates (Map, Color, Legend, Data — Upgrade was wired in Task 12):

```js
    // --- Per-panel content delegates (Phase 1) ----------------------------
    // Each panel has its own click + change delegate. Replaces the old
    // wire() pattern, which targeted IDs that lived in markup we just
    // deleted. The legacy core fns (loadTemplate, applyTemplate, etc.)
    // still exist — we just bind to them from the new structure.

    document.addEventListener('click', function(e) {
      if (e.target.closest('#createPanelMap #openTemplatesBtn')) {
        const grid = document.getElementById('inlineTemplatesGrid');
        if (grid) {
          if (grid.style.display === 'none') {
            if (typeof renderTemplatesInto === 'function') {
              renderTemplatesInto(grid);
            } else if (typeof renderTemplates === 'function') {
              renderTemplates(grid);
            }
            grid.style.display = 'block';
          } else {
            grid.style.display = 'none';
          }
        }
      }
      if (e.target.closest('#createPanelMap #clearAllBtn')) {
        if (typeof clearAllStates === 'function') clearAllStates();
      }
    });

    document.addEventListener('input', function(e) {
      if (e.target.id === 'mapTitleInput') {
        if (typeof appState !== 'undefined') {
          appState.mapTitle = e.target.value;
          // Mirror to the top-bar input
          const top = document.getElementById('createMapTitleInput');
          if (top) top.value = e.target.value;
          if (typeof encodeStateToURL === 'function') encodeStateToURL();
        }
      }
      if (e.target.id === 'mapSubtitleInput') {
        if (typeof appState !== 'undefined') {
          appState.mapSubtitle = e.target.value;
          if (typeof encodeStateToURL === 'function') encodeStateToURL();
        }
      }
      if (e.target.id === 'sourceInput') {
        if (typeof appState !== 'undefined') {
          appState.mapSource = e.target.value;
          if (typeof encodeStateToURL === 'function') encodeStateToURL();
        }
      }
    });
```

Note: if any of the called functions (`renderTemplates`, `clearAllStates`, `renderTemplatesInto`) don't exist by that exact name in the current codebase, Grep for the legacy template-rendering fn (likely `renderTemplatesGrid` or similar in the existing `loadTemplate`/templates modal code) and use the right name. The legacy templates modal used a function that builds the template grid — that function still exists, just point at the new `#inlineTemplatesGrid` container.

For the Color / Legend / Data panels, the existing wire() calls already pointed at IDs that we KEPT (just moved to new parents). Most events still fire on the same IDs via the existing top-of-file `addEventListener` calls — no new delegates needed unless wire() was removed. Cross-check with the audit doc.

Validate:
```powershell
python _validate.py
```

- [ ] **Step 7: Wire share + account + undo + redo buttons in the top bar**

Add to the same script block:

```js
    document.addEventListener('click', function(e) {
      if (e.target && e.target.id === 'createShareBtn') {
        // Hook to existing share flow. Most likely the legacy code has a
        // showShareSheet() or similar. If not, fall back to copying URL.
        if (typeof showShareSheet === 'function') {
          showShareSheet();
        } else if (typeof handleShare === 'function') {
          handleShare();
        } else if (typeof encodeStateToURL === 'function') {
          encodeStateToURL();
          if (navigator.share) {
            navigator.share({ url: window.location.href, title: 'Tappymaps' }).catch(function(){});
          } else if (navigator.clipboard) {
            navigator.clipboard.writeText(window.location.href);
          }
        }
      }
      if (e.target && e.target.id === 'createAccountBtn') {
        if (typeof showAccountMenu === 'function') {
          showAccountMenu();
        } else if (typeof syncAccountMenu === 'function') {
          syncAccountMenu();
        }
      }
      if (e.target && e.target.id === 'createUndoBtn') {
        if (typeof undo === 'function') undo();
      }
      if (e.target && e.target.id === 'createRedoBtn') {
        if (typeof redo === 'function') redo();
      }
    });
```

Adjust function names if the legacy code uses different ones — Grep for `function undo`, `function redo`, `function showShareSheet`, `function showAccountMenu` to find the actual names.

Validate:
```powershell
python _validate.py
```

- [ ] **Step 8: Enable Router.dispatch on DOMContentLoaded**

Inside the Router IIFE (defined in Task 3), the IIFE returns `{ register, parseRoute, dispatch, navigate }`. The `popstate` listener is attached but `DOMContentLoaded` is NOT.

Find the Router IIFE block. Add the DOMContentLoaded listener INSIDE the IIFE, before the `return` statement:

```js
      // Phase 1 cutover: dispatch on DOMContentLoaded.
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', dispatch);
      } else {
        // Document already parsed (script loaded late) — dispatch now.
        // setTimeout to give other DOMContentLoaded handlers a chance to
        // initialize first (init(), renderMap, etc.).
        setTimeout(dispatch, 0);
      }
```

Validate:
```powershell
python _validate.py
```

- [ ] **Step 9: Live-test the cutover locally**

Reload `http://localhost:8000/` (fresh — no localStorage interference; if you've been testing in this tab, hard-reload).

Expected: Hub at `/`. Two big cards visible.

Click Design card. URL becomes `/design/make`. New Create mode visible — top bar, rail with 5 icons, map area with the SVG, Map panel on the right.

Tap a state on the map (e.g., California). Should color. Tap again to uncolor (existing click-toggle behavior). Verify legend updates.

Click rail buttons — panels switch.

Click Share. Should open Web Share sheet on iPhone or copy URL on desktop.

Click Account. Should open account menu or modal.

Click undo/redo. Should work as before.

Resize browser to portrait phone (`emulate(viewport="390x844x3,mobile,touch")`, reload). The rotate overlay should appear.

Dismiss the overlay. Verify the editor functions in portrait fallback.

Run `_validate.py` once more for sanity:
```powershell
python _validate.py
```

If anything is broken — TRIAGE before committing. Common issues:
- A wire() reference left over → JS console will log "wire is not defined" or similar
- A function name mismatch in Step 7 → button click does nothing → Grep for the actual function name
- SVG isn't rendering → Step 1 missed moving a child element or broke the `<g id="statesGroup">` transform

Fix issues inline. Re-validate. Re-test.

- [ ] **Step 10: Smoke-test export**

Click Share or invoke the export from wherever it lives in the new UI. The exported PNG must include:
- The logo (pin + wordmark, scale 1.0 per Phase 0 commit `1cd8102`)
- The map title (from `#createMapTitleInput.value`)
- The legend if present
- No diagonal watermark (deleted in Phase 0 commit `6258a4e`)

If the export crashes or omits the logo/title:
- Grep `captureMapImage` for the affected element reference. Likely the function still reads `getElementById('mapTitle')` — point it at `createMapTitleInput.value` instead.
- Don't add a second capture path — the cartographer agent's tribal knowledge is that `captureMapImage` is the SOLE export entry.

Validate:
```powershell
python _validate.py
```

- [ ] **Step 11: Commit + push the cutover**

This is the big one. Single commit, ~1000+ lines of diff.

```powershell
git add index.html
git commit -m @'
feat(create): atomic cutover to mode router + 5-panel Create rail

THE CUTOVER. After this commit, tappymaps.com renders the new editor.

What changed:
  * <svg id="mapSVG"> moved from #mapContainer into #modeCreate > #createMap
  * #mapTitle (contenteditable div) replaced by #createMapTitleInput
    (top-bar input). All read sites updated to source from appState.mapTitle
    (mirror) or the new input.
  * Router.dispatch now fires on DOMContentLoaded — Hub at /, Create at
    /design/make, ComingSoon stub for Gallery/Arcade/GeoDraft/embed/etc.
  * Legacy <input id="sourceInput"> + #mobileSourceInput consolidated into
    a single #sourceInput inside #createPanelMap (autofill-defeat attrs
    intact: readonly, autocomplete=off, data-1p-ignore, data-lpignore,
    name="map-source-citation").
  * #createTopBar wired: Share, Account, Undo, Redo buttons.
  * Per-panel delegates replace ~30 wire() calls. Single delegate per
    panel for click + input.

What was deleted:
  * <nav class="mobile-bottom-nav"> + all .mobile-panel siblings
    (#tapPanel, #colorPanel, #sharePanel, #dataPanel, #morePalettesMobilePanel)
  * <aside class="sidebar" id="sidebarSheet">
  * <div id="mapContainer"> wrapper (SVG moved out)
  * <div id="mapTitle" contenteditable>
  * <div class="modal-overlay" id="templatesModal"> (Templates now inline
    in Map panel)
  * <div class="mobile-panel-backdrop">
  * function closeAllPanels() + every call site
  * All wire() calls targeting deleted IDs

What is UNCHANGED (cartographer-locked):
  * SVG viewBox -20 -30 1010 710
  * #statesGroup transform translate(5,-20) scale(0.95)
  * renderMap, onStateClick, captureMapImage, updateLegendDisplay
  * loadStateFromURL, encodeStateToURL, isPro, loadTemplate
  * nonColorable set (DC + territories)
  * TESTER_MODE behavior + tap26 access code
  * Source field autofill defeat (HTML + CSS + JS layers all intact)

Legacy /#<base64> URLs are rewritten to /design/make#<base64> at script
load (Task 9, commit prior) so existing shared maps still restore state
correctly.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

Wait ~30s for Vercel deploy.

---

## Task 16: Production smoke test

**Purpose:** End-of-Phase-1 sanity check. All commits live on tappymaps.com. Confirm critical paths.

**Files:** None (verification only)

- [ ] **Step 1: Hard reload production**

```
emulate(viewport="1440x900")
navigate_page(url="https://tappymaps.com/", waitFor="networkIdle")
```

Expected: Hub appears with two cards.

- [ ] **Step 2: Verify Hub probe**

```
evaluate_script(function="() => ({ bodyMode: document.body.dataset.mode, hubCardCount: document.querySelectorAll('.hub-card').length, designHref: document.querySelector('.hub-card--design').getAttribute('href'), gamesHref: document.querySelector('.hub-card--games').getAttribute('href'), tapInVisible: !!document.querySelector('.hub-footer a[href=\"/tap-in\"]') })")
```

Expected: `{ bodyMode: '__hub__', hubCardCount: 2, designHref: '/design/make', gamesHref: '/games/arcade', tapInVisible: true }`.

- [ ] **Step 3: Navigate to Create**

```
click(uid="<uid for Design card via take_snapshot>")
evaluate_script(function="() => ({ url: window.location.pathname, bodyMode: document.body.dataset.mode, createVisible: getComputedStyle(document.getElementById('modeCreate')).display, hubVisible: getComputedStyle(document.getElementById('modeHub')).display, svgInsideCreateMap: !!document.querySelector('#createMap #mapSVG'), railButtons: document.querySelectorAll('#createRail .rail-btn').length })")
```

Expected: `{ url: '/design/make', bodyMode: 'design/make', createVisible: 'flex', hubVisible: 'none', svgInsideCreateMap: true, railButtons: 5 }`.

- [ ] **Step 4: Tap a state**

```
click(uid="<uid for any state path via take_snapshot — pick California>")
evaluate_script(function="() => ({ stateColorsCount: Object.keys(appState.stateColors || {}).length, californiaColored: !!(appState.stateColors && appState.stateColors['California']) })")
```

Expected: `stateColorsCount: 1` (or more if click toggled), `californiaColored: true`.

- [ ] **Step 5: Verify per-route meta tags**

```
evaluate_script(function="() => ({ title: document.title, ogTitle: document.querySelector('meta[property=\"og:title\"]')?.content, canonical: document.querySelector('link[rel=canonical]')?.href })")
```

Expected (on `/design/make`): title includes "Tappymaps" + map title; ogTitle matches; canonical is `https://tappymaps.com/design/make`.

- [ ] **Step 6: Navigate back via browser back button**

Press the browser back button (chrome-devtools-mcp doesn't expose this directly — use `evaluate_script(function="() => history.back()")` then wait briefly).

Then probe:
```
evaluate_script(function="() => ({ url: window.location.pathname, bodyMode: document.body.dataset.mode }), waitFor=500")
```

Expected: URL back to `/`, bodyMode `__hub__`.

- [ ] **Step 7: Test legacy URL compat**

Construct a legacy state URL and navigate to it. From the browser address bar, manually type:
`https://tappymaps.com/#<paste a known legacy state hash here>`

(Generate a known legacy hash by going to `/design/make`, coloring a state, then copying the URL. Strip `/design/make` and replace with just `/` and the hash.)

Reload. Expected: page redirects to `/design/make#<hash>` and the state restores.

```
evaluate_script(function="() => ({ url: window.location.pathname + window.location.hash.slice(0,20) + '...', restoredCount: Object.keys(appState.stateColors || {}).length })")
```

Expected: URL is `/design/make#…`, restoredCount > 0.

- [ ] **Step 8: Test ComingSoon stub**

```
evaluate_script(function="() => Router.navigate('/games/arcade')")
evaluate_script(function="() => ({ comingSoonLabel: document.getElementById('comingSoonLabel').textContent, comingSoonPhase: document.getElementById('comingSoonPhase').textContent, createHidden: getComputedStyle(document.getElementById('modeCreate')).display })")
```

Expected: `{ comingSoonLabel: 'Arcade', comingSoonPhase: 'Phase 2 — Arcade', createHidden: 'none' }`.

- [ ] **Step 9: Test rotate overlay (portrait phone)**

```
emulate(viewport="390x844x3,mobile,touch", userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1")
navigate_page(url="https://tappymaps.com/design/make", waitFor="networkIdle")
evaluate_script(function="() => ({ overlayDisplay: getComputedStyle(document.getElementById('rotateOverlay')).display, bodyMode: document.body.dataset.mode })")
```

Expected: `{ overlayDisplay: 'flex', bodyMode: 'design/make' }`.

- [ ] **Step 10: Test landscape (overlay should hide)**

```
emulate(viewport="844x390x3,mobile,touch,landscape", userAgent="<same iPhone UA>")
navigate_page(url="https://tappymaps.com/design/make", waitFor="networkIdle")
evaluate_script(function="() => ({ overlayDisplay: getComputedStyle(document.getElementById('rotateOverlay')).display, createDisplay: getComputedStyle(document.getElementById('modeCreate')).display, svgVisible: document.getElementById('mapSVG').getBoundingClientRect().width > 0 })")
```

Expected: `{ overlayDisplay: 'none', createDisplay: 'flex', svgVisible: true }`.

- [ ] **Step 11: Test export**

Trigger export from the UI (Share button or Export button — depends on final UX). Verify the downloaded PNG opens and shows:
- The colored map
- The pin+wordmark logo (scale 1.0)
- The map title at top
- No diagonal watermark

If export fails: log the error in console (chrome-devtools-mcp `list_console_messages`). Common breakage: `captureMapImage` still references `#mapTitle` — fix and re-deploy.

- [ ] **Step 12: Test tester mode access code**

```
navigate_page(url="https://tappymaps.com/tap-in")
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-prod-tapin.png")
```

Verify the tap-in page renders.

```
fill(uid="<uid for #tapInCodeInput>", value="tap26")
click(uid="<uid for tap-in-submit>")
```

Expected: status shows "Unlocked. Redirecting…" then navigates to `/design/make`. `appState.proUnlocked` is `true`, `localStorage.tappymaps_tester_pro` is set.

- [ ] **Step 13: Console error check**

```
emulate(viewport="1440x900")
navigate_page(url="https://tappymaps.com/", waitFor="networkIdle")
list_console_messages(types=["error", "warn"])
```

Expected: zero errors. Acceptable warnings: a11y, deprecation. Anything else investigate.

- [ ] **Step 14: Take Phase 1 ship screenshots**

```
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-ship-hub-desktop.png", fullPage=true)
navigate_page(url="https://tappymaps.com/design/make", waitFor="networkIdle")
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-ship-create-desktop.png", fullPage=true)

emulate(viewport="844x390x3,mobile,touch,landscape", userAgent="<iPhone UA>")
navigate_page(url="https://tappymaps.com/design/make", waitFor="networkIdle")
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-ship-create-landscape.png", fullPage=true)

emulate(viewport="390x844x3,mobile,touch", userAgent="<iPhone UA>")
navigate_page(url="https://tappymaps.com/", waitFor="networkIdle")
take_screenshot(filePath="C:\Users\mhowe\AppData\Local\Temp\phase1-ship-hub-portrait.png", fullPage=true)
```

These are the "Phase 1 complete" record screenshots. No commit needed — they live in `%TEMP%` and aren't tracked by git.

---

## Task 17: Update CLAUDE.md + cartographer agent with mode router context

**Purpose:** Phase 0 deferred the doc updates because the mode router didn't exist yet. Phase 1 shipped it, so the cartographer agent's tribal-knowledge map and CLAUDE.md's module description need to reflect the new structure.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\.claude\CLAUDE.md`
- Modify: `C:\Users\mhowe\tappymaps\.claude\agents\tappymaps-cartographer.md`

- [ ] **Step 1: Update `.claude/CLAUDE.md`**

Find the section near the top describing "What It Is" and the section "Two Script Blocks (gotcha)". Add a new section AFTER "Two Script Blocks" titled "Mode Router (Phase 1)":

```markdown
## Mode Router (Phase 1)

The single-file app is now a client-side SPA. Routes:

- `/` → Hub (#modeHub) — two cards: Design (turquoise, → /design/make) and Games (orange, → /games/arcade)
- `/design/make` (+ optional `#<base64>` hash) → Create mode (#modeCreate) — the editor
- `/tap-in` → minimal access-code unlock page
- `/design/gallery`, `/games/arcade`, `/games/draft`, `/embed/*`, `/about`, `/pricing` → ComingSoon stub (#modeComingSoon)
- Anything else → ComingSoon stub with "Page not found" label

Router IIFE defines `parseRoute`, `dispatch`, `register`, `navigate`. The
`Modes` namespace holds mode lifecycle objects (`enter`, `exit`, optional
`meta`). `Modes.Create` is the editor. Routes resolve to mode keys via
`parseRoute(pathname)`; each Mode is registered with `Router.register(key, mode)`.

Routing mechanism: `history.pushState` + `popstate` listener + Vercel
rewrites (every non-API, non-asset path serves `index.html`). The hash
component carries state (`appState` btoa); the path carries the route.

Backward compat: legacy `/#<base64>` URLs are rewritten to
`/design/make#<base64>` at script load, before Router.dispatch fires.

`<a data-route>` elements have their clicks intercepted by a document-level
delegate that calls `Router.navigate(href)` instead of doing a full
page reload. Cmd/Ctrl-click + middle-click + `target="_blank"` still
open in new tabs.

Per-route SEO: each Mode's `meta(route)` returns `{ title, description,
canonical, ogImage }`. `updateMetaTags(meta)` updates `<title>`, meta
description, OG/Twitter cards, and canonical link on every dispatch.

Don't add new routes by editing parseRoute. Register them with
`Router.register(modeKey, mode)`.
```

Also update the "Status as of" line at the top:
```markdown
**Status as of 2026-05-XX (replace with actual ship date):** Phase 1 of the Reimagining shipped (mode router + Hub + Create mode 5-panel rail rebuild). See HANDOVER.md for the canonical "where we are, what's next" summary.
```

- [ ] **Step 2: Update the file structure description**

Find the "## Repository Layout" section and update it to reflect that the file is still single-file but now has a Router IIFE near the top of the main script block:

```markdown
## Repository Layout

```
index.html               # The entire app (~9,900 lines, two <script> blocks)
                         # Main block now has Router + Modes near the top
api/stripe/              # Vercel serverless functions
  ├── webhook.js         # Stripe webhook (signature-verified)
  ├── create-checkout.js # Creates checkout session (JWT-auth'd)
  ├── verify-subscription.js
  └── track-export.js    # Free-tier export quota enforcement
vercel.json              # SPA rewrites — every path serves index.html (Phase 1)
.claude/
  ├── CLAUDE.md          # This file
  └── agents/tappymaps-cartographer.md
assets/logo-horizontal.svg
package.json, vercel.json, CNAME
```
```

- [ ] **Step 3: Update the "Known Open Items (post-Phase-0)" section**

Add a "Resolved in Phase 1 (2026-05-XX)" subsection with the Phase 1 wins. Move "Mobile architectural rot" from "Still open" to "Resolved" with the note that the 5-panel rail eliminates the dual-rendering-path entirely.

```markdown
**Resolved in Phase 1 (2026-05-XX):**
- Mode router + Hub at `/` + Create at `/design/make`
- Backward compat: legacy `/#<hash>` URLs rewrite to `/design/make#<hash>`
- Mobile architectural rot eliminated — single 5-panel rail at all sizes; no more dual mobile/desktop rendering paths
- Per-route SEO with dynamic <title>, meta description, OG cards, canonical
- Landscape rotate-overlay for portrait phones in Create mode
- ComingSoon stub mode for Gallery/Arcade/GeoDraft/embed/about/pricing
- /tap-in landing page (minimal)
- Templates inline in Map panel (was full-screen modal)
- Single canonical Source input (replaces legacy mobile/desktop dual inputs)
```

- [ ] **Step 4: Update `.claude/agents/tappymaps-cartographer.md`**

Find the section describing the file structure / tribal knowledge. Add:

```markdown
## Mode Router (Phase 1)

`index.html` is now a client-side SPA. When editing, be aware of:

- **Routes are registered**, not hardcoded. To add a new mode, define
  `Modes.YourMode = { enter, exit, meta }` and call
  `Router.register('your/route', Modes.YourMode)`. Update parseRoute only
  for new URL-shape patterns (1/2/3-segment paths already handled).

- **`<a data-route>`** — internal links use this attribute. Document
  delegate intercepts and calls `Router.navigate(href)`.

- **State lives in URL hash, route in path.** History pushState preserves
  the hash. Don't put state in the path.

- **Vercel rewrites** in `vercel.json` send every unknown path to
  `index.html`. If you add a new API route or static asset path that
  needs to bypass the rewrite, update the regex in `vercel.json`.

- **`document.body.dataset.mode`** — Router sets this on every dispatch.
  CSS hooks like `body[data-mode="design/make"] #createMap { ... }` rely
  on it. Don't clear it manually.

- **`updateMetaTags(meta)`** — Router calls this per dispatch. Each mode's
  `meta(route)` returns `{ title, description, canonical, ogImage }`.

## Five-panel Create rail

The editor lives at `/design/make`. Structure:
- `#createTopBar` (44px) — wordmark, title input, undo/redo, Share, Account
- `#createRail` (56px wide) — 5 icon buttons (Map / Color / Legend / Data / Upgrade)
- `#createMap` — contains `<svg id="mapSVG">` (unchanged from pre-Phase-1)
- `#createPanel` — contains 5 sibling `<section id="createPanelXxx">` content templates

`switchPanel(name)` hides all 5 panels and shows the named one + marks
its rail button `.is-active`.

Don't reintroduce `wire(id, event, handler)` for any element inside the
new structure — use document delegates that match `[id^="createPanel"]`
or `#createPanelXxx` ancestors.
```

- [ ] **Step 5: Commit + push**

```powershell
git add .claude/CLAUDE.md .claude/agents/tappymaps-cartographer.md
git commit -m @'
docs: update CLAUDE.md + cartographer with Phase 1 mode router context

Phase 0 deferred these updates because the router didn't exist yet.
Phase 1 shipped it, so the agent's tribal-knowledge map and CLAUDE.md
both need to reflect:
  * Router IIFE + Modes namespace structure
  * URL scheme (Hub /, Create /design/make, ComingSoon stubs)
  * data-route delegate pattern for internal links
  * State in hash, route in path
  * Per-route SEO via Mode.meta()
  * Five-panel Create rail structure

Cartographer agent now warns: don't reintroduce wire() for elements
inside the new structure; use document delegates instead.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## Task 18: Update HANDOVER.md with Phase 1 completion

**Purpose:** Keep the source-of-truth status doc current. The spec sits in `docs/superpowers/specs/`; the live status sits in `HANDOVER.md` at repo root.

**Files:**
- Modify: `C:\Users\mhowe\tappymaps\HANDOVER.md`

- [ ] **Step 1: Read current HANDOVER.md**

Use Read tool to see the current "Phase 0 shipped" section and the structure around it.

- [ ] **Step 2: Add a Phase 1 completion section**

After the Phase 0 section (likely "## Reimagining — Phase 0 shipped"), add:

```markdown
## Reimagining — Phase 1 shipped (2026-05-XX)

Design spec: `docs/superpowers/specs/2026-05-25-tappymaps-phase-1-implementation-design.md`
Implementation plan: `docs/superpowers/plans/2026-05-25-tappymaps-phase-1.md`

Phase 1 ships the mode router + Hub at `/` + Create mode 5-panel rail rebuild atomically. Replaces the legacy mobile-bottom-nav + desktop-sidebar dual-rendering with a single landscape-first 5-panel layout.

What shipped:
- ✅ Vercel SPA rewrites (vercel.json) — every non-API/non-asset path serves index.html
- ✅ Mode Router IIFE — parseRoute, dispatch, register, navigate
- ✅ Per-route SEO helpers (updateMetaTags, setMeta, setLink) wired into every Mode
- ✅ ComingSoon stub mode for not-yet-built routes (Gallery, Arcade, GeoDraft, embed, marketing)
- ✅ Hub at `/` (Layout B) — turquoise Design card + orange Games card + about/pricing/tap-in footer
- ✅ TapIn landing at `/tap-in` (minimal access-code unlock)
- ✅ `data-route` click delegate for in-app navigation
- ✅ Landscape rotate-overlay (portrait phones in Create only)
- ✅ Legacy URL compat: `/#<base64>` → `/design/make#<base64>` rewrite at script load
- ✅ Create mode shell (#modeCreate): top bar + 56px rail + map area + 320px right panel
- ✅ 5 rail buttons (Map / Color / Legend / Data / Upgrade) with .is-active states
- ✅ 5 panel content templates with content migrated from legacy mobile/desktop markup
- ✅ switchPanel + rail delegate + per-panel delegates (replaces ~30 wire() calls)
- ✅ Modes.Create lifecycle wired (loadStateFromURL, default Map panel)
- ✅ Atomic cutover commit: SVG moved into #createMap, #mapTitle into top bar, legacy markup deleted
- ✅ CLAUDE.md + cartographer agent updated with Router + 5-panel context

What was deleted in the cutover:
- `<nav class="mobile-bottom-nav">` + all `.mobile-panel` siblings
- `<aside class="sidebar" id="sidebarSheet">`
- `<div class="modal-overlay" id="templatesModal">` (Templates now inline in Map panel)
- `<div class="map-container" id="mapContainer">` wrapper (SVG moved out)
- `function closeAllPanels()` + every call site
- All `wire()` calls targeting deleted IDs

What stayed exactly the same (cartographer-locked):
- `<svg id="mapSVG" viewBox="-20 -30 1010 710">` — viewBox unchanged
- `#statesGroup transform="translate(5, -20) scale(0.95)"` — unchanged
- `renderMap`, `onStateClick`, `captureMapImage`, `updateLegendDisplay`
- `loadStateFromURL`, `encodeStateToURL`, `isPro`, `loadTemplate`
- `nonColorable` set (DC + territories)
- TESTER_MODE behavior + tap26 access code
- Source field autofill defeat (HTML + CSS + JS layers all intact)

Phase 1 → Phase 2 handoff:
- Modes namespace ready for `Modes.Arcade` registration
- `/games/arcade/find-state` route already in URL tree (ComingSoon stub today, real in Phase 2)
- Shared engine primitives: SVG state map (reusable), score/streak/medal CSS scopes under `[data-mode^="games/"]`
- `body[data-mode="..."]` hook lets Phase 2 swap to Games-mode brand color (orange) without touching Phase 1 styles

Next: Phase 2 — Find the State arcade MVP. Plan TBD.
```

Replace `2026-05-XX` with the actual ship date when committing.

- [ ] **Step 3: Commit + push**

```powershell
git add HANDOVER.md
git commit -m @'
docs: mark Phase 1 of reimagining complete in HANDOVER

Mode router + Hub + 5-panel Create rebuild shipped atomically. Section
added to HANDOVER for at-a-glance status. Phase 2 (Find the State
arcade MVP) inherits the router + Modes namespace + body[data-mode]
hook with no further infrastructure work.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
'@
git push origin master
```

---

## End-of-Phase-1 checklist

After all 18 tasks complete:

- [ ] All commits visible in `git log --oneline -25` on `master`
- [ ] tappymaps.com (production) shows Hub at `/` and Create at `/design/make`
- [ ] Legacy URL `tappymaps.com/#<any-known-shared-hash>` redirects to `/design/make#<hash>` and restores state
- [ ] No console errors on Hub, Create, ComingSoon stub, or TapIn pages
- [ ] State coloring works on both desktop and landscape phone
- [ ] Export PNG includes logo (scale 1.0) + map title + colored states + no diagonal watermark
- [ ] All 5 rail panels open/close correctly
- [ ] Browser back/forward buttons navigate between modes
- [ ] Tester mode + `tap26` access code still unlocks Pro
- [ ] Source field still defeats autofill (Phase 0 fix `187cad1`)
- [ ] HANDOVER.md updated with Phase 1 completion section
- [ ] CLAUDE.md + cartographer agent updated with mode router context
- [ ] `_phase1_audit.md` exists locally but is NOT committed (gitignored)
- [ ] Ready to invoke `superpowers:writing-plans` again for Phase 2 (Find the State arcade MVP)

---

## Notes for the implementer

- **The cutover (Task 15) is the only commit that visibly changes the live site for users.** Every prior task adds dormant code. Test legacy editor still works after each Tasks 1-14 commit.

- **`captureMapImage()` is THE export entry — never add a second.** Cartographer agent's tribal knowledge. Task 15 (cutover) might touch the title reference inside `captureMapImage` (because the title element changes from `<div id="mapTitle">` to `<input id="createMapTitleInput">`), but DON'T refactor the export pipeline structure. Single source of truth.

- **`onStateClick` requires `const pathEl`.** Don't touch the variable name in Phase 1. If you Grep and see `const pathEl` inside `onStateClick`, that's correct.

- **Vercel auto-deploys on push.** Every commit ships in ~30s. If you push a broken commit, the live site breaks. ALWAYS run `python _validate.py` before pushing — both blocks must PASS.

- **The big cutover commit (Task 15) is intentionally large.** It's atomic by design. Don't try to split it into multiple deploys — intermediate states would render a half-broken editor. Build it all locally, validate, then push once.

- **TESTER_MODE = true is still the live state.** Don't flip it to false in Phase 1. Auth UI hides; `tap26` is the only unlock path. Phase 1 doesn't change tester mode — it just adds a new surface (`/tap-in` page) that ALSO uses the same access-code plumbing.

- **The Phase 0 `_validate.py` exists and works — reuse it.** It's gitignored under `_*.py` so it won't show in `git status`.

- **Legacy `/#<base64>` URLs are sacred.** Many users have bookmarked or shared them. The Task 9 rewrite must keep working forever. If you need to change the URL scheme later, add to the rewrite — don't replace it.

- **PowerShell's git can be flaky on long commit messages.** If a commit fails with quoting issues, save the message to `.gitmsg` and use `git commit -F .gitmsg` (the file is gitignored).

- **PowerShell times out on git on this machine.** Use Bash with git on PATH for git operations. PowerShell is fine for `python _validate.py` and `Test-Path` checks.

---

## Source materials

- Phase 1 design spec: `docs/superpowers/specs/2026-05-25-tappymaps-phase-1-implementation-design.md` (commit `8dd2f5c`)
- Source product spec: `docs/superpowers/specs/2026-05-23-tappymaps-reimagining-design.md` (commit `5e62f6d`)
- Phase 0 implementation plan: `docs/superpowers/plans/2026-05-23-tappymaps-reimagining-phase-0.md`
- Cartographer agent: `.claude/agents/tappymaps-cartographer.md`
- HANDOVER.md (live state of the world)
- Phase 0 verification screenshots: `C:\Users\mhowe\AppData\Local\Temp\phase0-*.png`
