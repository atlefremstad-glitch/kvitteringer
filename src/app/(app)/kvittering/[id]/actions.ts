"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { isCategory } from "@/lib/categories";
import { parseAmount, parseDate } from "@/lib/format";
import { BUCKET, processReceipt } from "@/lib/process";

export type ReceiptInput = {
  merchant: string;
  org_number: string;
  purchase_date: string;
  total: string;
  currency: string;
  vat: string;
  payment_method: string;
  category: string;
  items: { name: string; quantity: string; price: string }[];
};

const text = (v: string) => (v.trim() === "" ? null : v.trim());

export async function updateReceipt(id: string, input: ReceiptInput) {
  const { supabase } = await requireUser();

  if (input.purchase_date.trim() && !parseDate(input.purchase_date)) {
    return { ok: false as const, error: "Ugyldig dato. Bruk dd.mm.åååå." };
  }
  const currency = (text(input.currency) ?? "NOK").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false as const, error: "Valuta må være tre bokstaver, f.eks. NOK." };
  }

  const { error } = await supabase
    .from("receipts")
    .update({
      merchant: text(input.merchant),
      org_number: text(input.org_number)?.replace(/\D/g, "") || null,
      purchase_date: parseDate(input.purchase_date),
      total: parseAmount(input.total),
      currency,
      vat: parseAmount(input.vat),
      payment_method: text(input.payment_method),
      category: isCategory(input.category) ? input.category : null,
      items: input.items
        .filter((i) => i.name.trim() !== "")
        .map((i) => ({
          name: i.name.trim(),
          quantity: parseAmount(i.quantity),
          price: parseAmount(i.price),
        })),
      status: "ok",
      ai_error: null,
    })
    .eq("id", id);

  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/");
  revalidatePath(`/kvittering/${id}`);
  return { ok: true as const };
}

export async function deleteReceipt(id: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("receipts").select("file_path").eq("id", id).single();
  if (data?.file_path) await supabase.storage.from(BUCKET).remove([data.file_path]);
  const { error } = await supabase.from("receipts").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/");
  redirect("/");
}

export async function retryExtraction(id: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("receipts").update({ status: "processing" }).eq("id", id);
  const result = await processReceipt(supabase, user.id, id);
  revalidatePath("/");
  revalidatePath(`/kvittering/${id}`);
  return result;
}
