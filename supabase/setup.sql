-- =============================================================================
-- VBUILD site content: schema for the /admin editor.
--
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- It's safe to run again; it only creates what's missing.
--
-- Tables
--   site_content          the published site (one JSON document, id = 'site')
--   site_content_history  every published version, newest 50 kept (for restore)
--   admins                which logged-in users may edit
--   keep_alive            heartbeat written by the scheduled pings
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.site_content (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

create table if not exists public.site_content_history (
  id          bigint generated always as identity primary key,
  content_id  text not null,
  data        jsonb not null,
  saved_at    timestamptz not null default now(),
  saved_by    uuid references auth.users (id) on delete set null
);
create index if not exists site_content_history_recent
  on public.site_content_history (content_id, saved_at desc);

create table if not exists public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.keep_alive (
  id          int primary key default 1 check (id = 1),
  pinged_at   timestamptz not null default now(),
  source      text not null default 'setup',
  ping_count  bigint not null default 0
);
insert into public.keep_alive (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when the caller is a logged-in admin. SECURITY DEFINER so policies can
-- use it without granting anyone read access to the admins table.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Stamp the editor and time on every publish, and keep a copy in the history.
create or replace function public.site_content_on_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  insert into public.site_content_history (content_id, data, saved_by)
  values (new.id, new.data, auth.uid());
  -- Keep the newest 50 versions.
  delete from public.site_content_history
  where content_id = new.id
    and id not in (
      select id from public.site_content_history
      where content_id = new.id
      order by saved_at desc, id desc
      limit 50
    );
  return new;
end;
$$;

drop trigger if exists site_content_on_write on public.site_content;
create trigger site_content_on_write
  before insert or update on public.site_content
  for each row execute function public.site_content_on_write();

-- Called by the scheduled keep-alive jobs (Vercel cron + GitHub Actions).
-- It does a real write so the project counts as active, and it touches nothing else.
create or replace function public.keep_alive(caller text default 'unknown')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  update public.keep_alive
     set pinged_at  = now(),
         source     = left(coalesce(caller, 'unknown'), 40),
         ping_count = ping_count + 1
   where id = 1
  returning jsonb_build_object('pinged_at', pinged_at, 'ping_count', ping_count)
    into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.site_content         enable row level security;
alter table public.site_content_history enable row level security;
alter table public.admins               enable row level security;
alter table public.keep_alive           enable row level security;

-- Anyone may read the published site; only admins may change it.
drop policy if exists "site_content: public read" on public.site_content;
create policy "site_content: public read" on public.site_content
  for select to anon, authenticated using (true);

drop policy if exists "site_content: admins insert" on public.site_content;
create policy "site_content: admins insert" on public.site_content
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "site_content: admins update" on public.site_content;
create policy "site_content: admins update" on public.site_content
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- History and heartbeat are visible to admins only (written by the functions above).
drop policy if exists "history: admins read" on public.site_content_history;
create policy "history: admins read" on public.site_content_history
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "keep_alive: admins read" on public.keep_alive;
create policy "keep_alive: admins read" on public.keep_alive
  for select to authenticated using ((select public.is_admin()));

-- Users can see whether they themselves are an admin; nobody can edit the list
-- through the API (add admins with the SQL at the bottom of this file).
drop policy if exists "admins: read own row" on public.admins;
create policy "admins: read own row" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Explicit table grants (RLS above still decides which rows).
grant select on public.site_content to anon, authenticated;
grant insert, update on public.site_content to authenticated;
grant select on public.site_content_history, public.keep_alive, public.admins to authenticated;

revoke all on function public.keep_alive(text) from public;
grant execute on function public.keep_alive(text) to anon, authenticated;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
revoke all on function public.site_content_on_write() from public, anon, authenticated;

-- =============================================================================
-- Make yourself an admin (run AFTER creating your user under
-- Authentication → Users). Replace the email, then run just this statement:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;
-- =============================================================================
