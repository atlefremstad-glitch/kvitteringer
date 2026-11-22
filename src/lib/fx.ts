import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const TIMEOUT_MS = 6000;

// Norges Bank oppgir disse per 100 enheter. Brukes bare hvis svaret mangler UNIT_MULT.
const PER_100 = new Set(["SEK", "DKK", "JPY", "ISK", "HUF", "CZK", "INR", "IDR", "KRW", "PHP", "THB", "TWD", "PKR", "XDR"]);

type SdmxJson = {
  data?: {
    dataSets?: { series?: Record<string, { attributes?: (number | null)[]; observations?: Record<string, (string | number)[]> }> }[];
    structure?: {
      dimensions?: { observation?: { id: string; values: { id: string }[] }[] };
      attributes?: { series?: { id: string; values: { id: string }[] }[] };
    };
  };
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * NOK for 1 enhet av valutaen på datoen (eller siste virkedag før).
 * Kilde: Norges Banks åpne API, gratis og uten nøkkel. null hvis kursen ikke finnes.
 */
export async function nokRate(currency: string, date: string | null): Promise<number | null> {
  const cur = currency.toUpperCase();
  if (cur === "NOK") return 1;
  if (!/^[A-Z]{3}$/.test(cur)) return null;

  const end = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date();
  const today = new Date();
  if (end > today) end.setTime(today.getTime());
  const start = new Date(end.getTime() - 14 * 24 * 3600 * 1000); // dekker helger og helligdager

  const url = new URL(`https://data.norges-bank.no/api/data/EXR/B.${cur}.NOK.SP`);
  url.searchParams.set("format", "sdmx-json");
  url.searchParams.set("startPeriod", isoDate(start));
  url.searchParams.set("endPeriod", isoDate(end));
  url.searchParams.set("locale", "en");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as SdmxJson;
    const series = Object.values(json.data?.dataSets?.[0]?.series ?? {})[0];
    const times = json.data?.structure?.dimensions?.observation?.find((d) => d.id === "TIME_PERIOD")?.values ?? [];
    if (!series?.observations) return null;

    // Siste observasjon på eller før datoen
    let best: { date: string; value: number } | null = null;
    for (const [idx, obs] of Object.entries(series.observations)) {
      const d = times[Number(idx)]?.id;
      const v = Number(obs?.[0]);
      if (!d || !Number.isFinite(v) || d > isoDate(end)) continue;
      if (!best || d > best.date) best = { date: d, value: v };
    }
    if (!best) return null;

    // Enhet: 10^UNIT_MULT enheter av valutaen
    const attrDefs = json.data?.structure?.attributes?.series ?? [];
    const multIdx = attrDefs.findIndex((a) => a.id === "UNIT_MULT");
    let mult: number | null = null;
    if (multIdx >= 0) {
      const valueIdx = series.attributes?.[multIdx];
      const raw = valueIdx === null || valueIdx === undefined ? undefined : attrDefs[multIdx].values[valueIdx]?.id;
      if (raw !== undefined && Number.isFinite(Number(raw))) mult = Number(raw);
    }
    if (mult === null) mult = PER_100.has(cur) ? 2 : 0;

    return best.value / 10 ** mult;
  } catch {
    return null;
  }
}

/** Kurs og NOK-beløp for en kvittering. */
export async function nokFields(total: number | null, currency: string, date: string | null) {
  if (total === null) return { exchange_rate: null, nok_total: null };
  const rate = await nokRate(currency, date);
  if (rate === null) return { exchange_rate: null, nok_total: null };
  return { exchange_rate: Math.round(rate * 1e6) / 1e6, nok_total: Math.round(total * rate * 100) / 100 };
}

type NokRow = { id: string; total: number | string | null; currency: string; purchase_date: string | null; nok_total: number | string | null };

/** Fyller inn NOK-beløp for eldre kvitteringer som mangler det, og lagrer resultatet. */
export async function fillMissingNok<T extends NokRow>(supabase: SupabaseClient, rows: T[]): Promise<T[]> {
  const missing = rows.filter((r) => r.nok_total === null && r.total !== null);
  if (missing.length === 0) return rows;
  const filled = new Map<string, number>();
  await Promise.all(
    missing.slice(0, 50).map(async (r) => {
      const fields = await nokFields(Number(r.total), r.currency, r.purchase_date);
      if (fields.nok_total === null) return;
      filled.set(r.id, fields.nok_total);
      await supabase.from("receipts").update(fields).eq("id", r.id);
    }),
  );
  return rows.map((r) => (filled.has(r.id) ? { ...r, nok_total: filled.get(r.id)! } : r));
}

/** Summerer NOK-beløpene. missing = kvitteringer med beløp som ikke kunne regnes om. */
export function nokSum(rows: { total: number | string | null; nok_total: number | string | null }[]) {
  let sum = 0;
  let missing = 0;
  for (const r of rows) {
    if (r.total === null) continue;
    if (r.nok_total === null) missing++;
    else sum += Number(r.nok_total);
  }
  return { sum: Math.round(sum * 100) / 100, missing };
}
