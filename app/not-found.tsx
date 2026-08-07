import Link from "next/link";
import { currentDiner } from "@/lib/auth/diner";
import { dinerWallet } from "@/lib/db";
import { cafeVars } from "@/lib/theme";

export const dynamic = "force-dynamic";

/**
 * ── THE 404, WHICH IS ALMOST ALWAYS SOMEBODY'S CUSTOMER ───────────────────
 *
 * Two things were wrong with it, and the second one matters more.
 *
 * It was the last screen in the old kraft design — paper grain, a torn edge,
 * `bg-paper2` — so the one moment the product goes wrong was also the one
 * moment it looked like a different product.
 *
 * And its only exit was "Retour à l'accueil" → "/", which is the SALES page.
 * Somebody who mistyped one letter of their café's address was handed a pitch
 * for a shop subscription. This app already fixed that exact bug once, in
 * /cartes; the error screen kept doing it.
 *
 * So: if they hold cards, the way out is their wallet, named — "Mes cartes
 * (3)". If they do not, it is the customer front door. The sales page is
 * offered to nobody here, because nobody arrives at a 404 wanting to buy
 * software.
 *
 * ── what it does NOT do ───────────────────────────────────────────────────
 * It does not guess which café they meant. A near-miss suggestion would have to
 * search every shop on the platform from an unauthenticated error page, and a
 * wrong guess sends somebody to a stranger's shop convinced it is theirs. The
 * QR on their own table is right there and is never wrong.
 */
export default async function NotFound() {
  /*
    A diner cookie is read here even though this file sits at the root — the
    note in proxy.ts asks callers to stay inside /moi, /cartes and /[slug], and
    this is the exception it exists for: a 404 caught anywhere in the customer
    app renders THIS screen, and "where do I send you" cannot be answered
    without knowing whether they have anywhere to go.
  */
  const phone = await currentDiner();
  const cards = phone ? await dinerWallet(phone) : [];

  return (
    <div
      className="app-shell app-shell--light d-shell safe-t safe-b flex min-h-dvh flex-col items-center justify-center px-6 text-center [--safe-pb:2rem] [--safe-pt:2rem]"
      style={cafeVars(null)}
    >
      <span
        className="grid h-14 w-14 place-items-center rounded-2xl text-[26px]"
        style={{ background: "var(--cafe-soft)" }}
        aria-hidden
      >
        🔎
      </span>

      <h1 className="mt-5 font-display text-[24px] font-extrabold leading-tight text-charcoal">
        Cette adresse ne mène nulle part
      </h1>
      {/*
        Say what to DO. "Le lien est peut-être incomplet" describes the problem
        and leaves the person holding it — and the fix is a thing they can see
        from where they are standing.
      */}
      <p className="mx-auto mt-2 max-w-[30ch] text-[13.5px] leading-relaxed text-slate">
        Le commerce a peut-être changé d&apos;adresse, ou le lien est incomplet.
        Le QR posé sur la table ouvre toujours la bonne carte.
      </p>

      <div className="mt-7 w-full max-w-[320px] space-y-2.5">
        {cards.length > 0 ? (
          <>
            {/* Their own cards, named and counted — this is a person who has
                somewhere to be, not a stranger who needs the front door. */}
            <Link
              href="/cartes"
              className="block w-full rounded-2xl py-3.5 text-[14.5px] font-bold"
              style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
            >
              Mes cartes ({cards.length})
            </Link>
            {/* the shop they were most recently at — one tap, and usually the
                one they were trying to reach */}
            {cards[0] && (
              <Link
                href={`/${cards[0].slug}`}
                className="d-card block w-full px-4 py-3 text-[13.5px] font-semibold text-charcoal"
              >
                Rouvrir {cards[0].name}
              </Link>
            )}
          </>
        ) : (
          <Link
            href="/moi"
            className="block w-full rounded-2xl py-3.5 text-[14.5px] font-bold"
            style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
          >
            Retrouver mes cartes
          </Link>
        )}
      </div>

      <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">
        ✦ pointili.online
      </p>
    </div>
  );
}
