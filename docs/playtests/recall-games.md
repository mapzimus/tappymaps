# Playtest + Design Audit — Recall Games (Arcade)

**Date:** 2026-06-13
**Method:** Code audit + Monte-Carlo simulation (2000 runs/tier, real streak/time-bonus logic, real seeded center draws). Browser play was not possible (US TopoJSON is CDN-blocked in the sandbox, so the map never renders headless), so this is a simulation + static audit, which is more rigorous for balance and data bugs than a few manual rounds would be.
**Scope:** `state-capitals` (capitals), `alphabet-race` (alpha), `neighbor-challenge` (neighbors).
**Source:** all in `index.html` — anchors `const ARCADE_GAMES` (5428), `const STATE_CAPITALS` (5816), `const STATE_ADJACENCY` (5836), `arcadeResolve` (6417), `arcadeNeighborTap`/`arcadeResolveNeighbors` (6353/6380).

**Headline:** Data is clean across all three games (capitals 50/50 correct, adjacency symmetric AND matches reality including the subtle MI–MN non-border). The one real *balance* defect is **Neighbor Challenge medal thresholds vs. a 252-point luck-of-the-draw swing** — a perfect player can miss gold or sail past it purely on which 8 center states the seed dealt. Capitals and Alphabet Race are well-tuned but mechanically identical twins, and Alphabet Race has a difficulty-fairness wrinkle (8 of 19 letters have exactly one valid state).

---

## State Capitals (`state-capitals`, kind `capitals`)

Single-tap. We name a capital city, player taps the owning state. 10 prompts, 9s each. Scoring: `base 20 + timeBonus(0..15) + streak`. Streak starts at the 3rd consecutive correct, `+4`/step, capped `+20`. Medals 150 / 280 / 400.

### Good
- **Data is perfect:** 50/50 capitals correct, no duplicates, no typos (verified against ground truth in `integrity.js`). "Saint Paul" / "Jefferson City" / "Carson City" all spelled correctly.
- **Prompt is unambiguous:** `'Capital: ' + capital + ' — tap the state'` plus the big center pop (`arcadeNextPrompt`, 6219-6222). No state is the capital of two states, so the answer is always unique.
- **Generator picks 10 DISTINCT states** (`arcadePickCapitals` → `arcadePickStates`), so no repeat-within-run frustration.
- **Medal curve is well-placed** (see table): clean Bronze→Silver→Gold ladder that maps to recognizable skill bands. 10/10 correct even with zero speed/streak = 200 pts = solid Bronze, so knowledge alone is rewarded.

### Bad
- **Mechanically identical to Alphabet Race and (minus the data) Stat Duel/Distance Duel/Find-the-State**: same `base 20 / timeBonus 15 / streak 3·4·20` block, same `medals 150/280/400`, same 10×9s shape, same `arcadeResolve` path. Five of the seven games share one scoring template; nothing here *feels* distinct from "Find the State" except the prompt text.
- **No difficulty signal in the prompt.** "Tap the state for Boston" (Massachusetts, easy) and "Tap the state for Pierre" (South Dakota, hard) are worth identical points. Obscurity isn't rewarded.
- **9s is generous** for this knowledge — Expert tier hits 60% gold, which is arguably too easy for a "capitals" recall game aimed at people who already know capitals.

### Changeworthy
- **[P3]** Differentiate the scoring template so Capitals isn't a Find-the-State reskin — e.g. a small "obscurity" multiplier on lesser-known capitals, or drop `perPrompt` to 7s. Anchor: `ARCADE_GAMES['state-capitals']` (5458).
- **[P3]** Consider a "name the capital" inverse variant (tap state → we show you got it) as a `modes` entry to add replay variety. Anchor: `modes:` pattern already used by `find-state` (5442).
- **[P2 / accessibility]** Reveal-on-miss recolors the target green-ish and wrong taps red via `arcade-state--reveal` / `arcade-state--wrong` (6486-6490). Red/green is the only channel — colorblind players can't tell "the answer" from "your wrong tap." Add a shape/label cue (checkmark vs ✗ glyph, or outline style). Shared across all three games — anchor `arcade-state--wrong` / `arcade-state--reveal` CSS.

### Simulation results (2000 runs/tier)
| Tier | Mean | Median | Medal (mean) | Gold% | Silver% | Bronze% | None% |
|------|------|--------|--------------|-------|---------|---------|-------|
| Perfect | 470 | 470 | Gold | 100% | 0% | 0% | 0% |
| Expert (95%, ~70% time) | 384 | 422 | Silver | 60% | 34% | 6% | 0% |
| Average (75%, ~40% time) | 228 | 223 | Bronze | 0% | 20% | 72% | 8% |
| Novice (50%, ~15% time) | 119 | 114 | none | 0% | 0% | 19% | 80% |

Theoretical max = 470 (gold 400 is reachable but requires ~95%+ and fast taps — healthy). Medals are all reachable and none are trivial. **Well-balanced.**

### Data integrity
- 50/50 capitals, 0 mismatches, 0 duplicate capital names. **No bugs.**

---

## Alphabet Race (`alphabet-race`, kind `alpha`)

Single-tap, many valid answers: tap any *unused* state starting with the named letter. 10 prompts, 8s each. Same scoring/medal block as Capitals. Generator picks 10 **distinct first-letters** (`arcadePickAlphabet`, 5648) — distinctness guarantees the run is always satisfiable because each state maps to exactly one letter, so claimed states never collide across prompts.

### Good
- **Satisfiability is provably safe.** Distinct letters + 50 states means `AG.alphaUsed` can never exhaust a letter's pool within a run (each prompt is a different letter). Confirmed in `integrity.js`: distinct-letter design ⇒ every run satisfiable.
- **"No data needed, pure recall"** is a genuinely different *feel* from the census games — good catalog diversity.
- **Miss reveals all valid states** (`AG.alphaValid` → `arcade-state--reveal`, 6481) and toasts the first three as a hint (6483). Strong teaching feedback.
- **Multiple right answers lowers tap-precision pressure** — for "W" you can tap whichever of WA/WV/WI/WY you find first. Friendlier than pinpoint games on mobile.

### Bad
- **Severe per-letter difficulty variance, invisible to the scoring.** Of the 19 distinct first-letters, **8 are single-state letters** (D=Delaware, F=Florida, G=Georgia, H=Hawaii, L=Louisiana, P=Pennsylvania, R=Rhode Island, U=Utah). "Tap a state starting with M" has 8 valid answers (trivial); "Tap a state starting with U" has exactly one (Utah — and you must *find* it on the map). Both pay 20 base. The single-state letters are effectively "find this one specific state" rounds wearing an alphabet costume, while multi-state letters are gimmes.
- **Run length is capped at 19, not 10's worth of variety.** Only 19 distinct first-letters exist, so `arcadePickAlphabet(10)` always pulls from the same 19. Replay value across runs is lower than it looks — you see most of the alphabet pool every game.
- **Tagline over-promises uniqueness.** "no data, pure recall" is true, but the *mechanic* (single tap, `arcadeResolve`, identical scoring) is the same as Capitals/Find-the-State. The novelty is only the prompt type.

### Changeworthy
- **[P2 / fairness]** Single-state letters (D/F/G/H/L/P/R/U) collapse into pinpoint-find rounds and are much harder than multi-state letters for the same reward. Either (a) bias the letter draw toward multi-state letters, (b) award a small bonus when the letter has ≤1 valid answer, or (c) exclude singletons in an "easy" mode. Anchor: `arcadePickAlphabet` (5648) — filter/weight `letters` by `arcadeStatesByLetter(L).length`.
- **[P3]** With only 19 letters the pool is shallow; consider a "use a NEW state each correct answer across the WHOLE run" hard mode (forces W to give up WA so a later W-ish letter can't reuse it) for replay depth — but verify satisfiability first, since cross-letter reuse breaks the current guarantee. Anchor: `AG.alphaUsed` reset (6171), `arcadePickAlphabet`.
- **[P1 / clarity]** The prompt pop shows just the bare letter (`popText = letter`, 6228) with no period/quote, so a flashed "I" vs "1" or "U" vs "V" can be misread for the 8s clock. The header text uses curly quotes (`"I"`); make the big pop match (e.g. `Letter: I`). Anchor: `popText = letter;` (6228).
- **[P2 / accessibility]** Same red/green-only reveal as Capitals (`arcade-state--reveal`/`--wrong`). Needs a non-color cue.

### Simulation results (2000 runs/tier)
| Tier | Mean | Median | Medal (mean) | Gold% | Silver% | Bronze% | None% |
|------|------|--------|--------------|-------|---------|---------|-------|
| Perfect | 470 | 470 | Gold | 100% | 0% | 0% | 0% |
| Expert | 387 | 422 | Silver | 62% | 32% | 6% | 0% |
| Average | 227 | 221 | Bronze | 0% | 20% | 72% | 8% |
| Novice | 119 | 113 | none | 0% | 0% | 19% | 80% |

Identical balance to Capitals (same scoring block) — medals reachable, none trivial. **Balance is fine; the issue is per-prompt fairness, not the medal curve.** Note: the sim models a uniform per-prompt accuracy; in reality a run that happens to draw 6 singleton letters is meaningfully harder than the average, and the medal thresholds don't account for that.

### Data integrity
- 19 distinct first-letters; **8 singleton letters** (listed above); 7 letters (B,E,J,Q,X,Y,Z) have no state and are correctly never offered. No satisfiability bug. The fairness concern is design, not a data error.

---

## Neighbor Challenge (`neighbor-challenge`, kind `neighbors`)

Multi-tap. We name a center state; tap **every** bordering state before the 14s clock. 8 rounds. Scoring: `+7 per neighbor` (live, on each correct tap), `+18 completion` + `timeBonus(0..20)` + streak (`thr 3, step 6, cap 30`) **only on full success**. A wrong tap or timeout ends the round (`arcadeResolveNeighbors(false)`, 6376/6280) and resets the streak. Medals 280 / 470 / 620.

### Good
- **Adjacency data is flawless** (the highest-risk dataset here). Verified symmetric (A↔B always), and matches real geography including the two classic traps: **Michigan does NOT list Minnesota** (Lake Superior maritime border, correctly excluded) and **Virginia does NOT list DC**. 0 reality errors, 0 symmetry errors across 218 directed edges.
- **Wrong taps don't end... actually they do — but partial progress is banked.** `+7` is added live in `arcadeNeighborTap` (6360) *before* the round can fail, so a player who finds 5 of 8 borders then mis-taps keeps 35 pts. Forgiving and fair.
- **Center is highlighted and excluded from answers** (`arcade-state--center`, and `if (name === AG.nbCenter) return`, 6355) — no "did I need to tap the center?" confusion.
- **Live per-tap feedback is excellent:** climbing-pitch SFX (`SFX.correct(AG.nbFound.size)`, 6372), running `n/total` toast, paint-as-you-go. Best feedback of the three games.
- **Generator only picks centers WITH neighbors** (`arcadePickNeighborCenters` filters `length > 0`, 5894), so Alaska/Hawaii never appear as a 0-border round.

### Bad
- **Huge luck-of-the-draw score swing — this is the core balance defect.** Border counts range 1 (Maine) to 8 (Missouri, Tennessee). The 8-center seed draw can deal anywhere from **18 to 54 total borders**. On a *perfect* run that's a **252-point swing** (easiest draw 550, hardest 802) — *larger than the entire bronze→gold spread of 340*. A perfect player handed an easy draw scores **550, which misses gold (620)**; a perfect player handed a hard draw scores 802 and laps it. Medal earned depends as much on the seed as on skill.
- **Easy rounds pay MORE per tap.** Maine (1 border) = up to 45 pts for one tap (25/tap incl. completion); an 8-border round = up to 94 pts for eight taps (~9.3/tap). The completion+time bonus is flat regardless of difficulty, so low-border rounds are point-efficient — the opposite of the intuitive "harder = more reward."
- **All-or-nothing streak feels punishing on big rounds.** Missing 1 of Tennessee's 8 neighbors (a 12.5% slip) zeroes the streak and forfeits completion+time, same as botching Maine's single border. High-border rounds carry disproportionate streak risk.
- **14s for an 8-border round on mobile (tap 8 small states, some need zoom) is tight; 14s for Maine's 1 border is a yawn.** Fixed timer ignores the variance the rest of the scoring also ignores.

### Changeworthy
- **[P1 / balance]** Scale the medal thresholds to the run's actual border total, OR normalize per-round scoring so the draw doesn't swing the result 252 pts. Cheapest fix: make `completion` scale with border count (e.g. `completion = total * 3`) and/or set medals as a *fraction of the dealt max* rather than absolute. Anchor: `medals` + `scoring` in `ARCADE_GAMES['neighbor-challenge']` (5478-5479); resolution in `arcadeResolveNeighbors` (6389-6398).
- **[P1 / balance]** Make `perPrompt` proportional to border count (e.g. `6 + total*1.5`s) so an 8-border round gets ~18s and Maine ~8s. Anchor: `arcadeStartTimer` reads `AG.game.perPrompt` (6263) — would need a per-round override (e.g. `AG.roundTime`) set in `arcadeNextPrompt` neighbors branch (6209-6218).
- **[P2 / balance]** Soften the all-or-nothing streak: award a partial completion bonus scaled to `found/total` even on a failed round, so finding 7/8 isn't scored like 0/8 of the completion bonus. Anchor: `arcadeResolveNeighbors` else-branch (6402-6410) currently grants no completion/time on partial.
- **[P3 / fairness]** Optionally weight `arcadePickNeighborCenters` toward mid-range border counts (3–6) to compress the draw variance instead of (or in addition to) the threshold fix. Anchor: `arcadePickNeighborCenters` (5894).
- **[P2 / accessibility]** Missed borders revealed via `arcade-state--reveal`, wrong tap via `arcade-state--wrong` (6405-6406) — same red/green-only problem.

### Simulation results (2000 runs/tier, real seeded center draws)
| Tier | Mean | Median | Medal (mean) | Gold% | Silver% | Bronze% | None% |
|------|------|--------|--------------|-------|---------|---------|-------|
| Perfect | 673 | 676 | Gold | 98% | 2% | 0% | 0% |
| Expert (85% full-clear) | 519 | 514 | Silver | 16% | 52% | 31% | 0% |
| Average (45% full-clear, ~70% partial) | 308 | 305 | Bronze | 0% | 1% | 66% | 33% |
| Novice (15% full-clear, ~50% partial) | 177 | 173 | none | 0% | 0% | 1% | 99% |

Note: even **Perfect only hits gold 98%** of the time — the 2% are runs that drew the easiest centers and topped out below 620. That's the smoking gun: *gold is not guaranteed by perfect play.* Conversely a hard draw makes gold reachable at well under perfect accuracy. Medals are reachable and the tier ladder is otherwise sensible, but the draw-dependence undermines the medal as a skill signal.

### Data integrity
- **Adjacency: 0 symmetry errors, 0 reality errors** (218 directed edges checked vs ground truth). No self-borders, no duplicates. 48 eligible centers (correctly excludes Alaska & Hawaii). Border distribution: 1×1, 4×2, 9×3, 11×4, 10×5, 9×6, 2×7, 2×8 (mean 4.46). **No data bugs — the issue is purely how the scoring handles that real variance.**

---

## Top 3 fixes

1. **[P1] Neighbor Challenge — kill the 252-pt luck-of-the-draw swing.** A perfect run scores 550–802 depending only on which 8 centers the seed dealt; an easy draw misses gold (620) even at 100% accuracy. Make `completion`/medals scale to the run's actual border total (and ideally make the timer proportional too). This is the only finding that makes a medal *unearnable by skill alone*. Anchors: `ARCADE_GAMES['neighbor-challenge']` scoring/medals (5478), `arcadeResolveNeighbors` (6389).
2. **[P2] Alphabet Race — fix single-state-letter unfairness.** 8 of 19 letters (D/F/G/H/L/P/R/U) have exactly one valid state, turning them into pinpoint-find rounds that pay the same 20 base as gimme letters like M/N (8 answers each). Bias the letter draw toward multi-state letters or bonus the singletons. Anchor: `arcadePickAlphabet` (5648).
3. **[P2] All three games — add a non-color reveal cue.** Correct-answer reveal and wrong-tap feedback are distinguished by green vs red only (`arcade-state--reveal` / `arcade-state--wrong`), unreadable for red/green colorblind players. Add a glyph/outline/label so the "right answer" and "your mistake" are distinguishable without color.

**Bonus (P3): the three games share one scoring template** (`base 20 / time 15 / streak 3·4·20`, medals 150/280/400) with Find-the-State, Stat Duel, and Distance Duel. Capitals and Alphabet Race are well-balanced but mechanically near-identical to each other; differentiating their scoring or timers would make the catalog feel less repetitive.
