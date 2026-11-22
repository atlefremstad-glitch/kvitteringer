"use client";

import { useState, useTransition } from "react";
import { addExclude, removeExclude, setMinAmount } from "./actions";

export function GmailFilters({ excludes, minAmount }: { excludes: string[]; minAmount: number | null }) {
  const [text, setText] = useState("");
  const [amount, setAmount] = useState(minAmount === null ? "" : String(minAmount).replace(".", ","));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      setSaved(false);
      const res = await fn();
      if (!res.ok) setError(res.error);
      else after?.();
    });

  return (
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Filtre
        {excludes.length > 0 && ` · ${excludes.length} unntak`}
        {minAmount !== null && ` · over ${String(minAmount).replace(".", ",")} kr`}
      </summary>

      <div className="mt-3 space-y-4">
        <div className="space-y-2">
          <p className="label">Skjul avsendere (lagres)</p>
          {excludes.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {excludes.map((e) => (
                <li key={e} className="flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-3 pr-1 text-sm">
                  {e}
                  <button
                    type="button"
                    aria-label={`Fjern ${e}`}
                    className="rounded-full px-1.5 text-muted hover:text-foreground"
                    disabled={pending}
                    onClick={() => run(() => removeExclude(e))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              run(() => addExclude(text), () => setText(""));
            }}
          >
            <input
              value={text}
              onChange={(ev) => setText(ev.target.value)}
              className="input flex-1"
              placeholder="F.eks. Bolt, Foodora eller vipps.no"
            />
            <button className="btn" type="submit" disabled={pending || !text.trim()}>Legg til</button>
          </form>
        </div>

        <div className="space-y-2">
          <label className="label" htmlFor="min-amount">Importer bare kvitteringer over (kr)</label>
          <form
            className="flex gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              run(() => setMinAmount(amount), () => setSaved(true));
            }}
          >
            <input
              id="min-amount"
              value={amount}
              onChange={(ev) => setAmount(ev.target.value)}
              inputMode="decimal"
              className="input w-32"
              placeholder="Ingen grense"
            />
            <button className="btn" type="submit" disabled={pending}>Lagre</button>
          </form>
          <p className="text-xs text-muted">
            Beløpet står ikke i Gmail-søket, så AI-en må lese kvitteringen først. Er beløpet under grensen, slettes den
            igjen og merkes «Under grensen». Tomt felt = ingen grense.
          </p>
          {saved && <p className="text-sm text-green-700 dark:text-green-300">Lagret.</p>}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </details>
  );
}
