#!/usr/bin/env node
// Tappymaps smoke test — boots every router mode in a real browser and asserts
// the app actually WORKS, not merely that it failed quietly.
//
// WHY THIS EXISTS: validate.mjs only parses the JS. It can't catch a runtime
// TDZ (e.g. the Arcade/GeoDraft block reading fipsToState before it's declared)
// or a broken mode handler — those load fine and `node --check` is blind to
// them, but they blank the map at runtime.
//
// WHY IT WAS REWRITTEN: the previous version served the repo over
// `python -m http.server` (no Vercel rewrites, no /api) and ignored every
// console error matching /net::ERR|Failed to load US map|census|topojson/.
// On a machine that couldn't reach the CDN it printed "all 10 routes booted
// clean" while ZERO state paths had rendered and chroma / topojson /
// dom-to-image / html2canvas / supabase were all undefined. A green smoke run
// on a completely dead app is worse than no smoke run, so this version:
//
//   1. serves through scripts/devserver.mjs (real rewrites, real /api stubs,
//      third-party libs vendored locally so a CDN outage cannot be mistaken
//      for a pass), and
//   2. makes positive FUNCTIONAL assertions — 51 states rendered, a click
//      colors a state, an export produces a non-blank canvas, a game run
//      starts — instead of only checking that nothing shouted.
//
// Usage:  npm run smoke
// Deps:   Playwright. If it's not resolvable the test SKIPS (exit 0) rather
//         than failing, so a machine without it isn't blocked. Set
//         SMOKE_CHROMIUM=/path/to/chromium to use a system browser build.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { start } from './devserver.mjs';

const PORT = Number(process.env.SMOKE_PORT || 8799);

// Narrow on purpose. Anything genuinely ignorable is named explicitly; a broad
// /net::ERR/ here is what hid a total CDN failure last time.
const IGNORE = [
  /favicon/i,
  /\/api\/(share|render)\b/i,      // stubbed endpoints return placeholder shapes
  /Failed to load resource.*\/api\//i,
];
const ignorable = (t) => IGNORE.some((re) => re.test(t));

const ROUTES = [
  '/', '/design/make', '/games/arcade', '/games/draft',
  '/games/draft/category', '/games/draft/territory', '/games/draft/practice',
  '/design/gallery/mine', '/design/gallery/recent', '/about', '/pricing',
];

let chromium;
try {
  const require = createRequire(import.meta.url);
  const mod = await import(pathToFileURL(require.resolve('playwright')).href);
  chromium = mod.chromium || (mod.default && mod.default.chromium);
  if (!chromium) throw new Error('chromium export not found on playwright module');
} catch {
  console.log('smoke: Playwright not resolvable here — SKIPPING (run `npm i -D playwright` or set NODE_PATH).');
  process.exit(0);
}

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name + (detail ? ': ' + detail : ''));
};

const server = await start({ port: PORT, stubApi: true, quiet: true });
let browser;
try {
  const launchArgs = ['--disable-dev-shm-usage', '--no-sandbox'];
  // When the environment routes egress through a proxy, Playwright otherwise
  // sends loopback traffic through it too and the dev server is unreachable.
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    launchArgs.push('--proxy-bypass-list=127.0.0.1;localhost');
  }
  const execPath = process.env.SMOKE_CHROMIUM;
  browser = await chromium.launch({ args: launchArgs, ...(execPath ? { executablePath: execPath } : {}) });

  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => { if (!ignorable(e.message)) errors.push('pageerror: ' + e.message); });

  // Hermetic by construction: everything the app needs is served from the dev
  // server, so any request leaving localhost is a third-party dependency. Block
  // them and record the origins rather than letting an external service's
  // health decide whether this suite passes. (It already bit us once: CI went
  // red on /design/gallery/recent because Supabase returned 404 there, while
  // the same route passed locally where Supabase was simply unreachable. That
  // 404 is a real product bug — see the audit — but it is not this test's job
  // to detect, and a suite that flips on someone else's uptime gets ignored.)
  const externalOrigins = new Map();
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    const origin = (() => { try { return new URL(url).origin; } catch { return url.slice(0, 40); } })();
    externalOrigins.set(origin, (externalOrigins.get(origin) || 0) + 1);
    // Fulfil rather than abort: an aborted request logs its own console error,
    // which would be noise this suite then had to special-case away — and a
    // broad "ignore network errors" rule is exactly what made the previous
    // smoke test blind. An empty-but-valid response keeps the app on its
    // normal no-data path and leaves the console genuinely clean.
    const body = /\/rest\/v1\//.test(url) ? '[]' : '{}';
    return route.fulfill({ status: 200, contentType: 'application/json', body });
  });

  // ---- Boot -----------------------------------------------------------------
  console.log('\nBoot');
  await page.goto(`${server.url}/design/make`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);

  const libs = await page.evaluate(() => ({
    chroma: typeof chroma, topojson: typeof topojson, domtoimage: typeof domtoimage,
    html2canvas: typeof html2canvas, supabase: typeof supabase,
  }));
  for (const [name, t] of Object.entries(libs)) {
    check(`lib ${name} loaded`, t !== 'undefined', t === 'undefined' ? 'undefined' : '');
  }

  // ---- Create editor --------------------------------------------------------
  console.log('\nCreate editor');
  const paths = await page.evaluate(() => document.querySelectorAll('#mapContainer svg path').length);
  check('51 state paths rendered', paths === 51, `got ${paths}`);

  const colorResult = await page.evaluate(() => {
    const before = Object.keys(appState.stateColors).length;
    const el = document.querySelector('#mapContainer svg path[data-state="Texas"]');
    if (!el) return { error: 'no Texas path' };
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const after = Object.keys(appState.stateColors).length;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // toggle off
    const toggled = Object.keys(appState.stateColors).length;
    return { before, after, toggled, fill: appState.stateColors.Texas };
  });
  check('clicking a state colors it', colorResult.after === colorResult.before + 1,
    JSON.stringify(colorResult));
  check('clicking again uncolors it (toggle)', colorResult.toggled === colorResult.before,
    `back to ${colorResult.toggled}`);

  // ---- Export ---------------------------------------------------------------
  console.log('\nExport');
  const exportResult = await page.evaluate(async () => {
    // Put something on the map so a blank result is unambiguous.
    ['California', 'Texas', 'Florida', 'New York'].forEach((s) => { appState.stateColors[s] = '#0EA5E9'; });
    appState.legendEntries = [{ color: '#0EA5E9', label: 'Smoke legend entry' }];
    if (typeof updateLegendDisplay === 'function') updateLegendDisplay();
    if (typeof renderMap === 'function') renderMap();
    const titleEl = document.getElementById('mapTitle');
    if (titleEl) titleEl.textContent = 'Smoke export title';

    // Composition invariants are asserted by snapshotting the DOM at the exact
    // moment the rasterizer is handed the node — a pixel heuristic is too
    // coarse to notice a silently hidden legend, which is precisely the kind
    // of regression that looks fine in the editor and only shows up in the
    // downloaded file.
    const atCapture = {};
    const snap = () => {
      for (const id of ['logoWatermark', 'mapTitle', 'legendDisplay']) {
        const el = document.getElementById(id);
        if (!el) { atCapture[id] = 'MISSING'; continue; }
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        atCapture[id] = (cs.display !== 'none' && cs.visibility !== 'hidden' &&
                         Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0) ? 'visible' : 'hidden';
      }
    };
    const wrap = (obj, key) => {
      if (!obj || typeof obj[key] !== 'function') return;
      const orig = obj[key].bind(obj);
      obj[key] = (...a) => { snap(); return orig(...a); };
    };
    wrap(window.domtoimage, 'toPng');
    if (typeof window.html2canvas === 'function') {
      const orig = window.html2canvas;
      window.html2canvas = (...a) => { snap(); return orig(...a); };
    }

    try {
      const canvas = await captureMapImage();
      if (!canvas || !canvas.width) return { error: 'no canvas returned' };
      const ctx = canvas.getContext('2d');
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4 * 997) {           // sparse sample
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return { w: canvas.width, h: canvas.height, distinctColors: seen.size, atCapture };
    } catch (e) {
      return { error: e.message, atCapture };
    }
  });
  check('captureMapImage returns a canvas', !exportResult.error, exportResult.error || '');
  if (!exportResult.error) {
    check('export canvas has real dimensions', exportResult.w > 500 && exportResult.h > 300,
      `${exportResult.w}x${exportResult.h}`);
    check('export canvas is not blank', exportResult.distinctColors > 5,
      `${exportResult.distinctColors} distinct sampled colors`);
  }
  const at = exportResult.atCapture || {};
  // Phase 0 §9: the logo is mandatory on every export for every tier.
  check('logo is visible at capture time', at.logoWatermark === 'visible', at.logoWatermark || 'not observed');
  check('map title is visible at capture time', at.mapTitle === 'visible', at.mapTitle || 'not observed');
  check('legend is visible at capture time', at.legendDisplay === 'visible', at.legendDisplay || 'not observed');

  // ---- Routes ---------------------------------------------------------------
  console.log('\nRoutes');
  for (const route of ROUTES) {
    const before = errors.length;
    // NB: Router is a top-level `const` — a global lexical binding, NOT a
    // window property — so it must be referenced by bare name.
    await page.evaluate((r) => { if (typeof Router !== 'undefined') Router.navigate(r); }, route);
    await page.waitForTimeout(400);
    const mode = await page.evaluate(() => document.body.dataset.mode || '(none)');
    const fresh = errors.length - before;
    check(`${route} -> ${mode}`, fresh === 0 && mode !== '(none)', fresh ? `${fresh} error(s)` : '');
  }

  // ---- Games ----------------------------------------------------------------
  console.log('\nGames');
  await page.evaluate(() => Router.navigate('/games/arcade'));
  await page.waitForTimeout(600);
  const tiles = await page.evaluate(() => document.querySelectorAll('#modeArcade [data-game], #modeArcade .arcade-tile').length);
  check('arcade hub renders game tiles', tiles > 0, `${tiles} tiles`);

  const runStarted = await page.evaluate(async () => {
    try {
      await arcadeStartRun('find-state', 'smoke-seed', undefined, false);
      const first = AG.prompts.slice();
      // Same seed must reproduce the same run — this is what ?seed= sharing
      // promises, and a silent RNG regression would otherwise go unnoticed.
      await arcadeStartRun('find-state', 'smoke-seed', undefined, false);
      return {
        id: AG.game && AG.game.id, seed: AG.seed, len: AG.prompts.length,
        want: AG.game && AG.game.runLength,
        deterministic: JSON.stringify(first) === JSON.stringify(AG.prompts),
        svgStates: document.querySelectorAll('#arcadeStatesGroup path').length,
      };
    } catch (e) { return { error: e.message }; }
  });
  check('arcade run starts with a full prompt queue',
    !runStarted.error && runStarted.id === 'find-state' && runStarted.len === runStarted.want,
    runStarted.error || `${runStarted.len}/${runStarted.want} prompts`);
  check('arcade seed is deterministic', !!runStarted.deterministic);
  check('arcade renders its own 51-state SVG', runStarted.svgStates === 51, `got ${runStarted.svgStates}`);

  await page.evaluate(() => Router.navigate('/games/draft/category'));
  await page.waitForTimeout(600);
  const matchStarted = await page.evaluate(async () => {
    try {
      await draftStartMatch('smoke-seed');
      return {
        phase: DG.phase, turn: DG.turn, round: DG.round,
        aiOrder: Array.isArray(DG.aiOrder) ? DG.aiOrder.length : -1,
        picksPerSide: DG.picksPerSide,
        svgStates: document.querySelectorAll('#draftStatesGroup path').length,
      };
    } catch (e) { return { error: e.message }; }
  });
  check('geodraft match starts in pick phase, player first',
    !matchStarted.error && matchStarted.phase === 'pick' && matchStarted.turn === 'you',
    matchStarted.error || JSON.stringify(matchStarted));
  check('geodraft ranks all 50 states for the AI', matchStarted.aiOrder === 50, `got ${matchStarted.aiOrder}`);
  check('geodraft renders its own 51-state SVG', matchStarted.svgStates === 51, `got ${matchStarted.svgStates}`);

  // ---- Console hygiene ------------------------------------------------------
  console.log('\nConsole');
  check('zero unignored console/page errors', errors.length === 0, `${errors.length} error(s)`);
  for (const e of errors) console.log('     - ' + e.slice(0, 200));

  // Informational, never a failure: which third parties the app reached for.
  // A new origin appearing here is worth a look — it means a runtime dependency
  // was added that this suite deliberately does not exercise.
  if (externalOrigins.size) {
    console.log('\nBlocked external origins (informational)');
    for (const [origin, n] of [...externalOrigins].sort((a, b) => b[1] - a[1])) {
      console.log(`  · ${origin} (${n} request${n === 1 ? '' : 's'})`);
    }
  }

} catch (e) {
  failures.push('harness error: ' + e.message);
  console.error('\nsmoke: harness error — ' + e.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.close();
}

if (failures.length) {
  console.error(`\nsmoke: FAIL — ${failures.length} check(s) failed:`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nsmoke: all checks passed.');
