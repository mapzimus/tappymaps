# Progression: XP/Levels + Leaderboard — Design

**Date:** 2026-06-13 · **Status:** design (implementing after the playtest reports land)
**Context:** Max asked for a leaderboard + a leveling system + "tighten up every game."
This doc covers the two new meta-systems; the game-tightening work is driven by
`docs/playtests/*.md`.

## Guiding constraints
- **No build step, single file.** All client-side, localStorage-first. TDZ-safe
  (lazy accessors only inside the Arcade block).
- **Must validate + smoke clean.** Pure logic is fully unit-testable headless
  even though the maps can't render in the sandbox.
- **Isolation:** progression is a thin meta-layer over the existing
  `arcadeComplete` / GeoDraft completion hooks. It must not touch the
  export-critical `#mapContainer` / `captureMapImage` path or Block 1.

## 1 · XP + Levels

### Earning XP (every game feeds one pool)
`tappymaps_xp` = cumulative integer in localStorage.
- **Arcade run:** `xp = round(score / 8) + correct * 3 + medalBonus` where
  medalBonus = {gold 60, silver 35, bronze 18, none 5}.
- **Daily Challenge:** +40 flat bonus on completion (on top of the run XP) — the
  daily should be the single best XP source to reward the habit.
- **GeoDraft:** match win +70, loss +25, Territory win +90, loss +30 (drafts are
  longer, worth more).
- XP is awarded once per completion; replays still earn (practice is fine — XP is
  a participation/skill reward, not a scarce resource).

### Level curve
Cumulative XP to *reach* level L: `xpToReach(L) = 60 * (L-1) * L / 2` (triangular).
- L2 = 60, L3 = 180, L4 = 360, L5 = 600, L10 = 2700, L20 = 11400.
- `levelForXp(xp)` = largest L with xpToReach(L) ≤ xp.
- Progress to next = (xp − xpToReach(L)) / (xpToReach(L+1) − xpToReach(L)).

### Titles (level bands)
1–4 **Explorer** · 5–9 **Navigator** · 10–19 **Cartographer** · 20–34 **Geographer** · 35+ **Atlas**.

### Surfacing
- Arcade hub: a compact **level chip** (Lvl N · Title) with an XP progress bar,
  top-right of the hub header.
- **Level-up moment:** when a run crosses a threshold, the completion screen adds
  a "Level up! → Lvl N Title" line + `SFX.best()` + a confetti burst + `Haptic.win()`.
- Persisted, device-local (global sync is a later Supabase increment).

### Test plan (headless)
`levelForXp` / `xpToReach` monotonic + inverse-consistent; XP award formula for
sample runs; level-up detection across a threshold; title bands.

## 2 · Leaderboard

### MVP: local per-game boards (this increment)
`tappymaps_leaderboard` = `{ [gameId+mode]: [{name, score, medal, date}] }`, top 10
each, sorted desc, de-duped sensibly.
- On `arcadeComplete`, if the score makes the top 10 for that game/mode, capture a
  **name** (saved once in `tappymaps_player_name`, default "YOU", editable) and
  insert. No prompt-spam: name is asked once, reused after.
- **Leaderboard view** at `/games/arcade/leaderboard`: a tabbed board (one tab per
  game) showing rank · name · score · medal, plus your best highlighted. An
  **Overall** tab ranks nothing cross-user yet — instead shows your Level + total
  XP + per-game medals earned (a personal "trophy case").
- Hub: a **Leaderboard** entry (button in the hub footer or a card).

### Why local first (and the global caveat)
A *global* leaderboard is the obvious want, but these games are **client-scored**,
so any score POSTed to a server is trivially forgeable — a naive global board
would fill with cheated 999999s on day one. A credible global board needs either
(a) server-side run validation (replay the seed + the tap log) or (b) accept-and-
moderate with rate limits. That's a real backend project (Supabase `game_scores`
table + an edge function that re-simulates the seeded run to validate the score,
+ the existing auth). **Recommended sequencing:** ship the local board now (real
value, zero risk), then do the global board as its own spec once we decide on the
anti-cheat approach. Flag this to Max as a decision.

### Test plan (headless)
Insert/sort/cap-at-10 logic; top-10 qualification; name persistence; de-dup;
per-game+mode keying (Shuffle vs Classic separate, mirroring the best-score keys).

## 3 · "Other improvements that come to mind" (candidates, pending playtest)
- **Medal-progress on the completion screen** ("120 to Silver") — cheap motivation.
- **First-win-of-the-day bonus** beyond the daily (small XP nudge to play breadth).
- **Per-game "new best" flourish** already exists; extend to "new #1 on your board".
- Tightening items will be appended from `docs/playtests/*.md` once the agents
  report (medal re-tuning, data-integrity fixes, fairness filters, etc.).

## Rollout
1. Playtest reports (agents) → triage P0/P1 fixes.
2. Implement XP/Levels (engine + hub chip + level-up moment) — fully tested.
3. Implement local Leaderboard (storage + view + route + name entry) — fully tested.
4. Apply the P0/P1 game-tightening fixes from the reports.
5. validate + smoke; ship (likely 2 PRs: progression, then tightening).
