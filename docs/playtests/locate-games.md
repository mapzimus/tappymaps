# Playtest + Design Audit — Locate & Tap games

**Scope:** Find the State (`find-state`, Classic + Shuffle) and Speed Run (`speed-run`).
**Method:** code audit of the Arcade engine in `index.html` (anchors below) + a 4,000-run-per-tier
Monte-Carlo balance simulation transcribing the real scoring from `arcadeResolve` /
`arcadeStartTimer` / `arcadeMedalFor`. Maps don't render headless in the sandbox (TopoJSON CDN
blocked), so this is a simulation+audit rather than a live browser playthrough — which is the more
rigorous tool for balance anyway.

Engine anchors: `const ARCADE_GAMES` (5428), `arcadePickStates` (5633), `arcadePickShuffle` (5712),
`arcadeResolve` (6417), `arcadeStartTimer` (6261), `arcadeMedalFor` (6522), `arcadeNextPrompt` (6189),
`arcadeStartRun` (6124), `ARCADE_HOWTO` (5532), `arcadeStateNames` (5607, = 50 states; only DC is
`nonColorable`).

Shared scoring shape (both games): on a correct tap
`gained = base + round(remainFrac * timeBonusMax) + streakBonus`, where
`streakBonus = streak >= threshold ? min(cap, (streak - threshold + 1) * step) : 0`, and **any miss
(wrong tap or timeout) resets `streak` to 0 and scores 0 for that prompt.**

---

## Find the State

`runLength 10`, `perPrompt 8s`, `scoring {base 20, timeBonusMax 15, streakThreshold 3, streakStep 4,
streakCap 20}`, `medals {bronze 150, silver 280, gold 400}`. Classic = 10 distinct states
(`arcadePickStates`), Shuffle = 10 sampled with replacement, no immediate repeat (`arcadePickShuffle`).

### Simulation results

Tiers: Perfect 100% correct / 100% time bonus; Expert 95% / ~70%; Average 75% / ~40%; Novice 50% / ~15%.
Theoretical max = **470**.

| Tier    | Mean score | Median | Mean correct | Medal earned (modal) | Medal distribution |
|---------|-----------:|-------:|-------------:|----------------------|--------------------|
| Perfect |        470 |    470 |      10.0/10 | **Gold**             | gold 100%          |
| Expert  |        384 |    419 |       9.5/10 | **Gold**             | gold 59% · silver 35% · bronze 6% |
| Average |        228 |    222 |       7.5/10 | **Bronze**           | silver 20% · bronze 71% · none 9% |
| Novice  |        119 |    114 |       5.0/10 | **none**             | bronze 20% · none 79% |

Maps sensibly overall: Average → bronze/silver, Expert → gold-leaning, Novice → mostly no medal.
The thresholds themselves are well-placed. The problem is upstream of the thresholds — see Bad.

### Good
- **Thresholds are well-calibrated to skill.** Bronze (150) ≈ a competent-but-imperfect run, gold (400)
  demands near-perfection (85% of max). No medal is trivial or unreachable; the band fits a 10-prompt run.
- **Tight, layered feedback loop.** `arcadeResolve` paints the state with a cycling color
  (`ARCADE_PAINT_COLORS`), flashes a toast with the delta and streak emoji, plays a pitch-climbing SFX
  (`SFX.streak`/`SFX.correct`), and on a miss reveals the true target (`--reveal`) plus the wrong tap
  (`--wrong`). The map literally fills with color as you play — strong reward feel.
- **Prompt clarity is excellent.** Big center-screen `arcadePromptPop` of the state name +
  the `Find: X` line, with `pointer-events:none` so fast taps pass through (deliberate, see CSS 2702).
- **Zoom exists and is signposted.** `makeMapZoom` + the howto explicitly tells players to pinch/`+/−`
  for small states, partially mitigating the tiny-northeast fairness issue.
- **Seeded + shareable.** `?seed=` reproduces the exact run; `arcadeShareUrl` builds a clean share link.
- **Two real modes** with separate best-score keys (`arcadeBestKey` suffixes non-classic), so Shuffle
  doesn't overwrite Classic bests.

### Bad
- **The streak system, not knowledge, dominates the score, and one miss is brutal.** Of the 470-point
  max, **120 points (26%) are pure streak bonus**, and the streak caps at +20 from prompt 7 onward
  (verified: per-prompt streak bonus series is `0,0,4,8,12,16,20,20,20,20`). A **single miss at prompt 5
  costs 119 points** — a quarter of the whole run — because it both zeroes that prompt and resets the
  streak ramp. That's why Average (75% correct, 7.5/10) tops out at bronze and effectively can't reach
  gold: the medal is gated on *not missing* far more than on *knowing states*. It punishes a fat-finger
  tap on Rhode Island as if it were ignorance.
- **Time-bonus rounding makes the clock nearly free.** `perPrompt` is 8s; a confident player answers in
  ~1.5s and banks essentially the full `timeBonusMax`. The 8s window is so generous that the "beat the
  clock" framing barely bites for anyone who knows the state — the timer only matters as a miss trigger,
  not as a speed incentive. (`arcadeStartTimer`, `remainFrac` in `arcadeResolve`.)
- **Classic vs Shuffle is an invisible distinction.** Both are "10 states." Classic guarantees 10
  *distinct* states; Shuffle samples with replacement. But nothing on the run screen tells you which
  mode you're in, and for a 10-of-50 draw the practical difference (a state repeating) is rare and, when
  it happens, feels like a glitch rather than a feature. The mode toggle adds menu friction for little
  perceived payoff.
- **Tiny-northeast fairness is only half-solved.** Zoom helps, but the run *starts zoomed out*, the
  timer is already running when the pop fades, and there's no auto-pan toward the answer region. A
  novice who knows where Rhode Island *is* can still miss it for being a 6px target before they finish a
  pinch gesture.
- **No mid-run momentum readout beyond the streak number.** The HUD shows score/streak/progress but
  there's no "on pace for gold" signal, so the medal lands as a surprise at the end rather than as a
  goal you're visibly chasing.

### Changeworthy
- **[P1] Soften the streak-reset cliff.** Either (a) cap the per-miss streak loss (drop streak by half,
  not to 0) or (b) rebalance so base/time carry more of the score and streak less. Concretely: bump
  `base` 20→24 and drop `streakStep` 4→3 / `streakCap` 20→12 in `ARCADE_GAMES['find-state'].scoring`,
  so a clean run still ~470 but a single miss costs ~80 not ~119. Touches `ARCADE_GAMES` (5436) +
  re-tune `medals` accordingly. *Why:* makes the medal track knowledge, not finger-perfection.
- **[P1] Make the clock actually reward speed — tighten or curve it.** Drop `perPrompt` 8→6, or make
  `timeBonus` non-linear so only sub-3s answers earn near-max. Touches `perPrompt` (5435) and/or the
  `remainFrac` math in `arcadeResolve` (6454). *Why:* the 8s window makes time bonus a flat tax everyone
  who knows the state passes — there's no speed skill expressed.
- **[P2] Surface the active mode + a one-line "on pace" cue.** Add the mode label to the run HUD
  (`arcadeUpdateHud`, 6113) and a small "Gold pace" / "Silver pace" tag derived from
  `score vs idx/runLength * medalThreshold`. *Why:* gives the medal something to chase mid-run and makes
  Classic/Shuffle legible.
- **[P2] Differentiate Shuffle so it earns its menu slot, or fold it in.** Either make Shuffle visibly
  harder (sample from a *weighted* pool favoring small/obscure states) or retire it and make the single
  mode "10 distinct states." Touches `arcadePickShuffle` (5712) + the `modes` block (5442). *Why:* right
  now Shuffle is a near-invisible variant that mostly just splits best-scores across two keys.
- **[P2] Colorblind reliance on red/green for correct/wrong.** `--correct`/`--reveal` are green
  (`#22c55e`), `--wrong` is red (`#ef4444`) — the single most common colorblind confusion, and the toast
  border/text use the same pair (CSS 2772–2774, 2831–2832). Add a non-color signal: a ✓/✗ glyph in the
  toast and a stroke-pattern or checkmark overlay on the revealed state. Touches the toast text in
  `arcadeResolve` (6474/6495) + `.arcade-state--wrong/--reveal` CSS. *Why:* ~8% of men can't tell the
  current feedback states apart.
- **[P3] Auto-frame small targets.** When the prompt is a small-area state, gently zoom/pan toward its
  region as the pop appears. Touches `arcadeNextPrompt` (6189) + `makeMapZoom`. *Why:* removes the
  "I knew it but couldn't tap it in time" frustration the howto only paves over.

---

## Speed Run

`runLength 50`, `perPrompt 5s`, `scoring {base 10, timeBonusMax 12, streakThreshold 5, streakStep 3,
streakCap 40}`, `medals {bronze 500, silver 850, gold 1150}`. One long run over all 50 distinct states
(`arcadePickStates(50)`).

### Simulation results

Same tier definitions. Theoretical max = **2693**.

| Tier    | Mean score | Median | Mean correct | Medal earned (modal) | Medal distribution |
|---------|-----------:|-------:|-------------:|----------------------|--------------------|
| Perfect |       2693 |   2693 |      50.0/50 | **Gold**             | gold 100%          |
| Expert  |       1807 |   1781 |      47.5/50 | **Gold**             | gold 97% · silver 3% |
| Average |        673 |    643 |      37.5/50 | **Bronze**           | gold 1% · silver 10% · bronze 83% · none 6% |
| Novice  |        304 |    301 |      25.0/50 | **none**             | none 100%          |

### Good
- **The personal-best chase is the right frame for a 50-prompt grind.** Best-score persistence
  (`arcadeBestKey`/`arcadeGetBest`) + confetti on a new best (`arcadeComplete`, 6536–6549) gives a clear
  "beat yourself" loop, which suits a long single run better than a pass/fail.
- **Streak math is well-tuned to the long format.** Threshold 5 / step 3 / cap 40 means the streak
  bonus ramps from prompt 5 and caps at prompt 18 (verified), so it rewards sustained accuracy across
  the back half without exploding early. Streak points total 1593 of the 2693 max — the run *is* the
  streak, appropriately.
- **Medal spread is mostly sensible at the low/mid end.** Novice never medals (correct — 25/50 is a
  coin-flip), Average lands bronze, and bronze (500) is a fair "you finished and knew most of them" bar.
- **No data dependency / fully offline.** Unlike Stat Duel/Rank It, Speed Run uses only the cached
  topology, so it always works and never fails soft to the hub (`arcadeStartRun`'s non-duel branch).

### Bad
- **Silver is a dead tier — the Expert→gold cliff is too sharp.** Expert earns gold **97%** of the time
  and silver only **3%**; Average earns silver **10%**. So the entire silver band (850–1150) is a
  near-empty no-man's-land that almost no realistic player lands in. The curve jumps from "bronze
  (Average)" straight to "gold (Expert)," making silver vestigial. Gold at 1150 is also *easy for anyone
  who actually knows the 50 states* — 47.5/50 at modest speed clears it — so gold doesn't feel earned at
  the top.
- **5s × 50 with a hard streak-reset is genuinely brutal for the target audience.** 5 seconds includes
  reading the pop, locating the state, and *possibly pinch-zooming a 6px northeastern state* — and a
  single timeout resets a streak that's worth up to +40/prompt. One miss at prompt 25 costs **469 points**
  (verified). For a casual, playful brand (per CLAUDE.md), a 50-state gauntlet with a punishing clock is
  a churn risk: novices (25/50, zero medals, 100% of the time) get *no* reward signal for a ~4-minute run.
- **No checkpointing / no partial-run reward.** It's all-or-nothing across 50 prompts; there's no
  "you've found 30, keep going" milestone and no way to bail gracefully with credit. Long runs without
  intermediate payoffs are the classic drop-off shape.
- **Tiny-state fairness is materially worse here than in Find the State.** With only 5s and zoom-out
  start, the northeastern cluster (RI, CT, DE, NJ, MA, NH, VT) is where Speed Run runs are decided by
  *dexterity*, not knowledge — and there are ~7 such prompts guaranteed per run since all 50 appear.
- **Replay incentive is thin past your first PB.** Once you've cleared gold (which Experts do almost
  always), there's no harder tier, no leaderboard, no daily seed framing on the completion screen to pull
  you back. The score ceiling (2693) is reached by perfect play and then there's nowhere to go.

### Changeworthy
- **[P1] Re-space the medals so silver is reachable and gold is earned.** Pull silver down and push gold
  up: e.g. `bronze 500 → silver 1100 → gold 1600` (from the current 500/850/1150). With Expert ~1807 and
  Average ~673, that puts Average at bronze, a *good* Average / weak Expert at silver, and reserves gold
  for genuinely fast+accurate runs. Touches `ARCADE_GAMES['speed-run'].medals` (5490). *Why:* the
  current silver band is statistically empty and gold is too soft.
- **[P1] Cut the run or add checkpoints — 50 is a lot at 5s with hard resets.** Either drop `runLength`
  50→30 (`5487`) for a tighter ~2.5-min run, or add milestone toasts + a "soft streak" that halves
  instead of zeroing on a miss (mirror the Find-the-State [P1] fix). Touches `runLength` (5487) and the
  `AG.streak = 0` reset in `arcadeResolve` (6478). *Why:* reduces the all-or-nothing churn shape and the
  469-point single-miss swing.
- **[P1] Give the clock more headroom on small states, or auto-zoom.** Bump `perPrompt` 5→6 (`5488`) or,
  better, auto-pan/zoom to the prompt's region in `arcadeNextPrompt` (6189) when the target is small.
  *Why:* 5s isn't enough to read + locate + pinch a 6px state, so the northeastern prompts test fingers
  not knowledge.
- **[P2] Add a partial-credit completion screen + milestones.** Show "found 37/50" prominently and a
  per-region breakdown so a sub-medal run still feels like progress; fire a milestone toast at 10/25/40.
  Touches `arcadeComplete` (6530) + `arcadeUpdateHud` (6113). *Why:* novices currently finish a 4-minute
  run with zero reward signal (none-medal 100%).
- **[P2] Colorblind reliance on red/green** — same issue and same fix as Find the State (`--correct`/
  `--wrong`/`--reveal` + toast colors). Touches the same CSS (2772–2774, 2831) + toast text. *Why:* a
  fast game leans even harder on instant correct/wrong reads, which colorblind players can't get from hue.
- **[P3] Replay/share hook on completion.** Surface a seeded share ("can you beat my Speed Run?") and/or
  a daily-seed framing on the complete screen so beating a friend's exact run is the pull. `arcadeShareUrl`
  already builds the seeded URL (6575); just promote it on the Speed Run completion card. *Why:* once gold
  is cleared there's no reason to come back.

---

## Top 3 fixes (these two games)

1. **[P1] Soften the streak-reset cliff in both games** — drop streak by half (not to 0) on a miss and
   rebalance base/streak weights. A single mistake currently costs 119 pts in Find the State (26% of max)
   and 469 in Speed Run, so medals track finger-perfection over geography knowledge. Touches the
   `AG.streak = 0` reset in `arcadeResolve` (6478) + the `scoring` blocks (5436, 5489).
2. **[P1] Re-space Speed Run's medals** — silver (850–1150) is a statistically empty band: Experts get
   gold 97% and skip silver entirely, Average lands bronze. Move to ~500/1100/1600 so silver is real and
   gold is earned. Touches `ARCADE_GAMES['speed-run'].medals` (5490).
3. **[P1] Fix tiny-state fairness with the timer/zoom** — the northeastern cluster is decided by
   dexterity not knowledge, worst in Speed Run's 5s window. Auto-pan/zoom toward the target region in
   `arcadeNextPrompt` (6189) and/or give small-state prompts more time. This is the single biggest
   "I knew it but couldn't tap it" frustration in both games.
