import "server-only";
import { createAdminClient } from "./supabase/admin";
import { accessTokenFrom, GmailAuthError } from "./gmail";

export type EmailSettings = {
  user_id: string;
  inbound_token: string;
  gmail_email: string | null;
  gmail_refresh_token: string | null;
  forward_verification: string | null;
  forward_verification_at: string | null;
};

/** Henter brukerens e-postinnstillinger, og lager raden første gang. */
export async function getEmailSettings(userId: string): Promise<EmailSettings> {
  const admin = createAdminClient();
  const cols = "user_id, inbound_token, gmail_email, gmail_refresh_token, forward_verification, forward_verification_at";
  const { data } = await admin.from("email_settings").select(cols).eq("user_id", userId).maybeSingle();
  if (data) return data as EmailSettings;

  const { data: created, error } = await admin
    .from("email_settings")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true })
    .select(cols)
    .maybeSingle();
  if (created) return created as EmailSettings;
  // Laget samtidig av en annen forespørsel
  const { data: again } = await admin.from("email_settings").select(cols).eq("user_id", userId).single();
  if (!again) throw new Error(`Kunne ikke lage e-postinnstillinger: ${error?.message ?? "ukjent feil"}`);
  return again as EmailSettings;
}

/** Full videresendings-adresse, f.eks. abc123+9f8e7d@inbound.postmarkapp.com */
export function forwardingAddress(token: string): string | null {
  const base = process.env.POSTMARK_INBOUND_ADDRESS?.trim();
  if (!base || !base.includes("@")) return null;
  const [local, domain] = base.split("@");
  return `${local.split("+")[0]}+${token}@${domain}`;
}

/** Gir et gyldig Gmail-tilgangstoken, eller null hvis Gmail ikke er koblet til. */
export async function gmailAccessToken(userId: string): Promise<string | null> {
  const s = await getEmailSettings(userId);
  if (!s.gmail_refresh_token) return null;
  try {
    return await accessTokenFrom(s.gmail_refresh_token);
  } catch (err) {
    if (err instanceof GmailAuthError) await disconnectGmail(userId);
    throw err;
  }
}

export async function disconnectGmail(userId: string) {
  await createAdminClient()
    .from("email_settings")
    .update({ gmail_email: null, gmail_refresh_token: null, gmail_connected_at: null })
    .eq("user_id", userId);
}
