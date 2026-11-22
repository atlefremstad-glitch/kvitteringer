"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const noopSubscribe = () => () => {};

function isStandalone() {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Appen lagt til på hjem-skjermen (iPhone) har egen lagring, så lenken
  // i e-posten logger bare inn Safari. Der må koden brukes.
  const standalone = useSyncExternalStore(noopSubscribe, isStandalone, () => false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) {
      setError("Koden er feil eller utløpt.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">
          {standalone ? (
            <>
              Sjekk e-posten til <strong>{email}</strong> og skriv inn koden under. Ikke trykk
              på lenken, den åpner Safari i stedet for appen.
            </>
          ) : (
            <>
              Sjekk e-posten til <strong>{email}</strong> og trykk på lenken, eller skriv inn
              koden under.
            </>
          )}
        </p>
        <form onSubmit={verifyCode} className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="code">
            Kode fra e-posten
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="input"
            value={code}
            maxLength={10}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
          />
          <button className="btn-primary w-full" disabled={busy || code.trim().length < 6}>
            {busy ? "Sjekker…" : "Logg inn med kode"}
          </button>
        </form>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="text-sm underline" onClick={() => setSent(false)}>
          Bruk en annen e-post
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={sendLink} className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="email">
        E-post
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        className="input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="deg@eksempel.no"
      />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Sender…" : "Send innloggingskode"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
