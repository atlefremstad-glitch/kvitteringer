import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { daysLeft, purgeExpired, TRASH_DAYS } from "@/lib/trash";
import { TrashList, type TrashRow } from "./TrashList";

export const metadata: Metadata = { title: "Søppelbøtte – ReceiptMe" };

export default async function TrashPage() {
  const { supabase } = await requireUser();
  await purgeExpired(supabase);

  const { data, error } = await supabase
    .from("receipts")
    .select("id, merchant, purchase_date, total, currency, deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(1000);
  const rows: TrashRow[] = (data ?? []).map(({ deleted_at, ...r }) => ({
    ...(r as Omit<TrashRow, "daysLeft">),
    daysLeft: daysLeft(deleted_at as string),
  }));

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm underline">← Alle kvitteringer</Link>
      <div className="space-y-1 px-1">
        <h1 className="text-xl font-semibold">Søppelbøtte</h1>
        <p className="text-sm text-muted">
          Slettede kvitteringer ligger her i {TRASH_DAYS} dager. Deretter slettes de for godt, med bilde og fil.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">Kunne ikke hente søppelbøtta: {error.message}</p>}

      {rows.length === 0 && !error ? (
        <div className="card p-8 text-center text-muted">Søppelbøtta er tom.</div>
      ) : (
        <TrashList rows={rows} />
      )}
    </div>
  );
}
