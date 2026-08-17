import Link from "next/link";
import { hasOwnerCookie } from "@/lib/auth/owner";
import { TillIcon } from "./icons";

/**
 * ── THE WAY BACK TO THE TILL ──────────────────────────────────────────────
 *
 * A shop owner ends up inside the customer app constantly, and by design:
 * they scan their own QR to check the card looks right, they follow
 * pointili.online/<their-shop> from the poster they just printed, and plenty of
 * them hold real cards at OTHER shops — a café owner buys bread too.
 *
 * Once there, the product had no exit. The customer app's whole navigation
 * points inward (card, rewards, activity, wallet) and the only thing pointing
 * out was a marketing line at the bottom of the wallet reading "Vous êtes
 * commerçant ? Espace boutique", which goes to the SALES page — the pitch for a
 * product they already pay for. The honest way back was to retype the URL.
 *
 * So: a small pill, on every customer screen, straight to /owner.
 *
 * IT IS SHOWN TO OWNERS AND NOBODY ELSE. A customer must never see the word
 * "caisse" on their own card — it is a door they cannot open and a hint that
 * they are looking at somebody's dashboard.
 *
 * hasOwnerCookie() is the test, and it is deliberately the CHEAP one: it reads
 * the cookie jar and nothing else, so this costs no round trip on the screen a
 * customer opens at the counter. It proves nothing — see the note on the
 * function — and it does not have to. Nothing is granted here. The worst a
 * forged cookie buys is the sight of a link, and /owner then asks the auth
 * server the real question.
 *
 * BOTTOM, ON THE START SIDE, because the end side is the wheel
 * (boutique/WheelPlayer) and the band across the bottom is the install prompt.
 * Above the tab bar on a phone, clear of it on a laptop, where there is no tab
 * bar.
 *
 * START, NOT LEFT. Written as `left-4` it stayed physically left while the page
 * mirrored around it in Tunisian — and landed squarely on top of the join
 * screen's own submit button, so the one screen where an owner most wants a way
 * out was the screen where this covered the way in. A floating exit must never
 * sit on the page's primary action, in either direction.
 */
export async function OwnerReturn() {
  if (!(await hasOwnerCookie())) return null;

  return (
    <Link
      href="/owner"
      prefetch={false}
      className="fixed bottom-[86px] start-4 z-30 flex items-center gap-2 rounded-full bg-[#171223] py-2.5 pl-3 pr-4 text-[12.5px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(23,18,31,.7)] transition active:scale-95 lg:bottom-6"
    >
      <TillIcon className="h-[15px] w-[15px]" />
      Ma caisse
    </Link>
  );
}
