import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { formatAmount, formatDate } from "@/lib/format";
import { sumByCurrency } from "@/lib/sums";
import type { Receipt } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { ProjectHeader } from "./ProjectHeader";
import { RemoveButton } from "./RemoveButton";

export const metadata: Metadata = { title: "Prosjekt – ReceiptMe" };

type Row = Pick<Receipt, "id" | "merchant" | "purchase_date" | "total" | "currency" | "category" | "status" | "note">;

export default async function ProjectPage({ params }: PageProps<"/prosjekter/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { supabase } = await requireUser();
  const [{ data: project }, { data, error }] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", id).maybeSingle(),
    supabase
      .from("receipts")
      .select("id, merchant, purchase_date, total, currency, category, status, note")
      .eq("project_id", id)
      .order("purchase_date", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false }),
  ]);
  if (!project) notFound();
  const rows = (data ?? []) as Row[];
  const sums = sumByCurrency(rows);

  // Sum per kategori (bare NOK, for enkelhets skyld)
  const byCategory = new Map<string, number>();
  for (const r of rows) {
    if (r.total === null || r.currency !== "NOK") continue;
    const key = r.category ?? "Uten kategori";
    byCategory.set(key, (byCategory.get(key) ?? 0) + Number(r.total));
  }
  const categories = [...byCategory.entries()].sort(([, a], [, b]) => b - a);

  return (
    <div className="space-y-4">
      <Link href="/prosjekter" className="text-sm underline">← Alle prosjekter</Link>

      <ProjectHeader id={project.id as string} name={project.name as string} />

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-muted">
            {rows.length} {rows.length === 1 ? "kvittering" : "kvitteringer"}
          </p>
          <p className="text-right text-2xl font-semibold tabular-nums">
            {sums.length === 0 ? formatAmount(0) : sums.map(([cur, t]) => formatAmount(t, cur)).join(" + ")}
          </p>
        </div>
        {categories.length > 1 && (
          <ul className="space-y-1 border-t border-border pt-3 text-sm">
            {categories.map(([cat, total]) => (
              <li key={cat} className="flex justify-between gap-2">
                <span className="text-muted">{cat}</span>
                <span className="tabular-nums">{formatAmount(total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-red-600">Kunne ikke hente kvitteringer: {error.message}</p>}

      {rows.length === 0 && !error ? (
        <div className="card p-8 text-center text-muted">
          Ingen kvitteringer i prosjektet. Legg til fra <Link href="/" className="underline">listen</Link>.
        </div>
      ) : (
        <ul className="card divide-y divide-border overflow-hidden">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center">
              <Link href={`/kvittering/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-background">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.merchant ?? "Ukjent butikk"}</p>
                  <p className="truncate text-sm text-muted">
                    {formatDate(r.purchase_date)}
                    {r.category ? ` · ${r.category}` : ""}
                  </p>
                  {r.note && <p className="truncate text-sm italic text-muted">{r.note}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-semibold tabular-nums">{formatAmount(r.total, r.currency)}</span>
                  {r.status !== "ok" && <StatusBadge status={r.status} />}
                </div>
              </Link>
              <RemoveButton projectId={project.id as string} receiptId={r.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
