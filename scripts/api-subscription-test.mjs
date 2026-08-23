#!/usr/bin/env node
// Entitlement-lifetime tests for api/stripe/verify-subscription.js and the raw
// body reader in api/stripe/webhook.js.
//
// These cover the money path, which had no tests at all. Supabase and Stripe
// are stubbed via a module loader hook so the handler runs unmodified — no
// production credentials, no network.
//
// Usage: node scripts/api-subscription-test.mjs

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// ---- module stubs ---------------------------------------------------------
// State the fake clients read from, reset per case.
globalThis.__TEST = { row: null, stripeSub: null, stripeError: null, updates: [], retrieves: [] };

// Must be set BEFORE importing the handlers: they build their clients at module
// scope. Writing this test is what surfaced that a missing STRIPE_SECRET_KEY
// makes verify-subscription's reconcile path silently fail open — the handler
// now warns about that at startup.
process.env.STRIPE_SECRET_KEY = 'sk_test_stub';
process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_stub';

register('./test-stubs/loader.mjs', import.meta.url);

const { default: verifyHandler } = await import('../api/stripe/verify-subscription.js');
const webhookMod = await import('../api/stripe/webhook.js');
const { default: portalHandler } = await import('../api/stripe/portal.js');

// ---- helpers --------------------------------------------------------------
function makeReqRes(overrides = {}) {
  const res = {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  const req = {
    method: 'GET',
    headers: { authorization: 'Bearer test-token', origin: 'https://tappymaps.com' },
    ...overrides,
  };
  return { req, res };
}

const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString();
const DAY = 24 * 60 * 60 * 1000;

let passed = 0;
const failures = [];
async function test(name, fn) {
  globalThis.__TEST = { row: null, stripeSub: null, stripeError: null, updates: [], retrieves: [] };
  try {
    await fn();
    console.log('  ✅ ' + name);
    passed++;
  } catch (e) {
    console.log('  ❌ ' + name + ' — ' + e.message);
    failures.push(name + ': ' + e.message);
  }
}

// ---- verify-subscription --------------------------------------------------
console.log('\nverify-subscription — entitlement lifetime');

await test('active subscription inside its period is Pro', async () => {
  globalThis.__TEST.row = { user_id: 'u1', status: 'active', current_period_end: iso(10 * DAY), stripe_subscription_id: 'sub_1', price_id: 'price_pro' };
  const { req, res } = makeReqRes();
  await verifyHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.isPro, true);
  assert.equal(res.body.tier, 'pro');
  assert.equal(globalThis.__TEST.retrieves.length, 0, 'should not call Stripe on the fast path');
});

await test('no subscription row is free', async () => {
  const { req, res } = makeReqRes();
  await verifyHandler(req, res);
  assert.equal(res.body.isPro, false);
  assert.equal(res.body.subscription, null);
});

await test('past_due inside its paid period keeps Pro (dunning window)', async () => {
  globalThis.__TEST.row = { user_id: 'u1', status: 'past_due', current_period_end: iso(5 * DAY), stripe_subscription_id: 'sub_1', price_id: 'price_pro' };
  const { req, res } = makeReqRes();
  await verifyHandler(req, res);
  assert.equal(res.body.isPro, true, 'a failed charge must not revoke a period already paid for');
});

await test('row whose period ended is re-checked against Stripe, and renewal restores Pro', async () => {
  globalThis.__TEST.row = { user_id: 'u1', status: 'active', current_period_end: iso(-30 * DAY), stripe_subscription_id: 'sub_1', price_id: 'price_pro' };
  globalThis.__TEST.stripeSub = { status: 'active', current_period_end: Math.floor((Date.now() + 20 * DAY) / 1000), current_period_start: Math.floor(Date.now() / 1000), items: { data: [{ price: { id: 'price_pro' } }] } };
  const { req, res } = makeReqRes();
  await verifyHandler(req, res);
  assert.equal(globalThis.__TEST.retrieves.length, 1, 'stale row must consult Stripe');
  assert.equal(res.body.isPro, true);
  assert.ok(globalThis.__TEST.updates.length >= 1, 'stale row should be repaired');
});

await test('row whose period ended and was canceled at Stripe loses Pro', async () => {
  globalThis.__TEST.row = { user_id: 'u1', status: 'active', current_period_end: iso(-30 * DAY), stripe_subscription_id: 'sub_1', price_id: 'price_pro' };
  globalThis.__TEST.stripeSub = { status: 'canceled', current_period_end: Math.floor((Date.now() - 20 * DAY) / 1000), items: { data: [{ price: { id: 'price_pro' } }] } };
  const { req, res } = makeReqRes();
  await verifyHandler(req, res);
  assert.equal(res.body.isPro, false, 'a dropped deleted-webhook must not grant Pro forever');
  assert.equal(res.body.subscription, null);
});

await test('stale row within the 3-day grace window is NOT re-checked', async () => {
  globalThis.__TEST.row = { user_id: 'u1', status: 'active', current_period_end: iso(-1 * DAY), stripe_subscription_id: 'sub_1', price_id: 'price_pro' };
  const { req, res } = makeReqRes();
  await verifyHandler(req, res);
  assert.equal(globalThis.__TEST.retrieves.length, 0, 'a late renewal webhook deserves grace');
  assert.equal(res.body.isPro, true);
});

await test('Stripe outage on the slow path fails OPEN for a paying customer', async () => {
  globalThis.__TEST.row = { user_id: 'u1', status: 'active', current_period_end: iso(-30 * DAY), stripe_subscription_id: 'sub_1', price_id: 'price_pro' };
  globalThis.__TEST.stripeError = Object.assign(new Error('connection reset'), { statusCode: 503 });
  const { req, res } = makeReqRes();
  await verifyHandler(req, res);
  assert.equal(res.body.isPro, true, 'a third party having a bad minute must not revoke access');
});

await test('subscription deleted at Stripe (404) revokes and marks the row canceled', async () => {
  globalThis.__TEST.row = { user_id: 'u1', status: 'active', current_period_end: iso(-30 * DAY), stripe_subscription_id: 'sub_1', price_id: 'price_pro' };
  globalThis.__TEST.stripeError = Object.assign(new Error('No such subscription'), { statusCode: 404, code: 'resource_missing' });
  const { req, res } = makeReqRes();
  await verifyHandler(req, res);
  assert.equal(res.body.isPro, false);
  assert.ok(globalThis.__TEST.updates.some((u) => u.status === 'canceled'), 'row should be marked canceled');
});

await test('a live subscription reports the pro tier and nothing else', async () => {
  // There is exactly one paid tier. RLS reads user_subscriptions.tier, so a
  // response that omits or invents a tier locks a paying user out at the
  // database layer even though checkout succeeded.
  globalThis.__TEST.row = { user_id: 'u1', status: 'active', current_period_end: iso(10 * DAY), stripe_subscription_id: 'sub_1', price_id: 'price_pro' };
  const { req, res } = makeReqRes();
  await verifyHandler(req, res);
  assert.equal(res.body.isPro, true);
  assert.equal(res.body.tier, 'pro');
  assert.equal(res.body.subscription.tier, 'pro');
  assert.equal('isClassroom' in res.body, false, 'the removed classroom tier must not reappear in the payload');
});

await test('missing bearer token is rejected', async () => {
  const { req, res } = makeReqRes({ headers: { origin: 'https://tappymaps.com' } });
  await verifyHandler(req, res);
  assert.equal(res.statusCode, 401);
});

// ---- billing portal -------------------------------------------------------
console.log('\nbilling portal');

function portalReqRes(overrides = {}) {
  const { req, res } = makeReqRes({ method: 'POST', ...overrides });
  return { req, res };
}

await test('subscriber gets a portal URL', async () => {
  globalThis.__TEST.row = { user_id: 'u1', stripe_customer_id: 'cus_123' };
  const { req, res } = portalReqRes();
  await portalHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.url, 'expected a portal url');
});

await test('free user with no subscription gets an actionable 404', async () => {
  globalThis.__TEST.row = null;
  const { req, res } = portalReqRes();
  await portalHandler(req, res);
  assert.equal(res.statusCode, 404);
  assert.match(res.body.error, /No subscription/i);
});

await test('unauthenticated request is rejected', async () => {
  const { req, res } = portalReqRes({ headers: { origin: 'https://tappymaps.com' } });
  await portalHandler(req, res);
  assert.equal(res.statusCode, 401);
});

await test('GET is not allowed', async () => {
  const { req, res } = portalReqRes({ method: 'GET' });
  await portalHandler(req, res);
  assert.equal(res.statusCode, 405);
});

await test('return_url is pinned to an allowed origin, never taken from the request', async () => {
  globalThis.__TEST.row = { user_id: 'u1', stripe_customer_id: 'cus_123' };
  const { req, res } = portalReqRes({
    headers: { authorization: 'Bearer t', origin: 'https://evil.example' },
  });
  await portalHandler(req, res);
  assert.equal(res.statusCode, 200);
  const used = globalThis.__TEST.portalArgs?.return_url || '';
  assert.ok(used.startsWith('https://tappymaps.com'), `return_url was ${used}`);
});

// ---- webhook raw body -----------------------------------------------------
console.log('\nwebhook — raw body integrity');

await test('multi-byte body survives reassembly at every chunk boundary', async () => {
  const { EventEmitter } = await import('node:events');
  assert.equal(typeof webhookMod.getRawBody, 'function', 'getRawBody must be exported so this is testable');

  // Scan EVERY split offset, not one. A single hand-picked boundary can easily
  // land between characters and pass against a broken implementation — the
  // original `data += chunk` version survives most offsets and corrupts at
  // 8 of 35 for this payload (22.9%), which is exactly why the failure
  // presented as a flaky webhook rather than an obvious break.
  const payload = Buffer.from(JSON.stringify({ name: 'Renée Ångström 🗺️' }), 'utf8');
  const bad = [];
  for (let split = 1; split < payload.length; split++) {
    const req = new EventEmitter();
    const p = webhookMod.getRawBody(req);
    process.nextTick(() => {
      req.emit('data', payload.subarray(0, split));
      req.emit('data', payload.subarray(split));
      req.emit('end');
    });
    const out = await p;
    if (!Buffer.isBuffer(out) || Buffer.compare(out, payload) !== 0) bad.push(split);
  }
  assert.deepEqual(bad, [], `body corrupted at split offsets ${bad.join(',')} — signature verification would fail there`);
});

// ---- summary --------------------------------------------------------------
if (failures.length) {
  console.error(`\napi tests: FAIL — ${failures.length} of ${passed + failures.length}`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`\napi tests: all ${passed} passed.`);
