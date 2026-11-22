import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET, processReceipt } from "./process";

/** Et vedlegg i en e-post. Innholdet hentes først når vi vet at vi trenger det. */
export type EmailAttachment = {
  filename: string;
  contentType: string;
  size: number;
  inline: boolean;
  getData: () => Promise<Buffer>;
};

export type IncomingEmail = {
  source: "gmail" | "email";
  sourceRef: string;
  from: string;
  subject: string;
  date: string;
  text: string | null;
  html: string | null;
  attachments: EmailAttachment[];
};

const TYPE_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
};
const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "text/plain": "txt",
};

const MAX_BYTES = 20 * 1024 * 1024;

function fileType(a: EmailAttachment): string | null {
  const t = a.contentType.toLowerCase().split(";")[0].trim();
  if (t === "image/jpg") return "image/jpeg";
  if (EXT_BY_TYPE[t] && t !== "text/plain") return t;
  const ext = a.filename.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_BY_EXT[ext] ?? null;
}

/**
 * Velger vedlegget som mest sannsynlig er kvitteringen:
 * først PDF, så et bilde som ikke er en logo i selve e-posten.
 */
export function pickAttachment(list: EmailAttachment[]) {
  const usable = list
    .map((a) => ({ a, type: fileType(a) }))
    .filter((x): x is { a: EmailAttachment; type: string } => x.type !== null && x.a.size <= MAX_BYTES);
  const pdf = usable.find((x) => x.type === "application/pdf");
  if (pdf) return pdf;
  return usable.find((x) => !x.a.inline && x.a.size > 15_000) ?? null;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", euro: "€", copy: "©", reg: "®",
  aelig: "æ", oslash: "ø", aring: "å", AElig: "Æ", Oslash: "Ø", Aring: "Å",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", eacute: "é", ndash: "–", mdash: "—",
};

/** Gjør HTML-e-post om til lesbar tekst for AI-en. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|header|footer)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e] ?? m;
    })
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function header(email: IncomingEmail) {
  return [`Fra: ${email.from}`, `Emne: ${email.subject}`, `Dato: ${email.date}`].join("\n");
}

export type IngestResult =
  | { ok: true; id: string; duplicate: boolean }
  | { ok: false; error: string };

/**
 * Lagrer en e-post som kvittering og lar AI-en lese den.
 * Bruker vedlegget (PDF/bilde) hvis det finnes, ellers teksten i e-posten.
 * `supabase` kan være brukerens klient eller admin-klienten.
 */
export async function ingestEmail(
  supabase: SupabaseClient,
  userId: string,
  email: IncomingEmail,
): Promise<IngestResult> {
  const { data: existing } = await supabase
    .from("receipts")
    .select("id")
    .eq("user_id", userId)
    .eq("source", email.source)
    .eq("source_ref", email.sourceRef)
    .maybeSingle();
  if (existing) return { ok: true, id: existing.id as string, duplicate: true };

  let buffer: Buffer;
  let type: string;
  const picked = pickAttachment(email.attachments);
  if (picked) {
    buffer = await picked.a.getData();
    type = picked.type;
  } else {
    const body = email.html ? htmlToText(email.html) : (email.text ?? "").trim();
    if (!body) return { ok: false, error: "E-posten har verken tekst eller vedlegg som kan leses." };
    buffer = Buffer.from(`${header(email)}\n\n${body.slice(0, 100_000)}`, "utf8");
    type = "text/plain";
  }

  const id = crypto.randomUUID();
  const path = `${userId}/${id}.${EXT_BY_TYPE[type]}`;
  const { error: upError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: type, upsert: false });
  if (upError) return { ok: false, error: `Kunne ikke lagre filen: ${upError.message}` };

  const { error: dbError } = await supabase.from("receipts").insert({
    id,
    user_id: userId,
    file_path: path,
    file_type: type,
    status: "processing",
    source: email.source,
    source_ref: email.sourceRef,
  });
  if (dbError) {
    await supabase.storage.from(BUCKET).remove([path]);
    // Importert samtidig fra et annet sted
    if (dbError.code === "23505") return { ok: false, error: "E-posten er allerede importert." };
    return { ok: false, error: `Kunne ikke lagre kvitteringen: ${dbError.message}` };
  }

  // Avsender og dato hjelper AI-en når vedlegget mangler butikk eller dato.
  const context = picked ? `Vedlegget kom i denne e-posten:\n${header(email)}` : undefined;
  await processReceipt(supabase, userId, id, context);
  return { ok: true, id, duplicate: false };
}
