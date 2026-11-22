import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { CATEGORIES, isCategory, type Category } from "./categories";
import type { ReceiptItem } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

/** JSON-skjemaet Claude må svare etter (structured outputs). */
const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "merchant",
    "org_number",
    "purchase_date",
    "total",
    "currency",
    "vat",
    "payment_method",
    "items",
    "category",
    "confidence",
  ],
  properties: {
    merchant: nullable({ type: "string", description: "Butikkens eller firmaets navn" }),
    org_number: nullable({
      type: "string",
      description: "Organisasjonsnummer, 9 siffer uten mellomrom og uten 'MVA'",
    }),
    purchase_date: nullable({ type: "string", format: "date", description: "Kjøpsdato, YYYY-MM-DD" }),
    total: nullable({ type: "number", description: "Totalbeløp som ble betalt" }),
    currency: { type: "string", description: "ISO 4217-kode, f.eks. NOK, SEK, EUR. NOK hvis ukjent." },
    vat: nullable({ type: "number", description: "Sum MVA på kvitteringen" }),
    payment_method: nullable({
      type: "string",
      description: "Betalingsmåte, f.eks. Bankkort, Visa, Mastercard, Vipps, Kontant, Faktura",
    }),
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "price"],
        properties: {
          name: { type: "string" },
          quantity: nullable({ type: "number" }),
          price: nullable({ type: "number", description: "Linjens totalpris" }),
        },
      },
    },
    category: { type: "string", enum: [...CATEGORIES] },
    confidence: {
      type: "number",
      description: "Hvor sikker du er på uttrekket totalt, fra 0 til 1",
    },
  },
} as const;

export type Extracted = {
  merchant: string | null;
  org_number: string | null;
  purchase_date: string | null;
  total: number | null;
  currency: string;
  vat: number | null;
  payment_method: string | null;
  items: ReceiptItem[];
  category: Category;
  confidence: number | null;
};

export type ExtractResult =
  | { ok: true; data: Extracted; raw: unknown }
  | { ok: false; error: string; raw: unknown };

function systemPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "Du leser kvitteringer (ofte norske) og trekker ut strukturerte data.",
    `Dagens dato er ${today}. Bruk den bare for å tolke datoer uten årstall.`,
    "Regler:",
    "- Felt du ikke finner på kvitteringen settes til null. Ikke gjett.",
    "- Beløp er tall med punktum som desimaltegn (1234.50), uten valutasymbol.",
    "- Varelinjer: navn, antall og linjens totalpris. Tom liste hvis ingen linjer kan leses.",
    `- Velg én kategori fra listen: ${CATEGORIES.join(", ")}.`,
    "- confidence: 1 = alt er tydelig lesbart, 0 = nesten ingenting kunne leses.",
    "- Hvis filen ikke er en kvittering, sett confidence lavt og felt til null.",
    "- Kvitteringen kan komme fra en e-post (ordrebekreftelse, kvittering eller faktura).",
    "  Mangler kjøpsdato, bruk datoen e-posten ble sendt. Butikken er avsenderen, ikke den som videresendte.",
    "  Er e-posten reklame, nyhetsbrev eller ikke et kjøp, sett confidence under 0.3.",
  ].join("\n");
}

type FileContent =
  | { kind: "image"; base64: string }
  | { kind: "pdf"; base64: string }
  | { kind: "text"; text: string };

/** Gjør filen klar for Claude: bilder skaleres ned til JPEG, PDF og tekst sendes som de er. */
export async function prepareForClaude(buffer: Buffer, mimeType: string): Promise<FileContent> {
  if (mimeType === "application/pdf") {
    return { kind: "pdf", base64: buffer.toString("base64") };
  }
  if (mimeType === "text/plain") {
    return { kind: "text", text: buffer.toString("utf8").slice(0, 100_000) };
  }
  const jpeg = await sharp(buffer)
    .rotate() // følg EXIF-orientering fra mobilkamera
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { kind: "image", base64: jpeg.toString("base64") };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function clean(raw: Record<string, unknown>): Extracted {
  const date = str(raw.purchase_date);
  const org = str(raw.org_number)?.replace(/\D/g, "") || null;
  const items = Array.isArray(raw.items) ? raw.items : [];
  const confidence = typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : null;
  return {
    merchant: str(raw.merchant),
    org_number: org,
    purchase_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    total: num(raw.total),
    currency: (str(raw.currency) ?? "NOK").toUpperCase().slice(0, 3),
    vat: num(raw.vat),
    payment_method: str(raw.payment_method),
    items: items
      .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
      .map((i) => ({ name: str(i.name) ?? "", quantity: num(i.quantity), price: num(i.price) }))
      .filter((i) => i.name !== ""),
    category: isCategory(raw.category) ? raw.category : "Annet",
    confidence,
  };
}

/** Sender kvitteringen til Claude og returnerer tolkede felt. Kaster aldri. */
export async function extractReceipt(file: FileContent, context?: string): Promise<ExtractResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY mangler på serveren.", raw: null };
  }

  const client = new Anthropic();
  const fileBlock: Anthropic.Beta.Messages.BetaContentBlockParam =
    file.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.base64 } }
      : file.kind === "text"
        ? { type: "text", text: `<epost>\n${file.text}\n</epost>` }
        : { type: "image", source: { type: "base64", media_type: "image/jpeg", data: file.base64 } };
  const instruction = context ? `${context}\n\nLes denne kvitteringen.` : "Les denne kvitteringen.";

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Hvis modellen avslår, prøver API-et automatisk en annen modell.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: RECEIPT_SCHEMA as unknown as Record<string, unknown> },
      },
      system: systemPrompt(),
      messages: [
        {
          role: "user",
          content: [fileBlock, { type: "text", text: instruction }],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "AI-en avslo å lese filen.", raw: response };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, error: "AI-svaret ble avkortet.", raw: response };
    }

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      return { ok: false, error: "AI-en svarte uten data.", raw: response };
    }

    const parsed = JSON.parse(text.text) as Record<string, unknown>;
    return { ok: true, data: clean(parsed), raw: parsed };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "For mange forespørsler til AI. Prøv igjen om litt.", raw: null };
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "Ugyldig ANTHROPIC_API_KEY.", raw: null };
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: `AI-feil (${err.status ?? "ukjent"}): ${err.message}`, raw: null };
    }
    if (err instanceof SyntaxError) {
      return { ok: false, error: "AI-svaret var ikke gyldig JSON.", raw: null };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Ukjent feil", raw: null };
  }
}
