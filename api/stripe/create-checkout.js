import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CORS headers — allow production and localhost dev
const allowedOrigins = [
  'https://tappymaps.com',
  'http://localhost:3000',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8000',
];

// New Pro prices ($9/mo, $72/yr) + Classroom ($12/mo) — set in Vercel env
// after creating the Prices in the Stripe Dashboard.
// Existing $5/$48 subscribers keep their Stripe Price forever; those legacy
// IDs are intentionally NOT offered for new checkouts (grandfathering).
const LEGACY_PRICE_IDS = {
  monthly: 'price_1THabF6MmI5fTYyY4WNuFwHe', // $5/mo — grandfathered
  annual: 'price_1THabF6MmI5fTYyYwzIwTNKF',  // $48/yr — grandfathered
};

function currentPriceIds() {
  return {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
    annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || '',
    classroom: process.env.STRIPE_CLASSROOM_MONTHLY_PRICE_ID || '',
  };
}

function resolvePriceId(body) {
  const { monthly, annual, classroom } = currentPriceIds();
  const plan = body && typeof body.plan === 'string' ? body.plan.trim().toLowerCase() : '';
  if (plan === 'monthly' || plan === 'month' || plan === 'pro' || plan === 'pro_monthly') {
    if (!monthly) return { error: 'Monthly Pro price is not configured (STRIPE_PRO_MONTHLY_PRICE_ID).' };
    return { priceId: monthly, plan: 'monthly' };
  }
  if (plan === 'annual' || plan === 'year' || plan === 'yearly' || plan === 'pro_annual') {
    if (!annual) return { error: 'Annual Pro price is not configured (STRIPE_PRO_ANNUAL_PRICE_ID).' };
    return { priceId: annual, plan: 'annual' };
  }
  if (plan === 'classroom' || plan === 'class' || plan === 'teacher') {
    if (!classroom) return { error: 'Classroom price is not configured (STRIPE_CLASSROOM_MONTHLY_PRICE_ID).' };
    return { priceId: classroom, plan: 'classroom' };
  }

  // Backward-compatible: accept an explicit priceId only if it matches the
  // currently configured (new) prices. Legacy $5/$48 IDs are rejected so new
  // subscribers cannot check out at the grandfathered rate.
  const priceId = body && typeof body.priceId === 'string' ? body.priceId.trim() : '';
  if (priceId && priceId === monthly) return { priceId, plan: 'monthly' };
  if (priceId && priceId === annual) return { priceId, plan: 'annual' };
  if (priceId && priceId === classroom) return { priceId, plan: 'classroom' };
  if (priceId && (priceId === LEGACY_PRICE_IDS.monthly || priceId === LEGACY_PRICE_IDS.annual)) {
    return { error: 'That price is no longer available for new subscriptions. Choose Pro or Classroom.' };
  }
  return { error: 'Invalid plan. Use plan: "monthly", "annual", or "classroom".' };
}

function getCorsHeaders(req) {
  const origin = req.headers.origin;
  const allowed = allowedOrigins.includes(origin) ? origin : 'https://tappymaps.com';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
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

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const resolved = resolvePriceId(body);
    if (resolved.error) {
      res.status(400).json({ error: resolved.error });
      return;
    }
    const { priceId, plan } = resolved;

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

    const user = data.user;
    const userId = user.id;
    const userEmail = user.email;

    // Build redirect URLs from the validated request origin (defaults to
    // production tappymaps.com if origin isn't in the allowlist). Client-
    // supplied successUrl/cancelUrl are ignored.
    const origin = allowedOrigins.includes(req.headers.origin)
      ? req.headers.origin
      : 'https://tappymaps.com';
    // Land back in the editor (where the upgrade was started), not the Hub —
    // handleCheckoutReturn() polls for Pro activation on whatever route loads.
    const successUrl = `${origin}/design/make?checkout=success`;
    const cancelUrl = `${origin}/design/make?checkout=cancel`;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: userEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        plan: plan,
        user_id: userId,
      },
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
}
