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

export type Preview =
  | { kind: "image" | "pdf"; url: string }
  | { kind: "text"; text: string }
  | { kind: "none" };

/** Kortlevd lenke til filen, til forhåndsvisning når musen holdes over en kvittering. */
export async function receiptPreview(id: string): Promise<Preview> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { kind: "none" };
  const { supabase } = await requireUser();
  const { data } = await supabase.from("receipts").select("file_path, file_type").eq("id", id).maybeSingle();
  if (!data?.file_path) return { kind: "none" };
  const type = data.file_type as string;

  if (type === "text/plain") {
    const { data: blob } = await supabase.storage.from(BUCKET).download(data.file_path);
    const text = blob ? (await blob.text()).slice(0, 3000) : "";
    return text ? { kind: "text", text } : { kind: "none" };
  }
  // HEIC vises ikke i nettlesere før AI-en har konvertert filen
  if (type === "image/heic" || type === "image/heif") return { kind: "none" };

  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(data.file_path, 60 * 60);
  if (!signed?.signedUrl) return { kind: "none" };
  return { kind: type === "application/pdf" ? "pdf" : "image", url: signed.signedUrl };
}
