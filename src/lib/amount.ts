/**
 * Finner totalbeløpet i teksten til en e-post uten AI.
 * Ser etter linjer med «Totalt», «Å betale», «Total» osv. og tar beløpet der.
 * Gir null når ingenting troverdig finnes (f.eks. når kvitteringen bare ligger som PDF-vedlegg).
 */

// Tall som 1 299,00 / 1.299,00 / 1,299.00 / 1299.5 / 499,- / 499
const NUMBER = /(?<![\d.,])(\d{1,3}(?:[  .,]\d{3})+|\d+)(?:([.,])(\d{1,2}|-{1,2}))?(?![\d])/g;
const CURRENCY = /\b(kr|nok|sek|dkk|eur|usd|gbp)\b|kr\.|[€$£]|,-/i;

const STRONG = /(totalt?|total amount|grand total|order total|å betale|til betaling|totalbeløp|totalsum|you paid|betalt|amount paid|amount due|sum å betale)/i;
const WEAK = /(\bsum\b|beløp|amount|\btotal\b)/i;
const SKIP = /(mva|moms|\bvat\b|\btax\b|rabatt|discount|frakt|shipping|delsum|subtotal|sub-total|sparte|spart|saved|bonus|poeng)/i;

// «inkl. mva» står ofte på totallinjen og skal ikke få den hoppet over
const isSkip = (line: string) =>
  SKIP.test(line.replace(/(inkl(usive|\.)?|incl(\.|uding)?)\s*(mva|moms|vat|tax)/gi, ""));

/** Gjør «1 299,50» om til 1299.5. Gir null for tall som ikke ser ut som beløp. */
export function parseAmount(intPart: string, sep?: string, dec?: string): number | null {
  let whole = intPart;
  let decimals = "";
  if (sep && dec && /^\d{1,2}$/.test(dec)) decimals = dec;
  // Tusenskille: mellomrom, punktum eller komma etterfulgt av tre siffer
  whole = whole.replace(/[  .,](?=\d{3}(\D|$))/g, "");
  if (!/^\d+$/.test(whole)) return null;
  const n = Number(decimals ? `${whole}.${decimals}` : whole);
  return Number.isFinite(n) ? n : null;
}

function amountsIn(line: string): { value: number; strong: boolean; index: number }[] {
  const out: { value: number; strong: boolean; index: number }[] = [];
  for (const m of line.matchAll(NUMBER)) {
    const value = parseAmount(m[1], m[2], m[3]);
    if (value === null || value <= 0 || value > 1_000_000) continue;
    const hasDecimals = Boolean(m[2] && m[3]);
    const around = line.slice(Math.max(0, m.index - 6), m.index + m[0].length + 6);
    const hasCurrency = CURRENCY.test(around);
    // Uten valuta eller desimaler er det ofte et ordrenummer, en dato eller et antall
    if (!hasDecimals && !hasCurrency) continue;
    // Årstall som 2026 uten valuta
    if (!hasCurrency && value >= 1900 && value <= 2100 && !m[3]) continue;
    out.push({ value, strong: hasCurrency, index: m.index });
  }
  return out;
}

export function estimateTotal(text: string): number | null {
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 2000);

  const pick = (re: RegExp) => {
    const found: number[] = [];
    lines.forEach((line, i) => {
      if (!re.test(line) || isSkip(line)) return;
      // Beløpet står ofte på samme linje, eller på linjen under (tabeller)
      const same = amountsIn(line);
      const next = same.length === 0 && lines[i + 1] && !isSkip(lines[i + 1]) ? amountsIn(lines[i + 1]) : [];
      for (const a of [...same, ...next]) found.push(a.value);
    });
    return found.length ? Math.max(...found) : null;
  };

  const strong = pick(STRONG);
  if (strong !== null) return strong;
  const weak = pick(WEAK);
  if (weak !== null) return weak;

  // Siste utvei: største beløp med valuta i hele teksten
  const withCurrency = lines.filter((l) => !isSkip(l)).flatMap((l) => amountsIn(l).filter((a) => a.strong));
  return withCurrency.length ? Math.max(...withCurrency.map((a) => a.value)) : null;
}

const NOT_PRODUCT =
  /(totalt?|sum|beløp|amount|betal|paid|mva|moms|\bvat\b|\btax\b|rabatt|discount|frakt|shipping|levering|delivery|gebyr|fee|ordre|order|faktura|invoice|kvittering|receipt|dato|date|kort|card|visa|mastercard|vipps|saldo|balance|tips)/i;

/**
 * Gjetter hovedproduktet: varelinjen med høyest pris (navn og pris på samme linje).
 * Uten AI, så den treffer best på e-poster med en vanlig varetabell.
 */
export function estimateMainItem(text: string): string | null {
  let best: { name: string; value: number } | null = null;
  for (const raw of text.split(/\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 4 || line.length > 160 || isSkip(line) || NOT_PRODUCT.test(line)) continue;
    const amounts = amountsIn(line);
    if (amounts.length === 0) continue;
    // Navnet er teksten før første beløp, uten antall (som «1» eller «2 x») og valuta
    const name = line
      .slice(0, amounts[0].index)
      .replace(/\b(kr|nok|eur|usd)\.?\s*$/i, "")
      .replace(/[$€£]\s*$/, "")
      .replace(/(\s+\d{1,3}\s*(x|×|stk\.?)?)+\s*$/i, "")
      .replace(/[\s:–—\-x×@]+$/i, "")
      .trim();
    if (name.length < 3 || !/[a-zæøå]{3}/i.test(name)) continue;
    const value = Math.max(...amounts.map((a) => a.value));
    if (!best || value > best.value) best = { name: name.slice(0, 80), value };
  }
  return best?.name ?? null;
}
