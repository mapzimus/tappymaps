-- Remove the Classroom tier
-- =========================
-- Tappymaps is not a school product. The Classroom tier ($12/mo — class codes
-- and printable worksheet packs) shipped in schema v2 but was never the right
-- shape for what this is, and is being removed from the product entirely.
--
-- Safe to run destructively: verified before writing this migration that
-- production holds 0 rows in classroom_codes and 0 user_subscriptions rows at
-- tier 'classroom'. Nobody loses access and no paid customer is affected.
--
-- After this there is exactly ONE paid tier: 'pro'. has_subscription() keeps
-- its required_tier argument so a future second tier stays a one-line change
-- rather than a rewrite of every policy that calls it.

-- 1) The anon-callable lookup goes first — it depends on classroom_codes.
drop function if exists public.classroom_lookup(text);

-- 2) The table, and with it the two RLS policies that referenced
--    has_subscription('classroom').
drop table if exists public.classroom_codes cascade;

-- 3) Owner accounts get 'pro', not a tier that no longer exists.
--    (Supersedes the definition in 20260822_app_admins.sql.)
create or replace function public.active_subscription_tier()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from public.app_admins a where a.user_id = auth.uid())
      then 'pro'
    else (
      select s.tier
      from public.user_subscriptions s
      where s.user_id = auth.uid()
        and s.status in ('active', 'trialing', 'past_due')
        and (s.current_period_end is null or now() < s.current_period_end + interval '3 days')
      limit 1
    )
  end;
$$;

-- 4) Drop the classroom-implies-pro special case. With one paid tier the
--    generic equality check is the whole rule.
create or replace function public.has_subscription(required_tier text default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.active_subscription_tier() is null then false
    when required_tier is null then true
    else public.active_subscription_tier() = required_tier
  end;
$$;

-- 5) Normalise any stray row rather than leaving a tier the code no longer
--    understands. Expected to affect 0 rows.
update public.user_subscriptions set tier = 'pro' where tier = 'classroom';

-- 6) Re-assert the grant posture from schema v2 for the redefined functions.
revoke all on function public.active_subscription_tier() from public;
revoke all on function public.has_subscription(text) from public;
grant execute on function public.active_subscription_tier() to authenticated;
grant execute on function public.has_subscription(text) to authenticated;
