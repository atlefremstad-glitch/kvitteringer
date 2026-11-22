"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { GmailHit } from "@/lib/gmail";
import { addExclude } from "./actions";

type State =
  | { kind: "busy" }
  | { kind: "done"; id: string }
  | { kind: "skipped"; total?: number }
  | { kind: "hidden" }
  | { kind: "error"; text: string };

const dateText = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" }) : "";
const sender = (from: string) => from.replace(/\s*<[^>]+>\s*$/, "").replace(/^"|"$/g, "") || from;

const MAIL_PROVIDERS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "yahoo.com", "icloud.com", "me.com", "online.no",
]);

/** Domenet til avsenderen (bolt.eu), eller hele adressen for vanlige e-posttjenester. */
function excludeKey(from: string) {
  const email = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
  const domain = email.split("@")[1];
  if (!domain || MAIL_PROVIDERS.has(domain)) return email;
  const parts = domain.split(".");
  return parts.length > 2 && !/^(co|com)$/.test(parts[parts.length - 2]) ? parts.slice(-2).join(".") : domain;
}

export function GmailResults({
  hits,
  imported,
  skipped,
  pageLabel,
}: {
  hits: GmailHit[];
  imported: Record<string, string>;
  skipped: string[];
  pageLabel: string;
}) {
  const [state, setState] = useState<Record<string, State>>(() => {
    const init: Record<string, State> = {};
    for (const id of skipped) init[id] = { kind: "skipped" };
    for (const [gid, id] of Object.entries(imported)) init[gid] = { kind: "done", id };
    return init;
  });
  const [bulk, setBulk] = useState(false);
  const [, start] = useTransition();

  async function importOne(gid: string, force = false) {
    setState((s) => ({ ...s, [gid]: { kind: "busy" } }));
    const res = await fetch("/api/gmail/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: gid, force }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "Nettverksfeil" }));
    setState((s) => ({
      ...s,
      [gid]: !res.ok
        ? { kind: "error", text: res.error ?? "Feilet" }
        : res.skipped
          ? { kind: "skipped", total: res.total }
          : { kind: "done", id: res.id },
    }));
  }

  async function importAll() {
    setBulk(true);
    for (const h of hits) {
      const k = state[h.id]?.kind;
      if (k === "done" || k === "skipped" || k === "hidden") continue;
      await importOne(h.id);
    }
    setBulk(false);
  }

  function hideSender(h: GmailHit) {
    const key = excludeKey(h.from);
    if (!window.confirm(`Skjul alle e-poster fra «${key}» i søket?`)) return;
    const same = hits.filter((x) => excludeKey(x.from) === key).map((x) => x.id);
    start(async () => {
      const res = await addExclude(key);
      if (res.ok) setState((s) => ({ ...s, ...Object.fromEntries(same.map((id) => [id, { kind: "hidden" } as State])) }));
    });
  }

  if (hits.length === 0) return <p className="text-sm text-muted">Ingen treff.</p>;

  const visible = hits.filter((h) => state[h.id]?.kind !== "hidden");
  const remaining = visible.filter((h) => !["done", "skipped"].includes(state[h.id]?.kind ?? "")).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{pageLabel}</p>
        {remaining > 0 && (
          <button className="btn" onClick={importAll} disabled={bulk}>
            {bulk ? "Importerer…" : `Importer alle (${remaining})`}
          </button>
        )}
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {visible.map((h) => {
          const st = state[h.id];
          return (
            <li key={h.id} className="flex items-start gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{h.subject}</p>
                <p className="truncate text-sm text-muted">
                  {sender(h.from)} · {dateText(h.date)}
                  {h.hasAttachment ? " · 📎" : ""}
                </p>
                {h.amount !== undefined && (
                  <p className="text-sm font-medium tabular-nums">
                    {h.amount === null ? (
                      <span className="font-normal text-muted">Pris ikke funnet</span>
                    ) : (
                      `ca. ${h.amount.toLocaleString("nb-NO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kr`
                    )}
                  </p>
                )}
                {st?.kind === "error" && <p className="text-sm text-red-600">{st.text}</p>}
                {st?.kind === "skipped" && (
                  <p className="text-sm text-muted">
                    Under grensen{st.total !== undefined ? ` (${String(st.total).replace(".", ",")} kr)` : ""} ·{" "}
                    <button className="underline" onClick={() => importOne(h.id, true)} disabled={bulk}>
                      Importer likevel
                    </button>
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {st?.kind === "done" ? (
                  <Link href={`/kvittering/${st.id}`} className="text-sm underline">Åpne</Link>
                ) : st?.kind === "skipped" ? null : (
                  <button className="btn" onClick={() => importOne(h.id)} disabled={st?.kind === "busy" || bulk}>
                    {st?.kind === "busy" ? "Leser…" : "Importer"}
                  </button>
                )}
                {st?.kind !== "done" && st?.kind !== "busy" && (
                  <button className="text-xs text-muted underline" onClick={() => hideSender(h)} disabled={bulk}>
                    Skjul avsender
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
