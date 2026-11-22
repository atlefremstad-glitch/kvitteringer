import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnectGmail } from "@/lib/email-settings";

export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`, 303);
  await disconnectGmail(user.id);
  return NextResponse.redirect(`${origin}/epost`, 303);
}
