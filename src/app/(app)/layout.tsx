import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-semibold">
            Kvitteringer
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/ny" className="btn-primary">
              + Ny
            </Link>
            <form action="/auth/signout" method="post">
              <button className="btn" type="submit">
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
