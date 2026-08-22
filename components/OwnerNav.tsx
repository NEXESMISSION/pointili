"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, GiftIcon, QrIcon, SlidersIcon, TillIcon } from "./icons";

/*
  Owner navigation, in two shapes for two machines.

  Behind a counter this is a phone: thumb-height tabs pinned to the bottom. On a
  laptop in the back office the same tabs stuck to the bottom edge are wrong — a
  mobile convention, miles from the cursor, and wasting the width the screen
  actually has. So from `md` up they become a real sidebar and the bottom bar
  disappears.

  Both read from one list, so a destination can never exist in one and not the
  other.

  ── FIVE, NOT THREE ───────────────────────────────────────────────────────

  It was Caisse / Clients / Réglages, and the other half of the app was
  unreachable except by remembering a URL:

    · the shop's QR — the thing that CREATES every card — had been demoted to a
      line at the bottom of the till, on the argument that "you print it once".
      That is true of the printing and false of everything else: a new table, a
      lost sticker, a second branch, showing it to somebody across the counter.
    · Récompenses lived inside a modal inside Réglages, three taps from
      anywhere, despite being the one setting that decides whether the whole
      programme works.
    · Renouveler was reachable only from a banner that appears when it is
      nearly too late.

  A tool with six screens and three tabs is a tool whose other half is folklore.
*/

/*
  prefetch on every tab, and it is `true`, not the default.

  These screens are DYNAMIC — they read the shop's own data on every request —
  and Next's default only prefetches a dynamic route as far as its nearest
  loading.js boundary. This app deliberately has none (see useLit below), so the
  default prefetched nothing at all and each tab cost a full server round trip
  after the tap. `prefetch` fetches the whole payload while the tab sits in the
  thumb row, which is where it always sits, so switching screens is a cache read.

  It is safe to cache because everything that changes a shop's data goes through
  a server action on this same device, and every one of them calls
  revalidatePath — which drops the client cache for the path it just changed.
*/
/* Real paths. The host split does not rewrite them — see proxy.ts. */
const TABS = [
  { label: "Caisse", short: "Caisse", Icon: TillIcon, href: "/owner", area: "caisse" },
  { label: "Clients", short: "Clients", Icon: ChartIcon, href: "/owner/clients", area: "clients" },
  { label: "Récompenses", short: "Cadeaux", Icon: GiftIcon, href: "/owner/recompenses", area: "recompenses" },
  { label: "Mon QR", short: "QR", Icon: QrIcon, href: "/owner/qr", area: "qr" },
  { label: "Réglages", short: "Réglages", Icon: SlidersIcon, href: "/owner/reglages", area: "reglages" },
] as const;

/**
 * WHICH TABS THIS PERSON GETS.
 *
 * `areas` is the list the layout worked out from their role; undefined means
 * the shop has not switched staff PINs on, and everyone is the owner.
 *
 * This is a COURTESY, not a gate. Every screen it hides re-asks the question
 * server-side and every action behind it does too — a tab bar is markup, and
 * the person it is hiding things from is holding the device it renders on.
 */
function visible(areas?: readonly string[]) {
  return areas ? TABS.filter((t) => areas.includes(t.area)) : TABS;
}

/**
 * /owner is the till and matches only itself now.
 *
 * It used to also claim /owner/qr, because the QR had no tab of its own and a
 * screen reached from the till should not leave the till unlit. The QR has its
 * own tab, so that exception is a bug: it would light two.
 */
function isActive(pathname: string, href: string) {
  return href === "/owner" ? pathname === "/owner" : pathname.startsWith(href);
}

/**
 * THE TAB IS THE LOADING INDICATOR.
 *
 * There used to be a loading.tsx here that replaced the whole page with the
 * Pointili mark and a sliding bar, on every single navigation. It answered "is
 * this alive?" by throwing away the screen you were looking at — which made a
 * 300ms move between two of your own tabs feel like a cold launch of a
 * different app, and it is the reason routing felt slow.
 *
 * It is gone. The page you are on stays until the next one is ready, the way a
 * native app behaves, and the ONE thing that changes on tap is the tab you
 * pressed: it lights up immediately, then the screen arrives under it.
 */
function useLit(active: boolean) {
  const { pending } = useLinkStatus();
  return active || pending;
}

/* ── phone: thumb-height tabs at the bottom ───────────────────────────── */

export function OwnerTabs({ areas }: { areas?: readonly string[] }) {
  const pathname = usePathname();
  const tabs = visible(areas);

  return (
    <nav className="sticky bottom-0 z-20 border-t border-[var(--o-edge)] bg-[var(--o-panel)]/92 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden">
      <ul className="flex">
        {tabs.map(({ short, Icon, href }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                prefetch
                aria-current={active ? "page" : undefined}
                /* 64px stays: it is a thumb target during service, and five
                   across a 360px screen is still 72px wide. */
                className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 px-0.5 py-2"
              >
                <TabBody label={short} Icon={Icon} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The sidebar's row, lit the moment it is clicked. Same rule as TabBody. */
function SideBody({
  label,
  Icon,
  active,
}: {
  label: string;
  Icon: typeof TillIcon;
  active: boolean;
}) {
  const lit = useLit(active);
  return (
    <span
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-bold transition ${
        lit ? "bg-[#5b3fd1] text-white" : "text-slate hover:bg-[var(--o-inset)]"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
      {label}
    </span>
  );
}

/** Must live inside the <Link> — useLinkStatus reads the nearest one. */
function TabBody({
  label,
  Icon,
  active,
}: {
  label: string;
  Icon: typeof TillIcon;
  active: boolean;
}) {
  const lit = useLit(active);
  return (
    <>
      <span
        className={`grid h-[30px] w-[30px] place-items-center rounded-full transition-colors ${
          lit ? "bg-[#5b3fd1] text-white" : "text-slate"
        }`}
      >
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <span
        className={`text-[10px] font-semibold transition-colors ${
          lit ? "text-charcoal" : "text-slate"
        }`}
      >
        {label}
      </span>
    </>
  );
}

/* ── desktop: a real sidebar ──────────────────────────────────────────── */

export function OwnerSidebar({
  name,
  initial,
  colour,
  plan,
  slug,
  areas,
  staff,
}: {
  name: string | null;
  initial: string;
  colour: string;
  plan: { text: string; cls: string } | null;
  /** The shop's public address — the rail links to the card customers see. */
  slug: string;
  /** The areas this person's role allows; undefined = staff PINs are off. */
  areas?: readonly string[];
  /** Who is signed in at the counter, when anybody is. */
  staff?: { name: string; role: string } | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[228px] shrink-0 flex-col border-r border-[var(--o-edge)] bg-[var(--o-panel)]/70 px-3 py-4 md:flex print:hidden">
      <div className="mb-5 flex items-center gap-2.5 px-2">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-extrabold text-charcoal"
          style={{ background: colour }}
        >
          {initial}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-extrabold leading-tight text-charcoal">
            {name ?? "pointili.online"}
          </span>
          {/*
            The shop's own ADDRESS, not the words "Espace café".

            An owner knows they are in their own admin. What they routinely need
            — to read out on the phone, to check against a printed sticker, to
            type into another device — is /their-slug, and it appeared nowhere
            in the chrome.
          */}
          <span className="k-num block truncate text-[10.5px] text-slate">/{slug}</span>
        </span>
      </div>

      <nav>
        <ul className="space-y-1">
          {visible(areas).map(({ label, Icon, href }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link href={href} prefetch aria-current={active ? "page" : undefined}>
                  <SideBody label={label} Icon={Icon} active={active} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto space-y-1">
        {/*
          WHO IS AT THE COUNTER, where the rail already says which shop.

          The till carries the red button — that is the screen somebody is
          looking at when they hand the phone over. This is the quiet copy for
          the laptop in the back office, where the same question ("whose name is
          on this afternoon?") is asked while reading the numbers.
        */}
        {staff && (
          <span className="mb-1 block rounded-xl bg-[var(--o-inset)] px-3 py-2">
            <span className="block truncate text-[12px] font-extrabold text-charcoal">{staff.name}</span>
            <span className="block text-[10.5px] font-semibold text-slate">{staff.role}</span>
          </span>
        )}
        {/*
          THE CARD THE CUSTOMER SEES, one click away.

          An owner has no way to look at their own product. They can print the
          QR and they can scan it with a phone — that is it. Half the questions
          a shop asks support ("does the reward show?", "is my logo right?",
          "why does it say that?") are answered by opening this.
        */}
        <a
          href={`/${slug}`}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-slate transition hover:bg-[var(--o-inset)] hover:text-charcoal"
        >
          <Out /> Ma carte client
        </a>
        {/*
          The way back to the public site.

          "/" redirects a signed-in owner to their till — right, they open this
          app to serve a queue, not to read their own sales page. But there was
          no way OUT: an owner who wanted to look at their own landing page, or
          show it to somebody across a table, was locked out of it by being a
          customer. ?pro=1 already existed as the escape hatch and nothing in
          the product ever said so.
        */}
        <Link
          href="/?pro=1"
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-slate transition hover:bg-[var(--o-inset)] hover:text-charcoal"
        >
          <Out /> Le site Pointili
        </Link>

        {plan && (
          <span className={`ms-3 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold ${plan.cls}`}>
            {plan.text}
          </span>
        )}
      </div>
    </aside>
  );
}

function Out() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6M10 14 21 3" />
    </svg>
  );
}
