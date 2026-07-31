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
              Mon code client
            </span>
            <span className="block font-mono text-[15px] font-bold tracking-[0.14em]">
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
        <ul className="space-y-3">
          {shown.map((c) => (
            <CardRow
              key={c.businessId}
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
 * So: a real card ratio (16/9, so two land on a phone screen), a printed face
 * rather than a flat tint, the balance as the hero rather than a right-aligned
 * afterthought, and the shop's own identity where a loyalty card actually carries
 * it — top left, logo then name.
 *
 * EVERY CARD WEARS THE SAME FACE, on purpose. Telling shops apart by colour is
 * tempting and it is a decision already taken against (lib/brand.ts: owners used
 * to recolour their card and the app looked incoherent). Real branded loyalty
 * cards from one issuer look alike too; the logo and the name identify the shop,
 * and one house style is what makes a wallet of six of them look like a wallet.
 */
function CardRow({ card, current, nudge }: { card: WalletCafe; current: boolean; nudge: Nudge }) {
  const t = businessType(card.businessType);
  const pending = card.pendingWins + card.pendingRewards;

  return (
    <li>
      <Link
        href={`/${card.slug}`}
        /*
          A card SHAPE, not a card CAGE.

          aspect-[16/9] plus overflow-hidden looked right and cut its own content
          off. A card carrying the header, the next-reward line and bar, a 38px
          balance, a stamp row AND a pending badge needs about 192px; at 350px
          wide the box is 197 and at 320px it is only 180, so the bottom of a busy
          card was simply sliced away — on exactly the phones most likely to be
          used.

          min-height keeps the proportion as a floor: an ordinary card is still
          16/9, a full one grows a few pixels rather than hiding what it holds.
          The aspect-ratio property stays so the shape survives when there is
          little content, and `h-auto` lets it lose.
        */
        className={`group relative block aspect-[16/9] h-auto min-h-[196px] overflow-hidden rounded-[22px] p-4 transition active:scale-[0.985] ${
          current ? "ring-2 ring-white/45" : "ring-1 ring-white/[0.16]"
        }`}
        style={{
          /*
            A face, not a fill. The first attempt was a 148° gradient with a 20%
            white wash over nearly half the card, and it rendered as one flat
            lilac slab — lighter than the page it sat on, with no sense of a
            surface. Three things fix that and all three are needed:

            160° so the ramp actually crosses a 16/9 box corner to corner rather
            than running almost horizontally; a small tight highlight instead of
            a broad wash, because a light source has a position; and a floor that
            stops ABOVE the page.

            That last one is the one that is easy to get wrong twice. The first
            face was too light and read as a flat lilac slab. The obvious
            correction — make the far end properly dark — was worse in a way that
            is invisible in isolation: at #180f3d the bottom-right corner was
            darker than DINER_BG behind it, so the card dissolved into the page
            exactly where its edge should be. A card is an object because you can
            see where it ends. So the ramp stays inside the card and the RIM does
            the separating: a bright inset top edge and a real shadow underneath.
          */
          backgroundImage: [
            "radial-gradient(78% 62% at 6% -6%, rgba(255,255,255,.26) 0%, rgba(255,255,255,.06) 38%, transparent 62%)",
            "linear-gradient(160deg, #6543d6 0%, #4b2fa9 34%, #33206f 70%, #281a58 100%)",
          ].join(","),
          boxShadow: current
            ? "0 22px 46px -18px rgba(101,67,214,.95), inset 0 1px 0 rgba(255,255,255,.28)"
            : "0 20px 40px -18px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.18)",
        }}
      >
        {/*
          THE WATERMARK IS GONE, and it should be.

          It was a 110px ✦ tucked into the bottom-right corner, added to give a
          half-empty card some texture. Two things happened since: the middle of
          the card filled up with the reward progress, so there is no void left
          to decorate — and the corner it occupied is exactly where the chevron
          lives. Its diagonal edge cut straight through the circle, so the one
          interactive element on the card read as a smudge behind glass rather
          than as a button. Texture is not worth breaking an affordance for.
        */}
        <div className="relative flex h-full flex-col justify-between">
          {/* ── the shop ── */}
          <div className="flex items-start gap-2.5">
            {card.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
              <img src={card.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-white/25" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-[20px] ring-1 ring-white/20">
                {t.emoji}
              </span>
            )}
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="block truncate text-[16px] font-extrabold leading-tight">{card.name}</span>
              <span className="block truncate text-[11px] font-medium text-white/55">{t.label}</span>
            </span>
            {current && (
              <span className="shrink-0 rounded-full bg-white/95 px-2 py-[3px] text-[9px] font-extrabold uppercase tracking-[0.05em] text-charcoal">
                Actuelle
              </span>
            )}
          </div>

          {/*
            THE MIDDLE OF THE CARD.

            It was a void — a 16/9 face with two rows of content and nothing
            between them — and the first attempt filled it with the shop's URL,
            which looked tidy and told the holder nothing. This is the line that
            makes someone open the card: how close they are.

            The bar is what a paper punch card does with holes. Where there is no
            next tier left (they can already afford the best reward), it says so
            instead of drawing an empty rail — a full bar with no target reads as
            a bug.
          */}
          <div className="min-h-[26px]">
            {nudge ? (
              <>
                <p className="truncate text-[11.5px] font-semibold text-white/70">
                  Encore <b className="font-extrabold text-white">{nudge.needed}</b> pour{" "}
                  {nudge.label.toLowerCase()}
                </p>
                <span className="mt-1.5 block h-[5px] overflow-hidden rounded-full bg-black/25">
                  <span
                    className="block h-full rounded-full bg-white/90"
                    style={{
                      width: `${Math.min(100, Math.round((card.balance / nudge.cost) * 100))}%`,
                    }}
                  />
                </span>
              </>
            ) : (
              card.balance > 0 && (
                <p className="text-[11.5px] font-bold text-[#ffd27a]">
                  ✦ Tu peux déjà t&apos;offrir une récompense
                </p>
              )
            )}
          </div>

          {/* ── the balance, which is the only reason to open this card ── */}
          <div className="flex items-end justify-between gap-3">
            <span className="min-w-0">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[38px] font-extrabold leading-none tabular-nums tracking-[-0.02em]">
                  {card.balance}
                </span>
                <span className="text-[12px] font-bold text-white/55">points</span>
              </span>

              {/* Stamps get the row of dots a paper punch card has — the one place
                  where drawing the mechanic beats naming it. Capped at 10 so a
                  long card cannot overflow the face. */}
              {/* Only when there is something to show. A single empty dot beside
                  the word "tampons" was noise on every card whose shop runs
                  stamps but whose holder has not earned one yet. */}
              {card.stampsEnabled && card.stamps > 0 && (
                <span className="mt-2 flex items-center gap-1">
                  {Array.from({ length: Math.min(10, card.stamps) }, (_, i) => (
                    <span
                      key={i}
                      className="h-[7px] w-[7px] rounded-full bg-white"
                    />
                  ))}
                  <span className="ml-1 text-[10.5px] font-semibold text-white/50">
                    {card.stamps} tampon{card.stamps === 1 ? "" : "s"}
                  </span>
                </span>
              )}

              {pending > 0 && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#ffd27a] px-2.5 py-[3px] text-[10.5px] font-extrabold text-[#3a2a06]">
                  🎁 {pending} à récupérer
                </span>
              )}
            </span>

            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.18] text-white ring-1 ring-white/25 transition group-active:bg-white/30">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
