import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import convert from "heic-convert";
import { extractReceipt, prepareForClaude } from "./extract";
import { geocode } from "./geocode";

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

    const { location, ...fields } = result.data;
    const coords = location ? await geocode(location) : null;

    const { error: saveError } = await supabase
      .from("receipts")
      .update({
        ...fields,
        address: location?.address ?? null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        status: "ok",
        ai_error: null,
        raw_ai: result.raw,
      })
      .eq("id", id);
    if (saveError) return fail("Kunne ikke lagre AI-resultatet.", result.raw);

    return { ok: true as const };
  } catch (err) {
    return fail(err instanceof Error ? `Behandling feilet: ${err.message}` : "Behandling feilet.");
  }
}

/**
 * Lar AI-en lese bare adressen på nytt (for kvitteringer lagt inn før kartet fantes).
 * Andre felt brukeren kan ha rettet, røres ikke.
 */
export async function refreshLocation(supabase: SupabaseClient, id: string) {
  const { data: receipt } = await supabase
    .from("receipts")
    .select("file_path, file_type")
    .eq("id", id)
    .single();
  if (!receipt) return { ok: false as const, error: "Fant ikke kvitteringen." };
  if (receipt.file_type === "image/heic" || receipt.file_type === "image/heif") {
    return { ok: false as const, error: "Trykk «Prøv AI igjen» først, så bildet blir konvertert." };
  }

  const { data: blob } = await supabase.storage.from(BUCKET).download(receipt.file_path);
  if (!blob) return { ok: false as const, error: "Kunne ikke lese filen fra lagringen." };

  try {
    const content = await prepareForClaude(Buffer.from(await blob.arrayBuffer()), receipt.file_type);
    const result = await extractReceipt(content);
    if (!result.ok) return { ok: false as const, error: result.error };
    const location = result.data.location;
    if (!location) return { ok: false as const, error: "Fant ingen butikkadresse på kvitteringen." };

    const coords = await geocode(location);
    const { error } = await supabase
      .from("receipts")
      .update({
        address: location.address,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      })
      .eq("id", id);
    if (error) return { ok: false as const, error: "Kunne ikke lagre adressen." };
    if (!coords) return { ok: false as const, error: `Fant adressen «${location.address}», men ikke på kartet.` };
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Noe gikk galt." };
  }
}
