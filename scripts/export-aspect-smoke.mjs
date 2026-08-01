#!/usr/bin/env node
// Static checks for Instagram square/portrait/story PNG export presets.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); failed++; } else console.log('ok:', msg); };

const html = readFileSync(join(root, 'index.html'), 'utf8');

assert(/id="exportAspectRow"/.test(html), 'Share panel has export aspect row');
assert(/data-aspect="landscape"/.test(html), 'landscape preset button');
assert(/data-aspect="square"/.test(html), 'square preset button');
assert(/data-aspect="portrait"/.test(html), 'portrait preset button');
assert(/data-aspect="story"/.test(html), 'story preset button');

assert(/EXPORT_ASPECT_RATIOS/.test(html), 'EXPORT_ASPECT_RATIOS constant');
assert(/function resolveExportAspect/.test(html), 'resolveExportAspect helper');
assert(/async function captureMapImage\(options\)/.test(html), 'captureMapImage accepts options');
assert(/exportAspect:\s*'landscape'/.test(html), 'appState.exportAspect defaults to landscape');

assert(/square:\s*1/.test(html), 'square ratio is 1:1');
assert(/portrait:\s*4\s*\/\s*5/.test(html), 'portrait ratio is 4:5');
assert(/story:\s*9\s*\/\s*16/.test(html), 'story ratio is 9:16');
assert(/landscape:\s*1010\s*\/\s*710/.test(html), 'landscape keeps map viewBox ratio');

assert(/captureMapImage\(\{\s*aspect\s*\}\)/.test(html), 'exportPNG/copy pass aspect into capture');
assert(/aspect,\s*states:/.test(html) || /aspect:/.test(html), 'analytics include aspect');

// Must remain a single capture entry — no second html2canvas call site.
const h2c = (html.match(/await html2canvas\s*\(/g) || []).length;
assert(h2c === 1, 'exactly one await html2canvas call (inside captureMapImage), found ' + h2c);

if (failed) {
  console.error(`export-aspect-smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log('export-aspect-smoke: PASS');
