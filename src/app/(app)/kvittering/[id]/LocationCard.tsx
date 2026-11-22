"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReceiptMap } from "@/components/ReceiptMap";
import type { Receipt } from "@/lib/types";
import { findLocation } from "./actions";

type Props = Pick<Receipt, "id" | "merchant" | "address" | "latitude" | "longitude" | "status">;

export function LocationCard({ id, merchant, address, latitude, longitude, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const points = useMemo(
    () =>
      latitude !== null && longitude !== null
        ? [{ id, latitude: Number(latitude), longitude: Number(longitude), title: merchant ?? "Kjøpssted", subtitle: address ?? undefined }]
        : [],
    [id, merchant, address, latitude, longitude],
  );

  function find() {
    setError(null);
    startTransition(async () => {
      const res = await findLocation(id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 p-4 pb-3">
        <h2 className="text-sm font-semibold">Kjøpssted</h2>
        {address && <p className="text-sm text-muted">{address}</p>}
      </div>

      {points.length > 0 ? (
        <ReceiptMap points={points} className="h-64" />
      ) : (
        <div className="space-y-2 px-4 pb-4 text-sm text-muted">
          <p>
            {address
              ? "Fant ikke adressen på kartet. Rett den i feltet «Adresse» og trykk Lagre."
              : "Ingen adresse ennå. Skriv den i feltet «Adresse», eller la AI-en lete på kvitteringen."}
          </p>
          {status === "ok" && !address && (
            <button type="button" className="btn" onClick={find} disabled={pending}>
              {pending ? "AI leter…" : "Finn adresse med AI"}
            </button>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>
      )}
    </section>
  );
}
