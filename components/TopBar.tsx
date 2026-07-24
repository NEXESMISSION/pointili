"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "./icons";

/**
 * The diner app's top bar — a slim café-identity chip on the deep-purple card.
 *
 * A diner carries cards for several places, so "which one am I on?" has to be
 * answerable at a glance, and switching has to be one tap. The chip shows the
 * café's logo + name and leads to the card switcher on Profil; the chevron only
 * appears when there's actually more than one card to switch to.
 */
export function TopBar({
  slug,
  cafeName,
  logoUrl,
  multiCard,
}: {
  slug: string;
  cafeName: string;
  logoUrl: string | null;
  multiCard: boolean;
}) {
  const pathname = usePathname();

  // Pre-account (just scanned the QR): no card yet — keep that screen on joining.
  if (pathname === `/${slug}/rejoindre`) return null;

  return (
    <header className="flex items-center justify-center px-5 pt-4 pb-1">
      <Link
        href={`/${slug}/profil`}
        className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/10 py-1.5 pl-1.5 pr-3.5 ring-1 ring-white/15 active:scale-[0.98]"
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, arbitrary remote host
          <img src={logoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[11px] font-extrabold"
            style={{ color: "var(--cafe)" }}
          >
            {cafeName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 truncate text-[13.5px] font-bold text-white">{cafeName}</span>
        {multiCard && <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-white/60" />}
      </Link>
    </header>
  );
}
