"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { CardIcon, GiftIcon, HistoryIcon } from "./icons";

/**
 * The diner's bottom nav — three flat tabs on the deep-purple card, per the
 * product mockup: Carte (points / stamps), Historique (activity), Profil
 * (account + card switcher). Active tab is bright; the rest are dimmed white.
 */
const tabs = [
  { key: "carte", label: "Carte", Icon: CardIcon, href: "" },
  { key: "historique", label: "Historique", Icon: HistoryIcon, href: "/historique" },
  /*
    The store, not the profile.

    A tab bar has three slots and the profile was spending one of them on
    something a customer opens perhaps twice ever — to change their name. The
    rewards are what they came for, and they were two taps away behind "Voir
    tout". The profile moved to the person icon in the header, which is where
    every app on the phone already keeps it.
  */
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
      <Icon
        className={`h-[22px] w-[22px] transition-colors ${lit ? "text-white" : "text-white/45"} ${
          pending && !active ? "animate-pulse" : ""
        }`}
      />
      <span
        className={`text-[10.5px] font-semibold transition-colors ${
          lit ? "text-white" : "text-white/45"
        }`}
      >
        {label}
      </span>
    </>
  );
}

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
      style={{ background: "color-mix(in oklab, var(--cafe), #05010a 88%)" }}
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
                <TabBody label={label} Icon={Icon} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
