"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * WHO IS THIS PAGE TALKING TO?
 *
 * It used to answer that question eight separate times, in small print. Every
 * clip in the showcase carried a badge — « Votre caisse » or « Le téléphone du
 * client » — because the page ran both audiences down a single column and had
 * to keep telling you which one you were looking at. A label repeated eight
 * times is not a design; it is an apology for a decision nobody made.
 *
 * So the decision moves to the top, where Earnly puts it: one switch, before
 * anything else, and then the whole page speaks in one voice. The badges are
 * gone because the question is already answered.
 *
 * THE DEFAULT IS THE SHOP OWNER. They are who this page sells to. A customer
 * almost never arrives here at all — they arrive by scanning the QR on their
 * table, which lands them on /[slug], their card, already open. The customer
 * side of this switch exists for the one who heard about it from a friend, or
 * who lost the shop's QR and is looking for their points. That is a real person
 * with a real errand, and the answer they need is short — which is exactly why
 * their side is short, and does not pretend to be a second sales page.
 */

type Side = "owner" | "customer";

const Ctx = createContext<{ side: Side; setSide: (s: Side) => void } | null>(null);

function useAudience() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAudience outside AudienceProvider");
  return ctx;
}

export function AudienceProvider({ children }: { children: ReactNode }) {
  const [side, setSide] = useState<Side>("owner");
  return <Ctx.Provider value={{ side, setSide }}>{children}</Ctx.Provider>;
}

/**
 * The switch itself. A segmented control, not two links: swapping audience is a
 * change of view, not a navigation, and reloading the page to answer "which of
 * you are you" would lose the scroll position of anyone who just wanted a look
 * at the other side.
 */
export function AudienceTabs({
  className = "",
  /** Full labels always. Use where the control has the width — the hero, where
   *  it spans the column — rather than the header, where it shares a row. */
  full = false,
}: {
  className?: string;
  full?: boolean;
}) {
  const { side, setSide } = useAudience();

  /*
    whitespace-nowrap is doing real work: "Pour mon commerce" broke onto two
    lines and "Je suis client" onto three inside the header, which turned the
    most important control on the page into a ragged block of text.

    The labels also shorten below 400px rather than shrink — "Commerce" and
    "Client" stay readable where the full phrases would have to go to 10px.
  */
  /*
    IT HAS TO LOOK LIKE A CONTROL, because it is the most consequential one on
    the page — it rewrites the headline, the steps, the clips and whether the
    price is shown at all.

    It has now been wrong twice in opposite directions. First it was a
    rounded-full rail with the active side filled royal and lifted on a violet
    glow: the stock toggle of every generated landing page. The fix for that
    was a newspaper section-nav — two words in 11px letterspaced uppercase
    mono with a hairline under the active one — and that traded one problem for
    a worse one. Three legibility costs stacked on a single element (small,
    uppercase, wide-set), in grey, on the thing a visitor must read FIRST to
    understand who the page is talking to. It read as a caption, not a switch.

    The house style — "speaks in type, not iconography" — is about section
    labels and eyebrows, which orient you. It was never meant for the things
    you click. So: sentence case at a readable size, a solid fill on the active
    side so the two options cannot be confused at a glance, and a target tall
    enough to hit with a thumb. Flat and square-ish, so it is still this page's
    language and not a pill with a glow under it.

    CHARCOAL, NOT ROYAL, for the active fill. Royal is what this page uses to
    mean "press this" — the two calls to action wear it. A mode switch is not
    an action, and painting it the same colour puts a decoy next to the button
    that actually matters.
  */
  const tab = (s: Side, long: string, short: string) => {
    const on = side === s;
    return (
      <button
        type="button"
        onClick={() => setSide(s)}
        aria-pressed={on}
        className={`whitespace-nowrap rounded-[2px] px-4 py-2 text-[13.5px] font-semibold transition ${
          full ? "flex-1 py-2.5 text-center" : ""
        } ${
          on
            ? "bg-charcoal text-white"
            : "text-slate hover:bg-mist hover:text-charcoal"
        }`}
      >
        {full ? long : (
          <>
            {/* sm is 640px: below it the header has no room for the phrases */}
            <span className="hidden sm:inline">{long}</span>
            <span className="sm:hidden">{short}</span>
          </>
        )}
      </button>
    );
  };

  return (
    /*
      NO display utility in the base class. It used to say `inline-flex` here,
      which then fought the caller's `hidden sm:inline-flex` — two display
      utilities on one element, and whichever Tailwind emitted last won. The
      result was a switch that stayed visible on phones where it was meant to be
      hidden, and pushed the header link 5px off the screen. The caller owns
      display; this owns everything else.
    */
    <div className={`items-center gap-1 rounded-[3px] border border-hair p-1 ${className}`}>
      {tab("owner", "Pour mon commerce", "Commerce")}
      {tab("customer", "Je suis client", "Client")}
    </div>
  );
}

export function ForOwner({ children }: { children: ReactNode }) {
  return useAudience().side === "owner" ? <>{children}</> : null;
}

export function ForCustomer({ children }: { children: ReactNode }) {
  return useAudience().side === "customer" ? <>{children}</> : null;
}

/** For components that need the value rather than a wrapper. */
export function useSide(): Side {
  return useAudience().side;
}
