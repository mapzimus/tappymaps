#!/usr/bin/env node
// Focused A1 smoke: Create → Data spreadsheet import (sample + Pro gate + unmatched).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import net from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT || 8798);
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

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
let failed = 0;
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); failed++; } else console.log('ok:', msg); };

try {
  await waitForPort(PORT);
  const browser = await chromium.launch({
    executablePath: process.env.SMOKE_CHROMIUM || '/usr/local/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(800);
  // Mark visited BEFORE entering Create so onboarding never arms.
  await page.evaluate(() => { try { localStorage.setItem('tappymaps_visited', 'true'); } catch (_) {} });
  await page.evaluate(() => { if (typeof Router !== 'undefined') Router.navigate('/design/make'); });
  await page.waitForFunction(() => document.body.dataset.mode === 'design/make' || document.body.dataset.mode === 'create', { timeout: 10000 });
  await page.waitForSelector('#modeCreate', { state: 'visible', timeout: 10000 });
  await page.evaluate(() => {
    if (typeof dismissOnboarding === 'function') dismissOnboarding();
    const ov = document.getElementById('onboardingOverlay');
    if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; }
  });
  await page.waitForSelector('#csvSampleBtn', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => { if (typeof switchPanel === 'function') switchPanel('data'); });
  await page.waitForSelector('#csvSampleBtn', { state: 'visible', timeout: 5000 });

  // 1) Free sample colors the map (drive via API — avoids portrait-sheet click flakiness)
  await page.evaluate(() => loadCsvSample());
  await page.waitForFunction(() => Object.keys(appState.stateColors || {}).length >= 50, { timeout: 5000 });
  const sample = await page.evaluate(() => ({
    colored: Object.keys(appState.stateColors).length,
    legend: (appState.legendEntries || []).length,
    title: appState.mapTitle,
    status: document.getElementById('csvImportStatus')?.textContent || '',
    panel: document.getElementById('createPanelUpgrade')?.style.display
  }));
  assert(sample.colored >= 50, `sample colored ${sample.colored} states`);
  assert(sample.legend >= 3, `sample legend has ${sample.legend} entries`);
  assert(/Population/i.test(sample.title), `title is population (${sample.title})`);
  assert(/50 states colored/i.test(sample.status) || /All rows matched/i.test(sample.status), 'status shows match summary');

  // 2) Custom paste while free → Upgrade panel (not crash)
  await page.evaluate(() => { appState.proUnlocked = false; updateProGates(); });
  await page.fill('#csvPasteInput', 'State,Value\nCalifornia,100\nTexas,80\nNarnia,12\nCaliforna,50\n');
  await page.click('#csvApplyBtn');
  await page.waitForTimeout(200);
  const gated = await page.evaluate(() => ({
    upgradeVisible: document.getElementById('createPanelUpgrade')?.style.display === 'block',
    colored: Object.keys(appState.stateColors).length
  }));
  assert(gated.upgradeVisible, 'custom paste opens Upgrade panel for free user');
  // Sample colors should still be on the map (gate before apply)
  assert(gated.colored >= 50, 'gate did not wipe map');

  // 3) Pro custom paste with bad row → colors + unmatched list
  await page.evaluate(() => { appState.proUnlocked = true; updateProGates(); });
  await page.evaluate(() => switchPanel('data'));
  await page.fill('#csvPasteInput', 'State,Value\nCalifornia,100\nTexas,80\nNarnia,12\nCaliforna,50\nNY,70\n06,90\n');
  await page.click('#csvApplyBtn');
  await page.waitForFunction(() => (document.getElementById('csvImportStatus')?.textContent || '').includes('colored'), null, { timeout: 5000 });
  const applied = await page.evaluate(() => ({
    colors: appState.stateColors,
    status: document.getElementById('csvImportStatus')?.textContent || '',
    legend: appState.legendEntries,
    unmatchedHtml: document.querySelector('#csvImportStatus .csv-unmatched-list')?.textContent || ''
  }));
  assert(!!applied.colors['California'], 'California colored');
  assert(!!applied.colors['Texas'], 'Texas colored');
  assert(!!applied.colors['New York'], 'NY abbr matched');
  // fuzzy Californa → California (may overwrite) or unmatched; either is fine if no crash
  assert(/Narnia/i.test(applied.unmatchedHtml) || /Narnia/i.test(applied.status), 'Narnia listed as unmatched');
  assert(applied.legend.length >= 3, 'numeric legend built');

  // 4) Categorical paste
  await page.fill('#csvPasteInput', 'State,Category\nCalifornia,West\nTexas,South\nNew York,Northeast\nIllinois,Midwest\n');
  await page.click('#csvApplyBtn');
  await page.waitForTimeout(200);
  const cat = await page.evaluate(() => ({
    legend: (appState.legendEntries || []).map(e => e.label).sort().join(','),
    colored: Object.keys(appState.stateColors).length
  }));
  assert(cat.colored === 4, `categorical colored ${cat.colored}`);
  assert(/Midwest/.test(cat.legend) && /West/.test(cat.legend), `categorical legend: ${cat.legend}`);

  assert(pageErrors.length === 0, 'no page errors (' + pageErrors.join(' | ') + ')');

  await browser.close();
} finally {
  server.kill('SIGTERM');
}

if (failed) {
  console.error(`csv-import-smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log('csv-import-smoke: PASS');
