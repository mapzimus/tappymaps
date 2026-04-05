# Tappymaps

## What It Is
Tappymaps is a single-file HTML/CSS/JS web app for creating and exporting colored US state and county maps. Tap a color, tap a state, build a legend, export. The entire application lives in one file (`index.html`, ~4,220 lines). No build step. Push to `master` auto-deploys to tappymaps.com via Vercel.

Part of **Mapparatus Organization** (mapparatus.org), the LLC umbrella overseeing three products:
- **Tappymaps** (tappymaps.com): This app. Consumer map-making. Casual, playful, approachable.
- **Mapzimus** (social handles secured): Content/editorial brand for viral map posts. Minimal, cool.
- **Mapparatus** (mapparatus.org): Future professional GIS workflow tool. Clean, technical.

## Key Links
- **Live site**: https://tappymaps.com
- **Repo**: https://github.com/mapzimus/tappymaps
- **Social**: Instagram @tappymaps.app

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
- `updateLegendPosition()` (~line 3552) -- positions legend at four corners, dynamic offsets
- `updateStatsBar()` (~line 1975) -- bottom status bar, branches on countyMode
- `exportPNG()` (~line 3040) -- async, uses double rAF await before html2canvas capture
- `copyImageToClipboard()` -- same pipeline as exportPNG, writes to clipboard via ClipboardItem API
- `trackEvent()` -- localStorage + optional Supabase fire-and-forget analytics

## Critical Patterns
- **html2canvas timing:** Always apply `display: none` BEFORE the `await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))` line in exportPNG. Without this, hidden elements appear in exports.
- **nonColorable set:** DC and territories excluded from "X of 50 states colored" count.
- **URL hash state:** If adding new `appState` fields that should persist, include them in the `btoa(JSON.stringify(...))` encode/decode.
- **County mode:** Separate `countyColors` map and `countyTotal`. Stats bar and export logic both branch on `countyMode`.

## Logo & Watermark
SVG `<g>` element inside the map SVG. Current transform: `translate(480, 586) scale(0.52)`.
NOTE: Logo is from the old Mapparatus brand and needs to be replaced with new Tappymaps branding.
Current slogan text: `"paint the nation"` -- to be updated with new Tappymaps slogan.
North arrow: ORNATE style, top right near Maine. Scale bar: ORNATE style, bottom left under Alaska.

## Infrastructure
- **Vercel**: Serverless functions in `/api/stripe/`. 7 env vars configured in dashboard.
- **Supabase**: Project `tylnxovujbhdmagugjew.supabase.co`. Tables: `user_subscriptions` (RLS), `analytics` (RLS).
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
## Naming History
- Original name: CakeMapper (cakemapper)
- Second name: Mapparatus (mapparatus.org)
- Current name: Tappymaps (tappymaps.com)
- Full audit and rename completed April 2026. All CakeMapper and Mapparatus references removed from codebase.

## User Preferences
- Max is a systematic thinker and over-planner with a complex for restarting tasks if they aren't perfect
- Keep things pragmatic -- don't let perfect be the enemy of shipped
- Allow Claude to say "I don't know"