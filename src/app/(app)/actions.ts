"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/process";
import { purgeReceipts } from "@/lib/trash";

const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

function refreshLists() {
  revalidatePath("/");
  revalidatePath("/kart");
  revalidatePath("/soppelbotte");
  revalidatePath("/prosjekter", "layout");
}

/** Flytter kvitteringer til søppelbøtta. De slettes for godt etter 30 dager. */
export async function deleteReceipts(receiptIds: string[]) {
  const ids = receiptIds.filter(isId).slice(0, 1000);
  if (ids.length === 0) return { ok: false as const, error: "Velg minst én kvittering." };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("receipts")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids)
    .is("deleted_at", null)
    .select("id");
  if (error) return { ok: false as const, error: error.message };

  refreshLists();
  return { ok: true as const, deleted: data?.length ?? 0 };
}

/** Henter kvitteringer tilbake fra søppelbøtta. */
export async function restoreReceipts(receiptIds: string[]) {
  const ids = receiptIds.filter(isId).slice(0, 1000);
  if (ids.length === 0) return { ok: false as const, error: "Velg minst én kvittering." };

  const { supabase } = await requireUser();
  const { error } = await supabase.from("receipts").update({ deleted_at: null }).in("id", ids);
  if (error) return { ok: false as const, error: error.message };

  refreshLists();
  for (const id of ids) revalidatePath(`/kvittering/${id}`);
  return { ok: true as const };
}

/** Sletter kvitteringer i søppelbøtta for godt, med filene. Kan ikke angres. */
export async function purgeFromTrash(receiptIds: string[] | "all") {
  const { supabase } = await requireUser();
  let ids: string[];
  if (receiptIds === "all") {
    const { data, error } = await supabase.from("receipts").select("id").not("deleted_at", "is", null).limit(1000);
    if (error) return { ok: false as const, error: error.message };
    ids = (data ?? []).map((r) => r.id as string);
  } else {
    ids = receiptIds.filter(isId).slice(0, 1000);
  }
  const result = await purgeReceipts(supabase, ids);
  refreshLists();
  return result;
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
