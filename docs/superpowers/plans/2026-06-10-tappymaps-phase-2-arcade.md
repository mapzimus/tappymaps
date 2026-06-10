# Tappymaps Phase 2 — Arcade engine + Find the State

**Date:** 2026-06-10
**Status:** SHIPPED to branch `claude/tappymaps-setup-launch-ceiqp1` (draft PR).
**Source spec:** `docs/superpowers/specs/2026-05-23-tappymaps-reimagining-design.md` §6 + §11 (Phase 2 detail).
**Predecessor:** Phase 1 mode router + Hub + Create rail (`619e309`).

---

## What shipped

The `/games/arcade` route is no longer a ComingSoon stub. It is now a real
**Arcade mode** with a manifest-driven game shell and the first playable game,
**Find the State**.

### Architecture decision — self-contained map, NOT the shared `onStateTap` engine

The master spec (§3) imagined a single shared SVG with an `onStateTap`
dispatcher that every mode registers a handler on. **Phase 1 never built that
abstraction** — the editor still calls `onStateClick` directly and the single
`#mapContainer` is re-parented into the Create shell at runtime.

Rather than refactor the export-critical `#mapContainer` / `captureMapImage`
path to make it mode-shared (high risk, touches the one thing the cartographer
rules say never to destabilize), Phase 2 Arcade renders its **own independent
SVG** from the already-cached `appState.topologyData`. Consequences:

- Arcade never touches `#mapContainer`, `captureMapImage`, `onStateClick`, the
  editor's `appState.stateColors`, or the Mobile-UX IIFE (Block 1 stays
  byte-identical at 33,371 chars).
- The two maps share data (the TopoJSON `init()` already fetches) but not DOM.
- If the full `onStateTap` unification is ever wanted, it's a later refactor;
  Arcade's tap path is already isolated behind `arcadeOnTap(name)`.

### Pieces (all in `index.html`, main script block / Block 0)

| Piece | Where (grep) | Notes |
|---|---|---|
| Mode container markup | `id="modeArcade"` | Hub view (`#arcadeHub`) + game view (`#arcadeGame`) + completion overlay (`#arcadeComplete`). Inserted right after the ComingSoon stub div. |
| CSS | `#modeArcade {` | Games-orange accent (`#F97316`) per brand §8. Tile grid, game bar, timer track, toast, completion card, portrait rotate-hint. Inserted before the Create-mode CSS. |
| Game manifest registry | `const ARCADE_GAMES` | `find-state` is `playable:true`; `speed-run` + `state-capitals` are `playable:false` → "coming soon" tiles. Add a game by adding a manifest entry. |
| Seeded RNG | `arcadeMakeRng` / `arcadeHashSeed` | mulberry32 + string hash. Same `?seed=` → identical 10-state run (apples-to-apples "beat my score"). |
| Map builder | `arcadeBuildMap` | Builds `#arcadeStatesGroup` paths once from `appState.topologyData`. Same viewBox + transform as the editor. DC is rendered but inert. |
| Run lifecycle | `arcadeStartRun` → `arcadeNextPrompt` → `arcadeResolve` → `arcadeComplete` | Score / streak / per-prompt countdown timer / feedback toast / medal computation. |
| Scoring | manifest `scoring` | base 20 + up-to-15 time bonus + escalating streak bonus (after 3 in a row, capped). Max ~550/run. Medals bronze 150 / silver 280 / gold 400. |
| Best-score persistence | `arcadeBestKey` / `arcadeGetBest` | localStorage per game (`tappymaps_arcade_<id>_best`). Anonymous only. |
| Seeded share | `arcadeShareRun` / `arcadeShareUrl` | `navigator.share` with clipboard fallback. URL `/games/arcade/find-state?seed=<seed>`. |
| Hub tile grid | `arcadeRenderHub` | Shows best score + medal per playable game, "Coming soon" chip otherwise. |
| Mode registration | `Modes.Arcade` / `Router.register('games/arcade', …)` | `enter(route)`: `route.sub` is a playable game id → start run (honoring `?seed=`); else show hub. Replaces the old `registerComingSoon('games/arcade', …)`. |

### Routing

`parseRoute` (unchanged from Phase 1) already maps:
- `/games/arcade` → `{ mode: 'games/arcade', sub: null }` → Arcade hub
- `/games/arcade/find-state` → `{ mode: 'games/arcade', sub: 'find-state' }` → game

`?seed=` rides in `window.location.search` (parseRoute only reads pathname), so
shared links survive the Vercel SPA rewrite and reproduce the same run.

---

## Verification

- Both script blocks `node --check` PASS. Block 1 (Mobile IIFE) byte-identical
  at 33,371 chars — proof the editor / mobile code was untouched.
- No duplicate element IDs introduced.
- Pure game logic unit-tested against the **real source** (extracted from
  `index.html` and run in Node): seeded determinism, 10 distinct valid states,
  DC excluded, 50-state pool, RNG spread, medal thresholds, gold reachable.
- **Not yet verified in a real browser** — this container has no headless
  Chrome and the TopoJSON loads from a CDN. Needs a device/browser pass:
  load `/games/arcade`, play Find the State, confirm taps register, timer
  counts down, toasts fire, completion + medal show, share copies a seeded URL,
  and a `?seed=` link reproduces the run.

---

## Deliberately deferred (not in this MVP)

- **Sign-in cross-device score sync.** Anonymous localStorage only for now.
  Needs a `game_scores` Supabase table + the analytics rewire (the old project
  is dead). Pairs naturally with Phase 4's gallery schemas.
- **Hard landscape-required + rotate overlay.** Spec §2 wants Find the State
  landscape-required. MVP is playable in both orientations with a soft
  "best in landscape" hint banner in portrait. Promote to a blocking overlay
  (reuse the Create `#rotateOverlay` pattern) after device testing.
- **The other 17 Arcade games.** Manifest format is in place; they're tiles
  marked "Coming soon."
- **Global / friends leaderboards.** Spec defers to a later phase (moderation
  surface).
- **`onStateTap` engine unification.** See architecture note above.

---

## Next

Phase 3 (Distribution: `/embed/<hash>`, `/api/render` OG images, Devvit) or
Phase 4 (Gallery + more games) per the master roadmap §11. Each gets its own
spec → plan → build.
