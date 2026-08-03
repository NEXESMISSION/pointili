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
    <div className="space-y-4">
      {/* Phone only: at md+ the sidebar is the way back, and a chevron beside a
          permanent nav is noise. */}
      <div className="px-1 md:hidden">
        <BackLink fallback="/owner" />
      </div>

      {/* ── who you are ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-1">
        {/* Logo, or the shop's initial — never the business-type emoji. The
            "Autre" fallback is ✨, so every untyped shop wore a sparkle on its
            own admin screens as if it were branding. The initial is what the
            sidebar already uses; same identity, same treatment. */}
        {cafe.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
          <img src={cafe.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#6d4ae6] text-[18px] font-extrabold text-white">
            {cafe.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-extrabold leading-tight text-white">
            {cafe.name}
          </h1>
          <p className="truncate text-[12px] text-white/50">
            {type.label} · pointili.online/{cafe.slug}
          </p>
        </div>
      </div>

      <SettingsList
        cafe={cafe}
        program={program}
        rewards={rewards}
        game={game}
        typeLabel={type.label}
        ticket={ticket}
      />

      {/*
        ── THE ACCOUNT, IN ONE ROW AND A FOOTNOTE ─────────────────────────
        This was four full rows — Formule, Expire le, Identifiant, Site public
        — carrying as much of the screen as the entire loyalty programme above
        it. Every one of them is a fact you READ, never a thing you change, and
        nobody opens their own settings to look up their own email address.

        Formule and "Expire le" were always one sentence pretending to be two
        rows: "Pro" means nothing without the date and the date means nothing
        without the plan. They are one line now, and the chip keeps its colour
        so an expiring shop still shouts.

        Identifiant and the public link drop to a footnote under the card: still
        there for the day somebody needs them, no longer taking a row each.
      */}
      <section>
        <h2 className="mb-1.5 px-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">
          Votre compte
        </h2>
        <div className="a-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-white">
                {PLAN_LABEL[cafe.plan] ?? cafe.plan}
              </span>
              {cafe.planExpiresAt && (
                <span className="mt-0.5 block text-[12px] text-white/45">
                  {left.expired ? "expiré le " : "jusqu'au "}
                  {new Date(cafe.planExpiresAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              )}
            </span>
            <span
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-bold ${
                left.expired
                  ? "bg-[#ff6b6b]/12 text-[#ff9a9a]"
                  : left.soon && !left.unlimited
                    ? "bg-[#ffd27a]/12 text-[#ffd27a]"
                    : "bg-ok/10 text-[#7ff0b0]"
              }`}
            >
              {left.label}
            </span>
          </div>
        </div>

        {/*
          ?pro=1, because "/" sends a signed-in owner back to their till. The
          sidebar carries this too, but the sidebar is laptop-only and most
          owners never see one.
        */}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1.5 text-[11.5px] text-white/35">
          <span className="truncate font-mono">{owner?.email ?? "—"}</span>
          <span className="text-white/20">·</span>
          <Link href="/?pro=1" className="font-bold text-white/50 underline underline-offset-2">
            site public
          </Link>
        </p>
      </section>

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
          <span className="min-w-0 flex-1 text-[15px] font-semibold text-white">
            Formules et tarifs
          </span>
          <span className="shrink-0 text-[13px] font-bold text-white/50">dès 7 TND / mois</span>
          <span className="shrink-0 text-[17px] leading-none text-white/30 transition group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="a-card mt-1.5 p-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-white/[0.07] px-3 py-3 text-center">
              <p className="text-[12px] font-semibold text-white/55">6 mois</p>
              <p className="mt-0.5 font-display text-[24px] font-extrabold leading-none text-white">
                65 <span className="text-[12px] font-bold text-white/50">TND</span>
              </p>
              <p className="mt-0.5 text-[10px] text-white/40">≈ 11 TND / mois</p>
            </div>
            <div className="rounded-2xl bg-[#6d4ae6]/25 px-3 py-3 text-center ring-1 ring-[#8b6bff]/40">
              <p className="text-[12px] font-semibold text-[#b9a3ff]">1 an</p>
              <p className="mt-0.5 font-display text-[24px] font-extrabold leading-none text-white">
                80 <span className="text-[12px] font-bold text-white/50">TND</span>
              </p>
              <p className="mt-0.5 text-[10px] text-[#b9a3ff]">≈ 7 TND / mois</p>
            </div>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-white/55">
            Tout est compris : points, récompenses, tampons, analyses et le kit QR
            pour vos tables. Écrivez-nous pour renouveler — on active votre compte
            le jour même.
          </p>
          {/*
            The question an owner asks at exactly this moment, answered here
            instead of only in the small print. The answer is true and already
            written at /conditions ("Rien n'est effacé…"); until now nothing in
            the owner app linked it, so the person deciding whether to spend 80
            TND had no way to reach the paragraph written for them.
          */}
          <p className="mt-2 text-[12px] leading-relaxed text-white/55">
            Si vous vous arrêtez, rien n&apos;est effacé : vos clients et leurs
            points restent, et reviennent intacts le jour où vous rallumez.{" "}
            <Link
              href="/conditions"
              className="font-bold text-[#b9a3ff] underline underline-offset-2"
            >
              Conditions
            </Link>
          </p>
        </div>
      </details>

      <form action={logoutAction} className="px-1">
        <button
          type="submit"
          className="w-full rounded-2xl border border-white/12 py-3 text-[13px] font-bold text-white/55 active:scale-[0.99]"
        >
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
