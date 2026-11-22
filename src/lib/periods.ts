export type Period = { key: string; label: string; fra: string; til: string };

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Hurtigvalg for periode, regnet ut fra dagens dato i Norge. «Alltid» har tomme datoer. */
export function periods(now = new Date()): Period[] {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return [
    { key: "denne-mnd", label: "Denne måneden", fra: iso(y, m, 1), til: iso(y, m, lastDay(y, m)) },
    { key: "forrige-mnd", label: "Forrige måned", fra: iso(py, pm, 1), til: iso(py, pm, lastDay(py, pm)) },
    { key: "i-aar", label: "I år", fra: iso(y, 1, 1), til: iso(y, 12, 31) },
    { key: "i-fjor", label: "I fjor", fra: iso(y - 1, 1, 1), til: iso(y - 1, 12, 31) },
    { key: "alltid", label: "Alltid", fra: "", til: "" },
  ];
}

/** Gmail-søk for en periode: after: er med, before: er dagen etter (Gmail tar ikke med before-dagen). */
export function gmailPeriodQuery(p: Period | undefined) {
  if (!p || !p.fra) return "";
  const [y, m, d] = p.til.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const before = `${next.getUTCFullYear()}/${next.getUTCMonth() + 1}/${next.getUTCDate()}`;
  return `after:${p.fra.replaceAll("-", "/")} before:${before}`;
}
