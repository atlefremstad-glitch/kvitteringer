-- Fritt notat på hver kvittering.
alter table public.receipts add column if not exists note text;

-- Tilgangen gis på tabellnivå, så den dekker også den nye kolonnen.
grant select, insert, update, delete on table public.receipts to authenticated;
