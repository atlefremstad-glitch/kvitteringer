"use client";

import { useEffect, useRef, useState } from "react";
import { detectQuad, fullQuad, type Point, type Quad } from "@/lib/scan/detect";
import { enhanceDocument, outputSize, warpQuad, type Pixels } from "@/lib/scan/warp";
import { jpegToPdf } from "@/lib/scan/pdf";

/** Arbeidsbildet holdes under iOS sin canvas-grense (ca. 16 MP). */
const WORK_MAX = 3000;
const DETECT_MAX = 500;
const OUTPUT_MAX = 2400;

type Mode = "document" | "color";
type Loaded = { pixels: Pixels; previewUrl: string; detected: Quad | null };

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

function drawScaled(img: CanvasImageSource, w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * s);
  canvas.height = Math.round(h * s);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function load(file: File): Promise<Loaded> {
  // <img> følger EXIF-orienteringen fra mobilkameraet, og Safari kan lese HEIC.
  const img = await loadImage(file);
  const { canvas, ctx } = drawScaled(img, img.naturalWidth, img.naturalHeight, WORK_MAX);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const small = drawScaled(canvas, canvas.width, canvas.height, DETECT_MAX);
  const sd = small.ctx.getImageData(0, 0, small.canvas.width, small.canvas.height);
  const q = detectQuad(sd.data, sd.width, sd.height);
  const k = canvas.width / sd.width;
  const detected = q ? (q.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad) : null;

  const preview = drawScaled(canvas, canvas.width, canvas.height, 1200);
  const previewUrl = preview.canvas.toDataURL("image/jpeg", 0.8);
  return { pixels: { data: pixels.data, width: pixels.width, height: pixels.height }, previewUrl, detected };
}

function toCanvas(p: Pixels) {
  const canvas = document.createElement("canvas");
  canvas.width = p.width;
  canvas.height = p.height;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  return canvas;
}

/** Lar nettleseren tegne «Lager skann…» før det tunge regnearbeidet starter. */
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export function Scanner({
  file,
  onDone,
  onSkip,
  onCancel,
}: {
  file: File;
  onDone: (pdf: Blob) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [step, setStep] = useState<"adjust" | "result">("adjust");
  const [mode, setMode] = useState<Mode>("document");
  const [busy, setBusy] = useState(true);
  const [result, setResult] = useState<Record<Mode, { pixels: Pixels; url: string }> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await nextFrame();
      try {
        const l = await load(file);
        if (cancelled) return;
        setLoaded(l);
        setQuad(l.detected ?? fullQuad(l.pixels.width, l.pixels.height, 0.03));
        setBusy(false);
      } catch {
        // Nettleseren klarer ikke å åpne bildet (f.eks. HEIC i Chrome): last opp som før.
        if (!cancelled) onSkip();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  function pointerToImage(e: React.PointerEvent): Point | null {
    const box = boxRef.current;
    if (!box || !loaded) return null;
    const r = box.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * loaded.pixels.width;
    const y = ((e.clientY - r.top) / r.height) * loaded.pixels.height;
    return {
      x: Math.min(loaded.pixels.width, Math.max(0, x)),
      y: Math.min(loaded.pixels.height, Math.max(0, y)),
    };
  }

  async function makeScan() {
    if (!loaded || !quad) return;
    setBusy(true);
    await nextFrame();
    const { width, height } = outputSize(quad, OUTPUT_MAX);
    const color = warpQuad(loaded.pixels, quad, width, height);
    const doc = enhanceDocument(color);
    const url = (p: Pixels) => toCanvas(p).toDataURL("image/jpeg", 0.85);
    setResult({ color: { pixels: color, url: url(color) }, document: { pixels: doc, url: url(doc) } });
    setStep("result");
    setBusy(false);
  }

  async function save() {
    if (!result) return;
    setBusy(true);
    await nextFrame();
    const img = result[mode].pixels;
    const jpeg = await new Promise<Blob | null>((r) => toCanvas(img).toBlob(r, "image/jpeg", 0.85));
    if (!jpeg) {
      setBusy(false);
      onSkip();
      return;
    }
    const pdf = jpegToPdf(new Uint8Array(await jpeg.arrayBuffer()), img.width, img.height);
    onDone(new Blob([pdf as BlobPart], { type: "application/pdf" }));
  }

  if (!loaded || !quad) {
    return (
      <div className="card p-6 text-center text-sm text-muted">
        Finner kvitteringen i bildet…
      </div>
    );
  }

  const W = loaded.pixels.width;
  const H = loaded.pixels.height;

  if (step === "result" && result) {
    return (
      <div className="space-y-3">
        <div className="flex justify-center gap-2">
          {(["document", "color"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`btn px-4 py-1.5 text-sm ${mode === m ? "btn-primary" : ""}`}
            >
              {m === "document" ? "Dokument" : "Farge"}
            </button>
          ))}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result[mode].url}
          alt="Skannet kvittering"
          className="mx-auto block max-h-[65vh] max-w-full border border-border bg-white shadow-sm"
        />
        <div className="flex gap-2">
          <button type="button" className="btn flex-1" disabled={busy} onClick={() => setStep("adjust")}>
            ← Juster hjørner
          </button>
          <button type="button" className="btn-primary flex-1" disabled={busy} onClick={save}>
            {busy ? "Lagrer…" : "Lagre som PDF"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-sm text-muted">Dra i hjørnene hvis rammen ikke treffer kvitteringen.</p>
      <div ref={boxRef} className="relative mx-auto w-fit select-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={loaded.previewUrl} alt="Bilde av kvittering" className="block max-h-[65vh] max-w-full" draggable={false} />
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <path
            fillRule="evenodd"
            fill="rgba(0,0,0,0.45)"
            d={`M0 0H${W}V${H}H0Z M${quad.map((p) => `${p.x} ${p.y}`).join(" L")}Z`}
          />
          <polygon
            points={quad.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {quad.map((p, i) => (
          <div
            key={i}
            role="slider"
            aria-label={`Hjørne ${i + 1}`}
            aria-valuenow={Math.round(p.x)}
            tabIndex={0}
            className="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-[3px] bg-transparent active:cursor-grabbing"
            style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, borderColor: "var(--accent)" }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              dragging.current = i;
            }}
            onPointerMove={(e) => {
              if (dragging.current !== i) return;
              const pt = pointerToImage(e);
              if (!pt) return;
              setQuad((q) => (q ? (q.map((old, k) => (k === i ? pt : old)) as Quad) : q));
            }}
            onPointerUp={() => (dragging.current = null)}
            onPointerCancel={() => (dragging.current = null)}
          />
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2 text-sm">
        <button type="button" className="btn px-3 py-1.5" onClick={() => setQuad(fullQuad(W, H))}>
          Hele bildet
        </button>
        {loaded.detected && (
          <button type="button" className="btn px-3 py-1.5" onClick={() => setQuad(loaded.detected)}>
            Automatisk
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn flex-1" disabled={busy} onClick={onCancel}>
          Avbryt
        </button>
        <button type="button" className="btn-primary flex-1" disabled={busy} onClick={makeScan}>
          {busy ? "Lager skann…" : "Skann →"}
        </button>
      </div>
      <button type="button" className="block w-full text-center text-sm text-muted underline" onClick={onSkip}>
        Last opp originalbildet uten skanning
      </button>
    </div>
  );
}
