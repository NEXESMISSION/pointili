"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { businessType } from "@/lib/businessTypes";
import type { WalletCafe } from "@/lib/db";

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

export function WalletView({
  cards,
  currentSlug,
  code,
}: {
  cards: WalletCafe[];
  currentSlug: string | null;
  /** The diner's 4-char account code — the same one at every shop. */
  code?: string | null;
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
      {/* header */}
      <header className="flex items-center gap-3 pb-6">
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
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/70 transition hover:bg-white/10 active:scale-[0.95]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-extrabold leading-tight">Mes cartes</h1>
          <p className="text-[12.5px] text-white/50">
            {cards.length} boutique{cards.length === 1 ? "" : "s"}
          </p>
        </div>
        {code && (
          <span className="shrink-0 rounded-2xl bg-white/12 px-3 py-1.5 text-center">
            <span className="block text-[9px] font-bold uppercase tracking-[0.08em] text-white/55">
              Mon code
            </span>
            <span className="block font-mono text-[15px] font-extrabold tracking-[0.14em]">
              {code}
            </span>
          </span>
        )}
      </header>

      {cards.length >= SEARCH_FROM && (
        <div className="relative mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            inputMode="search"
            className="w-full rounded-2xl bg-white/[0.07] py-2.5 pl-9 pr-4 text-[14px] font-medium text-white outline-none ring-1 ring-white/10 transition placeholder:text-white/40 focus:ring-white/25"
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
        <ul className="space-y-2">
          {shown.map((c) => (
            <CardRow key={c.businessId} card={c} current={c.slug === backSlug} />
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

/** One shop — the whole row is the tap target. */
function CardRow({ card, current }: { card: WalletCafe; current: boolean }) {
  const t = businessType(card.businessType);
  const pending = card.pendingWins + card.pendingRewards;

  return (
    <li>
      <Link
        href={`/${card.slug}`}
        className={`flex items-center gap-3.5 rounded-2xl px-3.5 py-3.5 transition active:scale-[0.99] ${
          current ? "bg-white/[0.13] ring-1 ring-white/25" : "bg-white/[0.06] ring-1 ring-white/10"
        }`}
      >
        {card.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
          <img src={card.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/12 text-[24px]">
            {t.emoji}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15.5px] font-bold leading-tight">{card.name}</span>
            {current && (
              <span className="shrink-0 rounded-full bg-white/90 px-1.5 py-[1px] text-[8.5px] font-extrabold uppercase tracking-[0.05em] text-charcoal">
                Actuelle
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-white/50">
            {t.label}
            {card.stampsEnabled && card.stamps > 0 && ` · ${card.stamps} tampons`}
          </span>
          {pending > 0 && (
            <span className="mt-1 inline-block rounded-full bg-[#ffd27a]/15 px-2 py-[2px] text-[10.5px] font-bold text-[#ffd27a]">
              {pending} à récupérer
            </span>
          )}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-right">
            <span className="block text-[16px] font-extrabold leading-none tabular-nums">
              {card.balance}
            </span>
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-white/40">
              pts
            </span>
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-white/30" aria-hidden>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </Link>
    </li>
  );
}
