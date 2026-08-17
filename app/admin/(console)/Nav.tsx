"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ConsoleCounts } from "@/lib/platform";

/**
 * THE THING THE OLD CONSOLE DID NOT HAVE AT ALL.
 *
 * There was no navigation, because there was nowhere to navigate to: one page
 * held the queue, the roster, the money, the leads, the traffic and the audit
 * log, and the header offered "Site" and "Quitter". Finding anything meant
 * scrolling and remembering.
 *
 * ── THE BADGES ARE THE POINT, NOT THE LINKS ───────────────────────────────
 *
 * A rail that only lists sections makes a seven-page console SLOWER than the
 * one-page one it replaced: you now have to visit six pages to learn what the
 * single scroll used to show you at once. The counts are what buy that back —
 * the operator reads the rail and knows, without opening anything, that two
 * shops need a decision and nobody has paid.
 *
 * Which is why a badge renders ONLY when it is non-zero, and why it is coloured
 * by urgency rather than by section. A permanent grey "0" beside every item is
 * an eye-training exercise in ignoring badges, and the day one turns red it
 * gets ignored too.
 *
 * ── ONE COMPONENT, TWO SHAPES ─────────────────────────────────────────────
 *
 * A rail on a desktop and a bottom bar on a phone, from the same list. The
 * console is used at a desk, but "is anything waiting?" gets asked from a
 * phone at eleven at night, and that is the question this whole screen exists
 * to answer.
 *
 * ── AND NO ICONS, WHICH IS THE HOUSE STYLE ────────────────────────────────
 *
 * The first version of this rail carried a geometric mark beside each label —
 * ◎ ▦ ◈ ◉ ◍ ≡ — and four of the six were circles with something inside them.
 * At 13px they were indistinguishable from each other, so they added a column
 * of noise to the left of the only thing carrying meaning. components/icons.tsx
 * has stated this product's position since the beginning: it "speaks in type,
 * not iconography". Six words are unambiguous, and the bottom bar carries the
 * same six abbreviated rather than pictured.
 */

type Item = {
  href: string;
  label: string;
  /** Short enough for a 6-across bottom bar on a 360px screen. */
  short: string;
  count?: number;
  tone?: "bad" | "warn" | "idle";
  /** Sections whose child pages should still light the parent (e.g. /cafes/[id]). */
  deep?: boolean;
};

export function Nav({ counts, email }: { counts: ConsoleCounts; email: string | null }) {
  const path = usePathname();

  const items: Item[] = [
    { href: "/admin", label: "Aujourd'hui", short: "Auj.",
      count: counts.alerts + counts.renewals + counts.leads, tone: "bad" },
    { href: "/admin/cafes", label: "Cafés", short: "Cafés",
      count: counts.cafes, tone: "idle", deep: true },
    /* No badge. A customer count is not work waiting — there is no "clients to
       deal with" — and a permanent grey number here would be the thing that
       teaches the eye to skip this column. */
    { href: "/admin/clients", label: "Clients", short: "Clients", deep: true },
    { href: "/admin/argent", label: "Renouvellements", short: "Argent",
      count: counts.renewals, tone: "warn" },
    { href: "/admin/leads", label: "Accès anticipé", short: "Leads",
      count: counts.leads, tone: "warn" },
    { href: "/admin/trafic", label: "Trafic", short: "Trafic" },
    { href: "/admin/journal", label: "Journal", short: "Journal" },
    { href: "/admin/reglages", label: "Réglages", short: "Réglages" },
  ];

  /*
    "/admin" would prefix-match every page in the console, so the root is an
    exact match and everything else may go deep. Without that the first item is
    permanently current and the rail never tells you where you are.
  */
  const current = (i: Item) =>
    i.href === "/admin" ? path === "/admin" : i.deep ? path.startsWith(i.href) : path === i.href;

  return (
    <>
      {/* ── the rail, from md up ─────────────────────────────────────── */}
      <nav
        aria-label="Console"
        className="hidden shrink-0 flex-col gap-1 border-e border-[var(--o-edge)] bg-[var(--o-panel)] px-3 py-4 md:flex md:w-[228px]"
      >
        <Link href="/admin" className="mb-4 px-2">
          <span className="k-num block text-[13px] font-bold tracking-tight text-charcoal">
            pointili<span className="text-slate/50">/</span>console
          </span>
          {email && <span className="mt-0.5 block truncate text-[10.5px] text-slate">{email}</span>}
        </Link>

        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={current(i) ? "page" : undefined}
            className="k-nav"
          >
            {i.label}
            {!!i.count && <Badge n={i.count} tone={i.tone} />}
          </Link>
        ))}

        <span className="mt-auto" />
        <Link href="/" className="k-nav">
          Le site <span aria-hidden className="ms-auto opacity-60">↗</span>
        </Link>
      </nav>

      {/* ── the bottom bar, below md ─────────────────────────────────────
          EIGHT SECTIONS DO NOT FIT ACROSS A PHONE. At 360px that is 45px per
          item, which is under the 44px touch target and leaves room for about
          four characters. So the bar carries the six that are used at a
          counter or on the way home — the queue, the shops, the money, the
          leads, the traffic, the log — and the platform's own settings are
          reachable from the desktop rail, which is where a bank account number
          gets typed anyway.

          pb-[env(safe-area-inset-bottom)] because the console is installable
          like everything else on this origin, and a home-indicator sitting on
          top of the tab bar is the exact defect app/layout's viewport-fit note
          was written about. */}
      <nav
        aria-label="Console"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--o-edge)] bg-[var(--o-panel)] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {items.filter((i) => i.href !== "/admin/reglages").map((i) => {
          const on = current(i);
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={on ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10.5px] font-bold transition ${
                on ? "text-royal" : "text-slate"
              }`}
            >
              {/* A dot, not a number: six labels and six counts do not fit
                  across a 360px screen, and "there is something here" is the
                  whole message a tab bar can carry. It sits ABOVE the word
                  rather than beside it, so a long label never pushes it off. */}
              <span
                aria-hidden
                className={`k-dot ${
                  i.count && i.tone !== "idle" ? `k-${i.tone ?? "warn"}` : "opacity-0"
                }`}
              />
              {i.short}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function Badge({ n, tone }: { n: number; tone?: "bad" | "warn" | "idle" }) {
  return <span className={`k-badge k-${tone ?? "idle"}`}>{n > 99 ? "99+" : n}</span>;
}
