import { redirect } from "next/navigation";
import { ownerCafe, ownerHome } from "@/lib/auth/owner";
import { getLoyaltyProgram } from "@/lib/data";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/seo";
import { CaisseDesk } from "./caisse/CaisseForms";

export const metadata = { title: "Caisse" };

/**
 * The owner's HOME is the Caisse — the one thing they do every shift.
 *
 * It behaves like a terminal, not a page: two modes (a client, or a code), the
 * camera live by default, a keypad when it isn't, and the identified customer
 * taking over the whole screen so it stays readable at arm's length. The old
 * separate "Clients" page folded in here as the recents strip.
 */
export default async function OwnerHome() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a valid session
  // and bounce straight back here, forever.
  if (!cafe) redirect(await ownerHome());
  const program = await getLoyaltyProgram(cafe.id);

  /*
    The shop's own QR, drawn HERE and handed down.

    The till used to link to it behind a generic icon on a grey strip — a
    picture of a QR standing in for a QR, on the one screen where the real
    thing is two centimetres from the owner's hand. It is small, it costs
    nothing to render, and a shop that has not yet printed its code recognises
    it instantly. Same URL as /owner/qr, from SITE_URL for the same reason:
    the apex 308s to www and that redirect gets printed into the sticker.
  */
  const qr = await QRCode.toString(`${SITE_URL}/${cafe.slug}`, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#14101f", light: "#00000000" },
  });

  return (
    <CaisseDesk
      pointsPerTnd={program.pointsPerTnd}
      stampsEnabled={program.stampsEnabled}
      stampsRequired={program.stampsRequired}
      qr={qr}
      slug={cafe.slug}
    />
  );
}
