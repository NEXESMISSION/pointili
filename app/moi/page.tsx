import Link from "next/link";
import { redirect } from "next/navigation";
import { currentDiner } from "@/lib/auth/diner";
import { BRAND_COLOR, DINER_BG } from "@/lib/brand";
import { SignInForm } from "./SignInForm";

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
 * What signals the audience is the VOICE, not the colour: the diner app says
 * "tu" everywhere and the owner app says "vous". Colour cannot do it here — the
 * owner shell (.a-shell) and the diner background are the same deep purple, one
 * hex apart, so a dark page alone reads exactly like /owner/login.
 */
export default async function Moi() {
  // Nothing to ask if the session is already good.
  if (await currentDiner()) redirect("/cartes");

  return (
    <div
      className="safe-t safe-b app-shell app-shell--dark flex min-h-dvh flex-col px-5 text-white [--safe-pb:2.5rem] [--safe-pt:2rem]"
      style={{ ["--cafe" as string]: BRAND_COLOR, ...DINER_BG }}
    >
      <div className="mx-auto w-full max-w-md">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
          ✦ pointili.online
        </p>
        <h1 className="mt-1.5 font-display text-[26px] font-extrabold leading-tight">
          Mes cartes
        </h1>
        <p className="mt-1.5 mb-6 text-[14px] leading-relaxed text-white/60">
          Tes points te suivent partout. Entre ton numéro et ton code secret
          pour les retrouver.
        </p>

        <SignInForm />

        {/*
          No signup here, deliberately: a card belongs to a shop. Creating an
          account from this page would land someone in an empty wallet with
          nothing in it and no idea why.
        */}
        <div className="mt-7 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-4">
          <p className="text-[13.5px] font-bold text-white">Pas encore de carte ?</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/60">
            Scanne le QR posé au comptoir de ton commerce. C&apos;est gratuit,
            sans application, et tes points démarrent tout de suite.
          </p>
        </div>

        <p className="mt-6 text-center text-[12px] text-white/40">
          Tu es commerçant ?{" "}
          <Link href="/?pro=1" className="font-bold text-[#b9a3ff] underline underline-offset-2">
            Espace café
          </Link>
        </p>
      </div>
    </div>
  );
}
