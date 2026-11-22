import "server-only";

export type Coordinates = { latitude: number; longitude: number };

const TIMEOUT_MS = 6000;
// Nominatim krever en User-Agent som identifiserer appen.
const USER_AGENT = "kvitteringer-app/0.1 (https://github.com/atlefremstad-glitch/kvitteringer)";

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "nb,no,en" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

const valid = (lat: unknown, lon: unknown): Coordinates | null => {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
};

type Kartverket = { adresser?: { representasjonspunkt?: { lat?: number; lon?: number } }[] } | null;

/** Kartverkets adresse-API. Gratis, uten nøkkel, bare norske adresser. */
async function kartverket(params: Record<string, string>): Promise<Coordinates | null> {
  const url = new URL("https://ws.geonorge.no/adresser/v1/sok");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("treffPerSide", "1");
  url.searchParams.set("utkoordsys", "4258");
  const data = (await getJson(url.toString())) as Kartverket;
  const p = data?.adresser?.[0]?.representasjonspunkt;
  return p ? valid(p.lat, p.lon) : null;
}

/** OpenStreetMap Nominatim. Gratis, hele verden, maks 1 oppslag i sekundet. */
async function nominatim(address: string, country: string | null): Promise<Coordinates | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  if (country) url.searchParams.set("countrycodes", country.toLowerCase());
  const data = (await getJson(url.toString())) as { lat?: string; lon?: string }[] | null;
  const hit = Array.isArray(data) ? data[0] : undefined;
  return hit ? valid(hit.lat, hit.lon) : null;
}

export type AddressParts = {
  /** Hele adressen på én linje, f.eks. "Storgata 1, 0155 Oslo" */
  address: string | null;
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  /** ISO 3166-1 alpha-2, f.eks. "NO" */
  country?: string | null;
};

/**
 * Finner koordinater for en adresse. Norske adresser slås opp hos Kartverket først,
 * ellers (eller hvis Kartverket ikke finner den) hos OpenStreetMap. Kaster aldri.
 */
export async function geocode(parts: AddressParts): Promise<Coordinates | null> {
  const query = parts.address?.trim();
  if (!query) return null;
  const cc = parts.country && /^[A-Za-z]{2}$/.test(parts.country) ? parts.country.toUpperCase() : null;
  const street = parts.street?.trim();
  const postal = parts.postal_code?.replace(/\D/g, "");
  const city = parts.city?.trim();

  try {
    if (!cc || cc === "NO") {
      // 1) Gate + postnummer/poststed (mest presist)
      if (street && (postal?.length === 4 || city)) {
        const params: Record<string, string> = { adressetekst: street };
        if (postal?.length === 4) params.postnummer = postal;
        else if (city) params.poststed = city;
        const hit = await kartverket(params).catch(() => null);
        if (hit) return hit;
      }
      // 2) Fritekstsøk på hele adressen
      const hit = await kartverket({ sok: query.replace(/,/g, " "), fuzzy: "true" }).catch(() => null);
      if (hit) return hit;
    }
    return await nominatim(query, cc);
  } catch {
    return null;
  }
}
