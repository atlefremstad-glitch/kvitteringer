-- Gmail-søk: lagrede unntak, beløpsgrense og e-poster som ble hoppet over.
-- Kjør hele filen i Supabase: SQL Editor -> New query -> lim inn -> Run.
alter table public.email_settings
  add column if not exists gmail_excludes   text[] not null default '{}',  -- avsendere som skjules i søket
  add column if not exists gmail_min_amount numeric(12, 2),                -- importer bare kvitteringer over dette beløpet
  add column if not exists gmail_skipped    text[] not null default '{}';  -- Gmail-id-er under beløpsgrensen

grant select, insert, update, delete on table public.email_settings to service_role;
