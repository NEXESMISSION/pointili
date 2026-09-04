"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { signOutAction } from "@/app/owner/(app)/equipe/actions";
import { UsersIcon } from "./icons";
import { TABS, isActive, visible } from "./OwnerNav";

/*
  THE PHONE BEHIND THE COUNTER HAS TWO JOBS, NOT FIVE.

  This replaces the five-tab bar on mobile, and the argument is about what the
  bottom strip of a phone is worth. It is the only part of the screen a thumb
  reaches without regripping, and it was spending all of it on four destinations
  a shop opens once a week — Clients, Récompenses, Mon QR, Réglages — while the
  two things done on every single sale were up in the body of the page.

  Worse than the waste: during service, "Réglages" sat one thumb-slip from
  "Caisse". A tab bar is a promise that all five are peers. They are not. Two of
  them are the job and four are the admin.

  So the strip goes back to the till, and everything else lives behind one
  button. This is not a hamburger hiding the app — the app is two buttons, and
  they are now the whole screen. This is where the OTHER things went.

  ── IT IS ALSO WHO IS HOLDING THE PHONE ───────────────────────────────────

  The till used to carry a red "Quitter — Sami" panel, on the sound reasoning
  that a handed-over phone must not keep recording the last person's name. That
  reasoning is unchanged; the panel was the wrong shape for it. A panel scrolls
  away, and the question it answers ("whose name is on this?") is asked at
  moments when nobody is looking at the top of the till.

  The button carries the name instead. It is on screen on every screen, it never
  scrolls, and the tap that ends the shift is the first thing under it — still
  red, still one tap from wherever they are, and now reachable from Réglages and
  the client list too, which the panel never was.
*/
export function OwnerMenu({
  areas,
  slug,
  staff,
}: {
  /** The areas this person's role allows; undefined = staff PINs are off. */
  areas?: readonly string[];
  /** The shop's public address, for "Ma carte client". */
  slug: string;
  /** Who is signed in at the counter, when anybody is. */
  staff?: { name: string; role: string } | null;
}) {
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);

  /*
    OPEN IS "OPEN ON THIS SCREEN", not a bare boolean — so a navigation closes
    it without an effect watching the address.

    It also gets the timing right, which a tap handler would not. These screens
    are server-rendered, so a tap is followed by a wait; closing the sheet on
    the tap leaves the cashier looking at the page they were trying to leave
    with no sign anything happened — the frozen feeling the loading skeletons
    exist to remove. Here the sheet stays up, covering the old screen, until the
    new address really is the address, and then it is closed because `openFor`
    no longer matches.
  */
  /*
    Keyed on the WHOLE address, query included.

    Keyed on the pathname alone it stayed open after "Chercher un client":
    /owner → /owner?client=1 does not change the path, so the sheet decided
    nothing had happened and sat on top of the screen it had just opened. The
    query is part of where you are whenever a link changes only the query, and
    one of these links does.
  */
  const search = useSearchParams().toString();
  const address = search ? `${pathname}?${search}` : pathname;
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === address;
  const setOpen = (v: boolean) => setOpenFor(v ? address : null);

  /* Escape closes it — this is a dialog, and a dialog you cannot dismiss with
     the keyboard is one a laptop user has to click their way out of. */
  useEffect(() => {
    if (!open) return;
    /* setOpenFor, not the setOpen helper: the helper is rebuilt every render, so
       depending on it would re-run this effect (and re-steal focus) on each one.
       The raw setter is stable, which is what an effect wants. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenFor(null);
    };
    window.addEventListener("keydown", onKey);
    /* The page behind must not scroll under the sheet: on a phone that reads as
       the sheet sliding off, and it loses the reader's place. */
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const here = TABS.find((t) => isActive(pathname, t.href));
  /* First name only. "Mohamed Salah Bennour" in a floating pill is a paragraph;
     the counter calls him by the first word anyway. */
  const short = staff?.name.trim().split(/\s+/)[0] ?? null;

  return (
    <>
      {/* ── the button ─────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-end px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          /*
            A pill with a WORD in it, not a bare circle.

            A floating circle with a glyph is a guess — and the one thing a
            cashier must never have to guess is where the rest of their shop
            went. The word costs 40px on a screen that just got a whole tab bar
            back.
          */
          className="a-fab pointer-events-auto flex items-center gap-2.5 rounded-full px-4 py-3 text-[14px] font-extrabold active:scale-[0.97]"
        >
          {short ? (
            <span
              aria-hidden
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/25 text-[11px] font-extrabold"
            >
              {short.slice(0, 1).toUpperCase()}
            </span>
          ) : (
            <UsersIcon className="h-[18px] w-[18px] shrink-0" aria-hidden />
          )}
          <span className="max-w-[9ch] truncate">{short ?? "Menu"}</span>
        </button>
      </div>

      {/* ── the sheet ──────────────────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="d-veil fixed inset-0 z-40 flex flex-col justify-end bg-[#14101f]/45 backdrop-blur-sm md:hidden print:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            className="d-sheet max-h-[86dvh] overflow-y-auto rounded-t-[26px] bg-[var(--o-panel)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* the grab handle: says "this came from the bottom and goes back" */}
            <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-[var(--o-edge)]" />

            {staff && (
              <p className="px-1 pb-2 text-[12px] font-semibold text-slate">
                <span className="font-extrabold text-charcoal">{staff.name}</span> · {staff.role} ·
                les opérations sont à votre nom
              </p>
            )}

            <ul className="space-y-1.5">
              {visible(areas).map(({ label, Icon, href }) => {
                const active = here?.href === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      prefetch
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-2xl px-3.5 py-3.5 text-[15.5px] font-bold transition ${
                        active
                          ? "bg-[#5b3fd1] text-white"
                          : "bg-[var(--o-inset)] text-charcoal active:scale-[0.99]"
                      }`}
                    >
                      <Icon className="h-[19px] w-[19px] shrink-0" />
                      {label}
                    </Link>
                  </li>
                );
              })}

              {/*
                The till's own third act, which is not a sale.

                Corrections, a customer's history and a forgotten secret code are
                done a few times a week, standing still — so they were never
                going to earn a button beside the two that run the queue. It
                travels as an address so that this menu, which knows nothing
                about the till's internals, can still open it from any screen in
                the app: the till reads ?client=1 and goes straight there.
              */}
              <li>
                <Link
                  href="/owner?client=1"
                  className="flex items-center gap-3 rounded-2xl bg-[var(--o-inset)] px-3.5 py-3.5 text-[15.5px] font-bold text-charcoal transition active:scale-[0.99]"
                >
                  <UsersIcon className="h-[19px] w-[19px] shrink-0" />
                  Chercher un client
                </Link>
              </li>

              {/*
                The card the customer sees. An owner otherwise has no way to look
                at their own product except by scanning their own poster.
              */}
              <li>
                <a
                  href={`/${slug}`}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[13.5px] font-semibold text-slate transition active:scale-[0.99]"
                >
                  <Out />
                  Ma carte client
                </a>
              </li>
            </ul>

            {staff && <LeaveRow name={staff.name} />}

            <button
              type="button"
              ref={closeRef}
              onClick={() => setOpen(false)}
              className="mt-2 w-full rounded-2xl py-3 text-center text-[14px] font-bold text-slate"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Ending the shift, from wherever you are.
 *
 * Red, and first among the quiet things, for the reason the till's panel was
 * red: one phone lives behind a counter and it gets handed over, and everything
 * the next person does otherwise carries the last person's name — a record that
 * reads as true and is not.
 */
function LeaveRow({ name }: { name: string }) {
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() =>
        start(async () => {
          await signOutAction();
          /* The layout renders the PIN gate again the moment the cookie is
             gone — same URL, different screen. A full reload is the simplest
             way to be certain nothing client-side survives the handover. */
          window.location.assign("/owner");
        })
      }
      className="mt-2.5 flex w-full items-center justify-center gap-2.5 rounded-2xl border border-[#e5484d]/35 bg-[#e5484d]/[0.07] px-4 py-3.5 text-[14px] font-extrabold text-[#e5484d] active:scale-[0.99] disabled:opacity-60"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[18px] w-[18px] shrink-0"
        aria-hidden
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
      </svg>
      {busy ? "À bientôt…" : `Quitter — ${name}`}
    </button>
  );
}

function Out() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[17px] w-[17px] shrink-0"
      aria-hidden
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6M10 14 21 3" />
    </svg>
  );
}
