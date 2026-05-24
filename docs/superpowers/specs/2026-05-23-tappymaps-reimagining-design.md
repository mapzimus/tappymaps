# Tappymaps Reimagining — Design Spec

**Date:** 2026-05-23
**Status:** Design approved by Max. Ready for implementation planning (writing-plans skill).
**Approach:** Full Suite — complete reimagining as one design, phased shipping.
**Related docs:**
- `HANDOVER.md` — current product state pre-reimagining
- `.claude/agents/tappymaps-cartographer.md` — current cartographer agent (will need updating)
- Notion: Product Direction (Apr 21) Master Planning Doc, Quiz Roadmap, Distribution doc, Landing Hub doc, Tap or Crap doc, Master Checklist
- `G:\tm5.21\tappymaps-geodraft-spec.md` — May 15 GeoDraft spec (USB)
- `G:\tm5.21\tappydraft.zip` — launch-100 + master-361 GeoDraft categories
- `C:\Users\mhowe\Downloads\mapparatus-playbook.md` — editorial bible for map exports
- `C:\Users\mhowe\Downloads\tappymaps-brand\BRAND-IDENTITY.md` — locked brand kit
- Live audit (this session): `C:\Users\mhowe\AppData\Local\Temp\tm-audit-*.png` and snapshots

---

## Context

Tappymaps is a single-file HTML web app at https://tappymaps.com for coloring US state and county maps. Today it's a one-mode app (the Create editor) with strong bones (31 palettes, 22 ACS data maps, 16 themes, 28 templates, legend builder, Pro tier via Stripe, Supabase auth) and known mobile UX problems flagged in the 2026-04-18 audit and confirmed in a 2026-05-23 live audit.

The product is repositioning from a single editor into a **suite of geography surfaces**: Design (Create + Gallery) and Games (Arcade + Draft), all powered by the same underlying engine. This spec captures the full reimagined product as a single coherent vision, to be shipped in phases.

The reimagining was driven by Max's prompt: "If you stripped tappymaps down to nothing but the idea itself and the ideas about the features, strip everything visual, add the idea of tappymaps quiz games and the tappydraft mode (arcade i thiunk we called it), and present to me how you would make this app — a userfriendly US state mapping tool and a fun quiz mode used by the same engine."

Two stated user priorities shaped every section:
1. **Mobile-first**, with **landscape-default** on phones. Portrait is allowed where it fits (Gallery feed) but the editor and games are landscape-required.
2. **One engine** powering multiple modes. Same map, same interactions, different rules per mode.

---

## Decisions summary (the brainstorm output)

| # | Decision | Where it ripples |
|---|---|---|
| Q1 | Site structure is **two top-level sections**: Design + Games | Sections 1, 4, 5, 6, 7, 8 |
| Q2 | Hub Layout **B** — two-column with sub-mode previews | Sections 1, 11 |
| Q3 | Mobile orientation is **per-mode**: landscape-required for Create + Arcade-most + all GeoDraft; portrait for Gallery feed; both equal for Hub + marketing | Sections 2, 4, 5, 6, 7 |
| Q4 | Shared engine pattern: route-based with `onStateTap` dispatcher, single-file HTML preserved | Section 3, all build sections |
| Q5 | Create mode: 5-panel left rail (Map / Color / Legend / Data / Upgrade) in landscape | Section 4 |
| Q6 | **Tap or Crap killed** — Gallery becomes Recent + Featured + My Maps, no voting | Sections 1, 5, 11 |
| Q7 | Arcade: shared shell + game manifest pattern; Find the State is MVP game | Sections 6, 11 |
| Q8 | GeoDraft: Practice + Category + Territory vs AI at MVP; PvP deferred to Phase 6 | Sections 7, 11 |
| Q9 | Brand: **slogan unchanged** ("Tap. Color. Share."); hub uses descriptor underneath; Games surfaces get their own framing copy without modifying the slogan | Section 8 |
| Q10 | Pro tier is **slim**: 5 features (unlimited PNG, data maps, county view, SVG export, embed-no-footer) + future expansion; everything else free | Section 9 |
| Q11 | **Diagonal "tappymaps.com" text watermark removed**; pin+wordmark logo enlarged on all exports; no Pro option to remove logo | Sections 4, 9, 11 (Phase 0) |
| Q12 | Devvit Reddit app is **MVP**, not deferred; Phase 3 includes it | Sections 10, 11 |

---

## Section 1 — Site map + navigation

### URL tree (canonical structure)

```
/                          → Hub (Layout B: two-column with sub-mode previews)
├── /design                 → Design hub
│   ├── /design/make        → Create — the editor
│   ├── /design/make/<hash> → Shared map (preserves current /#hash too)
│   └── /design/gallery     → Browse community maps
│       ├── /design/gallery (default tab: Recent)
│       ├── /design/gallery/featured     → Editorial picks
│       ├── /design/gallery/mine         → Logged-in user's maps
│       ├── /design/gallery/search?q=... → Free-text + tag filter
│       └── /design/gallery/map/<hash>   → Single-map viewer
├── /games                  → Games hub
│   ├── /games/arcade       → Arcade hub (tile grid of all games)
│   │   ├── /games/arcade/find-state
│   │   ├── /games/arcade/state-capitals
│   │   ├── /games/arcade/speed-run
│   │   └── (15 more games per Notion roadmap, all free)
│   └── /games/draft        → GeoDraft hub
│       ├── /games/draft/category    → Category Draft (best of 5 vs AI)
│       ├── /games/draft/territory   → Territory Draft (blind picks vs AI)
│       └── /games/draft/practice    → Solo learning mode
├── /tap-in                 → Auth (sign in / sign up)
├── /pro                    → Upgrade
├── /embed/<hash>           → Chrome-less iframe for embeds
├── /api/render?hash=...    → OG image renderer for link unfurls
└── /about, /pricing, ...   → Marketing pages
```

**Backward compatibility:** existing `tappymaps.com/#<hash>` shared maps redirect to `tappymaps.com/design/make/<hash>`. Non-negotiable per the Notion Landing Hub doc.

### Hub layout (Layout B — two-column with sub-mode previews)

Each column is one pillar. Within each column, 3-4 sub-mode links are listed so the user can jump straight to a specific surface without an intermediate hub page.

```
┌──────────────────────────────────────────────┐
│                tappymaps                     │
│            Tap. Color. Share.                │
│   The Design + Games suite for the US map.   │
├─────────────────────┬────────────────────────┤
│   DESIGN (turquoise)│   GAMES (orange)       │
│   → Create a map    │   → Find the State     │
│   → Browse Gallery  │   → Speed Run          │
│                     │   → GeoDraft           │
│                     │   → All games          │
└─────────────────────┴────────────────────────┘
```

Sub-mode previews are also CTAs — tapping one navigates directly to that route. "All games" goes to `/games/arcade`.

---

## Section 2 — Mobile orientation policy

Per-mode orientation rules. Rotate-overlay pattern handles "held the wrong way."

| URL | Mode | Primary orientation | Behavior if held wrong way |
|---|---|---|---|
| `/` | Hub | Both equal | Responsive: stacked in portrait, side-by-side in landscape |
| `/design/make` | Create | **Landscape required** | Rotate overlay: "Tappymaps Create works best in landscape. Rotate your phone to continue." Tablets ≥600px: allow portrait with warning. Desktop: unaffected. |
| `/design/gallery` | Gallery | Portrait primary | Vertical scrolling card feed. Landscape allowed with 2-column grid. |
| `/games/arcade` | Arcade hub | Both equal | Tile grid responds (2 cols portrait, 3-4 landscape) |
| `/games/arcade/<game>` | Each Arcade game | Per-game (mostly landscape) | Each game declares in manifest. Most landscape. Flag Match + Mystery State both equal. |
| `/games/draft/*` | All GeoDraft modes | **Landscape required** | Map fills with team colors — needs wide canvas. Rotate overlay. |
| `/tap-in`, `/pro`, marketing | Marketing + auth | Both equal | Stock responsive |
| `/embed/<hash>` | Embed | Inherits parent | Embed host dictates sizing |

### Rotate-overlay pattern

When a "landscape required" route loads in portrait:
- Map renders normally behind a semi-transparent overlay
- Overlay shows: rotating-phone icon (~80px), one line of copy, small "Continue in portrait anyway →" escape link in bottom corner (dismisses for that session only; not persisted)
- Auto-dismisses on `orientationchange` event

### What this fixes from the live audit

- Current portrait editor's ~270px wasted empty band between map and palette eliminated
- Current landscape editor's hidden map title (`display:none` bug) eliminated (title becomes top-bar element)
- Pinch-zoom stays in Create; **disabled in Arcade/Draft games** (small-state fairness — enlarged invisible tap zones instead)

---

## Section 3 — Shared engine architecture

### Four layers

```
┌─────────────────────────────────────────────────┐
│   MODE ROUTER  (URL → mode loader)              │
└─────────────────────────────────────────────────┘
              │
   ┌──────────┼──────────┬──────────┬────────────┐
   ▼          ▼          ▼          ▼            ▼
 CREATE   GALLERY     ARCADE   GEODRAFT     EMBED
   │          │          │          │            │
   └──────────┴──────────┴──────────┴────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│       SHARED ENGINE (eight primitives)          │
│  US States SVG · onStateTap dispatcher          │
│  State coloring + labels · 16 themes + ocean    │
│  Export pipeline · Persistence layer            │
│  Design system · Score/streak/history           │
└─────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│   BACKEND (Vercel + Supabase + Stripe)          │
└─────────────────────────────────────────────────┘
```

### Layer responsibilities

**Mode Router** (~50 lines of JS): maps URL to mode, tears down prior mode, loads next, keeps URL hash in sync. Single source of truth for "what mode am I in." Without it, modes leak state into each other.

**Modes** are thin. Each owns only its UI + game logic. Does NOT own the map, theming, or export pipeline. Modes are the inversion of today's single-file app, where Create owns everything.

**Shared Engine** primitives:

| Primitive | Used by | Why shared |
|---|---|---|
| US States SVG | All | One SVG, one viewBox `-20 -30 1010 710`, one set of state paths |
| State Interaction Dispatcher (`onStateTap(name, mode, payload)`) | All | Each mode registers a handler. Tap = paint (Create) / answer (Arcade) / claim (Draft) / view (Gallery) |
| State Coloring + Labels | All | Same fill mechanism. Modes pass colors; engine handles render, leader-lines for NE states, label contrast |
| 16 Themes + Ocean | All | User preference, not mode preference. localStorage-persisted (theme NOT in URL hash — known limitation flagged for follow-up) |
| Export Pipeline | Create + Gallery | `captureMapImage()` stays single export entry point (cartographer tribal knowledge) |
| Persistence Layer | All | URL hash (Create), localStorage (theme, anon scores), Supabase (auth, user maps, leaderboards) |
| Design System | All | Brand colors, Outfit Bold / Instrument Sans / Geist Mono, button/modal/panel components |
| Score / Streak / History | Arcade + Draft + Create | Generic primitive. Arcade increments score on correct. Draft tracks team totals. Create uses for undo/redo |

**Backend**: Vercel serverless functions + Supabase + Stripe. Existing. Additions per later sections: `user_maps` table (Gallery), `game_scores` table (Arcade), `draft_games` table (GeoDraft async).

### Critical new abstraction: `onStateTap`

```js
// pseudocode — the architectural heart
function onStateTap(stateName) {
  const handler = currentMode.handlers.stateTap;
  if (handler) handler(stateName);
}

// each mode registers on load:
Modes.Create.handlers.stateTap   = (n) => paintState(n, appState.selectedColor);
Modes.Arcade.handlers.stateTap   = (n) => submitAnswer(n);
Modes.Draft.handlers.stateTap    = (n) => claimStateForTeam(n);
Modes.Gallery.handlers.stateTap  = (n) => showStateDetail(n);
```

That single indirection is what *technically* makes "the same engine" work. Without it, every mode duplicates the SVG + tap-detection code.

### What this does NOT mean

- NOT a multi-page React/SvelteKit/Next.js app. Still single-file HTML deploy per Landing Hub doc ("don't give it up for architecture theater").
- NOT a rewrite of `captureMapImage()` — cartographer agent's rule holds (edit in place, never add a second).
- NOT new tech. Still vanilla JS + Supabase + Stripe + Vercel. The architecture change is organizational, not technological.

---

## Section 4 — Create mode (editor) redesign

### Landscape-phone layout (primary)

```
┌─────────────────────────────────────────────────────────────┐
│ tappymaps   My Map: <title>          ↶  ↷   Share   👤   │
├──┬──────────────────────────────────────────────────────────┤
│  │                                                          │
│ M│                                                          │
│  │                                                          │
│ C│                                                          │
│  │           [ US states map renders here ]                 │
│ L│                                                          │
│  │                                                          │
│ D│                                                  ┌─────┐ │
│  │                                                  │ LEG │ │
│ U│                                                  └─────┘ │
└──┴──────────────────────────────────────────────────────────┘
```

- **Top bar (~11% height)**: brand wordmark, editable map title centered, undo/redo + Share + Account right
- **Left rail (~7% width)**: 5 icons stacked — Map · Color · Legend · Data · Upgrade
- **Map canvas (~55% width)**: state tap = paint with current color, long-press = remove, pinch zoom 1-4×, double-tap reset
- **Contextual right panel (~38% width)**: content matches selected rail icon
- **Legend overlay** in the map area, floating + draggable, frosted-glass background

### Five rail panels

| Icon | Panel | Contents |
|---|---|---|
| **MAP** | Map panel | Title (editable), Subtitle (Pro), Source citation, Browse Templates (28 fortified), Clear All |
| **COLOR** | Color panel | Active palette (31 palettes), Custom color picker, Color ramps (Pro), Colorblind safe toggle, Theme picker (16 themes), Quick Fill regions/geography |
| **LEGEND** | Legend panel | Title, Add Colors from Map (auto-populate), Entry list (editable), Position picker (4 corners), Max-entries warning at 8 |
| **DATA** | Data panel | 22 Census ACS datasets (Pro), category filter, ramp picker on load, one sample free as teaser |
| **UPGRADE** | Upgrade + Account | Pro pitch (4 feature cards), $5/mo or $48/yr, Access code unlock, Sign in/up/out |

### What this fixes vs the live audit

- Map title never hidden (was `display:none` in landscape — top bar element now)
- ~270px wasted empty band gone (landscape required)
- Pro badges consolidated (was 10+ inline; now one Upgrade panel + minimal contextual chips)
- Legend escapes Color panel into its own first-class section (Notion observations explicitly called for this)
- Templates is a primary CTA in Map panel (was full-screen modal)
- SEO: top bar brand becomes `h1`, map title becomes editable `h2` (was no h1/h2 at all)
- All form inputs get explicit `<label>` (fixes 5 a11y violations)

### What stayed identical (cartographer agent tribal knowledge — non-negotiable)

- `captureMapImage()` is THE export function (no second html2canvas call ever)
- `onStateClick` still has `const pathEl` (silent-coloring-bug guard)
- SVG viewBox stays `-20 -30 1010 710`
- StatesGroup transform stays `translate(5, -20) scale(0.95)` — county view still resets and restores
- 16 themes + localStorage persistence (theme NOT in URL hash — known limitation)
- DC stays non-colorable
- Mobile export forces 1010:710 landscape regardless of device orientation
- All Mapparatus Playbook locked rules apply

### Where things moved

- Show Logo toggle → **REMOVED** entirely (logo is mandatory now per §9)
- North arrow style picker → **REMOVED** (Playbook says ORNATE top-right, always)
- Scale bar style picker → **REMOVED** (Playbook says ORNATE bottom-left, always)
- Title Color, Background Color → moved into Color panel (rarely-touched but available)
- Save Config, Copy Share Link, Save SVG → all in Share panel
- Add Custom Color → inside Color panel next to palette grid

### Desktop scaling (≥1024px)

Same 5-panel rail structure but the contextual panel is always-on (no toggle — there's room). Map canvas grows to fill remaining width. Top bar gains breadcrumbs + labeled buttons (icons in mobile, full labels on desktop).

---

## Section 5 — Gallery (post Tap-or-Crap)

Tap or Crap was killed during brainstorming. Gallery becomes the only community surface.

### URL tree (revised)

```
/design/gallery                  → Recent (chronological default)
/design/gallery/featured         → Editorial picks (admin-curated weekly)
/design/gallery/mine             → Logged-in user's maps
/design/gallery/search?q=...     → Free-text + tag filter
/design/gallery/map/<hash>       → Single-map viewer
```

### Three tabs

| Tab | What | Sort | Who |
|---|---|---|---|
| **Recent** (default) | All public maps | Newest first | Everyone |
| **Featured** | Editorial picks (you flag weekly) | Pinned (your order) | Everyone |
| **My Maps** | Signed-in user's saved maps | Newest first | Logged-in only |

### What's deliberately NOT here

- ❌ No likes, hearts, upvotes, vote UI
- ❌ No "Top" or "Trending" — no ranking algorithm
- ❌ No public view counts displayed (tracked silently for analytics only)
- ❌ No creator leaderboards
- ❌ No follow/subscribe (Pro creator profiles deferred to future free social layer)
- ❌ No comments

### Single-map viewer

```
┌──────────────────────────────────────────────┐
│ tappymaps                  Share   Acct      │
├──────────────────────────────────────────────┤
│                                              │
│        [ MAP RENDERS FULL-BLEED ]            │
│                                              │
│                       ┌──────┐               │
│                       │ LEG  │               │
│                       └──────┘               │
├──────────────────────────────────────────────┤
│ My US Map · by maxhowe · 3 days ago          │
│                          [ Make my own ↗ ]   │
└──────────────────────────────────────────────┘
```

Two actions: **Share** (top bar — copy URL, native share, embed snippet) and **Make my own** (bottom right — opens `/design/make` with same palette, theme, template-style pre-filled, but states empty).

### Creator attribution

- Default anonymous
- Opt-in display name (Account settings, one-line)
- No creator profile pages at MVP

### Moderation (lighter than TaC needed)

| Surface | Behavior |
|---|---|
| Report button on every map view | Submits to admin queue (Supabase) |
| Admin queue | Soft-delete or dismiss |
| Quality floor | Map needs ≥3 states colored to publish |
| Rate limit | 5 published maps/user/day |

### Backend additions

- `user_maps` — id, user_id, hash, title, subtitle, theme, palette_snapshot (JSONB), created_at, is_featured (bool), is_deleted (bool)
- `map_reports` — id, map_id, reporter_user_id, reason, reviewed (bool), action_taken, created_at

---

## Section 6 — Arcade framework + Find the State (MVP game)

Per Notion (May 15 spec): Arcade is the section name. "Quiz" word deliberately avoided. Fast-paced, timed, score-chasing geography games. All FREE per the locked Notion decision.

### Shared shell (engine provides)

```
┌──────────────────────────────────────────────────┐
│ ←  [GAME]  PROMPT  /  SCORE  STREAK  TIMER       │
├──────────────────────────────────────────────────┤
│                                                  │
│           [ MAP CANVAS — engine-rendered ]       │
│                                                  │
├──────────────────────────────────────────────────┤
│ [feedback toast on last answer]                  │
└──────────────────────────────────────────────────┘
```

Engine provides: top bar, map canvas with `onStateTap` hooked to validator, feedback toast pattern, run lifecycle (start → N prompts → completion → share), score persistence (localStorage anon, Supabase signed-in), pause/resume.

Game provides: prompt set, prompt generator, validator, optional custom feedback, manifest.

### Game manifest format

```js
// games/find-the-state.js
export const manifest = {
  id: 'find-the-state',
  name: 'Find the State',
  tagline: 'Tap the state we name. Race the clock.',
  category: 'geography',           // grouping in Arcade hub
  orientation: 'landscape',        // 'landscape' | 'portrait' | 'both'
  runLength: 10,
  defaultMode: 'timed',            // 'chill' | 'timed'
  timer: { perPrompt: 5 },
  scoring: {
    correct: 20,
    streakMultiplier: 2,
    streakThreshold: 10,
    timePenalty: 0,
  },
  medals: { bronze: 100, silver: 180, gold: 250 },
  generator: () => randomStates(10),
  validator: (prompt, answer) => prompt === answer,
};
```

### Find the State — full ruleset

| | Chill mode | Timed mode |
|---|---|---|
| Run length | 10 random states | 10 random states |
| Time per prompt | unlimited | 5 seconds |
| Points per correct | 20 | 20 (+ streak multiplier) |
| Streak multiplier | none | 2× after 10 consecutive correct |
| Medal eligible | No | Bronze 100 / Silver 180 / Gold 250 |

### Arcade hub layout (`/games/arcade`)

Tile grid. Each tile shows: name, tagline, your medal (or blank), your high score (or "—"). Tap → game route. Anonymous users see "—" everywhere. Signed-in users see their best scores. Medals + scores act as completion tracker + replay motivator.

### Anonymous vs signed-in

| State | What works |
|---|---|
| Anonymous | All games playable, scores localStorage only, no leaderboards, no cross-device |
| Signed-in | Scores in Supabase, accessible across devices, eligible for future friends-leaderboards |

Sign-in is upside, not a gate.

### Completion + share

End of run: medal display + score + streak. **Share button generates a seeded URL** (`/games/arcade/find-state?seed=abc123`) so recipient gets the same 10 states in the same order — apples-to-apples "beat my score." Default share copy is per-platform per-game.

### Mobile orientation per game

Most landscape-required (FtS, Speed Run, State Shape ID, State Capitals, Neighbor Challenge, Region Builder, Alphabet Race). Flag Match + Mystery State both-equal (clue-text games, less map-centric).

### Deferred decisions

| Decision | Provisional default |
|---|---|
| Per-game timer durations | 5s per prompt timed mode default |
| Bronze/Silver/Gold thresholds | 50% / 80% / 100% of max possible score |
| High-score sync | Yes (Supabase) signed-in, localStorage anon |
| Global leaderboards | No at MVP (moderation surface) — Phase 2 |
| Quick-start button on hub | One-tap to last-played game's Chill mode |

### Not in MVP

- Friends-only leaderboards (needs friends graph)
- Daily challenges (needs scheduled prompts + UTC handling)
- Per-game tutorials (just toss user into Chill for first run)
- Achievements/badges beyond medals (per Notion: "medals + high scores ARE the progression. No badges.")
- Custom difficulty (Chill vs Timed is the difficulty knob)

---

## Section 7 — GeoDraft (per May 15 USB spec)

### Three sub-modes

```
/games/draft           → GeoDraft hub (mode picker)
/games/draft/category  → Category Draft (primary, PvAI, real-time)
/games/draft/territory → Territory Draft (blind, PvAI MVP / PvP Phase 6)
/games/draft/practice  → Solo learning mode (all values shown)
```

### Category Draft (PvAI) — the primary mode

| | Detail |
|---|---|
| Format | Best of 5 rounds, first to 3 wins, ends at clinch |
| Picks | Alternating A-B-A-B, player first |
| Timer | 7 seconds per pick |
| Timeout | Random auto-pick from bottom 50% of category |
| Round 1-2 | Tier 1 category (36-50 picks, most states eligible) |
| Round 3-5 | Tier 2 category (10-24 picks, smaller pool) |
| Category repeats | Never within a game |
| Values | Hidden during draft; animated reveal highest-to-lowest at round end |
| AI | Reputation model (not lookup) |

### Territory Draft — the blind mode

| | Detail |
|---|---|
| Format | 25 picks each, all 50 states claimed |
| Picks | Alternating A-B-A-B, no timer pressure |
| Categories | Hidden until draft completes, then 3-5 random categories revealed and scored |
| Strategy | Build balanced roster — generalists (CA, TX) safe; specialists (AK area, WY elevation) gamble |
| MVP | vs AI only |
| Phase 6 | Async PvP — friend invite by URL, N hours per pick, push/email notify |

### Practice mode

Solo. Pick category, ALL values revealed. Draft against yourself (or random AI) to learn what each state is worth. No score, no medal. Critical for new player calibration.

### AI opponent (reputation model)

- Rough ranking per category from stereotypical knowledge
- Blind spots where it undervalues strong states (NJ for population)
- Overrated states it picks too early (AK for population)
- Noise factor shuffles perceived rankings within a window
- Result: beatable by player with good geography knowledge, not a pushover

### Reveal phase

1. States animate in one at a time, sorted highest-to-lowest by value
2. Each state's actual number displays + animates into team total counter
3. Pace starts fast (high-impact states), slows down (low values) — builds tension
4. Inverted categories (Statehood Year): reveal order flips
5. Final totals lock + winner animation
6. Round counter ticks → next category or "MATCH WON" at 3-clinch

### Mobile orientation

All three modes landscape-required. Map IS the game.

### MVP scope

| Mode | MVP? | Defer? |
|---|---|---|
| Category Draft vs AI | ✓ | — |
| Practice mode | ✓ | — |
| Territory Draft vs AI | ✓ | — |
| Category Draft vs friend (real-time PvP) | — | Phase 6 (needs Supabase Realtime + lobby) |
| Territory Draft vs friend (async PvP) | — | Phase 6 (needs notification system) |
| Tournaments / brackets | — | Phase 3+ |
| Custom category builder | — | Phase 3+ |

### Backend additions

- `games/categories/` — static JSON of 100 launch categories (per `tappymaps_launch_100.md`). Each: id, name, icon, description, real values for 50 states, eligible state pool, draft size, unit/format, inverted boolean, AI reputation ranking, AI noise factor
- Future expansion to 361 categories per `tappymaps_master_categories.md`
- `game_history` table — per-user record of completed games (mode, category, opponent, result, score)

### Deferred decisions (Notion flagged)

| Decision | Provisional default |
|---|---|
| Timer scaling per round | 7s flat across all rounds; revisit after playtest |
| Tap-to-confirm vs instant | Instant on tap. Speeds play, matches timer urgency |
| Undo within 7s window | No undo. Pick locked once tapped |
| Clinch animation | Big team-color burst across whole map + winner banner |
| AI difficulty levels | One difficulty for MVP; difficulty knob in Phase 2 |
| Async game timeout (Territory) | 72 hours per pick; auto-resolves with random picks if neglected |
| Leaderboards/stats | Store data from MVP, expose UI in Phase 2 |

---

## Section 8 — Brand / voice / visual language

### Slogan (locked, unchanged)

**"Tap. Color. Share."** stays the brand line. Applies to whole product, not just Create.

Hub uses wordmark + slogan + a descriptor underneath:
> **tappymaps**
> *Tap. Color. Share.*
> The Design + Games suite for the US map.

Games sections get their own framing copy WITHOUT modifying the slogan:
- Games hub: "Play geography. Beat your time."
- Arcade landing: "Fast geography games. All free."
- GeoDraft landing: "Draft states for hidden categories. Strategy meets reputation."

### Voice per mode

| Mode | Voice | Example |
|---|---|---|
| Hub | Warm, confident, slightly cheeky | "Make maps. Play geography. Become a snob about it." |
| Create | Encouraging, deliberate, crafty | "Pick a color. Tap a state. Your map is taking shape." |
| Gallery | Curious, discovery-driven | "See what people are making this week." / "Make my own version" |
| Arcade | Energetic, snappy, competitive | "Beat your time." / "+20! Streak: 8 🔥" / "Silver! Push for Gold next run." |
| GeoDraft | Strategic, confident, dramatic | "Round 1 of 5 · Category: POPULATION" / "Values revealed in 3… 2… 1…" |
| Upgrade / Pro | Confident, never apologetic | "Unlock the advanced toolkit." (NOT "the real Tappymaps") |
| Empty states | Friendly, never pity-tone | "Nothing here yet — make your first map." |
| Errors | Honest, short, no jargon | "Can't reach the server. Try again." |

### Locked editorial rules (Mapparatus Playbook)

1. No em-dashes anywhere
2. No AI-slop phrases ("Here's a fascinating look at," "Let's dive in," "You won't believe")
3. No forced humor (honest observation > quirky)
4. No opinions stated as fact
5. Plain English, conversational, never preachy
6. Maximum 8 legend categories on any map
7. Tappymaps logo always visible in exports
8. Self-explanatory from title + subtitle + legend alone

### Naming consistency

| Use | Avoid | Why |
|---|---|---|
| Arcade (section) | Quiz, Quiz games | "Quiz" = test/school. "Arcade" = fun/play/score-chasing |
| Find the State (game) | Quiz: US States | Same. Game has a verb |
| GeoDraft (mode) | Strategy game, Draft game | Specific name = identity |
| Create (editor section) | Map Builder, Editor | "Create" = expressive, not technical |
| Tap In | Sign in, Log in | The brand pun |
| Tap or Crap | — | KILLED. Don't bring it back. |
| Make my own | Clone this map, Remix | "Clone" = engineery, "Remix" = edit-existing. "Make my own" = start fresh inspired |
| Run | Game | An arcade "run" is one attempt at a game |
| Match | Game | A GeoDraft "match" is one best-of-5 |

### Visual color system

| Surface | Color | Use |
|---|---|---|
| Design (Create + Gallery) | Turquoise `#0EA5E9` | Buttons, headers, active rail icons, links |
| Games (Arcade + GeoDraft) | Orange `#F97316` | Same elements in Games surfaces |
| Pro / Upgrade | Turquoise → Orange gradient | Pro CTA buttons, feature badges |
| Background | Slate Dark `#0F172A` (Midnight default) | App chrome |
| Surface | Slate `#1e293b` | Panels, cards |
| Borders / dividers | `#334155` | Hairlines |
| Text primary | `#f0f9ff` | All headings + body |
| Text secondary | `#94a3b8` | Labels, captions, metadata |
| Error / warning | `#ef4444` / `#f87171` | Timer-low, errors, Clear All |
| Success | `#22c55e` / `#4ade80` | Correct-answer feedback |

All 16 themes still available. Theme changes backgrounds + surfaces but NOT section colors (turquoise stays turquoise, orange stays orange across themes).

### Logo treatment

Pin + wordmark stays. **Slogan dropped from live wordmark** (already done in the SVG per audit comment). Slogan lives in hub copy now, not on the logo.

### Typography hierarchy

| Level | Font | Use |
|---|---|---|
| H1 | Outfit Bold | App brand wordmark only |
| H2 | Outfit Bold | Page titles, section headers, game prompts |
| H3 | Outfit Semibold | Panel headers, card titles |
| Body | Instrument Sans | Paragraphs, descriptions, settings labels |
| UI label | Instrument Sans Medium | Small uppercased section labels |
| Code/mono | Geist Mono | Hex codes, URLs, technical strings |
| Numbers (score, timer) | Outfit Bold (tabular nums) | "240" stays width-stable at "999" |

---

## Section 9 — Pro tier / monetization

### Pro features (5 + future)

| # | Feature | Where | Why Pro |
|---|---|---|---|
| 1 | Unlimited PNG exports | Create / Gallery | Variable server compute cost |
| 2 | 22+ Census ACS data maps + future DataUSA | Create | External API costs, complex feature |
| 3 | County View + state zoom | Create | 3000+ counties = heavy render + significant data |
| 4 | SVG export (Save for Print) | Create | Server-side vector rendering cost |
| 5 | Embed without "Made with tappymaps.com" footer | Embed | Classic branding gate; Devvit posts always footer-free |
| Future | Flipbook, world maps, state subdivisions, custom regions | Create | Real future builds, Pro from day one |

### Free tier per mode

| Mode | Free user experience |
|---|---|
| Create | Full editor including subtitle, color ramps, save/load configs, custom labels, movable text. **3 PNG exports/month, no watermark, with logo always present.** |
| Gallery | Full browse + publish + remix |
| Arcade | All games, cross-device sync with sign-in |
| GeoDraft | Practice + Category + Territory vs AI + Async PvP with sign-in |
| Distribution | Embed with footer (Pro removes); free OG image generation |

### Pricing

- $5/month (recurring)
- $48/year (Save 20% badge)
- Access codes (existing field stays, beta/promo distribution)
- Future: lifetime tier at $80-100 if you want to test (per Notion)

### Pro surfacing rules

| Surface | Behavior |
|---|---|
| Create panel (Upgrade in left rail) | Always visible, the primary pitch |
| Pro features in other panels | Small "Pro" chip next to gated controls; click opens Upgrade panel (not modal) |
| Free export #3 used | "Share" panel soft prompt: "You've used all 3 free exports. Pro = unlimited." |
| Hub | NOT here. Hub stays clean — no upsell on front door |
| Gallery single-map viewer | NOT here. Browse experience clean |
| Arcade / GeoDraft | NOT here at all. Games are pure free |

### Logo on exports (the key brand decision)

- ❌ **Diagonal "tappymaps.com" text watermark removed entirely** (was dominating live canvas per audit)
- ✅ **Pin + wordmark logo enlarged** on all exports (was scale 0.72, opacity 0.45; new scale ~1.0, opacity ~0.7)
- 🔒 **No Pro option to remove logo.** Every tappymap is branded, regardless of tier.
- 🗑 **"Show Logo" toggle removed** from UI entirely — no user choice ever
- 📣 Reason: every shared map becomes a stealth billboard. Brand-presence > monetization gate for this lever.

### What changes vs today

| Today | Reimagined |
|---|---|
| Always-visible "Unlock Tappymaps Pro $5/mo" banner pinned to sidebar bottom | Banner gone. Replaced by Upgrade panel in rail. |
| 10+ inline "PRO" badges scattered across sidebar | Quiet "Pro" chips only where features live in panels |
| Upgrade modal pops on every Pro feature attempt | Pro features open Upgrade panel (not blocking modal) |
| County View opens "Select a state" modal first | County View opens directly to last-viewed state or zoomed US overview |
| Diagonal "tappymaps.com" watermark on map and exports | Removed |
| Pin+wordmark logo at scale 0.72 / opacity 0.45 | Enlarged to scale ~1.0 / opacity ~0.7 |
| "Show Logo" toggle (Pro to hide) in Display section | Removed entirely |

### Backend implications

- `user_subscriptions` table already exists. No schema change.
- `export_counts` table already exists. No schema change.
- Stripe priceId allowlist already done (commit `1ed6036`). No change.
- New: `gallery_publish_counts` table for rate-limit (free 5/day, Pro 20/day)

---

## Section 10 — Distribution / embeds / SEO / Reddit

### Three distribution surfaces

1. **`/embed/<hash>`** — chrome-less iframe of any shared map
2. **`/api/render?hash=...&format=png`** — OG image renderer for link unfurls
3. **Devvit Reddit app** — native interactive embeds on r/MapPorn etc. (**MVP, not deferred** per Q12)

### Embed surface (`/embed/<hash>`)

```
Free:                                Pro:                          Devvit (Reddit):
┌─────────────────────────┐         ┌─────────────────────────┐    ┌─────────────────────────┐
│                         │         │                         │    │                         │
│   [ MAP — no chrome ]   │         │   [ MAP — no chrome ]   │    │   [ MAP — no chrome ]   │
│                         │         │                         │    │                         │
│       ┌──────┐          │         │       ┌──────┐          │    │       ┌──────┐          │
│       │ LEG  │          │         │       │ LEG  │          │    │       │ LEG  │          │
│       └──────┘          │         │       └──────┘          │    │       └──────┘          │
├─────────────────────────┤         └─────────────────────────┘    └─────────────────────────┘
│ Title · by creator      │
│ Made with tappymaps.com │
└─────────────────────────┘
```

Footer behavior:
- Free third-party embeds: title + creator + "Made with tappymaps.com" footer
- Pro third-party embeds: no footer
- **All Devvit Reddit embeds: no footer** (Reddit context = implicit attribution; this IS the growth channel)

Logo on the map render itself: always present, big, regardless of surface/tier.

### OG / link-unfurl rendering (`/api/render`)

**Architecture: Option B — native SVG → PNG via resvg/sharp.** Fast (~100-300ms), cheap, edge-cacheable. Trade-off: requires re-implementing SVG render server-side.

Aggressive CDN caching: every successful render pushed to Vercel CDN edge with `Cache-Control: public, max-age=31536000, immutable` keyed on hash. One viral post → one server render + N edge hits.

### SEO head tags (currently zero — biggest free win)

Per-page template:

```html
<title>{contextual} · Tappymaps</title>
<meta name="description" content="...">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="https://tappymaps.com/api/render?hash=...">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="...">
<meta name="twitter:description" content="...">
<meta name="twitter:image" content="...">
<link rel="canonical" href="https://tappymaps.com{current-path}">
<h1>Tappymaps</h1>
```

Per-page content per route:
- Hub: "Tappymaps · Tap. Color. Share." — "Make US state maps and play geography games."
- Editor: "Create a map · Tappymaps" — dynamic update as user types title
- Shared map: "{map-title} · Tappymaps" — OG image = rendered map
- Gallery: "Gallery · Tappymaps" — description tied to current view
- Arcade game: "Find the State · Tappymaps Arcade" — OG image = "Beat my score" card
- GeoDraft: "GeoDraft · Tappymaps"

`sitemap.xml`: hub + marketing + Featured gallery maps. NOT individual user maps (too many, churn fast).
`robots.txt`: allow all except `/admin/*` and `/api/*`.

### Devvit Reddit app (MVP scope)

- Reddit Developer account (Phase 0 prerequisite — apply now, takes a few days)
- TypeScript Devvit project (separate sub-directory)
- Web View component embedding `tappymaps.com/embed/<hash>?source=devvit` (`source=devvit` triggers no-footer)
- Detection: user posts `tappymaps.com/design/make/<hash>` URL to subreddit with Devvit app installed → Reddit auto-rebuilds as interactive Devvit post
- "Make my own" CTA opens tappymaps.com in new tab
- Target subs: r/MapPorn (1.6M), r/geography (1.4M), r/dataisbeautiful (22M), r/Maps, r/education
- Reddit commercial-use review required before public

### Share copy generators

| Surface | Reddit | Twitter | iMessage / SMS / generic |
|---|---|---|---|
| Editor map | "I made this map on Tappymaps: [url]" | "{title} — made on tappymaps 🗺 [url]" | "{title} [url]" |
| Gallery map | "Saw this on Tappymaps: [url]" | "{creator} made: {title} 🗺 [url]" | "{title} [url]" |
| Arcade run | "I got {medal} on Tappymaps Find the State — beat me: [url]" | "{medal} Find the State — {score} pts. Your turn: [url]" | "Find the State — try: [url]" |
| GeoDraft match | "Won my GeoDraft match {score} on Tappymaps. Take me on: [url]" | "Drafted {category} on tappymaps. Beat me: [url]" | "GeoDraft on tappymaps: [url]" |

URLs always seeded so recipient gets identical starting state.

### Analytics fix (live audit found this dead)

`https://qbhqdicppoahhvnuvcwd.supabase.co/rest/v1/analytics` returns `ERR_NAME_NOT_RESOLVED` on every page load. Phase 0 fix: verify Supabase project status; either resurrect, point to new endpoint, or remove the fire-and-forget call to stop console errors.

---

## Section 11 — Phased implementation roadmap

### 6 phases, MVP at Phase 3 (~9 weeks)

| Phase | Theme | Duration | Ships |
|---|---|---|---|
| **0. Prep** | Foundation + audit fixes | ~1 week | Mobile portrait fixes, dead Supabase URL, Reddit dev account, basic SEO, watermark text dropped + logo enlarged, `.superpowers/` gitignored |
| **1. Spine** | Hub + mode router + Editor refresh | ~3 weeks | Routes scaffolded, Hub Layout B live, Editor redesigned per §4, URL hash backward-compat, every sub-mode has a landing page (Gallery shows "Coming soon" but loads) |
| **2. Arcade engine + FtS** | Arcade shell + MVP game | ~2 weeks | Game manifest format, shell, Find the State fully playable, anon scoring, sign-in for cross-device sync |
| **3. Embed + Devvit + OG** | Distribution MVP | ~3 weeks | `/embed/<hash>`, `/api/render` (Option B), OG images wired to per-route meta tags from Phase 1, Reddit Devvit app submitted |
| **— MVP ships (~9 weeks) —** | | | Hub, redesigned Editor, Find the State, embeds + OG + Devvit live. Gallery stubbed, GeoDraft stubbed, other 17 Arcade games stubbed. |
| **4. Gallery + 5 Arcade games** | Content + community | ~3 weeks | Gallery fully live (Recent + Featured + My Maps), publish, single-map viewer, light moderation, Speed Run + State Capitals + State Shape ID + Alphabet Race + Neighbor Challenge |
| **5. GeoDraft Practice + Category vs AI** | Strategic mode launch | ~3 weeks | Category library (100 launch), Practice mode, Category Draft vs AI, AI reputation model, animated reveal |
| **6. GeoDraft Territory + async PvP** | Multiplayer + Pro features | ~4 weeks | Territory Draft vs AI, async PvP (URL invite + notifications), Pro features finalized, basic creator profiles |
| Future | Tier 2 expansion | Ongoing | 13 more Arcade games, Flipbook, world maps, subdivisions, custom regions, DataUSA |

### Critical dependencies

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► [ MVP ships ]
                                       │
                                       ├── Devvit needs embed route stable
                                       └── OG renderer needs embed HTML stable

Phase 4 ──► Phase 5 ──► Phase 6
(can run in parallel with Phase 3 if help available)
```

### Phase 0 detail (1 week — no design decisions, just fixes)

1. Drop diagonal "tappymaps.com" text watermark
2. Enlarge pin+wordmark logo (scale 0.72 → ~1.0, opacity 0.45 → ~0.7)
3. Remove "Show Logo" toggle entirely
4. Fix landscape `display:none` on `#mapTitle`
5. Temporary portrait empty band fix (until §4 ships in Phase 1)
6. Fix landscape onboarding overflow
7. Fix dead Supabase analytics URL
8. Add SEO head tags to current `index.html` (basic version)
9. Apply for Reddit Developer account (days for approval)
10. Add `.superpowers/` to `.gitignore`

### Phase 1 detail (3 weeks)

- Mode router (~50 lines, registers handlers on URL change)
- Route definitions per §1 URL tree
- Hub page (Layout B)
- Editor refactor per §4 (left rail, 5 panels, top bar, contextual right panel)
- Every mode stubs a "Coming soon" / basic landing at its URL
- Backward-compat: `/#hash` redirects to `/design/make/<hash>`
- Mobile orientation rules per §2 (rotate overlay component)
- Brand changes per §8 (slogan placement, voice rules in copy)
- Pro tier UI per §9 revised (small Pro chips, Upgrade panel, no permanently-pinned banner)
- **Per-route SEO meta tags** (title, description, og:title, og:description, og:type, twitter:card, canonical, h1) per §10 template. OG image placeholder uses the static social-og-image asset until §3 renderer ships. Sitemap.xml + robots.txt initial versions.

### Phase 2 detail (2 weeks)

- Game manifest format (the schema from §6)
- Shared shell (top bar, score/streak/timer, feedback toast, completion)
- Find the State game (MVP)
- Anonymous score storage (localStorage)
- Sign-in path for cross-device sync (free)
- Arcade hub `/games/arcade` tile grid (FtS + "Coming soon" tiles)
- Seeded URL share format (`?seed=abc123`)

### Phase 3 detail (3 weeks)

- `/embed/<hash>` route (chrome-less render)
- `/api/render?hash=...&format=png` (server-side SVG→PNG via resvg/sharp)
- Vercel CDN caching on rendered images (long max-age, hash-keyed, immutable)
- Wire `/api/render` output into the `og:image` and `twitter:image` meta tags placed in Phase 1 (replacing the static placeholder)
- Devvit Reddit app (separate TypeScript codebase)
- Devvit submission to Reddit for commercial-use review
- Devvit Web View embedding `/embed/<hash>?source=devvit`
- "Make my own" deep link from Devvit back to tappymaps.com

### Quick-wins fallback (ship MVP and evaluate)

After Phase 3:
- Total: ~9 weeks
- Live: Hub, redesigned Editor, Find the State, embeds + OG + Devvit
- Stubbed: Gallery, GeoDraft, 17 more Arcade games
- Brand: complete
- Pro tier: complete
- Distribution: complete

That's a real shippable product. Gallery and GeoDraft can ship in subsequent quarters without anyone feeling like launch was half-baked — sub-mode preview cards in Hub B can be marked "Coming soon" until each ships.

---

## Open questions / deferred decisions

These were either consciously deferred or surfaced during brainstorm and don't block design approval:

| # | Question | Owner / when |
|---|---|---|
| OQ1 | Per-game timer durations (across all 18 Arcade games) | Per-manifest tuning during Phase 2+ |
| OQ2 | Bronze/Silver/Gold exact thresholds per game | Per-manifest after playtest |
| OQ3 | Devvit commercial-use review timing (Reddit-side) | Phase 0 application, Phase 3 submission |
| OQ4 | Watermark visual exact tuning (scale + opacity numbers) | Phase 0 implementation, eyeball test |
| OQ5 | Templates: how many free vs Pro? | Currently all 28 templates free. Revisit if needed. |
| OQ6 | GeoDraft Practice mode: random AI opponent ON or OFF by default? | Phase 5 implementation decision |
| OQ7 | Cartographer agent definition: update for new architecture | Post-Phase 1 — agent needs the new mode-router + per-mode handler patterns documented |
| OQ8 | Gallery rate-limit numbers (5/day free, 20/day Pro) | Tuning after launch based on real abuse data |
| OQ9 | Async PvP notification channel (email vs push vs both) | Phase 6 decision |
| OQ10 | Lifetime tier price ($80? $100?) | Phase 6+ if you want to test |

---

## Source materials

### Notion (workspace-internal, no public URLs in this spec)

- Product Direction (April 21) — Master Planning Doc (page `34a6409c0fb48182a087cce746430f92`)
- Master Checklist (April 21) (page `34a6409c0fb481a69448d198a34e862e`)
- Quiz & Game Modes Roadmap (page `3496409c0fb4810c930cf5bfa8cea3bc`)
- Distribution: Embeds, Reddit App, Widget Strategy (page `3496409c0fb481a28041f0daad432b0a`)
- Landing Page Hub: Three-Branch Architecture (page `3496409c0fb4812c8192fe547f358065`)
- Tap or Crap (page `34a6409c0fb48146a1d3c39ff50cd6a8`) — design source, product killed
- Dev Log (data source `4fba36df-b12b-43f2-849e-f9a2ae4c285b`)
- Task Board (data source `9a0863d3-6a26-4bb8-b4c8-62a5a4e537ce`)
- Decision Log (data source `755e93a1-c068-4d3d-bd71-22f652641d61`)

### USB stick (G:\tm5.21\)

- `tappymaps-geodraft-spec.md` — May 15, 2026 GeoDraft full spec (THE source for §7)
- `tappydraft.zip` containing:
  - `tappymaps_launch_100.md` — 100 launch categories (THE source for §7 category library)
  - `tappymaps_master_categories.md` — 361 full category universe (future expansion)

### Local (`C:\Users\mhowe\Downloads\` and `C:\Users\mhowe\tappymaps\`)

- `mapparatus-playbook.md` — 11-step editorial workflow + locked rules (THE source for §8 editorial rules)
- `tappy_ideas_1500` — 6,088-line social-share map idea backlog
- `tappymaps-brand/BRAND-IDENTITY.md` — locked brand kit (THE source for §8 brand)
- `tappymaps-brand/` — 17 brand assets (4K logos, favicons, watermark SVG, brand guide)
- `.claude/agents/tappymaps-cartographer.md` — current cartographer agent (3 modes: Engineering, Editorial, Automation) — needs update post-Phase 1
- `HANDOVER.md` (committed) — current product state pre-reimagining
- `HANDOVER-2026-04-16.md`, `-04-19.md`, `-04-21.md` (gitignored) — dated handover docs
- `audit-2026-04-18.md` (gitignored) — security + mobile UX audit
- `tappymaps-observations.md` (gitignored) — original 4/18 planning doc with full conversation transcript

### Live audit (this session, 2026-05-23)

Screenshots saved to `C:\Users\mhowe\AppData\Local\Temp\tm-audit-*.png`:
- Desktop initial + populated
- iPhone portrait initial + populated + onboarding + upgrade-modal + templates-modal
- iPhone landscape initial + populated + onboarding

Snapshots saved as `tm-audit-*-snap.txt` in same dir.

Key findings carried into this spec:
- 22 ACS data maps (exact count confirmed)
- 16 themes (exact count confirmed)
- 28 templates across 4 categories
- 31 named palettes
- Map title hidden via `display:none` in landscape (Phase 0 fix)
- Dead Supabase analytics URL (Phase 0 fix)
- ~270px wasted portrait empty band (Phase 0 temp + Phase 1 proper)
- Diagonal "tappymaps.com" watermark dominating live canvas (Phase 0 removal)
- No `<h1>`, no meta description, no OG tags (Phase 0 basic + Phase 1 per-route)
- 5 accessibility violations (missing form labels — Phase 1 fix)
- 10+ "PRO" badges scattered across sidebar (Phase 1 consolidation)

### Brainstorming session mockups

Saved to `C:\Users\mhowe\tappymaps\.superpowers\brainstorm\149-1779608315\content\`:
- `01-sitemap.html` — Hub layout options A/B/C
- `03-engine.html` — Layered architecture diagram
- `04-create-mode.html` — Landscape editor mockup
- `06-arcade-find-state.html` — In-game mockup
- `07-geodraft.html` — Mid-draft mockup

---

## Next steps

1. **You review this spec.** Tell me anything to revise.
2. Once approved, the `superpowers:writing-plans` skill takes this spec and produces a step-by-step implementation plan for **Phase 0** (the first concrete phase).
3. Plans for Phases 1-3 follow as each prior phase ships and we have current state to plan against.
4. The second brainstorming cycle (UX/UI audit + mobile-first refactor — task B9 in my queue) becomes redundant once this design is implemented, since §4 + §2 cover that work. The B9 task can be deleted or repurposed.
