import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processReceipt } from "@/lib/process";

// AI-uttrekk kan ta litt tid
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  const result = await processReceipt(supabase, user.id, id);
  return NextResponse.json(result, { status: 200 });
}
