import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "@/lib/process";

/** Antall dager en slettet kvittering ligger i søppelbøtta. */
export const TRASH_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

/** Hele dager igjen før en kvittering i søppelbøtta slettes for godt (minst 0). */
export function daysLeft(deletedAt: string) {
  return Math.max(0, Math.ceil((new Date(deletedAt).getTime() + TRASH_DAYS * DAY - Date.now()) / DAY));
}

/**
 * Sletter kvitteringene og filene deres for godt.
 * Med vanlig klient sørger RLS for at bare egne kvitteringer treffes.
 */
export async function purgeReceipts(supabase: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return { ok: true as const, deleted: 0 };
  const { data, error: readError } = await supabase
    .from("receipts")
    .select("id, file_path")
    .in("id", ids)
    .not("deleted_at", "is", null);
  if (readError) return { ok: false as const, error: readError.message };
  const found = (data ?? []).map((r) => r.id as string);
  if (found.length === 0) return { ok: true as const, deleted: 0 };

  const { error } = await supabase.from("receipts").delete().in("id", found);
  if (error) return { ok: false as const, error: error.message };

  // Filene slettes etter radene, så en feil her aldri etterlater kvitteringer uten fil.
  const paths = (data ?? []).map((r) => r.file_path as string).filter(Boolean);
  for (let i = 0; i < paths.length; i += 100) {
    await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
  }
  return { ok: true as const, deleted: found.length };
}

/** Sletter for godt alt som har ligget i søppelbøtta lenger enn TRASH_DAYS. */
export async function purgeExpired(supabase: SupabaseClient) {
  const cutoff = new Date(Date.now() - TRASH_DAYS * DAY).toISOString();
  const { data, error } = await supabase
    .from("receipts")
    .select("id")
    .lt("deleted_at", cutoff)
    .limit(1000);
  if (error) return { ok: false as const, error: error.message };
  return purgeReceipts(supabase, (data ?? []).map((r) => r.id as string));
}
