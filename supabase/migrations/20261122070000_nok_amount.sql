-- Beløp omregnet til NOK med Norges Banks valutakurs på kjøpsdatoen.
-- Kjør hele filen i Supabase: SQL Editor -> New query -> lim inn -> Run.
alter table public.receipts
  add column if not exists exchange_rate numeric(14, 6),  -- NOK per 1 enhet av valutaen (1 for NOK)
  add column if not exists nok_total     numeric(12, 2);  -- total omregnet til NOK

-- Kvitteringer i NOK trenger ingen kurs
update public.receipts
  set exchange_rate = 1, nok_total = total
  where currency = 'NOK' and nok_total is null and total is not null;
