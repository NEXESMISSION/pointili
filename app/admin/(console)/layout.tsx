import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentOwner } from "@/lib/auth/owner";
import { adminLogoutAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The platform console shell.
 *
 * TWO gates, and no ceremony:
 *   1. signed in          → else /owner/login
 *   2. role = super_admin → else 404, so the console never confirms it exists
 *
 * There is no step-up screen. It used to demand the same password a second time
 * behind a "ZONE SENSIBLE" banner with a 30-minute countdown — which announced
 * the console's existence, made an operator authenticate twice to reach their
 * own tool, and locked them out mid-task. One sign-in at /owner/login is the
 * whole door now.
 *
 * The chrome is deliberately plain: no gradient header, no badges, no alarm
 * colours. This is an internal tool for one person and it should read like a
 * table of facts. Everything decorative in here was competing with the only
 * question that matters — which café needs a decision.
 *
 * The RPCs behind every action re-check is_super() in Postgres, so this layout
 * decides what is SHOWN, never what is ALLOWED.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const owner = await currentOwner();
  if (!owner) redirect("/owner/login");
  if (owner.role !== "super_admin") notFound();

  return (
    /* max-w-5xl, not max-w-md: the point of the café table is comparing shops
       side by side, and a 448px column around a 560px table scrolls sideways
       forever with two thirds of a laptop screen empty. */
    <div className="k-shell mx-auto flex min-h-dvh max-w-5xl flex-col">
      <header className="flex items-center justify-between border-b border-[var(--o-edge)] px-5 py-3">
        <span className="font-mono text-[13px] font-semibold tracking-tight text-slate">
          pointili<span className="text-slate/60">/</span>console
        </span>
        <div className="flex items-center gap-4">
          <span className="hidden font-mono text-[11px] text-slate sm:inline">
            {owner.email}
          </span>
          <Link href="/" className="text-[12px] font-medium text-slate hover:text-charcoal">
            Site
          </Link>
          <form action={adminLogoutAction}>
            <button
              type="submit"
              className="text-[12px] font-medium text-slate hover:text-[#b3202f]"
            >
              Quitter
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-5 py-6">{children}</main>
    </div>
  );
}
