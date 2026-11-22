import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { formatAmount, formatDate } from "@/lib/format";
import type { Receipt } from "@/lib/types";
import { ReceiptMap, type MapPoint } from "@/components/ReceiptMap";


export const metadata: Metadata = { title: "Kart – Kvitteringer" };

type Row = Pick<Receipt, "id" | "merchant" | "purchase_date" | "total" | "currency" | "address" | "latitude" | "longitude">;

export default async function MapPage() {
  const { supabase } = await requireUser();
  const [{ data, error }, { count: missing }] = await Promise.all([
    supabase
      .from("receipts")
      .select("id, merchant, purchase_date, total, currency, address, latitude, longitude")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("purchase_date", { ascending: false, nullsFirst: false })
      .limit(2000),
    supabase.from("receipts").select("id", { count: "exact", head: true }).is("latitude", null),
  ]);
  const rows = (data ?? []) as Row[];

  // Flere kjøp på samme sted blir ett punkt.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${Number(r.latitude).toFixed(5)},${Number(r.longitude).toFixed(5)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const points: MapPoint[] = [...groups.values()].map((g) => {
    const first = g[0];
    const name = first.merchant ?? "Ukjent butikk";
    if (g.length === 1) {
      return {
        id: first.id,
        latitude: Number(first.latitude),
        longitude: Number(first.longitude),
        title: name,
        subtitle: `${formatDate(first.purchase_date)} · ${formatAmount(first.total, first.currency)}`,
        href: `/kvittering/${first.id}`,
      };
    }
    const sameCurrency = g.every((r) => r.currency === first.currency);
    const sum = g.reduce((s, r) => s + Number(r.total ?? 0), 0);
    return {
      id: first.id,
      latitude: Number(first.latitude),
      longitude: Number(first.longitude),
      title: name,
      subtitle: `${g.length} kjøp${sameCurrency ? ` · ${formatAmount(sum, first.currency)}` : ""} · sist ${formatDate(first.purchase_date)}`,
      href: first.merchant ? `/?q=${encodeURIComponent(first.merchant)}` : `/kvittering/${first.id}`,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h1 className="text-lg font-semibold">Hvor har jeg handlet?</h1>
        <p className="text-sm text-muted">
          {rows.length} {rows.length === 1 ? "kvittering" : "kvitteringer"} på kartet
          {missing ? ` · ${missing} uten adresse` : ""}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">Kunne ikke hente kvitteringer: {error.message}</p>}

      {points.length === 0 ? (
        <div className="card p-8 text-center text-muted">
          <p className="mb-2">Ingen kvitteringer har adresse ennå.</p>
          <p className="text-sm">
            Nye kvitteringer får adresse automatisk. For eldre: åpne en kvittering og trykk «Finn adresse med AI».
          </p>
          <Link href="/" className="btn mt-4">Til kvitteringene</Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ReceiptMap points={points} className="h-[70vh]" />
        </div>
      )}
    </div>
  );
}
