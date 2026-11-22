"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/process";

/** Sletter flere kvitteringer og filene deres. */
export async function deleteReceipts(receiptIds: string[]) {
  const ids = receiptIds.filter((v) => /^[0-9a-f-]{36}$/i.test(v)).slice(0, 1000);
  if (ids.length === 0) return { ok: false as const, error: "Velg minst én kvittering." };

  const { supabase } = await requireUser();
  const { data, error: readError } = await supabase.from("receipts").select("id, file_path").in("id", ids);
  if (readError) return { ok: false as const, error: readError.message };

  const { error } = await supabase.from("receipts").delete().in("id", ids);
  if (error) return { ok: false as const, error: error.message };

  // Filene slettes etter radene, så en feil her aldri etterlater kvitteringer uten fil.
  const paths = (data ?? []).map((r) => r.file_path as string).filter(Boolean);
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);

  revalidatePath("/");
  revalidatePath("/kart");
  revalidatePath("/prosjekter", "layout");
  return { ok: true as const, deleted: data?.length ?? 0 };
}
