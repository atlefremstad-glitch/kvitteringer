"use client";

import { useTransition } from "react";
import { removeFromProject } from "../actions";

export function RemoveButton({ projectId, receiptId }: { projectId: string; receiptId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="self-stretch px-4 text-sm text-muted hover:text-red-600 disabled:opacity-50"
      title="Fjern fra prosjektet (kvitteringen slettes ikke)"
      aria-label="Fjern fra prosjektet"
      disabled={pending}
      onClick={() => startTransition(async () => void (await removeFromProject(projectId, receiptId)))}
    >
      {pending ? "…" : "Fjern"}
    </button>
  );
}
