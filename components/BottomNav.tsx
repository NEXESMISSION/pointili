"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CardIcon, HistoryIcon, UserIcon } from "./icons";

/**
 * The diner's bottom nav — three flat tabs on the deep-purple card, per the
 * product mockup: Carte (points / stamps), Historique (activity), Profil
 * (account + card switcher). Active tab is bright; the rest are dimmed white.
 */
const tabs = [
  { key: "carte", label: "Carte", Icon: CardIcon, href: "" },
  { key: "historique", label: "Historique", Icon: HistoryIcon, href: "/historique" },
  { key: "profil", label: "Profil", Icon: UserIcon, href: "/profil" },
];

export function BottomNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/${slug}`;

  // The join screen is pre-account — hide the nav so it stays focused on joining.
  if (pathname === `${base}/rejoindre`) return null;

  return (
    <nav
      className="sticky bottom-0 z-20 border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
      /* derive the bar from the café's own colour so a recoloured shop stays
         consistent — no more fixed purple against a teal (or any) card */
      style={{ background: "color-mix(in oklab, var(--cafe), #05010a 78%)" }}
    >
      <ul className="flex">
        {tabs.map(({ key, label, Icon, href }) => {
          const to = `${base}${href}`;
          const active = href === "" ? pathname === base : pathname.startsWith(to);
          return (
            <li key={key} className="flex-1">
              <Link
                href={to}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[62px] flex-col items-center justify-center gap-1 py-2"
              >
                <Icon
                  className={`h-[22px] w-[22px] transition-colors ${
                    active ? "text-white" : "text-white/45"
                  }`}
                />
                <span
                  className={`text-[10.5px] font-semibold transition-colors ${
                    active ? "text-white" : "text-white/45"
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
