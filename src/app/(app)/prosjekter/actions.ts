"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

function revalidateAll(projectId?: string) {
  revalidatePath("/");
  revalidatePath("/prosjekter");
  if (projectId) revalidatePath(`/prosjekter/${projectId}`);
}

/**
 * Legger valgte kvitteringer i et prosjekt.
 * Enten et eksisterende prosjekt (projectId) eller et nytt (name).
 */
export async function groupIntoProject(receiptIds: string[], target: { projectId?: string; name?: string }) {
  const ids = receiptIds.filter(isId);
  if (ids.length === 0) return { ok: false as const, error: "Velg minst én kvittering." };

  const { supabase } = await requireUser();

  let projectId = target.projectId && isId(target.projectId) ? target.projectId : null;
  if (!projectId) {
    const name = (target.name ?? "").trim().slice(0, 100);
    if (!name) return { ok: false as const, error: "Gi prosjektet et navn." };
    const { data, error } = await supabase.from("projects").insert({ name }).select("id").single();
    if (error || !data) return { ok: false as const, error: error?.message ?? "Kunne ikke lage prosjekt." };
    projectId = data.id as string;
  }

  const { error } = await supabase.from("receipts").update({ project_id: projectId }).in("id", ids);
  if (error) return { ok: false as const, error: error.message };

  revalidateAll(projectId);
  return { ok: true as const, projectId };
}

export async function renameProject(id: string, name: string) {
  const clean = name.trim().slice(0, 100);
  if (!isId(id)) return { ok: false as const, error: "Ugyldig prosjekt." };
  if (!clean) return { ok: false as const, error: "Navnet kan ikke være tomt." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("projects").update({ name: clean }).eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidateAll(id);
  return { ok: true as const };
}

export async function removeFromProject(projectId: string, receiptId: string) {
  if (!isId(receiptId)) return { ok: false as const, error: "Ugyldig kvittering." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("receipts").update({ project_id: null }).eq("id", receiptId);
  if (error) return { ok: false as const, error: error.message };
  revalidateAll(projectId);
  return { ok: true as const };
}

/** Sletter prosjektet. Kvitteringene blir liggende, bare uten prosjekt. */
export async function deleteProject(id: string) {
  if (!isId(id)) return { ok: false as const, error: "Ugyldig prosjekt." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  revalidateAll();
  redirect("/prosjekter");
}
