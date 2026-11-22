import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/categories";
import { periods } from "@/lib/periods";
import { ReceiptList, type ReceiptRow } from "./ReceiptList";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function ReceiptsPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const q = one(params.q).trim();
  const kategori = one(params.kategori);
  const fra = one(params.fra);
  const til = one(params.til);
  const overText = one(params.over).replace(/\s/g, "").replace(",", ".");
  const over = overText !== "" && Number.isFinite(Number(overText)) ? Number(overText) : null;

  const { supabase } = await requireUser();

  // Hurtigvalg beholder de andre filtrene og bytter bare fra/til
  const presets = periods().map((p) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (kategori) sp.set("kategori", kategori);
    if (one(params.over)) sp.set("over", one(params.over));
    if (p.fra) sp.set("fra", p.fra);
    if (p.til) sp.set("til", p.til);
    const qs = sp.toString();
    return { ...p, href: qs ? `/?${qs}` : "/", active: p.fra === fra && p.til === til };
  });

  let query = supabase
    .from("receipts")
    .select("id, merchant, purchase_date, total, currency, category, status, created_at, note, project_id")
    .order("purchase_date", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(1000);

  if (q) query = query.ilike("merchant", `%${q.replace(/[%_\\]/g, "\\$&")}%`);
  if ((CATEGORIES as readonly string[]).includes(kategori)) query = query.eq("category", kategori);
  if (isIsoDate(fra)) query = query.gte("purchase_date", fra);
  if (isIsoDate(til)) query = query.lte("purchase_date", til);
  if (over !== null) query = query.gt("total", over);

  const [{ data, error }, { data: projectData }] = await Promise.all([
    query,
    supabase.from("projects").select("id, name").order("created_at", { ascending: false }),
  ]);
  const rows = (data ?? []) as ReceiptRow[];
  const projects = (projectData ?? []) as { id: string; name: string }[];

  const filtered = Boolean(q || kategori || fra || til || over !== null);

  return (
    <div className="space-y-4">
      <form className="card grid grid-cols-2 gap-3 p-3 sm:grid-cols-6" method="get">
        <div className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-6">
          {presets.map((p) => (
            <Link
              key={p.key}
              href={p.href}
              className={`rounded-full border px-3 py-1 text-sm ${
                p.active ? "border-accent bg-accent text-accent-foreground" : "border-border hover:bg-background"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="q">Søk på butikk</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="F.eks. Rema" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="kategori">Kategori</label>
          <select id="kategori" name="kategori" defaultValue={kategori} className="input">
            <option value="">Alle</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fra">Fra dato</label>
          <input id="fra" name="fra" type="date" defaultValue={fra} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="til">Til dato</label>
          <input id="til" name="til" type="date" defaultValue={til} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="over">Beløp over (kr)</label>
          <input id="over" name="over" inputMode="decimal" defaultValue={one(params.over)} className="input" placeholder="0" />
        </div>
        <div className="col-span-2 flex gap-2 sm:col-span-6">
          <button className="btn-primary" type="submit">Filtrer</button>
          {filtered && <Link href="/" className="btn">Nullstill</Link>}
        </div>
      </form>

      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <p className="text-sm text-muted">
          {rows.length} {rows.length === 1 ? "kvittering" : "kvitteringer"}
          {filtered ? " (filtrert)" : ""}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">Kunne ikke hente kvitteringer: {error.message}</p>}

      {rows.length === 0 && !error ? (
        <div className="card p-8 text-center">
          <p className="mb-4 text-muted">
            {filtered ? "Ingen kvitteringer passer filteret." : "Du har ingen kvitteringer ennå."}
          </p>
          {!filtered && <Link href="/ny" className="btn-primary">Legg til første kvittering</Link>}
        </div>
      ) : (
        <ReceiptList rows={rows} projects={projects} />
      )}
    </div>
  );
}
