"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type MapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
  /** Lenke i boblen når man trykker på punktet */
  href?: string;
};

/** Kart med OpenStreetMap-bakgrunn. Leaflet lastes først i nettleseren. */
export function ReceiptMap({ points, className = "h-72" }: { points: MapPoint[]; className?: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = container.current;
    if (!el || points.length === 0) return;
    let map: import("leaflet").Map | null = null;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled) return;
      map = L.map(el, { scrollWheelZoom: points.length > 1 });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0f766e";
      for (const p of points) {
        // Bygg boblen med DOM-noder (ikke HTML-tekst), så butikknavn aldri tolkes som kode.
        const popup = document.createElement("div");
        const title = document.createElement(p.href ? "a" : "strong");
        title.textContent = p.title;
        if (p.href && title instanceof HTMLAnchorElement) {
          title.href = p.href;
          title.style.fontWeight = "600";
        }
        popup.appendChild(title);
        if (p.subtitle) {
          const sub = document.createElement("div");
          sub.textContent = p.subtitle;
          popup.appendChild(sub);
        }
        L.circleMarker([p.latitude, p.longitude], {
          radius: 8,
          color: "#ffffff",
          weight: 2,
          fillColor: accent,
          fillOpacity: 0.9,
        })
          .bindPopup(popup)
          .addTo(map);
      }

      if (points.length === 1) {
        map.setView([points[0].latitude, points[0].longitude], 16);
      } else {
        map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude])), { padding: [30, 30], maxZoom: 16 });
      }
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points]);

  return <div ref={container} className={`relative z-0 w-full ${className}`} />;
}
