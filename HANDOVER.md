# Tappymaps Handover Document

## Project Summary
Tappymaps (formerly Mapparatus, originally CakeMapper) is a single-file HTML web app for creating colored US state and county maps. Users pick colors, tap states, build legends, and export publication-ready maps. It runs client-side with Vercel serverless functions for auth/payments.

Part of the Mapparatus Organization (mapparatus.org), the LLC umbrella overseeing all map-related products.

- **Live site**: https://tappymaps.com (Vercel with custom domain)
- **Repo**: https://github.com/mapzimus/tappymaps (branch: `master`)
- **Single file**: `index.html` (~4,220 lines, all CSS/HTML/JS inline)
- **Domain**: tappymaps.com
- **Parent org**: Mapparatus Organization (mapparatus.org)

## Current State (April 2026)

The app is fully functional and rebranded as Tappymaps:
### Core Features
- 50 US states colorable (DC visible but non-colorable by design)
- 24-color default palette with custom color support
- 30 themed palettes in expandable dropdown (Nature, Pastels, Bold, Muted, Fun/Pride/USA, Colorblind)
- Colorblind-safe palette button (Wong 2011, one-click)
- "Reset to Default" palette button (always visible)
- 10 color ramps (7 sequential + 3 diverging) with visual picker, adjustable steps, and reverse (Pro)
- Legend builder with click-to-paint, edit button for color changes, custom title, 4-position placement
- Quick fill by region, undo, dark/light themes
- Export to PNG and SVG (3 free exports/month with watermark, unlimited for Pro)
- County-level view and state zoom (Pro features)
- Editable title/subtitle, north arrow, scale bar with position/style controls
- Ocean background toggle (CSS-based)
- Inline SVG logo watermark
- Mobile-friendly export (detects mobile UA, opens image for long-press save)
- Responsive layout (breakpoints at 900px and 600px)
- Shareable URL encoding, save/load config files (Pro)
- Copy image to clipboard (one-click)
- Guided onboarding overlay for first-time users
- Analytics tracking (localStorage + Supabase fire-and-forget)

### Infrastructure
- **Vercel**: Project deployed, custom domain configured, serverless functions working
- **Supabase**: Auth (email/password), `user_subscriptions` table with RLS, `analytics` table
- **Stripe**: Product with two prices ($5/mo, $48/yr), webhook configured
- **3 API routes**: `create-checkout.js`, `verify-subscription.js`, `webhook.js`
- **Auth UI**: Sign up/in/out in upgrade modal, Supabase client via CDN
### Known Issues
- Upgrade modal button event propagation (modal closes instead of triggering checkout)
- Webhook returns 200 on DB failure (should return 500)
- Hardcoded promo codes bypass payment (remove before real launch)
- Export counter is localStorage-only (bypassable)

## Architecture Overview

Everything lives in one HTML file plus 3 Vercel serverless functions. No build tools, no framework.

**External dependencies** (CDN):
- `@supabase/supabase-js@2.43.4` - Auth client (UMD in `<head>`)
- `topojson-client@3` - TopoJSON parsing
- `html2canvas` - PNG export

**Map data**: `us-atlas@3` (pre-projected Albers USA)

**SVG setup**: viewBox `-20 -30 1010 710`, statesGroup has `transform="translate(5, -20) scale(0.95)"`

## File Structure
```
tappymaps/
  index.html                      # The entire app (~4,220 lines)
  api/
    stripe/
      create-checkout.js          # Stripe Checkout session creation
      verify-subscription.js      # Subscription status check
      webhook.js                  # Stripe webhook handler
  assets/
    logo-horizontal.svg           # Logo (to be replaced)
  .claude/
    CLAUDE.md                     # AI assistant context
  .env.example                    # Template for 7 env vars
  package.json                    # Dependencies: stripe, @supabase/supabase-js
  vercel.json                     # Vercel config with API rewrites
  HANDOVER.md                     # This document
```
## Technical Gotchas

1. **statesGroup transform**: `translate(5,-20) scale(0.95)` is critical. County view resets and restores it.
2. **Color via style.fill**: Must use `element.style.fill` (inline). `setAttribute('fill')` won't work.
3. **DC non-colorable**: Uses `nonColorable` Set. Excluded from all fill operations.
4. **Ocean background**: CSS class (`ocean-on`), not SVG rect.
5. **html2canvas timing**: Always apply `display: none` BEFORE the double `requestAnimationFrame` in exportPNG/copyImageToClipboard.
6. **SVG namespace**: Use `setSVGContent()` helper, not `innerHTML` on `<g>` elements.
7. **Label offsets**: Hand-tuned, locked. See CLAUDE.md for full table.
8. **Logo watermark**: Inline SVG, not external image. Controlled by `appState.showLogo`.
9. **Mobile export**: Opens blob in new tab for long-press save.
10. **Vercel caching**: Hard refresh (Ctrl+Shift+R) after deploy.

## Brand Context

Tappymaps is one of three products under Mapparatus Organization:
- **Tappymaps** (tappymaps.com): Consumer map-making app (this project). Casual, playful, approachable.
- **Mapzimus** (social handles secured): Content/editorial brand for viral map posts. Minimal, cool, editorial.
- **Mapparatus** (mapparatus.org): Future professional GIS workflow tool. Clean, technical, trustworthy.

## How to Continue Development

1. Pull the repo: `git pull origin master`
2. Edit `index.html` directly
3. Test locally: `python -m http.server` (API routes need `npx vercel dev`)
4. Commit and push to master - Vercel auto-deploys
5. See `.claude/CLAUDE.md` for full technical context

## Owner
- **Name**: Max
- **Email**: mhowe.gis@gmail.com
- **GitHub**: mapzimus