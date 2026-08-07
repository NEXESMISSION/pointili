"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { CardIcon, GiftIcon } from "./icons";
import { translator, type Lang } from "@/lib/dict";

/**
 * The diner's bottom nav — TWO tabs, white, with the shop's colour marking the
 * one you are on.
 *
 * HISTORIQUE LEFT THE BAR. A tab bar is for the places you move between all
 * day, and there are two of those: the card you show at the till, and the
 * rewards you are saving for. Past activity is something you look up — once,
 * when a balance surprises you — and giving it permanent residence next to the
 * two live screens made the bar read as a menu rather than a switch. It is one
 * tap away on the card, on a tile that sits beside the codes tile — where you
 * go when you are asking a question, not when you are being served.
 *
 * The profile went the same way earlier, for the same reason.
 */
const tabs = [
  { key: "carte", label: "Ma carte", Icon: CardIcon, href: "" },
  { key: "boutique", label: "Récompenses", Icon: GiftIcon, href: "/boutique" },
];

/**
 * The tap has to land instantly, and there is no loading.tsx to do it.
 *
 * app/[slug] deliberately has no loading file: every page under it decides
 * whether you are a member and redirects if you are not, and a redirect thrown
 * inside a Suspense boundary that has already streamed cannot be an HTTP one —
 * Next degrades it to <meta refresh>, which cost every QR scan a spinner, a
 * full second, and a second page load. Removing the boundary put the 307 back
 * and took the instant transition away with it.
 *
 * useLinkStatus is what Next offers for exactly this case (dynamic route, no
 * loading.js). The tab lights up the moment it is pressed, so the wait belongs
 * to the tab you chose rather than to a screen that looks frozen.
 */
function TabBody({ label, Icon, active }: { label: string; Icon: typeof CardIcon; active: boolean }) {
  const { pending } = useLinkStatus();
  const lit = active || pending;
  return (
    <>
      {/* The active tab sits in a pill of the shop's own colour — on white,
          colour alone is too quiet to answer "where am I?" at arm's length. */}
      {/* The colour is set on the pill and the icons inherit it — they draw in
          currentColor and take no style prop of their own. */}
      <span
        className={`grid h-[34px] w-[58px] place-items-center rounded-full transition ${
          pending && !active ? "animate-pulse" : ""
        }`}
        style={{
          background: lit ? "var(--cafe-soft)" : undefined,
          color: lit ? "var(--cafe-text)" : "var(--muted)",
        }}
      >
        <Icon className="h-[21px] w-[21px]" />
      </span>
      <span
        className="text-[10.5px] font-bold transition-colors"
        style={{ color: lit ? "var(--cafe-text)" : "var(--muted)" }}
      >
        {label}
      </span>
    </>
  );
}

export function BottomNav({ slug, lang = "fr" }: { slug: string; lang?: Lang }) {
  const t = translator(lang);
  const pathname = usePathname();
  const base = `/${slug}`;

  // The join screen is pre-account — hide the nav so it stays focused on joining.
  if (pathname === `${base}/rejoindre`) return null;

  return (
    <nav className="sticky bottom-0 z-20 border-t lg:hidden border-[var(--edge)] bg-[var(--panel)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="flex">
        {tabs.map(({ key, label, Icon, href }) => {
          const to = `${base}${href}`;
          const active = href === "" ? pathname === base : pathname.startsWith(to);
          return (
            <li key={key} className="flex-1">
              <Link
                href={to}
                /*
                  The rewards list is prefetched; THE CARD IS NOT.

                  prefetch caches the payload for five minutes, and the card is
                  the one screen in this product that must never be stale: the
                  cashier credits points on their own device, so this phone has
                  no way of knowing its balance changed. A customer who came
                  back to "10 points" after being served would think the shop
                  had not counted them. The rewards list has no such clock.
                */
                prefetch={href === "/boutique" ? true : undefined}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[62px] flex-col items-center justify-center gap-0.5 py-2"
              >
                <TabBody label={t(label)} Icon={Icon} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
