#!/usr/bin/env node
// Static checks for public Gallery (Recent / Featured / publish).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); failed++; } else console.log('ok:', msg); };

const html = readFileSync(join(root, 'index.html'), 'utf8');
const migration = readFileSync(join(root, 'supabase/migrations/20260801_gallery_public.sql'), 'utf8');

assert(/function galleryFetchPublicMaps/.test(html), 'galleryFetchPublicMaps helper');
assert(/function gallerySetPublic/.test(html), 'gallerySetPublic helper');
assert(/function galleryReportMap/.test(html), 'galleryReportMap helper');
assert(/function publishCurrentMapToGallery/.test(html), 'publishCurrentMapToGallery helper');
assert(/function galleryRenderPublic/.test(html), 'galleryRenderPublic replaces coming-soon');
assert(!/galleryRenderComingSoon/.test(html), 'coming-soon gallery stub removed');
assert(/id="publishToGalleryBtn"/.test(html), 'Share panel Publish button');
assert(/GALLERY_PUBLISH_MIN_STATES\s*=\s*3/.test(html), 'quality floor is 3 states');
assert(/GALLERY_PUBLISH_LIMIT_FREE\s*=\s*5/.test(html), 'free publish limit 5/day');
assert(/GALLERY_PUBLISH_LIMIT_PRO\s*=\s*20/.test(html), 'Pro publish limit 20/day');
assert(/const tab = \(route && route\.sub\) \|\| 'recent'/.test(html), 'Gallery defaults to recent');
assert(/href="\/design\/gallery\/recent"/.test(html), 'hub/gallery links point at Recent');
assert(/data-publish=/.test(html), 'My Maps Publish control');
assert(/data-report=/.test(html), 'public cards Report control');
assert(/is_public:\s*!!makePublic|isPublic:\s*!!makePublic|opts\.isPublic/.test(html), 'upsert can set is_public');

assert(/public read published maps/.test(migration), 'RLS policy for public reads');
assert(/gallery_publish_counts/.test(migration), 'publish count table');
assert(/map_reports/.test(migration), 'map_reports table');
assert(/user_maps_lock_featured/.test(migration), 'is_featured lock trigger');

if (failed) {
  console.error(`gallery-public-smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log('gallery-public-smoke: PASS');
