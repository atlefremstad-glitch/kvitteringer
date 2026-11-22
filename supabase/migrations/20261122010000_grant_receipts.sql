-- Nye Supabase-prosjekter gir ikke lenger rollen "authenticated" tilgang til
-- nye tabeller automatisk. RLS-reglene bestemmer fortsatt hvilke rader hver bruker ser.
grant select, insert, update, delete on table public.receipts to authenticated;
