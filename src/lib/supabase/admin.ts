import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase-klient med secret-nøkkelen. Går forbi Row Level Security,
 * så den må bare brukes på serveren og alltid filtrere på riktig bruker.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY mangler på serveren.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
