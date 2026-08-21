#!/usr/bin/env node
// Local Vercel-alike dev server for tappymaps.
//
// WHY THIS EXISTS: `python -m http.server` serves the repo but has none of the
// production rewrites, so a hard load of /design/make 404s and every /api/*
// call fails. That made the smoke test drive the app through a side door and
// swallow real failures. This server reproduces vercel.json faithfully:
//
//   • SPA rewrite  — every non-asset path serves index.html (deep links work)
//   • /s/:hash     — mapped to /api/share?h=:hash
//   • /api/*       — deterministic offline stubs (opt-in via --stub-api)
//   • CDN vendoring — the six third-party <script> tags and the two us-atlas
//     TopoJSON files are cached under .cache/vendor/ and the served HTML is
//     rewritten to point at them. Hermetic after the first run, and a MISSING
//     vendor file is a hard 500 rather than a silent network error the smoke
//     test can ignore. That silent-ignore path is exactly how the old smoke
//     test reported "all routes booted clean" on a page where zero states had
//     rendered and every library had failed to load.
//
// Usage:
//   node scripts/devserver.mjs                 # port 8123, stubs off
//   node scripts/devserver.mjs --stub-api      # offline-deterministic /api/*
//   PORT=9000 node scripts/devserver.mjs
//
// Programmatic (used by scripts/smoke.mjs):
//   import { start, ensureVendor } from './devserver.mjs';
//   const server = await start({ port, stubApi: true });
//   ...
//   await server.close();

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = path.join(ROOT, '.cache', 'vendor');

// The exact URLs index.html loads, mapped to local filenames. Keep this in
// sync with the <script> tags and the two topology fetches — a drift shows up
// immediately as an un-rewritten CDN URL in the served HTML.
export const VENDOR = [
  ['https://cdn.jsdelivr.net/npm/chroma-js@2.4.2/chroma.min.js', 'chroma.min.js'],
  ['https://cdn.jsdelivr.net/npm/dom-to-image-more@3.4.5/dist/dom-to-image-more.min.js', 'dom-to-image-more.min.js'],
  ['https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js', 'confetti.browser.min.js'],
  ['https://cdn.jsdelivr.net/npm/topojson-client@3', 'topojson-client.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas.min.js'],
  ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', 'supabase.js'],
  ['https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json', 'states-albers-10m.json'],
  ['https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json', 'counties-albers-10m.json'],
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/** Download any vendor asset that isn't cached yet. Idempotent. */
export async function ensureVendor({ quiet = false } = {}) {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const missing = VENDOR.filter(([, name]) => !fs.existsSync(path.join(VENDOR_DIR, name)));
  if (!missing.length) return { fetched: 0, cached: VENDOR.length };

  // Node's built-in fetch ignores HTTPS_PROXY unless this is set (Node >= 22.21).
  if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) process.env.NODE_USE_ENV_PROXY = '1';

  for (const [url, name] of missing) {
    if (!quiet) process.stdout.write(`devserver: caching ${name} ... `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`vendor fetch failed ${res.status} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path.join(VENDOR_DIR, name), buf);
    if (!quiet) console.log(`${buf.length} bytes`);
  }
  return { fetched: missing.length, cached: VENDOR.length };
}

function send(res, code, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', ...extra });
  res.end(body);
}

// Deterministic offline stand-ins so the smoke test exercises real code paths
// without touching Census, Supabase, or Stripe.
function stubApi(req, res, url) {
  const p = url.pathname;
  const j = (code, obj) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');

  if (p === '/api/census') {
    const fips = ['01','02','04','05','06','08','09','10','11','12','13','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40','41','42','44','45','46','47','48','49','50','51','53','54','55','56'];
    const rows = [['NAME', 'VALUE', 'state']];
    fips.forEach((f, i) => rows.push([`State ${f}`, String(20000 + i * 733), f]));
    return j(200, rows);
  }
  if (p === '/api/stripe/verify-subscription') return j(200, { isPro: false, subscription: null });
  if (p === '/api/stripe/track-export') return j(200, { allowed: true, remaining: 3, count: 0 });
  if (p === '/api/stripe/create-checkout') return j(200, { url: 'https://checkout.stripe.test/session_stub' });
  if (p === '/api/keepalive') return j(200, { ok: true });
  if (p === '/api/render') {
    return send(res, 200, Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280"><rect width="400" height="280" fill="#0EA5E9"/></svg>'
    ), 'image/svg+xml');
  }
  if (p === '/api/share') return send(res, 200, '<!doctype html><title>share stub</title>', 'text/html; charset=utf-8');
  return j(404, { error: 'no stub for ' + p });
}

export async function start({ port = Number(process.env.PORT || 8123), stubApi: useStubs = false, quiet = false } = {}) {
  await ensureVendor({ quiet });

  // Precompute the rewritten HTML once; index.html is ~744KB and re-reading it
  // per request makes boot-timing measurements noisy.
  const readIndex = () => {
    let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    for (const [url, name] of VENDOR) html = html.split(url).join('/vendor/' + name);
    return html;
  };

  const server = http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, `http://127.0.0.1:${port}`); }
    catch { return send(res, 400, 'bad request'); }
    const p = decodeURIComponent(url.pathname);

    if (p.startsWith('/vendor/')) {
      const name = p.slice('/vendor/'.length);
      const f = path.join(VENDOR_DIR, name);
      // Hard-fail a vendor miss. A soft 404 here is how the old harness let a
      // completely unloaded app report green.
      if (!f.startsWith(VENDOR_DIR) || !fs.existsSync(f)) return send(res, 500, 'VENDOR MISS: ' + name);
      return send(res, 200, fs.readFileSync(f), MIME[path.extname(f)] || 'application/octet-stream');
    }

    // vercel.json: /s/:hash -> /api/share?h=:hash
    const shareMatch = /^\/s\/([^/]+)$/.exec(p);
    if (shareMatch) {
      url.pathname = '/api/share';
      url.searchParams.set('h', shareMatch[1]);
      return useStubs ? stubApi(req, res, url) : send(res, 501, '/api not served (pass --stub-api)');
    }

    if (p.startsWith('/api/')) {
      return useStubs ? stubApi(req, res, url) : send(res, 501, '/api not served (pass --stub-api)');
    }

    const ext = path.extname(p);
    if (ext) {
      const file = path.join(ROOT, p);
      if (file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        return send(res, 200, fs.readFileSync(file), MIME[ext] || 'application/octet-stream');
      }
      // Mirrors the vercel.json rewrite exclusion list: these never fall
      // through to index.html.
      if (/\.(png|svg|ico|jpg|jpeg|webmanifest|json|txt|xml)$/.test(ext)) return send(res, 404, 'not found');
    }

    send(res, 200, readIndex(), 'text/html; charset=utf-8',
      { 'Cache-Control': 'no-cache, no-store, must-revalidate' });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  if (!quiet) console.log(`devserver: http://127.0.0.1:${port}  (stubApi=${useStubs})`);
  return { server, port, url: `http://127.0.0.1:${port}`, close: () => new Promise(r => server.close(r)) };
}

// Run standalone when invoked directly.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start({ stubApi: process.argv.includes('--stub-api') }).catch(e => {
    console.error('devserver: ' + e.message);
    process.exit(1);
  });
}
