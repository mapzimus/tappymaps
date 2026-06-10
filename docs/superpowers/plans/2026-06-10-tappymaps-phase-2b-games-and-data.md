# Phase 2b — Arcade v2, Data Maps expansion, Stat Duel, GeoDraft

**Date:** 2026-06-10 · **Branch:** `claude/tappymaps-setup-launch-ceiqp1` (extends the Phase 2 Arcade PR #1) · **Status:** BUILT, needs device verification

## Context

The first real-device test of Phase 2 Arcade surfaced gameplay problems ("the game doesn't play well"): the prompt was a small top-bar line, small states (Delaware, Rhode Island) were untappable without zoom, the map felt inert compared to Create mode, and the 10-distinct-states generator allowed elimination guessing. The same session set the next priorities: fix + expand the data maps (which were broken in production), reuse them across games, and ship GeoDraft.

Decisions made with Max via Q&A: Find the State gets BOTH a Classic and a Shuffle (repeats-possible) mode; GeoDraft ships the full Category Draft vs AI (not practice-only); everything lands on the one open branch/PR.

## What shipped (4 commits)

### 1. Find the State v2 (`feat(arcade)`)
- Center-screen prompt pop (`#arcadePromptPop`), taps pass through it.
- `makeMapZoom(wrapId, svgId)` — pinch/pan/wheel/buttons/double-tap, 1x–6x, shared by the Arcade and GeoDraft maps. preventDefault during pan suppresses synthetic clicks.
- Paint-as-you-play: correct finds keep a cycling bright inline fill for the run.
- Classic (10 distinct) + Shuffle (with replacement, no back-to-back) modes; `?mode=` rides share URLs; per-mode localStorage bests (classic keeps the legacy key); hub tile gets per-mode play buttons.

### 2. Data maps (`feat(data-maps)`)
- **Root cause of "data maps broken":** Census ended keyless API access; production `/api/census` 502s because `CENSUS_API_KEY` isn't active in the Production env. **User action:** set/verify the var in Vercel; it takes effect on the next deploy (merging this PR triggers one).
- 17 new datasets (22 → 39), every ACS variable verified against the live 2023 acs1 registry before inclusion.
- `fetchCensusData`: sessionStorage cache + actionable error messages; proxy accepts allowlisted `survey=acs1|acs5` for future county-level data.

### 3. Stat Duel (`feat(arcade)`) — "reuse the data maps in arcade mode"
- `kind:'duel'` game: two highlighted states, one `duel:true` stat, tap the higher one; reveals show real values. Seed picks dataset AND pairs; fails soft to the hub if census is down.

### 4. GeoDraft (`feat(geodraft)`)
- Category Draft vs the AI: Bo5, 3 picks/side alternating, 7s timer, hidden values, animated highest-to-lowest reveal, first to 3.
- 43 categories = 5 bundled static (area, statehood, borders, name length ×2 — playable with census fully down) + 38 from `DATA_MAP_DATASETS`.
- AI = true ranking + per-round gaussian noise scaled per category (the spec's "reputation model" MVP).
- Practice mode: ranked 50-state bar list per category. Seeded rematch share URLs.
- Territory Draft remains a "Coming soon" card (spec §7, Phase 6 async PvP).

## Architecture notes for the next session

- GeoDraft copies Arcade's isolation contract exactly: own SVG from `appState.topologyData`, zero contact with `#mapContainer` / `captureMapImage` / Block 1 (still byte-identical at 33,371 chars).
- **TDZ rule:** the games block evaluates before `fipsToState` / `nonColorable` / `DATA_MAP_DATASETS`. Lazy accessors only — a top-level read kills the whole main block at load and `node --check` can't catch it (this exact bug shipped once and produced the blank-map screenshot).
- All game logic was unit-tested in Node by extracting the real source blocks (perfect runs, seeded determinism, census-down paths, AI quality). What is NOT yet verified: real-browser rendering, touch gestures, layout at phone sizes.

## Verification checklist (device)

1. `/games/arcade` — tile shows Classic/Shuffle buttons; both run; prompt pops; pinch + buttons zoom; correct states stay painted; Shuffle repeats states.
2. `/games/arcade/stat-duel` — loads a stat, two states glow, others dim; values reveal on answer. (Needs `CENSUS_API_KEY` live, otherwise expect the soft-fail toast.)
3. `/design/make` — Data panel shows ~39 datasets; loading one colors the map + legend (key permitting).
4. `/games/draft` — hub cards; Category Draft full match vs AI incl. reveal animation + pips + final screen; Practice list renders; `?seed=` rematch reproduces categories.
