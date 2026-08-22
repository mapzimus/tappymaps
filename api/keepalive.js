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

// Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations
// when CRON_SECRET is set in the project environment. Without this check the
// endpoint is an unauthenticated, service-role-backed database call that
// anyone can hammer. Left open (with a warning) when the secret is unset, so
// adding this cannot silently break the keepalive that stops the project
// pausing — which would be a worse outcome than an exposed no-op query.
function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: true, unprotected: true };
  const header = req.headers?.authorization || '';
  return { ok: header === `Bearer ${secret}`, unprotected: false };
}

export default async function handler(req, res) {
  const auth = authorized(req);
  if (!auth.ok) {
    return res.status(401).json({ ok: false });
  }
  if (auth.unprotected) {
    console.warn('keepalive: CRON_SECRET is not set — this endpoint is publicly callable.');
  }

  try {
    const { error } = await supabase
      .from('user_subscriptions')
      .select('id', { count: 'exact', head: true });
    if (error) {
      // Log the detail, return none: the message can name tables, columns and
      // policy failures, and this endpoint may be reachable by anyone.
      console.error('keepalive query failed:', error.message);
      return res.status(500).json({ ok: false });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('keepalive error:', err);
    return res.status(500).json({ ok: false });
  }
}
