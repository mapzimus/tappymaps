# Handover — Playtest Follow-ups (open "bad" & "changeworthy" items)

**Created:** 2026-06-14 · **For:** a fresh session picking up the games polish.
**Source:** the four audits in `docs/playtests/` (`locate-games.md`,
`recall-games.md`, `duel-rank-games.md`, `geodraft-daily.md`). Read those for
the full reasoning + simulation tables; this doc is the actionable checklist.

The whole app is one file: `index.html`. Validate every JS edit with
`npm run validate`, then `npm run smoke` (boots every mode headless). The map
can't render in the sandbox (TopoJSON CDN blocked), so **map-tap feel needs a
preview play-test** — verify logic by simulation/unit tests, ship map-dependent
changes as "candidate, verify on preview." Grep anchors below use **function
names** (stable); ignore any line numbers in the source reports — they drifted
after the work below.

---

## ✅ Already shipped (PR #23 — do NOT redo)
- **GeoDraft [P0] first-pick lock** → difficulty is now structural: Easy=you-first,
  Hard=AI-first, Normal=seeded coin-flip/round (`draftRoundFirstPicker`). AI can win now.
- **GeoDraft share `&diff=`** → `draftShareMatch` carries difficulty.
- **Distance Duel area centroid** → `arcadeStateCentroids` now uses the polygon
  area-centroid of each state's largest landmass (Michigan no longer "in the lake").
- **Stat Duel ties** → `arcadePickPairs` rejects equal-value pairs.
- **Speed Run medals** → re-spaced to 500/1100/1600 (silver tier is now real).
- **Neighbor Challenge draw variance** → `arcadePickNeighborCenters` stratifies by
  border count (run total 22–49 → 32–36); gold no longer seed-dependent. *Note:* the
  report's alternative fixes (proportional timer, partial-completion bonus) are still open below.
- **Viewport cut-off** → `#modeArcade` + `#modeDraft` capped to `height:100dvh`.
- **XP/Levels + local Leaderboard** shipped (separate from the audit asks).

---

## 🎯 Suggested first batch (highest impact, mostly verifiable)
1. **Colorblind cue across all games** (recurring P2, flagged by every agent).
2. **Census static fallback** for Stat Duel + Rank It (P3, removes a dead-end).
3. **Soften the streak-reset cliff** in the locate games (P1, biggest "feels unfair").
4. **Alphabet singleton-letter fairness** (P2).
5. **GeoDraft Territory pick-timer + share button** (P1/P2, Territory can stall forever).
6. **Daily UTC-rollover surfacing + streak-at-risk nudge** (P1/P2).

---

## Cross-cutting (touches several games)

- **[P2] Colorblind: correct/wrong/reveal use red↔green only.** `arcade-state--reveal`/
  `--correct` are green, `--wrong` is red — the most common colorblind confusion, and
  the toast border/text reuse the pair. Add a non-color signal: a ✓/✗ glyph in the toast
  and a checkmark/outline-pattern overlay on the revealed state. **Anchors:** `.arcade-state--wrong`
  / `.arcade-state--reveal` CSS; toast text in `arcadeResolve`, `arcadeResolveNeighbors`,
  `arcadeRankTap`. *Affects all 8 Arcade games — do it once on the shared classes.*
- **[P3] Census hard-dependency dead-ends** Stat Duel + Rank It: any `/api/census` failure
  bounces to the hub. Add a **bundled static fallback stat** (land area / statehood year —
  already exists for GeoDraft) so an outage degrades to a playable round. **Anchor:** the
  `catch` in `arcadeStartRun`'s `duel || rank` branch.
- **[P3] Share copy is wrong/awkward.** `arcadeCopy` hardcodes "same 10 states" — wrong for
  Rank It (6 rounds) and the duels (matchups, not states). Make the copy line game-aware.
  **Anchor:** `arcadeCopy`.

## Find the State + Speed Run (locate)

- **[P1] Streak-reset cliff is brutal.** A miss zeroes the streak; one slip costs ~119 pts
  in Find the State (26% of max) and ~469 in Speed Run, so medals track finger-perfection
  over knowledge. Fix: drop streak by **half** instead of to 0 on a miss (`AG.streak = 0` →
  `Math.floor(AG.streak/2)`), and/or shift weight from streak to base. **Anchor:** the
  `AG.streak = 0` line in `arcadeResolve`; `scoring` blocks in `ARCADE_GAMES`.
- **[P1] The clock is a flat tax.** 8s (Find) is so generous that anyone who knows the state
  banks near-max time bonus → no speed skill. Tighten `perPrompt` or make `timeBonus`
  non-linear (only sub-3s earns near-max). **Anchor:** `perPrompt` in the manifest; `remainFrac`
  math in `arcadeResolve`.
- **[P1] Small-state dexterity (worst in Speed Run's 5s).** Auto-pan/zoom toward a small-area
  target's region as the prompt pops, and/or give small targets more time. **Anchor:**
  `arcadeNextPrompt` + `makeMapZoom`.
- **[P2] Speed Run: cut the run or add checkpoints.** 50 prompts at 5s with hard resets is a
  churn shape; novices finish a 4-min run with zero reward. Drop `runLength` 50→30 and/or add
  milestone toasts (10/25/40) + a partial-credit completion screen ("found 37/50"). **Anchors:**
  `runLength` in manifest; `arcadeComplete`; `arcadeUpdateHud`.
- **[P2] Surface the active mode + an "on pace" cue.** Add the mode label to the run HUD and a
  "Gold pace / Silver pace" tag from `score vs idx/runLength * threshold`. **Anchor:** `arcadeUpdateHud`.
- **[P2] Classic vs Shuffle is invisible.** Either make Shuffle visibly harder (weighted pool
  favoring small/obscure states) or retire it. **Anchor:** `arcadePickShuffle`, the `modes` block.
- **[P3] Speed Run replay hook** — promote the seeded share / daily framing on the completion card.
  **Anchor:** `arcadeShareUrl` + Speed Run completion.

## State Capitals + Alphabet Race + Neighbor Challenge (recall)

- **[P1] Alphabet prompt-pop clarity.** The big pop shows the bare letter (`popText = letter`),
  so a flashed "I" vs "1" or "U" vs "V" can be misread against the clock. Make it `Letter: I`
  (match the header's curly-quoted form). **Anchor:** the `kind === 'alpha'` branch in `arcadeNextPrompt`.
- **[P2] Alphabet singleton-letter unfairness.** 8 of 19 letters (D/F/G/H/L/P/R/U) have exactly
  one valid state — pinpoint-find rounds that pay the same 20 base as M/N (8 answers). Bias the
  letter draw toward multi-state letters, or bonus the singletons. **Anchor:** `arcadePickAlphabet`
  (filter/weight by `arcadeStatesByLetter(L).length`).
- **[P1] Neighbor proportional timer.** Fixed 14s ignores that an 8-border round needs ~18s and
  Maine's 1 border needs ~8s. Set a per-round time (e.g. `6 + total*1.5`) via an `AG.roundTime`
  read by `arcadeStartTimer`. **Anchors:** `arcadeStartTimer`, neighbors branch of `arcadeNextPrompt`.
- **[P2] Neighbor partial-completion bonus.** A failed round grants no completion/time even at
  7/8 found — score a fraction of completion scaled to `found/total`. **Anchor:** the else-branch
  of `arcadeResolveNeighbors`.
- **[P3] Capitals differentiation** — it's a Find-the-State reskin (same scoring template). Add an
  obscurity multiplier or a "name the capital" inverse `modes` variant; or drop `perPrompt` 9→7.
  **Anchor:** `ARCADE_GAMES['state-capitals']`.

## Stat Duel + Distance Duel + Rank It

- **[P2] Stat Duel: show the stat's one-line `desc`** under the prompt — players duel on stats they
  may not understand; the dataset object already has `desc`. **Anchor:** `kind === 'duel'` branch of
  `arcadeNextPrompt`.
- **[P2] Distance Duel reveal has no explanation.** It only says "X is closer to ANCHOR" — draw a
  faint anchor→contestant line or show "closer by ~N%" so a surprising answer is justified. **Anchor:**
  `isDistance` branch of `arcadeResolve`. *(Optional [P3]: tighten the accept filter 0.82→0.78 in
  `arcadePickDistanceRounds`.)*
- **[P2] Rank It timeout clarity.** A timeout with <4 placed shows a bare "0/4 placed · +0" that reads
  like a wrong answer — branch the toast on `AG.rankPicked.length < 4` ("Time! — 2/4 placed").
  **Anchor:** `arcadeResolveRank`. *([P3]: show each placed state's value on reveal, like Stat Duel.)*

## GeoDraft (Category + Territory)

- **[P2] Surface difficulty in-match.** The match screen never shows "Hard" — add a badge near
  `draftRoundLabel`. **Anchor:** `draftStartRound`.
- **[P3] Beatable AI strategy, not just noisy ranking.** The overrated/underrated bias is currently a
  one-way gift to the player. Turn it into real counterplay (AI over-values "famous" states; a sharp
  player snipes its blind spots). **Anchor:** `bias()` in `draftStartRound`.
- **[P1] Territory pick-timer + auto-pick.** Territory has no player timer (Category has 10s) — an idle
  player stalls forever. Mirror `draftStartPickTimer`. **Anchor:** `draftTerrSetTurn`.
- **[P1] Territory mid-game tension.** 50 blind alternating taps with no win signal. Tease a hidden
  category after pick ~25, or show a vague "your territory leans big/coastal" meter. **Anchors:**
  `draftTerrSetTurn`, `draftTerrCommit`.
- **[P2] Territory share/rematch button** that emits `?seed=` (+ `&diff=`) — only Category Draft has one.
  **Anchor:** `draftWireButtons` (add `draftTerrShareBtn`).
- **[P2] Territory tie handling.** An exact-tie category awards no point and isn't explained when
  `youCatWins + aiCatWins < 3`. Label it in the result copy. **Anchor:** `draftTerrRevealNext`.
- **[P2] Speed up the Territory back half** — shorten AI delay after pick ~15, or an "auto-draft
  remaining" option. **Anchor:** `draftTerrSetTurn` (AI `setTimeout`).

## Daily Challenge (streak math is verified correct — 16/16)

- **[P1] UTC rollover surprises US players.** The day flips at UTC midnight (7–8pm ET / 4–5pm PT), so an
  evening player is already on "tomorrow's" puzzle. At minimum show "Daily resets at <local time>";
  ideally consider a local-day rollover. **Anchor:** `arcadeDailyKey` (uses `getUTC*`).
- **[P2] Streak-at-risk nudge.** When `arcadeDailyPlayedToday()` is false and a streak exists, render
  "🔥 N — play today to keep it." **Anchor:** `arcadeRenderDaily`.
- **[P2] Anti-repeat the daily game** — pure hash can stack the same game up to 4 days; re-hash if equal
  to yesterday's id to cap at ~2. **Anchor:** `arcadeDailyGameId`.
- **[P3] One-day streak-freeze** (auto-consumed grace for a single miss) to soften churn (cf.
  Wordle/Duolingo). **Anchor:** `arcadeDailyStreak` / `arcadeRecordDaily`.

---

## Bigger separate tracks (own spec, not quick fixes)
- **Global leaderboard** — needs a validated backend (client-scored games make POSTed scores forgeable;
  re-simulate the seeded run server-side). See `docs/specs/2026-06-13-progression-and-leaderboard.md`.
- **Cross-device sync** for streaks/XP/scores (Supabase `game_scores` + the auth that already exists).
