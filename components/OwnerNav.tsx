"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, QrIcon, SlidersIcon, TillIcon } from "./icons";

/*
  Owner navigation, in two shapes for two machines.

  Behind a counter this is a phone: thumb-height tabs pinned to the bottom. On a
  laptop in the back office the same four tabs stuck to the bottom edge are
  wrong — a mobile convention, miles from the cursor, and wasting the width the
  screen actually has. So from `md` up the tabs become a real sidebar and the
  bottom bar disappears.

  Both read from one list, so a tab can never exist in one and not the other.
*/

const TABS = [
  { label: "Caisse", Icon: TillIcon, href: "/owner" },
  { label: "Analyses", Icon: ChartIcon, href: "/owner/analyses" },
  { label: "QR", Icon: QrIcon, href: "/owner/qr" },
  { label: "Réglages", Icon: SlidersIcon, href: "/owner/reglages" },
];

/** /owner matches only itself; the rest match their whole subtree. */
function isActive(pathname: string, href: string) {
  return href === "/owner" ? pathname === "/owner" : pathname.startsWith(href);
}

/* ── phone: thumb-height tabs at the bottom ───────────────────────────── */

export function OwnerTabs() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-20 border-t border-white/10 bg-[#0b0616]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden">
      <ul className="flex">
        {TABS.map(({ label, Icon, href }) => {
          const active = isActive(pathname, href);
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

/* ── desktop: a real sidebar ──────────────────────────────────────────── */

export function OwnerSidebar({
  name,
  initial,
  colour,
  plan,
}: {
  name: string | null;
  initial: string;
  colour: string;
  plan: { text: string; cls: string } | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-white/10 bg-[#0b0616]/70 px-3 py-4 md:flex print:hidden">
      <div className="mb-5 flex items-center gap-2.5 px-2">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-extrabold text-white"
          style={{ background: colour }}
        >
          {initial}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-extrabold leading-tight text-white">
            {name ?? "pointili.online"}
          </span>
          <span className="block text-[10.5px] font-semibold text-white/45">Espace café</span>
        </span>
      </div>

      <nav>
        <ul className="space-y-1">
          {TABS.map(({ label, Icon, href }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-bold transition ${
                    active ? "bg-[#6d4ae6] text-white" : "text-white/55 hover:bg-white/[0.06]"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {plan && (
        <span className={`mt-auto self-start rounded-full px-2.5 py-1 text-[10px] font-bold ${plan.cls}`}>
          {plan.text}
        </span>
      )}
    </aside>
  );
}
