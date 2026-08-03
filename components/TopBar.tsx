"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackLink } from "./BackLink";
import { UserIcon } from "./icons";

/**
 * The diner app's top bar: who you are, where you are, what is waiting.
 *
 * It used to be a café-identity chip — logo + name + chevron — because the shop
 * had to be identifiable and switchable from every screen. The card itself now
 * carries the shop at full size (its logo at 96px and its name at 30px), so
 * repeating the name in a pill 130px above it was the same word twice on the
 * most cramped surface in the product. The chip's other job, switching cards,
 * moved onto the card: tapping it opens the wallet.
 *
 * IT STILL OWNS THE WAY BACK. Adding a chevron to boutique, codes, historique,
 * scanner and profil individually cost each of them a whole row — a lone arrow
 * floating above the title. Here it costs nothing: it sits in space the header
 * already occupied. On the card itself there is nothing above it inside the
 * shop, so that slot becomes the profile instead.
 *
 * The title stays OPTICALLY centred because both sides are fixed-width boxes.
 * Centring in a plain flex row would shift it off-axis on the screens that have
 * a back arrow and not the ones that do not.
 */
const TITLES: Record<string, string> = {
  "": "Ma carte",
  historique: "Historique",
  profil: "Profil",
  boutique: "Récompenses",
  codes: "Mes codes",
  scanner: "Mon code",
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

  const onCard = pathname === `/${slug}`;
  const leaf = pathname.replace(`/${slug}`, "").replace("/", "");
  const title = TITLES[leaf] ?? "Ma carte";

  return (
    /* safe-t: installed, the status bar sits on top of this row. */
    <header className="safe-t flex items-center justify-between gap-2 px-4 pb-2 [--safe-pt:1rem]">
      <span className="grid h-10 w-10 place-items-center">
        {onCard ? (
          <Link
            href={`/${slug}/profil`}
            aria-label="Mon profil"
            className="grid h-10 w-10 place-items-center rounded-full text-white/80 transition active:scale-95"
          >
            <UserIcon className="h-[22px] w-[22px]" />
          </Link>
        ) : (
          <BackLink fallback={`/${slug}`} />
        )}
      </span>

      <h1 className="min-w-0 truncate text-[17px] font-extrabold text-white">{title}</h1>

      {/*
        A real bell, not a decorative one.

        It points at the rewards this person has already bought and not yet
        collected — the only thing in the product that is genuinely WAITING for
        them — so the dot appears when there is something to collect and never
        otherwise. A badge that is always lit teaches people to ignore it.
      */}
      <Link
        href={`/${slug}/codes`}
        aria-label={
          pendingCodes > 0
            ? `${pendingCodes} récompense${pendingCodes > 1 ? "s" : ""} à récupérer`
            : "Mes codes"
        }
        className="relative grid h-10 w-10 place-items-center rounded-full text-white/80 transition active:scale-95"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {pendingCodes > 0 && (
          <span className="absolute right-[9px] top-[8px] h-[9px] w-[9px] rounded-full bg-[#8b5cf6] ring-2 ring-[#1a1030]" />
        )}
      </Link>
    </header>
  );
}
