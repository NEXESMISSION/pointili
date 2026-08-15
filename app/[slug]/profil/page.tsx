import Link from "next/link";
import { CafeClosed } from "@/components/CafeClosed";
import { notFound, redirect } from "next/navigation";
import { getCafe, getMember } from "@/lib/data";
import { logoutDinerAction } from "../actions";
import { LangSwitch } from "@/components/LangSwitch";
import { currentLang, t as translation } from "@/lib/i18n";

export const metadata = { title: "Profil" };

/**
 * ── MON COMPTE ────────────────────────────────────────────────────────────
 *
 * It was a fourth navigation surface. Four tiles — Montrer ma carte, À
 * récupérer, Récompenses, Historique — of which every single one was already
 * reachable: Récompenses is a permanent tab, Historique is a tile on the card,
 * À récupérer is the card's errand row, and "Montrer ma carte" opened a screen
 * showing the same QR the card already draws inline. Under them sat a "Cette
 * carte" panel repeating the shop and the balance from the card, and a link to
 * the wallet that the banner's switcher already is.
 *
 * A menu whose every item exists somewhere better is not navigation, it is a
 * second copy of the app that has to be kept in step with the first.
 *
 * So this screen is what only IT can be: who you are, the code that is yours at
 * every shop on the platform, and the way out. Three things, no tiles.
 */
export default async function Profil({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();
  // Re-checked per PAGE, not just in the layout: Next does not re-run a layout
  // on client-side transitions, so a shop that went dark mid-session kept
  // serving every screen.
  if (!cafe.live) return <CafeClosed name={cafe.name} />;

  const diner = await getMember(cafe.id);

  const lang = await currentLang();
  const t = await translation();
  if (!diner) redirect(`/${slug}/rejoindre`);

  return (
    <div className="flex flex-1 flex-col px-5 pb-6">
      {/* who */}
      <section className="flex items-center gap-3.5 pb-6 pt-4">
        <span
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-[24px] font-extrabold"
          style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
        >
          {(diner.name ?? "M").charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[19px] font-extrabold leading-tight text-charcoal">
            {diner.name ?? t("Membre")}
          </span>
          {/*
            dir="ltr" — WITHOUT IT THE + JUMPS TO THE END.

            "+21651199741" rendered as "21651199741+" in Tunisian. Nothing is
            reversing the digits: Unicode treats "+" as a NEUTRAL character, so
            in a right-to-left paragraph it takes the direction of what
            surrounds it and lands at what RTL considers the end of the run.
            The number a customer reads back to a cashier came out with its
            country prefix on the wrong side.

            The digits themselves were always fine, which is what makes this
            easy to miss and easy to misdiagnose as "the phone is backwards".
          */}
          <span dir="ltr" className="block text-[13px] font-medium text-slate rtl:text-right">
            {diner.phone}
          </span>
        </span>
      </section>

      {/*
        THE CODE, AT FULL SIZE AND EXPLAINED.

        It used to be a chip beside the phone number. It is the one fact on this
        screen that is genuinely account-level — the same four characters at
        every shop on the platform — and the sentence under it is the answer to
        the question a customer actually has about it, which nothing else in the
        app was answering.
      */}
      <div className="d-card px-5 py-4">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate">
          {t("Mon code client")}
        </p>
        {/* Same reason as the phone number: four Latin characters carrying
            0.16em of trailing letter-spacing, which RTL puts on the wrong
            side of the last glyph. */}
        <p
          dir="ltr"
          className="mt-1 font-mono text-[34px] font-extrabold leading-none tracking-[0.16em] rtl:text-right"
          style={{ color: "var(--cafe-text)" }}
        >
          {diner.code}
        </p>
        <p className="mt-2 text-[12.5px] leading-snug text-slate">
          {t("Le même dans tous les commerces Pointili. Donne-le au comptoir si le QR ne passe pas.")}
        </p>
      </div>

      {/*
        The only two exits that are NOT already on the card: the wallet is on
        the banner's switcher, the tabs are in the bar, and history is a tile —
        so what is left is the shop's own page and signing out.
      */}
      <Link
        href={`/${slug}/scanner`}
        className="d-card mt-2.5 flex items-center justify-between gap-3 px-5 py-3.5 transition active:scale-[0.99]"
      >
        <span className="min-w-0">
          <span className="block text-[14px] font-bold text-charcoal">
            {t("Mon code en grand")}
          </span>
          <span className="block text-[11.5px] text-slate">
            {t("À montrer de loin, à travers un comptoir.")}
          </span>
        </span>
        {/* the chevron has to point the way the reader is going */}
        <span className="shrink-0 text-[17px] leading-none text-slate rtl:-scale-x-100">›</span>
      </Link>

      {/* Language lives HERE, not in a settings screen that does not exist.
          It is a property of the person, like their code and their number, and
          this is the only diner screen that is about the person. */}
      <div className="mt-2.5">
        <LangSwitch current={lang} />
      </div>

      <form action={logoutDinerAction.bind(null, slug)} className="mt-auto pt-8">
        <button
          type="submit"
          className="w-full rounded-2xl border border-[var(--line-strong)] py-3.5 text-[13.5px] font-bold text-slate active:scale-[0.99]"
        >
          {t("Changer de compte")}
        </button>
        <p className="mt-2.5 text-center text-[11.5px] leading-snug text-slate">
          {t("Tes points restent liés à ton numéro — tu les retrouves en te reconnectant.")}
        </p>
      </form>
    </div>
  );
}
