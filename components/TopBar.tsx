"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { businessType } from "@/lib/businessTypes";
import { BackLink } from "./BackLink";
import { ChevronDownIcon } from "./icons";

/**
 * The diner app's top bar — a slim café-identity chip on the deep-purple card.
 *
 * A diner carries cards for several shops, so "which one am I on?" has to be
 * answerable at a glance (the shop's type emoji + name), and switching has to be
 * one tap — the chip opens the wallet (/cartes) where every card lives.
 *
 * IT ALSO OWNS THE WAY BACK, and that is why it is here rather than on each
 * page. Adding a chevron to boutique, codes, historique, scanner and profil
 * individually cost each of them a whole row — a lone arrow floating in the gap
 * between the café chip and the title, on the one surface with the least
 * vertical room in the product. In the bar it costs nothing: it sits in space
 * the header already occupied.
 *
 * The chip stays OPTICALLY centred because the arrow is positioned absolutely.
 * Centring it in a flex row would shift the shop's name off-axis on exactly the
 * screens that have a back button and not the ones that do not.
 */
export function TopBar({
  slug,
  cafeName,
  logoUrl,
  businessTypeKey,
}: {
  slug: string;
  cafeName: string;
  logoUrl: string | null;
  businessTypeKey: string;
}) {
  const pathname = usePathname();

  // Pre-account (just scanned the QR): no card yet — keep that screen on joining.
  if (pathname === `/${slug}/rejoindre`) return null;

  const type = businessType(businessTypeKey);

  return (
    /* safe-t: installed, the status bar sits on top of this row. */
    <header className="safe-t relative flex items-center justify-center px-5 pb-1 [--safe-pt:1rem]">
      {/*
        On the shop's own card there is nothing "above" it inside the shop, so
        back means the wallet. Anywhere deeper it means the card. Both are only
        fallbacks — BackLink pops real history first, which is what returns the
        person to their scroll position.
      */}
      <span className="absolute bottom-1 left-3.5">
        <BackLink fallback={pathname === `/${slug}` ? "/cartes" : `/${slug}`} />
      </span>

      <Link
        href={`/cartes?from=${slug}`}
        className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/10 py-1.5 pl-1.5 pr-3.5 ring-1 ring-white/15 active:scale-[0.98]"
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, arbitrary remote host
          <img src={logoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/90 text-[13px]">
            {type.emoji}
          </span>
        )}
        <span className="min-w-0 truncate text-[13.5px] font-bold text-white">{cafeName}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-white/60" />
      </Link>
    </header>
  );
}
