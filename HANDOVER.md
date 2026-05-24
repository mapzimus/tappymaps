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
### Known Issues — Resolved (2026-04 / 2026-05 sprint)

All four prior known issues were closed out in the late-April through early-May
commits. Status as of `dd9fcad`:

- **Upgrade modal button event propagation:** Fixed. `syncAccountMenu`
  (index.html:7561) reads `appState.currentUser` and `isPro()` instead of the
  non-existent `appState.user` / `appState.isPro` fields. Per
  audit-2026-04-18.md §2.
- **Webhook returns 200 on DB failure:** Fixed. `api/stripe/webhook.js` returns
  500 from all four DB-failure paths (subscription create/update/delete and
  payment failure handling) and 200 only on success ack.
- **Hardcoded promo codes / arbitrary priceId bypass:** Fixed in `1ed6036`
  (Stripe API hardening). Server-side priceId allowlist + origin-pinned
  success/cancel URLs. Closes audit §1 [LOW] findings.
- **Export counter is localStorage-only:** Fixed for signed-in users.
  `api/stripe/track-export.js` enforces 3/month server-side against the
  Supabase `export_counts` table with JWT auth. Anonymous users still get
  1 localStorage-tracked export (acceptable — the quota is trivially small).

### Genuinely open items (lower priority)

- **Device-verification debt.** Several mobile commits (`cab8b0c`, `f353def`,
  `d39c0e2`, `e0dc07c`) shipped as "candidate fixes" pending real-device
  testing. See the gitignored dated `HANDOVER-*.md` docs for the per-commit
  verification checklist.
- **Line-ending churn.** No `.gitattributes` yet, so most edits trigger
  CRLF/LF warnings on Windows. Cosmetic, doesn't affect deploys.
- **Mobile `wire()` walk (audit Tier 2 §3).** Need to walk every mobile
  handler to verify it targets a mobile-visible element, not desktop-only DOM.
  `mobileMorePalettes` was found and fixed; more may lurk.

## Reimagining — Phase 0 shipped (2026-05-24)

Design spec at `docs/superpowers/specs/2026-05-23-tappymaps-reimagining-design.md`.
Plan at `docs/superpowers/plans/2026-05-23-tappymaps-reimagining-phase-0.md`.

Phase 0 punch list complete. Commits on `master`:

- `6258a4e` — drop diagonal text watermark, enlarge pin+wordmark logo (Task 2)
- `1362cbc` — update logoWatermark comment for new scale + drop TaC ref (Task 2 follow-up)
- `997ade4` — remove Show Logo toggle entirely, logo always visible (Task 3)
- `1cd8102` — keep logo visible in exports (spec section 9 mandatory for everyone) (Task 2A)
- `943e949` — show map title in mobile landscape (Task 4)
- `490cfb9` — scroll onboarding modal within viewport on landscape phones (Task 5)
- `36be1b0` — close ~270px portrait wasted band between map and palette (Task 6)
- `77e8b99` — stop firing dead Supabase analytics request on every page load (Task 7)
- `86ed0c1` — add basic SEO head tags, OG/Twitter cards, and h1 element (Task 8)

Items shipped:
- Diagonal "tappymaps.com" text watermark removed from canvas
- Pin+wordmark logo enlarged (scale 0.72 → 1.0, opacity 0.45 → 0.7)
- Logo mandatory on all exports for all users (no Pro removal option, no UI toggle)
- Landscape map title visible (was display:none — live audit bug)
- Landscape onboarding modal scrolls within viewport (was clipping skip link)
- Portrait wasted-band gap closed (365px → 0px between stats and palette; stopgap until Phase 1's rotate-overlay)
- Dead Supabase analytics URL no longer fires ERR_NAME_NOT_RESOLVED on every page load
- Basic SEO head tags added (title, meta description, OG, Twitter cards, canonical, sr-only h1)
- `.superpowers/` gitignored (brainstorm session artifacts kept local)

Items deferred to Phase 1 / parallel work:
- Reddit Developer account (Task 11, external) — apply at developers.reddit.com to reserve Tappymaps Devvit app name; takes a few days for approval
- Per-route SEO tags (Phase 1 once mode router exists)
- Form-label a11y fixes (Phase 1 Create-mode refactor)
- `.claude/agents/tappymaps-cartographer.md` update (Phase 1 once mode-router patterns exist)
- `--mobile-icon-bar-height` CSS custom property extraction (Phase 1 cleanup)
- Analytics rewire to new Supabase project (Phase 1 once gallery schemas land)

Next: Phase 1 — mode router + Hub Layout B + Create mode 5-panel rail refresh.
Plan will land at `docs/superpowers/plans/2026-05-XX-tappymaps-reimagining-phase-1.md` (TBD when Phase 0 is fully signed off).

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
- **GitHub**: [@mapzimus](https://github.com/mapzimus)
- **Contact**: see README