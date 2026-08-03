"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { businessType } from "@/lib/businessTypes";
import type { WalletCafe } from "@/lib/db";
import { fmtPoints } from "@/lib/points";
import { GoChevron } from "@/components/GoChevron";
import { StampIcon } from "@/components/icons";

/**
 * The wallet — every shop the diner holds a card at.
 *
 * Deliberately plain: one tappable row per shop, ordered by what they opened
 * last. No per-card button (the row IS the button), no sort toggle, and the
 * search only appears once there are enough cards to need it — a three-card
 * wallet should read as a short list, not a control panel.
 */

/**
 * `?from` arrives from the URL bar, so it is untrusted: interpolated raw into
 * router.push(`/${…}`) a value like "/evil.com" becomes a protocol-relative URL
 * and navigates the diner off-site. Only ever accept a real slug shape.
 */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Below this many cards, a search box is just noise. */
const SEARCH_FROM = 6;

/** How close this card is to its next reward, resolved by app/cartes/page.tsx. */
/**
 * `cost`, not a pre-computed percentage.
 *
 * The bar used to be filled from nudge.progress, which measures from the
 * PREVIOUS reward tier. With rewards at 100 and 200 and a balance of 120, the
 * wallet drew 20% while the shop's own card and /boutique both drew 60% for the
 * same reward — the wallet, the one screen showing every shop at once, was the
 * one that looked like points had gone missing. Every bar in the product now
 * fills from balance / cost, the two numbers the caption already names.
 */
export type Nudge = { label: string; needed: number; cost: number } | null;

export function WalletView({
  cards,
  currentSlug,
  code,
  nudges = {},
}: {
  cards: WalletCafe[];
  currentSlug: string | null;
  /** The diner's 4-char account code — the same one at every shop. */
  code?: string | null;
  /** businessId → next reward, or null when they can already afford the top one. */
  nudges?: Record<string, Nudge>;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");

  // …and it must be a shop this diner actually holds a card at, so the arrow
  // can never point at an arbitrary route either.
  const backSlug =
    currentSlug && SLUG_RE.test(currentSlug) && cards.some((c) => c.slug === currentSlug)
      ? currentSlug
      : null;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? cards.filter(
          (c) =>
            c.name.toLowerCase().includes(needle) ||
            businessType(c.businessType).label.toLowerCase().includes(needle),
        )
      : [...cards];

    return list.sort((a, b) => {
      // the card they're on leads, then most recently opened
      if (a.slug === backSlug) return -1;
      if (b.slug === backSlug) return 1;
      return new Date(b.lastOpenedAt ?? 0).getTime() - new Date(a.lastOpenedAt ?? 0).getTime();
    });
  }, [cards, q, backSlug]);

  return (
    // full height so the merchant link sits at the BOTTOM instead of floating
    // halfway up a short list
    <div className="flex min-h-[calc(100dvh-2.5rem)] flex-col">
      {/*
        ── HEADER, to the mockup ──────────────────────────────────────────
        A filled circular back button, the title with the shop count beneath
        it, and the account code in its own panel on the right — labelled, and
        copyable, because the one thing anyone does with that code is read it
        out or hand the phone over.
      */}
      <header className="flex items-center gap-2.5 pb-4">
        <button
          type="button"
          /* No validated card to go back to (e.g. "/" → /cartes, which leaves no
             in-app history): fall back to a real card rather than a dead
             router.back() on a page with no other exit. */
          onClick={() => {
            const target = backSlug ?? shown[0]?.slug ?? cards[0]?.slug;
            if (target) router.push(`/${target}`);
            else router.back();
          }}
          aria-label="Retour"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.07] text-white/80 ring-1 ring-white/10 transition active:scale-[0.95]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          {/*
            nowrap and 21px, not 27. At 27 "Mes cartes" needed more row than a
            390px phone has left after a back button and the code panel, so it
            broke across two lines — and a two-line title beside a one-line
            panel is what made this header look unfinished rather than big.
          */}
          <h1 className="truncate whitespace-nowrap text-[21px] font-extrabold leading-tight tracking-[-0.02em]">
            Mes cartes
          </h1>
          <p className="text-[12.5px] text-white/45">
            {cards.length} boutique{cards.length === 1 ? "" : "s"}
          </p>
        </div>

        {code && <CodePanel code={code} />}
      </header>

      {cards.length >= SEARCH_FROM && (
        <div className="relative mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            inputMode="search"
            className="w-full rounded-2xl bg-white/[0.07] py-2.5 pl-9 pr-4 text-[16px] font-medium text-white outline-none ring-1 ring-white/10 transition placeholder:text-white/40 focus:ring-white/25"
          />
          <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-white/40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" strokeLinecap="round" />
            </svg>
          </span>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white/[0.05] px-6 py-12 text-center text-[13.5px] leading-relaxed text-white/55 ring-1 ring-white/10">
          {q
            ? "Aucune boutique ne correspond."
            : "Scanne le QR d'un commerce pour ajouter ta première carte."}
        </p>
      ) : (
        <ul className="stagger space-y-2.5">
          {shown.map((c, i) => (
            <CardRow
              key={c.businessId}
              index={i}
              card={c}
              current={c.slug === backSlug}
              nudge={nudges[c.businessId] ?? null}
            />
          ))}
        </ul>
      )}

      {/* The wallet is where a signed-in diner always lands, so it has to be the
          one place that also leads OUT — to the shop-owner side. */}
      <p className="mt-auto pt-10 text-center text-[11.5px] text-white/35">
        Vous êtes commerçant ?{" "}
        <Link href="/?pro=1" className="font-semibold text-white/60 underline underline-offset-2">
          Espace boutique
        </Link>
      </p>
    </div>
  );
}

/**
 * One shop, as a CARD.
 *
 * This was a list row — a 68px-tall rectangle with the logo left, the name in the
 * middle and the balance right — and it was the wrong object. The product's whole
 * promise is "une seule carte", the screen is called Mes cartes, and what it
 * showed was a settings list. A wallet has to hold things that look like things.
 *
 * So: a card-shaped block roughly two to a phone screen, a printed face rather
 * than a flat tint, the balance as the hero rather than a right-aligned
 * afterthought, and the shop's own identity where a loyalty card actually carries
 * it — top left, logo then name.
 *
 * The shape comes from a min-height, NOT from aspect-ratio. A ratio cannot lose
 * to its own content — see the note on the className below, which is the second
 * time this card was cut in half.
 *
 * EVERY CARD WEARS THE SAME FACE, on purpose. Telling shops apart by colour is
 * tempting and it is a decision already taken against (lib/brand.ts: owners used
 * to recolour their card and the app looked incoherent). Real branded loyalty
 * cards from one issuer look alike too; the logo and the name identify the shop,
 * and one house style is what makes a wallet of six of them look like a wallet.
 */
/**
 * The account code, labelled and copyable.
 *
 * It used to be a bare chip: four characters and no explanation. The one thing
 * anyone does with this code is READ IT OUT at a counter or paste it, and the
 * label is what tells a first-timer which of the several codes in this product
 * it is — this one is theirs and permanent, the six-character ones are reward
 * vouchers that expire.
 */
function CodePanel({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(code).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          },
          () => {},
        );
      }}
      aria-label={`Copier mon code client ${code}`}
      className="shrink-0 rounded-xl bg-white/[0.07] px-3 py-1.5 text-center ring-1 ring-white/10 transition active:scale-[0.97]"
    >
      <span className="block text-[8.5px] font-bold uppercase tracking-[0.08em] text-white/40">
        Mon code client
      </span>
      <span className="mt-0.5 flex items-center justify-center gap-1.5">
        <span className="font-mono text-[15.5px] font-bold tracking-[0.12em] text-white">{code}</span>
        {copied ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-[#7ff0b0]">
            <path d="m5 13 4 4L19 7" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-white/45">
            <rect x="9" y="9" width="11" height="11" rx="2.5" />
            <path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15" />
          </svg>
        )}
      </span>
    </button>
  );
}

function CardRow({
  card,
  current,
  nudge,
  index,
}: {
  card: WalletCafe;
  current: boolean;
  nudge: Nudge;
  /** Position in the list — only used to stagger the arrival. */
  index: number;
}) {
  const t = businessType(card.businessType);
  const pending = card.pendingWins + card.pendingRewards;

  return (
    <li style={{ ["--i" as string]: index }}>
      <Link
        href={`/${card.slug}`}
        /*
          w-full is load-bearing: aspect-ratio plus a definite min-height used to
          produce a TRANSFERRED MINIMUM width (196 × 16/9 = 348px) that beat the
          column on any phone under ~390px, pushing the chevron off the screen.
          There is no aspect-ratio here any more — the card is as tall as it
          needs to be — but the width stays explicit so it cannot come back.
        */
        className={`group relative block w-full overflow-hidden rounded-[22px] p-4 transition active:scale-[0.985] ${
          current ? "ring-1 ring-white/25" : "ring-1 ring-white/[0.10]"
        }`}
        style={
          current
            ? {
                backgroundImage:
                  "linear-gradient(150deg, #7c56e8 0%, #6039cf 30%, #4a2ca6 68%, #3a2288 100%)",
                boxShadow: "0 24px 48px -20px rgba(101,67,214,.9), inset 0 1px 0 rgba(255,255,255,.22)",
              }
            : {
                backgroundImage: "linear-gradient(150deg, #1c1533 0%, #171129 60%, #140f24 100%)",
                boxShadow: "0 18px 38px -22px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.07)",
              }
        }
      >
        {/* ── the shop ── */}
        <div className="flex items-start gap-3.5">
          {card.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
            <img
              src={card.logoUrl}
              alt=""
              className="h-[46px] w-[46px] shrink-0 rounded-full bg-white/15 object-cover ring-1 ring-white/20"
            />
          ) : (
            <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-white/15 text-[20px] ring-1 ring-white/20">
              {t.emoji}
            </span>
          )}

          <span className="min-w-0 flex-1 pt-0.5">
            {/* wraps rather than truncating: the ACTUELLE pill takes the room a
                shop name needs, and "Café El M…" identifies nothing — which is
                the one job this screen has */}
            <span className="block text-[16.5px] font-extrabold leading-tight line-clamp-2">
              {card.name}
            </span>
            <span className="block truncate text-[11.5px] font-medium text-white/45">{t.label}</span>
          </span>

          {current && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1">
              <span className="h-[7px] w-[7px] rounded-full bg-[#7c3aed]" />
              <span className="text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-[#1a1030]">
                Actuelle
              </span>
            </span>
          )}
        </div>

        {/*
          How close they are, then the bar. Named prize, not "ta récompense" —
          the whole reason to open this card is the thing at the end of it.
        */}
        {nudge && (
          <div className="mt-5">
            <p className="truncate text-[14px] text-white/70">
              Encore <b className="font-extrabold text-white">{fmtPoints(nudge.needed)}</b> pour{" "}
              {nudge.label.toLowerCase()}
            </p>
            <span className="mt-2 block h-[6px] overflow-hidden rounded-full bg-black/30">
              <span
                className="block h-full rounded-full bg-[#a78bfa]"
                style={{
                  width: `${Math.min(100, Math.round((card.balance / nudge.cost) * 100))}%`,
                }}
              />
            </span>
          </div>
        )}

        {/* ── the balance, which is the only reason to open this card ── */}
        <div className="mt-3 flex items-end justify-between gap-3">
          <span className="min-w-0">
            <span className="flex items-baseline gap-2">
              <span className="text-[30px] font-extrabold leading-none tabular-nums tracking-[-0.03em]">
                {fmtPoints(card.balance)}
              </span>
              <span className="text-[12px] font-bold text-[#c9b8ff]">points</span>
            </span>

            {/*
              The stamp count as ONE line, not a row of dots.

              Ten dots belong on the card screen where they are the mechanic you
              are watching fill. Here they were ten more objects on a list that
              already has three shops competing for attention, and the wallet
              only has to answer "how am I doing here" — a number does that.
            */}
            {card.stampsEnabled && card.stamps > 0 && (
              <span className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-white/55">
                <StampIcon className="h-[14px] w-[14px] text-white/60" />
                <b className="font-extrabold text-white">{card.stamps}</b> tampon
                {card.stamps > 1 ? "s" : ""}
              </span>
            )}

            {pending > 0 && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#ffd27a] px-2.5 py-[3px] text-[10.5px] font-extrabold text-[#3a2a06]">
                🎁 {pending} à récupérer
              </span>
            )}
          </span>

          {/* GoChevron, not a plain arrow: it turns into a spinner while the
              card is loading. There is no loading.tsx under /[slug] — every page
              there redirects, and a redirect inside a streamed Suspense boundary
              stops being an HTTP one — so this is the only tap feedback. */}
          <GoChevron size={36} />
        </div>
      </Link>
    </li>
  );
}
