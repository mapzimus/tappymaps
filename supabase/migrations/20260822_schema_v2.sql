-- Tappymaps schema v2 — 2026-08-22
--
-- Replaces the three unapplied 2026-08-01 migrations. Those were written but
-- never run, so cloud My Maps sync, the public gallery, and the $12/mo
-- Classroom tier have never worked in production. Rather than replay them, the
-- schema is redone with the audit's RLS findings fixed:
--
--   • classroom_codes had a broad SELECT policy, so any anonymous visitor could
--     dump every active class code, teacher UUID and class map. There is now no
--     client SELECT policy at all — joining goes through classroom_lookup(),
--     which returns only the map and its title for one active code.
--   • Minting a class code was open to any signed-in user, including free ones,
--     for a feature sold at $12/mo. Now gated on the classroom tier in the DB.
--   • user_maps writes were open to any authenticated user, so "Cloud My Maps
--     sync is Pro" was true only in the UI. Now gated on an active subscription.
--   • gallery_publish_counts was client-written with an arbitrary value, so the
--     publish rate limit reset itself. The counter is now only writable through
--     gallery_claim_publish_slot(), which increments atomically server-side.
--   • map_reports was readable by clients. Reports are now write-only from the
--     client; only the service role can read them.
--
-- Also codifies the RLS already live on user_subscriptions and export_counts,
-- which had no migration in the repo and so could not be reviewed.
--
-- Idempotent and additive: safe to run more than once, and it drops nothing.

-- ---------------------------------------------------------------------------
-- 0. Entitlement helpers
-- ---------------------------------------------------------------------------

-- The webhook knows the Stripe price IDs from its environment; the database
-- does not. Storing the resolved tier lets RLS distinguish Pro from Classroom
-- without teaching Postgres about Stripe.
alter table public.user_subscriptions
  add column if not exists tier text;

comment on column public.user_subscriptions.tier is
  'Resolved plan: pro | classroom. Written by api/stripe/webhook.js from the price id.';

-- Mirrors the grace logic in api/stripe/verify-subscription.js: past_due still
-- entitles (the current period is paid for), and a stored row stops entitling
-- once its period has been over for more than three days.
create or replace function public.active_subscription_tier()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.tier
  from public.user_subscriptions s
  where s.user_id = auth.uid()
    and s.status in ('active', 'trialing', 'past_due')
    and (s.current_period_end is null or now() < s.current_period_end + interval '3 days')
  limit 1;
$$;

comment on function public.active_subscription_tier is
  'Tier for the calling user, or null. Used by RLS so paid features are enforced in the database, not only in the UI.';

-- Classroom includes every Pro entitlement, so it satisfies a 'pro' requirement.
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
    when required_tier = 'pro' then public.active_subscription_tier() in ('pro', 'classroom')
    else public.active_subscription_tier() = required_tier
  end;
$$;

-- ---------------------------------------------------------------------------
-- 1. user_maps — cloud My Maps + the public gallery
-- ---------------------------------------------------------------------------

create table if not exists public.user_maps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  hash        text not null,
  title       text not null default 'Untitled map',
  subtitle    text not null default '',
  theme       text,
  is_public   boolean not null default false,
  is_featured boolean not null default false,
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint user_maps_hash_len check (char_length(hash) between 1 and 65536),
  constraint user_maps_title_len check (char_length(title) <= 200)
);

-- The client upserts with onConflict 'user_id,hash'.
create unique index if not exists user_maps_user_hash_key
  on public.user_maps (user_id, hash);

create index if not exists user_maps_owner_idx
  on public.user_maps (user_id, updated_at desc)
  where is_deleted = false;

create index if not exists user_maps_public_recent_idx
  on public.user_maps (updated_at desc)
  where is_public = true and is_deleted = false;

alter table public.user_maps enable row level security;

drop policy if exists "owner reads own maps" on public.user_maps;
create policy "owner reads own maps"
  on public.user_maps for select to authenticated
  using (auth.uid() = user_id);

-- Anyone may read published maps. Deliberately open: this is the public feed.
drop policy if exists "anyone reads published maps" on public.user_maps;
create policy "anyone reads published maps"
  on public.user_maps for select to anon, authenticated
  using (is_public = true and is_deleted = false);

-- Writes require a subscription. The UI called cloud sync a Pro feature while
-- the database let any signed-in account write.
drop policy if exists "subscribers write own maps" on public.user_maps;
create policy "subscribers write own maps"
  on public.user_maps for insert to authenticated
  with check (auth.uid() = user_id and public.has_subscription('pro'));

drop policy if exists "subscribers update own maps" on public.user_maps;
create policy "subscribers update own maps"
  on public.user_maps for update to authenticated
  using (auth.uid() = user_id and public.has_subscription('pro'))
  with check (auth.uid() = user_id);

-- Deletion is a soft delete via is_deleted, so no DELETE policy is granted.

-- Editorial picks are ours to make. Without this a client could feature itself.
create or replace function public.user_maps_lock_featured()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_featured := false;
  else
    new.is_featured := old.is_featured;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_maps_lock_featured on public.user_maps;
create trigger user_maps_lock_featured
  before insert or update on public.user_maps
  for each row execute function public.user_maps_lock_featured();

-- ---------------------------------------------------------------------------
-- 2. map_reports — abuse reports on published maps
-- ---------------------------------------------------------------------------

create table if not exists public.map_reports (
  id               uuid primary key default gen_random_uuid(),
  map_id           uuid not null references public.user_maps (id) on delete cascade,
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  reason           text not null default 'unspecified',
  created_at       timestamptz not null default now(),
  constraint map_reports_reason_len check (char_length(reason) <= 500)
);

-- One report per user per map: re-reporting should not inflate a queue.
create unique index if not exists map_reports_unique_reporter
  on public.map_reports (map_id, reporter_user_id);

create index if not exists map_reports_map_idx on public.map_reports (map_id);

alter table public.map_reports enable row level security;

-- Write-only from the client. Who reported what is not public information, and
-- there is no legitimate client read: moderation happens service-side.
drop policy if exists "signed-in users file reports" on public.map_reports;
create policy "signed-in users file reports"
  on public.map_reports for insert to authenticated
  with check (auth.uid() = reporter_user_id);

-- ---------------------------------------------------------------------------
-- 3. gallery_publish_counts — daily publish rate limit
-- ---------------------------------------------------------------------------

create table if not exists public.gallery_publish_counts (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.gallery_publish_counts enable row level security;

-- Read your own counter so the UI can show remaining publishes. No client
-- INSERT or UPDATE policy: the counter used to be a client-written value, which
-- meant the rate limit reset itself on request.
drop policy if exists "owner reads own publish count" on public.gallery_publish_counts;
create policy "owner reads own publish count"
  on public.gallery_publish_counts for select to authenticated
  using (auth.uid() = user_id);

/**
 * Atomically claim one publish slot for today.
 *
 * Takes no limit argument on purpose: the previous design let the client write
 * the counter directly, so the rate limit reset itself on request. The tier
 * decides the allowance here, and the check and increment happen in one
 * statement so two parallel publishes cannot both slip under it.
 */
create or replace function public.gallery_claim_publish_slot()
returns table (allowed boolean, used integer, remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  new_count integer;
  current_count integer;
  effective_limit integer;
begin
  if uid is null then
    return query select false, 0, 0;
    return;
  end if;

  effective_limit := case when public.has_subscription('pro') then 20 else 5 end;

  insert into public.gallery_publish_counts as g (user_id, day, count, updated_at)
  values (uid, today, 1, now())
  on conflict (user_id, day) do update
    set count = g.count + 1, updated_at = now()
    where g.count < effective_limit
  returning g.count into new_count;

  if new_count is null then
    -- The row existed and the WHERE blocked the update: already at the limit.
    select g.count into current_count
      from public.gallery_publish_counts g
      where g.user_id = uid and g.day = today;
    return query select false, coalesce(current_count, 0),
                        greatest(0, effective_limit - coalesce(current_count, 0));
    return;
  end if;

  return query select true, new_count, greatest(0, effective_limit - new_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. classroom_codes — the $12/mo Classroom tier
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_codes (
  code       text primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  map_hash   text not null,
  title      text not null default 'Class map',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classroom_codes_code_format check (code ~ '^[A-Z0-9]{6}$'),
  constraint classroom_codes_title_len check (char_length(title) <= 200)
);

create index if not exists classroom_codes_teacher_idx
  on public.classroom_codes (teacher_id, updated_at desc);

create index if not exists classroom_codes_active_idx
  on public.classroom_codes (code) where is_active = true;

alter table public.classroom_codes enable row level security;

-- Teachers manage their own codes; minting requires the Classroom tier.
drop policy if exists "teachers read own codes" on public.classroom_codes;
create policy "teachers read own codes"
  on public.classroom_codes for select to authenticated
  using (auth.uid() = teacher_id);

drop policy if exists "classroom subscribers create codes" on public.classroom_codes;
create policy "classroom subscribers create codes"
  on public.classroom_codes for insert to authenticated
  with check (auth.uid() = teacher_id and public.has_subscription('classroom'));

drop policy if exists "teachers update own codes" on public.classroom_codes;
create policy "teachers update own codes"
  on public.classroom_codes for update to authenticated
  using (auth.uid() = teacher_id and public.has_subscription('classroom'))
  with check (auth.uid() = teacher_id);

-- NOTE: there is deliberately NO policy letting students SELECT this table.
-- The previous design granted a broad read so /class/<CODE> could look a code
-- up, which also let anyone enumerate every active code, its teacher's UUID,
-- and their map. Students go through the function below instead, which returns
-- only what the join screen needs.

/**
 * Resolve one active class code to its map. Returns no rows for an unknown or
 * retired code, and never exposes teacher_id.
 */
create or replace function public.classroom_lookup(lookup_code text)
returns table (code text, map_hash text, title text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.code, c.map_hash, c.title
  from public.classroom_codes c
  where c.code = upper(trim(coalesce(lookup_code, '')))
    and c.is_active = true
  limit 1;
$$;

revoke all on function public.classroom_lookup(text) from public;
grant execute on function public.classroom_lookup(text) to anon, authenticated;

revoke all on function public.gallery_claim_publish_slot() from public;
grant execute on function public.gallery_claim_publish_slot() to authenticated;

revoke all on function public.active_subscription_tier() from public;
grant execute on function public.active_subscription_tier() to authenticated;
grant execute on function public.has_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Codify the RLS already live on the money tables
-- ---------------------------------------------------------------------------
-- These matched what is described here when inspected on 2026-08-22, but had no
-- migration in the repo, so nobody could review them without database access.

alter table public.user_subscriptions enable row level security;

drop policy if exists "Users can read own subscription" on public.user_subscriptions;
create policy "Users can read own subscription"
  on public.user_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage subscriptions" on public.user_subscriptions;
create policy "Service role can manage subscriptions"
  on public.user_subscriptions for all
  using (auth.role() = 'service_role');

alter table public.export_counts enable row level security;

drop policy if exists "Users can read own export counts" on public.export_counts;
create policy "Users can read own export counts"
  on public.export_counts for select
  using (auth.uid() = user_id);

drop policy if exists "Service role full access" on public.export_counts;
create policy "Service role full access"
  on public.export_counts for all
  using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 6. Backfill tier for rows written before the column existed
-- ---------------------------------------------------------------------------
-- RLS reads user_subscriptions.tier, so a null tier refuses a paying customer
-- at the database level. Every pre-existing row predates the Classroom tier —
-- its table did not exist until this migration — so 'pro' is the only correct
-- value for them.

update public.user_subscriptions
set tier = 'pro'
where tier is null and price_id is not null;

-- ---------------------------------------------------------------------------
-- 7. Grant hardening (from the Supabase security advisors)
-- ---------------------------------------------------------------------------
-- RLS governs rows, but PostgREST also needs a table/function GRANT to expose
-- an object at all, and Supabase grants those broadly by default. Narrow them
-- to match the policies above.

-- A trigger function has no business being reachable as an RPC.
revoke all on function public.user_maps_lock_featured() from public, anon, authenticated;

revoke all on function public.active_subscription_tier() from public, anon;
revoke all on function public.has_subscription(text) from public, anon;
grant execute on function public.active_subscription_tier() to authenticated;
grant execute on function public.has_subscription(text) to authenticated;

revoke all on function public.gallery_claim_publish_slot() from public, anon;
grant execute on function public.gallery_claim_publish_slot() to authenticated;

-- classroom_lookup stays anon-callable ON PURPOSE: students joining a class
-- are not signed in.
grant execute on function public.classroom_lookup(text) to anon, authenticated;

-- user_maps keeps anon SELECT — the public gallery feed is the point.
revoke select on table public.classroom_codes from anon;
revoke select on table public.gallery_publish_counts from anon;
revoke select on table public.user_subscriptions from anon;
revoke select on table public.export_counts from anon;

-- Reports are write-only from any client.
revoke select on table public.map_reports from anon, authenticated;
grant insert on table public.map_reports to authenticated;
