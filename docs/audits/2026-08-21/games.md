# Tappymaps — Games Audit (Arcade + GeoDraft)

Auditor: games-audit agent · Date: 2026-08-21 · Target: `/home/user/tappymaps/index.html` (15,819 lines)
Environment: local dev server `http://127.0.0.1:8123` with a **synthetic** `/api/census` stub (51 rows,
monotonically increasing by FIPS). Census-derived numbers below are therefore fake — only *mechanics*
are judged from them. Factual correctness is judged only against the 12 bundled static tables.

> **Line-number caveat:** another agent was refactoring `index.html` concurrently with this audit — the
> file grew from **15,819 → 16,061 lines** while I worked. Every `index.html:NNNN` reference below was
> accurate when taken and all anchors still exist, but they have since shifted by roughly +50 lines.
> Prefer the grep anchors (`ARCADE_GAMES`, `draftRoundFirstPicker`, `DRAFT_CENSUS_LOWWINS`,
> `arcadePickAlphabet`, `draftStartRound`, `draftTerrAiPick`) over the numbers.

## Verdict

**Counts: 2 × P1 · 11 × P2 · 6 × P3 · 3 × PASS.**

These are real games and the engineering under them is genuinely good — **zero console errors** across
every run, byte-identical seeded replay on both surfaces, airtight pool-category enforcement, sub-200 ms
fail-soft when the Census API dies, and all ten bundled static data tables factually correct across all
50 states. The problems are **design and tuning, not correctness.**

The two that matter most:

- **P1 — GeoDraft's difficulty ladder is an illusion.** It is implemented through *who picks first*, not
  AI skill, so a knowledgeable player wins **100.0% of Easy and 100.0% of Normal** (4,800 simulated
  matches, confirmed by real play) and a casual player wins **5%** of Hard. Three settings; two identical,
  one a cliff.
- **P1 — the locate games are unplayable on a phone for ~10 states.** Rhode Island is a 4 × 6 px tap
  target at 390 px wide, and Find the State / Speed Run deliberately never auto-zoom.

Full reasoning in the **Verdict** section at the end.

---

## Findings

### [PASS] Static GeoDraft data tables are factually correct (all 10, all 50 states)

- **Area:** GeoDraft / bundled categories
- **Evidence:** I checked every value in all ten bundled tables at `index.html:8639–8654` against my own
  knowledge: `DRAFT_AREA` (Census total sq mi), `DRAFT_STATEHOOD`, `DRAFT_HIGHPOINT` (ft, all 50 named
  summits), `DRAFT_MEAN_ELEV` (USGS approximate means), `DRAFT_COUNTIES` (incl. AK 30 boroughs+census
  areas, MD 24 w/ Baltimore City, MO 115 w/ St. Louis City, NV 17 w/ Carson City, VA 133 w/ 38
  independent cities), `DRAFT_COASTLINE` (NOAA *general* coastline), `DRAFT_EV` (2024 apportionment —
  sums to **535**, i.e. 538 − DC's 3 ✓), `DRAFT_PRESIDENTS` (birth state — sums to **45**, the number of
  distinct individuals ✓), `DRAFT_PARKS` (30 states w/ ≥1 national park ✓), `DRAFT_BORDERS` (all 50
  neighbour counts ✓, incl. MO 8 / TN 8, ME 1, AK & HI 0).
- **Impact:** No P1 factual bugs to report here. This is the strongest part of the games codebase — worth
  saying out loud because it's the thing that would embarrass the product most if it were wrong.
- **Caveat (P3, see below):** `DRAFT_COASTLINE` uses ocean coastline only, so Michigan (3,288 mi of Great
  Lakes shoreline) and the other Great Lakes states are *out of pool*. Defensible, but the category label
  should say so.

### [PASS] Find the State plays cleanly start-to-finish

- **Area:** Arcade / find-state (Classic)
- **Repro:** `/games/arcade/find-state?seed=audit1`, tap each `AG.prompts[AG.idx]` correctly.
- **Evidence:** 10/10 correct, score 459, `🥇 Gold!`, `New personal best!`,
  `+147 XP · Lvl 2 Explorer — LEVEL UP! 🎉 · #1 on your board`; best persisted to
  `tappymaps_arcade_find-state_best = {"score":459,"medal":"gold"}`; 10 states left painted in 10
  distinct `ARCADE_PAINT_COLORS`; **zero console errors**. Shots: `shots/find-howto.png`,
  `shots/find-prompt1.png`, `shots/find-complete.png`.
- **Wrong / reveal / timeout paths all correct** (`work/arcade/03-find-wrong.mjs`): a wrong tap paints the
  tapped state `--wrong` and the target `--reveal` with toast `✗ That was Delaware`; a timeout gives
  `✗ Time! It's Nevada` and advances; DC is inert (`hit:false`, no dispatch effect); taps during the
  reveal window are correctly swallowed (`#arcadeStatesGroup.is-locked` → `pointer-events:none`, and
  `AG.answered` guards the handler) — a triple-tap scored exactly once.

### [P2] Alphabet Race collapses into 1–2 answer rounds for the back half of every run

- **Area:** Arcade / alphabet-race
- **Repro:** `/games/arcade/alphabet-race?seed=alpha1` (reproduces on every seed I tried).
- **Evidence:** the 10 letters drawn, in play order, with their answer counts:
  `N(8) → M(8) → A(4) → I(4) → C(3) → O(3) → V(2) → S(2) → T(2) → F(1)`.
  There are only **19 distinct first letters** across 50 states and the count distribution is brutal:
  M=8, N=8, A/I/W=4, C/O=3, K/S/T/V=2, and **eight letters (D,F,G,H,L,P,R,U) have exactly one state**.
  `arcadePickAlphabet` (`index.html:7318`) draws 10 of 19 letters weighted by count (Efraimidis–Spirakis)
  and then sorts them count-descending, so by round 6 every run is guaranteed to be tapping 1–2 states
  per round. Round 9 in my run was literally *"Tap every state starting with F"* → Florida.
- **Impact:** The named fantasy ("race", "combos build") is only live for ~4 of 10 rounds. The last four
  rounds are single-tap finds wearing an Alphabet Race costume — and they're on the *shortest* clock (5s),
  so the ramp makes the least interesting rounds the most punishing.
- **Fix:** Either (a) cap the run at the ~6 letters with ≥2 states, or (b) change the late-round rule to
  something with breadth — e.g. "states *containing* the letter", "states whose **second** word starts
  with X", or a two-letter prefix ("NEW…", "SOUTH…"). Option (b) keeps 10 rounds and adds variety.

### [P2] Alphabet Race clear-bonus is flat, so clearing "F" (1 state) pays the same as clearing "M" (8)

- **Area:** Arcade / alphabet-race scoring
- **Evidence:** measured in the same run — `Cleared "M"! 8/8 · +34` vs `Cleared "F"! 1/1 · +35`. The
  bonus is `clearBonus(25) + remainFrac*timeBonusMax(12)` (`index.html:~7998`) with **no scaling by how
  many states the letter had**. Because a 1-state letter is cleared instantly, its time component is
  always near-max, so the trivial letter reliably out-earns the hard one on the bonus line.
- **Impact:** rewards the degenerate rounds; blunts the incentive to actually sweep a big letter fast.
- **Fix:** scale the clear bonus by answer count, e.g. `clearBonus * Math.sqrt(total)` or
  `clearBonus + 8*(total-1)`.

### [P2] Alphabet Race medal thresholds are far too low

- **Area:** Arcade / alphabet-race medals
- **Evidence:** gold is `950`. My run scored **1378** — and roughly 400 of that came from the four
  1-and-2-answer tail rounds that require no skill. Contrast Find the State, where a *bot* tapping in
  160 ms scored 459 against a gold line of 400, i.e. gold there requires an essentially perfect run.
- **Impact:** medals don't mean the same thing across the roster; Alphabet Race gold is close to a
  participation award while Find the State gold is near-flawless-only.
- **Fix:** re-baseline the alpha medals against a human-speed run (I'd start bronze/silver/gold at about
  700/1050/1400), or fix the tail-round problem above first and re-measure.

### [P3] Rank It gives zero credit for an adjacent swap

- **Area:** Arcade / rank-it scoring (`arcadeResolveRank`, `index.html:8038`)
- **Repro:** round 2 of `/games/arcade/rank-it?seed=rank1`. True order
  `Utah > Wyoming > Ohio > Massachusetts`; I tapped `Wyoming > Utah > Ohio > Massachusetts` — i.e. I
  correctly identified the top two and the bottom two and only swapped two adjacent items.
- **Evidence:** toast `✗ 2/4 correct · +28`, and the round is styled as a *miss* (red toast, `SFX.wrong`,
  streak halved). Scoring is strict position-equality: `AG.rankPicked.forEach((nm,i)=>{ if(trueOrder[i]===nm) correctPositions++ })`.
- **Impact:** a near-perfect answer and a fully-reversed answer (round 1, `0/4 · +0`) feel much closer
  together than they deserve; the game reads as harsher than it is.
- **Fix:** score pairwise concordance (Kendall tau) instead of exact position — an adjacent swap then
  scores 5/6 pairs. Keep `perfect` as the separate bonus so 4/4 still feels special.
### [P2] Speed Run's back half has a completely flat reward curve

- **Area:** Arcade / speed-run
- **Repro:** `/games/arcade/speed-run?seed=sr1`, answer all 50 correctly.
- **Evidence:** per-prompt points across one clean run —
  first six `+19 +22 +22 +22 +25 +28`, then from roughly prompt 18 onward **every single prompt paid
  exactly `+62`**: `New Mexico:+62 New York:+62 … Idaho:+62 California:+62` (final 2690, `🥇 Gold`).
  `+62 = base 10 + timeBonusMax 12 + streakCap 40`. `scoring.streakCap = 40` with
  `streakStep = 3` and `streakThreshold = 5` means the streak bonus saturates at streak ≈ 18
  (`(18-5+1)*3 = 42 → capped 40`) and never moves again for the remaining **32 prompts**.
- **Impact:** the longest game in the roster has no scoring tension for its last two thirds — the exact
  stretch where the "50-state slog" needs a reason to keep going. Nothing escalates; the number just
  ticks up by a constant.
- **Fix:** either raise/remove `streakCap` for this game so the streak keeps compounding (it *is* the
  fantasy — "one run, chase the streak"), or add mile-markers (region-cleared bonuses at 10/25/40, a
  running clock/PB pace line) so the back half has structure.

### [P2] Speed Run's gold medal ignores speed entirely

- **Area:** Arcade / speed-run medals
- **Evidence:** gold = `1600`. A perfect 50/50 run scores **≈2093 with a zero time bonus on every single
  prompt** (base `10×50 = 500`, plus the streak sum: 0 for prompts 1–4, then 3,6,…,39 = 273 for prompts
  5–17, then 40 × 33 = 1320). So a player who answers every state correctly at the last possible
  moment still clears gold by ~30%.
- **Impact:** the game is called Speed Run and its medal doesn't measure speed. My run scored 2690 —
  68% above gold.
- **Fix:** score total elapsed time as a separate headline stat and gate gold on it, or lift the
  thresholds to sit above the "perfect but slow" floor (~2100).

### [P1] Rhode Island / Delaware / DC are far below a usable tap target on mobile, and Find/Speed Run deliberately never zoom

- **Area:** Arcade / all locate games, mobile
- **Repro:** `/games/arcade/speed-run` at a 390×844 touch viewport (`work/arcade/30-mobile-targets.mjs`).
- **Evidence:** measured `getBoundingClientRect()` of every state path. **Twelve** states have a
  min-dimension under 24 px: DC, Rhode Island, Delaware, Connecticut, New Jersey, Vermont,
  New Hampshire, Massachusetts, Maryland, Indiana, Mississippi, Tennessee. At desktop 1440 px
  Rhode Island is already only **15 × 21 px** (area 304 px²) versus Texas at 262 × 257; on a 390 px
  phone it is roughly **4 × 6 px**. Shot: `shots/arcade-mobile-speedrun.png`.
- **The aggravating factor:** `arcadeNextPrompt` (`index.html:~7885`) auto-frames the relevant states on
  touch devices **only for `duel` and `rank`** — with an explicit comment that it must "never
  find/alpha, where zooming to the target would give away the answer." That reasoning is right, but it
  leaves Find the State (8 s) and Speed Run (**5 s**) requiring a manual pinch-zoom before a
  4-px-wide Rhode Island is tappable. Five seconds is not enough to pinch, locate and tap.
- **Impact:** on phones — the primary device for a casual map game — a fixed subset of ~10 states is
  effectively unanswerable in the timed locate games. That's 20% of Speed Run's prompts.
- **Fix:** give small states an invisible enlarged hit area (a second transparent `path` with a fat
  `stroke` and `stroke-linejoin:round`, or a `<circle r="16">` hit target centred on the state) so the
  tap target grows without changing the visual. GeoDraft already ships the right idea in
  `DRAFT_SMALL_STATES` + the `draft-terr-chip` tappable list and `draftFrameRegion()` — Arcade has
  neither. This is the single highest-impact fix in the Arcade half of this audit.

### [P1] GeoDraft difficulty is decided by pick order, not by AI skill — Easy and Normal are identical (both 100%) for a knowledgeable player

- **Area:** GeoDraft / Category Draft, all difficulties
- **Method:** `work/draft/sim3.mjs` — an in-page simulator that replicates the engine's exact maths
  (`draftCategories()` + real `draftLoadValues()` for all **50** categories; the identical
  Fisher–Yates category shuffle, the identical `ranked → i + gauss()*cat.noise*150*DG.noiseMul + bias(n)*DG.biasMag`
  AI ordering, `draftRoundFirstPicker`, greedy `aiOrder.find(available)` picking, the identical
  `inverted`-aware total comparison and first-to-3) against four player policies. **400 matches per
  cell, 4,800 matches total.** Policies: *perfect* = always take the true best remaining;
  *good* = true rank ± ~3 ranks; *casual* = ± ~9 ranks; *random*.
- **Evidence:** see the **Measured AI win rates** table below. The decisive columns are the last two:
  with perfect play the player wins **99–100% of rounds where they pick first** and only **64–80% of
  rounds where the AI picks first**. And `draftRoundFirstPicker` (`index.html:8761`) hands out first
  pick *structurally by difficulty* — Easy: you always; Normal: seeded coin flip; Hard: the AI always.
  The code comment concedes it: *"This is the real lever."*
- **Impact:**
  1. **Easy and Normal are the same difficulty at the top of the skill curve** — perfect play wins
     **100.0%** of matches on both. There is no progression between them.
  2. The AI's two skill knobs (`noiseMul`, `biasMag`) barely move the outcome next to who picks first.
     A player who realises this doesn't need to learn geography — they need to know which setting gives
     them the first pick.
  3. Hard is a cliff, not a step: perfect 84% → good 42% → casual **5%** → random 0%.
- **Fix:** decouple the two. Make first-pick order alternate *within* the match (you first in rounds
  1/3/5, AI first in 2/4 — or snake it) on **all** difficulties, and express difficulty purely through
  `noiseMul`/`biasMag`. Then re-tune those knobs against the measured curve. Optionally add a "you pick
  first this round" indicator so the swing is legible rather than invisible.

### [P2] The round is a sum, so heavy-tailed categories are decided entirely by the first pick

- **Area:** GeoDraft / category design
- **Evidence:** `draftRevealRound` compares raw sums. In **Ocean Coastline**, Alaska (6,640 mi) alone
  beats the sum of the next five states combined (1,350+840+750+397+367 = **3,704**). Whoever takes
  Alaska wins the round no matter what the other five picks are — the remaining two picks per side are
  ceremonial. (`work/draft/sim3.mjs` flags this automatically; among the *static* categories coastline
  is the only true offender — the census categories it also flags are artifacts of the synthetic
  test stub and should be re-checked against real ACS data.)
- **Impact:** the reveal's dramatic build — picks animating highest-to-lowest with a ticking scoreline —
  is at its most theatrical exactly when the outcome was already locked at pick #1.
- **Fix:** score heavy-tailed categories by **rank points** (best pick = 6 pts, next = 5 …) or by
  log-value, rather than a raw sum; or flag such categories and use "best single pick wins" as an
  explicit, differently-framed rule.
### [P2] `DRAFT_CENSUS_LOWWINS` misses four categories in exactly the class it was created for

- **Area:** GeoDraft / category polarity (`index.html:8686`)
- **Evidence:** the set is `new Set(['poverty', 'unemployment'])`, with the comment *"A few census stats
  read as 'lower is better' (you shouldn't win a round by drafting the MOST poverty / unemployment)."*
  Dumping all 50 live categories (`work/draft/catdump2.mjs`) shows four more that are unambiguously the
  same shape and are **not** in the set — each currently plays as **"Highest total wins"**:
  | category | rendered rule today | should be |
  |---|---|---|
  | `census-uninsured` — "Uninsured Rate" | Highest total wins | Lowest total wins |
  | `census-rent_burden` — "Rent Burden" | Highest total wins | Lowest total wins |
  | `census-disability` — "Disability Rate" | Highest total wins | Lowest total wins |
  | `census-snap` — "SNAP/Food Stamps" | Highest total wins | Lowest (or drop it) |
- **Reproduced live:** in my Hard match, round 3 was **"Uninsured Rate — Highest total wins"** — the
  winning strategy is literally to draft the states with the most uninsured people. Shot:
  `shots/draft-hard-reveal-done.png`.
- **Impact:** tonal, but this is the sort of thing that gets screenshotted. The fix is a one-line set edit.
- **Fix:** `DRAFT_CENSUS_LOWWINS = new Set(['poverty','unemployment','uninsured','rent_burden','disability','snap'])`.
  The reveal rule line already updates itself from `cat.inverted`, so nothing else changes.

### [P2] "Longest Names" and "Shortest Names" are the same category twice

- **Area:** GeoDraft / category registry (`index.html:8701–8702`)
- **Evidence:** my duplicate detector compares each category's full 50-state ranking vector; the only
  exact collision across all 50 categories is **`["name-length","name-length-short"]`** — identical
  values, one merely `inverted`. Both are `pool = 50, noise = 0.06`, so both classify as **tier 1**, and
  tier 1 has only **9** members. `draftStartMatch` takes the first two tier-1 entries out of the
  shuffled list, so a match can and will occasionally open with *Longest Names* then *Shortest Names* —
  the same trivia question asked twice in a row with the sign flipped.
- **Impact:** 2 of 9 tier-1 slots spent on one idea, in the two rounds that set a match's first impression.
- **Fix:** keep one, or make the pair mutually exclusive within a match (they're also the two lowest-noise
  categories, i.e. the ones where the AI is sharpest and the player has the least room to out-think it).

### [P3] Summed percentages produce a statistically meaningless total

- **Area:** GeoDraft / reveal
- **Evidence:** 34 of the 38 census categories are rates. `draftRevealRound` sums three states' values
  and shows e.g. `YOU 34.9% vs AI 148.3%` — adding three percentages. It works as a *game* rule (higher
  sum = better picks) and with real ACS data the numbers stay small enough to look plausible, so this is
  cosmetic rather than broken.
- **Fix:** display the **average** for `format:'percent'` categories (compare on the same quantity, so
  the winner never changes) — or label the line "combined score" rather than showing a `%`.

### [P3] `DRAFT_COASTLINE` excludes the Great Lakes states without saying so in the title

- **Area:** GeoDraft / coastline category
- **Evidence:** the table holds 22 states (NOAA *general* coastline). Michigan — 3,288 mi of Great Lakes
  shoreline, more than any state but Alaska — is `.draft-state--out`, dimmed and unclickable, as are
  Ohio, Wisconsin, Illinois, Indiana, Minnesota and Pennsylvania.
- **Mitigation already present:** the category is titled **"Ocean Coastline"** and the desc reads
  *"NOAA general coastline miles — only coastal states are in the pool."* That's honest. The only gap is
  the big `#draftCategoryPop` flash, which shows the **title + rule only** — so the player sees
  "Ocean Coastline / Highest total wins" full-screen and then finds Michigan greyed out with the
  explanation only in the small `draftCatDesc` line behind the pop.
- **Fix:** include the pool size in the pop for pool categories, e.g. *"Ocean Coastline · 22 states in
  play"*.
### [P2] The AI is too sloppy on the marquee categories — it misses "Alaska is the biggest state" two thirds of the time on Normal

- **Area:** GeoDraft / AI model (`draftStartRound`, `index.html:8936–8947`)
- **Method:** `work/draft/aiacc.mjs` — 2,000 AI orderings per category per difficulty using the exact
  `i + gauss()*cat.noise*150*noiseMul + bias(n)*biasMag` formula.
- **Evidence:** how often the AI's **first pick is the true best state** (categories with a *unique*
  maximum only, so ties don't distort it):
  | category | true best | noise | Easy | Normal | Hard |
  |---|---|---|---|---|---|
  | Total Area | Alaska (665,384 vs 268,596) | 0.10 | 24.9% | **34.6%** | 53.0% |
  | Highest Point | Alaska (20,310) | 0.10 | 26.6% | 39.5% | 57.9% |
  | Electoral Votes | California (54) | 0.08 | 36.2% | 49.1% | 62.8% |
  | Ocean Coastline | Alaska (6,640) | 0.08 | 35.7% | 50.3% | 68.9% |
- **Why it matters more than it looks:** `draftStartMatch` forces **rounds 1–2 to be tier-1 categories**,
  which are exactly these famous ones. So the first thing a new player sees is the AI passing on Alaska
  for Total Area. That doesn't read as "a beatable blind spot," it reads as a broken opponent.
- **Root cause:** `noise: 0.10` sounds small but is multiplied by 150, so the AI's rank error has
  σ ≈ 4.3 ranks *at every rank* — including rank 1. The intended design ("misjudges by a few ranks,
  more on obscure stats") is right; the constant is applied uniformly instead of being damped at the top.
- **Fix:** scale the perturbation by rank so the head of the list is near-certain and the mid-pack is
  fuzzy, e.g. `gauss() * cat.noise * 150 * noiseMul * Math.min(1, (i + 2) / 8)`. The AI then reliably
  takes Alaska but still muddles picks 4–15, which is where a knowledgeable player should out-think it.

### [P2] Territory Draft spends 69% of its runtime waiting for the AI

- **Area:** GeoDraft / Territory Draft pacing
- **Repro:** `/games/draft/territory?seed=terr1`, tap through as fast as possible (`work/draft/terr.mjs`).
- **Evidence:** instrumented totals — **total match time 23.0 s, of which 15.8 s (69%) was spent waiting
  on `draftTerrAiPick`**, across 25 player taps. The delay is
  `DT.aiTimerId = setTimeout(draftTerrAiPick, 400 + Math.floor(DT.rng()*400))` (`index.html:9475`) —
  400–800 ms × 25 AI picks.
- **Impact:** Territory's whole pitch is "claim all 50 states." In practice the player taps, then watches
  a half-second pause, 25 times. The artificial thinking delay is there to make the AI feel deliberate,
  but at 25 repetitions it just feels laggy.
- **Fix:** let the AI answer near-instantly after the first couple of picks (ramp the delay down, e.g.
  `Math.max(120, 500 - round*90)`), or have the AI claim its 5 states for the round in one quick
  staggered burst (~60 ms apart) instead of one-at-a-time turn-taking.

### [P2] Territory Draft drew "Shortest Names" and "Longest Names" in the same match

- **Area:** GeoDraft / Territory Draft category draw
- **Repro:** `/games/draft/territory?seed=terr1` — a live confirmation of the duplicate-category finding
  above, and worse here than in Category Draft.
- **Evidence:** the five hidden rounds came out as
  `R1 Shortest Names · R2 Average Elevation · R3 Oldest States · R4 Electoral Votes · R5 Longest Names`.
  Because Territory hides the category until after picking, the player claims 5 states blind in R1 that
  are scored on name length, then claims 5 more in R5 scored on **the exact inverse of the same metric**.
- **Impact:** two of five rounds resolved on one gimmick; the "themed rounds" promise is undercut.
- **Fix:** same as above — de-duplicate the pair, and exclude same-metric categories from a single draw.

### [P3] Inverted rounds show a scoreline that reads as a loss while you're winning

- **Area:** GeoDraft / reveal (`draftRevealRound`)
- **Evidence:** live from my Easy match, round 2 (*Shortest Names*, `inverted:true`) —
  `SCORE: YOU 12 vs AI 17 | VERDICT: You take the round! 🎉`. And Normal round 1 (*Oldest States*) —
  `YOU 5362 vs AI 5363 | You take the round!`. The verdict is **correct**; the presentation isn't. The
  scoreline uses the identical `dsl-bump` "tick UP" animation as a highest-wins round, so on an inverted
  round the number climbing is *bad news* rendered as a triumphant build, and the smaller number wins.
- **Mitigation present:** `draftCatRule` does display "Lowest total wins" / "Earliest total wins".
- **Fix:** for inverted categories, invert the visual language too — count *down*, or badge the scoreline
  with "lower wins" and give the leading (lower) side the `dsl-win` emphasis as it goes, so the drama
  tracks the actual outcome.

### [P3] Abandoning a run or match loses it silently, and a reload restarts it from scratch

- **Area:** both surfaces / lifecycle
- **Evidence:** (`work/arcade/32-lifecycle.mjs`, `work/draft/adv2.mjs`) — mid-run navigation to another
  mode correctly stops all timers and freezes state (`timerId:false, advanceId:false`, `idx` and `score`
  unchanged 3 s later — no offscreen advancement, good), but returning to `/games/arcade` shows the
  **hub** and the run is gone; same for GeoDraft (returns to `draftHub` with a match at `phase:'pick'`
  still in memory). A hard reload mid-Speed-Run (`idx:2, score:40`) comes back at `idx:0, score:0` — the
  seed is in the URL so the *same* 50 prompts regenerate, but 40 points of progress vanish with no notice.
- **Impact:** small for a 10-prompt game, real for a 50-prompt Speed Run or a 5-round draft — an
  accidental back-swipe on mobile costs the whole session.
- **Fix:** the state needed is tiny (`game/mode/seed/idx/score/streak` or `DG.round/picks/wins`). Persist
  it to `localStorage` on each resolve and offer "Resume run?" on re-entry, exactly like the existing
  best-score persistence.

### [P3] `draftCommitPick`'s round-end test uses `===`, so any overshoot would hang the round forever

- **Area:** GeoDraft / robustness (`index.html:~9038`)
- **Code:** `if (DG.youPicks.length === DG.picksPerSide && DG.aiPicks.length === DG.picksPerSide) { draftRevealRound(); return; }`
- **Honest status: I could NOT reproduce this through any real input path.** I hit a 12-pick round once,
  but only after directly mutating `DG.turn` from the console — not reachable by a user. Every legitimate
  attack I then ran came back clean (see the PASS entry below), including a full AFK match where all
  three player timers expired: exactly 3 + 3 picks, one reveal, zero leaked intervals.
- **Fix:** `>=` instead of `===` is a free one-character hardening against a class of bug that would
  otherwise soft-lock the match with no way out but a reload.

### [PASS] Adversarial input, pool enforcement, seeds and fail-soft are all solid

- **Pool categories** (`work/draft/pool2.mjs`, round 3 = *Presidents Born*): 21 states in pool, **29
  dimmed** at `opacity:0.35` with `pointer-events:none`; an out-of-pool pick was rejected via all three
  attack paths (direct `draftOnTap()`, synthetic `MouseEvent`, real hit-tested click); `DG.aiOrder`
  contained **only** in-pool states (`aiOrderAllInPool:true`, length 21) and all three AI picks were
  in-pool; the tappable `#draftListChips` list matched the pool exactly (21/21). Shot:
  `shots/draft-pool-round.png`.
- **Adversarial, GeoDraft:** tap during the AI's turn → rejected; triple-tap one state → 1 pick; tap an
  already-taken state → rejected; tap during the reveal → rejected (`is-locked`, `pointer-events:none`);
  full AFK match → 3 timeouts each producing exactly one seeded random pick, reveal fires correctly.
- **Adversarial, Arcade:** taps during the reveal window swallowed; triple `arcadeOnTap` on the correct
  target scored **once** (+32, `answered:true`); taps after completion inert; DC never tappable.
- **Seed reproducibility — byte-identical, both surfaces.** All six Arcade game/mode combos
  (find-state classic + shuffle, speed-run, alphabet-race, stat-duel, rank-it) reproduce identical
  prompt lists for the same `?seed=` and differ on a new one. Category Draft replays **byte-identically**
  including the AI's internal `aiOrder`, every pick, and the final 3–0 (`work/draft/seed2.mjs`); the
  same seed on a different `?diff=` correctly keeps the categories and changes the outcome.
- **Fail-soft with `/api/census` → 500** (`work/arcade/31-seed-failsoft.mjs`) — genuinely excellent:
  Stat Duel and Rank It settle in **185–198 ms** with the toast *"Live data unavailable — playing with
  map trivia"* and a full run built from 10 offline trivia datasets; GeoDraft assembles a valid 5-category
  match from the static bank in **189 ms** (`counties, statehood, national-parks, coastline, presidents`).
  Nothing hangs, no dead-end, **zero console errors**.
- **Lifecycle:** navigating away stops all timers and freezes state (no offscreen advancement);
  back/forward restore the right mode; mid-game resize to 390×844 reflows both maps with no horizontal
  overflow.
- **Console errors: zero** across every Arcade run, every GeoDraft match, Territory Draft, all
  adversarial probes and both fail-soft scenarios.

---

## Measured AI win rates

`work/draft/sim3.mjs` — **4,800 simulated Category Draft matches** (400 per cell), replicating the engine's
exact maths against the real 50-category registry. Player policies: **perfect** = always take the true
best remaining state; **good** = true rank ± ~3 ranks; **casual** = ± ~9 ranks; **random** = no knowledge.
Validated against real UI play: perfect play won **3–0 on Easy, 3–0 on Normal, 3–1 on Hard**, with the
first-picker trace matching the model exactly (`{0:you,1:you,2:you}` / `{0:ai,1:ai,2:you}` / `{0:ai,1:ai,2:ai,3:ai}`).

### Player match win rate

| policy | Easy | Normal | Hard |
|---|---|---|---|
| **perfect** | **100.0%** | **100.0%** | 84.0% (+5.8% draws) |
| **good** (±3 ranks) | 99.0% | 87.3% | 42.0% |
| **casual** (±9 ranks) | 78.5% | 37.0% | **5.0%** |
| **random** | 2.8% | 0.5% | 0.0% |

### Where the difficulty actually comes from

| policy / difficulty | round win % | …when **you** pick first | …when **AI** picks first | share of rounds you pick first |
|---|---|---|---|---|
| perfect / Easy | 100.0% | 100.0% | — (never happens) | **100%** |
| perfect / Normal | 89.7% | 99.0% | 79.7% | 51.7% |
| perfect / Hard | 64.1% | — (never happens) | 64.1% | **0%** |
| good / Normal | 68.3% | 75.1% | 61.1% | 51.3% |
| casual / Normal | 40.8% | 43.5% | 37.8% | 51.9% |

**Reading:** the last two columns are the story. Winning a round is overwhelmingly a function of who
picked first, and `draftRoundFirstPicker` assigns that *by difficulty setting* — Easy gives it to you
every round, Hard gives it to the AI every round, Normal flips a seeded coin. The AI's actual skill knobs
(`noiseMul`, `biasMag`) are the secondary effect.

**Two consequences:**
1. **Easy and Normal are the same difficulty for anyone who knows US geography** — both 100.0%.
   The ladder only has two real rungs, not three.
2. **Hard is a cliff for everyone else** — a casual player wins **5%** of Hard matches and a random
   player **0 of 400**.

### AI first-pick accuracy (unique-maximum categories only)

| category | true best | Easy | Normal | Hard |
|---|---|---|---|---|
| Total Area | Alaska | 24.9% | 34.6% | 53.0% |
| Highest Point | Alaska | 26.6% | 39.5% | 57.9% |
| Electoral Votes | California | 36.2% | 49.1% | 62.8% |
| Ocean Coastline | Alaska | 35.7% | 50.3% | 68.9% |
| Population (census) | — | 7.0% | 13.5% | 26.1% |

## Medal calibration

Bot runs (~160 ms taps) vs a simulated human (2.2 s thinking time, one deliberate miss every N prompts).

| game | bot score | human score | b / s / g | verdict |
|---|---|---|---|---|
| Find the State | 459 (10/10) | **271** (8/10) → Bronze | 150/280/400 | reasonable; Gold ≈ perfect run only |
| Stat Duel | — | **278** (8/10) → Bronze | 150/280/400 | reasonable, matches Find the State |
| Rank It | 318 (3/6) | **420** (4/6) → Silver | 220/360/500 | reasonable |
| Speed Run | 2690 (50/50) | ≈**2093** perfect-but-zero-speed | 500/1100/**1600** | **too low** — Gold ignores speed entirely |
| Alphabet Race | 1378 (10/10) | — | 350/650/**950** | **too low** — ~400 of that came from 1–2 answer rounds |

Three of five games agree with each other; Speed Run and Alphabet Race are the outliers, and both are
outliers in the same direction (Gold too cheap) for the same underlying reason — a chunk of the run
scores points without demanding skill.

## Ideas

1. **Fat invisible hit targets for the small states.** The single highest-impact change in this audit.
   A transparent duplicate `path` with a wide `stroke` (or a `<circle r="16">` centred on each of the
   ~10 small states) makes Rhode Island tappable on a phone without changing a pixel of the visuals.
   Everything else in Arcade is well built and this is what stops it being playable on the target device.
2. **Decouple GeoDraft difficulty from pick order.** Snake the first pick within every match on all
   difficulties (you: rounds 1/3/5, AI: 2/4) and let `noiseMul`/`biasMag` alone express difficulty.
   Then re-tune against the table above — right now those knobs are being drowned out.
3. **Damp the AI's noise at the top of its ranking** so it stops passing on Alaska, while keeping it
   fuzzy through the mid-pack. The AI should feel like it knows the famous facts and can be
   out-thought on the obscure ones — currently it's the reverse.
4. **Rank-points instead of raw sums** for GeoDraft rounds (best pick 6 pts, next 5, …). It fixes the
   heavy-tail problem, makes summed percentages meaningful, makes every one of the six picks matter,
   and makes the highest-to-lowest reveal genuinely suspenseful instead of decided at pick #1.
5. **Give Alphabet Race a real back half.** Once the ≥2-answer letters run out, switch the rule rather
   than the letter — "states *containing* Z", "states whose second word starts with…", two-letter
   prefixes ("NEW…", "SOUTH…"). Keeps 10 rounds, kills the single-answer rounds, adds variety.
6. **Give Speed Run structure.** Uncap the streak (it's the stated fantasy), show a live elapsed clock
   and a PB pace line, and add region-clear milestones at 10/25/40. Right now prompts 18–50 pay a
   constant +62 and the game has nothing to say for two thirds of its length.
7. **Kendall-tau partial credit in Rank It.** Score concordant pairs, not exact positions, so getting
   the top two right but swapped isn't worth the same as answering backwards. Keep the perfect-4/4 bonus.
8. **Resume-on-return.** Persist `{game, mode, seed, idx, score, streak}` (and `DG.round/picks/wins`) on
   every resolve and offer "Resume?" — a back-swipe currently costs a whole 50-state Speed Run.
9. **Speed up the AI in Territory Draft.** 69% of that mode is a spinner. Burst the AI's five picks
   ~60 ms apart instead of turn-taking with a 400–800 ms delay each.
10. **Show the pool size in the category pop** for pool categories ("Ocean Coastline · 22 states in
    play"), so the greyed-out map is explained before the player hunts for Michigan.
11. **Fix the four inverted census categories in one line** (`uninsured`, `rent_burden`, `disability`,
    `snap`) — "draft the states with the most uninsured people to win" is the one finding here that's
    a screenshot risk rather than a gameplay one.

## Verdict

**Yes — these are real games, and the engineering under them is genuinely good.** Across five Arcade
games played to completion, a Category Draft on each difficulty, a full Territory Draft and a large
adversarial battery, I recorded **zero console errors**. Seeded replay is byte-identical on both
surfaces. Pool categories are enforced on all three attack paths *and* for the AI. Census-down fail-soft
resolves in under 200 ms into a genuinely playable offline trivia mode. All ten bundled static data
tables are factually correct across all 50 states — Electoral Votes sum to 535, presidential birthplaces
to 45. Nothing crashed, hung or double-scored.

The problems are **design and tuning, not correctness**. Two matter most. First, **GeoDraft's difficulty
ladder is an illusion**: it's implemented through who picks first, so a knowledgeable player wins
**100.0% of both Easy and Normal** and then falls off a cliff to 5% on Hard as a casual — three settings,
two of which are identical and one of which is unreachable. Second, **the locate games aren't playable on
a phone** for about ten states, because Rhode Island is a 4-px target and Find/Speed Run deliberately
never auto-zoom. Beyond those, Alphabet Race and Speed Run both spend their back halves on content that
doesn't ask anything of the player, and their medals are priced accordingly.

Fix the hit targets and the pick-order coupling and this is a strong little arcade.
