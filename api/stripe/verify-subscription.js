import { createClient } from '@supabase/supabase-js';

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

    // Query user_subscriptions table for active or trialing subscriptions
    const { data: subscriptions, error: queryError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .single(); // Assume one active subscription per user

    if (queryError && queryError.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is fine
      throw queryError;
    }

    const isPro = !!subscriptions;
    const subscription = subscriptions
      ? {
          id: subscriptions.stripe_subscription_id,
          status: subscriptions.status,
          currentPeriodEnd: subscriptions.current_period_end,
          priceId: subscriptions.price_id,
        }
      : null;

    res.status(200).json({ isPro, subscription });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: error.message });
  }
}
