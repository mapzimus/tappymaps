#!/usr/bin/env node
// Tappymaps JS-block validator — cross-platform, zero-dependency.
//
// The entire app is one file (index.html) with TWO inline <script> blocks:
//   Block 0 — the main app (router, editor, games, ~350k chars)
//   Block 1 — the Mobile-UX IIFE (~34k chars)
// A syntax error in Block 0 silently kills init() while Block 1 still runs,
// producing partial breakage that's painful to diagnose. This script extracts
// both inline blocks and `node --check`s them via vm.compileFunction, so a
// bad edit fails loudly BEFORE it can reach master.
//
// Usage:  node scripts/validate.mjs   (exit 0 = all blocks parse, non-zero = fail)
// Note:   parse-only. It cannot catch runtime TDZ errors (e.g. reading
//         fipsToState at the top of the Arcade block) — that's what
//         scripts/smoke.mjs is for.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

// Match only inline <script> blocks (skip <script src="...">).
const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m;
let idx = 0;
let failures = 0;
const blocks = [];
while ((m = re.exec(html)) !== null) blocks.push(m[1]);

if (blocks.length === 0) {
  console.error('validate: no inline <script> blocks found — did index.html move?');
  process.exit(2);
}

for (const code of blocks) {
  try {
    vm.compileFunction(code, [], { parsingContext: vm.createContext() });
    console.log(`Block ${idx} (${code.length} chars): PASS`);
  } catch (e) {
    console.error(`Block ${idx} (${code.length} chars): FAIL — ${e.message}`);
    failures++;
  }
  idx++;
}

if (failures > 0) {
  console.error(`\nvalidate: ${failures} block(s) failed to parse.`);
  process.exit(1);
}
console.log(`\nvalidate: all ${blocks.length} block(s) OK.`);
