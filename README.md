<!-- Banner: an exported map from tappymaps.com lives here.
     TODO: drop a screenshot/export at .github/banner.png and uncomment:
     ![Tappymaps banner](.github/banner.png) -->

# Tappymaps

> tap color map

[![Live at tappymaps.com](https://img.shields.io/badge/live-tappymaps.com-3a86ff?style=for-the-badge)](https://tappymaps.com)
[![Portfolio](https://img.shields.io/badge/built_by-Maxwell_Howe-111?style=for-the-badge)](https://maxwellhowegis.com)

## What it does

- **Color US state and county maps in your browser** — click states, pick palettes, build legends, export PNG/SVG.
- **30 themed palettes** plus 10 color ramps, colorblind-safe presets (Wong 2011), and full custom-color support.
- **Publication-ready exports** with editable titles, north arrow, scale bar, and inline-SVG watermarks. PNG to clipboard in one click.

Designed to be the fastest way to go from "I need a colored US map for my report / post / paper" to "done."

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vanilla JS, single-file HTML (~13,600 lines) | Zero build step. Loads fast, deploys anywhere static. |
| Map data | TopoJSON via `us-atlas@3` (Albers USA) | Pre-projected, small enough to ship inline. |
| Hosting | Vercel + custom domain | Auto-deploy on push to `master`. |
| Auth | Supabase (email/password, JS client via CDN) | RLS-secured `user_subscriptions` and `analytics` tables. |
| Billing | Stripe Checkout + webhooks | Pro $9/mo or $72/yr; Classroom $12/mo (legacy $5/$48 grandfathered); plan-based checkout. |
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

## About

Tappymaps is an independent lightweight mapping product built by [Maxwell Howe](https://maxwellhowegis.com), a Web GIS developer and high-school math teacher. Experimental maps, tools, and games live separately at [Mapzimus](https://mapzimus.com).

## License

All rights reserved. Source is published here for inspection. Re-deployment,
redistribution, and commercial re-use require written permission from
Mapparatus LLC.

## Contact

[mhowe.gis@gmail.com](mailto:mhowe.gis@gmail.com)
