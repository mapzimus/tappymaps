<!-- Banner: an exported map from tappymaps.com lives here.
     TODO: drop a screenshot/export at .github/banner.png and uncomment:
     ![Tappymaps banner](.github/banner.png) -->

# Tappymaps

> tap color map

[![Live at tappymaps.com](https://img.shields.io/badge/live-tappymaps.com-3a86ff?style=for-the-badge)](https://tappymaps.com)
[![Made by Mapparatus](https://img.shields.io/badge/made_by-Mapparatus-111?style=for-the-badge)](https://mapparatus.org)

## What it does

- **Color US state and county maps in your browser** — click states, pick palettes, build legends, export PNG/SVG.
- **30 themed palettes** plus 10 color ramps, colorblind-safe presets (Wong 2011), and full custom-color support.
- **Publication-ready exports** with editable titles, north arrow, scale bar, and inline-SVG watermarks. PNG to clipboard in one click.

Designed to be the fastest way to go from "I need a colored US map for my report / post / paper" to "done."

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vanilla JS, single-file HTML (~4,200 lines) | Zero build step. Loads fast, deploys anywhere static. |
| Map data | TopoJSON via `us-atlas@3` (Albers USA) | Pre-projected, small enough to ship inline. |
| Hosting | Vercel + custom domain | Auto-deploy on push to `master`. |
| Auth | Supabase (email/password, JS client via CDN) | RLS-secured `user_subscriptions` and `analytics` tables. |
| Billing | Stripe Checkout + webhooks | $5/mo or $48/yr Pro tier; server-side price-ID allowlist. |
| Quota enforcement | Server-side (Vercel function + Supabase `export_counts`) | Anonymous: 1 export tracked in `localStorage`. Authed: 3/mo enforced by API with JWT. |

## Architecture

```
                       ┌───────────────────────┐
   Browser ───────────►│  index.html (~4200 LOC)│
                       │  SVG map + UI + state │
                       └──────────┬────────────┘
                                  │ fetch /api/*
                                  ▼
       ┌─────────────────────────────────────────────┐
       │  Vercel Serverless Functions (Node)         │
       │  • create-checkout.js  (Stripe session)     │
       │  • verify-subscription.js  (status check)   │
       │  • webhook.js  (Stripe events → DB)         │
       │  • track-export.js  (quota enforcement)     │
       └────────┬─────────────────────┬──────────────┘
                │                     │
                ▼                     ▼
        ┌──────────────┐      ┌────────────────┐
        │  Supabase    │      │     Stripe     │
        │  • auth      │      │  • Checkout    │
        │  • subs (RLS)│      │  • Webhooks    │
        │  • exports   │      │  • Price API   │
        │  • analytics │      └────────────────┘
        └──────────────┘
```

Everything client-side lives in `index.html`. Server-side is four Vercel
functions in `api/stripe/`. No build pipeline, no framework, no bundler — the
single-file constraint is deliberate (fast cold loads, dead-simple deploys,
trivially auditable).

## Local development

```bash
git clone https://github.com/mapzimus/tappymaps.git
cd tappymaps

# Static-only (UI works, API does not)
python -m http.server 8000

# Full stack (API routes + Stripe + Supabase)
cp .env.example .env.local   # fill in 7 env vars
npx vercel dev
```

Required env vars are documented in `.env.example`. You'll need a Supabase
project and a Stripe test-mode account to exercise the paid-tier paths.

## About Mapparatus

Tappymaps is one of three products under **Mapparatus Organization** —
my LLC for map-related software.

- **Tappymaps** (this repo) — consumer map editor. Live at [tappymaps.com](https://tappymaps.com).
- **Mapzimus** — editorial brand for viral map content (social presence).
- **Mapparatus** — pro GIS workflow tool (in development).

See [mapparatus.org](https://mapparatus.org) for the umbrella site.

## License

All rights reserved. Source is published here for inspection. Re-deployment,
redistribution, and commercial re-use require written permission from
Mapparatus LLC.

## Contact

[max@mapparatus.org](mailto:max@mapparatus.org)
