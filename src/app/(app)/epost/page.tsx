import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import { forwardingAddress, getEmailSettings, gmailAccessToken, type EmailSettings } from "@/lib/email-settings";
import Link from "next/link";
import { DEFAULT_QUERY, GmailAuthError, searchMessages, withExcludes, type GmailHit } from "@/lib/gmail";
import { CopyButton } from "./CopyButton";
import { GmailResults } from "./GmailResults";
import { GmailFilters } from "./GmailFilters";
import { SearchInput } from "./SearchInput";
import { gmailPeriodQuery, periods } from "@/lib/periods";

export const metadata: Metadata = { title: "E-post – ReceiptMe" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const toNumber = (v: string) => {
  const t = v.replace(/\s/g, "").replace(",", ".");
  return t !== "" && Number.isFinite(Number(t)) && Number(t) >= 0 ? Number(t) : null;
};

export default async function EmailPage({ searchParams }: PageProps<"/epost">) {
  const params = await searchParams;
  const urlError = one(params.feil);
  const hasQuery = "q" in params;
  const q = hasQuery ? one(params.q).trim() : DEFAULT_QUERY;
  const periodOptions = periods();
  const periode = periodOptions.some((p) => p.key === one(params.periode)) ? one(params.periode) : "alltid";
  const periodQuery = gmailPeriodQuery(periodOptions.find((p) => p.key === periode));
  // Prisfilter: «til» er valgfri. Beløpet leses fra e-postteksten før import.
  const prisFra = toNumber(one(params.prisFra));
  const prisTil = toNumber(one(params.prisTil));
  const visUkjent = one(params.ukjent) === "1";
  // «Med vedlegg» er på som standard. Skjemaet sender vedlegg=0 og, hvis avhuket, vedlegg=1 etterpå.
  const vedleggParam = params.vedlegg;
  const medVedlegg =
    vedleggParam === undefined ? true : (Array.isArray(vedleggParam) ? vedleggParam.at(-1) : vedleggParam) === "1";
  const priceActive = prisFra !== null || prisTil !== null;
  // Sidetokens fra Gmail, ett per side vi har bladd forbi, skilt med punktum
  const pages = one(params.side).split(".").filter((t) => /^[0-9A-Za-z_-]+$/.test(t)).slice(0, 50);
  const pageLink = (stack: string[]) => {
    const sp = new URLSearchParams({ q });
    if (periode !== "alltid") sp.set("periode", periode);
    if (prisFra !== null) sp.set("prisFra", String(prisFra));
    if (prisTil !== null) sp.set("prisTil", String(prisTil));
    if (visUkjent) sp.set("ukjent", "1");
    sp.set("vedlegg", medVedlegg ? "1" : "0");
    if (stack.length) sp.set("side", stack.join("."));
    return `/epost?${sp}`;
  };

  const { supabase, user } = await requireUser();

  let settings: EmailSettings | null = null;
  let setupError: string | null = null;
  try {
    settings = await getEmailSettings(user.id);
  } catch (err) {
    setupError = err instanceof Error ? err.message : "Kunne ikke hente innstillinger.";
  }

  let hits: GmailHit[] = [];
  let nextPageToken: string | null = null;
  let estimate = 0;
  let scanned = 0;
  let unknownHidden = 0;
  let imported: Record<string, string> = {};
  let searchError: string | null = null;
  let gmailEmail = settings?.gmail_email ?? null;

  if (settings?.gmail_refresh_token && q) {
    try {
      const token = await gmailAccessToken(user.id);
      if (token) {
        const page = await searchMessages(token, withExcludes(`${q} ${periodQuery} ${medVedlegg ? "has:attachment" : ""}`.trim(), settings.gmail_excludes), pages.at(-1), { withAmount: priceActive });
        scanned = page.hits.length;
        hits = page.hits;
        if (priceActive) {
          unknownHidden = visUkjent ? 0 : hits.filter((h) => h.amount == null).length;
          hits = hits.filter((h) =>
            h.amount == null
              ? visUkjent
              : (prisFra === null || h.amount >= prisFra) && (prisTil === null || h.amount <= prisTil),
          );
        }
        nextPageToken = page.nextPageToken;
        estimate = page.estimate;
      }
      if (hits.length > 0) {
        const { data } = await supabase
          .from("receipts")
          .select("id, source_ref")
          .eq("source", "gmail")
          .in("source_ref", hits.map((h) => h.id));
        imported = Object.fromEntries((data ?? []).map((r) => [r.source_ref as string, r.id as string]));
      }
    } catch (err) {
      searchError = err instanceof Error ? err.message : "Søket feilet.";
      if (err instanceof GmailAuthError) gmailEmail = null;
    }
  }

  const address = settings ? forwardingAddress(settings.inbound_token) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Kvitteringer fra e-post</h1>

      {(urlError || setupError) && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {urlError || setupError}
        </p>
      )}

      {/* Videresending */}
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Videresend kvitteringer</h2>
        {address ? (
          <>
            <p className="text-sm text-muted">
              Send eller videresend en kvittering til denne adressen, så legges den inn automatisk. Adressen er
              personlig, så ikke del den.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {address}
              </code>
              <CopyButton text={address} />
            </div>
            <p className="text-sm text-muted">
              Tips: Lagre den som kontakt «ReceiptMe» i telefonen, så er den rask å velge.
            </p>
          </>
        ) : (
          !setupError && (
            <p className="text-sm text-muted">
              Videresending er ikke satt opp ennå (POSTMARK_INBOUND_ADDRESS mangler på serveren).
            </p>
          )
        )}
        {settings?.forward_verification && (
          <details className="rounded-lg border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Bekreftelseskode fra Gmail (automatisk videresending)
              {settings.forward_verification_at &&
                ` · ${new Date(settings.forward_verification_at).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}`}
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{settings.forward_verification}</pre>
          </details>
        )}
      </section>

      {/* Gmail */}
      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Søk i Gmail</h2>
          {gmailEmail && (
            <form action="/api/gmail/disconnect" method="post" className="flex items-center gap-2 text-sm text-muted">
              <span>{gmailEmail}</span>
              <button className="underline" type="submit">Koble fra</button>
            </form>
          )}
        </div>

        {!gmailEmail ? (
          <>
            <p className="text-sm text-muted">
              Koble til Gmail for å finne kvitteringer i innboksen. Appen får bare lesetilgang, og leser bare e-postene
              du velger å importere.
            </p>
            <a href="/api/gmail/connect" className="btn-primary">Koble til Gmail</a>
            {searchError && <p className="text-sm text-red-600">{searchError}</p>}
          </>
        ) : (
          <>
            <form method="get" className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <SearchInput key={q} defaultValue={q} />
                <select name="periode" defaultValue={periode} className="input sm:w-44" aria-label="Periode">
                  {periodOptions.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
                <button className="btn-primary" type="submit">Søk</button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="label" htmlFor="prisFra">Pris fra (kr)</label>
                  <input id="prisFra" name="prisFra" inputMode="decimal" defaultValue={one(params.prisFra)} className="input w-28" />
                </div>
                <div>
                  <label className="label" htmlFor="prisTil">til (valgfri)</label>
                  <input id="prisTil" name="prisTil" inputMode="decimal" defaultValue={one(params.prisTil)} className="input w-28" />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm text-muted">
                  <input type="hidden" name="vedlegg" value="0" />
                  <input type="checkbox" name="vedlegg" value="1" defaultChecked={medVedlegg} />
                  Med vedlegg
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm text-muted">
                  <input type="checkbox" name="ukjent" value="1" defaultChecked={visUkjent} />
                  Vis også treff uten funnet pris
                </label>
              </div>
            </form>
            <p className="text-xs text-muted">
              Vanlig Gmail-søk virker, f.eks. <code>from:komplett.no</code>, <code>has:attachment</code> eller{" "}
              <code>after:2026/01/01</code>.
            </p>
            {settings && (
              <GmailFilters
                excludes={settings.gmail_excludes}
                minAmount={settings.gmail_min_amount === null ? null : Number(settings.gmail_min_amount)}
              />
            )}
            {searchError && <p className="text-sm text-red-600">{searchError}</p>}
            {!searchError && q && (
              <>
                <GmailResults
                  key={`${q}|${periode}|${prisFra}|${prisTil}|${visUkjent}|${medVedlegg}|${pages.join(".")}`}
                  hits={hits}
                  imported={imported}
                  skipped={settings?.gmail_min_amount !== null ? (settings?.gmail_skipped ?? []) : []}
                  pageLabel={
                    priceActive
                      ? `Side ${pages.length + 1} · ${hits.length} av ${scanned} passer prisen`
                      : `Side ${pages.length + 1}${estimate > hits.length ? ` · ca. ${estimate} treff` : ""}`
                  }
                />
                {priceActive && (
                  <p className="text-xs text-muted">
                    Prisen leses fra teksten i e-posten og er et anslag. Kvitteringer som bare ligger som PDF-vedlegg
                    har ingen pris i teksten
                    {unknownHidden > 0 ? `, så ${unknownHidden} treff på denne siden er skjult` : ""}. Huk av for å
                    se dem også.
                  </p>
                )}
                {(pages.length > 0 || nextPageToken) && (
                  <nav className="flex items-center justify-between gap-2">
                    {pages.length > 0 ? (
                      <Link href={pageLink(pages.slice(0, -1))} className="btn">← Forrige 50</Link>
                    ) : (
                      <span />
                    )}
                    {nextPageToken && (
                      <Link href={pageLink([...pages, nextPageToken])} className="btn">Neste 50 →</Link>
                    )}
                  </nav>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
