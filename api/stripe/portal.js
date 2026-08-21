// Stripe Billing Portal session.
//
// The product says "Cancel anytime" and, until now, offered no way to do it:
// no cancellation path, no way to update a card, no invoice history. A
// subscriber's only recourse was to email someone. The portal is Stripe's
// hosted surface for all of that, so this handler just authenticates the
// caller, finds their customer id, and hands back a one-time URL.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Pin the return URL to an origin we control. Accepting one from the request
// body would turn this into an open redirect off the back of an authenticated
// action — the same reasoning behind the checkout handler's pinned URLs.
function returnUrl(req) {
  const origin = allowedOrigins.includes(req.headers.origin)
    ? req.headers.origin
    : 'https://tappymaps.com';
  return origin + '/design/make';
}

export default async function handler(req, res) {
  Object.entries(getCorsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Sign in to manage your subscription.' });
      return;
    }

    const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
    if (error || !data.user) {
      res.status(401).json({ error: 'Your session has expired. Sign in again.' });
      return;
    }

    const { data: row, error: queryError } = await supabase
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (queryError && queryError.code !== 'PGRST116') throw queryError;

    if (!row || !row.stripe_customer_id) {
      // Not an error state — a free user simply has nothing to manage. Say so
      // in words they can act on rather than returning a bare 404.
      res.status(404).json({ error: 'No subscription found for this account.' });
      return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: returnUrl(req),
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    // Log the detail, return a message the user can act on. Stripe errors name
    // internal configuration ("No configuration provided...") that belongs in
    // the logs, not in front of a customer.
    console.error('Billing portal error:', err);
    res.status(500).json({ error: 'Could not open the billing portal. Please try again.' });
  }
}
