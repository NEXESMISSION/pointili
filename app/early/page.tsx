import Link from "next/link";
import { BrandLockup } from "@/components/BrandMark";
import { LangToggle } from "@/components/LangToggle";
import { EarlyForm } from "./EarlyForm";
import { currentLang, dir, translator } from "@/lib/i18n";
import { SITE_URL } from "@/lib/seo";

/**
 * ACCÈS ANTICIPÉ — the one page that exists because there is nothing to sell yet.
 *
 * Pointili is not on the market. The landing page at / sells a fourteen-day
 * trial to a shop owner who can sign up this minute; this page is for the other
 * situation entirely — somebody who saw a post, wants in, and cannot have it
 * yet. The only thing on offer is a place at the front of the queue, and the
 * only thing being asked for is a way to reach them.
 *
 * ── THREE FIELDS, AND THE REST IS DISCIPLINE ──────────────────────────────
 *
 * Who are they (name), what are they (category), how do we reach them
 * (WhatsApp). Every other question a form like this usually asks — city,
 * Instagram, how many covers, how did you hear about us, why are you interested
 * — is answerable on the phone call this page exists to produce, and each one
 * asked HERE is a reason to close the tab. A visitor must never get as far as
 * "why do they need my Instagram?".
 *
 * The one extra question is asked AFTER the submit, on the thank-you screen,
 * where it cannot cost a lead because the lead is already saved.
 *
 * ── "ACCÈS ANTICIPÉ", NEVER "LISTE D'ATTENTE" ─────────────────────────────
 *
 * The word is the offer. A waiting list is something you are put ON and then
 * wait; early access is something you GET, before other people. Same queue,
 * opposite feeling, and the word "attente" appears nowhere on this page.
 *
 * ── WHY IT IS THE FORM AND THEN THE ARGUMENT, NOT THE OTHER WAY ROUND ─────
 *
 * This page is read on a phone, arriving from a link in a bio. The reader has
 * already had the argument — that is what the post was — so the form is the
 * first thing under the headline rather than the reward for scrolling past
 * three sections. What is below it is not persuasion, it is EXPECTATION: what
 * actually happens after they tap the button, which is the question anybody who
 * has just given out their number is now asking.
 *
 * ── NO PRICE ON THIS PAGE ─────────────────────────────────────────────────
 *
 * Deliberately. A price makes this a purchase decision, and it is not one: it
 * is "yes, call me". The price is on / and comes up on the call.
 */

export const metadata = {
  title: "Accès anticipé",
  description:
    "Pointili ouvre commerce par commerce. Laissez votre nom, votre catégorie et votre WhatsApp " +
    "pour faire partie des premiers commerces tunisiens sur Pointili.",
  alternates: { canonical: "/early" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/early`,
    title: "Pointili — accès anticipé",
    description:
      "Soyez parmi les premiers commerces sur Pointili. Trois champs, et on vous écrit sur WhatsApp.",
  },
};

/**
 * WHAT HAPPENS NEXT, in the order it happens.
 *
 * Not benefits — benefits are what the post they arrived from was for. Somebody
 * who has just typed their phone number into a page for a product that does not
 * exist yet has exactly one question, and it is "so what now?". Three lines,
 * each of them a thing we actually intend to do, which is also what makes them
 * checkable later.
 */
const NEXT = [
  {
    title: "On vous écrit sur WhatsApp",
    text: "Pas d'e-mail, pas de démarchage. Un message quand votre tour arrive, et c'est vous qui décidez de la suite.",
  },
  {
    title: "On installe votre carte avec vous",
    text: "Vos couleurs, vos récompenses, votre taux de points. Ça prend une vingtaine de minutes, et rien à acheter.",
  },
  {
    title: "Vos clients scannent le QR",
    text: "Posé sur la table ou collé à la caisse. Ils n'ont aucune application à installer — leur carte s'ouvre dans le navigateur.",
  },
];

export default async function EarlyAccess({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const lang = await currentLang();
  const t = translator(lang);
  const { from } = await searchParams;

  /*
    ── "VOS CLIENTS VOUS RÉCLAMENT" IS ONLY SHOWN WHEN IT IS TRUE ────────────

    ?from=tag switches this page to the version for a shop that was NAMED by its
    own customers — somebody tagged them under a Pointili post asking people to
    name the place they go back to. That headline is dramatically stronger than
    the general one, because it is not a pitch, it is a message: people asked
    for you.

    Which is exactly why the link carrying it must only ever be sent to a shop
    that was actually tagged. Used as a growth trick on a cold audience it is a
    lie told in the first six words of the first thing they read about us, and
    it would be the last thing they read about us. The parameter is the whole
    guard: a general link cannot show it by accident.
  */
  const tagged = from === "tag";

  return (
    <div
      dir={dir(lang)}
      lang={lang === "tn" ? "ar-TN" : "fr"}
      className={`landing-light flex min-h-dvh flex-col bg-white text-charcoal${
        lang === "tn" ? " lang-tn" : ""
      }`}
    >
      {/* ── masthead ─────────────────────────────────────────────────
          The brand, the language, and nothing else. No sign-in, no menu, no
          second call to action: this page has exactly one thing to do and every
          other pressable object on it is a way to leave without doing it. */}
      <header className="border-b border-hair">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <Link href="/" aria-label="Pointili">
            <BrandLockup size={32} accent="#5b3fd1" />
          </Link>
          <LangToggle current={lang} />
        </div>
      </header>

      <main className="flex-1">
        {/* ── the offer and the form ───────────────────────────────────
            One column on a phone, in reading order: what this is, then the
            three fields. Two on a desktop, with the form in its own field of
            colour on the right — the same hard-edged band the landing hero
            uses, so this page belongs to that page even though it says
            something else. */}
        <section className="border-b border-hair">
          <div className="mx-auto grid max-w-5xl items-start gap-10 px-5 py-10 md:grid-cols-12 md:gap-14 md:px-8 md:py-16">
            <div className="md:col-span-6 lg:col-span-7">
              <p className="flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-royal">
                <span aria-hidden className="h-px w-7 bg-royal" />
                {tagged ? t("Votre commerce a été cité") : t("Accès anticipé · Tunisie")}
              </p>

              {tagged ? (
                <>
                  <h1 className="mt-5 text-[34px] md:text-[46px]">
                    {t("Vos clients vous réclament")} <span aria-hidden>👀</span>
                  </h1>
                  <p className="mt-5 max-w-[46ch] text-[16px] leading-[1.65] text-slate">
                    {t(
                      "Quelqu'un a cité votre commerce sous une publication Pointili. On construit une nouvelle façon pour les commerces de récompenser leurs habitués — et on ouvre commerce par commerce.",
                    )}
                  </p>
                </>
              ) : (
                <>
                  <h1 className="mt-5 text-[34px] md:text-[46px]">
                    {t("Soyez parmi les premiers commerces sur Pointili")}{" "}
                    <span aria-hidden>🚀</span>
                  </h1>
                  <p className="mt-5 max-w-[46ch] text-[16px] leading-[1.65] text-slate">
                    {t(
                      "Fidélisez vos clients et faites-les revenir plus souvent. Pointili est la carte de fidélité digitale de votre commerce : vos clients cumulent des points à chaque achat et reviennent les dépenser chez vous.",
                    )}
                  </p>
                </>
              )}

              {/* The honest sentence, said before they are asked for anything
                  rather than discovered after. A page that takes a phone number
                  for a product that is not on sale has to say that it is not on
                  sale. */}
              <p className="mt-5 max-w-[46ch] border-s-2 border-royal ps-4 text-[14.5px] leading-relaxed text-charcoal">
                {t(
                  "Pointili n'est pas encore ouvert au public. Laissez-nous votre numéro et on vous écrit dès que c'est votre tour.",
                )}
              </p>
            </div>

            {/*
              THE FORM IS THE PAGE, so on a phone it comes straight after the
              headline — no section between them, nothing to scroll past. The
              colour band is a child of this column, exactly like the landing's
              hero art, so its edge is the grid line at every width and it bleeds
              off the outside edge instead of guessing a percentage.
            */}
            <div className="relative md:col-span-6 lg:col-span-5">
              <div
                aria-hidden
                className="absolute -inset-x-5 -inset-y-6 bg-mist md:-inset-x-6 md:-inset-y-7"
              />
              <div className="relative">
                <EarlyForm lang={lang} source={tagged ? "tag" : "direct"} />
              </div>
            </div>
          </div>
        </section>

        {/* ── what happens next ────────────────────────────────────────
            Below the fold on purpose: it is read by the person who has already
            decided and wants to know what they have just started, and by the
            person who is nearly decided and needs to know it is not a purchase. */}
        <section className="bg-deep text-white">
          <div className="mx-auto max-w-5xl px-5 py-14 md:px-8 md:py-20">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-lavender">
              {t("Ensuite")}
            </p>
            <h2 className="mt-5 max-w-[20ch] text-[28px] text-white md:text-[38px]">
              {t("Ce qui se passe après votre demande.")}
            </h2>

            <ol className="mt-10 grid border-t border-white/20 md:mt-14 md:grid-cols-3">
              {NEXT.map((s, i) => (
                <li
                  key={s.title}
                  className="border-b border-white/20 py-6 md:border-b-0 md:border-r md:px-7 md:py-0 md:first:ps-0 md:last:border-r-0 md:last:pe-0"
                >
                  <p className="font-mono text-[12px] font-bold tracking-[0.2em] text-lavender md:pt-7">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-3 text-[21px] text-white md:text-[23px]">{t(s.title)}</h3>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-white/60">
                    {t(s.text)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t border-hair">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-7 md:flex-row md:items-center md:justify-between md:px-8">
          <p className="text-[13px] text-slate">{t("Conçu et hébergé pour la Tunisie")}</p>
          <nav className="flex flex-wrap items-center gap-x-7 text-[13.5px] text-slate">
            <Link href="/confidentialite" className="py-2 transition hover:text-charcoal">
              {t("Confidentialité")}
            </Link>
            <Link href="/conditions" className="py-2 transition hover:text-charcoal">
              {t("Conditions")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
