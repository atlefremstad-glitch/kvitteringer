import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchEmail, GmailAuthError } from "@/lib/gmail";
import { getEmailSettings, gmailAccessToken } from "@/lib/email-settings";
import { ingestEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/process";

// Henter e-posten og lar AI-en lese den
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Ikke innlogget" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: unknown; force?: unknown } | null;
  const force = body?.force === true;
  const id = typeof body?.id === "string" && /^[0-9a-zA-Z]+$/.test(body.id) ? body.id : null;
  if (!id) return NextResponse.json({ ok: false, error: "Mangler id" }, { status: 400 });

  try {
    const settings = await getEmailSettings(user.id);
    const min = settings.gmail_min_amount === null ? null : Number(settings.gmail_min_amount);
    if (!force && min !== null && settings.gmail_skipped.includes(id)) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const token = await gmailAccessToken(user.id);
    if (!token) return NextResponse.json({ ok: false, error: "Gmail er ikke koblet til." });
    const email = await fetchEmail(token, id);
    // Brukerens egen klient: Row Level Security gjelder som vanlig
    const result = await ingestEmail(supabase, user.id, email);
    if (!result.ok || result.duplicate || force || min === null) return NextResponse.json(result);

    // Under beløpsgrensen: slett kvitteringen igjen og husk at den er hoppet over.
    // Mangler beløpet (AI-en fant det ikke), beholdes den så du kan sjekke selv.
    const { data: r } = await supabase.from("receipts").select("total, file_path").eq("id", result.id).single();
    if (r && r.total !== null && Number(r.total) < min) {
      await supabase.from("receipts").delete().eq("id", result.id);
      await supabase.storage.from(BUCKET).remove([r.file_path as string]);
      await createAdminClient()
        .from("email_settings")
        .update({ gmail_skipped: [...settings.gmail_skipped.filter((x) => x !== id), id].slice(-5000) })
        .eq("user_id", user.id);
      return NextResponse.json({ ok: true, skipped: true, total: Number(r.total) });
    }
    return NextResponse.json(result);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Import feilet.";
    return NextResponse.json({ ok: false, error, reconnect: err instanceof GmailAuthError });
  }
}
