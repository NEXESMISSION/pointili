import Link from "next/link";
import { redirect } from "next/navigation";
import { currentDiner } from "@/lib/auth/diner";
import { hasOwnerCookie } from "@/lib/auth/owner";
import { OwnerReturn } from "@/components/OwnerReturn";
import { cafeVars } from "@/lib/theme";
import { SignInForm } from "./SignInForm";
import { currentLang, dir, t as translation } from "@/lib/i18n";

export const metadata = { title: "Mes cartes" };

/**
 * The CUSTOMER's front door.
 *
 * "/" is the business front door and stays that way — it sells Pointili to shop
 * owners. This is the other one. The two never share a screen: a page that asks
 * "are you a shop or a customer?" makes the paying audience click past a fork,
 * and gives the customer a worse door than they deserve. Instead the app decides
 * — a signed-in diner is redirected off "/" to their wallet, and a signed-out
 * one has this.
 *
 * What signals the audience is the VOICE, and now the SURFACE too: the diner
 * app says "tu" everywhere and is white, the owner app says "vous" and is a
 * dark terminal. This page used to be a dark screen one hex away from
 * /owner/login, which is exactly the confusion it exists to avoid.
 *
 * It belongs to no shop, so it wears the house colour — cafeVars(null) — which
 * is what every diner screen falls back to before a shop is known.
 */
export default async function Moi() {
  // Nothing to ask if the session is already good.
  if (await currentDiner()) redirect("/cartes");
  /* An owner lands here whenever they open a customer screen without a diner
     session of their own — following their own card link, say. Without this
     they were offered the SALES page as the way out. */
  const isOwner = await hasOwnerCookie();

  /* Outside /[slug], so this screen owns its own language and direction. */
  const lang = await currentLang();
  const t = await translation();

  return (
    <div
      lang={lang === "tn" ? "ar-TN" : "fr"}
      dir={dir(lang)}
      className={`safe-t safe-b app-shell app-shell--light d-shell flex min-h-dvh flex-col px-5 [--safe-pb:2.5rem] [--safe-pt:2rem] ${lang === "tn" ? "lang-tn" : ""}`}
      style={cafeVars(null)}
    >
      <div className="mx-auto w-full max-w-md">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate">
          ✦ pointili.online
        </p>
        <h1 className="mt-1.5 font-display text-[26px] font-extrabold leading-tight text-charcoal">
          {t("Mes cartes")}
        </h1>
        <p className="mt-1.5 mb-6 text-[14px] leading-relaxed text-slate">
          {t("Tes points te suivent partout. Entre ton numéro et ton code secret pour les retrouver.")}
        </p>

        <SignInForm lang={lang} />

        {/*
          No signup here, deliberately: a card belongs to a shop. Creating an
          account from this page would land someone in an empty wallet with
          nothing in it and no idea why.
        */}
        <div className="d-card mt-7 px-4 py-4">
          <p className="text-[13.5px] font-bold text-charcoal">{t("Pas encore de carte ?")}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate">
            {t("Scanne le QR posé au comptoir de ton commerce. C'est gratuit, sans application, et tes points démarrent tout de suite.")}
          </p>
        </div>

        {!isOwner && (
          <p className="mt-6 text-center text-[12px] text-slate">
            {t("Vous êtes commerçant ?")}{" "}
            <Link href="/?pro=1" className="font-bold underline underline-offset-2"
              style={{ color: "var(--cafe-text)" }}>
              {t("Espace café")}
            </Link>
          </p>
        )}
      </div>
      {/* owners only — the door back to the till, see OwnerReturn */}
      <OwnerReturn />
    </div>
  );
}
