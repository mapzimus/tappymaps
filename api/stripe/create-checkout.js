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

// Server-side allowlist of accepted Stripe priceIds. Client could otherwise
// post any priceId from the same Stripe account (e.g. a $0.01 test price)
// and check out at that price.
const ALLOWED_PRICE_IDS = new Set([
  'price_1THabF6MmI5fTYyY4WNuFwHe', // Monthly $5
  'price_1THabF6MmI5fTYyYwzIwTNKF', // Annual $48
]);

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
    const { priceId } = req.body;

    // Validate priceId against the server-side allowlist. Ignores client-
    // supplied successUrl/cancelUrl entirely — both are computed below from
    // the validated request origin so a malicious client can't redirect
    // post-checkout to a phishing host.
    if (!ALLOWED_PRICE_IDS.has(priceId)) {
      res.status(400).json({ error: 'Invalid priceId' });
      return;
    }

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
    const successUrl = `${origin}/?checkout=success`;
    const cancelUrl = `${origin}/?checkout=cancel`;

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
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
}
