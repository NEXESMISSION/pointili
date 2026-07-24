"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellIcon, ChevronDownIcon, UserIcon } from "./icons";

/**
 * The diner app's top bar, in the mockup's shape: a control on the left, icons
 * on the right — over the café's colour.
 *
 * The left "control" is deliberately the CAFÉ IDENTITY, not a dead hamburger:
 * a diner carries cards for several places, so which one am I looking at has to
 * be answered at a glance, and switching has to be one tap. The chip shows the
 * café's logo + name + a chevron and leads to the card switcher on Profil.
 *
 * Right: a bell that lights up when there's a reward code waiting at the
 * counter, and the avatar → Profil.
 */
export function TopBar({
  slug,
  cafeName,
  logoUrl,
  hasCodes,
  multiCard,
}: {
  slug: string;
  cafeName: string;
  logoUrl: string | null;
  hasCodes: boolean;
  multiCard: boolean;
}) {
  const pathname = usePathname();

  // Pre-account (just scanned the QR): no card yet, so no identity/account
  // chrome — keep that first screen focused on joining.
  if (pathname === `/${slug}/rejoindre`) return null;

  return (
    <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-1">
      {/* which card am I on — and tap to switch */}
      <Link
        href={`/${slug}/profil`}
        className="flex min-w-0 items-center gap-2 rounded-full bg-white/12 py-1.5 pl-1.5 pr-3 ring-1 ring-white/15 active:scale-[0.98]"
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, arbitrary remote host
          <img src={logoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-[13px] font-extrabold"
            style={{ color: "var(--cafe)" }}
          >
            {cafeName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 truncate text-[14px] font-bold text-white">
          {cafeName}
        </span>
        {multiCard && <ChevronDownIcon className="h-4 w-4 shrink-0 text-white/70" />}
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        {/* a code to show at the counter is the only "notification" that exists */}
        <Link
          href={`/${slug}`}
          aria-label="Mes codes"
          className="relative grid h-9 w-9 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/15 active:scale-[0.95]"
        >
          <BellIcon className="h-[18px] w-[18px]" />
          {hasCodes && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#ff5a5a] ring-2 ring-[color-mix(in_oklab,var(--cafe),#000_10%)]" />
          )}
        </Link>
        <Link
          href={`/${slug}/profil`}
          aria-label="Mon profil"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/15 active:scale-[0.95]"
        >
          <UserIcon className="h-[18px] w-[18px]" />
        </Link>
      </div>
    </header>
  );
}
