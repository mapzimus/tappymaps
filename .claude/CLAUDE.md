# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What It Is

Tappymaps is a single-file HTML/CSS/JS web app for creating and exporting colored US state and county maps. Tap a color, tap a state, build a legend, export. The entire application lives in **one file (`index.html`, ~9,400 lines; grew to ~9,900 during the rebrand era, trimmed by Phase 0, then Phase 1 added a client-side mode router + Hub + Create rail)**. No build step. Push to `master` auto-deploys to tappymaps.com via Vercel.

**Status as of 2026-05-29:** Phase 1 of the Reimagining SHIPPED (cutover commit `619e309`) — a client-side **mode router**, a **Hub** landing page at `/`, and the **Create-mode 5-panel rail** rebuild. The editor now lives at `/design/make`; `/` is the Hub. Phase 0 (audit fixes, brand polish, autofill defeat) shipped 2026-05-24. Tester mode is live with access code `tap26` (auth UI hidden). See the **"Mode Router (Phase 1)"** section below and `HANDOVER.md` for the canonical "where we are, what's next" summary.

Part of **Mapparatus Organization** (mapparatus.org), the LLC umbrella over three products:
- **Tappymaps** (tappymaps.com): consumer map-making, casual + playful
- **Mapzimus**: editorial brand for viral map posts (handles secured)
- **Mapparatus** (mapparatus.org): future professional GIS workflow tool

## Stack

- Vanilla HTML/CSS/JS, no framework
- SVG maps via TopoJSON (`us-atlas@3/states-albers-10m.json`), Albers projection pre-applied; viewBox `-20 -30 1010 710`
- **Export rendering: `dom-to-image-more` is primary, `html2canvas` is fallback.** Both paths must work on Safari.
- Auth: Supabase (email/password). Anon publishable key (`sb_publishable_*`) is in client; service role key is server-side only.
- Payments: Stripe subscription ($5/mo, $48/yr). Webhook signature verified.
- State persistence: URL hash via `btoa(JSON.stringify(...))`
- Analytics: localStorage (capped 500) + fire-and-forget Supabase insert

## Repository Layout

```
index.html               # The entire app (~9,400 lines, two <script> blocks + mode router)
api/stripe/              # Vercel serverless functions
  ├── webhook.js         # Stripe webhook (signature-verified)
  ├── create-checkout.js # Creates checkout session (JWT-auth'd)
  ├── verify-subscription.js
  └── track-export.js    # Free-tier export quota enforcement
.claude/
  ├── CLAUDE.md          # This file
  └── agents/tappymaps-cartographer.md
assets/logo-horizontal.svg
package.json, vercel.json, CNAME
```

There is no build step. `index.html` is loaded directly by the browser. As of Phase 1, `vercel.json` rewrites every non-asset path (e.g. `/design/make`, `/tap-in`) back to `/index.html` so the client-side mode router can handle deep links.

## Two Script Blocks (gotcha)

`index.html` contains **two `<script>` blocks**: the main app (roughly first 60% of file) and a Mobile UX IIFE (roughly last 30%). Line numbers drift — grep to find boundaries. A syntax error in the main block silently kills `init()` but the mobile IIFE still runs, producing partial breakage that's hard to diagnose.

**Use the validation helper at `C:\Users\mhowe\tappymaps\_validate.py`** (gitignored, created in Phase 0 Task 1). It extracts both blocks and `node --check`s them. Run after every JS edit, before committing:

```powershell
Set-Location C:\Users\mhowe\tappymaps
python _validate.py
```

Expected output: `Block 0 (NNN chars): PASS` + `Block 1 (NNN chars): PASS`. Non-zero exit if either fails. The script is 40 lines and matches the cartographer agent's documented pattern — see that file for the inline source if you ever lose `_validate.py`.

## Mode Router (Phase 1 — SHIPPED 2026-05-29, commit `619e309`)

Phase 1 added a **client-side mode router** on top of the single-page editor. The editor is no longer the root page — it now lives at `/design/make`, and `/` is a **Hub** landing page.

- `Router` IIFE (grep `const Router = (function()`) dispatches History-API paths to mode handlers that expose `enter / exit / meta`. Routes: `/` → `Modes.Hub`, `/design/make` → `Modes.Create` (the editor), `/tap-in` → access-code unlock, `/gallery` `/arcade` `/geodraft` `/embed/*` → `Modes.ComingSoon` stub.
- `vercel.json` rewrites every non-asset path to `/index.html` so deep links resolve in production. `init().then(Router.dispatch)` activates the router on load. **Local `python -m http.server` has NO rewrite** — a hard load of `/design/make` 404s; load `/` then call `Router.navigate('/design/make')` in the console.
- Legacy `/#<base64>` share URLs auto-rewrite to `/design/make#<base64>`, so old shared links still open the editor with state restored.

### The cutover was runtime re-parenting, NOT deletion (read before editing the editor)

The legacy single-page layout is **still in the file** — it is HIDDEN, not removed. Do not grep for "deleted" sidebar markup; it's present but dormant.

- `body[data-mode] .container { display:none !important }` hides the entire legacy layout whenever a route is active; the same rule hides `.mobile-icon-bar / .mobile-panel / .mobile-panel-backdrop / .mobile-account-menu`.
- On first entry to Create, `setupCreateCutover()` (guarded by a `_createCutoverDone` flag, runs once inside `Modes.Create.enter()`) **`appendChild`-moves** the live `#mapContainer` plus the control sections `secColorPalette / secTemplatesBtn / secDisplay / secProFeatures / secActions / secExport` into the new rail panels. Moving a live node preserves its attached listeners, so the editor works with **zero re-wiring** — edit the original control nodes, they're just re-homed at runtime.
- The 5 rail panels are `createPanelMap / createPanelColor / createPanelLegend / createPanelData / createPanelUpgrade`; `switchPanel(name)` toggles them.
- **`#mapTitle` (on-map title) STILL EXISTS and is mandatory** — `captureMapImage()` and every title write target it unchanged. A new top-bar `#createMapTitleInput` two-way-syncs with it. Do NOT remove `#mapTitle`; export fidelity depends on it.
- **`#sourceInput`** (desktop Source field, autofill-defeat intact — see "Source field autofill defeat" below) is the node that lands in the Create Map panel after re-parenting; `#mobileSourceInput` stays dormant in the hidden mobile markup.
- Net cutover diff was **+155 / −8** (the 8 "deletions" are lines that gained `id=` attributes). Rollback = a single `git revert 619e309`.

Validate editor edits with `_validate.py`. Block 1 (Mobile-UX IIFE) was a stable 33,371 chars through Phase 4; the Phase-5 editor rework (collapsible panel + map zoom) intentionally added a `window.createMapZoom*` API to it, so the new baseline is **34,471 chars**. The point of the check stands: an UNINTENDED change to Block 1's size means you disturbed it by accident.

## Arcade (Phase 2 — SHIPPED to branch, 2026-06-10)

`/games/arcade` is a real mode now (was a ComingSoon stub). It's a manifest-driven game shell + the first game, **Find the State**. Spec source: reimagining design §6 + §11. Full writeup: `docs/superpowers/plans/2026-06-10-tappymaps-phase-2-arcade.md`.

**Key architecture decision: Arcade renders its OWN independent SVG, it does NOT share the editor's map.** The master spec imagined a shared `onStateTap` dispatcher across all modes, but Phase 1 never built it (the editor still calls `onStateClick` directly and re-parents the single `#mapContainer`). Rather than refactor the export-critical `#mapContainer` / `captureMapImage` path to be mode-shared, Arcade builds a second SVG (`#arcadeStatesGroup`) from the already-cached `appState.topologyData`. So **Arcade touches none of**: `#mapContainer`, `captureMapImage`, `onStateClick`, `appState.stateColors`, or the Mobile IIFE (Block 1). The two maps share TopoJSON data, not DOM.

- All Arcade code is in the main script block (Block 0). Grep anchors: `id="modeArcade"` (markup), `#modeArcade {` (CSS), `const ARCADE_GAMES` (manifest registry), `Modes.Arcade` (mode), `arcadeBuildMap` (one-time SVG build), `arcadeStartRun`/`arcadeResolve`/`arcadeComplete` (run lifecycle), `arcadeMakeRng` (seeded RNG).
- **Five playable games** (2026-06-10): **Find the State** (Classic/Shuffle), **Stat Duel** (`kind:'duel'`), **State Capitals** (`kind:'capitals'`), **Neighbor Challenge** (`kind:'neighbors'`), **Speed Run** (50-state find). The engine dispatches on `game.kind` in `arcadeNextPrompt` / `arcadeOnTap` / the timeout path; absence of `kind` = the default single-tap find.
- **Game kinds**: *find* (string prompts, single tap), *capitals* (prompt entries are `{state, capital}`, target is the state — see `arcadeSingleTarget`), *duel* (async, two states, tap higher), *neighbors* (multi-tap: tap every borderer; `arcadeNeighborTap` accumulates, `arcadeResolveNeighbors` ends the round). Data: `STATE_CAPITALS` (50) and `STATE_ADJACENCY` (50, length-verified against `DRAFT_BORDERS` + symmetric).
- **Add a game** = add a `playable:true` entry to `ARCADE_GAMES`. Single-tap games just need `{ runLength, perPrompt, scoring, medals, generator(rng) }`; new interaction types add a `kind` + a branch in the three engine dispatch points. `playable:false` entries render as "Coming soon" tiles.
- **Seeded share:** `?seed=<seed>` reproduces the same run (mulberry32 + string hash). Rides in `window.location.search` (parseRoute only reads pathname), so it survives the Vercel SPA rewrite.
- **Scores:** anonymous localStorage only (`tappymaps_arcade_<id>_best`). Sign-in cross-device sync is DEFERRED (needs a Supabase `game_scores` table + the analytics rewire — pairs with Phase 4).
- Games surface uses the **orange** accent (`#F97316`) per brand §8, not the turquoise Design accent.
- Block 1 (Mobile IIFE) baseline is **34,471 chars** (was 33,371 before the Phase-5 floating-panel zoom API). Arcade/games never touch it; an unexpected size change means an accidental edit.

### Arcade v2 (2026-06-10, same branch)

First device test drove a gameplay overhaul of Find the State plus a second game:

- **Prompt pop**: big center-screen state name (`#arcadePromptPop`, `pointer-events:none` so fast taps pass through it).
- **Zoom**: `makeMapZoom(wrapId, svgId)` factory (pinch/pan/wheel/buttons/double-tap reset, 1x-6x) — instances for Arcade AND GeoDraft. `preventDefault` during pan suppresses the synthetic click, so dragging never taps a state.
- **Paint-as-you-play**: correct finds keep a cycling inline fill (`ARCADE_PAINT_COLORS`) for the run; the transient `--correct/--wrong/--reveal` classes win over it via `!important`. `arcadeClearPaint()` runs at run start only.
- **Modes**: games may define `modes: { classic, shuffle }` + `defaultMode`. Shuffle samples WITH replacement (no back-to-back) so painting can't be gamed by elimination. Mode rides `?mode=` in share URLs; best-score keys are suffixed per mode (`classic` keeps the legacy unsuffixed key).
- **Stat Duel** (`kind:'duel'`): two highlighted states, tap the one higher on a real ACS stat. Reuses `fetchCensusData` + the `duel:true` entries in `DATA_MAP_DATASETS` + the sessionStorage census cache. The run seed picks dataset AND pairs. Duel runs are async (data loads before round 1) and fail soft back to the hub if /api/census is down.
- **TDZ gotcha (bit us once)**: the Arcade/GeoDraft block evaluates BEFORE `fipsToState` / `nonColorable` / `DATA_MAP_DATASETS` are declared. NEVER read them at the top level of that block — lazy accessors only (`arcadeStateNames()`, `arcadeDuelSets()`, `draftCategories()`). A top-level read throws a ReferenceError that kills the entire main block at load (blank map, dormant-mobile-bar symptom) and `node --check` can NOT catch it.

## GeoDraft (Phase 2b — same branch, 2026-06-10)

`/games/draft` is a real mode now (was a ComingSoon stub): **Category Draft vs the AI** (best of 5) + **Practice**. Spec §7 MVP. Grep anchors: `id="modeDraft"` (markup), `#modeDraft {` (CSS), `draftCategories` (registry), `DG` (match state), `draftStartMatch`/`draftStartRound`/`draftCommitPick`/`draftRevealRound` (lifecycle), `Modes.Draft`.

- Same isolation contract as Arcade: own SVG (`#draftStatesGroup`) from cached topology; touches none of the export-critical editor paths or Block 1.
- **Categories (43)**: 5 bundled static (`DRAFT_AREA`, `DRAFT_STATEHOOD`, `DRAFT_BORDERS`, computed name lengths ×2) + 38 generated from non-trend `DATA_MAP_DATASETS`. Census categories load through `fetchCensusData` (cached); if census is down a match still draws the 5 static ones.
- **Match shape**: 5 rounds, 3 picks/side alternating (player first), 7s pick timer (timeout = seeded random pick), values hidden until the animated highest-to-lowest reveal, totals decide, first to 3 wins. Ties award no pip.
- **AI**: true ranking + per-round gaussian noise scaled by `cat.noise` (low on area/statehood, high on obscure census stats). Deterministic per seed.
- `?seed=` reproduces the category draw + AI behavior; final screen shares a rematch URL.

## Embed (Phase 3 — Distribution, started 2026-06-10)

`/embed#<base64-state>` is a real mode now (was a ComingSoon stub) — a chrome-less view of a shared map for iframes / Reddit / link unfurls. Grep anchors: `id="modeEmbed"` (markup), `#modeEmbed {` (CSS), `Modes.Embed` / `setupEmbed` (mode), `copyEmbedLink` (editor button).

- **Reuses the live `#mapContainer`** rather than building its own SVG (the opposite of Arcade/GeoDraft) — `setupEmbed()` `appendChild`-moves the editor's `#mapContainer` into `#embedMapHost` ONCE, so the embed is pixel-identical to an export (same legend anchoring, logo, source line). Because embeds are standalone iframe loads, this never races the Create cutover.
- State rides the **URL fragment** (`#<base64>`), not the path — base64 contains `/+=` which breaks path routing, and `loadStateFromURL()` already reads `window.location.hash`. `init()` decodes it before the router dispatches.
- Footer "Made with tappymaps.com" shows by default; hidden for `?source=devvit` or `?chrome=0`. The on-map logo is always present (brand rule). Editor `#statsBar` + title editing are suppressed via `body[data-mode="embed"]`.
- **`/api/render` (OG-image renderer) — BUILT 2026-06-10.** `GET /api/render?m=<base64-state>&format=png|svg&w=<px>` re-draws the map server-side (no browser): `topojson-client` decodes the cached `us-atlas` topology, `buildMapSVG()` composes states + title + legend + source + logo into a poster SVG, and `@resvg/resvg-js` rasterizes SVG→PNG. Decodes the SAME `btoa(JSON.stringify(...))` state as the share fragment. Cached `immutable`. `buildMapSVG`/`decodeState` are exported for tests; verified locally (PNG renders, all 51 paths, handler 200/400 paths). `mapOgImageUrl()` in index.html points the embed + shared-editor `og:image` at it.
- **Still TODO for Phase 3**: (1) crawler-facing OG — `og:image` is set client-side, so JS-executing unfurlers (Slack/Discord) get the per-map image but pure crawlers (FB/Twitter) need a server-rendered share route since state lives in the URL fragment; (2) the Devvit Reddit app (needs the pending Reddit dev account).

## Gallery (Phase 4 — started 2026-06-10)

`/design/gallery` is a real mode now (was a ComingSoon stub) — a tabbed browser for maps. Grep anchors: `id="modeGallery"` (markup), `#modeGallery {` (CSS), `Modes.Gallery` / `galleryRender` (mode), `GALLERY_MINE_KEY` / `gallerySaveMine` (storage), `saveCurrentMapToGallery` (editor button).

- **MVP ships "My Maps" only**, persisted in `localStorage` (`tappymaps_my_maps`, capped 60, de-duped by encoded hash). The editor's **Save to My Maps** button (Save & Share, free — no Pro gate) stores `encodeStateToURL()` + title/subtitle. Cards thumbnail via the Phase 3 **`/api/render`** endpoint (`galleryThumb()`), so the gallery reuses the OG renderer. "Open" navigates to `/design/make#<hash>`.
- **Recent / Featured tabs show a "coming soon" empty state** — they need the gallery backend (Supabase `user_maps` + publish/moderation), which is the next Phase 4 increment. Tabs are `/design/gallery/{recent,featured,mine}` (router `sub`); default is `mine`.
- Reachable from the Hub footer (`gallery`) and the editor's **View Gallery** button. Design surface = turquoise accent.

## Git Workflow

- Default branch: **`master`** — auto-deploys to tappymaps.com via Vercel
- No staging branch. **Pushes to master are live immediately.**
- Bash with git on PATH works for git commands. PowerShell times out on git on this machine.
- Confirm before pushing if the user hasn't explicitly authorized it for the current commit.

## Critical Patterns

### Single-source export capture (`captureMapImage()`)
All export logic lives in `captureMapImage()`. It:
- Forces landscape aspect ratio (1010:710) on the container, regardless of viewport orientation
- Sets `mapContainer.style.flex = 'none'` so inline width/height aren't overridden by parent flex sizing (mobile portrait bug from 4/18)
- Clears the SVG's pinch-zoom transform before capture
- Forces `mapTitle` visible (overrides the landscape-orientation media query that hides it)
- Overrides the legend's position with hard coordinates relative to the export frame (separate from live `updateLegendPosition`)
- Restores everything in a `finally` block via `cssText` reset

**Never add a second html2canvas/dom-to-image call.** Always route through `captureMapImage()`.

### Legend positioning (`updateLegendPosition()`)
The on-map legend is anchored to the **SVG content bounding rect**, NOT the container bounds. This is necessary because the SVG (viewBox 1010×710 with `preserveAspectRatio="xMidYMid meet"`) letterboxes inside the container on mismatched aspect ratios — most extreme on mobile portrait. Container-relative anchors land the legend in the empty letterbox below the map. The function reads `getBoundingClientRect()` from both container and SVG at runtime, computes the actual map content rect from the viewBox aspect, and positions the legend at the chosen corner with a 12px inset.

The legend element has `pointer-events: none` so taps pass through to states underneath. Background uses `color-mix(in srgb, var(--surface) 78%, transparent)` for a frosted-glass look (with the existing `backdrop-filter: blur(8px)`).

### URL hash state
If adding new `appState` fields that should persist, include them in the `btoa(JSON.stringify(...))` encode/decode in `encodeStateToURL` / `loadStateFromURL`. Theme is intentionally NOT in the hash (stored in localStorage only). County colors are NOT in the hash (state colors are).

### Click-to-toggle
`onStateClick` checks if `stateColors[name] === selectedColor` — if so, deletes the color (uncolors). Same logic in county click handler. No right-click needed.

### nonColorable set
DC and territories are excluded from the "X of 50 states colored" count.

### History / undo / redo
`saveHistory()` snapshots the FULL appState (stateColors, countyColors, legendEntries, selectedColor, mapTitle, mapSubtitle, mapSource, legendTitle) before any reversible mutation. `undo()` pushes current state to redoStack and pops history. `redo()` is the inverse. Stack capped at 50. Every legend mutation function (add / update / recolor / remove / autoPopulate) calls `saveHistory()` first. Available to BOTH free and Pro tiers (no gate).

## Theme System (16 themes)

CSS `[data-theme="x"]` selectors with full token overrides. JS `themeList` array holds metadata. `applyTheme(id)` sets `data-theme` attribute + saves to `localStorage['tappymaps-theme']`. Themes are NOT in the URL hash — shared URLs inherit the viewer's theme.

Token system: 30+ CSS custom properties on `:root`. Key tokens: `--accent` (#0EA5E9), `--error` (#ef4444), `--bg`, `--surface`, `--border`, `--text`. Light theme overrides via `[data-theme="light"]` AND legacy `body.light-mode` class (parallel migration — the class selectors are gradually being phased out).

## Data Maps System (39 datasets)

`DATA_MAP_DATASETS` array of US Census ACS 1-year datasets (22 original + 17 added 2026-06-10, every variable code verified against the live ACS 2023 registry). `fetchCensusData(dataset)` supports single-year (`dataset.year || 2023`), two-year trend (`dataset.years: [2013, 2023]`), an allowlisted `dataset.survey` (`acs1`|`acs5`), a **sessionStorage cache** (games and the editor share responses), and surfaces the proxy's JSON error message on failure. `executeDataMapLoad(datasetId, rampColors)` fetches, applies the color ramp, and updates the legend. `duel:true` entries also power Arcade's Stat Duel and GeoDraft categories.

**Census now REQUIRES an API key** (the keyless grace period ended — keyless requests 302 to missing_key.html). The browser calls the same-origin proxy `/api/census`, which injects `CENSUS_API_KEY` from the deployment environment server-side. If data maps all fail with "Census API key required", the env var is missing/not-redeployed in Vercel — env vars only take effect on the NEXT deployment. Label formats: number, currency, percent, decimal, decimal1, year.

## Template System (28 fortified templates)

`TEMPLATES` array of 28 entries across 4 categories: **personal** (14), **rankings** (8), **identity** (3), **fun** (3). Was 199; culled to 28 on 2026-04-18 per the audit at `template-audit-v2-fortified.md` (gitignored). Filter applied: must work for all 50 states AND show interesting state-level variation.

Each template: `{ id, title, category, presetColors, legendEntries, darkMode }`. `loadTemplate()` calls `saveHistory()` then `updateLegendBuilder()` so the editor's closures rebind to the new entries (otherwise edits silently no-op against stale indices).

## Mobile UX

**Phase 1 note:** The legacy mobile chrome described in this section (bottom sheet, floating color bar, mobile IIFE handlers) is now **dormant** — it's hidden by `body[data-mode] .mobile-* { display:none !important }` whenever a route is active, and the Create editor uses the same 5-panel rail at all viewport sizes. The markup and the IIFE still exist (hidden, not deleted), so the descriptions below remain accurate for the dormant code; they no longer describe the live mobile editor.

Mobile breakpoint: `@media (max-width: 900px)`. The mobile IIFE wires panel buttons via a `wire(id, event, fn)` helper that silently no-ops if the element isn't found.

**Architectural rot pattern (April 2026):** Several mobile handlers reference DOM elements that live inside the desktop sidebar (which is `display: none !important` on mobile). Toggling those targets does nothing visible. Examples surfaced in the audit: `mobileMorePalettes` toggles `#morePalettesPanel` inside the sidebar. When fixing mobile bugs, verify the targeted element is mobile-visible. The pattern is documented in `audit-2026-04-18.md` (gitignored).

Mobile-specific features:
- Bottom sheet sidebar (slides up, max 70vh)
- Floating color bar at bottom (56px, scrollable swatches, MutationObserver-synced with desktop palette)
- Long-press to remove color (500ms, `navigator.vibrate(30)`)
- Pinch-to-zoom (1x–4x) + double-tap to reset
- Multi-select bar includes inline color swatch + hidden picker so users see what color will be applied

## Export Hardening

- `checkExportPermission()` is fail-closed: server errors return `{ allowed: false, serverError: true }` and exports show "check your connection"
- Anonymous: 1 export (localStorage counter, bypassable)
- Free signed-in: 3/month (server-enforced via `export_counts` table)
- Pro: unlimited, no watermark
- Watermark added post-capture for non-Pro users

## Account Menu (mobile)

`syncAccountMenu()` reads `appState.currentUser` and `isPro()`. Earlier versions read non-existent `appState.user` / `appState.isPro` causing the "not signed in" branch to run unconditionally — fixed in pre-Phase-0 cleanup. When debugging account-menu issues, verify the function reads the correct field names.

The mobile Sign In button calls `showUpgradeModal('auth')`, which renders the upgrade modal in auth-only mode (hides feature grid + access code section, retitles to "Sign In or Sign Up"). The default `showUpgradeModal()` (no argument) renders the full upgrade UI — used by all pro-badge / upgrade-banner / export-gate callers.

**With TESTER_MODE enabled (current state), the auth UI is hidden entirely.** `updateUpgradeModalUI()` early-returns when `TESTER_MODE === true` and hides both `#upgradeAuthSection` and `#upgradePricingSection`. The only path to Pro is the access code field (`tap26`). See the Tester Mode section below.

## Tester Mode (current — REMOVE BEFORE PUBLIC LAUNCH)

Tester mode hides all auth/pricing UI from the Upgrade modal and substitutes a single access-code unlock. Live since commit `a1acb4a` (2026-05-23). Four touch points in `index.html`, all tagged with `TESTER MODE` comments for grep:

| Location (grep `TESTER MODE`) | Purpose |
|---|---|
| Near `ADMIN_EMAILS` constant | Defines `TESTER_MODE = true`, `TESTER_CODES = ['tap26']`, `TESTER_PRO_KEY = 'tappymaps_tester_pro'`, and the localStorage restore block (auto-grants Pro on load if the user previously entered the code) |
| `updateUpgradeModalUI()` | Early-return that hides auth + pricing sections when `TESTER_MODE` |
| DOMContentLoaded block | `handleProCodeSubmit()` validates input against `TESTER_CODES` (case-insensitive), sets `appState.proUnlocked = true`, persists to localStorage, calls `updateProGates()` |
| Inline initializer | Auto-grants Pro to every visitor in TESTER_MODE so testers get the full editor without needing the code (see `aa0fa64`) |

To remove tester mode at launch: flip `TESTER_MODE = false`, delete the four tagged blocks, restore the original `updateUpgradeModalUI()` if/else. Total revert is ~50 lines, all annotated.

## Source field autofill defeat

Chrome autofill was prefilling the Source citation field with the user's email and rendering it visually on the map. Three-layer fix (commits `c5f8461`, `9afa442`, `decaf8c`, `187cad1`):

1. **HTML:** Both `#sourceInput` and `#mobileSourceInput` carry `readonly` (toggled off on focus), `autocomplete="off"`, `name="map-source-citation"`, `data-1p-ignore`, `data-lpignore="true"`
2. **CSS:** `:-webkit-autofill` override with `box-shadow: 0 0 0 1000px var(--surface-raised) inset !important` + `transition: background-color 5000s ease-in-out 0s !important` — overpaints Chrome's autofill chip and prevents repaint
3. **JS:** Real-time `input` listener that clears email-shaped values (deferred via `setTimeout(0)` so existing handler propagates first), plus checkpoint sweeps at 0/200/800/2500ms, plus a `userTypedSource` flag set on real `keydown`/`paste` (autofill doesn't fire keydown) so legitimate typed input is respected

Don't simplify any layer — Chrome's autofill subsystem is aggressive and each layer catches a different case. The cartographer agent doc has this in its Tribal Knowledge section.

## Notion Project Tracking

All work is tracked in Notion. Use `data_source_id` parent type (NOT `database_id`) when creating pages.

- **Dev Log** (`data_source_id: 4fba36df-b12b-43f2-849e-f9a2ae4c285b`) — every change/fix/deploy
- **Task Board** (`data_source_id: 9a0863d3-6a26-4bb8-b4c8-62a5a4e537ce`) — Backlog → To Do → In Progress → Done → Blocked
- **Decision Log** (`data_source_id: 755e93a1-c068-4d3d-bd71-22f652641d61`) — architectural decisions
- **Session Notes** (`page_id: 3386409c-0fb4-81c1-82a1-da43a73e9ca2`) — per-session summaries
- **Project page** (`page_id: 3386409c-0fb4-80e9-9817-e4597c5f3c04`)

Logging rules: every commit goes to Dev Log; significant choices to Decision Log; session summaries appended at the end of each session.

## Cartographer Subagent

Defined in `.claude/agents/tappymaps-cartographer.md`. Three modes:
- **Engineering**: code changes with all tribal knowledge encoded (captureMapImage single-source, git workflow, validation pattern)
- **Editorial**: viral map planning using the playbook + idea backlog (`C:\Users\mhowe\Downloads\tappy_ideas_1500`)
- **Automation**: URL hash construction + Claude-in-Chrome for screenshot/export

Save location for agent exports: `C:\Users\mhowe\Downloads\tappymaps-agent-exports\` with `<slug>_<YYYY-MM-DD>.ext` naming.

## Infrastructure

- **Vercel**: Serverless functions in `/api/stripe/`. Env vars in dashboard. Push to `master` = auto-deploy in ~30s.
- **Supabase**: Original project `qbhqdicppoahhvnuvcwd.supabase.co` is **DEAD** (paused or deleted — Phase 0 Task 7 commit `77e8b99` no-op'd the `appendAnalyticsEvent` network call because every page load was firing `ERR_NAME_NOT_RESOLVED`). The auth-related code paths that still reference Supabase work because the JWT verification happens server-side in `/api/stripe/*` against a different (still-live) project. Phase 1 will rewire analytics to the new project once gallery schemas land. Tables (in the working project): `user_subscriptions`, `export_counts` — both with RLS.
- **Stripe**: Monthly + annual prices, webhook at `/api/stripe/webhook` (signature-verified). PriceId allowlist + origin-pinned success/cancel URLs landed in `1ed6036`.
- **DNS**: tappymaps.com — A 76.76.21.21, CNAME www → cname.vercel-dns.com.
- **Admin Pro**: client-side gate for `max@mapparatus.org` and `mhowe.gis@gmail.com` via `ADMIN_EMAILS` constant. NOT a security boundary — server-side `verify-subscription` is the authoritative pro check. **In TESTER_MODE** (current), admin emails are bypassed because the auth UI is hidden entirely; everyone uses the `tap26` code instead.

## User Preferences

- **Allow Claude to say "I don't know."**
- Max is a systematic thinker / over-planner with a tendency to restart tasks if they aren't perfect — push through, don't enable restarts
- Plain-English explanations over jargon
- For mobile UX work specifically: **never claim a bug is fixed from static analysis alone.** Ship as "candidate fix, please verify on phone" and stop. The bundle-then-ship pattern has burned us multiple times — bugs only surface on real devices. Audit first, small focused commits, device test between tiers. (See `feedback_mobile_verification.md` in memory.)

## Known Open Items (post-Phase-0)

**Resolved during Phase 0 (2026-05-24):**
- Diagonal text watermark removed (`6258a4e`)
- Pin+wordmark logo enlarged + mandatory on every export (`6258a4e`, `1cd8102`)
- "Show Logo" toggle deleted (`997ade4`)
- Landscape map title visibility fix (`943e949`)
- Landscape onboarding overflow (`490cfb9`)
- Portrait wasted-band gap closed (`36be1b0`)
- Dead Supabase analytics URL no-op'd (`77e8b99`)
- Basic SEO head tags + sr-only h1 (`86ed0c1`)
- Stripe priceId allowlist + origin-pinned URLs (`1ed6036` — pre-Phase-0)
- Webhook returns 500 on DB failure (was 200 — pre-Phase-0)
- Server-side export quota enforcement (`track-export.js` — pre-Phase-0)

**Resolved post-Phase-0:**
- Source field email autofill (`c5f8461`, `9afa442`, `decaf8c`, `187cad1` — three-layer HTML+CSS+JS defeat)
- Tester mode hides auth UI + `tap26` access code (`a1acb4a`, `aa0fa64`)

**Resolved in Phase 1 (2026-05-29):**
- **Mobile architectural rot** — closed in the live UI: the Create editor uses one 5-panel rail at all sizes, and the legacy mobile chrome is hidden by `body[data-mode] .mobile-* { display:none !important }`. The dead handlers are **dormant, not deleted** — they still exist in the hidden mobile markup + IIFE (the cutover re-parented, it didn't remove), so a future cleanup pass could delete them.
- **Per-route SEO** — per-route `<meta>` + document-title helpers shipped with the router (commit `142f26d`); each mode sets its own title + description on `enter`.

**Still open (lower priority — Phase 2+ work):**
- **Form-label a11y** — STILL OPEN. The cutover re-parented existing inputs rather than rebuilding form markup, so label associations weren't revisited; a future pass should add explicit `<label for>` / `aria-label` coverage across the rail panels.
- **`ADMIN_EMAILS` hardcoded in client** — could move server-side eventually (mostly moot under TESTER_MODE).
- **Florida overlap on bottom-right export** — mitigated (translucent legend + smaller export sizing) but not eliminated. Could default exports to bottom-left if it remains an issue.
- **PWA / Capacitor** — planned mobile distribution path; service worker + manifest, then Capacitor wrapper for App Store / Play.

## Phase 1 — SHIPPED 2026-05-29

Phase 1 of the Reimagining — mode router + Hub + Create-mode 5-panel rail rebuild — **shipped 2026-05-29** (cutover commit `619e309`). Design spec `8dd2f5c`, implementation plan `b70aa88` (`docs/superpowers/plans/2026-05-25-tappymaps-phase-1.md`), executed as 15 commits `26485ea`→`619e309` via `superpowers:subagent-driven-development`. The full architecture lives in the **"Mode Router (Phase 1)"** section above; the re-parenting-not-deletion nuance is the key thing to internalize before touching the editor.

**Next:** Phase 2+ (Arcade / GeoDraft / Gallery / Distribution) — each phase gets its own design spec → plan → subagent execution. See `HANDOVER.md` for the canonical status.

## Naming History

CakeMapper → Mapparatus → Tappymaps. Full rename completed April 2026; no legacy references remain in the codebase.
