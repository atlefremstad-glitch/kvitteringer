import type { Category } from "./categories";

export type ReceiptStatus = "processing" | "ok" | "needs_review";

export type ReceiptItem = {
  name: string;
  quantity: number | null;
  price: number | null;
};

export type Receipt = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  file_path: string;
  file_type: string;
  status: ReceiptStatus;
  merchant: string | null;
  org_number: string | null;
  purchase_date: string | null;
  total: number | null;
  currency: string;
  vat: number | null;
  payment_method: string | null;
  category: Category | null;
  items: ReceiptItem[];
  confidence: number | null;
  note: string | null;
  source: "upload" | "gmail" | "email";
  source_ref: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  project_id: string | null;
  exchange_rate: number | null;
  nok_total: number | null;
  raw_ai: unknown;
  ai_error: string | null;
};

export const STATUS_LABEL: Record<ReceiptStatus, string> = {
  processing: "Behandles",
  ok: "OK",
  needs_review: "Må sjekkes",
};

export type Project = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  name: string;
};
