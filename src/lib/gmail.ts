import "server-only";
import { htmlToText, type EmailAttachment, type IncomingEmail } from "./email";
import { estimateMainItem, estimateTotal } from "./amount";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** Standardsøk når brukeren ikke har skrevet noe selv. */
export const DEFAULT_QUERY =
  '(kvittering OR receipt OR ordrebekreftelse OR "order confirmation" OR "takk for kjøpet" OR "takk for din bestilling" OR faktura OR invoice)';

export class GmailAuthError extends Error {}

function credentials() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID eller GOOGLE_CLIENT_SECRET mangler på serveren.");
  return { id, secret };
}

export function redirectUri(origin: string) {
  return `${origin}/api/gmail/callback`;
}

export function authUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: credentials().id,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline", // gir refresh token, så vi kan søke senere uten ny innlogging
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const { id, secret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (json.error === "invalid_grant") throw new GmailAuthError("Gmail-tilgangen er utløpt. Koble til på nytt.");
    throw new Error(`Google svarte ${res.status}: ${String(json.error_description ?? json.error ?? "ukjent feil")}`);
  }
  return json;
}

export async function exchangeCode(origin: string, code: string) {
  const json = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  return { accessToken: String(json.access_token), refreshToken: json.refresh_token as string | undefined };
}

export async function accessTokenFrom(refreshToken: string) {
  const json = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return String(json.access_token);
}

async function api<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new GmailAuthError("Gmail-tilgangen er utløpt. Koble til på nytt.");
  if (!res.ok) throw new Error(`Gmail svarte ${res.status}`);
  return (await res.json()) as T;
}

export async function profileEmail(token: string) {
  const p = await api<{ emailAddress: string }>(token, "/profile");
  return p.emailAddress;
}

type Header = { name: string; value: string };
type Part = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Header[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: Part[];
};
type Message = { id: string; threadId: string; snippet?: string; internalDate?: string; payload?: Part };

const headerValue = (headers: Header[] | undefined, name: string) =>
  headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

const decode = (data: string) => Buffer.from(data, "base64url");

export type GmailHit = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  hasAttachment: boolean;
  /** Totalbeløp lest fra e-postteksten uten AI. Bare satt når prisfilteret er i bruk. null = ikke funnet. */
  amount?: number | null;
  /** Gjettet hovedprodukt fra e-postteksten (varelinjen med høyest pris). null = ikke funnet. */
  item?: string | null;
};

function estimates(body: string, snippet: string) {
  return { amount: estimateTotal(`${body}\n${snippet}`), item: estimateMainItem(body) };
}

/** Teksten i e-posten (HTML gjort om til tekst), for å finne beløpet før import. */
function bodyText(part: Part | undefined): string {
  let html = "";
  let text = "";
  const walk = (p: Part) => {
    const type = (p.mimeType ?? "").toLowerCase();
    if (!p.filename && p.body?.data) {
      if (type === "text/html" && !html) html = decode(p.body.data).toString("utf8");
      else if (type === "text/plain" && !text) text = decode(p.body.data).toString("utf8");
    }
    p.parts?.forEach(walk);
  };
  if (part) walk(part);
  return html ? htmlToText(html) : text;
}

/** Legger lagrede unntak til søket, f.eks. «Bolt» blir -from:(Bolt). */
export function withExcludes(q: string, excludes: string[]) {
  const parts = excludes
    .map((e) => e.replace(/["()]/g, "").trim())
    .filter(Boolean)
    .map((e) => (/\s/.test(e) ? `-from:"${e}"` : `-from:(${e})`));
  return [q, ...parts].join(" ").trim();
}

export type GmailPage = { hits: GmailHit[]; nextPageToken: string | null; estimate: number };

/** Søker i Gmail med vanlig Gmail-søkesyntaks. Returnerer én side med de nyeste treffene. */
export async function searchMessages(
  token: string,
  q: string,
  pageToken?: string,
  { withAmount = false, max = 50 }: { withAmount?: boolean; max?: number } = {},
): Promise<GmailPage> {
  const params = new URLSearchParams({ q, maxResults: String(max) });
  if (pageToken) params.set("pageToken", pageToken);
  const list = await api<{ messages?: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number }>(
    token,
    `/messages?${params}`,
  );
  const ids = (list.messages ?? []).map((m) => m.id);
  // Med prisfilter hentes hele e-posten (uten vedlegg) for å lese beløpet. Ellers bare avsender, emne og dato.
  const meta = new URLSearchParams({ format: withAmount ? "full" : "metadata" });
  if (!withAmount) for (const h of ["From", "Subject", "Date"]) meta.append("metadataHeaders", h);

  // Maks 10 samtidig, så vi holder oss under Gmail sin fartsgrense
  const messages: Message[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    messages.push(...(await Promise.all(chunk.map((id) => api<Message>(token, `/messages/${id}?${meta}`)))));
  }
  const hits = messages.map((m) => ({
    id: m.id,
    from: headerValue(m.payload?.headers, "From"),
    subject: headerValue(m.payload?.headers, "Subject") || "(uten emne)",
    date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : "",
    snippet: m.snippet ?? "",
    hasAttachment: (m.payload?.mimeType ?? "").startsWith("multipart/mixed"),
    ...(withAmount ? estimates(bodyText(m.payload), m.snippet ?? "") : {}),
  }));
  return { hits, nextPageToken: list.nextPageToken ?? null, estimate: list.resultSizeEstimate ?? hits.length };
}

/** Henter hele e-posten og gjør den klar for import. */
export async function fetchEmail(token: string, id: string): Promise<IncomingEmail> {
  const m = await api<Message>(token, `/messages/${encodeURIComponent(id)}?format=full`);
  let html: string | null = null;
  let text: string | null = null;
  const attachments: EmailAttachment[] = [];

  const walk = (part: Part) => {
    const type = (part.mimeType ?? "").toLowerCase();
    const disposition = headerValue(part.headers, "Content-Disposition").toLowerCase();
    if (part.filename) {
      const body = part.body ?? {};
      attachments.push({
        filename: part.filename,
        contentType: type,
        size: body.size ?? 0,
        inline: disposition.startsWith("inline") || (!disposition && Boolean(headerValue(part.headers, "Content-ID"))),
        getData: async () => {
          if (body.data) return decode(body.data);
          const a = await api<{ data: string }>(
            token,
            `/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(body.attachmentId ?? "")}`,
          );
          return decode(a.data);
        },
      });
    } else if (type === "text/html" && part.body?.data && html === null) {
      html = decode(part.body.data).toString("utf8");
    } else if (type === "text/plain" && part.body?.data && text === null) {
      text = decode(part.body.data).toString("utf8");
    }
    part.parts?.forEach(walk);
  };
  if (m.payload) walk(m.payload);

  return {
    source: "gmail",
    sourceRef: m.id,
    from: headerValue(m.payload?.headers, "From"),
    subject: headerValue(m.payload?.headers, "Subject"),
    date: headerValue(m.payload?.headers, "Date") ||
      (m.internalDate ? new Date(Number(m.internalDate)).toISOString() : ""),
    text,
    html,
    attachments,
  };
}
