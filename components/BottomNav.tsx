"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CardIcon, GiftIcon } from "./icons";

/**
 * The diner's bottom nav — two tabs only, on purpose.
 *
 * "Ma carte" (points, progress, history) and "Boutique" (rewards). The wheel is
 * NOT a tab — it's an action reached from the card's "Jouer" button when a spin
 * is ready. Two clear destinations keeps the app dead simple (§11: simplicity
 * IS "nice").
 */
const tabs = [
  { key: "carte", label: "Ma carte", Icon: CardIcon, href: "" },
  { key: "boutique", label: "Boutique", Icon: GiftIcon, href: "/boutique" },
];

export function BottomNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/${slug}`;

  /*
    The join screen is pre-account. A visitor who just scanned the QR hasn't got
    a card yet, so "Ma carte" and "Boutique" only bounce them back here. Hiding
    the nav keeps that first screen focused on the one thing that matters:
    activating a card.
  */
  if (pathname === `${base}/rejoindre`) return null;

  return (
    <nav className="sticky bottom-0 z-20 border-t border-hair bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="flex">
        {tabs.map(({ key, label, Icon, href }) => {
          const to = `${base}${href}`;
          const active = href === "" ? pathname === base : pathname.startsWith(to);
          return (
            <li key={key} className="flex-1">
              <Link
                href={to}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 py-2.5 active:bg-lilac-2"
              >
                <span
                  className={`grid h-[34px] w-[34px] place-items-center rounded-full transition-colors ${
                    active ? "bg-royal text-white" : "text-slate"
                  }`}
                >
                  <Icon className="h-[19px] w-[19px]" />
                </span>
                <span
                  className={`text-[11.5px] font-semibold transition-colors ${
                    active ? "text-charcoal" : "text-slate"
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
