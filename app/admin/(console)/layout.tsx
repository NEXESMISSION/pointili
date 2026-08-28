import { notFound, redirect } from "next/navigation";
import { requireSuperAdmin, type OwnerSession } from "@/lib/auth/owner";
import { consoleCounts } from "@/lib/platform";
import { adminLogoutAction } from "./actions";
import { Nav } from "./Nav";

export const dynamic = "force-dynamic";

/**
 * The console shell.
 *
 * TWO GATES, and no ceremony:
 *   1. signed in          → else /owner/login
 *   2. role = super_admin → else 404, so the console never confirms it exists
 *
 * There is no step-up screen. It used to demand the same password a second time
 * behind a "ZONE SENSIBLE" banner with a 30-minute countdown — which announced
 * the console's existence, made an operator authenticate twice to reach their
 * own tool, and locked them out mid-task. One sign-in at /owner/login is the
 * whole door now.
 *
 * The RPCs behind every action re-check is_super() in Postgres, so this layout
 * decides what is SHOWN, never what is ALLOWED.
 *
 * ── WHY THE COUNTS ARE READ HERE ──────────────────────────────────────────
 *
 * The rail is on every page and its badges are the reason a seven-page console
 * beats the one-page one it replaced (see Nav). Reading them in the layout
 * means one cheap RPC per navigation instead of each page assembling its own
 * numbers — and it means the badges cannot disagree between pages, which they
 * would the moment two pages counted "waiting" slightly differently.
 *
 * ── AND WHY THE SHELL IS NOT max-w-5xl ANY MORE ───────────────────────────
 *
 * It was, and that width was chosen for one screen that was mostly a café
 * table. The roster still wants it; a shop's page wants two columns; the
 * traffic page wants four tiles across. So the shell is full width with the
 * rail pinned, and each PAGE declares its own measure — which is the correct
 * place for that decision, since it depends on what is being read.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
    requireSuperAdmin, NOT currentOwner — and the difference is a network hop
    that this one surface is supposed to pay for.

    currentOwner() verifies the token's signature LOCALLY (see authUser), which
    is right for a till: a shop cannot afford a round trip in front of every
    screen. It also means a session signed out elsewhere keeps working until the
    access token expires, up to an hour. requireSuperAdmin() adds the live
    getUser() check for exactly that reason — lib/auth/owner says so: "This
    surface can take a business offline, so 'was this session revoked?' is asked
    of the auth server."

    The console shell was reading the local one while every panel inside it went
    through the live one, so a revoked operator got the chrome and then an error
    boundary. Nothing leaked — the reads are gated — but the shell was claiming
    a gate it was not applying.

    It throws rather than returning null, so the two outcomes are separated
    here: FORBIDDEN is a real account that is not an operator (404, so the
    console never confirms it exists), anything else is "no usable session".
  */
  let owner: OwnerSession;
  try {
    owner = await requireSuperAdmin();
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") notFound();
    redirect("/owner/login");
  }

  const counts = await consoleCounts();

  return (
    <div className="k-shell flex min-h-dvh">
      <Nav counts={counts} email={owner.email} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The brand line lives in the rail on desktop; on a phone the rail is
            a bottom bar with no room for it, so it gets a slim top bar that
            also carries the way out. */}
        {/*
          safe-t: installed, the status bar sits on top of this row.

          --safe-pt restates the 2.5 that py-2.5 was giving the top, because
          .safe-t is unlayered and REPLACES padding-top rather than adding to it
          — write pt-2.5 here instead and the row goes flush on every device
          where the inset is 0, which is every desktop. That exact mistake is
          written up over the class in globals.css. py-2.5 stays for the bottom.
        */}
        <header className="safe-t flex items-center justify-between gap-3 border-b border-[var(--o-edge)] bg-[var(--o-panel)] px-4 py-2.5 [--safe-pt:0.625rem] md:hidden">
          <span className="k-num text-[12.5px] font-bold text-charcoal">
            pointili<span className="text-slate/50">/</span>console
          </span>
          <form action={adminLogoutAction}>
            <button type="submit" className="text-[12px] font-semibold text-slate">
              Quitter
            </button>
          </form>
        </header>

        {/* pb-24 on phones so the last row of any page clears the bottom bar */}
        <main className="flex-1 px-4 pb-24 pt-5 md:px-7 md:pb-10 md:pt-6">{children}</main>

        <footer className="hidden items-center justify-between border-t border-[var(--o-edge)] px-7 py-3 md:flex">
          <span className="k-num text-[10.5px] text-slate/70">{owner.email}</span>
          <form action={adminLogoutAction}>
            <button
              type="submit"
              className="text-[11.5px] font-semibold text-slate transition hover:text-[#b3202f]"
            >
              Quitter la console
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
