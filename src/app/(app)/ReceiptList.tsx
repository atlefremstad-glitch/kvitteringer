"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatAmount, formatDate } from "@/lib/format";
import type { Receipt } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { groupIntoProject } from "./prosjekter/actions";
import { deleteReceipts } from "./actions";
import { useHoverPreview } from "./HoverPreview";

export type ReceiptRow = Pick<
  Receipt,
  "id" | "merchant" | "purchase_date" | "total" | "currency" | "category" | "status" | "created_at" | "note" | "project_id" | "items"
>;

/** Varelinjen med høyest pris, som et kort svar på «hva kjøpte jeg?». */
function mainItem(items: ReceiptRow["items"]) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const best = items.reduce((a, b) => ((b.price ?? -Infinity) > (a.price ?? -Infinity) ? b : a));
  const rest = items.length - 1;
  return rest > 0 ? `${best.name} + ${rest} til` : best.name;
}

const NEW = "__new__";

export function ReceiptList({ rows, projects }: { rows: ReceiptRow[]; projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"idle" | "group" | "delete">("idle");
  const [target, setTarget] = useState<string>(NEW);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const preview = useHoverPreview();

  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function clear() {
    setSelected(new Set());
    setMode("idle");
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await groupIntoProject(
        [...selected],
        target === NEW ? { name } : { projectId: target },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/prosjekter/${result.projectId}`);
    });
  }

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteReceipts([...selected]);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      clear();
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-2 px-1 text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-muted">
          <input type="checkbox" className="size-4 accent-accent" checked={allSelected} onChange={toggleAll} />
          Velg alle
        </label>
      </div>

      <ul className="card divide-y divide-border overflow-hidden">
        {rows.map((r) => (
          <li key={r.id} className={`flex items-center ${selected.has(r.id) ? "bg-background" : ""}`}>
            <label className="flex cursor-pointer items-center self-stretch pl-4 pr-1">
              <input
                type="checkbox"
                className="size-5 accent-accent"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                aria-label={`Velg ${r.merchant ?? "kvittering"}`}
              />
            </label>
            <Link href={`/kvittering/${r.id}`} onClick={preview.hide} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-2 pr-4 hover:bg-background">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {/* Stort bilde vises bare når musen er over navnet */}
                  <span {...preview.handlers(r.id)}>{r.merchant ?? "Ukjent butikk"}</span>
                </p>
                <p className="truncate text-sm text-muted">
                  {formatDate(r.purchase_date)}
                  {r.category ? ` · ${r.category}` : ""}
                </p>
                {mainItem(r.items) && <p className="truncate text-sm">{mainItem(r.items)}</p>}
                {r.note && <p className="truncate text-sm italic text-muted">{r.note}</p>}
                {r.project_id && projectName.has(r.project_id) && (
                  <p className="mt-1">
                    <span className="rounded-full border border-accent px-2 py-0.5 text-xs text-accent">
                      {projectName.get(r.project_id)}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-semibold tabular-nums">{formatAmount(r.total, r.currency)}</span>
                {r.status !== "ok" && <StatusBadge status={r.status} />}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {preview.panel}

      {selected.size > 0 && (
        <div className="sticky bottom-0 z-10 pb-[env(safe-area-inset-bottom)]">
          <div className="card space-y-3 p-3 shadow-lg">
            {mode === "idle" ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">{selected.size} valgt</span>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="btn" onClick={clear}>Avbryt</button>
                  <button type="button" className="btn-danger" onClick={() => setMode("delete")}>
                    Slett
                  </button>
                  <button type="button" className="btn-primary" onClick={() => setMode("group")}>
                    Samle til 1 prosjekt
                  </button>
                </div>
              </div>
            ) : mode === "delete" ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  Slette {selected.size} {selected.size === 1 ? "kvittering" : "kvitteringer"} for godt? Bildene og filene slettes også. Dette kan ikke angres.
                </p>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn" onClick={() => setMode("idle")} disabled={pending}>Nei, tilbake</button>
                  <button type="button" className="btn-danger" onClick={confirmDelete} disabled={pending}>
                    {pending ? "Sletter …" : `Ja, slett ${selected.size}`}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <p className="text-sm font-medium">Samle {selected.size} kvitteringer i</p>
                {projects.length > 0 && (
                  <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value={NEW}>Nytt prosjekt …</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                {target === NEW && (
                  <input
                    className="input"
                    placeholder="Navn på prosjektet, f.eks. Oppussing bad"
                    value={name}
                    maxLength={100}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn" onClick={() => setMode("idle")} disabled={pending}>Tilbake</button>
                  <button type="submit" className="btn-primary" disabled={pending || (target === NEW && !name.trim())}>
                    {pending ? "Lagrer …" : "Lagre"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
