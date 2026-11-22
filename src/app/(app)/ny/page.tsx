import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import { Uploader } from "./Uploader";

export const metadata: Metadata = { title: "Ny kvittering – Kvitteringer" };

export default async function NewReceiptPage() {
  const { user } = await requireUser();
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Legg til kvittering</h1>
      <Uploader userId={user.id} />
    </div>
  );
}
