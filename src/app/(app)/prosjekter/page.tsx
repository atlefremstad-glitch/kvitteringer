import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { formatAmount, formatDate } from "@/lib/format";
import { sumByCurrency } from "@/lib/sums";

export const metadata: Metadata = { title: "Prosjekter – ReceiptMe" };

type ProjectRow = {
  id: string;
  name: string;
  created_at: string;
  receipts: { total: number | null; currency: string; purchase_date: string | null }[];
};

export default async function ProjectsPage() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, created_at, receipts(total, currency, purchase_date)")
    .order("created_at", { ascending: false });
  const projects = (data ?? []) as ProjectRow[];

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h1 className="text-xl font-semibold">Prosjekter</h1>
        <p className="text-sm text-muted">
          {projects.length} {projects.length === 1 ? "prosjekt" : "prosjekter"}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">Kunne ikke hente prosjekter: {error.message}</p>}

      {projects.length === 0 && !error ? (
        <div className="card space-y-2 p-8 text-center">
          <p className="text-muted">Du har ingen prosjekter ennå.</p>
          <p className="text-sm text-muted">
            Huk av kvitteringer i <Link href="/" className="underline">listen</Link> og trykk «Samle til 1 prosjekt».
          </p>
        </div>
      ) : (
        <ul className="card divide-y divide-border overflow-hidden">
          {projects.map((p) => {
            const sums = sumByCurrency(p.receipts);
            const dates = p.receipts.map((r) => r.purchase_date).filter((d): d is string => Boolean(d)).sort();
            return (
              <li key={p.id}>
                <Link href={`/prosjekter/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-background">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-sm text-muted">
                      {p.receipts.length} {p.receipts.length === 1 ? "kvittering" : "kvitteringer"}
                      {dates.length > 0
                        ? ` · ${formatDate(dates[0])}${dates.length > 1 && dates.at(-1) !== dates[0] ? `–${formatDate(dates.at(-1))}` : ""}`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-right font-semibold tabular-nums">
                    {sums.length === 0 ? formatAmount(0) : sums.map(([cur, t]) => formatAmount(t, cur)).join(" + ")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
