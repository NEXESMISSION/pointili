"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { businessType } from "@/lib/businessTypes";
import { ChevronDownIcon } from "./icons";

/**
 * The diner app's top bar — a slim café-identity chip on the deep-purple card.
 *
 * A diner carries cards for several shops, so "which one am I on?" has to be
 * answerable at a glance (the shop's type emoji + name), and switching has to be
 * one tap — the chip opens the wallet (/cartes) where every card lives.
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
    <header className="safe-t flex items-center justify-center px-5 pt-4 pb-1">
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
