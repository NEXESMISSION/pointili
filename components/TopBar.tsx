"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackLink } from "./BackLink";

/**
 * The header on every diner screen EXCEPT the card.
 *
 * The card screen has no bar of its own any more: its header is part of the
 * shop's banner, drawn by the page so the profile icon, the card switcher and
 * the bell sit ON the colour instead of in a white strip above it (see
 * app/[slug]/page.tsx → BannerHeader). Rendering both would have meant two rows
 * of chrome stacked on the one screen that should open with the shop's name.
 *
 * IT STILL OWNS THE WAY BACK. Adding a chevron to boutique, codes, historique,
 * scanner and profil individually cost each of them a whole row — a lone arrow
 * floating above the title. Here it costs nothing.
 *
 * The title stays OPTICALLY centred because both sides are fixed-width boxes.
 * Centring in a plain flex row would shift it off-axis on the screens that have
 * a back arrow and not the ones that do not.
 */
const TITLES: Record<string, string> = {
  historique: "Historique",
  profil: "Profil",
  boutique: "Récompenses",
  codes: "Mes codes",
  scanner: "Mon code",
  notifications: "Notifications",
};

export function TopBar({
  slug,
  pendingCodes = 0,
}: {
  slug: string;
  /** Rewards bought and not yet collected — what the bell's dot is about. */
  pendingCodes?: number;
}) {
  const pathname = usePathname();

  // Pre-account (just scanned the QR): no card yet — keep that screen on joining.
  if (pathname === `/${slug}/rejoindre`) return null;
  // The card draws its own header, in colour. See the note above.
  if (pathname === `/${slug}`) return null;

  const leaf = pathname.replace(`/${slug}`, "").replace("/", "");
  const title = TITLES[leaf] ?? "Ma carte";

  return (
    /* safe-t: installed, the status bar sits on top of this row. */
    <header className="safe-t sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[#ebe9ef] bg-[#f6f6f8]/92 px-4 pb-2.5 backdrop-blur [--safe-pt:0.9rem]">
      <span className="grid h-10 w-10 place-items-center">
        <BackLink fallback={`/${slug}`} />
      </span>

      <h1 className="min-w-0 truncate text-[16.5px] font-extrabold text-charcoal">{title}</h1>

      {/*
        A real bell, not a decorative one.

        It points at the rewards this person has already bought and not yet
        collected — the only thing in the product that is genuinely WAITING for
        them — so the dot appears when there is something to collect and never
        otherwise. A badge that is always lit teaches people to ignore it.
      */}
      <Link
        href={`/${slug}/notifications`}
        aria-label={
          pendingCodes > 0
            ? `${pendingCodes} récompense${pendingCodes > 1 ? "s" : ""} à récupérer`
            : "Mes codes"
        }
        className="relative grid h-10 w-10 place-items-center rounded-full text-slate transition active:scale-95"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {pendingCodes > 0 && (
          <span
            className="absolute right-[9px] top-[8px] h-[9px] w-[9px] rounded-full ring-2 ring-[#f6f6f8]"
            style={{ background: "var(--cafe)" }}
          />
        )}
      </Link>
    </header>
  );
}
