# Tappymaps Games Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Intended repo home:** `docs/superpowers/plans/2026-06-13-tappymaps-games-polish.md`. This copy lives at `C:\Users\Calen\tappymaps-games-polish-plan.md` because the repo (`mapzimus/tappymaps`) is **not cloned** on this machine yet — clone it and drop this file in before executing.

**Goal:** Work the open "bad / changeworthy" items from `docs/playtests/FOLLOWUPS.md` into the single-file app (`index.html`), prioritising the fixes that change whether the mini-games feel *fair* and *finishable*, and proving each one with the repo's real gates.

**Architecture:** The whole app is one file, `index.html`, with two inline `<script>` blocks (Block 0 = main app ~350k chars, Block 1 = mobile-UX IIFE). All game logic lives in Block 0 as bare-name functions (`arcade*`, `draft*`) that read shared globals (`AG`, `DG`, `DT`, `fipsToState`, `STATE_ADJACENCY`) and mutate the DOM directly. Edits are keyed to **function-name anchors** (stable) — never line numbers (they drift).

**Tech stack:** Vanilla JS + SVG, no build step, no framework. Census stats over `/api/census`; topology via a (sandbox-blocked) TopoJSON CDN. Verification = `npm run validate` (parse) + `npm run smoke` (Playwright boot) + this plan's optional `scripts/sim.mjs` (pure-logic) + manual preview for anything map-rendered.

---

## How this plan is verified (read first)

The repo's house rule is **"never claim a fix from static analysis alone."** There are exactly three gates available, plus preview:

| Gate | Command | Proves | Blind to |
|---|---|---|---|
| Parse | `npm run validate` | Both `<script>` blocks still compile | Runtime + logic |
| Boot | `npm run smoke` | Every route boots with no console/page error | Game *logic*, map render (CDN ignored); **skips entirely if Playwright absent** |
| Sim | `node scripts/sim.mjs` *(new — Task 0)* | Pure scoring/draw/date math is correct | Anything DOM-coupled or map-rendered |
| Preview | manual play on a deploy preview | Map-tap *feel* (pan, zoom, taps, color cues) | nothing — but human-in-loop |

**Consequence for tagging:** every task is marked **[headless]** (provable by validate+smoke+sim) or **[preview]** (ship as "candidate — verify on preview", because it touches map rendering or tap feel). Do not merge a **[preview]** item claiming it works without a preview play-test.

---

## ⚠️ Decisions to confirm before building

These are the genuine forks in the backlog. My recommendation is in **bold**; each is revisited at its task.

1. **Add a committed sim harness (`scripts/sim.mjs`), or verify ad-hoc?** → **Add it.** It's ~40 lines, it's the *only* way the fairness/scoring/date fixes are provable headless, and it turns the audits' simulation tables into real regression checks. (Task 0.)
2. **Streak-reset cliff: halve, shift weight to base, or both?** → **Halve** (`Math.floor(streak/2)`) — smallest change, keeps the streak mechanic meaningful. Then **re-tune medals** against the sim (halving *raises* scores).
3. **The "clock is a flat tax": tighten `perPrompt` or make `timeBonus` non-linear?** → **Non-linear `timeBonus`** (only sub-~3s approaches max), keep the generous window so knowing-the-state still feels fair. Higher blast radius (rebalances every locate game) → its own task, behind a shared helper.
4. **Speed Run churn: cut 50→30, or checkpoints + partial credit?** → **Checkpoints + partial-credit completion**, keep 50. Less disruptive to existing bests; adds reward density without shortening the signature run. (Cutting length is a one-line fallback if play-test still says it drags.)
5. **Shuffle mode: make it visibly harder, or retire it?** → **Make it harder** via a small/obscure-weighted pool — it already has a distinct identity ("repeats states"), just no difficulty.
6. **Daily UTC rollover: surface the reset time, or move to a local-day rollover?** → **Surface only.** A local-day rollover silently breaks the Daily's core promise ("everyone gets the *same* puzzle today" — the shared `/daily` seed). Show "resets at <local time>" + a streak-at-risk nudge; do **not** change `arcadeDailyKey`'s UTC basis.

---

## File structure

One file is touched: **`index.html`** (Block 0). Plus, if Decision 1 is yes, two new/edited files:

- Create: `scripts/sim.mjs` — pure-logic regression harness (Node, zero-dep, **no eval**).
- Modify: `package.json` — add `"sim": "node scripts/sim.mjs"` and chain it into `"test"`.

No restructuring of `index.html` — it's an established single-file app; follow that pattern.

---

## Task 0 — Sim harness for pure logic *(Decision 1)* — [headless]

**Why this matters / trade-off:** The fairness and scoring fixes below change *distributions and formulas*, which `validate` (parse) and `smoke` (boot) cannot see. The app is one no-build file, so its inline functions can't be `import`ed. Rather than eval app source (fragile + injection-shaped), the harness **mirrors** each pure helper as a copy and adds a **drift guard** — `assert(html.includes('<the formula>'))` — so the test fails if the app's formula changes without the test. That's the eval-free single-source-of-truth pattern for a single-file app, and it's exactly the divergence we care about.

**Files:**
- Create: `scripts/sim.mjs`
- Modify: `index.html` — extract two pure scoring helpers (Step 1)
- Modify: `package.json`

- [ ] **Step 1 — Extract pure scoring helpers in `index.html`.** Add, just above `arcadeResolve`:

```js
// Pure scoring helpers — kept pure (no DOM, no globals) so scripts/sim.mjs can
// mirror + guard them. Shared by every resolve path.
function arcadeStreakBonus(streak, s) {
  return streak >= s.streakThreshold
    ? Math.min(s.streakCap, (streak - s.streakThreshold + 1) * s.streakStep) : 0;
}
function arcadeNextStreakOnMiss(streak) { return Math.floor(streak / 2); } // Decision 2
```

Then replace the three inline `streakBonus` computations (in `arcadeResolve`, `arcadeResolveNeighbors`, `arcadeResolveRank`) with `arcadeStreakBonus(AG.streak, s)`, and the three `AG.streak = 0` miss-lines with `AG.streak = arcadeNextStreakOnMiss(AG.streak);`. (This *is* Decision 2 — see Task 2.1.)

- [ ] **Step 2 — Write `scripts/sim.mjs`** (mirror + drift-guard, no eval):

```js
#!/usr/bin/env node
// Pure-logic regression for the games. The app is one no-build file, so the
// pure helpers are MIRRORED here and a text guard asserts index.html still
// contains the same logic — single source of truth, zero eval of app source.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

// --- mirrored pure helpers (keep in sync with index.html; guarded below) ---
function arcadeStreakBonus(streak, s) {
  return streak >= s.streakThreshold
    ? Math.min(s.streakCap, (streak - s.streakThreshold + 1) * s.streakStep) : 0;
}
function arcadeNextStreakOnMiss(streak) { return Math.floor(streak / 2); }
function arcadeIsYesterday(prev, today) {
  const p = new Date(prev + 'T00:00:00Z'), t = new Date(today + 'T00:00:00Z');
  return (t - p) === 86400000;
}

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + msg); if (!cond) fails++; };

// behaviour
ok(arcadeNextStreakOnMiss(6) === 3, 'streak 6 -> 3 on miss');     // Decision 2
ok(arcadeNextStreakOnMiss(1) === 0, 'streak 1 -> 0 on miss');
const s = { streakThreshold: 3, streakStep: 4, streakCap: 20 };
ok(arcadeStreakBonus(2, s) === 0,  'below threshold = 0');
ok(arcadeStreakBonus(3, s) === 4,  'at threshold = one step');
ok(arcadeStreakBonus(99, s) === 20, 'caps at streakCap');
ok(arcadeIsYesterday('2026-06-12', '2026-06-13') === true,  'consecutive days');
ok(arcadeIsYesterday('2026-06-11', '2026-06-13') === false, 'two-day gap');

// drift guard: the app must still contain the mirrored logic
ok(html.includes('Math.floor(streak / 2)'), 'index.html still halves streak on miss');
ok(html.includes('(streak - s.streakThreshold + 1) * s.streakStep'), 'index.html streak-bonus formula intact');

console.log(fails ? `\nsim: ${fails} FAIL` : '\nsim: all PASS');
process.exit(fails ? 1 : 0);
```

For draw-distribution / RNG tasks (alphabet, shuffle, distance, daily), follow the same shape: mirror the pure pick with a seeded RNG and a small state-name/value fixture, assert the distribution, and add a `html.includes('<weighting expression>')` drift guard. **Never eval app source.**

- [ ] **Step 3 — Wire `package.json`:** add `"sim": "node scripts/sim.mjs"`, and change `"test"` to `"node scripts/validate.mjs && node scripts/sim.mjs"`.
- [ ] **Step 4 — Verify:** `npm run validate` → blocks PASS. `node scripts/sim.mjs` → all PASS, exit 0. `npm run smoke` → routes boot clean (or SKIP if no Playwright).
- [ ] **Step 5 — Commit:** `git add scripts/sim.mjs package.json index.html && git commit -F-` with message `test: add pure-logic sim harness + extract scoring helpers`.

> Every later **[headless]** scoring/draw/date task adds its mirror + assertions + drift guard to `scripts/sim.mjs` as its "write the failing test first" step.

---

## Phase 1 — Cross-cutting, low-risk, high-impact

### Task 1.1 — Colorblind cue (P2, every agent flagged it) — toast = [headless], map = [preview]

**Anchors:** `arcadeShowToast`; the answer toasts in `arcadeResolve` / `arcadeResolveNeighbors` / `arcadeResolveRank`; CSS `.arcade-state--correct/--wrong/--reveal` (~line 2825).

**Decision / refinement:** Do **not** blanket-prepend a glyph in `arcadeShowToast` — several non-answer toasts pass `kind:'correct'` purely for color (`"Loading live Census data…"`, neighbor progress `"+7 · 2/5"`, rank `"#1 · X"`). Put the ✓/✗ on the **resolution** toasts only. Split by verification tier.

- [ ] **1.1a [headless] — ✓/✗ glyphs on result toasts.** Prepend `✓ ` to the correct-branch toast and `✗ ` to the miss-branch answer toasts in `arcadeResolve`, `arcadeResolveNeighbors`, `arcadeResolveRank`. Example (`arcadeResolve` correct branch):

  current: `const okLine = isAlpha ? target + '!  +' + gained : '+' + gained;`
  → `const okLine = '✓ ' + (isAlpha ? target + '!  +' + gained : '+' + gained);`

  and each answer `arcadeShowToast(..., 'wrong', ...)` gains a leading `'✗ '`. Leave info/progress toasts untouched.
  **Verify:** `npm run validate`; `npm run smoke`; preview check that a wrong answer reads `✗ …`.

- [ ] **1.1b [preview] — non-hue map cue.** `--correct`/`--reveal` (green) vs `--wrong` (red) differ by *hue only*. Add a shape channel:

```css
.arcade-state--correct { fill: var(--success,#22c55e) !important; stroke:#063; stroke-width:2.5; }
.arcade-state--wrong   { fill: var(--error,#ef4444) !important; stroke:#600; stroke-width:2.5; stroke-dasharray:4 3; }
.arcade-state--reveal  { fill: var(--success,#22c55e) !important; stroke:#063; stroke-width:2.5; stroke-dasharray:1 4; animation: arcadePulse .9s ease; }
```

  (solid vs dashed vs dotted = a redundant, colorblind-safe channel.) **Candidate — verify on preview** the three are distinguishable in greyscale.

### Task 1.2 — Census static fallback for Stat Duel + Rank It (P3) — [headless]

**Anchor:** the `catch` in the `duel || rank` branch of `arcadeStartRun` (currently `arcadeShowHub(); return;`).

**Trade-off:** A `/api/census` outage dead-ends two games to the hub. GeoDraft already bundles static stats (land area, statehood year). Degrade to one instead of bouncing.

- [ ] **Step 1 — add `arcadeStaticFallbackSet()`** returning `{ title, format, data }` from an existing GeoDraft static category (reuse `draftCategories()`'s land-area or statehood vals — confirm its exact shape at build time), `data` keyed by state name.
- [ ] **Step 2 — in the `catch`,** instead of bouncing: build `AG.prompts` from the static set (`arcadePickPairs`/`arcadePickQuads` over static `data`), set `AG.duelDataset = { title: set.title + ' (offline)', format: set.format }`, `AG.duelData = set.data`, toast `'Census offline — playing ' + set.title + ' instead'`, then **fall through** (do not `return`).
- [ ] **Step 3 — Verify:** `npm run validate`; **sim**: mirror `arcadePickPairs` over a fixed static `data` fixture, assert 10 non-equal pairs; `npm run smoke`.

### Task 1.3 — Game-aware share copy (P3) — [headless]

**Anchor:** `arcadeCopy` (hardcodes `"same 10 states"` — wrong for Rank It's 6 rounds and the duels' matchups).

- [ ] **Step 1 — extract `arcadeShareNoun(game)`:** `duel/distance` → `'same matchups'`, `rank` → `'same rounds'`, `neighbors` → `'same border rounds'`, else → `'same ' + game.runLength + ' states'`. In `arcadeCopy` replace `'Link copied — same 10 states.'` with `'Link copied — ' + arcadeShareNoun(AG.game) + '.'`.
- [ ] **Step 2 — Verify:** `npm run validate`; **sim**: mirror `arcadeShareNoun`, assert each kind; `npm run smoke`.

---

## Phase 2 — Locate games (Find the State + Speed Run): scoring & fairness

> **Cross-cutting risk for all of Phase 2:** these change scores, colliding with the published `ARCADE_GAMES[*].medals` thresholds and saved personal bests. After each change, re-run the audits' simulation tables (`docs/playtests/locate-games.md`) via the sim and **re-tune medals** so bronze/silver/gold still mean what they meant. Gate on the sim, not vibes.

### Task 2.1 — Soften the streak-reset cliff (P1, "biggest feels-unfair") — [headless]

**Anchor:** the miss-lines now centralised through `arcadeNextStreakOnMiss` (Task 0). **Decision 2 = halve.**

- [ ] **Step 1 (test first):** in `scripts/sim.mjs` assert `arcadeNextStreakOnMiss(6)===3`, `(1)===0`, `(0)===0` (added in Task 0). Add a Find-the-State *run simulation*: 10 prompts, one miss mid-run, assert final score rose vs the old zero-cliff baseline.
- [ ] **Step 2:** confirm all three resolve paths call `arcadeNextStreakOnMiss` (done in Task 0).
- [ ] **Step 3 — re-tune medals:** simulate the audit's player profiles; if gold now lands too easily, raise `medals.gold`/`silver` for `find-state`/`speed-run`; record new thresholds as a sim guard.
- [ ] **Step 4 — Verify:** `node scripts/sim.mjs` all PASS; `npm run validate`; `npm run smoke`.

### Task 2.2 — Non-linear time bonus *(Decision 3)* (P1) — [headless]

**Anchor:** the `remainFrac`/`timeBonus` math in `arcadeResolve`, `arcadeResolveNeighbors`, `arcadeResolveRank`. Today linear: `round(remainFrac * timeBonusMax)`.

- [ ] **Step 1 — extract a pure curve helper** next to the others:

```js
// Reward real speed: near-max only for fast taps, gentle for the rest.
function arcadeTimeBonus(remainFrac, max) { return Math.round(Math.max(0, remainFrac) ** 1.8 * max); }
```

  Replace the three `Math.round(remainFrac * s.timeBonusMax)` sites with `arcadeTimeBonus(remainFrac, s.timeBonusMax)`.
- [ ] **Step 2 (test):** sim asserts `arcadeTimeBonus(1,15)===15`, `arcadeTimeBonus(0.5,15)` ≈ 4 (was 8), `arcadeTimeBonus(0,15)===0`; drift guard `html.includes('** 1.8 * max')`.
- [ ] **Step 3 — re-tune medals** (slow-but-correct play scores lower) vs `locate-games.md`.
- [ ] **Step 4 — Verify:** sim + validate + smoke.

> If Decision 3 flips to "tighten `perPrompt`", this collapses to editing `perPrompt` in the manifest (8→~5 for Find) — blunter, removes the safety window, so the helper is preferred.

### Task 2.3 — Speed Run reward density *(Decision 4)* (P2) — partial [headless] / [preview]

**Anchors:** `arcadeComplete`, `arcadeUpdateHud`, `runLength`/manifest.

- [ ] **Step 1 [headless] — partial-credit completion line.** In `arcadeComplete`, when `medal.key==='none'`, add `'Found ' + AG.correct + '/' + game.runLength + ' — your best is ' + (prev ? prev.score : 0)`. Extract the string builder for a sim check.
- [ ] **Step 2 [preview] — milestone toasts.** After `AG.idx += 1` in `arcadeResolve`, for `speed-run` fire `arcadeShowToast('🏁 ' + AG.idx + '/' + AG.game.runLength, 'correct', 700)` at idx ∈ {10,25,40}. Verify on preview (no overlap with answer toasts).
- [ ] **Step 3 — Verify:** validate; smoke; preview one Speed Run.

### Task 2.4 — "On pace" HUD + mode label (P2) — [preview]

**Anchor:** `arcadeUpdateHud` (sets score/streak/progress only).

- [ ] Add a pace tag comparing `AG.score` to `(AG.idx / runLength) * game.medals.gold` → `'Gold pace'`/`'Silver pace'`/`'—'`, plus the active mode label. Add an `#arcadePace` markup hook near `#arcadeProgress`. **Candidate — verify on preview** it renders and updates.

### Task 2.5 — Make Shuffle harder *(Decision 5)* (P2) — [headless]

**Anchor:** `arcadePickShuffle`, the `modes` block of `find-state`.

- [ ] **Step 1 (test):** sim — mirror the weighted pick; over many seeds assert small/obscure states (DE, RI, VT, WY, ND, …) are drawn more than uniform; drift guard on the weight expression.
- [ ] **Step 2:** weight `arcadePickShuffle` toward a `SMALL_OBSCURE` set (~2×); keep the no-back-to-back rule.
- [ ] **Step 3 — Verify:** sim + validate + smoke.

---

## Phase 3 — Recall games (Capitals + Alphabet + Neighbor)

### Task 3.1 — Alphabet prompt-pop clarity (P1) — [headless]

**Anchor:** the `kind === 'alpha'` branch of `arcadeNextPrompt` (`popText = letter;` — a lone "I"/"U" misreads).

- [ ] Change `popText = letter;` → `popText = 'Letter: ' + letter;`. **Verify:** validate; smoke; drift guard `html.includes("'Letter: ' + letter")`.

### Task 3.2 — Alphabet singleton-letter fairness (P2) — [headless]

**Anchor:** `arcadePickAlphabet` (+ `arcadeStatesByLetter`). 8 of 19 letters have exactly one valid state but pay the same 20 base as 8-answer letters.

- [ ] **Step 1 (test first):** sim — mirror `arcadePickAlphabet` (text-guarded) over a stubbed `arcadeStateNames` fixture; assert the mean valid-states-per-drawn-letter rises vs uniform.
- [ ] **Step 2:** weight the letter draw by `arcadeStatesByLetter(L).length` (favor multi-state letters); keep the distinct-letters guarantee. *(Alt: bonus singletons in scoring — rejected, churns the scoring table.)*
- [ ] **Step 3 — Verify:** sim + validate + smoke.

### Task 3.3 — Neighbor proportional timer (P1) — [headless]

**Anchors:** `arcadeStartTimer`, neighbors branch of `arcadeNextPrompt`. Fixed 14s over-rewards Maine (1 border), starves 8-border rounds.

- [ ] **Step 1 (test):** sim — mirror a pure `arcadeNeighborRoundTime(total) => 6 + total*1.5`; assert 1→7.5, 8→18.
- [ ] **Step 2:** in the neighbors branch of `arcadeNextPrompt` set `AG.roundTime = arcadeNeighborRoundTime(needed.length)`; in `arcadeStartTimer` use `const dur = (AG.roundTime || AG.game.perPrompt) * 1000;`; clear `AG.roundTime` for non-neighbor games at the top of `arcadeNextPrompt`.
- [ ] **Step 3 — Verify:** sim + validate + smoke.

### Task 3.4 — Neighbor partial-completion bonus (P2) — [headless]

**Anchor:** the else-branch of `arcadeResolveNeighbors` (a 7/8 miss scores 0).

- [ ] Award `const partial = Math.round(s.completion * (found / total));` on miss, add to score, surface in the miss toast (`… · +partial`). Sim-assert `partial(7,8,completion=18) === 16`. **Verify:** sim + validate + smoke.

### Task 3.5 — Capitals differentiation (P3) — [headless]

**Anchor:** `ARCADE_GAMES['state-capitals']` (a Find-the-State reskin).

- [ ] Lowest-risk: `perPrompt` 9→7 (tighter feel). Log the richer "name the capital" inverse mode / obscurity multiplier as future. **Verify:** validate; smoke; re-check medals via sim.

---

## Phase 4 — Duel / Rank polish

### Task 4.1 — Stat Duel: show the stat's one-line `desc` (P2) — [preview]

**Anchor:** `kind === 'duel'` branch of `arcadeNextPrompt`. `AG.duelDataset.desc` already exists.

- [ ] Render `AG.duelDataset.desc` under the prompt (small markup hook or prompt sub-line). **Candidate — verify on preview** it shows without crowding the pop.

### Task 4.2 — Distance Duel reveal explanation (P2) — % string [headless] / line [preview]

**Anchor:** `isDistance` branch of `arcadeResolve` (only says "X is closer to ANCHOR").

- [ ] Add "closer by ~N%": with `da`/`db` already computed, `const hi=Math.max(da,db),lo=Math.min(da,db); const pct=Math.round((1-lo/hi)*100);` → `valueLine = target + ' is closer to ' + r.anchor + ' (by ~' + pct + '%)';`. Optional: faint anchor→winner SVG line (**preview**).
- [ ] *(Optional [P3], headless):* tighten the accept filter `0.82 → 0.78` in `arcadePickDistanceRounds`; sim-assert generated rounds all satisfy `lo/hi ≤ 0.78`.

### Task 4.3 — Rank It timeout clarity (P2) — [headless]

**Anchor:** `arcadeResolveRank`. A timeout with <4 placed shows a bare `"0/4 placed · +0"` reading like a wrong answer.

- [ ] At timeout (`AG.rankPicked.length < 4`) toast `'⏱ Time! — ' + AG.rankPicked.length + '/4 placed · +' + gained`. **Verify:** validate; smoke.

---

## Phase 5 — GeoDraft (Category + Territory)

### Task 5.1 — Territory pick-timer + auto-pick (P1, can stall forever) — [headless]+[preview]

**Anchor:** `draftTerrSetTurn` (no player timer; Category has `draftStartPickTimer`).

- [ ] **Step 1:** add `draftTerrStartPickTimer()` modeled on `draftStartPickTimer`, writing `#draftTerrTimerFill`, auto-committing a random available state on expiry (`draftTerrCommit('you', arr[Math.floor(DT.rng()*arr.length)])`). Add the timer-fill markup if absent.
- [ ] **Step 2:** call it in the `turn === 'you'` branch of `draftTerrSetTurn`; clear `DT.timerId` in `draftTerrOnTap` and on reveal/back. **Verify:** validate; smoke (Territory boots); **preview** the auto-pick fires.

### Task 5.2 — Territory mid-game tension (P1) — [preview]

**Anchors:** `draftTerrSetTurn`, `draftTerrCommit`. 50 blind alternating taps, no signal.

- [ ] After pick ~25, tease a vague lean (your picks' avg land-area percentile → `'Your territory leans big & inland'` / `'…small & coastal'`); keep totals hidden. **Candidate — verify on preview** wording + timing.

### Task 5.3 — Territory share / rematch button (P2) — [headless]

**Anchors:** `draftWireButtons` (add `draftTerrShareBtn`); mirror `draftShareMatch` (~line 7526).

- [ ] Add `draftTerrShareMatch()` emitting `?seed=` (+ `&diff=`), wire `onClick('draftTerrShareBtn', draftTerrShareMatch)`, add the button to the Territory complete screen markup. **Verify:** validate; smoke; sim-assert the URL builder emits `seed` and conditional `diff`.

### Task 5.4 — Territory tie handling (P2) — [headless]

**Anchor:** `draftTerrRevealNext`. An exact-tie category awards no point and isn't explained.

- [ ] In the final-score branch (`revealIdx >= cats.length`) add a tie count when `youCatWins + aiCatWins < cats.length`: `' · ' + (cats.length - youWins - aiWins) + ' tied'`. **Verify:** validate; smoke.

### Task 5.5 — Speed up the Territory back half (P2) — [preview]

**Anchor:** `draftTerrSetTurn` (AI `setTimeout 400 + rng*400`).

- [ ] After total picks ~30 shrink AI delay (`total > 30 ? 120 : 400 + Math.floor(DT.rng()*400)`), and/or add an "auto-draft remaining" control. **Candidate — verify on preview** pacing.

### Task 5.6 — Surface difficulty in-match (P2) — [preview]

**Anchor:** `draftStartRound` (`draftRoundLabel` never shows "Hard").

- [ ] `draftSet('draftRoundLabel', 'Round ' + (DG.round+1) + ' · Best of 5 · ' + DG.difficulty)` (or a badge). **Candidate — verify on preview**.

### Task 5.7 — Beatable AI counterplay (P3, design-heavy) — [headless]

**Anchor:** `bias()` in `draftStartRound` (one-way gift today). `DRAFT_AI_OVERRATED` favors AK/TX/CA/MT/WY; `DRAFT_AI_UNDERRATED` favors NJ/RI/CT/MA/DE; strength `DG.biasMag` (easy 4.5 / normal 2.6 / hard 1.0).

- [ ] Make the bias *deterministically exploitable* (AI over-values famous states; sniping underrated ones first wins). **Step 1 (test):** sim — model a "snipe the underrated" strategy, assert it beats the AI > X% over N seeds on `hard`. **Brainstorm before building** (`superpowers:brainstorming`) — this is a balance design, not a mechanical edit.

---

## Phase 6 — Daily Challenge

### Task 6.1 — Surface UTC reset + streak-at-risk nudge (P1/P2) *(Decision 6 — surface, don't move rollover)* — [headless]

**Anchor:** `arcadeRenderDaily`; reset basis stays `arcadeDailyKey` (UTC — **do not** change it; the shared `/daily` seed depends on one global day).

- [ ] **Step 1 — local reset time.** Add `arcadeDailyResetLocal(now)` → next UTC-midnight rendered in local time; show `'Resets at ' + arcadeDailyResetLocal()` on the card. Sim-assert it's stable for a fixed input `Date`.
- [ ] **Step 2 — streak-at-risk nudge.** In `arcadeRenderDaily`, when `!arcadeDailyPlayedToday()` and `arcadeDailyStreak() > 0`, render `'🔥 ' + streak + ' — play today to keep it.'` (`played`/`streak` already computed there).
- [ ] **Step 3 — Verify:** sim (reset-time helper) + validate + smoke.

### Task 6.2 — Anti-repeat the daily game (P2) — [headless]

**Anchor:** `arcadeDailyGameId` (pure hash can stack the same game up to 4 days). Pool: `['find-state','state-capitals','neighbor-challenge','speed-run','alphabet-race','distance-duel']`.

- [ ] **Step 1 (test):** sim — over 60 consecutive day-keys assert no id repeats on consecutive days.
- [ ] **Step 2:** in `arcadeDailyGameId(key)`, if `id === arcadeDailyGameId(yesterdayKeyOf(key))` pick `(idx+1) % POOL.length`; deterministic from the key. Add a pure `yesterdayKeyOf(key)` (date math, mirrors `arcadeIsYesterday`).
- [ ] **Step 3 — Verify:** sim + validate + smoke.

### Task 6.3 — One-day streak-freeze (P3, design-y) — [headless]

**Anchors:** `arcadeDailyStreak` / `arcadeRecordDaily`. Auto-consumed grace for one miss (cf. Wordle/Duolingo).

- [ ] Track `freezeUsedOn` in the daily record; in `arcadeDailyStreak`, if exactly one day was missed and freeze unused, keep the streak alive + consume freeze. **Step 1 (test):** sim — miss-one-then-play survives once, breaks the second time. **Confirm the desired rule before building.**

---

## Map-feel candidates (preview-only — no headless proof possible)

Ship as "candidate, verify on preview":

- **Small-state dexterity / auto-pan-zoom (P1, worst in Speed Run 5s).** Anchors: `arcadeNextPrompt` + `makeMapZoom`. Auto-pan/zoom toward a small-area target as the prompt pops; and/or more time for small targets. *(The "more time" half can be headless like Task 3.3; the pan/zoom is pure feel.)*
- **Distance Duel anchor→winner SVG line** (the line half of Task 4.2).
- **Map colorblind stroke cue** (Task 1.1b).

---

## Excluded — separate specs (do NOT fold in)

- **Global leaderboard** — needs a validated backend (client-scored games make POSTed scores forgeable; re-simulate the seeded run server-side). Spec: `docs/specs/2026-06-13-progression-and-leaderboard.md`.
- **Cross-device sync** for streaks/XP/scores (Supabase `game_scores` + existing auth).

---

## Self-review (spec coverage)

Every FOLLOWUPS item maps to a task: Cross-cutting → 1.1/1.2/1.3; Locate → 2.1–2.5; Recall → 3.1–3.5; Duel/Rank → 4.1–4.3; GeoDraft → 5.1–5.7; Daily → 6.1–6.3; map-feel quarantined; big tracks excluded. PR #23 items are **not** re-touched. Helper names defined once and reused: `arcadeStreakBonus`, `arcadeNextStreakOnMiss` (Task 0); `arcadeTimeBonus` (2.2); `arcadeNeighborRoundTime` (3.3); `arcadeShareNoun` (1.3); `arcadeStaticFallbackSet` (1.2); `arcadeDailyResetLocal`, `yesterdayKeyOf` (6.1/6.2); `draftTerrStartPickTimer`, `draftTerrShareMatch` (5.1/5.3).

## Execution handoff

This is a **plan-only** deliverable — the repo is not yet cloned. When ready to build:
1. Clone `mapzimus/tappymaps`; drop this file at `docs/superpowers/plans/2026-06-13-tappymaps-games-polish.md`.
2. Choose **Subagent-Driven** (`superpowers:subagent-driven-development` — fresh subagent per task, review between) or **Inline** (`superpowers:executing-plans` — batch with checkpoints).
3. Suggested order: Task 0 → Phase 1 → Phase 2 (with medal re-tune) → Phases 3/4/6 (headless) → Phase 5 → map-feel candidates last, on a live preview.
