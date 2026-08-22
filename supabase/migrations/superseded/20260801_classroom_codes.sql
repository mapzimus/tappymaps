-- Classroom tier — teacher class codes that open a shared assignment map.
-- Run against the LIVE project (tylnxovujbhdmagugjew) via the SQL editor.
--
-- Product model:
--   • Classroom subscribers ($12/mo) create/rotate a short code bound to a map hash
--   • Anyone with the code can open /class/<CODE> and load that map into Create
--   • Teachers keep Pro features (isPro) plus worksheet pack + class codes

create table if not exists public.classroom_codes (
  code text primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  map_hash text not null,
  title text not null default 'Class map',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true,
  constraint classroom_codes_code_format check (code ~ '^[A-Z0-9]{6}$')
);

comment on table public.classroom_codes is
  'Teacher class codes. map_hash is the same btoa(JSON) state used by /design/make#<hash>.';

create index if not exists classroom_codes_teacher_idx
  on public.classroom_codes (teacher_id, updated_at desc);

alter table public.classroom_codes enable row level security;

-- Teachers manage their own codes.
drop policy if exists "teachers select own codes" on public.classroom_codes;
create policy "teachers select own codes"
  on public.classroom_codes
  for select
  to authenticated
  using (auth.uid() = teacher_id);

drop policy if exists "teachers insert own codes" on public.classroom_codes;
create policy "teachers insert own codes"
  on public.classroom_codes
  for insert
  to authenticated
  with check (auth.uid() = teacher_id);

drop policy if exists "teachers update own codes" on public.classroom_codes;
create policy "teachers update own codes"
  on public.classroom_codes
  for update
  to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

drop policy if exists "teachers delete own codes" on public.classroom_codes;
create policy "teachers delete own codes"
  on public.classroom_codes
  for delete
  to authenticated
  using (auth.uid() = teacher_id);

-- Students (anon or signed-in) can look up an active code to join a class.
drop policy if exists "anyone can read active class codes" on public.classroom_codes;
create policy "anyone can read active class codes"
  on public.classroom_codes
  for select
  to anon, authenticated
  using (is_active = true);
