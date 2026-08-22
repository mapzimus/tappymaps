-- Public Gallery (Phase 4) — Recent / Featured publish + light moderation.
-- Depends on 20260801_user_maps.sql (is_public / is_featured already on user_maps).
-- Run against the LIVE project (tylnxovujbhdmagugjew) after user_maps is applied.

-- Recent feed index
create index if not exists user_maps_public_recent_idx
  on public.user_maps (updated_at desc)
  where is_public = true and is_deleted = false;

-- Anyone can read published (non-deleted) maps. Own-row SELECT policy from
-- A2 still covers private My Maps for the owner.
drop policy if exists "public read published maps" on public.user_maps;
create policy "public read published maps"
  on public.user_maps
  for select
  to anon, authenticated
  using (is_public = true and is_deleted = false);

-- Clients must not self-feature. Service role / SQL as postgres can set
-- is_featured for editorial picks; authenticated JWT upserts keep the flag.
create or replace function public.user_maps_lock_featured()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('service_role') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_featured := false;
  else
    new.is_featured := old.is_featured;
  end if;
  return new;
end;
$$;

drop trigger if exists user_maps_lock_featured on public.user_maps;
create trigger user_maps_lock_featured
  before insert or update on public.user_maps
  for each row execute function public.user_maps_lock_featured();

comment on function public.user_maps_lock_featured is
  'Blocks client JWT from flipping is_featured. Feature maps via service role or disable this trigger in SQL editor.';

-- Daily publish rate limit (free 5 / Pro 20 — enforced in client; table is source of truth)
create table if not exists public.gallery_publish_counts (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default ((timezone('utc', now()))::date),
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.gallery_publish_counts enable row level security;

drop policy if exists "users select own publish counts" on public.gallery_publish_counts;
create policy "users select own publish counts"
  on public.gallery_publish_counts for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users insert own publish counts" on public.gallery_publish_counts;
create policy "users insert own publish counts"
  on public.gallery_publish_counts for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users update own publish counts" on public.gallery_publish_counts;
create policy "users update own publish counts"
  on public.gallery_publish_counts for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Light report queue (admin reviews in Supabase dashboard)
create table if not exists public.map_reports (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.user_maps (id) on delete cascade,
  reporter_user_id uuid references auth.users (id) on delete set null,
  reason text not null default '',
  reviewed boolean not null default false,
  action_taken text,
  created_at timestamptz not null default now()
);

create index if not exists map_reports_unreviewed_idx
  on public.map_reports (created_at desc)
  where reviewed = false;

alter table public.map_reports enable row level security;

drop policy if exists "users insert own map reports" on public.map_reports;
create policy "users insert own map reports"
  on public.map_reports for insert to authenticated
  with check (auth.uid() = reporter_user_id);
