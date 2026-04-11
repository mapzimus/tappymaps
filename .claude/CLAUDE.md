# Tappymaps

## What It Is
Tappymaps is a single-file HTML/CSS/JS web app for creating and exporting colored US state and county maps. Tap a color, tap a state, build a legend, export. The entire application lives in one file (`index.html`, ~5,706 lines). No build step. Push to `master` auto-deploys to tappymaps.com via Vercel.

Part of **Mapparatus Organization** (mapparatus.org), the LLC umbrella overseeing three products:
- **Tappymaps** (tappymaps.com): This app. Consumer map-making. Casual, playful, approachable.
- **Mapzimus** (social handles secured): Content/editorial brand for viral map posts. Minimal, cool.
- **Mapparatus** (mapparatus.org): Future professional GIS workflow tool. Clean, technical.

## Key Links
- **Live site**: https://tappymaps.com
- **Repo**: https://github.com/mapzimus/tappymaps
- **Social**: Instagram @tappymaps.app

## Brand Identity
- **Logo**: Concept A -- turquoise teardrop map pin (dark ring + orange dot center) with "tappy" in turquoise + "maps" in orange wordmark
- **Slogan**: "Tap. Color. Share."
- **Primary color**: #0EA5E9 (turquoise/sky blue)
- **Primary dark**: #0284C7
- **Secondary color**: #F97316 (orange)
- **Secondary light**: #FB923C
- **Slate dark**: #0F172A
- **Slate medium**: #64748B
- **Light BG**: #F0F9FF
- **Typography**: Outfit Bold / Instrument Sans / Geist Mono (Arial/Consolas fallbacks)
- **Brand kit**: C:\Users\mhowe\Downloads\tappymaps-brand\ (18 assets: 4K logos on white/dark/transparent, favicons all sizes, social assets, watermark SVG, brand guide)

## Stack
- Vanilla HTML/CSS/JS (no framework)
- SVG maps via TopoJSON (`us-atlas@3/states-albers-10m.json`), Albers projection pre-applied
- SVG viewBox: `-20 -30 1010 710`
- PNG export via `html2canvas` v1.4.1 at `scale: 3`
- Auth: Supabase (email/password)
- Payments: Stripe subscription (Pro tier)
- State persistence: URL hash using `btoa(JSON.stringify(...))`
- Analytics: localStorage (capped 500) + fire-and-forget Supabase insert

## Git Workflow
- Default branch: `master` (auto-deploys to tappymaps.com via Vercel)
- **Git shell via Desktop Commander:** Use `cmd` shell with:
  ```
  set PATH=%PATH%;C:\Program Files\Git\bin && cd /d C:\Users\mhowe\tappymaps && git <command>
  ```
- PowerShell times out on git; CMD needs PATH set first. The above pattern works.
- No staging branch. All pushes to master go live immediately.

## Notion Project Tracking
All work is tracked in Notion under the Tappymaps project page.
- **Dev Log** (data_source_id: `4fba36df-b12b-43f2-849e-f9a2ae4c285b`) -- every change, bug fix, feature, deploy
- **Task Board** (data_source_id: `9a0863d3-6a26-4bb8-b4c8-62a5a4e537ce`) -- Kanban: Backlog > To Do > In Progress > Done > Blocked
- **Decision Log** (data_source_id: `755e93a1-c068-4d3d-bd71-22f652641d61`) -- architectural decisions with context and alternatives
- **Session Notes** (page_id: `3386409c-0fb4-81c1-82a1-da43a73e9ca2`) -- summaries of each Claude chat session
- **Project page** (page_id: `3386409c-0fb4-80e9-9817-e4597c5f3c04`)

### Notion Logging Rules
- Log EVERY code change to the Dev Log with date, type, commit URL, and details
- Log significant architectural choices to the Decision Log
- Update Task Board as work progresses
- Add session summary to Session Notes at end of each session
- When creating Notion pages in databases, use `data_source_id` parent type (not `database_id`)

## Key Functions to Know
- `onStateClick()` (~line 2323) -- handles state coloring with click-to-toggle (click to color, click again to uncolor)
- `updateLegendPosition()` (~line 3552) -- positions legend at four corners, dynamic offsets
- `updateStatsBar()` (~line 1975) -- bottom status bar, branches on countyMode
- `captureMapImage()` (~line 3547) -- shared async helper for all html2canvas captures. Forces landscape aspect ratio (1010:710), scrolls to (0,0), shrinks legend on mobile, restores in finally block. Returns canvas. NEVER add a second html2canvas call.
- `exportPNG()` (~line 3647) -- calls captureMapImage(), adds watermark if non-Pro. Mobile: tries Web Share API first, falls back to in-app overlay with hold-to-save instructions.
- `copyImageToClipboard()` (~line 3714) -- calls captureMapImage(), writes to clipboard via ClipboardItem API
- `trackEvent()` -- localStorage + optional Supabase fire-and-forget analytics

## Design Token System
- CSS custom properties defined in `:root` block (30+ tokens)
- `[data-theme="light"]` overrides for light theme
- Theme toggle sets BOTH `body.light-mode` class AND `data-theme` attribute (parallel migration)
- Token categories: brand, semantic, surfaces, text, shadows, radius, motion, z-index
- `body.light-mode` CSS selectors still exist with hardcoded values as fallback
- To complete migration: remove `body.light-mode` selectors once tokens are fully adopted
- Key tokens: `--accent` (#0EA5E9), `--error` (#ef4444), `--bg`, `--surface`, `--border`, `--text`

## Template System
- `TEMPLATES` array -- 10 curated templates across 5 categories (travel, personal, food, opinions, fun)
- Each template: `{ id, title, category, presetColors, legendEntries, darkMode }`
- First-visit: onboarding "Let's Go" opens template picker instead of guided hints
- Returning users: "Browse Templates" button at top of sidebar
- `loadTemplate()` -- applies template to appState, clears map, rebuilds UI
- `showTemplatePicker()` / `hideTemplatePicker()` / `buildTemplateGrid()` -- modal overlay with card-based browsing

## Mobile Export Architecture
- `captureMapImage()` forces landscape aspect ratio (SVG viewBox 1010:710) on ALL exports
- Every export looks identical regardless of device orientation
- Mobile flow: Web Share API (native share sheet) -> fallback in-app overlay with hold-to-save
- Desktop flow: direct download link
- Watermark added post-capture for non-Pro users
- `updateLegendPosition()` is orientation-aware: landscape mobile gets 15px bottom offset, everything else gets 65px

## Critical Patterns
- **html2canvas capture:** All capture logic is in `captureMapImage()`. It forces landscape ratio (1010:710), scrolls to (0,0), passes explicit width/height, and restores state in a finally block. NEVER add a second html2canvas call -- always use the shared helper.
- **nonColorable set:** DC and territories excluded from "X of 50 states colored" count.
- **URL hash state:** If adding new `appState` fields that should persist, include them in the `btoa(JSON.stringify(...))` encode/decode.
- **County mode:** Separate `countyColors` map and `countyTotal`. Stats bar and export logic both branch on `countyMode`.
- **Click-to-toggle:** `onStateClick` checks if `stateColors[name] === selectedColor` -- if so, deletes the color (uncolors). Same logic applies to county click handler. No right-click needed.

## Mobile UX (lines ~1133-1243 CSS, ~4416-4638 JS)
Mobile breakpoint: `@media (max-width: 900px)`. The mobile overhaul includes:
- **Bottom sheet sidebar**: Sidebar slides up from bottom as a sheet with drag handle. Max 70vh. Tap map to close.
- **Floating color bar**: Fixed 56px bar at bottom with horizontally scrollable swatches + hamburger toggle for sheet. Uses MutationObserver to sync with desktop palette.
- **Long-press to remove**: 500ms long-press on any colored state/county removes its color. Includes haptic feedback (`navigator.vibrate(30)`).
- **Pinch-to-zoom**: Two-finger pinch scales map SVG 1x-4x via CSS transforms. Single-finger pan when zoomed. Clamped boundaries.
- **Double-tap reset**: Quick double-tap (within 300ms) resets zoom to 1x with smooth animation.
- **Layout**: Full viewport `100dvh` with `100vh` fallback, `touch-action: none` on map container.

### Mobile App Strategy
- **Current**: Mobile web with responsive layout (live now)
- **Next step**: PWA (service worker + manifest for install-to-homescreen)
- **Eventual**: Capacitor wrapper for App Store (iOS) + Google Play (Android) distribution
- The single HTML file will be the webview content with minimal changes for Capacitor

## Logo & Watermark
SVG `<g>` element inside the map SVG. Current transform: `translate(350, 575) scale(0.72)`, opacity 0.45.
Logo: turquoise pin icon + "tappy" (#0EA5E9) + "maps" (#F97316) wordmark.
Slogan: "Tap. Color. Share." in slate gray (#64748B).
North arrow: ORNATE style, top right near Maine. Scale bar: ORNATE style, bottom left under Alaska.

## Infrastructure
- **Vercel**: Serverless functions in `/api/stripe/`. 7 env vars configured in dashboard.
- **Supabase**: Project `qbhqdicppoahhvnuvcwd.supabase.co`. Tables: `user_subscriptions` (RLS), `analytics` (RLS), `export_counts` (RLS).
- **Stripe**: Product with monthly ($5) and annual ($48) prices. Webhook at `/api/stripe/webhook`.
- **DNS**: tappymaps.com -- A record 76.76.21.21, CNAME www to cname.vercel-dns.com.

## Feature Matrix (Current)
| Feature | Free | Pro |
|---------|------|-----|
| State-level coloring (50 states + DC) | Yes | Yes |
| County-level view | No | Yes |
| State zoom | No | Yes |
| 24-color palette + custom hex | Yes | Yes |
| 30 themed palettes + colorblind-safe | Yes | Yes |
| 10 color ramps | No | Yes |
| Title | Yes | Yes |
| Subtitle | No | Yes |
| Legend builder | No | Yes |
| North arrow, scale bar, ocean toggle | No | Yes |
| Dark/light theme | Yes | Yes |
| PNG export | 3/month | Unlimited |
| SVG export | No | Yes |
| Watermark | Always | None |
| Quick fill by region | No | Yes |
| Undo | 1 step | Unlimited |
| Shareable URLs | No | Yes |
| Save/load configs | No | Yes |
| Copy to clipboard | Yes | Yes |

## Known Issues
- Upgrade modal button event propagation (modal closes instead of triggering checkout)
- Webhook returns 200 on DB failure (should return 500)
- Hardcoded promo codes bypass payment (remove before real launch)
- Export counter is localStorage-only (bypassable)
- Mobile UX needs real-device testing (touch interactions, pinch-zoom, bottom sheet)

## Naming History
- Original name: CakeMapper (cakemapper)
- Second name: Mapparatus (mapparatus.org)
- Current name: Tappymaps (tappymaps.com)
- Full audit and rename completed April 2026. All CakeMapper and Mapparatus references removed from codebase.

## User Preferences
- Max is a systematic thinker and over-planner with a complex for restarting tasks if they aren't perfect
- Keep things pragmatic -- don't let perfect be the enemy of shipped
- Allow Claude to say "I don't know"
