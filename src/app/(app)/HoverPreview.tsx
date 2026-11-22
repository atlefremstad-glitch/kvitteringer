"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { receiptPreview, type Preview } from "./actions";

const DELAY_MS = 250;
const WIDTH = 420;

/**
 * Viser et stort bilde av kvitteringen når musen holdes over en rad.
 * Bare på enheter med mus (ikke mobil/nettbrett). Lenkene hentes når de trengs og huskes.
 */
export function useHoverPreview() {
  const cache = useRef(new Map<string, Promise<Preview>>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeId = useRef<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<{ id: string; preview: Preview | null; x: number; y: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 768px)");
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const load = useCallback((id: string) => {
    let p = cache.current.get(id);
    if (!p) {
      p = receiptPreview(id).catch(() => ({ kind: "none" }) as Preview);
      cache.current.set(id, p);
    }
    return p;
  }, []);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    activeId.current = null;
    setState(null);
  }, []);

  const handlers = useCallback(
    (id: string) =>
      enabled
        ? {
            onMouseEnter: (e: React.MouseEvent) => {
              const { clientX: x, clientY: y } = e;
              activeId.current = id;
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(async () => {
                setState({ id, preview: null, x, y });
                const preview = await load(id);
                if (activeId.current === id) setState((s) => (s && s.id === id ? { ...s, preview } : s));
              }, DELAY_MS);
            },
            onMouseMove: (e: React.MouseEvent) => {
              const { clientX: x, clientY: y } = e;
              setState((s) => (s && s.id === id ? { ...s, x, y } : s));
            },
            onMouseLeave: hide,
          }
        : {},
    [enabled, load, hide],
  );

  // Skjul ved scrolling og klikk, så den ikke henger igjen
  useEffect(() => {
    if (!state) return;
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, [state, hide]);

  const panel = state && state.preview?.kind !== "none" ? <PreviewPanel {...state} /> : null;
  return { handlers, panel, hide };
}

function PreviewPanel({ preview, x, y }: { preview: Preview | null; x: number; y: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const height = Math.min(vh - 32, 640);
  // Til venstre for pekeren hvis den er på høyre halvdel, ellers til høyre
  const left = x > vw / 2 ? Math.max(16, x - WIDTH - 24) : Math.min(vw - WIDTH - 16, x + 24);
  const top = Math.min(Math.max(16, y - height / 2), vh - height - 16);

  return (
    <div
      className="card pointer-events-none fixed z-50 overflow-hidden shadow-2xl"
      style={{ left, top, width: WIDTH, height }}
      aria-hidden
    >
      {!preview ? (
        <div className="flex h-full items-center justify-center text-sm text-muted">Laster …</div>
      ) : preview.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.url} alt="" className="h-full w-full bg-white object-contain" />
      ) : preview.kind === "pdf" ? (
        <iframe src={`${preview.url}#toolbar=0&navpanes=0&view=FitH`} title="Kvittering (PDF)" className="h-full w-full bg-white" />
      ) : preview.kind === "text" ? (
        <pre className="h-full overflow-hidden whitespace-pre-wrap break-words p-4 text-xs">{preview.text}</pre>
      ) : null}
    </div>
  );
}
