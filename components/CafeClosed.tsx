import Link from "next/link";
import { BRAND_COLOR } from "@/lib/brand";

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
export function CafeClosed({ name }: { name: string }) {
  return (
    <div
      className="app-shell app-shell--dark flex min-h-dvh flex-col items-center justify-center px-6 text-center text-white"
      style={{
        backgroundColor: "#0f0a1c",
        backgroundImage: `linear-gradient(180deg, color-mix(in oklab, ${BRAND_COLOR}, #000 45%) 0%, #0a0614 100%)`,
      }}
    >
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-[23px] ring-1 ring-white/15">
        🌙
      </span>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/50">
        Momentanément fermé
      </p>
      <h1 className="mt-1.5 text-[21px] font-extrabold leading-tight">{name}</h1>
      <p className="mx-auto mt-2.5 max-w-[32ch] text-[13.5px] leading-relaxed text-white/65">
        La carte de fidélité de cette boutique est en pause. Tes points sont
        conservés — repasse bientôt.
      </p>

      {/*
        /cartes, NOT /[slug]/anything: this screen replaces the entire shop
        subtree, so anything under the slug is unreachable from here. And /cartes
        itself now falls through to /moi when signed out, which is the only
        reason this is no longer a total lockout for a signed-out diner.
      */}
      <Link
        href="/cartes"
        className="mt-7 rounded-2xl bg-white px-5 py-3 text-[13.5px] font-bold text-charcoal active:scale-[0.98]"
      >
        Voir mes autres cartes
      </Link>
    </div>
  );
}
