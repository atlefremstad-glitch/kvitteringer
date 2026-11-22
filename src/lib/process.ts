import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import convert from "heic-convert";
import { extractReceipt, prepareForClaude } from "./extract";

export const BUCKET = "receipts";

/**
 * Leser filen fra Storage, sender den til Claude og lagrer resultatet.
 * Feiler AI-uttrekket, lagres kvitteringen med status "needs_review".
 */
export async function processReceipt(supabase: SupabaseClient, userId: string, id: string, context?: string) {
  const { data: receipt, error } = await supabase
    .from("receipts")
    .select("id, file_path, file_type")
    .eq("id", id)
    .single();
  if (error || !receipt) return { ok: false as const, error: "Fant ikke kvitteringen." };

  const fail = async (message: string, raw: unknown = null) => {
    await supabase
      .from("receipts")
      .update({ status: "needs_review", ai_error: message, raw_ai: raw ?? null })
      .eq("id", id);
    return { ok: false as const, error: message };
  };

  const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(receipt.file_path);
  if (dlError || !blob) return fail("Kunne ikke lese filen fra lagringen.");

  let buffer: Buffer = Buffer.from(await blob.arrayBuffer());
  let fileType: string = receipt.file_type;

  try {
    // HEIC (iPhone) kan ikke vises i de fleste nettlesere eller leses av Claude.
    // Konverter til JPEG og bytt ut filen i Storage.
    if (fileType === "image/heic" || fileType === "image/heif") {
      const jpeg = Buffer.from(await convert({ buffer, format: "JPEG", quality: 0.9 }));
      const newPath = `${userId}/${id}.jpg`;
      const { error: upError } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, jpeg, { contentType: "image/jpeg", upsert: true });
      if (upError) return fail("Kunne ikke lagre konvertert bilde.");
      if (newPath !== receipt.file_path) {
        await supabase.storage.from(BUCKET).remove([receipt.file_path]);
      }
      await supabase.from("receipts").update({ file_path: newPath, file_type: "image/jpeg" }).eq("id", id);
      buffer = jpeg;
      fileType = "image/jpeg";
    }

    const content = await prepareForClaude(buffer, fileType);
    const result = await extractReceipt(content, context);
    if (!result.ok) return fail(result.error, result.raw);

    const { error: saveError } = await supabase
      .from("receipts")
      .update({ ...result.data, status: "ok", ai_error: null, raw_ai: result.raw })
      .eq("id", id);
    if (saveError) return fail("Kunne ikke lagre AI-resultatet.", result.raw);

    return { ok: true as const };
  } catch (err) {
    return fail(err instanceof Error ? `Behandling feilet: ${err.message}` : "Behandling feilet.");
  }
}
