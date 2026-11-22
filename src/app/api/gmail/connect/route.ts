import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUrl } from "@/lib/gmail";

// Sender brukeren til Google for å gi appen lesetilgang til Gmail.
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const state = crypto.randomUUID();
  let url: string;
  try {
    url = authUrl(origin, state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gmail er ikke satt opp.";
    return NextResponse.redirect(`${origin}/epost?feil=${encodeURIComponent(msg)}`);
  }
  const res = NextResponse.redirect(url);
  res.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    path: "/api/gmail",
    maxAge: 600,
  });
  return res;
}
