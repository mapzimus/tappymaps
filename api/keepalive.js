import { createClient } from '@supabase/supabase-js';

// Daily cron target (see vercel.json "crons"). Free-tier Supabase pauses a
// project after ~7 days without traffic, and a paused project takes down the
// entire paid funnel (sign-in, checkout, subscription verify, export quota
// all fail closed). This trivial query counts as database activity, so the
// project never goes idle long enough to pause.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { error } = await supabase
      .from('user_subscriptions')
      .select('id', { count: 'exact', head: true });
    if (error) {
      console.error('keepalive query failed:', error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('keepalive error:', err);
    return res.status(500).json({ ok: false });
  }
}
