"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, QrIcon, SlidersIcon, TillIcon } from "./icons";

/**
 * Owner bottom nav — modern brand.
 *
 * White bar, royal active puck — matching the diner nav and the landing. Sized
 * for mobile web: 64px rows, used one-handed behind a counter mid-service.
 */
const tabs = [
  { label: "Caisse", Icon: TillIcon, href: "/owner" },
  { label: "Analyses", Icon: ChartIcon, href: "/owner/analyses" },
  { label: "QR", Icon: QrIcon, href: "/owner/qr" },
  { label: "Réglages", Icon: SlidersIcon, href: "/owner/reglages" },
];

export function OwnerNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-20 border-t border-white/10 bg-[#0b0616]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden">
      <ul className="flex">
        {tabs.map(({ label, Icon, href }) => {
          const active =
            href === "/owner" ? pathname === "/owner" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 px-1 py-2"
              >
                <span
                  className={`grid h-[30px] w-[30px] place-items-center rounded-full transition-colors ${
                    active ? "bg-[#6d4ae6] text-white" : "text-white/45"
                  }`}
                >
                  <Icon className="h-[17px] w-[17px]" />
                </span>
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
