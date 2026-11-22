-- Kvitteringer: databaseskjema, Row Level Security og privat Storage-bucket.
-- Kjør hele filen i Supabase: SQL Editor -> New query -> lim inn -> Run.

-- ---------------------------------------------------------------
-- Tabell: receipts
-- ---------------------------------------------------------------
create table if not exists public.receipts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Fil i Storage (bucket "receipts", sti: <user_id>/<id>.<ext>)
  file_path       text not null,
  file_type       text not null,

  -- processing = AI jobber, ok = tolket, needs_review = "må sjekkes"
  status          text not null default 'processing'
                  check (status in ('processing', 'ok', 'needs_review')),

  -- Tolkede felt
  merchant        text,
  org_number      text,
  purchase_date   date,
  total           numeric(12, 2),
  currency        text not null default 'NOK',
  vat             numeric(12, 2),
  payment_method  text,
  category        text check (category in (
                    'Dagligvarer', 'Restaurant og kafé', 'Transport', 'Bolig',
                    'Elektronikk', 'Klær', 'Helse', 'Fritid', 'Reise',
                    'Abonnement', 'Annet')),
  items           jsonb not null default '[]'::jsonb,  -- [{ name, quantity, price }]
  confidence      numeric(4, 3),

  -- Rå svar fra AI og eventuell feilmelding
  raw_ai          jsonb,
  ai_error        text
);

create index if not exists receipts_user_date_idx
  on public.receipts (user_id, purchase_date desc nulls last, created_at desc);

-- Oppdater updated_at automatisk
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists receipts_set_updated_at on public.receipts;
create trigger receipts_set_updated_at
  before update on public.receipts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Row Level Security: hver bruker ser bare sine egne kvitteringer
-- ---------------------------------------------------------------
alter table public.receipts enable row level security;

drop policy if exists "receipts_select_own" on public.receipts;
create policy "receipts_select_own" on public.receipts
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "receipts_insert_own" on public.receipts;
create policy "receipts_insert_own" on public.receipts
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "receipts_update_own" on public.receipts;
create policy "receipts_update_own" on public.receipts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "receipts_delete_own" on public.receipts;
create policy "receipts_delete_own" on public.receipts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------
-- Storage: privat bucket "receipts" (maks 20 MB per fil)
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 20971520,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Filer ligger i en mappe med brukerens id: <user_id>/<fil>
drop policy if exists "receipts_files_select_own" on storage.objects;
create policy "receipts_files_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "receipts_files_insert_own" on storage.objects;
create policy "receipts_files_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "receipts_files_update_own" on storage.objects;
create policy "receipts_files_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "receipts_files_delete_own" on storage.objects;
create policy "receipts_files_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
