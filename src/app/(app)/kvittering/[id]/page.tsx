import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/process";
import type { Receipt } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { EditForm } from "./EditForm";
import { LocationCard } from "./LocationCard";

export const metadata: Metadata = { title: "Kvittering – Kvitteringer" };
export const maxDuration = 60;

export default async function ReceiptPage({ params }: PageProps<"/kvittering/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { supabase } = await requireUser();
  const { data } = await supabase.from("receipts").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const receipt = data as Receipt;

  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(receipt.file_path, 60 * 60);
  const fileUrl = signed?.signedUrl ?? null;
  const isPdf = receipt.file_type === "application/pdf";
  const isHeic = receipt.file_type === "image/heic" || receipt.file_type === "image/heif";
  const isText = receipt.file_type === "text/plain";

  // E-post uten vedlegg er lagret som tekst. Vis teksten direkte.
  let emailText: string | null = null;
  if (isText) {
    const { data: blob } = await supabase.storage.from(BUCKET).download(receipt.file_path);
    emailText = blob ? await blob.text() : null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/" className="text-sm underline">← Alle kvitteringer</Link>
        <div className="flex items-center gap-2">
          {receipt.source && receipt.source !== "upload" && (
            <span className="text-xs text-muted">{receipt.source === "gmail" ? "Fra Gmail" : "Videresendt e-post"}</span>
          )}
          <StatusBadge status={receipt.status} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card overflow-hidden md:sticky md:top-20 md:self-start">
          {!fileUrl ? (
            <p className="p-6 text-sm text-muted">Fant ikke filen.</p>
          ) : isText ? (
            <pre className="max-h-[80vh] overflow-auto whitespace-pre-wrap break-words p-4 text-xs">
              {emailText ?? "Kunne ikke lese e-posten."}
            </pre>
          ) : isPdf ? (
            <iframe src={fileUrl} title="Kvittering (PDF)" className="h-[70vh] w-full bg-white" />
          ) : isHeic ? (
            <p className="p-6 text-sm text-muted">HEIC-bildet konverteres når AI-en har lest det. Trykk «Prøv AI igjen».</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl} alt="Kvittering" className="max-h-[80vh] w-full bg-white object-contain" />
          )}
          {fileUrl && (
            <div className="border-t border-border p-2 text-right">
              <a href={fileUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                Åpne fil
              </a>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <EditForm receipt={receipt} />
          <LocationCard
            id={receipt.id}
            merchant={receipt.merchant}
            address={receipt.address}
            latitude={receipt.latitude}
            longitude={receipt.longitude}
            status={receipt.status}
          />
        </section>
      </div>
    </div>
  );
}
