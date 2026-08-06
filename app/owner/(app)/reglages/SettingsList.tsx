"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CardIcon, GiftIcon, Sparkle, StampIcon, WheelIcon } from "@/components/icons";
import { fmtPoints } from "@/lib/points";
import { visitsForPoints, type Ticket } from "@/lib/rewards";
import type { Cafe, Game, LoyaltyProgram, Reward } from "@/lib/types";
import { CafeForm, EarnForm, PrizesEditor, RewardsEditor, StampsForm, WheelForm } from "./SettingsForms";
import { ThemeForm } from "./ThemeForm";

/** What the row says the theme currently is, without opening it. */
const THEME_VALUE: Record<string, string> = {
  flat: "couleur unie",
  gradient: "dégradé",
  photo: "photo",
};

/** Three swatches on a page — enough to say "this row is about how it looks". */
function PaletteIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.8-1.7H16a5 5 0 0 0 5-5c0-3.9-4-7.2-9-7.2Z" />
      <circle cx="7.5" cy="11.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="9" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/*
  Réglages as a SETTINGS LIST, not a page of forms.

  The old page stacked every form open at once: four Save buttons on screen, a
  page you had to scroll to find out what your own programme did. A settings
  screen has one job — tell you the current value of everything at a glance, and
  let you change exactly one thing at a time.

  So each line states its value ("1 point par dinar", "Désactivée") and opens a
  focused editor that fills the screen. One subject, one Save, no scrolling past
  things you did not come here to touch.
*/

type PanelId = "points" | "rewards" | "stamps" | "wheel" | "shop" | "theme";

export function SettingsList({
  cafe,
  program,
  rewards,
  game,
  typeLabel,
  ticket,
}: {
  cafe: Cafe;
  program: LoyaltyProgram;
  rewards: Reward[];
  /** The wheel, returned even when off or empty, so the toggle is reachable. */
  game: Game | null;
  typeLabel: string;
  /** What one visit is worth here — rewards are priced in visits now. */
  ticket: Ticket;
}) {
  const [open, setOpen] = useState<PanelId | null>(null);

  /* The cheapest VISIBLE one, to match what the editor marks as "1re" — a
     masked reward is not something any customer is working towards. */
  const shown = rewards.filter((r) => r.active);
  const cheapest = [...shown].sort((a, b) => a.pointsCost - b.pointsCost)[0];

  /*
    Is each optional mechanic actually running? Computed as the VALUE LINE
    rather than a boolean, so the row never has to reach back into a possibly
    null `game` to describe itself.

    "The wheel is on" needs prizes as well as the toggle: an active wheel with
    an empty prize list shows a customer nothing, so it is not on.
  */
  const stampsValue = program.stampsEnabled ? `${program.stampsRequired} visites` : null;
  const wheelValue =
    game && game.active && game.prizes.length > 0
      ? `${game.prizes.length} lot${game.prizes.length > 1 ? "s" : ""} · ${game.spinCost} pts le tour`
      : null;

  const PANELS: Record<PanelId, { title: string; sub: string; body: ReactNode }> = {
    points: {
      title: "Les points",
      sub: "Ce que chaque dinar dépensé rapporte à vos clients.",
      body: <div className="mx-auto w-full max-w-[560px]"><EarnForm cafe={cafe} program={program} rewards={rewards} /></div>,
    },
    rewards: {
      title: "Les récompenses",
      sub: "La première doit être facile — 2 ou 3 visites.",
      body: <RewardsEditor rewards={rewards} ticket={ticket} businessType={cafe.businessType} />,
    },
    stamps: {
      title: "Carte à tampons",
      sub: "Une visite = un tampon. En plus des points, si vous voulez.",
      body: <div className="mx-auto w-full max-w-[560px]"><StampsForm program={program} /></div>,
    },
    wheel: {
      title: "La roue",
      sub: "Vos clients paient des points pour tourner. Tirage au hasard, à parts égales.",
      body: (
        <div className="mx-auto w-full max-w-[560px]">
          {/* the lots render INSIDE the form, between the switch and the price
              — one screen, one Enregistrer, at the bottom (see WheelForm) */}
          <WheelForm game={game} prizes={<PrizesEditor game={game} />} />
        </div>
      ),
    },
    shop: {
      title: "Ma vitrine",
      sub: "Le logo, le nom et le type que voient vos clients.",
      body: <div className="mx-auto w-full max-w-[560px]"><CafeForm cafe={cafe} /></div>,
    },
    theme: {
      title: "Le thème",
      sub: "La couleur, l'en-tête et le style de la carte de vos clients.",
      /* wider than the other editors: at lg the form is preview + controls side
         by side (see ThemeForm), and 560 would squeeze both into nothing */
      body: <div className="mx-auto w-full max-w-[560px] lg:max-w-[820px]"><ThemeForm cafe={cafe} /></div>,
    },
  };

  return (
    <>
      <Group label="Votre programme">
        <Row
          icon={<Sparkle className="h-[18px] w-[18px]" />}
          label="Les points"
          value={`${fmtPoints(program.pointsPerTnd)} pt${program.pointsPerTnd > 1 ? "s" : ""} par dinar`}
          onClick={() => setOpen("points")}
        />
        <Row
          /*
            THE ROW SHOWS THE REWARDS IT MANAGES.

            "4 · dès 16 visites" is accurate and says nothing about what those
            four ARE — and the reward ladder is the thing an owner opens this
            screen to change. The photographs are already in the database; three
            of them on the row turn a count into the actual menu.
          */
          bare={shown.some((r) => r.imageUrl)}
          icon={
            shown.some((r) => r.imageUrl) ? (
              <span className="flex -space-x-2">
                {shown
                  .filter((r) => r.imageUrl)
                  .slice(0, 3)
                  .map((r) => (
                    // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
                    <img
                      key={r.id}
                      src={r.imageUrl!}
                      alt=""
                      className="h-7 w-7 rounded-full object-cover ring-2 ring-[var(--o-panel)]"
                    />
                  ))}
              </span>
            ) : (
              <GiftIcon className="h-[18px] w-[18px]" />
            )
          }
          label="Les récompenses"
          /* "dès 3 visites" rather than "dès 40 pts" — the row has to answer
             the same question the editor now asks, or the two disagree about
             what a reward even costs. */
          /* The COUNT left this line when the thumbnails arrived: three faces
             plus "4 · dès 16 visites" did not fit, and it truncated to "dès 16
             v…", losing the half that carries the meaning. The pictures say how
             many there are; the value says the one thing they cannot. */
          value={
            cheapest ? `dès ${visitsForPoints(cheapest.pointsCost, ticket)} visites` : "aucune"
          }
          warn={!cheapest}
          onClick={() => setOpen("rewards")}
        />
        {/* An extra that is switched ON is part of the programme, not an extra
            any more — so it sits here, stating its value, like everything else. */}
        {stampsValue && (
          <Row
            icon={<StampIcon className="h-[18px] w-[18px]" />}
            label="Carte à tampons"
            value={stampsValue}
            onClick={() => setOpen("stamps")}
          />
        )}
        {wheelValue && (
          <Row
            icon={<WheelIcon className="h-[18px] w-[18px]" />}
            label="La roue"
            value={wheelValue}
            onClick={() => setOpen("wheel")}
          />
        )}
      </Group>

      {/*
        Tampons and la roue, folded away until somebody wants them.

        Both ship OFF. A brand-new owner opened Réglages and met four mechanics
        — points, récompenses, tampons, roue — two of them reading "désactivée",
        and had to work out which of the four their shop was actually running
        before changing anything. Two of those rows were answering a question
        nobody had asked yet.

        They are not removed and not hidden: the moment either is switched on it
        moves up into the programme above, because then it IS the programme.
      */}
      {(!stampsValue || !wheelValue) && (
        <details className="group">
          <summary className="a-card flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--o-inset)] text-[17px] leading-none text-slate">
              +
            </span>
            <span className="min-w-0 flex-1 text-[15px] font-semibold text-charcoal">
              Ajouter autre chose
            </span>
            <span className="shrink-0 text-[17px] leading-none text-slate transition group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="a-card mt-1.5 divide-y divide-[var(--o-edge)] overflow-hidden">
            {!stampsValue && (
              <Row
                icon={<StampIcon className="h-[18px] w-[18px]" />}
                label="Carte à tampons"
                value="une visite = un tampon"
                muted
                onClick={() => setOpen("stamps")}
              />
            )}
            {!wheelValue && (
              <Row
                icon={<WheelIcon className="h-[18px] w-[18px]" />}
                label="La roue"
                value="ils paient des points pour tourner"
                muted
                onClick={() => setOpen("wheel")}
              />
            )}
          </div>
        </details>
      )}

      <Group label="Votre boutique">
        <Row
          icon={<CardIcon className="h-[18px] w-[18px]" />}
          label="Nom, logo & type"
          value={typeLabel}
          onClick={() => setOpen("shop")}
        />
        <Row
          icon={<PaletteIcon className="h-[18px] w-[18px]" />}
          label="Le thème"
          value={THEME_VALUE[cafe.designSettings.theme.banner] ?? "dégradé"}
          onClick={() => setOpen("theme")}
        />
        {/*
          NOT EDITABLE — changing it would break every printed QR in the shop —
          but the two things an owner actually wants to DO with it are copy it
          and look at it. It was a dead row: the shop's own public address,
          truncated to "/boulangerie-ess…", in a list where every other row
          opens something.
        */}
        <CardAddress slug={cafe.slug} />
      </Group>

      {open && (
        <Sheet
          title={PANELS[open].title}
          sub={PANELS[open].sub}
          onClose={() => setOpen(null)}
        >
          {PANELS[open].body}
        </Sheet>
      )}
    </>
  );
}

/* ── the list ─────────────────────────────────────────────────────────── */

/**
 * The shop's public address — copyable, and openable.
 *
 * It is the link an owner pastes into their Instagram bio, sends to a customer
 * who lost the QR, and checks when they want to see what the card looks like.
 * As a plain row it did none of those: it was truncated, unselectable, and
 * inert. Two targets now, both labelled, and the full address is shown rather
 * than cut — at 12px it fits.
 */
function CardAddress({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `pointili.online/${slug}`;

  return (
    /*
      TWO LINES, not one.

      Squeezed onto a single row beside two buttons the address truncated to
      "pointili.o…" — which is less use than the "/boulangerie-ess…" it
      replaced. The label and the actions share the top line; the address gets
      the full width underneath, where it fits whole.
    */
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0" />
        <span className="min-w-0 flex-1 whitespace-nowrap text-[14.5px] font-semibold text-charcoal">
          Adresse de la carte
        </span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(`https://${url}`).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              },
              () => {},
            );
          }}
          aria-label="Copier l'adresse de la carte"
          className="shrink-0 rounded-lg bg-[var(--o-inset)] px-2.5 py-1.5 text-[11px] font-bold text-slate transition active:scale-95"
        >
          {copied ? "Copié ✓" : "Copier"}
        </button>
        <a
          href={`https://${url}`}
          target="_blank"
          rel="noopener"
          aria-label="Ouvrir la carte"
          className="shrink-0 rounded-lg bg-[var(--o-inset)] px-2.5 py-1.5 text-[11px] font-bold text-slate transition active:scale-95"
        >
          Ouvrir
        </a>
      </div>

      {/* select-all: the other way anyone copies a URL is by long-pressing it */}
      <p className="mt-1 select-all break-all pl-10 font-mono text-[12px] text-slate">{url}</p>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate">
        {label}
      </h2>
      <div className="a-card divide-y divide-[var(--o-edge)] overflow-hidden">{children}</div>
    </section>
  );
}

function Row({
  icon,
  bare = false,
  label,
  value,
  onClick,
  warn = false,
  muted = false,
  mono = false,
}: {
  icon?: ReactNode;
  /** Render the icon as-is, without the brand tile behind it. */
  bare?: boolean;
  label: string;
  value: string;
  onClick?: () => void;
  warn?: boolean;
  muted?: boolean;
  mono?: boolean;
}) {
  const inner = (
    <>
      {/* `bare` skips the purple tile: a row whose icon IS a photograph (the
          reward thumbnails) must not have it crushed inside a 32px swatch. */}
      {icon ? (
        bare ? (
          <span className="shrink-0">{icon}</span>
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#5b3fd1] text-white">
            {icon}
          </span>
        )
      ) : (
        <span className="w-8 shrink-0" />
      )}
      {/*
        THE LABEL NEVER WRAPS, THE VALUE GIVES WAY.

        Both sides were flexible, so "Les récompenses" and "6 visibles · dès 5
        visites" fought over one 390px row and the LABEL lost — it broke onto
        two lines while the value stayed whole, which is backwards. A settings
        row is read left to right: the name of the thing is the part that has
        to survive, and the value is the part that can shorten to an ellipsis.
      */}
      <span className="shrink-0 whitespace-nowrap text-[14.5px] font-semibold text-charcoal">
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-right text-[12.5px] font-bold ${
          mono ? "font-mono text-[12px]" : ""
        } ${warn ? "text-[#e5484d]" : muted ? "text-slate" : "text-slate"}`}
      >
        {value}
      </span>
      {onClick && <span className="shrink-0 text-[17px] leading-none text-slate">›</span>}
    </>
  );

  if (!onClick) return <div className="flex items-center gap-3 px-4 py-3.5">{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-[var(--o-inset)]"
    >
      {inner}
    </button>
  );
}

/* ── one subject, filling the screen ─────────────────────────────────── */

function Sheet({
  title,
  sub,
  onClose,
  children,
}: {
  title: string;
  sub: string;
  onClose: () => void;
  children: ReactNode;
}) {
  /*
    PORTALLED to <body>, not rendered in place.

    The owner tab bar carries backdrop-blur, and backdrop-filter creates its own
    stacking context — so a z-50 sheet nested inside the layout still had
    "Caisse · Clients · Réglages" bleeding through its own background at the
    bottom of the screen. Out at body level there is nothing left to lose to.

    No mounted-guard: a Sheet only exists once someone has TAPPED a row, which
    cannot happen on the server — and the usual useState+useEffect dance would
    trip react-hooks/set-state-in-effect anyway.
  */
  return createPortal(
    /*
      A SHEET ON A PHONE, A DIALOG ON A MONITOR.

      Full-bleed white is the right answer at 390px: the editor IS the screen.
      At 1440 it was a wall — the whole display painted over to change one
      number, with the list you were working through gone. So at lg the same
      markup sits in a centred panel with the page dimmed behind it, and you
      can still see what you came from. Tapping the dim closes it, like every
      other dialog anyone has used.
    */
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[70] flex lg:items-center lg:justify-center lg:bg-[#1a1128]/30 lg:p-8 lg:backdrop-blur-[2px]"
    >
    <section
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="sheet-in flex min-h-0 flex-1 flex-col overflow-hidden bg-[#ffffff] lg:max-h-[86vh] lg:w-full lg:max-w-[860px] lg:flex-none lg:rounded-[28px] lg:shadow-[0_30px_80px_rgba(26,17,40,0.28)]"
    >
      {/* safe-t, or the title sits under the notch in the installed app */}
      <header className="safe-t border-b border-[var(--o-edge)] px-3 pb-3 [--safe-pt:0.75rem]">
        <div className="mx-auto flex w-full max-w-[900px] items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-charcoal transition active:bg-[var(--o-inset)]"
            aria-label="Retour"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="min-w-0">
            <span className="block truncate text-[20px] font-extrabold leading-tight text-charcoal">
              {title}
            </span>
            {/* wraps on a phone rather than truncating — the subtitle is the
                one line telling an owner how to price this, and "…en 2–3 vi…"
                tells them nothing */}
            <span className="block text-[12px] leading-snug text-slate">{sub}</span>
          </span>
        </div>
      </header>
      {/*
        900px, not 560. The rewards catalogue is a table in all but name — photo,
        name, state, cost, two actions — and at 560 those columns collapsed into
        a stack that read as five unrelated controls. The other editors are
        single-column forms and keep their own narrower cap inside.
      */}
      <div className="safe-b mx-auto min-h-0 w-full max-w-[900px] flex-1 overflow-y-auto [--safe-pb:2.5rem]">
        {children}
      </div>
    </section>
    </div>,
    document.body,
  );
}
