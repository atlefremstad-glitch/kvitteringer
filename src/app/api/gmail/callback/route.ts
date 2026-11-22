import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, GMAIL_SCOPE, profileEmail } from "@/lib/gmail";
import { getEmailSettings } from "@/lib/email-settings";

// Google sender brukeren hit etter at tilgang er gitt (eller avslått).
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const back = (msg?: string) => {
    const res = NextResponse.redirect(`${origin}/epost${msg ? `?feil=${encodeURIComponent(msg)}` : ""}`);
    res.cookies.delete({ name: "gmail_oauth_state", path: "/api/gmail" });
    return res;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  if (searchParams.get("error")) return back("Du avbrøt tilkoblingen til Gmail.");
  const state = searchParams.get("state");
  if (!state || state !== request.cookies.get("gmail_oauth_state")?.value) {
    return back("Tilkoblingen utløp. Prøv igjen.");
  }
  if (!(searchParams.get("scope") ?? "").includes(GMAIL_SCOPE)) {
    return back("Du må krysse av for at appen kan lese e-post.");
  }
  const code = searchParams.get("code");
  if (!code) return back("Google sendte ingen kode.");

  try {
    const { accessToken, refreshToken } = await exchangeCode(origin, code);
    if (!refreshToken) return back("Google ga ingen varig tilgang. Fjern appen i Google-kontoen din og prøv igjen.");
    const email = await profileEmail(accessToken);

    await getEmailSettings(user.id);
    const { error } = await createAdminClient()
      .from("email_settings")
      .update({ gmail_email: email, gmail_refresh_token: refreshToken, gmail_connected_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (error) return back(`Kunne ikke lagre tilkoblingen: ${error.message}`);
  } catch (err) {
    return back(err instanceof Error ? err.message : "Tilkoblingen feilet.");
  }
  return back();
}
