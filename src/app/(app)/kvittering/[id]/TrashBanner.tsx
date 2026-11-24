"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreReceipts } from "../../actions";

export function TrashBanner({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function restore() {
    setError(null);
    startTransition(async () => {
      const result = await restoreReceipts([id]);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <span>Denne kvitteringen ligger i søppelbøtta.</span>
      <button type="button" className="btn" onClick={restore} disabled={pending}>
        {pending ? "Henter …" : "Gjenopprett"}
      </button>
      {error && <span className="w-full text-red-600">{error}</span>}
    </div>
  );
}
