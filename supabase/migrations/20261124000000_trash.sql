-- Søppelbøtte: slettede kvitteringer får et tidspunkt i deleted_at i stedet for å forsvinne.
-- Appen sletter dem for godt (med filen) etter 30 dager.
-- Kjør hele filen i Supabase: SQL Editor -> New query -> lim inn -> Run.

alter table public.receipts
  add column if not exists deleted_at timestamptz;

create index if not exists receipts_deleted_idx
  on public.receipts (user_id, deleted_at)
  where deleted_at is not null;

-- Tilgangen gjelder hele tabellen, også den nye kolonnen. Kjøres for sikkerhets skyld.
grant select, insert, update, delete on table public.receipts to authenticated;
