import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="ReceiptMe – alle kvitteringer" className="shrink-0">
            <Logo />
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Link href="/epost" className="btn px-3">
              E-post
            </Link>
            <Link href="/kart" className="btn px-3">
              Kart
            </Link>
            <Link href="/ny" className="btn-primary">
              + Ny
            </Link>
            <form action="/auth/signout" method="post">
              <button className="btn px-3" type="submit">
                Logg ut
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        {children}
      </main>
    </>
  );
}
