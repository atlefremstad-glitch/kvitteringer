"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";
import { formatAmount, formatDate } from "@/lib/format";
import type { Receipt } from "@/lib/types";
import { deleteReceipt, retryExtraction, updateReceipt, type ReceiptInput } from "./actions";

const amountText = (v: number | null) =>
  v === null || v === undefined ? "" : Number(v).toFixed(2).replace(".", ",");
const qtyText = (v: number | null) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

function toInput(r: Receipt): ReceiptInput {
  return {
    merchant: r.merchant ?? "",
    org_number: r.org_number ?? "",
    purchase_date: r.purchase_date ? formatDate(r.purchase_date) : "",
    total: amountText(r.total),
    currency: r.currency ?? "NOK",
    vat: amountText(r.vat),
    payment_method: r.payment_method ?? "",
    category: r.category ?? "",
    note: r.note ?? "",
    address: r.address ?? "",
    items: (r.items ?? []).map((i) => ({
      name: i.name ?? "",
      quantity: qtyText(i.quantity),
      price: amountText(i.price),
    })),
  };
}

export function EditForm({ receipt }: { receipt: Receipt }) {
  const router = useRouter();
  const [form, setForm] = useState<ReceiptInput>(() => toInput(receipt));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"save" | "retry" | "delete" | null>(null);

  const set = <K extends keyof ReceiptInput>(key: K, value: ReceiptInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setItem = (index: number, key: "name" | "quantity" | "price", value: string) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === index ? { ...it, [key]: value } : it)),
    }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setAction("save");
    startTransition(async () => {
      const res = await updateReceipt(receipt.id, form);
      setMessage(
        !res.ok
          ? { kind: "error", text: res.error }
          : res.warning
            ? { kind: "error", text: res.warning }
            : { kind: "ok", text: "Lagret." },
      );
      if (res.ok) router.refresh();
    });
  }

  function retry() {
    setMessage(null);
    setAction("retry");
    startTransition(async () => {
      const res = await retryExtraction(receipt.id);
      if (!res.ok) setMessage({ kind: "error", text: res.error });
      // Last siden på nytt slik at skjemaet får de nye verdiene
      window.location.reload();
    });
  }

  function remove() {
    if (!window.confirm("Slette kvitteringen? Dette kan ikke angres.")) return;
    setAction("delete");
    startTransition(async () => {
      const res = await deleteReceipt(receipt.id);
      if (res && !res.ok) setMessage({ kind: "error", text: res.error });
    });
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-4">
      {receipt.status !== "ok" && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {receipt.status === "processing"
            ? "AI-en har ikke lest kvitteringen ferdig."
            : "AI-en klarte ikke å lese kvitteringen. Fyll ut feltene selv, eller prøv igjen."}
          {receipt.ai_error && <span className="mt-1 block text-xs opacity-80">Feil: {receipt.ai_error}</span>}
          <button type="button" className="btn mt-2" onClick={retry} disabled={pending}>
            {pending && action === "retry" ? "AI leser…" : "Prøv AI igjen"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label" htmlFor="merchant">Butikk</label>
          <input id="merchant" className="input" value={form.merchant} onChange={(e) => set("merchant", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="date">Dato (dd.mm.åååå)</label>
          <input id="date" className="input" inputMode="numeric" placeholder="22.11.2026" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="category">Kategori</label>
          <select id="category" className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Velg…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="total">Totalbeløp</label>
          <input id="total" className="input" inputMode="decimal" placeholder="0,00" value={form.total} onChange={(e) => set("total", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="currency">Valuta</label>
          <input id="currency" className="input uppercase" maxLength={3} value={form.currency} onChange={(e) => set("currency", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="vat">MVA</label>
          <input id="vat" className="input" inputMode="decimal" placeholder="0,00" value={form.vat} onChange={(e) => set("vat", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="payment">Betalingsmåte</label>
          <input id="payment" className="input" value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="org">Organisasjonsnummer</label>
          <input id="org" className="input" inputMode="numeric" value={form.org_number} onChange={(e) => set("org_number", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="address">Adresse (kjøpssted)</label>
          <input id="address" className="input" placeholder="F.eks. Storgata 1, 0155 Oslo" maxLength={300} value={form.address} onChange={(e) => set("address", e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="note">Notat</label>
        <textarea
          id="note"
          className="input min-h-20"
          rows={3}
          maxLength={2000}
          placeholder="F.eks. garanti til 2028, gave til mamma, refunderes av jobben"
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Varelinjer</h2>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => set("items", [...form.items, { name: "", quantity: "1", price: "" }])}
          >
            + Legg til linje
          </button>
        </div>
        {form.items.length === 0 ? (
          <p className="text-sm text-muted">Ingen varelinjer.</p>
        ) : (
          <ul className="space-y-2">
            <li className="grid grid-cols-[1fr_3.5rem_5.5rem_2rem] gap-2 text-xs text-muted">
              <span>Vare</span><span>Antall</span><span>Pris</span><span />
            </li>
            {form.items.map((it, i) => (
              <li key={i} className="grid grid-cols-[1fr_3.5rem_5.5rem_2rem] items-center gap-2">
                <input aria-label="Vare" className="input px-2" value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} />
                <input aria-label="Antall" className="input px-2" inputMode="decimal" value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} />
                <input aria-label="Pris" className="input px-2" inputMode="decimal" value={it.price} onChange={(e) => setItem(i, "price", e.target.value)} />
                <button
                  type="button"
                  aria-label="Fjern linje"
                  className="text-lg text-muted hover:text-red-600"
                  onClick={() => set("items", form.items.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {receipt.confidence !== null && receipt.status === "ok" && (
        <p className="text-xs text-muted">
          AI-sikkerhet: {Math.round(Number(receipt.confidence) * 100)} % · Lagret total:{" "}
          {formatAmount(receipt.total, receipt.currency)}
        </p>
      )}

      {message && (
        <p className={`text-sm ${message.kind === "ok" ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending && action === "save" ? "Lagrer…" : "Lagre"}
        </button>
        <button type="button" className="btn-danger" onClick={remove} disabled={pending}>
          {pending && action === "delete" ? "Sletter…" : "Slett kvittering"}
        </button>
      </div>
    </form>
  );
}
