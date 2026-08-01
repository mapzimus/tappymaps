-- Cloud My Maps (A2) — MapChart-Plus-style saved maps that sync across devices.
-- Run against the LIVE project (tylnxovujbhdmagugjew, "mapparatus") via the
-- Supabase SQL editor or `supabase db push`.
--
-- Product model:
--   • Free / anon: localStorage My Maps only (device-local)
--   • Pro (authenticated): rows in this table, RLS-scoped to auth.uid()
-- Recent / Featured publish is deferred (is_public / is_featured reserved).

create table if not exists public.user_maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hash text not null,
  title text not null default 'Untitled map',
  subtitle text not null default '',
  theme text,
  palette_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_featured boolean not null default false,
  is_public boolean not null default false,
  is_deleted boolean not null default false,
  constraint user_maps_user_hash_unique unique (user_id, hash)
);

comment on table public.user_maps is
  'Pro cloud My Maps. hash is the same btoa(JSON) state used by /design/make#<hash> and /api/render.';

alter table public.user_maps enable row level security;

-- Own rows only. Soft-deleted rows stay visible to the owner so upserts can
-- revive them; the client filters is_deleted=false for the Gallery grid.
drop policy if exists "users select own maps" on public.user_maps;
create policy "users select own maps"
  on public.user_maps
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users insert own maps" on public.user_maps;
create policy "users insert own maps"
  on public.user_maps
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users update own maps" on public.user_maps;
create policy "users update own maps"
  on public.user_maps
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users delete own maps" on public.user_maps;
create policy "users delete own maps"
  on public.user_maps
  for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists user_maps_user_updated_idx
  on public.user_maps (user_id, updated_at desc)
  where is_deleted = false;

create index if not exists user_maps_featured_idx
  on public.user_maps (is_featured, updated_at desc)
  where is_featured = true and is_deleted = false and is_public = true;
