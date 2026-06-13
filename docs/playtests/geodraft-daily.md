# Playtest + Design Audit — GeoDraft & Daily Challenge

**Date:** 2026-06-13 · **Method:** code audit + Node simulation (no browser — CDN map + Census API are blocked in this sandbox). Sims replicate the exact in-file RNG (`arcadeMakeRng`/`arcadeHashSeed`), AI ordering (`draftStartRound`/`draftTerrStart`), reveal scoring (`draftRevealRound`/`draftTerrRevealNext`), and the streak state machine (`arcadeRecordDaily`/`arcadeDailyStreak`). Static category data was extracted live from `index.html`. Census categories are unreachable here, so AI/balance sims run on the 12 static categories — which is exactly the fallback set that loads when `/api/census` is down, and is representative.

Severity: **[P0]** broken/unfair · **[P1]** hurts core feel · **[P2]** polish · **[P3]** nice-to-have.

---

## GeoDraft — Category Draft

Best-of-5 vs the AI. Each round: a category flashes, both sides alternately draft **3 states** (you pick first), totals are revealed, higher total takes the round (lower if `inverted`). First to 3 round-wins takes the match.

### AI win-rate by difficulty (simulation, N=20,000 seeds/cell, static categories)

**A player who simply takes the best available state each turn wins 100% at every difficulty:**

| Player model | Easy (AI win%) | Normal (AI win%) | Hard (AI win%) |
|---|---|---|---|
| Optimal (greedy best-available) | **0.0%** | **0.0%** | **0.0%** |
| "Good" (80% best, 20% 2nd-best slip) | 0.0% | 0.0% | 0.4% |
| Random | 99.5% | 99.9% | 100.0% |

Against a **human with imperfect knowledge** (gaussian rank-noise `humanErr`; ~2–4 = sharp human, ~8 = casual, ~15 = guessing) the difficulty knobs only bite once the player is fairly sloppy:

| humanErr | Easy AI% | Normal AI% | Hard AI% |
|---|---|---|---|
| 2 (sharp) | 0.0 | 0.0 | 0.0 |
| 4 | 0.1 | 0.3 | 2.0 |
| 6 | 0.4 | 1.9 | 10.5 |
| 8 (casual) | 1.3 | 6.2 | 24.8 |
| 12 | 6.3 | 21.1 | 53.5 |
| 18 (guessing) | 19.9 | 46.5 | 78.5 |

**Root cause — structural first-pick lock.** Because you pick first and selection alternates, an optimal player drafts true-ranks **{1, 3, 5}** while the AI gets at best **{2, 4, 6}**. {1,3,5} beats {2,4,6} in essentially every real category (verified perfect-vs-perfect: 10/11 static categories are YOU-wins, 1 tie, 0 AI-wins). **The AI can never win a round it plays optimally — it only ever wins when the player picks below the best available state.** Difficulty (`draftApplyDifficulty`) tunes how harshly the AI punishes *your* mistakes; it cannot make a skilled player lose. This is why Easy/Normal/Hard are indistinguishable for anyone who can rank the obvious categories (area, electoral votes, counties).

### Good
- **Seed determinism is solid.** A `?seed=` reproduces the exact category draw, independent of difficulty (categories are drawn from RNG before any difficulty math). Confirmed: same seed → identical 5 categories every time. Anchor: `draftStartMatch`.
- **Tiering is robust and never fails.** Rounds 1–2 draw big-pool common categories, rounds 3–5 draw scarce/obscure ones. Simulated with census ON (9 tier1-eligible static + 41 tier2): **0 / 50,000 matches** underfilled tier1; with static-only, **0 / 5,000** produced <5 categories. The `chosen.length < 5` guard + hub fallback covers the impossible case gracefully. Anchor: `draftStartMatch` (`tier1`/`tier2`/`take`).
- **Reveal drama is well-built** — highest-to-lowest pick reveal with a live ticking scoreline, per-pick bump, verdict line, accelerating pacing (`240 + i*90`ms). Good reward feel. Anchor: `draftRevealRound`.
- **AI is deterministic per seed** (gaussian noise pulls from the seeded `DG.rng`), so a shared match is genuinely the same match. Anchor: `draftStartRound`.
- **Fail-soft**: if category data is unavailable, it shows a message and returns to the hub rather than dead-ending. Anchor: `draftStartMatch`.

### Bad
- **[P0] Difficulty is cosmetic for a competent player.** Easy/Normal/Hard all yield 0% AI win-rate vs optimal play and are nearly identical (0–2% AI) for a sharp human. A "Hard" button that a focused player beats 100% of the time mis-sells the mode and kills replay value for anyone who learns the categories. Anchor: `draftApplyDifficulty`, `draftStartRound` (the `i + gauss()*... + bias()` ordering).
- **[P1] The AI never gets first-pick parity.** The player always drafts first in every round, compounding the {1,3,5} vs {2,4,6} lock. There's no "AI picks first" alternation across rounds. Anchor: `draftStartRound` → `draftSetTurn('you')`.
- **[P1] Shared matches replay at the *recipient's* difficulty.** `draftShareMatch` only puts `?seed=` in the URL, never `&diff=`. Two people "playing the same match" can face different AIs, and the leaderboard-style brag ("I beat the AI 3-0") is meaningless if the AI difficulty differs. Anchor: `draftShareMatch`.
- **[P2] The overrated/underrated bias is a one-way gift to the player.** `DRAFT_AI_OVERRATED`/`DRAFT_AI_UNDERRATED` only ever make the AI pick *worse*. It's flavor, but it never creates an interesting trap (e.g. a category where overrating Texas is actually correct), so it just widens the player's edge. Anchor: `bias()` in `draftStartRound`.

### Changeworthy
- **[P0] Break the first-pick lock.** Pick one: (a) **snake draft** — alternate who picks first each round (`you, ai, you, ai, you` → round-1 you-first, round-2 ai-first…); or (b) give the AI a **pick-count or pick-order edge on Hard** (AI drafts first, or drafts 4 to your 3 on the deciding round). Either makes Hard genuinely losable. Anchor: `draftStartRound`/`draftSetTurn`.
- **[P1] Make difficulty change *structure*, not just noise.** Today Easy vs Hard only scales `noiseMul`/`biasMag`, which a good player is immune to. Have Hard flip first-pick to the AI (or shorten your pick timer, or hide one category until reveal). Anchor: `draftApplyDifficulty`.
- **[P1] Carry difficulty in the share URL.** Append `&diff=` in `draftShareMatch` and read it in `Modes.Draft.enter` (it already reads `?diff` via `draftApplyDifficulty`'s URLSearchParams, so just emit it). Anchor: `draftShareMatch`, `draftApplyDifficulty`.
- **[P2] Surface difficulty in-match.** The chosen level lives only on a hub chip; the match screen never shows "Hard." Add a small badge near `draftRoundLabel` so the player knows what they're beating. Anchor: `draftStartRound` (`draftSet('draftRoundLabel', …)`).
- **[P3] Give the AI a beatable *strategy*, not just noisy ranking** — e.g. it values "famous" states, which a sharp player exploits by sniping its blind-spot states first. That turns the overrated/underrated flavor into real counterplay. Anchor: `bias()`.

---

## GeoDraft — Territory Draft

Claim all 50 states (25 each, you first), then **3 hidden categories** score your half vs the AI's at the end; most category-wins takes the map.

### AI competitiveness (simulation, N=20,000 seeds/cell, full-pool static categories only)

Territory is **far better balanced** than Category Draft — the first-pick advantage is diluted across 25 picks and 3 hidden categories, and the player is drafting *blind* (you can't see which 3 categories will score):

| humanErr | Easy AI% | Normal AI% | Hard AI% |
|---|---|---|---|
| 0 (impossible perfect) | 4.4 | 11.4 | 21.4 |
| 8 | 4.8 | 13.8 | 26.6 |
| 15 (realistic blind) | 6.6 | 19.6 | 39.5 |
| 25 (pure guess) | 12.1 | 35.3 | **58.2** |

Realistic blind play (humanErr 15–25, since the categories are hidden) lands Normal near 60–80% you / Hard near a coin-flip-to-AI-favored. **The difficulty knobs work meaningfully here.** The same `draftApplyDifficulty()` globals (`DG.noiseMul`/`DG.biasMag`) are correctly reused by Territory's AI ordering (`DT` reads `DG.*` — intentional, not a bug).

### Good
- **Genuinely strategic and well-balanced.** Hidden categories + diluted first-pick make this the stronger of the two modes. An expert wins ~75–95%, a blind player is near 50/50 on Normal — a healthy curve.
- **Pool guard is correct**: territory requires `pool >= 48`, so only near-full categories score (no incoherent scarce-category territory). Anchor: `draftTerrStart`.
- **First-play how-to** gates the first match and persists `tappymaps_terr_seen`. Good onboarding. Anchor: `draftTerrStart` / `draftTerrHowtoClose`.
- **Reveal pacing** reveals each hidden category in sequence with a delayed final score — appropriate suspense for a 50-pick payoff. Anchor: `draftTerrRevealNext`.

### Bad
- **[P1] 50 alternating taps is long with thin feedback.** AI picks take `400 + rng*400`ms each (up to ~0.8s) × 25 = up to ~20s of waiting interleaved with your 25 taps, and during the draft you have **no idea if you're winning** (categories hidden) — so the mid-game has low engagement. Anchor: `draftTerrSetTurn` (AI delay), `draftTerrCommit`.
- **[P2] No timeout/auto-pick on the player's turn.** Unlike Category Draft (10s timer → random pick), Territory has no pick timer — an idle player just stalls forever. Not a crash, but a soft dead-end and inconsistent with the other mode. Anchor: `draftTerrSetTurn` (no `draftStartPickTimer` equivalent).
- **[P2] Tie handling in reveal is silently dropped.** `draftTerrRevealNext` only increments on strict `>`/`<`; an exact-tie category awards no point to either side but isn't labeled distinctly in the running total (the row shows "Tie" but the final `youCatWins + aiCatWins` can be < 3, which the result copy doesn't explain). Anchor: `draftTerrRevealNext`.
- **[P2] No seed in the share path for Territory.** `Modes.Draft.enter` reads `?seed=` for territory, but there's no territory share button that *emits* one (only Category Draft has `draftShareMatch`). Replay/brag loop is missing. Anchor: `Modes.Draft` (territory branch) vs `draftWireButtons` (no `draftTerrShareBtn`).

### Changeworthy
- **[P1] Add a live "projected lead" or hint during the draft** — e.g. tease one of the 3 hidden categories after pick 25, or show a vague "your territory leans big/coastal" meter, so the back half has tension. Anchor: `draftTerrSetTurn`/`draftTerrCommit`.
- **[P1] Add a player pick timer + auto-pick** mirroring Category Draft's 10s `draftStartPickTimer`, so the mode can't stall. Anchor: `draftTerrSetTurn`.
- **[P2] Speed up the back half.** Once one side's strategy is locked, let the player "auto-draft remaining" or shorten AI delay after pick ~15. Anchor: `draftTerrSetTurn` (AI `setTimeout` delay).
- **[P2] Add a Territory share/rematch button** that emits `?seed=` (+ `&diff=`). Anchor: `draftWireButtons`.

---

## Daily Challenge

One shared puzzle per **UTC** day (deterministic game + seed everyone gets), plus a localStorage play streak. Pool excludes the two Census-dependent games so the daily can never fail on a data outage.

### Streak state-machine test results (Node sim driving the real functions) — **16 / 16 PASS**

| Test | Result |
|---|---|
| Consecutive days build streak (1→2→3) | PASS |
| Same-day replay does NOT double-count (streak stays 1) | PASS |
| Same-day replay keeps `bestScore = max` | PASS |
| 1-day gap resets streak to 1 | PASS |
| Streak stays "alive" when queried the day after last play | PASS |
| Streak shows 0 when queried 2+ days after last play | PASS |
| Month boundary 6/30 → 7/1 continues | PASS |
| Year boundary 12/31 → 1/1 continues | PASS |
| Leap day 2/28 → 2/29 → 3/1 (2028) continues | PASS |
| Non-leap 2/28 → 3/1 (2026) continues | PASS |
| 60 consecutive days = streak 60 | PASS |
| DST spring-forward (2026-03-08 → 03-09) continues | PASS |
| After 2-day gap, replay restarts at 1 (does not resume) | PASS |

**The streak math is correct.** `arcadeIsYesterday` uses UTC midnight epoch arithmetic (`(t - p) === 86400000`), which is immune to DST and local-clock drift; month/year/leap rollovers all work because `Date.UTC` handles them natively.

### Daily game distribution (365 days of 2026)

| Game | Days | % |
|---|---|---|
| find-state | 53 | 14.5 |
| state-capitals | 71 | 19.5 |
| neighbor-challenge | 59 | 16.2 |
| speed-run | 56 | 15.3 |
| alphabet-race | 66 | 18.1 |
| distance-duel | 60 | 16.4 |

All ids in-pool (0 out-of-pool), reasonable spread (mean 16.7%, range 14.5–19.5%). **Longest same-game run: 4 consecutive days.**

### Good
- **Streak state machine is correct and timezone-safe** (16/16). The all-UTC design is the right call — no DST/leap/rollover bugs. Anchor: `arcadeIsYesterday`, `arcadeRecordDaily`, `arcadeDailyStreak`.
- **Daily can't fail on a data outage** — pool deliberately excludes Census-dependent games (Stat Duel, data maps). Smart resilience choice. Anchor: `ARCADE_DAILY_POOL`.
- **Deterministic "everyone gets the same puzzle"** via `arcadeDailyGameId` + `arcadeDailySeed` (both keyed on the UTC date string). Genuinely shared. Anchor: `arcadeDailyGameId`/`arcadeDailySeed`.
- **Good retention copy** — 🔥 streak label, "everyone gets the same puzzle today," replay-allowed-but-no-double-count. Anchor: `arcadeRenderDaily`.

### Bad
- **[P1] UTC day means the puzzle "rolls over" mid-evening for US players.** The day boundary is UTC midnight = 7–8pm Eastern / 4–5pm Pacific. A US player who plays after dinner is already on "tomorrow's" puzzle, and a streak built on evening play can silently skip a calendar day from the player's perspective. No bug in the math, but it's a UX/retention footgun for a US-centric app. Anchor: `arcadeDailyKey` (uses `getUTC*`).
- **[P2] Streak survival isn't surfaced as urgency.** `arcadeDailyStreak` correctly keeps the streak "alive" through the day after last play, but the UI never warns "play today or lose your 🔥 N streak." The retention hook is computed but not pushed. Anchor: `arcadeRenderDaily`.
- **[P2] Distribution can stack the same game 4 days running.** Not wrong, but 4 consecutive identical dailies hurts the "fresh every day" promise. Anchor: `arcadeDailyGameId` (pure hash, no anti-repeat).
- **[P3] No "missed yesterday" grace / streak-freeze.** A single missed UTC day hard-resets to 1 with no recovery, which is harsh for a casual daily and a known churn driver (cf. Wordle/Duolingo freeze mechanics). Anchor: `arcadeDailyStreak`/`arcadeRecordDaily`.
- **[P3] Streak/record is localStorage-only** — clears on cache wipe, doesn't sync across devices (noted as deferred in CLAUDE.md). Anchor: `arcadeGetDailyRecord`.

### Changeworthy
- **[P1] Consider a local-day (or configurable) rollover**, or at minimum show the player the rollover time so the "you're already on tomorrow" surprise is explained. If keeping UTC, add a "Daily resets at <local time>" line. Anchor: `arcadeDailyKey`.
- **[P2] Add a streak-at-risk nudge** in `arcadeRenderDaily`: when `arcadeDailyPlayedToday()` is false and a streak exists, show "🔥 N — play today to keep it." Anchor: `arcadeRenderDaily`.
- **[P2] Add a light anti-repeat** to `arcadeDailyGameId` (e.g. re-hash if equal to yesterday's id) to cap same-game runs at ~2. Anchor: `arcadeDailyGameId`.
- **[P3] Add a one-day streak-freeze** (auto-consumed grace for a single miss) to soften churn. Anchor: `arcadeDailyStreak`/`arcadeRecordDaily`.

---

## Top 3 fixes overall

1. **[P0] Break Category Draft's first-pick lock.** A skilled player beats the AI **100% at every difficulty** because drafting first + alternating guarantees true-ranks {1,3,5} vs the AI's {2,4,6}, which wins ~every category. Make difficulty change *structure* — snake the first pick across rounds, or give the AI first pick / an extra pick on Hard. Without this, the difficulty selector is decoration. Anchors: `draftStartRound`, `draftSetTurn`, `draftApplyDifficulty`.
2. **[P1] Carry difficulty in shared/seeded matches** (`draftShareMatch` emits only `?seed=`, never `&diff=`), so "the same match" actually is the same match — and add a Territory share button + player pick-timer (Territory can stall forever and has no rematch loop). Anchors: `draftShareMatch`, `draftWireButtons`, `draftTerrSetTurn`.
3. **[P1] Address the UTC daily rollover + add a streak-at-risk nudge.** The streak math is flawless (16/16), but the UTC day boundary lands at US evening — players unknowingly play "tomorrow's" puzzle — and the UI never warns that a streak is about to break. Show the local reset time and a "play today to keep your 🔥" prompt. Anchors: `arcadeDailyKey`, `arcadeRenderDaily`.
