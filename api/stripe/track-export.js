import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FREE_MONTHLY_LIMIT = 3;

// CORS helper
function getAllowedOrigin(req) {
  const origin = req.headers?.origin || '';
  const allowed = ['https://tappymaps.com', 'http://localhost:8000', 'http://localhost:3000'];
  return allowed.includes(origin) ? origin : 'https://tappymaps.com';
}

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const headers = corsHeaders(req);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  // Verify JWT
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  // Check if user is Pro (has active subscription)
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing'])
    .single();

  if (sub) {
    return res.status(200).json({ allowed: true, isPro: true, remaining: Infinity });
  }

  // Free user — check/increment monthly export count
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: existing } = await supabase
    .from('export_counts')
    .select('id, count')
    .eq('user_id', user.id)
    .eq('month', monthKey)
    .single();

  const currentCount = existing?.count || 0;
  const remaining = Math.max(0, FREE_MONTHLY_LIMIT - currentCount);

  // Parse action from body
  const action = req.body?.action || 'check';
  if (action === 'check') {
    return res.status(200).json({
      allowed: currentCount < FREE_MONTHLY_LIMIT,
      isPro: false,
      remaining
    });
  }

  if (action === 'increment') {
    if (currentCount >= FREE_MONTHLY_LIMIT) {
      return res.status(200).json({ allowed: false, isPro: false, remaining: 0 });
    }

    if (existing) {
      const { error: updateErr } = await supabase
        .from('export_counts')
        .update({ count: existing.count + 1, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (updateErr) {
        console.error('Failed to update export count:', updateErr);
        return res.status(500).json({ error: 'Failed to update export count' });
      }
    } else {
      const { error: insertErr } = await supabase
        .from('export_counts')
        .insert({ user_id: user.id, month: monthKey, count: 1 });
      if (insertErr) {
        console.error('Failed to insert export count:', insertErr);
        return res.status(500).json({ error: 'Failed to insert export count' });
      }
    }

    const newRemaining = Math.max(0, FREE_MONTHLY_LIMIT - (currentCount + 1));
    return res.status(200).json({ allowed: true, isPro: false, remaining: newRemaining });
  }

  return res.status(400).json({ error: 'Invalid action. Use "check" or "increment".' });
}
