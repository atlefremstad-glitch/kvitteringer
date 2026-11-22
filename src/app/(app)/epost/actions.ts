"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailSettings } from "@/lib/email-settings";

type Result = { ok: true } | { ok: false; error: string };

async function save(userId: string, patch: Record<string, unknown>): Promise<Result> {
  const { error } = await createAdminClient().from("email_settings").update(patch).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/epost");
  return { ok: true };
}

/** Legger til en avsender som skal skjules i Gmail-søket (f.eks. «Bolt» eller «foodora.no»). */
export async function addExclude(value: string): Promise<Result> {
  const { user } = await requireUser();
  const v = value.replace(/["()]/g, "").trim().slice(0, 100);
  if (!v) return { ok: false, error: "Skriv inn et navn eller en adresse." };
  const s = await getEmailSettings(user.id);
  if (s.gmail_excludes.some((e) => e.toLowerCase() === v.toLowerCase())) return { ok: true };
  if (s.gmail_excludes.length >= 100) return { ok: false, error: "Maks 100 unntak." };
  return save(user.id, { gmail_excludes: [...s.gmail_excludes, v] });
}

export async function removeExclude(value: string): Promise<Result> {
  const { user } = await requireUser();
  const s = await getEmailSettings(user.id);
  return save(user.id, { gmail_excludes: s.gmail_excludes.filter((e) => e !== value) });
}

/** Beløpsgrense for import fra Gmail. Tom verdi slår grensen av. */
export async function setMinAmount(value: string): Promise<Result> {
  const { user } = await requireUser();
  const text = value.replace(/\s/g, "").replace(",", ".");
  if (text === "") return save(user.id, { gmail_min_amount: null });
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Skriv et tall, f.eks. 200." };
  return save(user.id, { gmail_min_amount: Math.round(n * 100) / 100 });
}
