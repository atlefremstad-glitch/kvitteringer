import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeExpired } from "@/lib/trash";

/**
 * Kjøres av Vercel Cron hver natt (se vercel.json): sletter for godt
 * kvitteringer som har ligget i søppelbøtta i over 30 dager, for alle brukere.
 * Vercel sender "Authorization: Bearer <CRON_SECRET>" når CRON_SECRET er satt.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Ikke tilgang" }, { status: 401 });
  }
  const supabase = createAdminClient();
  let deleted = 0;
  // Maks 1000 per runde; gå videre til alt gammelt er borte.
  for (let i = 0; i < 20; i++) {
    const result = await purgeExpired(supabase);
    if (!result.ok) return NextResponse.json({ error: result.error, deleted }, { status: 500 });
    deleted += result.deleted;
    if (result.deleted < 1000) break;
  }
  return NextResponse.json({ deleted });
}
