import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import { forwardingAddress, getEmailSettings, gmailAccessToken, type EmailSettings } from "@/lib/email-settings";
import { DEFAULT_QUERY, GmailAuthError, searchMessages, type GmailHit } from "@/lib/gmail";
import { CopyButton } from "./CopyButton";
import { GmailResults } from "./GmailResults";

export const metadata: Metadata = { title: "E-post – ReceiptMe" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function EmailPage({ searchParams }: PageProps<"/epost">) {
  const params = await searchParams;
  const urlError = one(params.feil);
  const hasQuery = "q" in params;
  const q = hasQuery ? one(params.q).trim() : DEFAULT_QUERY;

  const { supabase, user } = await requireUser();

  let settings: EmailSettings | null = null;
  let setupError: string | null = null;
  try {
    settings = await getEmailSettings(user.id);
  } catch (err) {
    setupError = err instanceof Error ? err.message : "Kunne ikke hente innstillinger.";
  }

  let hits: GmailHit[] = [];
  let imported: Record<string, string> = {};
  let searchError: string | null = null;
  let gmailEmail = settings?.gmail_email ?? null;

  if (settings?.gmail_refresh_token && q) {
    try {
      const token = await gmailAccessToken(user.id);
      if (token) hits = await searchMessages(token, q);
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
            <form method="get" className="flex flex-col gap-2 sm:flex-row">
              <input name="q" defaultValue={q} className="input flex-1" aria-label="Søk i Gmail" />
              <button className="btn-primary" type="submit">Søk</button>
            </form>
            <p className="text-xs text-muted">
              Vanlig Gmail-søk virker, f.eks. <code>from:komplett.no</code>, <code>has:attachment</code> eller{" "}
              <code>after:2026/01/01</code>.
            </p>
            {searchError && <p className="text-sm text-red-600">{searchError}</p>}
            {!searchError && q && <GmailResults key={q} hits={hits} imported={imported} />}
          </>
        )}
      </section>
    </div>
  );
}
