import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Only used on the slow path, when a stored row has outlived its paid period.
// Without it, reconciliation cannot run and a stale row keeps granting Pro
// indefinitely — so say so loudly rather than degrading in silence.
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
if (!stripe) {
  console.warn(
    'verify-subscription: STRIPE_SECRET_KEY is not set — expired subscription rows ' +
    'cannot be reconciled and will keep granting Pro. Set it in the deployment environment.'
  );
}

// CORS headers — allow production and localhost dev
const allowedOrigins = [
  'https://tappymaps.com',
  'http://localhost:3000',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8000',
];

function getCorsHeaders(req) {
  const origin = req.headers.origin;
  const allowed = allowedOrigins.includes(origin) ? origin : 'https://tappymaps.com';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function classroomPriceId() {
  return process.env.STRIPE_CLASSROOM_MONTHLY_PRICE_ID || '';
}

// Statuses Stripe considers still-entitling. `past_due` is included for the
// same reason as in the query below: the current period is already paid for.
const ENTITLING = new Set(['active', 'trialing', 'past_due']);

/**
 * Ask Stripe for the truth about a row whose stored period has already ended,
 * and repair the row. Used only on the slow path, so a dropped webhook costs
 * one extra API call rather than an unbounded free subscription.
 *
 * Fails OPEN on a Stripe/network error: a paying customer must not lose access
 * because a third party had a bad minute. The row is left untouched so the
 * next request retries.
 *
 * @returns {Promise<boolean>} whether the user is still entitled
 */
async function reconcileWithStripe(row, userId) {
  if (!row?.stripe_subscription_id || !stripe) return true;
  let live;
  try {
    live = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
  } catch (err) {
    if (err?.statusCode === 404 || err?.code === 'resource_missing') {
      // The subscription genuinely no longer exists at Stripe.
      await supabase
        .from('user_subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', row.stripe_subscription_id);
      return false;
    }
    console.error('reconcileWithStripe: Stripe lookup failed, failing open —', err?.message || err);
    return true;
  }

  const item = live.items?.data?.[0];
  const periodEnd = live.current_period_end ?? item?.current_period_end;
  const periodStart = live.current_period_start ?? item?.current_period_start;

  const patch = {
    status: live.status,
    updated_at: new Date().toISOString(),
  };
  if (periodStart) patch.current_period_start = new Date(periodStart * 1000).toISOString();
  if (periodEnd) patch.current_period_end = new Date(periodEnd * 1000).toISOString();
  if (item?.price?.id) patch.price_id = item.price.id;

  const { error: repairError } = await supabase
    .from('user_subscriptions')
    .update(patch)
    .eq('stripe_subscription_id', row.stripe_subscription_id);
  if (repairError) console.error('reconcileWithStripe: row repair failed —', repairError.message);

  // Mutate the caller's copy so the response reflects reconciled truth.
  Object.assign(row, patch);
  return ENTITLING.has(live.status);
}

// Handle preflight
export default async function handler(req, res) {
  // Set CORS headers
  const corsHeaders = getCorsHeaders(req);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Get Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.slice(7); // Remove "Bearer "

    // Verify JWT with Supabase
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const userId = data.user.id;

    // Query user_subscriptions for any subscription that could still entitle
    // the user. `past_due` is included deliberately: Stripe keeps a
    // subscription usable through the dunning window, and the customer has
    // already paid for the current period. Revoking on the first failed charge
    // punishes an expired card mid-period — the period-end check below is what
    // actually ends access.
    const { data: subscriptions, error: queryError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing', 'past_due'])
      .maybeSingle(); // Assume one subscription row per user

    if (queryError && queryError.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is fine
      throw queryError;
    }

    // A stored row is not proof of entitlement forever. If a
    // customer.subscription.deleted or .updated webhook is ever dropped, the
    // row keeps saying "active" and the user keeps Pro indefinitely. Treat the
    // row as authoritative only while the paid period it describes is still
    // running, plus a short grace window for clock skew and renewal webhooks
    // that arrive slightly late.
    const GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
    let entitled = !!subscriptions;
    let staleReason = null;

    if (subscriptions) {
      const periodEnd = subscriptions.current_period_end
        ? Date.parse(subscriptions.current_period_end)
        : NaN;
      if (Number.isFinite(periodEnd) && Date.now() > periodEnd + GRACE_MS) {
        // The row has outlived its period. Ask Stripe directly rather than
        // guessing, and repair the row so the next check hits the fast path.
        staleReason = 'period_ended';
        entitled = await reconcileWithStripe(subscriptions, userId);
      }
    }

    const isPro = entitled;
    const classPrice = classroomPriceId();
    const isClassroom = !!(entitled && classPrice && subscriptions && subscriptions.price_id === classPrice);
    const tier = isClassroom ? 'classroom' : (isPro ? 'pro' : 'free');
    const subscription = (subscriptions && entitled)
      ? {
          id: subscriptions.stripe_subscription_id,
          status: subscriptions.status,
          currentPeriodEnd: subscriptions.current_period_end,
          priceId: subscriptions.price_id,
          tier: tier,
        }
      : null;
    if (staleReason) console.warn(`verify-subscription: ${staleReason} for user ${userId}, entitled=${entitled}`);

    // Classroom includes every Pro entitlement; clients also read isClassroom
    // for teacher-only tools (class code + worksheet pack).
    res.status(200).json({ isPro, isClassroom, tier, subscription });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: error.message });
  }
}
