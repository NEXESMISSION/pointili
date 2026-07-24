"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GiftIcon, HomeIcon, ScanIcon, UserIcon } from "./icons";

/**
 * The diner's bottom nav — four flat tabs, per the product mockup:
 * Accueil (card + points), Scanner ("show me at the counter"), Offres
 * (rewards), Profil (history, other cafés, switch account).
 * MVP is the POINTS system only — no games tab.
 */
const tabs = [
  { key: "accueil", label: "Accueil", Icon: HomeIcon, href: "" },
  { key: "scanner", label: "Scanner", Icon: ScanIcon, href: "/scanner" },
  { key: "offres", label: "Offres", Icon: GiftIcon, href: "/boutique" },
  { key: "profil", label: "Profil", Icon: UserIcon, href: "/profil" },
];

export function BottomNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/${slug}`;

  /*
    The join screen is pre-account. A visitor who just scanned the QR hasn't got
    a card yet, so the tabs would only bounce them back here. Hiding the nav
    keeps that first screen focused on activating a card.
  */
  if (pathname === `${base}/rejoindre`) return null;

  return (
    <nav className="sticky bottom-0 z-20 border-t border-hair bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="flex">
        {tabs.map(({ key, label, Icon, href }) => {
          const to = `${base}${href}`;
          const active = href === "" ? pathname === base : pathname.startsWith(to);
          return (
            <li key={key} className="flex-1">
              <Link
                href={to}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[62px] flex-col items-center justify-center gap-1 py-2 active:bg-lilac-2"
              >
                <Icon
                  className={`h-[22px] w-[22px] transition-colors ${
                    active ? "text-royal" : "text-slate/70"
                  }`}
                />
                <span
                  className={`text-[10.5px] font-semibold transition-colors ${
                    active ? "text-royal" : "text-slate/80"
                  }`}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
