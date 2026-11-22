-- Butikkens adresse og koordinater, så kjøpet kan vises på kart.
alter table public.receipts add column if not exists address text;
alter table public.receipts add column if not exists latitude double precision;
alter table public.receipts add column if not exists longitude double precision;

-- Tilgangen gis på tabellnivå, så den dekker også de nye kolonnene.
grant select, insert, update, delete on table public.receipts to authenticated;
