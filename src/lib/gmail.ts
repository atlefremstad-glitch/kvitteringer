import "server-only";
import type { EmailAttachment, IncomingEmail } from "./email";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** Standardsøk når brukeren ikke har skrevet noe selv. */
export const DEFAULT_QUERY =
  '(kvittering OR receipt OR ordrebekreftelse OR "order confirmation" OR "takk for kjøpet" OR "takk for din bestilling" OR faktura OR invoice) newer_than:1y';

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
};

/** Søker i Gmail med vanlig Gmail-søkesyntaks. Returnerer de nyeste treffene. */
export async function searchMessages(token: string, q: string, max = 30): Promise<GmailHit[]> {
  const list = await api<{ messages?: { id: string }[] }>(
    token,
    `/messages?${new URLSearchParams({ q, maxResults: String(max) })}`,
  );
  const ids = (list.messages ?? []).map((m) => m.id);
  const meta = new URLSearchParams({ format: "metadata" });
  for (const h of ["From", "Subject", "Date"]) meta.append("metadataHeaders", h);

  const messages = await Promise.all(ids.map((id) => api<Message & { payload?: Part }>(token, `/messages/${id}?${meta}`)));
  return messages.map((m) => ({
    id: m.id,
    from: headerValue(m.payload?.headers, "From"),
    subject: headerValue(m.payload?.headers, "Subject") || "(uten emne)",
    date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : "",
    snippet: m.snippet ?? "",
    hasAttachment: (m.payload?.mimeType ?? "").startsWith("multipart/mixed"),
  }));
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
