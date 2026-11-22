import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchEmail, GmailAuthError } from "@/lib/gmail";
import { gmailAccessToken } from "@/lib/email-settings";
import { ingestEmail } from "@/lib/email";

// Henter e-posten og lar AI-en lese den
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Ikke innlogget" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" && /^[0-9a-zA-Z]+$/.test(body.id) ? body.id : null;
  if (!id) return NextResponse.json({ ok: false, error: "Mangler id" }, { status: 400 });

  try {
    const token = await gmailAccessToken(user.id);
    if (!token) return NextResponse.json({ ok: false, error: "Gmail er ikke koblet til." });
    const email = await fetchEmail(token, id);
    // Brukerens egen klient: Row Level Security gjelder som vanlig
    const result = await ingestEmail(supabase, user.id, email);
    return NextResponse.json(result);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Import feilet.";
    return NextResponse.json({ ok: false, error, reconnect: err instanceof GmailAuthError });
  }
}
