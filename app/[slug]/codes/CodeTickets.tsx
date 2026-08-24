"use client";

import { useEffect, useState } from "react";
import { GiftIcon } from "@/components/icons";
import { translator, type Lang } from "@/lib/dict";

/**
 * ONE QR ON THE SCREEN AT A TIME.
 *
 * This list used to print every pending code as a full ticket, QR and all,
 * stacked down the page. On a customer with three rewards that is three
 * scannable pictures inside a few centimetres of glass — and a camera does not
 * ask which one you meant. It locks onto whichever it resolves first, so the
 * cashier collects a reward the customer was not offering, the right one stays
 * unspent, and the only person who can tell you what happened is the till's
 * journal.
 *
 * That is a counter problem, not a layout preference. So the page is a LIST of
 * what is waiting — what it is, and its six characters — and the picture only
 * exists once somebody has chosen a reward and opened it. Nothing scannable is
 * ever beside anything else scannable.
 *
 * ── AND IT WATCHES ITSELF BE COLLECTED ────────────────────────────────────
 *
 * The card polls while it is open (components/LivePoints), so the moment the
 * cashier claims the code the server list loses it and this component is handed
 * new props. Rather than the open sheet blinking out from under the customer's
 * thumb, it says "Récupéré" with a tick and then closes. Both people watching
 * the phone see the same thing happen at the same time, which is the whole
 * point of holding it up.
 */

/* The French here is also the dictionary key — see lib/dict. */
const KIND_LABEL: Record<string, string> = {
  win: "Gain",
  reward: "Récompense",
  stamp: "Carte pleine",
};

export type Ticket = {
  code: string;
  label: string;
  kind: string;
  /** The QR as inline SVG, drawn on the server so there is no flash. */
  qr: string;
};

export function CodeTickets({ codes, lang }: { codes: Ticket[]; lang: Lang }) {
  const t = translator(lang);
  /*
    The whole TICKET is held, not its code.

    It has to outlive the list: the moment the counter claims it the server
    stops sending it, and a sheet that looked its subject up by id would find
    nothing and blink out from under the customer's thumb — which is the one
    frame where they most want to be told what happened.
  */
  const [open, setOpen] = useState<Ticket | null>(null);

  /*
    DERIVED, not stored. "It was taken" is exactly "the open one is no longer in
    the list the server sent", and keeping a second copy of that in state means
    an effect that calls setState on every refresh — a cascade React rightly
    complains about, and a flag that can disagree with the list it describes.
  */
  const collected = open !== null && !codes.some((c) => c.code === open.code);

  /* The only thing that needs an effect: letting the tick be read before the
     sheet goes. */
  useEffect(() => {
    if (!collected) return;
    const id = setTimeout(() => setOpen(null), 1800);
    return () => clearTimeout(id);
  }, [collected]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  if (codes.length === 0) {
    return (
      <div className="d-card px-6 py-12 text-center">
        <span
          className="mx-auto grid h-12 w-12 place-items-center rounded-2xl"
          style={{ background: "var(--cafe-soft)", color: "var(--cafe-text)" }}
        >
          <GiftIcon className="h-6 w-6" />
        </span>
        <p className="mt-3 text-[14px] font-bold text-charcoal">{t("Aucun code en attente")}</p>
        <p className="mx-auto mt-1 max-w-[28ch] text-[13px] text-slate">
          {t("Échange tes points dans les Récompenses — le code apparaîtra ici.")}
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="stagger space-y-2.5">
        {codes.map((c, i) => (
          <li key={c.code} style={{ ["--i" as string]: i }}>
            <button
              type="button"
              onClick={() => setOpen(c)}
              className="d-card flex w-full items-center gap-3 px-4 py-3.5 text-start transition active:scale-[0.99]"
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                style={{ background: "var(--cafe-soft)", color: "var(--cafe-text)" }}
              >
                <GiftIcon className="h-[22px] w-[22px]" />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className="block text-[10.5px] font-bold uppercase tracking-[0.06em]"
                  style={{ color: "var(--cafe-text)" }}
                >
                  {t(KIND_LABEL[c.kind] ?? "Récompense")}
                </span>
                <span className="block truncate text-[15px] font-bold text-charcoal">{t(c.label)}</span>
                {/* dir=ltr: six Latin characters with trailing letter-spacing,
                    which RTL would put on the wrong side of the last glyph. */}
                <span
                  dir="ltr"
                  className="mt-0.5 block font-mono text-[13px] font-bold tracking-[0.14em] text-slate rtl:text-right"
                >
                  {c.code}
                </span>
              </span>

              {/* The affordance has to say PICTURE, or nobody taps a row that
                  already shows the code they think they need to read out. */}
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                style={{ background: "var(--cafe-soft)", color: "var(--cafe-text)" }}
                aria-hidden
              >
                <QrGlyph />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t(open.label)}
          onClick={() => setOpen(null)}
          className="ticket-veil fixed inset-0 z-50 flex overflow-y-auto px-5 py-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ticket-sheet m-auto w-full max-w-[360px] overflow-hidden rounded-[26px] bg-white shadow-[0_30px_80px_-30px_rgba(23,18,31,.5)]"
          >
            <div className="relative px-5 pb-4 pt-5 text-center" style={{ background: "var(--cafe-soft)" }}>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label={t("Fermer")}
                className="absolute end-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/80 text-[19px] leading-none text-charcoal active:scale-95"
              >
                ×
              </button>
              <p
                className="text-[10.5px] font-bold uppercase tracking-[0.08em]"
                style={{ color: "var(--cafe-text)" }}
              >
                {t(KIND_LABEL[open.kind] ?? "Récompense")}
              </p>
              <p className="mx-auto mt-1 max-w-[22ch] text-[18px] font-extrabold leading-tight text-charcoal">
                {t(open.label)}
              </p>
            </div>

            <div aria-hidden className="border-t-2 border-dashed" style={{ borderColor: "var(--cafe-line)" }} />

            {collected ? (
              /* The counter took it while this was open — see the note above. */
              <div className="px-5 py-10 text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#2f9e6e] text-white">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                </span>
                <p className="mt-3 text-[17px] font-extrabold text-[#2f9e6e]">{t("Récupéré")}</p>
              </div>
            ) : (
              <div className="px-5 py-5 text-center">
                {/* The one scannable thing on the screen. */}
                <div
                  className="mx-auto w-[212px] max-w-full [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: open.qr }}
                />
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-slate">
                  {t("À scanner au comptoir")}
                </p>
                {/* kept, and kept BIG: a scratched lens, a dead battery, a shop
                    whose only phone is in someone's pocket */}
                <p
                  dir="ltr"
                  className="mt-1 font-mono text-[30px] font-extrabold leading-none tracking-[0.16em]"
                  style={{ color: "var(--cafe-text)" }}
                >
                  {open.code}
                </p>
                <p className="mt-2 text-[11.5px] leading-snug text-slate">
                  {t("Ou dicte le code — les deux marchent.")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** A QR, drawn small — the row's promise of what opening it gives you. */
function QrGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h7" />
    </svg>
  );
}
