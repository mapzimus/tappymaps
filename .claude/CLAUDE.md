# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What It Is

Tappymaps is a single-file HTML/CSS/JS web app for creating and exporting colored US state and county maps. Tap a color, tap a state, build a legend, export. The entire application lives in **one file (`index.html`, ~9,900 lines)**. No build step. Push to `master` auto-deploys to tappymaps.com via Vercel.

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
index.html               # The entire app (~9,900 lines, two <script> blocks)
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

There is no build step. `index.html` is loaded directly by the browser.

## Two Script Blocks (gotcha)

`index.html` contains **two `<script>` blocks**: the main app (~line 2613+) and a Mobile UX IIFE (~line 9180+). A syntax error in the main block silently kills `init()` but the mobile IIFE still runs, producing partial breakage that's hard to diagnose. After any JS edit, validate by extracting both blocks and running `node --check`:

```bash
python -c "
import re
src = open('index.html', encoding='utf-8').read()
blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', src, re.DOTALL)
for i, b in enumerate(blocks):
    open(f'_chk{i}.js', 'w', encoding='utf-8').write(b)
" && node --check _chk0.js && node --check _chk1.js && echo OK && rm _chk*.js
```

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

## Data Maps System (23 datasets)

`DATA_MAP_DATASETS` array of US Census ACS 1-year datasets. `fetchCensusData(dataset)` supports both single-year (`dataset.year || 2023`) and two-year trend (`dataset.years: [2013, 2023]` returns percent-change). `executeDataMapLoad(datasetId, rampColors)` fetches, applies the color ramp, and updates the legend.

No Census API key is sent — ACS data is public and the key is only for higher rate limits. The client uses keyless URLs.

## Template System (28 fortified templates)

`TEMPLATES` array of 28 entries across 4 categories: **personal** (14), **rankings** (8), **identity** (3), **fun** (3). Was 199; culled to 28 on 2026-04-18 per the audit at `template-audit-v2-fortified.md` (gitignored). Filter applied: must work for all 50 states AND show interesting state-level variation.

Each template: `{ id, title, category, presetColors, legendEntries, darkMode }`. `loadTemplate()` calls `saveHistory()` then `updateLegendBuilder()` so the editor's closures rebind to the new entries (otherwise edits silently no-op against stale indices).

## Mobile UX

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

`syncAccountMenu()` reads `appState.currentUser` and `isPro()`. Earlier versions read non-existent `appState.user` / `appState.isPro` causing the "not signed in" branch to run unconditionally. When debugging account-menu issues, verify the function reads the correct field names.

The mobile Sign In button calls `showUpgradeModal('auth')`, which renders the upgrade modal in auth-only mode (hides feature grid + access code section, retitles to "Sign In or Sign Up"). The default `showUpgradeModal()` (no argument) renders the full upgrade UI — used by all pro-badge / upgrade-banner / export-gate callers.

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

- **Vercel**: Serverless functions in `/api/stripe/`. Env vars in dashboard.
- **Supabase**: Project `qbhqdicppoahhvnuvcwd.supabase.co`. Tables: `user_subscriptions`, `analytics`, `export_counts` — all with RLS.
- **Stripe**: Monthly + annual prices, webhook at `/api/stripe/webhook` (signature-verified).
- **DNS**: tappymaps.com — A 76.76.21.21, CNAME www → cname.vercel-dns.com.
- **Admin Pro**: client-side gate for `max@mapparatus.org` and `mhowe.gis@gmail.com` via `ADMIN_EMAILS` constant. NOT a security boundary — server-side `verify-subscription` is the authoritative pro check.

## User Preferences

- **Allow Claude to say "I don't know."**
- Max is a systematic thinker / over-planner with a tendency to restart tasks if they aren't perfect — push through, don't enable restarts
- Plain-English explanations over jargon
- For mobile UX work specifically: **never claim a bug is fixed from static analysis alone.** Ship as "candidate fix, please verify on phone" and stop. The bundle-then-ship pattern has burned us multiple times — bugs only surface on real devices. Audit first, small focused commits, device test between tiers. (See `feedback_mobile_verification.md` in memory.)

## Known Open Items

- **Florida overlap on bottom-right export** is mitigated (translucent legend + smaller export sizing) but not eliminated. Could default exports to bottom-left if it remains an issue.
- **Mobile architectural rot** still present — `mobileMorePalettes` and likely other handlers still target desktop-only DOM. Tier 2 of the audit covers a full `wire()` walk.
- **Hardening**: `create-checkout.js` accepts arbitrary `priceId` / `successUrl` / `cancelUrl` from client (should whitelist). `ADMIN_EMAILS` hardcoded in client (could move server-side).
- **PWA / Capacitor**: planned mobile distribution path — service worker + manifest, then Capacitor wrapper for App Store / Play.

## Naming History

CakeMapper → Mapparatus → Tappymaps. Full rename completed April 2026; no legacy references remain in the codebase.
