import Link from "next/link";
import { currentLang, dir, t as translation } from "@/lib/i18n";

/**
 * Suspended, or the subscription lapsed.
 *
 * Deliberately vague: the diner is a customer of the SHOP, not of Pointili, and
 * "this shop hasn't paid us" is not their business. Their points are safe and
 * come back the moment the shop does.
 *
 * It always offers a way out — this screen renders without the nav, so without
 * the link a diner who opened this card from their wallet was stranded.
 */
export async function CafeClosed({ name }: { name: string }) {
  /*
    This screen is rendered INSTEAD of the shop's layout, so nothing above it
    has set lang or dir — it is the whole document for as long as it is up. It
    therefore has to read the cookie itself and carry both attributes, or the
    Tunisian text renders left-aligned inside an LTR block.
  */
  const lang = await currentLang();
  const t = await translation();
  return (
    <div
      lang={lang === "tn" ? "ar-TN" : "fr"}
      dir={dir(lang)}
      className="app-shell app-shell--light d-shell flex min-h-dvh flex-col items-center justify-center px-6 text-center"
    >
      <span className="d-soft grid h-14 w-14 place-items-center rounded-2xl text-[23px]">
        🌙
      </span>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate">
        {t("Momentanément fermé")}
      </p>
      <h1 className="mt-1.5 text-[21px] font-extrabold leading-tight text-charcoal">{name}</h1>
      <p className="mx-auto mt-2.5 max-w-[32ch] text-[13.5px] leading-relaxed text-slate">
        {t("La carte de fidélité de cette boutique est en pause. Tes points sont conservés — repasse bientôt.")}
      </p>

      {/*
        /cartes, NOT /[slug]/anything: this screen replaces the entire shop
        subtree, so anything under the slug is unreachable from here. And /cartes
        itself now falls through to /moi when signed out, which is the only
        reason this is no longer a total lockout for a signed-out diner.
      */}
      <Link
        href="/cartes"
        className="mt-7 rounded-2xl bg-charcoal px-5 py-3 text-[13.5px] font-bold text-white active:scale-[0.98]"
      >
        {t("Voir mes autres cartes")}
      </Link>
    </div>
  );
}
