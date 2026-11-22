"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { receiptPreview, type Preview } from "./actions";

const SHOW_DELAY_MS = 250;
// Tid til å flytte musen fra raden og inn i bildet før det lukkes
const HIDE_DELAY_MS = 400;
// Stort nok til å lese kvitteringen: halve skjermen, minst 480 og maks 900 px
const panelWidth = (vw: number) => Math.min(900, Math.max(480, vw / 2 - 32), vw - 32);

type State = { id: string; preview: Preview | null; x: number; y: number };

/**
 * Viser et stort bilde av kvitteringen når musen holdes over en rad.
 * Flytt musen inn i bildet for å bla i det. Bare på enheter med mus.
 */
export function useHoverPreview() {
  const cache = useRef(new Map<string, Promise<Preview>>());
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wanted = useRef<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<State | null>(null);

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

  const clearTimers = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
  }, []);

  const hide = useCallback(() => {
    clearTimers();
    wanted.current = null;
    setState(null);
  }, [clearTimers]);

  const scheduleHide = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = null;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(hide, HIDE_DELAY_MS);
  }, [hide]);

  const handlers = useCallback(
    (id: string) =>
      enabled
        ? {
            onMouseEnter: (e: React.MouseEvent) => {
              const { clientX: x, clientY: y } = e;
              clearTimers();
              wanted.current = id;
              showTimer.current = setTimeout(async () => {
                // Bildet blir stående der det åpnet, så musen kan flyttes inn i det
                setState({ id, preview: null, x, y });
                const preview = await load(id);
                if (wanted.current === id) setState((s) => (s && s.id === id ? { ...s, preview } : s));
              }, SHOW_DELAY_MS);
            },
            onMouseLeave: scheduleHide,
          }
        : {},
    [enabled, load, clearTimers, scheduleHide],
  );

  // Lukk når siden (ikke bildet) rulles, eller med Esc
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [state, hide]);

  const panel =
    state && state.preview?.kind !== "none" ? (
      <PreviewPanel {...state} onEnter={clearTimers} onLeave={scheduleHide} />
    ) : null;
  return { handlers, panel, hide };
}

function PreviewPanel({
  preview,
  x,
  onEnter,
  onLeave,
}: State & { onEnter: () => void; onLeave: () => void }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = panelWidth(vw);
  const height = vh - 32; // hele skjermhøyden
  // Til venstre for pekeren hvis den er på høyre halvdel, ellers til høyre
  const left = x > vw / 2 ? Math.max(16, x - width - 16) : Math.min(vw - width - 16, x + 16);
  const top = 16;

  return (
    <div
      className="card fixed z-50 flex flex-col overflow-hidden shadow-2xl"
      style={{ left, top, width, height }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white">
        {!preview ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">Laster …</div>
        ) : preview.kind === "image" ? (
          // Full bredde, så lange kvitteringer kan rulles
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt="Kvittering" className="block h-auto w-full" />
        ) : preview.kind === "pdf" ? (
          <iframe src={`${preview.url}#toolbar=0&navpanes=0&view=FitH`} title="Kvittering (PDF)" className="h-full w-full" />
        ) : preview.kind === "text" ? (
          <pre className="whitespace-pre-wrap break-words p-4 text-xs text-black">{preview.text}</pre>
        ) : null}
      </div>
      <p className="border-t border-border bg-surface px-3 py-1.5 text-xs text-muted">
        Flytt musen inn i bildet for å bla. Esc lukker.
      </p>
    </div>
  );
}
