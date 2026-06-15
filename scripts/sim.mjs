// scripts/sim.mjs — headless score-balance harness for the Arcade games.
//
// The Arcade map can't render in this sandbox (the TopoJSON CDN is blocked), so
// map-TAP feel needs a real device. But the SCORING math is pure arithmetic, so
// we verify it headlessly. This harness:
//   1. re-declares the three shared scoring helpers, and ASSERTS their formulas
//      still match the source in index.html (anti-drift — no eval), then
//   2. unit-checks the new non-linear time curve + streak-halving, then
//   3. Monte-Carlos a full run per skill profile to surface how often each
//      medal is earned — the evidence for re-tuning the thresholds.
//
// Run: `node scripts/sim.mjs`  (or `npm run sim`). Exit 1 on any failed assert.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

// --- The three shared helpers, mirrored from index.html -------------------
// (Kept honest by the anti-drift asserts below — if the shipped formula
//  changes, those asserts fail and force this file to be reconciled.)
function arcadeStreakBonus(streak, s) {
  return streak >= s.streakThreshold
    ? Math.min(s.streakCap, (streak - s.streakThreshold + 1) * s.streakStep) : 0;
}
function arcadeTimeBonus(remainFrac, s) {
  return Math.round(Math.pow(Math.max(0, remainFrac), 1.8) * s.timeBonusMax);
}
function arcadeStreakOnMiss(streak) {
  return Math.floor(streak / 2);
}

// --- assert helper --------------------------------------------------------
let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ FAIL: ' + msg); failures++; }
}

console.log('\n[0] Anti-drift: the mirrored formulas still match index.html');
assert(html.includes('return Math.floor(streak / 2);'),
  'streak-on-miss source matches (halving)');
assert(html.includes('Math.round(Math.pow(Math.max(0, remainFrac), 1.8) * s.timeBonusMax)'),
  'time-bonus source matches (remainFrac**1.8)');
assert(html.includes('Math.min(s.streakCap, (streak - s.streakThreshold + 1) * s.streakStep)'),
  'streak-bonus source matches');

console.log('\n[1] Unit checks on the scoring helpers');

// Streak-on-miss now HALVES instead of zeroing.
assert(arcadeStreakOnMiss(10) === 5, 'streak 10 → 5 on a miss (halves, was 0)');
assert(arcadeStreakOnMiss(1) === 0, 'streak 1 → 0 on a miss');
assert(arcadeStreakOnMiss(0) === 0, 'streak 0 → 0 on a miss');

// Time bonus: full at instant, zero at expiry, strictly below the old linear
// curve everywhere in between (the whole point of remainFrac**1.8).
const sT = { timeBonusMax: 15 };
assert(arcadeTimeBonus(1, sT) === 15, 'instant answer banks the full time bonus');
assert(arcadeTimeBonus(0, sT) === 0, 'expired answer banks zero time bonus');
const linAt = (f) => Math.round(f * sT.timeBonusMax);
let nonlinearOK = true, monotonicOK = true, prev = -1;
for (let f = 0; f <= 1.0001; f += 0.05) {
  const v = arcadeTimeBonus(f, sT);
  if (v > linAt(f)) nonlinearOK = false; // must never EXCEED linear (rounding ties at the extremes)
  if (v < prev) monotonicOK = false;
  prev = v;
}
assert(nonlinearOK, 'time bonus never exceeds the old linear curve (≤ everywhere; strictly < mid)');
assert(monotonicOK, 'time bonus is monotonic in remaining time');
assert(arcadeTimeBonus(0.5, sT) === 4 && linAt(0.5) === 8,
  'half-time answer: 4 pts (new) vs 8 (old) — speed now matters');

// Streak bonus: gated by threshold, capped, steps per streak past threshold.
const sS = { streakThreshold: 3, streakStep: 4, streakCap: 20 };
assert(arcadeStreakBonus(2, sS) === 0, 'no streak bonus below threshold');
assert(arcadeStreakBonus(3, sS) === 4, 'streak bonus starts at threshold (1 step)');
assert(arcadeStreakBonus(99, sS) === 20, 'streak bonus respects the cap');

// --- 2. Per-game config — MIRRORS ARCADE_GAMES in index.html --------------
// Only these constants are hand-mirrored; a manifest constant edit would desync
// (caught the next time medals are reviewed). The formulas above are guarded.
const GAMES = {
  'find-state':     { runLength: 10, perPrompt: 8, base: 20, timeBonusMax: 15, streakThreshold: 3, streakStep: 4, streakCap: 20, medals: { bronze: 150, silver: 280, gold: 400 } },
  'state-capitals': { runLength: 10, perPrompt: 9, base: 20, timeBonusMax: 15, streakThreshold: 3, streakStep: 4, streakCap: 20, medals: { bronze: 150, silver: 280, gold: 400 } },
  'alphabet-race':  { runLength: 10, perPrompt: 8, base: 20, timeBonusMax: 15, streakThreshold: 3, streakStep: 4, streakCap: 20, medals: { bronze: 150, silver: 280, gold: 400 } },
  'speed-run':      { runLength: 50, perPrompt: 5, base: 10, timeBonusMax: 12, streakThreshold: 5, streakStep: 3, streakCap: 40, medals: { bronze: 500, silver: 1200, gold: 2100 } },
};

// --- skill profiles: accuracy + how much time is typically LEFT on a hit ---
// remain ~ fraction of the timer still showing when they tap (higher = faster).
const PROFILES = [
  { name: 'Expert    ', pHit: 0.97, remain: 0.72, jitter: 0.18 },
  { name: 'Intermed. ', pHit: 0.86, remain: 0.50, jitter: 0.22 },
  { name: 'Novice    ', pHit: 0.66, remain: 0.30, jitter: 0.22 },
];

const TRIALS = 20000;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Score one run. mode='new' (shipped) or 'old' (pre-rebalance: linear time,
// streak zeroes) so we can show the shift the rebalance causes.
function simRun(g, p, mode) {
  let score = 0, streak = 0;
  for (let i = 0; i < g.runLength; i++) {
    if (Math.random() < p.pHit) {
      const remainFrac = clamp01(p.remain + (Math.random() * 2 - 1) * p.jitter);
      const timeBonus = mode === 'new'
        ? arcadeTimeBonus(remainFrac, g)
        : Math.round(remainFrac * g.timeBonusMax);
      streak += 1;
      score += g.base + timeBonus + arcadeStreakBonus(streak, g);
    } else {
      streak = mode === 'new' ? arcadeStreakOnMiss(streak) : 0;
    }
  }
  return score;
}

function distro(g, p, mode) {
  const xs = [];
  for (let t = 0; t < TRIALS; t++) xs.push(simRun(g, p, mode));
  xs.sort((a, b) => a - b);
  const pct = (q) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];
  const mean = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return { mean, p10: pct(0.10), p50: pct(0.50), p90: pct(0.90), xs };
}
const rate = (xs, thr) => (100 * xs.filter((x) => x >= thr).length / xs.length).toFixed(0) + '%';

console.log('\n[2] Run-score distributions (' + TRIALS.toLocaleString() + ' trials each)');
for (const [id, g] of Object.entries(GAMES)) {
  console.log('\n  ' + id + '   (medals — bronze ' + g.medals.bronze + ' / silver ' + g.medals.silver + ' / gold ' + g.medals.gold + ')');
  console.log('    profile      mean   p10   p50   p90   | hit-rate B/S/G   (old mean)');
  for (const p of PROFILES) {
    const nu = distro(g, p, 'new');
    const ol = distro(g, p, 'old');
    console.log('    ' + p.name + '  ' + String(nu.mean).padStart(5) + ' ' +
      String(nu.p10).padStart(5) + ' ' + String(nu.p50).padStart(5) + ' ' + String(nu.p90).padStart(5) +
      '   | ' + rate(nu.xs, g.medals.bronze).padStart(4) + '/' + rate(nu.xs, g.medals.silver).padStart(4) +
      '/' + rate(nu.xs, g.medals.gold).padStart(4) + '   (' + ol.mean + ')');
  }
}

console.log('\n[3] Suggested thresholds (gold≈Expert p50, silver≈Intermediate p50, bronze≈Novice p50)');
for (const [id, g] of Object.entries(GAMES)) {
  const ex = distro(g, PROFILES[0], 'new').p50;
  const im = distro(g, PROFILES[1], 'new').p50;
  const no = distro(g, PROFILES[2], 'new').p50;
  const r = (x) => Math.round(x / 10) * 10;
  console.log('  ' + id.padEnd(15) + ' bronze≈' + String(r(no)).padStart(4) +
    '  silver≈' + String(r(im)).padStart(4) + '  gold≈' + String(r(ex)).padStart(4) +
    '   (current ' + g.medals.bronze + '/' + g.medals.silver + '/' + g.medals.gold + ')');
}

console.log('\n' + (failures === 0
  ? 'sim: all unit checks passed.'
  : 'sim: ' + failures + ' unit check(s) FAILED.'));
process.exit(failures === 0 ? 0 : 1);
