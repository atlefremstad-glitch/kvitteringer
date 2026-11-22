-- Prosjekter: samle flere kvitteringer i ett prosjekt (f.eks. "Oppussing bad").
-- Kjør hele filen i Supabase: SQL Editor -> New query -> lim inn -> Run.

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 100)
);

create index if not exists projects_user_idx on public.projects (user_id, created_at desc);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- Hver kvittering kan ligge i ett prosjekt. Slettes prosjektet, beholdes kvitteringene.
alter table public.receipts
  add column if not exists project_id uuid references public.projects (id) on delete set null;

create index if not exists receipts_project_idx on public.receipts (project_id);

-- Row Level Security: hver bruker ser bare sine egne prosjekter
alter table public.projects enable row level security;

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.projects to authenticated;
