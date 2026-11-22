import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { htmlToText, ingestEmail, type EmailAttachment } from "@/lib/email";

// Postmark sender hver e-post som kommer til videresendings-adressen hit.
// Adressen i Postmark: https://<appen>/api/inbound/postmark?key=<INBOUND_WEBHOOK_SECRET>
export const maxDuration = 60;

type PostmarkInbound = {
  From?: string;
  FromFull?: { Email?: string; Name?: string };
  Subject?: string;
  Date?: string;
  MessageID?: string;
  MailboxHash?: string;
  OriginalRecipient?: string;
  ToFull?: { Email?: string; MailboxHash?: string }[];
  TextBody?: string;
  HtmlBody?: string;
  Attachments?: { Name?: string; Content?: string; ContentType?: string; ContentLength?: number; ContentID?: string }[];
};

function validKey(given: string | null) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Finner den hemmelige delen etter + i adressen e-posten ble sendt til. */
function tokenFrom(mail: PostmarkInbound): string | null {
  const candidates = [
    mail.MailboxHash,
    ...(mail.ToFull ?? []).map((t) => t.MailboxHash),
    mail.OriginalRecipient?.match(/\+([^@]+)@/)?.[1],
  ];
  const token = candidates.find((c) => c && /^[0-9a-f]{16}$/i.test(c));
  return token ? token.toLowerCase() : null;
}

export async function POST(request: NextRequest) {
  if (!validKey(request.nextUrl.searchParams.get("key"))) {
    return NextResponse.json({ error: "Ugyldig nøkkel" }, { status: 401 });
  }
  const mail = (await request.json().catch(() => null)) as PostmarkInbound | null;
  if (!mail) return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });

  // Svar 200 på alt vi ikke kan bruke, ellers prøver Postmark igjen og igjen.
  const token = tokenFrom(mail);
  if (!token) return NextResponse.json({ ignored: "ingen mottaker-kode i adressen" });

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("email_settings")
    .select("user_id")
    .eq("inbound_token", token)
    .maybeSingle();
  if (!settings) return NextResponse.json({ ignored: "ukjent adresse" });
  const userId = settings.user_id as string;

  const from = mail.FromFull?.Email ?? mail.From ?? "";

  // Gmail sender en bekreftelseskode når man setter opp automatisk videresending.
  // Lagre den, så brukeren ser koden i appen i stedet for at den blir en kvittering.
  if (/forwarding-noreply@google\.com/i.test(from)) {
    const body = mail.TextBody?.trim() || htmlToText(mail.HtmlBody ?? "");
    await admin
      .from("email_settings")
      .update({
        forward_verification: `${mail.Subject ?? ""}\n\n${body}`.slice(0, 4000),
        forward_verification_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return NextResponse.json({ saved: "gmail-bekreftelse" });
  }

  const attachments: EmailAttachment[] = (mail.Attachments ?? []).map((a) => ({
    filename: a.Name ?? "",
    contentType: a.ContentType ?? "",
    size: a.ContentLength ?? 0,
    inline: Boolean(a.ContentID),
    getData: async () => Buffer.from(a.Content ?? "", "base64"),
  }));

  // AI-en bruker 5–20 sekunder. Svar Postmark med en gang og gjør jobben etterpå.
  after(async () => {
    const result = await ingestEmail(admin, userId, {
      source: "email",
      sourceRef: mail.MessageID || crypto.randomUUID(),
      from: mail.From ?? from,
      subject: mail.Subject ?? "",
      date: mail.Date ?? new Date().toISOString(),
      text: mail.TextBody ?? null,
      html: mail.HtmlBody ?? null,
      attachments,
    });
    if (!result.ok) console.error("Videresendt e-post feilet:", result.error);
  });

  return NextResponse.json({ ok: true });
}
