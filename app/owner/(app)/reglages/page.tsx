import Link from "next/link";
import { redirect } from "next/navigation";
import { currentOwner, ownerCafe, ownerHome } from "@/lib/auth/owner";
import { businessType } from "@/lib/businessTypes";
import { getLoyaltyProgram, getOwnerGame, getRewards } from "@/lib/data";
import { cafeAvgTicket } from "@/lib/db";
import { remaining } from "@/lib/platform";
import { logoutAction } from "../../(auth)/login/actions";
import { SettingsList } from "./SettingsList";
import { BackLink } from "@/components/BackLink";

export const metadata = { title: "Réglages" };

const PLAN_LABEL: Record<string, string> = { trial: "Essai", pro: "Pro", free: "Gratuite" };

/**
 * Réglages — a settings LIST, not a page of forms.
 *
 * This page only states the shop's identity and account; every knob lives one
 * tap deeper, in a focused editor. See SettingsList for why.
 */
export default async function Reglages() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a valid session
  // and bounce straight back here, forever.
  if (!cafe) redirect(await ownerHome());

  const left = remaining(cafe.planExpiresAt);
  const [owner, program, rewards, game, ticket] = await Promise.all([
    currentOwner(),
    getLoyaltyProgram(cafe.id),
    getRewards(cafe.id),
    // getOwnerGame, not getGame: it returns the wheel even when off or empty,
    // which is the only way the toggle is reachable at all.
    getOwnerGame(cafe.id),
    // Rewards are priced in VISITS now, and a visit is worth what THIS shop's
    // customers spend — 2,5 DT in a café, 30 DT at a hairdresser.
    cafeAvgTicket(cafe.id),
  ]);
  const type = businessType(cafe.businessType);

  return (
    /*
      data-owner-wide: on a laptop this screen was a 680px ribbon of rows with
      half the display empty beside it, and the account — plan, prices, the way
      out — was below the fold under every knob. Two columns at lg put the
      settings on the left and the account on the right, both above the fold.
      The phone is untouched; the widening rule is a min-width:1024px query.
    */
    <div data-owner-wide className="space-y-4">
      {/* Phone only: at md+ the sidebar is the way back, and a chevron beside a
          permanent nav is noise. */}
      <div className="px-1 md:hidden">
        <BackLink fallback="/owner" />
      </div>

      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_324px] lg:items-start lg:gap-5 lg:space-y-0">
      <div className="space-y-4">
      {/*
        ── ONE CARD THAT ANSWERS "IS MY SHOP RUNNING?" ────────────────────
        The screen used to open with a bare identity ROW — logo, name, address —
        and then jump straight into knobs, while the state of the account (live?
        expiring? which plan?) sat at the very bottom under everything an owner
        might scroll past. So the first thing Réglages said was "here is your
        name", and the thing an owner actually opens it to check was last.

        Identity and state are one fact: this is your shop, and this is whether
        your customers can use it today.
      */}
      <section className="a-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 pb-3.5 pt-4">
          {/* Logo, or the shop's initial — never the business-type emoji. The
              "Autre" fallback is ✨, so every untyped shop wore a sparkle on its
              own admin screens as if it were branding. */}
          {cafe.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
            <img src={cafe.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#5b3fd1] text-[18px] font-extrabold text-white">
              {cafe.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-extrabold leading-tight text-charcoal">
              {cafe.name}
            </h1>
            {/*
              THE SUBTITLE IS GONE, and both halves of it are still on screen.

              It read "{type} · pointili.online/{slug}", and this card's own job
              — stated above — is "this is your shop, and this is whether your
              customers can use it today". The type is neither; it is the value
              of the "Nom, logo & type" row below. The address is the "Adresse
              de la carte" row below, where it is selectable, copyable and
              openable rather than truncated and inert.

              On desktop all three sat in one viewport, so the screen said the
              shop's URL twice and its type twice, and the copy an owner could
              not use came first.
            */}
          </div>
          <span
            className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${
              cafe.live ? "bg-ok/10 text-[#2f9e6e]" : "bg-[#e5484d]/12 text-[#e5484d]"
            }`}
          >
            {cafe.live ? "En ligne" : "Hors ligne"}
          </span>
        </div>

        {/* the plan, on the same card — a shop's state is one sentence, not two
            sections a screen apart */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--o-edge)] px-4 py-3">
          <span className="min-w-0 text-[13px] text-slate">
            Formule{" "}
            <b className="font-bold text-charcoal">{PLAN_LABEL[cafe.plan] ?? cafe.plan}</b>
            {cafe.planExpiresAt && (
              <>
                {" · "}
                {left.expired ? "expirée le " : "jusqu'au "}
                {new Date(cafe.planExpiresAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                })}
              </>
            )}
          </span>
          <span
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-bold ${
              left.expired
                ? "bg-[#e5484d]/12 text-[#e5484d]"
                : left.soon && !left.unlimited
                  ? "bg-[#a06e00]/12 text-[#a06e00]"
                  : "bg-[var(--o-inset)] text-slate"
            }`}
          >
            {left.label}
          </span>
        </div>
      </section>

      <SettingsList
        cafe={cafe}
        program={program}
        rewards={rewards}
        game={game}
        typeLabel={type.label}
        ticket={ticket}
      />
      </div>

      {/*
        The account column — what you pay, and the way out.

        It gets a heading for the same reason the two groups beside it have
        one. Without it these were three unlabelled objects — a price fold, a
        sign-out button and an email — stacked against the top of a column with
        nothing tying them together, reading as leftovers that fitted nowhere
        else rather than as a section about the account. Same type as
        "VOTRE PROGRAMME" and "VOTRE BOUTIQUE", because it is the same rank.
      */}
      <div className="space-y-4">
      <h2 className="mb-1.5 px-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate">
        Votre compte
      </h2>
      {/*
        The prices, in the product — but not in the way.

        The banners upstairs say "your shop is about to go dark" and there has to
        be somewhere to go from there. This is not a checkout: there is no
        payment integration and inventing one would be a much bigger change than
        the problem needs. What an owner lacks at that moment is the two numbers
        and a way to reach someone, so that is what this is.

        It is FOLDED unless the plan is ending. A shop owner who has already paid
        was being shown a price list every single time they opened their own
        settings, below every screen of the app — an advert in a room they own.
        `open` when it is actually urgent, a one-line summary the rest of the
        time. <details>, so it costs no JavaScript on a server-rendered page.
      */}
      <details open={left.expired || (left.soon && !left.unlimited)} className="group">
        <summary className="a-card flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 text-[15px] font-semibold text-charcoal">
            Formules et tarifs
          </span>
          <span className="shrink-0 text-[13px] font-bold text-slate">dès 7 TND / mois</span>
          <span className="shrink-0 text-[17px] leading-none text-slate transition group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="a-card mt-1.5 p-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-[var(--o-inset)] px-3 py-3 text-center">
              <p className="text-[12px] font-semibold text-slate">6 mois</p>
              <p className="mt-0.5 font-display text-[24px] font-extrabold leading-none text-charcoal">
                65 <span className="text-[12px] font-bold text-slate">TND</span>
              </p>
              <p className="mt-0.5 text-[10px] text-slate">≈ 11 TND / mois</p>
            </div>
            <div className="rounded-2xl bg-[#5b3fd1]/25 px-3 py-3 text-center ring-1 ring-[#5b3fd1]/40">
              <p className="text-[12px] font-semibold text-[#5b3fd1]">1 an</p>
              <p className="mt-0.5 font-display text-[24px] font-extrabold leading-none text-charcoal">
                80 <span className="text-[12px] font-bold text-slate">TND</span>
              </p>
              <p className="mt-0.5 text-[10px] text-[#5b3fd1]">≈ 7 TND / mois</p>
            </div>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-slate">
            Tout est compris : points, récompenses, tampons, analyses et le kit QR
            pour vos tables.
          </p>

          {/*
            "Écrivez-nous pour renouveler" is what this said, which put the one
            action on this screen outside the product: an owner had to find a
            number, explain who they were, and send a photograph into a chat
            thread that knew nothing about their shop. Now it is a button, and
            what comes out the other end is a row in the console with the
            amount, the method and the receipt attached to THIS café.
          */}
          <Link
            href="/owner/renouveler"
            className="mt-3 flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-royal text-[14px] font-bold text-white transition active:scale-[0.99]"
          >
            Renouveler mon abonnement
            <span className="text-[15px] leading-none">→</span>
          </Link>
          {/*
            The question an owner asks at exactly this moment, answered here
            instead of only in the small print. The answer is true and already
            written at /conditions ("Rien n'est effacé…"); until now nothing in
            the owner app linked it, so the person deciding whether to spend 80
            TND had no way to reach the paragraph written for them.
          */}
          <p className="mt-2 text-[12px] leading-relaxed text-slate">
            Si vous vous arrêtez, rien n&apos;est effacé : vos clients et leurs
            points restent, et reviennent intacts le jour où vous rallumez.{" "}
            <Link
              href="/conditions"
              className="font-bold text-[#5b3fd1] underline underline-offset-2"
            >
              Conditions
            </Link>
          </p>
        </div>
      </details>

      <form action={logoutAction} className="px-1">
        <button
          type="submit"
          className="w-full rounded-2xl border border-[var(--o-edge)] py-3 text-[13px] font-bold text-slate active:scale-[0.99]"
        >
          Se déconnecter
        </button>
        {/*
          The identifier, as a footnote under the exit — it was a row in an
          account section that no longer exists. Nobody opens their own settings
          to look up their own email address, but the day support asks for it,
          it is here.

          The "site public" link beside it is gone. It pointed at /?pro=1 — the
          page that SELLS Pointili — while sitting one column away from "Adresse
          de la carte", which opens the shop's own public page. Two links a
          thumb apart, named almost the same, going somewhere entirely
          different; the one an owner meant is the other one. The sidebar
          already carries "Voir le site public" for anyone who did want the
          marketing page.
        */}
        <p className="mt-2.5 text-center text-[11.5px] text-slate">
          <span className="truncate font-mono">{owner?.email ?? "—"}</span>
        </p>
      </form>
      </div>
      </div>
    </div>
  );
}
