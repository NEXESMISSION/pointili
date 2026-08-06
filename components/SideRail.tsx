"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CardIcon, GiftIcon, UserIcon } from "@/components/icons";

/**
 * ── THE CLIENT APP ON A MONITOR ───────────────────────────────────────────
 *
 * On a phone this app is a column with a tab bar, and that is right. On a
 * laptop it was the SAME 480px column stranded in the middle of a grey field
 * with five hundred pixels of nothing either side — a phone screenshot, not a
 * page. The tab bar was the worst of it: two items pinned to the bottom of a
 * 900px window, as far from the pointer as it is possible to put them.
 *
 * So at lg the tabs become a rail. This is the pattern the OWNER app has always
 * used (components/OwnerNav), which matters: a shop owner who uses both should
 * not meet two different ideas of what this product is.
 *
 * It renders nothing below lg — the tab bar keeps the phone, untouched.
 */

const NAV = [
  { href: "", label: "Ma carte", Icon: CardIcon },
  { href: "/boutique", label: "Récompenses", Icon: GiftIcon },
  { href: "/historique", label: "Mon activité", Icon: ClockIcon },
  { href: "/profil", label: "Mon profil", Icon: UserIcon },
];

export function SideRail({
  slug,
  name,
  logoUrl,
  emoji,
  cards,
}: {
  slug: string;
  name: string;
  logoUrl: string | null;
  /** The business-type mark, for a shop that has uploaded no logo. */
  emoji: string;
  /** How many cards this person holds — the switcher's whole point. */
  cards: number;
}) {
  const pathname = usePathname();
  const base = `/${slug}`;

  // Pre-account: the join screen is a single task, with no navigation at all.
  if (pathname === `${base}/rejoindre`) return null;

  return (
    /* w-[264px] is not decoration: `shrink-0` with no width let the rail flex
       to fill the whole row and the content column collapsed to nothing. */
    <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col border-r border-[var(--edge)] px-3 py-5 lg:flex">
      {/* whose card this is — and a way back to it */}
      <Link href={base} className="mb-6 flex items-center gap-3 px-2">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
          <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[18px]"
            style={{ background: "var(--cafe-soft)" }}
          >
            <span className="shop-mark">{emoji}</span>
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-extrabold leading-tight text-charcoal">
            {name}
          </span>
          <span className="block text-[11.5px] text-slate">Ma carte de fidélité</span>
        </span>
      </Link>

      <nav className="space-y-1">
        {NAV.map(({ href, label, Icon }) => {
          const to = `${base}${href}`;
          const active = href === "" ? pathname === base : pathname.startsWith(to);
          return (
            <Link
              key={href}
              href={to}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[14px] font-bold transition"
              style={
                active
                  ? { background: "var(--cafe-soft)", color: "var(--cafe-text)" }
                  : { color: "var(--muted)" }
              }
            >
              <Icon className="h-[19px] w-[19px]" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* the wallet, at the bottom — it leaves this shop, so it is not a tab */}
      <Link
        href={`/cartes?from=${slug}`}
        className="d-card mt-auto flex items-center gap-3 px-3.5 py-3 transition hover:brightness-[0.99]"
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{ background: "var(--cafe-soft)", color: "var(--cafe-text)" }}
        >
          <CardIcon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-extrabold text-charcoal">Mes cartes</span>
          <span className="block text-[11px] text-slate">
            {cards} boutique{cards > 1 ? "s" : ""}
          </span>
        </span>
      </Link>
    </aside>
  );
}

/** The activity clock — same glyph the card's row uses, so they read as one place. */
function ClockIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
