"use client";

import { useState } from "react";
import Link from "next/link";
import type { GmailHit } from "@/lib/gmail";

type State = { kind: "busy" } | { kind: "done"; id: string } | { kind: "error"; text: string };

const dateText = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" }) : "";
const sender = (from: string) => from.replace(/\s*<[^>]+>\s*$/, "").replace(/^"|"$/g, "") || from;

export function GmailResults({ hits, imported }: { hits: GmailHit[]; imported: Record<string, string> }) {
  const [state, setState] = useState<Record<string, State>>(() =>
    Object.fromEntries(Object.entries(imported).map(([gid, id]) => [gid, { kind: "done", id } as State])),
  );
  const [bulk, setBulk] = useState(false);

  async function importOne(gid: string) {
    setState((s) => ({ ...s, [gid]: { kind: "busy" } }));
    const res = await fetch("/api/gmail/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: gid }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "Nettverksfeil" }));
    setState((s) => ({
      ...s,
      [gid]: res.ok ? { kind: "done", id: res.id } : { kind: "error", text: res.error ?? "Feilet" },
    }));
  }

  async function importAll() {
    setBulk(true);
    for (const h of hits) {
      const st = state[h.id];
      if (st?.kind === "done") continue;
      await importOne(h.id);
    }
    setBulk(false);
  }

  if (hits.length === 0) return <p className="text-sm text-muted">Ingen treff.</p>;

  const remaining = hits.filter((h) => state[h.id]?.kind !== "done").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{hits.length} treff (nyeste først)</p>
        {remaining > 0 && (
          <button className="btn" onClick={importAll} disabled={bulk}>
            {bulk ? "Importerer…" : `Importer alle (${remaining})`}
          </button>
        )}
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {hits.map((h) => {
          const st = state[h.id];
          return (
            <li key={h.id} className="flex items-start gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{h.subject}</p>
                <p className="truncate text-sm text-muted">
                  {sender(h.from)} · {dateText(h.date)}
                  {h.hasAttachment ? " · 📎" : ""}
                </p>
                {st?.kind === "error" && <p className="text-sm text-red-600">{st.text}</p>}
              </div>
              <div className="shrink-0">
                {st?.kind === "done" ? (
                  <Link href={`/kvittering/${st.id}`} className="text-sm underline">Åpne</Link>
                ) : (
                  <button className="btn" onClick={() => importOne(h.id)} disabled={st?.kind === "busy" || bulk}>
                    {st?.kind === "busy" ? "Leser…" : "Importer"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">Hver import tar 5–20 sekunder fordi AI-en leser kvitteringen.</p>
    </div>
  );
}
