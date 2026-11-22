# ReceiptMe

Web-app (PWA) for å skanne og holde oversikt over kvitteringer.
Next.js + Supabase (innlogging, database, fillagring) + Claude (leser kvitteringene).

## Hva appen gjør

- Innlogging med e-post (magic link eller engangskode). Hver bruker ser bare sine egne data.
- Ta bilde med mobilkameraet eller last opp JPG, PNG, HEIC eller PDF.
- Claude leser butikk, org.nr., dato, total, valuta, MVA, betalingsmåte, varelinjer og kategori.
- Liste med søk, filter på kategori og datoperiode, og sum for det som vises.
- Detaljside der alt kan redigeres, og kvitteringen kan slettes.
- Feiler AI-en, lagres kvitteringen med status «Må sjekkes».
- Søk i Gmail etter kvitteringer og importer dem (siden **E-post**).
- Personlig videresendings-adresse: send en kvittering dit, så legges den inn automatisk.

## Oppsett, steg for steg

Du trenger kontoer hos GitHub, Supabase, Vercel og Anthropic.

### 1. Lag databasen i Supabase

1. Åpne prosjektet ditt på [supabase.com/dashboard](https://supabase.com/dashboard).
2. Gå til **SQL Editor** → **New query**.
3. Åpne filene i [`supabase/migrations/`](supabase/migrations/) i rekkefølge (eldste først). Kopier alt fra én fil, lim inn og kjør, og gjør det samme for neste.
4. Trykk **Run** for hver fil. Du skal se «Success. No rows returned».

Dette lager tabellen `receipts`, sikkerhetsreglene (Row Level Security) og en privat lagringsbøtte `receipts`.
Du kan sjekke under **Table Editor** (tabellen `receipts`) og **Storage** (bøtta `receipts`).

### 2. Finn Supabase-nøklene

Gå til **Project Settings** → **API Keys** (eller trykk **Connect** øverst):

- **Project URL** → blir `NEXT_PUBLIC_SUPABASE_URL`
- **Publishable key** (`sb_publishable_…`) → blir `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (har prosjektet bare den gamle **anon**-nøkkelen, bruk den.)

- **Secret key** (`sb_secret_…`, eller den gamle `service_role`) → blir `SUPABASE_SECRET_KEY`.
  Den brukes bare på serveren til e-post-import. Del den aldri og bruk aldri `NEXT_PUBLIC_` foran.

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

## Kvitteringer fra e-post

Siden **E-post** i appen har to ting: søk i Gmail, og en personlig adresse du kan videresende kvitteringer til.
Har e-posten en PDF eller et bilde som vedlegg, leser AI-en vedlegget. Ellers leser den selve teksten i e-posten.

### A. Videresendings-adresse (Postmark)

Postmark tar imot e-posten og sender den til appen. Gratis for 100 e-poster i måneden, og du trenger ikke eget domene.

1. Lag en gratis konto på [postmarkapp.com](https://postmarkapp.com).
2. Lag en **Server** (f.eks. «Kvitteringer»). Åpne **Default Inbound Stream** → **Setup instructions** / **Settings**.
3. Kopier **Inbound address** (ser ut som `abc123@inbound.postmarkapp.com`).
4. Lag en hemmelig nøkkel: en lang tilfeldig tekst med bare bokstaver og tall (minst 32 tegn, f.eks. fra passordgeneratoren din).
5. I Postmark, feltet **Webhook URL**:
   `https://DIN-APP.vercel.app/api/inbound/postmark?key=DIN-HEMMELIGE-NØKKEL` → **Save**.
6. I Vercel → **Settings** → **Environment Variables**, legg inn:

   | Navn | Verdi |
   |---|---|
   | `POSTMARK_INBOUND_ADDRESS` | Inbound-adressen fra punkt 3 |
   | `INBOUND_WEBHOOK_SECRET` | Nøkkelen fra punkt 4 |
   | `SUPABASE_SECRET_KEY` | Secret key fra Supabase (steg 2 over) |

7. **Redeploy**. Åpne **E-post** i appen. Der står din personlige adresse (`abc123+<kode>@inbound.postmarkapp.com`).

Automatisk videresending fra Gmail: Gmail → Innstillinger → **Videresending og POP/IMAP** → legg til adressen.
Gmail sender da en bekreftelseskode. Den dukker opp på **E-post**-siden i appen. Lag så et filter (f.eks. `from:komplett.no`) som videresender til adressen.

Vedlegg over ca. 3 MB kommer ikke gjennom (grense hos Vercel).

### B. Søk i Gmail (Google Cloud)

1. Gå til [console.cloud.google.com](https://console.cloud.google.com) og lag et nytt prosjekt, f.eks. «Kvitteringer».
2. **APIs & Services** → **Library** → søk «Gmail API» → **Enable**.
3. **Google Auth Platform** (heter også **OAuth consent screen**) → **Get started**:
   app-navn «Kvitteringer», din e-post, **Audience: External** → **Create**.
4. **Audience** → **Test users** → **Add users** → din Gmail-adresse → **Save**.
5. **Data Access** → **Add or remove scopes** → lim inn `https://www.googleapis.com/auth/gmail.readonly` → **Update** → **Save**.
6. **Clients** → **Create client** → **Web application**. Under **Authorized redirect URIs** → **Add URI**:
   - `https://DIN-APP.vercel.app/api/gmail/callback`
   - `http://localhost:3000/api/gmail/callback` (bare hvis du kjører lokalt)
7. Trykk **Create** og kopier **Client ID** og **Client secret** inn i Vercel som `GOOGLE_CLIENT_ID` og `GOOGLE_CLIENT_SECRET`. **Redeploy**.
8. I appen: **E-post** → **Koble til Gmail**. Google sier at appen ikke er verifisert: trykk **Fortsett** (det er din egen app).

Mens appen står i «Testing» hos Google, må du koble til Gmail på nytt hver 7. dag.
Vil du slippe det: **Audience** → **Publish app**. Advarselen om uverifisert app vises fortsatt, men tilgangen varer.
Skal appen selges til andre, må Google godkjenne den (gjelder fordi den leser e-post).

Bruk produksjons-adressen fra Vercel, ikke en preview-adresse. Google godtar bare adressene du la inn i punkt 6.

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
