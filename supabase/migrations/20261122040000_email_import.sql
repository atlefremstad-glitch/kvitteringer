-- Kvitteringer fra e-post: Gmail-søk og videresendings-adresse.
-- Kjør hele filen i Supabase: SQL Editor -> New query -> lim inn -> Run.

-- ---------------------------------------------------------------
-- Hvor kvitteringen kom fra
-- ---------------------------------------------------------------
alter table public.receipts
  add column if not exists source text not null default 'upload',
  add column if not exists source_ref text;   -- Gmail-meldings-id eller e-postens Message-ID

alter table public.receipts drop constraint if exists receipts_source_check;
alter table public.receipts
  add constraint receipts_source_check check (source in ('upload', 'gmail', 'email'));

-- Samme e-post skal ikke importeres to ganger
create unique index if not exists receipts_user_source_ref_idx
  on public.receipts (user_id, source, source_ref) where source_ref is not null;

-- E-poster uten vedlegg lagres som ren tekst
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf', 'text/plain']
  where id = 'receipts';

-- ---------------------------------------------------------------
-- Tabell: email_settings (én rad per bruker)
-- Leses og skrives bare av serveren med secret-nøkkelen.
-- Nettleseren har ingen tilgang, så Gmail-nøkkelen kan ikke lekke.
-- ---------------------------------------------------------------
create table if not exists public.email_settings (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  created_at           timestamptz not null default now(),
  -- Hemmelig del av videresendings-adressen: <adresse>+<inbound_token>@inbound.postmarkapp.com
  inbound_token        text not null unique
                       default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  gmail_email          text,
  gmail_refresh_token  text,
  gmail_connected_at   timestamptz,
  -- Siste bekreftelses-e-post fra Gmail (når du setter opp automatisk videresending)
  forward_verification text,
  forward_verification_at timestamptz
);

alter table public.email_settings enable row level security;
-- Ingen policies: innloggede brukere får ingenting. Serveren bruker secret-nøkkelen.
revoke all on table public.email_settings from anon, authenticated;
grant select, insert, update, delete on table public.email_settings to service_role;

-- Serveren legger inn kvitteringer fra videresendt e-post for brukeren
grant select, insert, update, delete on table public.receipts to service_role;
grant select, insert, update, delete on table public.receipts to authenticated;
