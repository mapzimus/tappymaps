#!/usr/bin/env node
// Focused A2 smoke: local My Maps save + Pro soft-gate + merge helper.
import { start as startDevServer } from './devserver.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import net from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT || 8797);
const require = createRequire(import.meta.url);
const entry = require.resolve('playwright');
const mod = await import(pathToFileURL(entry).href);
const chromium = mod.chromium || (mod.default && mod.default.chromium);

function waitForPort(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => { s.destroy(); resolve(); });
      s.on('error', () => {
        s.destroy();
        if (Date.now() > deadline) reject(new Error('server never came up'));
        else setTimeout(tick, 120);
      });
    };
    tick();
  });
}

// Serve through scripts/devserver.mjs: production rewrites, /api stubs, and
// locally-vendored CDN libs. `python -m http.server` served none of that, so
// these scripts drove an app whose map had never loaded.
const server = await startDevServer({ port: PORT, stubApi: true, quiet: true });
let failed = 0;
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); failed++; } else console.log('ok:', msg); };

try {
  // Resolve a browser rather than assuming a system Chrome path that does not
  // exist on most machines (this used to fail before running a single check).
  const launchArgs = ['--no-sandbox', '--disable-dev-shm-usage'];
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
    launchArgs.push('--proxy-bypass-list=127.0.0.1;localhost');
  }
  const browser = await chromium.launch({
    ...(process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : {}),
    args: launchArgs
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => { try { localStorage.setItem('tappymaps_visited', 'true'); localStorage.removeItem('tappymaps_my_maps'); } catch (_) {} });
  await page.evaluate(() => { if (typeof Router !== 'undefined') Router.navigate('/design/make'); });
  await page.waitForFunction(() => document.body.dataset.mode === 'design/make' || document.body.dataset.mode === 'create', { timeout: 10000 });
  await page.evaluate(() => {
    if (typeof dismissOnboarding === 'function') dismissOnboarding();
    const ov = document.getElementById('onboardingOverlay');
    if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; }
  });

  // Color a state so save is allowed
  await page.evaluate(() => {
    appState.stateColors = { California: '#0EA5E9', Texas: '#F97316' };
    appState.mapTitle = 'Cloud smoke map';
    appState.mapSubtitle = 'A2 test';
    if (typeof renderMap === 'function') renderMap();
  });

  // Free user: save stays local + soft-gates Upgrade for cloud
  await page.evaluate(() => {
    appState.currentUser = null;
    appState.proUnlocked = false;
    if (typeof updateProGates === 'function') updateProGates();
  });
  await page.evaluate(async () => { await saveCurrentMapToGallery(); });
  const localAfter = await page.evaluate(() => galleryGetMine());
  assert(localAfter.length >= 1, 'local save wrote My Maps');
  assert(localAfter[0].title === 'Cloud smoke map', 'saved title retained');

  // Signed-in free: still local, upgrade path available
  await page.evaluate(() => {
    appState.currentUser = { id: '00000000-0000-4000-8000-000000000001', email: 'free@example.com' };
    appState.proUnlocked = false;
  });
  assert(await page.evaluate(() => galleryCloudEnabled()) === false, 'cloud disabled for free signed-in');

  // Merge helper prefers cloud metadata + keeps local-only hashes
  const merged = await page.evaluate(() => galleryMergeMineLists(
    [{ hash: 'aaa', title: 'Cloud A', subtitle: '', ts: 200, cloud: true, id: '1' }],
    [
      { hash: 'aaa', title: 'Local A', subtitle: 'old', ts: 100 },
      { hash: 'bbb', title: 'Local B', subtitle: '', ts: 150 },
    ]
  ));
  assert(merged.length === 2, 'merge keeps both hashes');
  assert(merged[0].hash === 'aaa' && merged[0].cloud === true && merged[0].title === 'Cloud A', 'cloud row wins title');
  assert(merged.some(m => m.hash === 'bbb' && m.cloud === false), 'local-only row retained');

  // Gallery mine tab renders without throwing (local mode)
  await page.evaluate(() => { if (typeof Router !== 'undefined') Router.navigate('/design/gallery/mine'); });
  await page.waitForTimeout(400);
  const gallery = await page.evaluate(() => ({
    mode: document.body.dataset.mode,
    hasCard: !!document.querySelector('#galleryBody .gallery-card'),
    hasBanner: !!document.querySelector('#galleryBody [data-gallery-signin], #galleryBody [data-gallery-upgrade]'),
    text: (document.getElementById('galleryBody')?.textContent || '').slice(0, 200),
  }));
  assert(gallery.mode === 'design/gallery' || /gallery/.test(gallery.mode || ''), 'gallery mode entered');
  assert(gallery.hasCard, 'gallery shows saved card');
  assert(gallery.hasBanner, 'gallery shows sync upsell banner');

  assert(pageErrors.length === 0, 'no page errors (' + pageErrors.join(' | ') + ')');
  await browser.close();
} finally {
  await server.close();
}

if (failed) {
  console.error(`cloud-maps-smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log('cloud-maps-smoke: PASS');
