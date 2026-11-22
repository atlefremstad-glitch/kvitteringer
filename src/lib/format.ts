const numberFormat = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1234.5 -> "1 234,50 kr". Andre valutaer får valutakoden bak. */
export function formatAmount(value: number | string | null | undefined, currency = "NOK") {
  if (value === null || value === undefined || value === "") return "–";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "–";
  // Bruk vanlig mellomrom som tusenskille og minus-tegn som "-"
  const text = numberFormat.format(n).replace(/[  ]/g, " ").replace("−", "-");
  return `${text} ${currency === "NOK" ? "kr" : currency}`;
}

/** "2026-11-22" -> "22.11.2026" */
export function formatDate(value: string | null | undefined) {
  if (!value) return "–";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** "22.11.2026" eller "2026-11-22" -> "2026-11-22" (eller null) */
export function parseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** "1 234,50" / "1234.50" -> 1234.5 (eller null) */
export function parseAmount(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const v = value.replace(/[\s  ]/g, "").replace(/kr$/i, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
