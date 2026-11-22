/** Summerer beløp per valuta, NOK først. */
export function sumByCurrency(rows: { total: number | string | null; currency: string }[]) {
  const sums = new Map<string, number>();
  for (const r of rows) {
    if (r.total === null) continue;
    sums.set(r.currency, (sums.get(r.currency) ?? 0) + Number(r.total));
  }
  return [...sums.entries()].sort(([a], [b]) => (a === "NOK" ? -1 : b === "NOK" ? 1 : a.localeCompare(b)));
}
