#!/usr/bin/env node
// Static checks for the $9/$72 plan-based checkout wiring (no Stripe needed).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); failed++; } else console.log('ok:', msg); };

const html = readFileSync(join(root, 'index.html'), 'utf8');
const checkout = readFileSync(join(root, 'api/stripe/create-checkout.js'), 'utf8');

assert(/\$9\/month/.test(html), 'upgrade modal shows $9/month');
assert(/\$72\/year/.test(html), 'upgrade modal shows $72/year');
assert(/Classroom \$12/.test(html) || /\$12 <span>\/ month/.test(html) || /Classroom<\/h2>[\s\S]*\$12/.test(html), 'pricing shows Classroom $12');
assert(/pricing-price">\$9/.test(html), 'pricing page shows $9');
assert(/startStripeCheckout\('monthly'\)/.test(html), 'monthly button uses plan key');
assert(/startStripeCheckout\('annual'\)/.test(html), 'annual button uses plan key');
assert(/startClassroomCheckout|startStripeCheckout\('classroom'\)/.test(html), 'classroom checkout wired');
assert(/exportWorksheetPack/.test(html), 'worksheet pack export present');
assert(/classroom_codes|classroomCreateOrRefreshCode/.test(html), 'class code helpers present');
assert(/Router\.register\('class'/.test(html), 'class join route registered');
assert(!/startStripeCheckout\('price_/.test(html), 'client no longer posts legacy price IDs');
assert(/Existing \$5 subscribers keep their rate/.test(html), 'grandfather copy on pricing page');

assert(/STRIPE_PRO_MONTHLY_PRICE_ID/.test(checkout), 'checkout reads monthly env price');
assert(/STRIPE_PRO_ANNUAL_PRICE_ID/.test(checkout), 'checkout reads annual env price');
assert(/STRIPE_CLASSROOM_MONTHLY_PRICE_ID/.test(checkout), 'checkout reads classroom env price');
assert(/plan === 'classroom'/.test(checkout), 'checkout resolves classroom plan');
assert(/price_1THabF6MmI5fTYyY4WNuFwHe/.test(checkout), 'legacy monthly ID retained for reject path');
assert(/grandfather/i.test(checkout), 'checkout documents grandfathering');

if (failed) {
  console.error(`checkout-plan-smoke: ${failed} failure(s)`);
  process.exit(1);
}
console.log('checkout-plan-smoke: PASS');
