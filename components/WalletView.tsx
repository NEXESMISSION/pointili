"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BRAND_COLOR } from "@/lib/brand";
import { businessType } from "@/lib/businessTypes";
import type { WalletCafe } from "@/lib/db";

/**
 * The wallet — every shop the diner holds a card at. Search it, sort it by what
 * they last opened, see which one they're currently on, and open any with a
 * clear button. Everything a "which card do I want?" screen needs.
 */
/**
 * `?from` arrives from the URL bar, so it is untrusted: interpolated raw into
 * router.push(`/${…}`) a value like "/evil.com" becomes a protocol-relative URL
 * and navigates the diner off-site. Only ever accept a real slug shape.
 */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function WalletView({
  cards,
  currentSlug,
}: {
  cards: WalletCafe[];
  currentSlug: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");

  // …and it must be a shop this diner actually holds a card at, so the arrow
  // can never point at an arbitrary route either.
  const backSlug =
    currentSlug && SLUG_RE.test(currentSlug) && cards.some((c) => c.slug === currentSlug)
      ? currentSlug
      : null;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = cards.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        businessType(c.businessType).label.toLowerCase().includes(needle),
    );
    return list.sort((a, b) => {
      // the card they're currently on always leads
      if (a.slug === backSlug) return -1;
      if (b.slug === backSlug) return 1;
      if (sort === "name") return a.name.localeCompare(b.name);
      return new Date(b.lastOpenedAt ?? 0).getTime() - new Date(a.lastOpenedAt ?? 0).getTime();
    });
  }, [cards, q, sort, backSlug]);

  return (
    <div>
      {/* header + back */}
      <header className="flex items-center gap-3 pb-4">
        <button
          type="button"
          /* No validated card to go back to (e.g. "/" → /cartes, which leaves no
             in-app history): fall back to the first card rather than a dead
             router.back() on a page with no other exit. */
          onClick={() => {
            const target = backSlug ?? shown[0]?.slug ?? cards[0]?.slug;
            if (target) router.push(`/${target}`);
            else router.back();
          }}
          aria-label="Retour"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 active:scale-[0.95]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div>
          <h1 className="text-[24px] font-extrabold leading-tight">Mes cartes</h1>
          <p className="text-[12.5px] text-white/60">
            {cards.length} carte{cards.length === 1 ? "" : "s"} de fidélité
          </p>
        </div>
      </header>

      {/* search */}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher une boutique…"
          inputMode="search"
          className="w-full rounded-2xl border border-white/12 bg-white/[0.08] py-3 pl-10 pr-4 text-[15px] font-medium text-white outline-none transition placeholder:text-white/45 focus:border-white/30"
        />
        <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3.5 text-white/50">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" strokeLinecap="round" />
          </svg>
        </span>
      </div>

      {/* sort */}
      {cards.length > 1 && (
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.08] p-1">
          {(["recent", "name"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className={`rounded-xl py-2 text-[12.5px] font-bold transition ${
                sort === k ? "bg-white text-charcoal shadow-sm" : "text-white/60"
              }`}
            >
              {k === "recent" ? "Récemment ouvertes" : "A → Z"}
            </button>
          ))}
        </div>
      )}

      {/* cards */}
      {shown.length === 0 ? (
        <p className="mt-6 rounded-3xl border border-white/12 bg-white/[0.06] px-6 py-12 text-center text-[13.5px] text-white/60">
          {q ? "Aucune boutique ne correspond." : "Scanne le QR d'un commerce pour ajouter ta première carte."}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((c) => (
            <CardRow key={c.businessId} card={c} current={c.slug === backSlug} />
          ))}
        </ul>
      )}

      {/* The wallet is where a signed-in diner always lands, so it has to be the
          one place that also leads OUT — to the shop-owner side. */}
      <p className="mt-8 text-center text-[11.5px] text-white/40">
        Vous êtes commerçant ?{" "}
        <Link href="/?pro=1" className="font-semibold text-white/70 underline underline-offset-2">
          Espace boutique
        </Link>
      </p>
    </div>
  );
}

function CardRow({ card, current }: { card: WalletCafe; current: boolean }) {
  const t = businessType(card.businessType);
  const pending = card.pendingWins + card.pendingRewards;

  return (
    <li
      className={`rounded-3xl p-4 ring-1 ${current ? "ring-white/40" : "ring-white/12"}`}
      style={{
        backgroundImage: `linear-gradient(150deg, color-mix(in oklab, ${BRAND_COLOR}, #000 12%) 0%, color-mix(in oklab, ${BRAND_COLOR}, #000 50%) 100%)`,
      }}
    >
      <div className="flex items-center gap-3">
        {card.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
          <img src={card.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover ring-1 ring-white/25" />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-[26px] ring-1 ring-white/20">
            {t.emoji}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[16px] font-extrabold">{card.name}</span>
            {current && (
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em] text-charcoal">
                Actuelle
              </span>
            )}
          </div>
          <p className="text-[11.5px] font-semibold text-white/60">
            {t.emoji} {t.label}
          </p>
          <p className="mt-0.5 text-[13px] font-bold text-white/90">
            {card.balance} pts
            {/* only while the shop still runs a stamp card — otherwise this
                points at progress that exists on no screen and can't advance */}
            {card.stampsEnabled && card.stamps > 0 && (
              <span className="font-semibold text-white/60"> · {card.stamps} tampons</span>
            )}
            {pending > 0 && <span className="font-semibold text-[#ffd27a]"> · {pending} code(s)</span>}
          </p>
        </div>
      </div>

      <Link
        href={`/${card.slug}`}
        className="mt-3 block rounded-2xl bg-white py-2.5 text-center text-[13.5px] font-bold text-charcoal active:scale-[0.99]"
      >
        {current ? "Rester sur cette carte" : "Ouvrir"}
      </Link>
    </li>
  );
}
