"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Scanner } from "./Scanner";

const MAX_BYTES = 20 * 1024 * 1024;

const BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

function detectType(file: File): string | null {
  if (EXT_BY_TYPE[file.type]) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXT[ext] ?? null;
}

type Step = "idle" | "uploading" | "reading";

export function Uploader({ userId }: { userId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);

    const type = detectType(file);
    if (!type) {
      setError("Filtypen støttes ikke. Bruk JPG, PNG, HEIC eller PDF.");
      return;
    }
    // Bilder går via skanneren (auto-crop + PDF). PDF-er lastes opp direkte.
    if (type !== "application/pdf") {
      setScanFile(file);
      return;
    }
    upload(file, type);
  }

  async function upload(file: Blob, type: string) {
    setScanFile(null);
    if (file.size > MAX_BYTES) {
      setError("Filen er for stor (maks 20 MB).");
      return;
    }

    const supabase = createClient();
    const id = crypto.randomUUID();
    const path = `${userId}/${id}.${EXT_BY_TYPE[type]}`;

    setStep("uploading");
    const { error: upError } = await supabase.storage
      .from("receipts")
      .upload(path, file, { contentType: type, upsert: false });
    if (upError) {
      setStep("idle");
      setError(`Opplasting feilet: ${upError.message}`);
      return;
    }

    const { error: dbError } = await supabase
      .from("receipts")
      .insert({ id, file_path: path, file_type: type, status: "processing" });
    if (dbError) {
      await supabase.storage.from("receipts").remove([path]);
      setStep("idle");
      setError(`Kunne ikke lagre kvitteringen: ${dbError.message}`);
      return;
    }

    setStep("reading");
    // Kvitteringen er lagret uansett. Feiler AI-en, får den status "Må sjekkes".
    await fetch("/api/receipts/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);

    router.push(`/kvittering/${id}`);
    router.refresh();
  }

  const busy = step !== "idle";

  if (scanFile) {
    return (
      <Scanner
        file={scanFile}
        onDone={(pdf) => upload(pdf, "application/pdf")}
        onSkip={() => upload(scanFile, detectType(scanFile)!)}
        onCancel={() => setScanFile(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <label className={`btn-primary w-full cursor-pointer py-6 text-base ${busy ? "pointer-events-none opacity-50" : ""}`}>
        📷 Ta bilde
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>

      <label
        className={`card flex w-full cursor-pointer flex-col items-center gap-1 border-dashed p-6 text-center ${busy ? "pointer-events-none opacity-50" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFile(e.dataTransfer.files?.[0]);
        }}
      >
        <span className="font-medium">Last opp fil</span>
        <span className="text-sm text-muted">JPG, PNG, HEIC eller PDF, maks 20 MB</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif,application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>

      {step === "uploading" && <p className="text-sm text-muted">Laster opp…</p>}
      {step === "reading" && (
        <p className="text-sm text-muted">AI leser kvitteringen. Dette tar vanligvis 5–20 sekunder…</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
