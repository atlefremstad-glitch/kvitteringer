# Kvitteringer

Web-app (PWA) for å skanne og holde oversikt over kvitteringer.
Next.js + Supabase (innlogging, database, fillagring) + Claude (leser kvitteringene).

## Hva appen gjør

- Innlogging med e-post (magic link eller engangskode). Hver bruker ser bare sine egne data.
- Ta bilde med mobilkameraet eller last opp JPG, PNG, HEIC eller PDF.
- Claude leser butikk, org.nr., dato, total, valuta, MVA, betalingsmåte, varelinjer og kategori.
- Liste med søk, filter på kategori og datoperiode, og sum for det som vises.
- Detaljside der alt kan redigeres, og kvitteringen kan slettes.
- Feiler AI-en, lagres kvitteringen med status «Må sjekkes».

## Oppsett, steg for steg

Du trenger kontoer hos GitHub, Supabase, Vercel og Anthropic.

### 1. Lag databasen i Supabase

1. Åpne prosjektet ditt på [supabase.com/dashboard](https://supabase.com/dashboard).
2. Gå til **SQL Editor** → **New query**.
3. Åpne filen [`supabase/migrations/20261122000000_init.sql`](supabase/migrations/20261122000000_init.sql) her i GitHub, kopier alt og lim det inn.
4. Trykk **Run**. Du skal se «Success. No rows returned».

Dette lager tabellen `receipts`, sikkerhetsreglene (Row Level Security) og en privat lagringsbøtte `receipts`.
Du kan sjekke under **Table Editor** (tabellen `receipts`) og **Storage** (bøtta `receipts`).

### 2. Finn Supabase-nøklene

Gå til **Project Settings** → **API Keys** (eller trykk **Connect** øverst):

- **Project URL** → blir `NEXT_PUBLIC_SUPABASE_URL`
- **Publishable key** (`sb_publishable_…`) → blir `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (har prosjektet bare den gamle **anon**-nøkkelen, bruk den.)

Ikke bruk `service_role`/secret-nøkkelen. Appen trenger den ikke.

### 3. Publiser på Vercel

1. På [vercel.com/new](https://vercel.com/new): velg **Import** på repoet `kvitteringer`.
2. Åpne **Environment Variables** og legg inn:

   | Navn | Verdi |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL fra steg 2 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key fra steg 2 |
   | `ANTHROPIC_API_KEY` | API-nøkkelen fra [console.anthropic.com](https://console.anthropic.com) → API Keys |

3. Trykk **Deploy**. Når den er ferdig, kopier adressen (f.eks. `https://kvitteringer-abc.vercel.app`).

Endrer du en miljøvariabel senere, må du gjøre **Redeploy** før den gjelder.

### 4. Sett opp innlogging i Supabase

Gå til **Authentication** → **URL Configuration**:

- **Site URL**: Vercel-adressen din, f.eks. `https://kvitteringer-abc.vercel.app`
- **Redirect URLs** → **Add URL**:
  - `https://kvitteringer-abc.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback` (bare hvis du kjører appen lokalt)

Sjekk at **Authentication** → **Sign In / Providers** → **Email** er slått på.

**Anbefalt for mobil (iPhone):** en app lagt på hjemskjermen har egne cookies, så lenken i e-posten logger deg bare inn i Safari.
Legg derfor koden inn i e-posten: **Authentication** → **Emails** → **Magic Link**, og legg til denne linjen i malen:

```html
<p>Eller skriv inn koden: <strong>{{ .Token }}</strong></p>
```

Da kan du skrive inn koden i appen i stedet for å trykke på lenken.

Supabase sin innebygde e-posttjeneste sender bare noen få e-poster i timen. Det holder for én bruker.

### 5. Legg appen på hjemskjermen

- **iPhone (Safari):** Del-knappen → **Legg til på Hjem-skjerm**.
- **Android (Chrome):** menyen ⋮ → **Installer app** / **Legg til på startskjermen**.

## Kjøre lokalt (valgfritt)

```bash
npm install
cp .env.example .env.local   # fyll inn verdiene
npm run dev                  # åpne http://localhost:3000
```

## Teknisk

- `src/app/(app)/` – sidene du ser når du er innlogget (liste, ny, detalj)
- `src/app/api/receipts/process/route.ts` – kjører AI-uttrekket på serveren
- `src/lib/extract.ts` – kallet til Claude (structured outputs med JSON-skjema), modell `claude-sonnet-5-5`
- `src/lib/process.ts` – henter filen fra Storage, konverterer HEIC til JPEG, lagrer resultatet
- `src/proxy.ts` – fornyer innloggingen og sender ikke-innloggede til `/login`
- `supabase/migrations/` – databaseskjema, RLS og Storage-regler

Filen lastes opp direkte fra nettleseren til Supabase Storage (i mappen `<bruker-id>/`), så store mobilbilder ikke stopper på Vercels grense for forespørsler.
`ANTHROPIC_API_KEY` brukes bare på serveren og sendes aldri til nettleseren.
