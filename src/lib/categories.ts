export const CATEGORIES = [
  "Dagligvarer",
  "Restaurant og kafé",
  "Transport",
  "Bolig",
  "Elektronikk",
  "Klær",
  "Helse",
  "Fritid",
  "Reise",
  "Abonnement",
  "Annet",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}
