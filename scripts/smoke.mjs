#!/usr/bin/env node
// Tappymaps smoke test — boots every router mode in a real browser and fails
// if any of them throw a console error or an uncaught page error.
//
// WHY THIS EXISTS: validate.mjs only parses the JS. It can't catch a runtime
// TDZ (e.g. the Arcade/GeoDraft block reading fipsToState before it's declared)
// or a broken mode handler — those load fine and `node --check` is blind to
// them, but they blank the map at runtime. This drives an actual browser so
// "it boots clean" is proven, not assumed. (House rule: never claim a fix from
// static analysis alone.)
//
// Usage:  node scripts/smoke.mjs
// Local:  serves index.html over python's http.server (no Vercel rewrites), so
//         it loads "/" then drives Router.navigate() for each deep route.
// Deps:   Playwright. If it's not resolvable, the test SKIPS (exit 0) with a
//         note rather than failing — so it never blocks a machine without it.
//         Run it where Playwright is installed (NODE_PATH may be needed).

import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import net from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT || 8799);

// Routes to boot. Sub-routes included so game engines and the gallery exercise
// their enter() handlers. External CDN failures (topology, census) are ignored
// — we're asserting the APP doesn't throw, not that the sandbox has network.
const ROUTES = [
  '/', '/design/make', '/games/arcade', '/games/draft',
  '/games/draft/category', '/games/draft/territory', '/games/draft/practice',
  '/design/gallery/mine', '/about',
];
const IGNORE = /CERT_AUTHORITY|Failed to load US map|Failed to fetch|net::ERR|favicon|census|topojson|ERR_NAME_NOT_RESOLVED/i;

// Resolve Playwright from a local dep first, then any global/NODE_PATH install
// (createRequire honors both, unlike a bare ESM import). Skip — don't fail — if
// it's genuinely absent, so a machine without it isn't blocked.
let chromium;
try {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('playwright');
  const mod = await import(pathToFileURL(entry).href);
  // CJS-via-ESM interop: named exports may sit on the namespace or under .default.
  chromium = mod.chromium || (mod.default && mod.default.chromium);
  if (!chromium) throw new Error('chromium export not found on playwright module');
} catch {
  console.log('smoke: Playwright not resolvable here — SKIPPING (run `npm i -D playwright` or set NODE_PATH).');
  process.exit(0);
}

function waitForPort(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => { s.destroy(); resolve(); });
      s.on('error', () => {
        s.destroy();
        if (Date.now() > deadline) reject(new Error('server never came up on :' + port));
        else setTimeout(tick, 120);
      });
    };
    tick();
  });
}

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
let exitCode = 0;
try {
  await waitForPort(PORT);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !IGNORE.test(msg.text())) errors.push('console: ' + msg.text());
  });
  page.on('pageerror', (e) => { if (!IGNORE.test(e.message)) errors.push('pageerror: ' + e.message); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  for (const route of ROUTES) {
    const before = errors.length;
    // NB: Router is a top-level `const` — a global binding, NOT a window
    // property — so it must be referenced by bare name, not window.Router.
    await page.evaluate((r) => { if (typeof Router !== 'undefined') Router.navigate(r); }, route);
    await page.waitForTimeout(350);
    const mode = await page.evaluate(() => document.body.dataset.mode || '(none)');
    const fresh = errors.length - before;
    console.log(`  ${route.padEnd(28)} -> mode=${(mode || '').padEnd(16)} ${fresh ? '❌ ' + fresh + ' error(s)' : 'ok'}`);
  }

  await browser.close();

  if (errors.length) {
    console.error(`\nsmoke: FAIL — ${errors.length} error(s):`);
    for (const e of errors) console.error('  - ' + e);
    exitCode = 1;
  } else {
    console.log(`\nsmoke: all ${ROUTES.length} routes booted clean.`);
  }
} catch (e) {
  console.error('smoke: harness error — ' + e.message);
  exitCode = 1;
} finally {
  server.kill();
}
process.exit(exitCode);
