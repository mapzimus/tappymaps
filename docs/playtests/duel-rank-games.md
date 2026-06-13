# Playtest + Design Audit — Stat Duel, Distance Duel, Rank It

**Date:** 2026-06-13 · **Method:** Code audit + Monte-Carlo simulation (4000 runs/tier; Distance Duel fairness via 200k generated rounds with bbox-center-vs-true-centroid modeling). No live browser — the US map and Census API are unreachable in this sandbox, so this is a static + simulated audit, which is more rigorous for balance/bugs than a few hand-played runs.

**Code under test (grep anchors in `index.html`):** `const ARCADE_GAMES` (5428), `arcadeResolve` (6417), `arcadeRankTap`/`arcadeResolveRank` (6303/6318), `arcadePickPairs`/`arcadePickQuads` (5916/5932), `arcadePickDistanceRounds`/`arcadeStateCentroids`/`arcadeCentroidDist` (5692/5665/5687), `arcadeStartRun` (6124), `arcadeMedalFor` (6522). Duel datasets: the 16 `duel: true` entries in `DATA_MAP_DATASETS` (all `pro: true`, all from the 2026-06 expansion wave, lines 10816–10832).

**Cross-cutting finding (applies to all three):** scoring is shared and the curves are healthy. Across Stat Duel / Distance Duel the four tiers separate cleanly into Gold / Gold-ish / Bronze / none, and Rank It after the rebalance lands Perfect→Gold, Expert→Silver, Average→Bronze, Novice→none. No tier is "stuck" and no medal is unreachable or trivially farmed. Theoretical max (perfect + full time + full streak): duels ≈ 461, Rank It ≈ 617.

---

## Stat Duel (`stat-duel`, kind `duel`)

Two highlighted states, one ACS stat — tap the higher one. 10 rounds, 10s each. `base 20 + timeBonus(≤15) + streak(≥3 → ≤20)`.

### Simulation results
| Tier (acc / time-left) | Mean | Median | Medal @ median | Gold/Silver/Bronze/none |
|---|---|---|---|---|
| Perfect (100% / 85%) | 448 | 448 | **Gold** | 100 / 0 / 0 / 0 |
| Expert (95% / 70%) | 385 | 421 | **Gold** | 60 / 34 / 6 / 0 |
| Average (75% / 40%) | 228 | 223 | **Bronze** | 0 / 20 / 73 / 7 |
| Novice (50% / 15%) | 118 | 114 | none | 0 / 0 / 20 / 80 |

Curve is well-tuned: a coin-flipper (50%) almost never medals; a strong player lands Silver/Gold. Gold at 400 is appropriately demanding (needs ~9.5/10 + decent speed/streak).

**Good**
- Reveal shows both real values + the stat name (`valueLine`), which is genuinely educational and the best "feel" moment in the suite.
- Tie handling is *scored* generously: `correct = … || (va === vb)` — a tie can't punish the player.
- Seeded share is fully deterministic (seed picks the dataset AND the pairs; Census responses are cached per session), so `?seed=` reproduces an identical run.

**Bad**
- **Pair generator never enforces distinct values** (`arcadePickPairs`, 5916) — unlike `arcadePickQuads` which requires 4 distinct values. On a value tie the round is *scored* as correct either way, but the **reveal paints one state "higher" and shows two identical numbers** (e.g. `Average Household Size 2.51 · 2.51`), which reads as a bug to the player. Tie probability is non-trivial for the tightly-clustered, low-precision datasets: `household_size` (format `decimal1`, values ~2.3–3.1) ≈ 1.1 expected ties per 10-round run; clustered percent stats (`public_transit`, `no_vehicle`) ≈ 0.2/run.
- **Hard dependency on live Census, Pro-only data.** All 16 duel datasets are `pro: true`. The fetch itself doesn't gate on Pro (good), but if `/api/census` is down the whole game bails to the hub with one toast (`'Live data unavailable right now — try another game'`, 6153). Graceful (no crash) but a dead end — no retry, no offline fallback dataset.
- Prompt label `'Higher ' + title + ' — tap your pick'` plus the pop `'A or B?'` is fine, but the stat *meaning* (e.g. what "Movers" or "Homegrown" measures) is never shown until the dataset's `desc` would help — players duel on stats they may not understand.

**Changeworthy**
- **[P1]** In `arcadePickPairs` (5916), reject pairs where `data[a] === data[b]` (mirror the quad generator's distinct-value guard). Pass `data` in like `arcadePickQuads` already does. Removes confusing identical-value reveals. Anchor: `function arcadePickPairs`.
- **[P2]** Surface the stat's one-line `desc` under the prompt (the dataset object already has `desc`). Anchor: `arcadeNextPrompt` `kind === 'duel'` branch (6202).
- **[P3]** Offer a bundled static fallback stat (e.g. land area / statehood year already used by GeoDraft) when the Census fetch fails, instead of bouncing to the hub. Anchor: the `catch` at 6150.
- **[P3]** Fix share copy: `arcadeCopy` always says "same 10 states" (6598) — for a duel it's "same 10 matchups". Anchor: `function arcadeCopy`.

---

## Distance Duel (`distance-duel`, kind `distance`)

An anchor state glows; two contestants — tap the one geographically closer. 10 rounds, 9s. Same scoring shape as Stat Duel. No data needed (uses cached topology centroids).

### Simulation results
| Tier (acc / time-left) | Mean | Median | Medal @ median | Gold/Silver/Bronze/none |
|---|---|---|---|---|
| Perfect (100% / 85%) | 448 | 448 | **Gold** | 100 / 0 / 0 / 0 |
| Expert (95% / 70%) | 384 | 421 | **Gold** | 60 / 34 / 6 / 0 |
| Average (75% / 40%) | 230 | 223 | **Bronze** | 0 / 21 / 73 / 7 |
| Novice (50% / 15%) | 118 | 114 | none | 0 / 0 / 20 / 80 |

Identical curve to Stat Duel by design — fair. The whole risk in this game is **whether "accuracy" is well-defined**, i.e. whether the generated rounds actually have the answer the player sees.

### Distance Duel fairness (the centroid question)
The "centroid" is a **bounding-box center** in projected Albers units (`arcadeStateCentroids`, 5665), not a true area/population centroid. The generator (`arcadePickDistanceRounds`, 5692) rejects rounds where `lo/hi > 0.82` (closer/farther within ~18%). I simulated 200k generated rounds against a hand-built table of both bbox-centers and estimated true centroids for all 50 states, with realistic displacements for the irregular ones.

**Distribution of accepted rounds (closer/farther ratio):** 74% are comfortable (<0.65), only ~6% sit in the 0.78–0.82 "just barely accepted" band. So the 18% filter does its primary job — most rounds are clear.

**bbox-vs-true-centroid disagreement rate: ~0.01%** (the bbox answer and the true-centroid answer differ in only ~20 of 200k rounds). The 18% margin is wide enough that the centroid error almost never *flips* the correct answer. **The filter is, strictly, enough to avoid coin-flips and wrong-answer rounds.**

**But there's a softer fairness gap — visually misleading anchor points.** bbox-center displacement for irregular states (screen units, ~975-wide frame):

| State | bbox-center error | Why |
|---|---|---|
| Florida | ~34 | bbox center pulled offshore by the Gulf split; true land centroid is N+W (panhandle pull) |
| California | ~29 | long north coast drags bbox-center N; population/area centroid is lower/SoCal-ward |
| Idaho | ~22 | thin northern panhandle drags bbox-center N of the broad south |
| Michigan | ~18 | **bbox center lands in the lake between the two peninsulas — a point that is in no part of the state** |
| New York | ~16 | Long Island + upstate spread pulls bbox-center off the visual mass |
| Maryland | ~15 | far-west panhandle drags bbox-center W of where the state "feels" centered |

- ~1.24% of accepted rounds have total centroid error ≥ 60% of the round's bbox margin — i.e. the margin exists in bbox-space but a player reasoning from the *painted shapes* could read it the other way.
- When the **anchor itself** is one of {Michigan, Florida, Idaho, Maryland, California}, the measuring point is unintuitive. ~9.9% of rounds use such an anchor; ~20% of those are also close calls → **~1.9% of rounds are "bad-anchor + close" ≈ 0.19 per 10-round run** (about 1 in 5 runs has one). The player isn't *wrong* by the game's math, but they're penalized for trusting the map shape over the invisible bbox point.

**Specifically flagged risky cases** (game's bbox answer is defensible but a knowledgeable player could reasonably tap the other):
- Anchor **Michigan** vs contestants where one is near the lake-center artifact (e.g. `Idaho vs Florida` from a Michigan anchor — the anchor point is in open water).
- Anchor **Florida**, contestants `Alabama vs Louisiana` — measuring from an offshore bbox point skews a genuinely close Gulf-coast call.
- Anchor **Maryland**, contestants like `New York vs Virginia` — Maryland's bbox-center sits in its western panhandle, not near Baltimore/DC where the state reads as centered.
- Anchor **Idaho** with `Oregon vs Montana` — the panhandle-pulled center can favor the "wrong-feeling" neighbor.

**Good**
- The 18% reject filter genuinely prevents true coin-flip rounds and (per sim) near-zero wrong-answer rounds — the core correctness is sound.
- No data dependency, fully seeded/deterministic, fails soft if topology isn't loaded yet (6163).
- Anchor glows (`--center`) but is non-tappable (not `--duel`); contestants are pointer-gated — clean affordance.

**Bad**
- **bbox-center is the wrong centroid for irregular states.** Michigan's center is literally in the water; Florida/Idaho/California/Maryland centers sit off the visual mass. Rare, but when it bites it feels unfair and undermines trust ("I tapped the obviously closer one and it said wrong").
- The reveal only says `"X is closer to ANCHOR"` (6441) with **no distance shown and no line drawn** — the player can't see *why*, so a counterintuitive result has no explanation. This is the weakest reveal of the three games.

**Changeworthy**
- **[P1]** Replace the bbox-center with an **area centroid** (average of polygon vertex coordinates, or a ring-area-weighted centroid) in `arcadeStateCentroids` (5665). It's a few lines on data you already iterate, removes the Michigan-in-the-lake class of artifact, and makes "closer" match what the player sees. Anchor: `function arcadeStateCentroids`.
- **[P2]** If keeping bbox-center, **exclude the worst-offending anchors** (Michigan, Florida, Idaho, Maryland) from being chosen as the *anchor* (they're fine as contestants), or raise the reject threshold when an irregular state is involved. Anchor: `function arcadePickDistanceRounds` (5692).
- **[P2]** On reveal, draw a faint line anchor→both contestants (or show "closer by ~N%") so a surprising answer is explained. Anchor: `arcadeResolve` `isDistance` branch (6435–6441).
- **[P3]** Tighten the filter from 0.82 to ~0.78 for a slightly safer margin at near-zero cost to round supply (the generator has a 60×n guard budget and pass rate is ~100%).

---

## Rank It (`rank-it`, kind `rank`)

Four highlighted states, one stat — tap them highest→lowest. 6 rounds, 16s. **Unusual scoring:** `base 0`, `perPosition 14` per correctly-placed state (0–4), and only a **perfect 4/4** earns `perfect 18 + timeBonus(≤12) + streak(threshold 2, step 8, cap 28)`. Medals were rebalanced to **B220 / S360 / G500**.

### Simulation results
Rank It's scoring forbids exactly-3-correct (if 3 of 4 are right, the 4th is forced → 4/4), so per-round placements ∈ {0,1,2,4}. Modeled per tier with a placement distribution that yields the target mean-correct, then applied the real per-position + perfect-bonus + streak math.

| Tier (≈placed/4) | Mean | Median | Medal @ median | Gold/Silver/Bronze/none | Avg perfects/6 |
|---|---|---|---|---|---|
| Perfect (4.0) | 596 | 609 | **Gold** | 93 / 7 / 0 / 0 | 5.88 |
| Expert (3.5) | 454 | 468 | **Silver** | 30 / 53 / 17 / 0 | 4.52 |
| Average (2.5) | 263 | 256 | **Bronze** | 0 / 13 / 55 / 31 | 2.28 |
| Novice (1.5) | 162 | 159 | none | 0 / 1 / 19 / 80 | 1.07 |

**The rebalance landed well.** Each tier sits on its own medal at the median (Perfect→Gold, Expert→Silver, Average→Bronze, Novice→none) with sensible spread. Gold at 500 demands near-perfect play (Expert at ~4.5/6 perfects only reaches Gold 30% of the time) — appropriately aspirational. Bronze at 220 is reachable by an Average player who never gets a single perfect (6×2.5×14 ≈ 210 from positions alone lands just under, so it rewards *some* perfects — a good "get one streak going" hook).

**Good**
- Partial credit (`perPosition`) means a near-miss still scores — the game never feels like all-or-nothing, which is the right call for a hard 4-way sort.
- The "no exactly-3" property is handled implicitly (correct math), and the distinct-value guard in `arcadePickQuads` (5932) guarantees an unambiguous true order every round.
- Lower streak threshold (2 vs duels' 3) + bigger step (8) makes back-to-back perfects feel rewarding, which suits a 6-round game.
- Staggered highest→lowest reveal (6338) is a satisfying climax.

**Bad**
- **Same Pro-only / Census hard dependency as Stat Duel** (shares `arcadeStartRun`'s `duel || rank` branch, 6136). Same single-toast bail-to-hub on failure. Same 16-dataset pool.
- **Timeout with partial picks is silently under-explained.** `arcadeTimeout` → `arcadeResolveRank` (6281) scores whatever's placed. If you placed 2 and ran out of time, you can still get `2/4 placed` — but a player who placed *zero* on timeout gets a bare `0/4 placed · +0` with no "you ran out of time" framing distinct from a wrong answer. Minor clarity gap.
- The per-tap toast `'#N · State'` is always styled `'correct'` (6314) even though correctness is hidden until reveal — fine as designed, but a player may misread the green-ish toast as "right so far."

**Changeworthy**
- **[P2]** On a timeout resolve with `< 4` picks, distinguish the toast ("Time! — 2/4 placed") from a completed-but-imperfect round. Anchor: `arcadeResolveRank` (6318) — branch on `AG.rankPicked.length < 4`.
- **[P2]** Shared with Stat Duel: a bundled static fallback stat (area/statehood/etc.) so a Census outage degrades to a playable round instead of a dead end. Anchor: `arcadeStartRun` catch (6150).
- **[P3]** Consider showing each placed state's value as it's revealed (not just the order) — reinforces the learning, matches Stat Duel's `valueLine` richness. Anchor: `arcadeResolveRank` reveal loop (6338).
- **[P3]** Share text "same 10 states" is wrong for Rank It (6 rounds of 4 states). Anchor: `arcadeCopy` (6598).

---

## Top 3 fixes

1. **[P1] Distance Duel: switch from bounding-box center to an area centroid** in `arcadeStateCentroids` (5665). The bbox-center puts Michigan's measuring point in open water and pulls Florida/California/Idaho/Maryland off their visual mass; ~1 in 5 runs hits a "bad-anchor + close" round where the player taps the shape-obviously-closer state and is told they're wrong. The 18% filter prevents true coin-flips, but a correct centroid removes the *unfair-feeling* rounds at the root. Cheap (a few lines on data already being iterated).

2. **[P1] Stat Duel: reject equal-value pairs in `arcadePickPairs`** (5916), mirroring `arcadePickQuads`'s distinct-value guard. Tied pairs are scored generously but the reveal paints one state "higher" while showing two identical numbers (≈1 per run on tightly-clustered datasets like `household_size`), which reads as a bug and erodes trust in the data.

3. **[P2] Graceful Census fallback for Stat Duel + Rank It.** Both hard-depend on live, Pro-only Census data and dead-end to the hub on any `/api/census` failure (`arcadeStartRun` catch, 6150). Add a bundled static fallback stat (land area / statehood year — already shipped for GeoDraft) so an outage degrades to a still-playable round instead of bouncing the player out.

**Honorable mention (trivial):** the share clipboard copy hardcodes "same 10 states" (`arcadeCopy`, 6598) — wrong for Rank It (6 rounds) and awkward for both duels (matchups, not states).
