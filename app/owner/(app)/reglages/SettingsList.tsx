"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CardIcon, GiftIcon, Sparkle, StampIcon } from "@/components/icons";
import { fmtPoints } from "@/lib/points";
import type { Cafe, LoyaltyProgram, Reward } from "@/lib/types";
import { CafeForm, EarnForm, RewardsEditor, StampsForm } from "./SettingsForms";

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

type PanelId = "points" | "rewards" | "stamps" | "shop";

export function SettingsList({
  cafe,
  program,
  rewards,
  typeLabel,
}: {
  cafe: Cafe;
  program: LoyaltyProgram;
  rewards: Reward[];
  typeLabel: string;
}) {
  const [open, setOpen] = useState<PanelId | null>(null);

  const cheapest = [...rewards].sort((a, b) => a.pointsCost - b.pointsCost)[0];
  const visible = rewards.filter((r) => r.active).length;

  const PANELS: Record<PanelId, { title: string; sub: string; body: ReactNode }> = {
    points: {
      title: "Les points",
      sub: "Ce que chaque dinar dépensé rapporte à vos clients.",
      body: <div className="mx-auto w-full max-w-[560px]"><EarnForm cafe={cafe} program={program} rewards={rewards} /></div>,
    },
    rewards: {
      title: "Les récompenses",
      sub: "Visez une première récompense atteignable en 2–3 visites.",
      body: <RewardsEditor rewards={rewards} rate={program.pointsPerTnd} />,
    },
    stamps: {
      title: "Carte à tampons",
      sub: "Une visite = un tampon. En plus des points, si vous voulez.",
      body: <div className="mx-auto w-full max-w-[560px]"><StampsForm program={program} /></div>,
    },
    shop: {
      title: "Ma vitrine",
      sub: "Le logo, le nom et le type que voient vos clients.",
      body: <div className="mx-auto w-full max-w-[560px]"><CafeForm cafe={cafe} /></div>,
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
          icon={<GiftIcon className="h-[18px] w-[18px]" />}
          label="Les récompenses"
          value={
            cheapest
              ? `${visible} visible${visible > 1 ? "s" : ""} · dès ${fmtPoints(cheapest.pointsCost)} pts`
              : "aucune"
          }
          warn={!cheapest}
          onClick={() => setOpen("rewards")}
        />
        <Row
          icon={<StampIcon className="h-[18px] w-[18px]" />}
          label="Carte à tampons"
          value={
            program.stampsEnabled ? `${program.stampsRequired} visites` : "désactivée"
          }
          muted={!program.stampsEnabled}
          onClick={() => setOpen("stamps")}
        />
      </Group>

      <Group label="Votre boutique">
        <Row
          icon={<CardIcon className="h-[18px] w-[18px]" />}
          label="Nom, logo & type"
          value={typeLabel}
          onClick={() => setOpen("shop")}
        />
        {/* not editable: changing it would break every printed QR in the shop */}
        <Row label="Adresse de la carte" value={`/${cafe.slug}`} mono />
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

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/40">
        {label}
      </h2>
      <div className="a-card divide-y divide-white/[0.08] overflow-hidden">{children}</div>
    </section>
  );
}

function Row({
  icon,
  label,
  value,
  onClick,
  warn = false,
  muted = false,
  mono = false,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  onClick?: () => void;
  warn?: boolean;
  muted?: boolean;
  mono?: boolean;
}) {
  const inner = (
    <>
      {icon ? (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#6d4ae6] text-white">
          {icon}
        </span>
      ) : (
        <span className="w-8 shrink-0" />
      )}
      <span className="min-w-0 flex-1 text-[14.5px] font-semibold text-white">{label}</span>
      <span
        className={`min-w-0 shrink-0 truncate text-right text-[13px] font-bold ${
          mono ? "font-mono text-[12px]" : ""
        } ${warn ? "text-[#ff9a9a]" : muted ? "text-white/40" : "text-white/60"}`}
      >
        {value}
      </span>
      {onClick && <span className="shrink-0 text-[16px] leading-none text-white/30">›</span>}
    </>
  );

  if (!onClick) return <div className="flex items-center gap-3 px-4 py-3.5">{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-white/[0.05]"
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
    "Caisse · Analyses · QR · Réglages" bleeding through its own background at
    the bottom of the screen. Out at body level there is nothing left to lose
    to.

    No mounted-guard: a Sheet only exists once someone has TAPPED a row, which
    cannot happen on the server — and the usual useState+useEffect dance would
    trip react-hooks/set-state-in-effect anyway.
  */
  return createPortal(
    <section
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="sheet-in fixed inset-0 z-[70] flex flex-col bg-[#0a0614]"
    >
      {/* safe-t, or the title sits under the notch in the installed app */}
      <header className="safe-t border-b border-white/10 px-3 pb-3 [--safe-pt:0.75rem]">
        <div className="mx-auto flex w-full max-w-[900px] items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition active:bg-white/10"
            aria-label="Retour"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="min-w-0">
            <span className="block truncate text-[19px] font-extrabold leading-tight text-white">
              {title}
            </span>
            {/* wraps on a phone rather than truncating — the subtitle is the
                one line telling an owner how to price this, and "…en 2–3 vi…"
                tells them nothing */}
            <span className="block text-[12px] leading-snug text-white/50">{sub}</span>
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
    </section>,
    document.body,
  );
}
