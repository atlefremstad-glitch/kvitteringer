"use client";

import { useState, useTransition } from "react";
import { deleteProject, renameProject } from "../actions";

export function ProjectHeader({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await renameProject(id, value);
      if (!result.ok) setError(result.error);
      else setEditing(false);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProject(id);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      {editing ? (
        <form onSubmit={save} className="flex flex-wrap gap-2">
          <input
            className="input min-w-0 flex-1"
            value={value}
            maxLength={100}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-primary" disabled={pending || !value.trim()}>Lagre</button>
          <button type="button" className="btn" onClick={() => { setEditing(false); setValue(name); }}>Avbryt</button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="min-w-0 break-words text-2xl font-semibold">{name}</h1>
          <div className="flex gap-2">
            <button type="button" className="btn px-3" onClick={() => setEditing(true)}>Endre navn</button>
            {confirmDelete ? (
              <>
                <button type="button" className="btn-danger" onClick={remove} disabled={pending}>
                  {pending ? "Sletter …" : "Ja, slett"}
                </button>
                <button type="button" className="btn px-3" onClick={() => setConfirmDelete(false)}>Nei</button>
              </>
            ) : (
              <button type="button" className="btn px-3" onClick={() => setConfirmDelete(true)}>Slett prosjekt</button>
            )}
          </div>
        </div>
      )}
      {confirmDelete && !editing && (
        <p className="text-sm text-muted">Kvitteringene blir liggende i listen. Bare prosjektet slettes.</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
