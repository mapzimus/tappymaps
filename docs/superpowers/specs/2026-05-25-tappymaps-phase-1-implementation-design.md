# Tappymaps Reimagining — Phase 1 Implementation Design

**Status:** Brainstormed + approved by Max on 2026-05-25. Ready for `writing-plans` to convert into an implementation plan.

**Source spec:** `docs/superpowers/specs/2026-05-23-tappymaps-reimagining-design.md` (commit `5e62f6d`) — the product-level reimagining spec that locked Hub Layout B, the 5-panel Create rail, the Design/Games URL tree, and the mobile-first landscape stance. This Phase 1 doc converts those product decisions into implementation specifics.

**Phase 0 status:** Complete on `master` (commits `6258a4e` through `187cad1`). HANDOVER.md has the completion section. All audit fixes shipped, tester mode + access code `tap26` live, Source-field autofill defeated.

**Phase 1 goal:** Ship the mode router + Hub at `/` + Create mode 5-panel rail rebuild atomically. Unlocks Phases 2–5 (Arcade, GeoDraft, Gallery, Distribution).

**Approach (locked during brainstorm):** Approach A — clean rebuild of editor presentation, keep all underlying logic, manual testing via chrome-devtools-mcp + `_validate.py`, no feature flag, multiple commits within Phase 1 all pushing to `master`.

---

## Scope locked

| Question | Answer |
|---|---|
| Phase 1 scope | Full: router + Hub + 5-panel rail rebuild atomically |
| Routing mechanism | History API + Vercel rewrites |
| Hub sub-mode previews | Static text + links |
| Migration strategy | Rebuild presentation, keep logic, atomic cleanup |
| Testing approach | chrome-devtools-mcp probes + screenshots (continue Phase 0 pattern) |
| Coexistence | None — old editor markup deletes in same Phase 1 push window |

---

## Section 1 — Foundation: mode router, URL scheme, backward compat, Vercel config

### Mode router

Lives as a new IIFE at the top of the main `<script>` block in `index.html`, between the `appState` declaration and the existing init code. Public interface:

```js
const Router = (function() {
  const modes = {};                            // id → { enter, exit, meta }
  let current = null;

  function register(id, mode) { modes[id] = mode; }

  function parseRoute(pathname) {
    // '/design/make' → { mode: 'design/make', sub: null, params: {} }
    // '/games/arcade/find-state' → { mode: 'games/arcade', sub: 'find-state' }
    // '/' → { mode: '__hub__' }
    // unmatched → { mode: '__notFound__' }
    // Returns route object the active mode interprets.
  }

  function dispatch() {
    const route = parseRoute(window.location.pathname);
    const next = modes[route.mode] || modes['__notFound__'] || modes['__hub__'];
    if (current && current.exit) current.exit();
    current = next;
    document.body.dataset.mode = route.mode;   // CSS hook for mode-scoped styles
    next.enter(route);
    if (next.meta) updateMetaTags(next.meta(route));
  }

  window.addEventListener('popstate', dispatch);
  document.addEventListener('DOMContentLoaded', dispatch);

  return {
    register,
    navigate(path) { history.pushState({}, '', path); dispatch(); },
    parseRoute,
  };
})();
```

Each mode registers itself on load via `Router.register('design/make', Modes.Create)`.

The router does NOT do:
- Nested route hierarchies (no `/design/*` parent route)
- Route guards / async loading / transitions
- URL parameter parsing (modes do their own)

YAGNI. Phase 1 needs a dispatcher, not a framework.

### URL scheme (locked per source spec §1)

- `/` → Hub
- `/design/make` → Create (empty state)
- `/design/make#<base64>` → Create with restored state (state in hash, route in path)
- `/design/gallery`, `/design/gallery/featured`, `/design/gallery/mine` → Gallery views (Phase 4 — stubs in Phase 1)
- `/games/arcade`, `/games/arcade/<game-id>` → Arcade (Phase 2 — stubs in Phase 1)
- `/games/draft`, `/games/draft/category|territory|practice` → GeoDraft (Phase 3 — stubs in Phase 1)
- `/tap-in`, `/pro` → marketing surfaces (Phase 1: minimal stubs)
- `/embed/<hash>` → chrome-less iframe surface (Phase 5 — stub in Phase 1)

**State in hash, route in path.** Path-based state at long lengths (~8000-char base64) exceeds URL caps in some clients (Twitter, in-app browsers). Hash-based state also stays out of server logs. The hash component is preserved across `history.pushState`/`replaceState` calls.

### Backward compat for legacy `/#<base64>` URLs

Before `Router.dispatch()` runs, detect-and-rewrite legacy URLs:

```js
// At module load, before Router.dispatch runs
if (window.location.pathname === '/' && window.location.hash.length > 10) {
  try {
    const decoded = JSON.parse(atob(window.location.hash.slice(1)));
    if (decoded.colors || decoded.legend) {
      history.replaceState({}, '', '/design/make' + window.location.hash);
    }
  } catch (_) { /* not a state hash — leave alone */ }
}
```

After rewrite: `/#<base64>` → `/design/make#<base64>`. Router dispatches to Create mode, which calls existing `loadStateFromURL()` to restore the appState. Zero data loss; every existing shared URL still works forever.

### Vercel config

New `vercel.json` at repo root:

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

Any path that isn't `/api/*`, `/assets/*`, a favicon, or a static image/manifest/JSON file serves `index.html`. The router takes over from there. Existing `/api/stripe/*` routes keep working unchanged.

If `vercel.json` already exists at the repo root with other config, the `rewrites` array is added (not replaced).

---

## Section 2 — Hub at `/` (Layout B)

### Markup

Single `<div class="mode" id="modeHub">` at the top of `<body>`, hidden by default (router toggles `display`).

```html
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
    <a href="/about">about</a> · <a href="/pricing">pricing</a> · <a href="/tap-in" data-route>tap in</a>
  </footer>
</div>
```

### Styling

Two cards equal width on landscape ≥600px, stacked on portrait. Turquoise `#0EA5E9` background for Design card, orange `#F97316` background for Games card. Subtle hover lift (`transform: translateY(-2px)`). No images — text-forward. ~30 lines of CSS appended to existing `<style>` block.

### "Coming soon" stub mode

One generic stub mode handles all not-yet-built routes:

```js
Modes.ComingSoon = {
  enter(route) {
    document.getElementById('modeComingSoon').style.display = 'block';
    document.getElementById('comingSoonPhase').textContent = route.phaseTarget || 'a future phase';
    document.getElementById('comingSoonLabel').textContent = route.label || 'This';
  },
  exit() {
    document.getElementById('modeComingSoon').style.display = 'none';
  },
  meta(route) {
    return {
      title: 'Tappymaps — ' + (route.label || 'Coming soon'),
      description: route.label + ' is coming in a future Tappymaps phase. Make a map in the meantime.',
    };
  }
};
```

Stub markup is a `<div id="modeComingSoon">` with text like "We're building **{label}** in **{phase}**. Want to come back later?" + Back-to-Hub link.

Routes resolving to `ComingSoon` in Phase 1:
- `/design/gallery` and all sub-routes → "Phase 4 — Gallery"
- `/games/arcade` and `/games/arcade/<any>` → "Phase 2 — Arcade"
- `/games/draft` and sub-routes → "Phase 3 — GeoDraft"
- `/embed/<hash>` → "Phase 5 — Distribution"
- `/about`, `/pricing` → "Coming soon — Marketing"

Real implementations in Phase 1: `/`, `/design/make`, `/design/make#<hash>`, `/tap-in`.

### `data-route` click delegate

Single document-level delegate intercepts clicks on `<a data-route>` elements:

```js
document.addEventListener('click', function(e) {
  const a = e.target.closest('a[data-route]');
  if (!a) return;
  if (a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  Router.navigate(a.getAttribute('href'));
});
```

External links (no `data-route`) navigate normally. Cmd/Ctrl-click opens in new tab as expected.

---

## Section 3 — Create mode 5-panel rail rebuild

### Layout (per source spec §4)

Landscape phone + tablet + desktop:

```
┌──────────────────────────────────────────────────────────┐
│ tappymaps   [My US Map ✎]    ↶ ↷  Share  Account        │ ← Top bar (always)
├──┬───────────────────────────────────────────┬──────────┤
│  │                                           │          │
│ M│                                           │          │
│ A│                                           │  PANEL   │
│ P│         [ US states SVG map ]             │ (active  │
│  │                                           │   rail   │
│ C│                                           │  icon's  │
│ L│                                           │ content) │
│ R│                                  ┌────┐   │          │
│  │                                  │LEG │   │          │
│ U│                                  └────┘   │          │
└──┴───────────────────────────────────────────┴──────────┘
```

- **Top bar (fixed, ~44px tall):** `tappymaps` wordmark left, editable map title center, undo/redo + Share + Account right
- **Left rail (~56px wide):** 5 icon buttons (Map / Color / Legend / Data / Upgrade). Active icon highlighted in brand color (turquoise for Design context, orange for Games context — but Create is Design, so turquoise)
- **Map canvas (~55% width):** SVG with same viewBox `-20 -30 1010 710`, same statesGroup transform `translate(5, -20) scale(0.95)` (cartographer-agent locked)
- **Contextual panel (~30-35% width):** Always-on (no toggle-collapse). On portrait (when user dismisses rotate overlay), panel slides up as 60vh sheet

### Single `<div class="mode" id="modeCreate">` containing all of the above

Replaces today's mobile-bottom-nav + desktop-sidebar markup entirely. Inside `#modeCreate`:

- `#createTopBar` — top bar markup
- `#createRail` — left rail with 5 `<button data-panel="map|color|legend|data|upgrade">` elements
- `#createMap` — wrapping the existing `<svg id="mapSVG">` (IDs preserved, logic functions unchanged)
- `#createPanel` — contextual right panel, content swapped by JS
- 5 hidden template divs `#createPanelMap`, `#createPanelColor`, `#createPanelLegend`, `#createPanelData`, `#createPanelUpgrade` — content for each panel, cloned into `#createPanel` on rail click

### Event wiring rewrite

Today's Mobile UX IIFE has ~30 `wire(id, event, handler)` calls. These all rewrite to event delegates on the new structure. Pattern:

```js
// Single delegate on the rail
document.getElementById('createRail').addEventListener('click', function(e) {
  const btn = e.target.closest('[data-panel]');
  if (!btn) return;
  switchPanel(btn.dataset.panel);  // shows matching #createPanelXxx, highlights btn
});

// Per-panel delegate (one per content div)
document.getElementById('createPanelMap').addEventListener('click', function(e) {
  if (e.target.matches('#openTemplatesBtn')) showTemplatesInline();
  else if (e.target.matches('#clearAllBtn')) clearAllStates();
  // ... etc
});

// Per-panel input change delegate (one per content div containing inputs)
document.getElementById('createPanelMap').addEventListener('change', function(e) {
  if (e.target.matches('#sourceInput')) appState.mapSource = e.target.value;
  // ... etc
});
```

Collapses ~30 `wire()` calls into ~7 delegate listeners. Easier to reason about, less fragile.

### Pro feature surfacing (per source spec §9)

- No more inline "PRO" badges scattered everywhere
- `#createPanelUpgrade` is the canonical Pro surface
- Per-panel Pro chips: small turquoise→orange gradient pill next to the Pro feature in its panel (e.g., "Data Maps PRO" in the Data panel header)
- When a free user taps a Pro-locked control, the Upgrade rail icon highlights AND the rail switches to Upgrade panel — no modal, no nag
- Free export #3 used → soft prompt at the bottom of the Share panel (which is reached via the Share button in the top bar, NOT a rail panel — Share is a destination action, not a settings panel)
- Tester mode (`TESTER_MODE = true`) continues to hide auth UI and grant Pro via `tap26` access code, unchanged from current behavior

### Templates inline (was full-screen modal)

The current `<div id="templatesModal">` becomes a section inside the Map panel:
- Top of Map panel: title/subtitle/source inputs
- Below: "Browse Templates" button → expands an inline template grid (4 categories × 28 templates per audit) within the panel
- Selecting a template applies it + collapses the grid back

More discoverable than the modal pattern; keeps the user inside the editing flow.

### What stays UNCHANGED (cartographer-agent tribal knowledge — must not regress)

| Function / element | Status |
|---|---|
| `renderMap()` | UNCHANGED |
| `updateLegendDisplay()` | UNCHANGED |
| `captureMapImage()` | UNCHANGED — single export entry, NEVER add a second |
| `onStateClick()` | UNCHANGED — `const pathEl` stays |
| `loadStateFromURL()`, `encodeStateToURL()` | UNCHANGED |
| `updateStatsBar()` | UNCHANGED |
| All theme functions, palette functions, data map functions, history/undo | UNCHANGED |
| `<svg id="mapSVG">` with viewBox `-20 -30 1010 710` | UNCHANGED |
| `#statesGroup` transform `translate(5, -20) scale(0.95)` | UNCHANGED |
| `#mapTitle` element | KEPT but moved into top bar — never hidden in landscape |
| `nonColorable` set (DC + territories) | UNCHANGED |
| Mobile exports forcing 1010:710 landscape | UNCHANGED |
| TESTER_MODE, TESTER_CODES, tester-Pro localStorage restore | UNCHANGED |
| Source field readonly + CSS `:-webkit-autofill` overlay (commit `187cad1`) | UNCHANGED |

### What DELETES atomically in Phase 1 cleanup commit

- `<nav class="mobile-bottom-nav">` and all `.mobile-panel` siblings
- `<aside class="sidebar">` (desktop sidebar)
- `<div class="modal-overlay" id="templatesModal">` (templates modal)
- `wire()` IIFE's panel-toggle handlers (replaced by `switchPanel(name)` inside Create mode IIFE)
- `closeAllPanels()` mobile bottom-sheet logic
- All `wire(id, event, handler)` calls that pointed at the deleted markup

### Create mode lifecycle

```js
Modes.Create = {
  enter(route) {
    document.getElementById('modeCreate').style.display = 'flex';
    if (window.location.hash) loadStateFromURL();
    enforceLandscape();              // shows rotate overlay if portrait phone
    switchPanel('map');              // default rail selection
  },
  exit() {
    document.getElementById('modeCreate').style.display = 'none';
    // appState persists in window scope; later modes can read if needed
  },
  meta(route) {
    return {
      title: (appState.mapTitle || 'Create') + ' — Tappymaps',
      description: 'Color a US states map. Tap. Color. Share.',
      canonical: 'https://tappymaps.com/design/make',
      ogImage: 'https://tappymaps.com/assets/social-og-image.png',
    };
  }
};
Router.register('design/make', Modes.Create);
```

---

## Section 4 — Landscape overlay + per-route SEO + cleanup + testing + Phase 2 handoff

### Landscape rotate-overlay

CSS-first with tiny JS for dismiss handling.

```css
/* Only fires for Create mode + small viewports + portrait orientation */
.rotate-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.96);
  z-index: 9999;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
}
@media (max-width: 600px) and (orientation: portrait) {
  body[data-mode="design/make"] .rotate-overlay { display: flex; }
}
.rotate-overlay.dismissed { display: none !important; }
```

JS:
- Router sets `document.body.dataset.mode = route.mode` on every dispatch — CSS reacts automatically
- Overlay markup (single `<div class="rotate-overlay">` at top of `<body>`): rotating-phone icon + "Tappymaps Create is built for landscape. Rotate your phone to continue." + small "Continue in portrait anyway →" link
- Dismiss link adds `.dismissed` class. NOT persisted — resets every Create entry (so users don't get permanently stuck with a bad portrait layout)
- `window.addEventListener('orientationchange', ...)` removes `.dismissed` on rotation, so overlay re-evaluates

Per source spec §2, overlay ONLY shows for Create mode (and GeoDraft modes in Phase 3). Hub, Gallery, Tap-in, etc. don't trigger it.

### Per-route SEO

Mode router calls `updateMetaTags(mode.meta(route))` on every dispatch. Implementation:

```js
function updateMetaTags({ title, description, canonical, ogImage }) {
  document.title = title;
  setMeta('description', description);
  setMeta('og:title', title);
  setMeta('og:description', description);
  setMeta('og:url', canonical || window.location.href);
  setMeta('og:image', ogImage || 'https://tappymaps.com/assets/social-og-image.png');
  setMeta('twitter:title', title);
  setMeta('twitter:description', description);
  setMeta('twitter:image', ogImage || 'https://tappymaps.com/assets/social-og-image.png');
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

Each mode declares its `meta(route)` returning `{ title, description, canonical, ogImage }`.

OG image generation per-map (e.g., `/api/og?hash=...`) is Phase 5 (Distribution). For Phase 1, all modes return the static `assets/social-og-image.png` as `ogImage`.

### Coexistence / cleanup

**Atomic.** Phase 1 implementation plan will have a specific subagent task: "Delete old mobile-bottom-nav markup + old desktop-sidebar markup + old templates modal markup, replace with new Create mode div." This commit lands in the same Phase 1 push window as the router + Hub + new editor commits.

No feature flag. No `?v=2` URL param. No coexistence period. The new Create mode IS the editor as of the Phase 1 ship commit.

### Testing strategy

Continues Phase 0 pattern. Per Phase 1 subagent task:

1. `_validate.py` runs after every JS edit → both inline `<script>` blocks must `node --check` PASS
2. chrome-devtools-mcp navigates to `http://localhost:8000`, probes via `evaluate_script`, asserts expected state
3. `take_screenshot` at landscape iPhone (844×390) for visual regression vs spec §4 mockup
4. After full Phase 1 ships: real-iPhone walkthrough (touch interactions, Web Share sheet, pinch-zoom, rotate overlay) before declaring complete

Specific checkpoints per Phase 1:

- [ ] Router → Hub renders with both cards at `/`
- [ ] `/design/make` loads the new editor
- [ ] `/design/make#<legacy-hash>` restores state correctly (backward compat verified)
- [ ] Each rail panel opens/closes (Map → Color → Legend → Data → Upgrade)
- [ ] State coloring works (paint a state, verify SVG fill)
- [ ] Export PNG includes logo + title (Phase 0 fix `1cd8102` must still hold)
- [ ] Per-route meta tags update correctly (probe `document.title` after `Router.navigate('/design/make')`)
- [ ] Vercel deploy actually serves index.html for all unknown paths
- [ ] Rotate overlay shows on portrait phone in Create mode
- [ ] Templates panel-section behaves correctly (expand, select, collapse)
- [ ] Tester mode + access code `tap26` still unlock Pro
- [ ] Source field still defeats autofill (Phase 0 fix `187cad1`)

### Phase 1 → Phase 2 handoff

Phase 2 (Find the State arcade MVP) inherits:

- Mode router with `Modes.Arcade` ready to register
- `/games/arcade/find-state` route already in the URL tree (ComingSoon stub in Phase 1, real implementation in Phase 2)
- Shared engine primitives:
  - SVG state map (Phase 2 reuses the same `#mapSVG` rendering, possibly cloned for game canvas)
  - `onStateTap` dispatcher pattern (Create's mode handler is the first user; Arcade's handler comes in Phase 2)
- Score/streak/medal CSS components scoped under `[data-mode^="games/"]`
- The `body[data-mode="..."]` hook lets Phase 2 apply Games-mode brand color (orange) without touching Phase 1 styles

Effectively: Phase 1 ships everything Phase 2 needs to start; Phase 2 just builds game-specific UI + logic without touching infrastructure.

---

## Files changed in Phase 1

**Modified:**
- `C:\Users\mhowe\tappymaps\index.html` — the entire Phase 1 work happens here (single-file app)
- `C:\Users\mhowe\tappymaps\HANDOVER.md` — Phase 1 completion section appended at the end
- `C:\Users\mhowe\tappymaps\.claude\agents\tappymaps-cartographer.md` — updated with mode-router context (deferred from Phase 0)
- `C:\Users\mhowe\tappymaps\.claude\CLAUDE.md` — updated with new module map (deferred from Phase 0)

**Created:**
- `C:\Users\mhowe\tappymaps\vercel.json` — rewrites rule (if not already present)
- `C:\Users\mhowe\tappymaps\docs\superpowers\plans\2026-05-XX-tappymaps-phase-1.md` — the implementation plan that `writing-plans` will produce next

**Untouched (Phase 0 + earlier work — keep working):**
- `C:\Users\mhowe\tappymaps\api\stripe\*.js`
- `C:\Users\mhowe\tappymaps\assets\*`
- `C:\Users\mhowe\tappymaps\_validate.py` (gitignored helper)

---

## Open items / deferred to Phase 2+

| Item | Deferred to |
|---|---|
| Per-map OG image rendering (`/api/og?hash=...`) | Phase 5 (Distribution) |
| Dynamic Hub sub-mode previews (Recent maps, Top arcade scores) | Phase 4 (Gallery) / Phase 2 (Arcade) — upgrade Hub markup then |
| Per-route SEO with truly static HTML per route (SSG) | Not planned — JS-rendered meta tags are sufficient for 2026 crawlers |
| Real automated test framework (Playwright / Vitest) | Not planned for Phase 1 — chrome-devtools-mcp pattern from Phase 0 continues |
| Marketing pages at `/about`, `/pricing` | Separate marketing pass after Phase 5 |
| Mobile native app wrapping | Long-term: PWA in Phase 5, Capacitor wrap if/when warranted |

---

## Source materials

- Source product spec: `docs/superpowers/specs/2026-05-23-tappymaps-reimagining-design.md` (commit `5e62f6d`)
- Phase 0 implementation plan: `docs/superpowers/plans/2026-05-23-tappymaps-reimagining-phase-0.md`
- Cartographer agent: `.claude/agents/tappymaps-cartographer.md`
- HANDOVER.md (live state of the world)
- Phase 0 verification screenshots: `C:\Users\mhowe\AppData\Local\Temp\tm-audit-*.png` + `phase0-*.png`

---

## Next step

Invoke `superpowers:writing-plans` to convert this design into a task-by-task implementation plan with checkboxes, file targets, validation commands, and subagent-dispatch-ready briefs.
