"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { isCategory } from "@/lib/categories";
import { parseAmount, parseDate } from "@/lib/format";
import { geocode } from "@/lib/geocode";
import { nokFields } from "@/lib/fx";
import { processReceipt, refreshLocation } from "@/lib/process";

export type ReceiptInput = {
  merchant: string;
  org_number: string;
  purchase_date: string;
  total: string;
  currency: string;
  vat: string;
  payment_method: string;
  category: string;
  note: string;
  address: string;
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

  // Ny eller endret adresse: finn koordinatene på nytt.
  const address = text(input.address)?.slice(0, 300) ?? null;
  const { data: current } = await supabase
    .from("receipts")
    .select("address, latitude, longitude")
    .eq("id", id)
    .single();
  let location = {
    address,
    latitude: (current?.latitude ?? null) as number | null,
    longitude: (current?.longitude ?? null) as number | null,
  };
  let warning: string | null = null;
  const missingCoords = location.latitude === null || location.longitude === null;
  if (address !== (current?.address ?? null) || (address && missingCoords)) {
    const coords = await geocode({ address });
    location = { address, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null };
    if (address && !coords) warning = "Lagret, men fant ikke adressen på kartet. Sjekk skrivemåten.";
  }

  const total = parseAmount(input.total);
  const purchaseDate = parseDate(input.purchase_date);
  const nok = await nokFields(total, currency, purchaseDate);

  const { error } = await supabase
    .from("receipts")
    .update({
      ...location,
      ...nok,
      merchant: text(input.merchant),
      org_number: text(input.org_number)?.replace(/\D/g, "") || null,
      purchase_date: purchaseDate,
      total,
      currency,
      vat: parseAmount(input.vat),
      payment_method: text(input.payment_method),
      category: isCategory(input.category) ? input.category : null,
      note: input.note.trim() === "" ? null : input.note.trim().slice(0, 2000),
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
  revalidatePath("/kart");
  revalidatePath("/prosjekter", "layout");
  revalidatePath(`/kvittering/${id}`);
  return { ok: true as const, warning };
}

export async function findLocation(id: string) {
  const { supabase } = await requireUser();
  const result = await refreshLocation(supabase, id);
  revalidatePath("/kart");
  revalidatePath(`/kvittering/${id}`);
  return result;
}

/** Flytter kvitteringen til søppelbøtta. */
export async function deleteReceipt(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("receipts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/");
  revalidatePath("/kart");
  revalidatePath("/soppelbotte");
  revalidatePath("/prosjekter", "layout");
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
