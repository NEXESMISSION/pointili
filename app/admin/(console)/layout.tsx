import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { elevationRemaining, isElevated } from "@/lib/auth/elevate";
import { currentOwner } from "@/lib/auth/owner";
import { adminLogoutAction, dropElevationAction } from "../login/actions";

export const dynamic = "force-dynamic";

/**
 * The platform console — modern brand (Royal Mauve), matching the landing.
 *
 * Three gates, in order:
 *   1. signed in           → else /owner/login
 *   2. role = super_admin  → else 404 (never confirm the console exists)
 *   3. elevated in the last 30 min → else /admin/login
 *
 * The RPCs behind every action re-check the role in Postgres, so removing this
 * layout would only make the UI reachable, not hand anyone the keys.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const owner = await currentOwner();
  if (!owner) redirect("/login");
  if (owner.role !== "super_admin") notFound();
  if (!(await isElevated(owner.id))) redirect("/console/login");

  const minsLeft = Math.ceil((await elevationRemaining()) / 60);

  return (
    /* max-w-5xl, not max-w-md: the whole point of the café table is comparing
       shops side by side, and a 448px column around a 560px table means it
       scrolls sideways forever with two thirds of a laptop screen empty. */
    <div className="modern mx-auto flex min-h-dvh max-w-5xl flex-col bg-[#0b0d12]">
      <header className="bg-gradient-to-br from-[#5b3fd1] to-[#3a2494] px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-extrabold text-white">
            pointili<span className="text-white/60">.console</span>
          </span>
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
            {minsLeft} min
          </span>
        </div>
      </header>

      {minsLeft <= 5 && (
        <p className="bg-[#fff3d6] px-5 py-2 text-[11.5px] font-semibold text-[#ffc861]">
          Verrouillage dans {minsLeft} min — vous devrez retaper votre mot de passe.
        </p>
      )}

      <main className="flex-1 px-5 py-5">{children}</main>

      <nav className="sticky bottom-0 z-20 flex items-center justify-between gap-2 border-t border-[#232838] bg-[#0e1118] px-3 py-2.5">
        <Link
          href="/"
          className="rounded-xl px-3 py-3 text-[12px] font-bold text-[#8b93a7]"
        >
          ← Mon café
        </Link>
        <div className="flex items-center gap-1">
          <form action={dropElevationAction}>
            <button
              type="submit"
              className="rounded-xl px-3 py-3 text-[12px] font-bold text-[#8b93a7]"
            >
              Verrouiller
            </button>
          </form>
          <form action={adminLogoutAction}>
            <button
              type="submit"
              className="rounded-xl px-3 py-3 text-[12px] font-bold text-[#e5484d]"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </nav>
    </div>
  );
}
