"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { businessType } from "@/lib/businessTypes";
import type { WalletCafe } from "@/lib/db";
import { fmtPoints } from "@/lib/points";
import { StampIcon } from "@/components/icons";
import { cafeVars } from "@/lib/theme";

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

type FilterKey = "all" | "pending" | "close";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "pending", label: "À récupérer" },
  { key: "close", label: "Presque" },
];

/**
 * "Presque" — within a third of the next reward.
 *
 * A threshold rather than a sort, because the question is "can I get something
 * on my next visit or two?", not "which card is furthest along". A card with no
 * nudge left (they can already afford the top reward) is not "presque" — it is
 * done, and it shows up under À récupérer the moment they take it.
 */
function isClose(card: WalletCafe, nudge: Nudge): boolean {
  if (!nudge || nudge.cost <= 0) return false;
  return card.balance / nudge.cost >= 0.66;
}

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
  const [filter, setFilter] = useState<FilterKey>("all");

  // …and it must be a shop this diner actually holds a card at, so the arrow
  // can never point at an arbitrary route either.
  const backSlug =
    currentSlug && SLUG_RE.test(currentSlug) && cards.some((c) => c.slug === currentSlug)
      ? currentSlug
      : null;

  /* How many cards each filter would show — the chip carries the number, so a
     filter is never a control you press to find out it was empty. */
  const counts = useMemo(
    () => ({
      all: cards.length,
      pending: cards.filter((c) => c.pendingWins + c.pendingRewards > 0).length,
      close: cards.filter((c) => isClose(c, nudges[c.businessId] ?? null)).length,
    }),
    [cards, nudges],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = needle
      ? cards.filter(
          (c) =>
            c.name.toLowerCase().includes(needle) ||
            businessType(c.businessType).label.toLowerCase().includes(needle),
        )
      : [...cards];

    if (filter === "pending") list = list.filter((c) => c.pendingWins + c.pendingRewards > 0);
    if (filter === "close") list = list.filter((c) => isClose(c, nudges[c.businessId] ?? null));

    return list.sort((a, b) => {
      // the card they're on leads, then most recently opened
      if (a.slug === backSlug) return -1;
      if (b.slug === backSlug) return 1;
      return new Date(b.lastOpenedAt ?? 0).getTime() - new Date(a.lastOpenedAt ?? 0).getTime();
    });
  }, [cards, q, backSlug, filter, nudges]);

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
          className="d-card grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate transition active:scale-[0.95]"
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
          <h1 className="truncate whitespace-nowrap text-[21px] font-extrabold leading-tight tracking-[-0.02em] text-charcoal">
            Mes cartes
          </h1>
          <p className="text-[12.5px] text-slate">
            {cards.length} boutique{cards.length === 1 ? "" : "s"}
          </p>
        </div>

        {code && <CodePanel code={code} />}
      </header>

      {/*
        ── FILTERS ────────────────────────────────────────────────────────
        Two questions a wallet is actually asked — "what is waiting for me?"
        and "where am I nearly there?" — and the way back to everything.

        They appear from two cards, because that is the point at which the
        wallet stops being a list you read and starts being one you search.
        Each chip states its own count, so pressing one can never be how you
        discover it was empty; a chip that would show nothing is not rendered
        at all.
      */}
      {cards.length >= 2 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.filter((f) => counts[f.key] > 0 || f.key === "all").map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={on}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition active:scale-[0.97] ${
                  on ? "bg-charcoal text-white" : "d-card text-slate"
                }`}
              >
                {f.label}
                <span className={`ml-1.5 tabular-nums ${on ? "opacity-70" : "opacity-55"}`}>
                  {counts[f.key]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {cards.length >= SEARCH_FROM && (
        <div className="relative mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            inputMode="search"
            className="d-card w-full py-2.5 pl-9 pr-4 text-[16px] font-medium text-charcoal outline-none transition placeholder:text-slate"
          />
          <span className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center pl-3 text-slate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" strokeLinecap="round" />
            </svg>
          </span>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="d-card mt-4 px-6 py-12 text-center text-[13.5px] leading-relaxed text-slate">
          {q
            ? "Aucune boutique ne correspond."
            : filter === "pending"
              ? "Rien à récupérer pour le moment."
              : filter === "close"
                ? "Aucune carte proche de sa récompense."
                : "Scanne le QR d'un commerce pour ajouter ta première carte."}
        </p>
      ) : (
        /* TWO PER ROW. One card per line made a three-shop wallet a page you
           scroll, and every card was 100px of mostly-empty white under a
           balance. Two columns fit a real wallet on one screen — which is the
           only way the screen answers "which of my cards is this?" at a
           glance. */
        <ul className="stagger grid grid-cols-2 gap-2.5">
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
      <p className="mt-auto pt-10 text-center text-[11.5px] text-slate">
        Vous êtes commerçant ?{" "}
        <Link href="/?pro=1" className="font-semibold text-charcoal underline underline-offset-2">
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
 * EVERY CARD WEARS ITS OWN SHOP'S COLOUR.
 *
 * That is a reversal, and a deliberate one. The rule used to be one house face
 * for every card, because owners recolouring their card made the app look
 * incoherent — a fixed purple nav against an arbitrary tile. The nav is not
 * fixed any more: the whole client app is white and takes its accent from
 * whichever shop you are inside, so a wallet of coloured cards on white is the
 * consistent thing rather than the incoherent one.
 *
 * And it is what a wallet is FOR. Six identical purple rectangles told you
 * nothing until you read them; six cards in six shops' colours are findable at
 * a glance, which is exactly how a real wallet works.
 *
 * The shape stays one house style — a coloured header band, a white body with
 * the balance — so it still reads as one product issuing six cards.
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
      className="d-card shrink-0 rounded-xl px-3 py-1.5 text-center transition active:scale-[0.97]"
    >
      <span className="block text-[8.5px] font-bold uppercase tracking-[0.08em] text-slate">
        Mon code client
      </span>
      <span className="mt-0.5 flex items-center justify-center gap-1.5">
        <span className="font-mono text-[15.5px] font-bold tracking-[0.12em] text-charcoal">{code}</span>
        {copied ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-ok">
            <path d="m5 13 4 4L19 7" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-slate">
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
    <li style={{ ["--i" as string]: index, ...cafeVars(card.primaryColor) }}>
      <Link
        href={`/${card.slug}`}
        /*
          w-full is load-bearing: aspect-ratio plus a definite min-height used to
          produce a TRANSFERRED MINIMUM width (196 × 16/9 = 348px) that beat the
          column on any phone under ~390px, pushing the chevron off the screen.
          There is no aspect-ratio here any more — the card is as tall as it
          needs to be — but the width stays explicit so it cannot come back.
        */
        /* The whole card is the target now — the chevron went with the row
           layout, and at half width a 36px arrow was competing with the
           balance for the same corner. */
        className="d-card group relative block h-full w-full overflow-hidden transition active:scale-[0.985]"
        /* The card you are currently inside is outlined in its own colour —
           the only difference between cards, since every one of them is already
           wearing a different hue. */
        style={current ? { borderColor: "var(--cafe)", boxShadow: "0 0 0 1px var(--cafe)" } : undefined}
      >
        {/*
          ── THE SHOP, ON ITS OWN COLOUR ────────────────────────────────
          Half the width now, so everything that was a row is a stack: the
          mark centred over the name rather than beside it, the balance under
          it rather than across from it. Nothing was dropped — a wallet card
          answers "whose, how much, anything waiting?" and all three survive
          at 175px.
        */}
        <div className="d-banner relative px-3 pb-3 pt-3.5">
          {current && (
            /* A dot, not a pill: "ACTUELLE" spelled out took the whole width a
               shop name needs at this size. The ring is the tell. */
            <span
              aria-label="Carte actuelle"
              className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--cafe-ink)" }}
            />
          )}

          {card.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
            <img
              src={card.logoUrl}
              alt=""
              className="h-[38px] w-[38px] rounded-full object-cover"
              style={{ boxShadow: "0 0 0 2px color-mix(in oklab, var(--cafe-ink) 28%, transparent)" }}
            />
          ) : (
            <span
              className="grid h-[38px] w-[38px] place-items-center rounded-full text-[17px]"
              style={{ background: "color-mix(in oklab, var(--cafe-ink) 16%, transparent)" }}
            >
              {t.emoji}
            </span>
          )}

          <span className="mt-2 block text-[14px] font-extrabold leading-tight line-clamp-2">
            {card.name}
          </span>
          <span className="block truncate text-[11px] font-medium opacity-70">{t.label}</span>
        </div>

        <div className="px-3 pb-3 pt-2.5">
          <span className="flex items-baseline gap-1.5">
            <span
              className="text-[24px] font-extrabold leading-none tabular-nums tracking-[-0.03em]"
              style={{ color: "var(--cafe-text)" }}
            >
              {fmtPoints(card.balance)}
            </span>
            <span className="text-[11.5px] font-bold text-slate">points</span>
          </span>

          {nudge && (
            <>
              <span className="mt-2 block h-[5px] overflow-hidden rounded-full bg-[#eceaf1]">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.round((card.balance / nudge.cost) * 100))}%`,
                    background: "var(--cafe)",
                  }}
                />
              </span>
              {/* two lines allowed: the prize is the reason to open this card,
                  and "Encore 155 pour brunch com…" names nothing */}
              <span className="mt-1.5 block text-[11px] leading-snug text-slate line-clamp-2">
                Encore <b className="font-extrabold text-charcoal">{fmtPoints(nudge.needed)}</b> pour{" "}
                {nudge.label.toLowerCase()}
              </span>
            </>
          )}

          {/*
            The stamp count as ONE line, not a row of dots — the wallet only has
            to answer "how am I doing here", and a number does that.
          */}
          {card.stampsEnabled && card.stamps > 0 && (
            <span className="mt-1.5 flex items-center gap-1 text-[11px] text-slate">
              <StampIcon className="h-[13px] w-[13px]" />
              <b className="font-extrabold text-charcoal">{card.stamps}</b> tampon
              {card.stamps > 1 ? "s" : ""}
            </span>
          )}

          {pending > 0 && (
            <span className="mt-2 flex w-full items-center justify-center gap-1 rounded-full bg-gold-soft px-2 py-1 text-[10.5px] font-extrabold text-gold-deep">
              🎁 {pending} à récupérer
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
