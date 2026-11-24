"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatAmount, formatDate } from "@/lib/format";
import type { Receipt } from "@/lib/types";
import { purgeFromTrash, restoreReceipts } from "../actions";

export type TrashRow = Pick<Receipt, "id" | "merchant" | "purchase_date" | "total" | "currency"> & { daysLeft: number };

function daysLeftText(left: number) {
  return left <= 1 ? "Slettes for godt i løpet av et døgn" : `Slettes for godt om ${left} dager`;
}

export function TrashList({ rows }: { rows: TrashRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(key: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusy(key);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Noe gikk galt.");
      setBusy(null);
      router.refresh();
    });
  }

  function purgeOne(r: TrashRow) {
    if (!window.confirm(`Slette ${r.merchant ?? "kvitteringen"} for godt? Dette kan ikke angres.`)) return;
    run(`purge:${r.id}`, () => purgeFromTrash([r.id]));
  }

  function purgeAll() {
    if (!window.confirm(`Slette alle ${rows.length} kvitteringene i søppelbøtta for godt? Dette kan ikke angres.`)) return;
    run("all", () => purgeFromTrash("all"));
  }

  return (
    <>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="card divide-y divide-border overflow-hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.merchant ?? "Ukjent butikk"}</p>
              <p className="truncate text-sm text-muted">
                {formatDate(r.purchase_date)} · {formatAmount(r.total, r.currency)}
              </p>
              <p className="text-xs text-muted">{daysLeftText(r.daysLeft)}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() => run(`restore:${r.id}`, () => restoreReceipts([r.id]))}
              >
                {busy === `restore:${r.id}` ? "Henter …" : "Gjenopprett"}
              </button>
              <button type="button" className="btn-danger" disabled={pending} onClick={() => purgeOne(r)}>
                {busy === `purge:${r.id}` ? "Sletter …" : "Slett for godt"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => run("restore-all", () => restoreReceipts(rows.map((r) => r.id)))}
        >
          {busy === "restore-all" ? "Henter …" : "Gjenopprett alle"}
        </button>
        <button type="button" className="btn-danger" disabled={pending} onClick={purgeAll}>
          {busy === "all" ? "Sletter …" : "Tøm søppelbøtta"}
        </button>
      </div>
    </>
  );
}
