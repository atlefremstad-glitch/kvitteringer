import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Logg inn – ReceiptMe" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { feil } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1>
          <Logo size="lg" />
        </h1>
        <p className="mt-1 text-sm font-medium text-muted">Hold orden på utgiftene dine</p>
      </div>
      <p className="mb-6 text-sm text-muted">Logg inn med e-post. Du får en lenke, ingen passord.</p>
      {feil === "lenke" && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          Innloggingslenken var ugyldig eller utløpt. Be om en ny.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
