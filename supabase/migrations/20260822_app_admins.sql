-- Owner accounts entitled at the database layer — 2026-08-22
--
-- Follows 20260822_schema_v2.sql, which moved entitlement enforcement into
-- RLS. The client has granted Pro + Classroom to ADMIN_EMAILS since long
-- before that, so without this the owner accounts would see a Classroom UI
-- while Postgres refused their cloud-sync writes and class-code creation.
-- The UI and the database disagreeing about the same user is worse than
-- either answer on its own.
--
-- Found because the one live subscription row belongs to max@mapparatus.org
-- and its period ended over three months ago: entitled in the UI, refused by
-- RLS.

create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.app_admins is
  'Owner accounts, entitled to every tier. Mirrors ADMIN_EMAILS in index.html. Service role only — no client policies.';

alter table public.app_admins enable row level security;

-- Deliberately no policies: RLS with none denies every client, so only the
-- service role and SECURITY DEFINER functions can read this.
revoke all on table public.app_admins from anon, authenticated;

-- Seeded by email so the ids cannot drift onto the wrong account.
insert into public.app_admins (user_id, note)
select id, 'owner — mirrors ADMIN_EMAILS'
from auth.users
where email in ('max@mapparatus.org', 'mhowe.gis@gmail.com')
on conflict (user_id) do nothing;

-- Admins resolve to the highest tier; everyone else falls through to their
-- subscription exactly as before.
create or replace function public.active_subscription_tier()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from public.app_admins a where a.user_id = auth.uid())
      then 'classroom'
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

revoke all on function public.active_subscription_tier() from public, anon;
grant execute on function public.active_subscription_tier() to authenticated;

-- Verified by impersonating each account's JWT claims:
--   max@mapparatus.org    -> classroom (admin; subscription expired 3mo ago)
--   mhowe.gis@gmail.com   -> classroom (admin; no subscription row at all)
--   random authenticated  -> null
--   anonymous             -> null
