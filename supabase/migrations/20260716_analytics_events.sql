-- Analytics events — re-enables the fire-and-forget insert that trackEvent()
-- lost when the old "tappymaps" Supabase project died (commit 77e8b99).
-- Run this against the LIVE project (tylnxovujbhdmagugjew, "mapparatus") via
-- the Supabase dashboard SQL editor or `supabase db push`.
--
-- Write model: the browser inserts directly with the publishable (anon) key,
-- so the policy is insert-only for anon/authenticated. Nobody but the
-- service role can read — analytics are queried from the dashboard.

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null,
  path text,
  session_id text,
  user_id uuid,
  meta jsonb not null default '{}'::jsonb
);

alter table public.analytics_events enable row level security;

drop policy if exists "anon can insert analytics" on public.analytics_events;
create policy "anon can insert analytics"
  on public.analytics_events
  for insert
  to anon, authenticated
  with check (true);

-- No select/update/delete policies: reads are service-role only.

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at);
create index if not exists analytics_events_event_idx
  on public.analytics_events (event);
