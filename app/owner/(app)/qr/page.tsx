import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ownerCafe, ownerHome } from "@/lib/auth/owner";
import { businessType } from "@/lib/businessTypes";
import { getLoyaltyProgram } from "@/lib/data";
import { SITE_URL } from "@/lib/seo";
import { PrintKit } from "./PrintKit";
import { QrScreen } from "./QrScreen";

export const metadata = { title: "Mon QR" };

/**
 * The QR — the front door of the whole product.
 *
 * This page only computes the ingredients; PrintKit turns them into the four
 * objects a shop actually needs (table tent, A5, sticker, story). The promise
 * line is generated from the shop's own settings, so what a customer reads on
 * the table always matches what they'll actually get.
 */
export default async function QrPage() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a valid session
  // and bounce straight back here, forever.
  if (!cafe) redirect(await ownerHome());

  const program = await getLoyaltyProgram(cafe.id);
  const type = businessType(cafe.businessType);

  /*
    SITE_URL, not a second copy of the env read — this one fell back to the
    APEX, which 308s to www. That redirect is free in a browser and permanent on
    paper: it is printed into a QR code, stuck to a table, and every scan for the
    life of that sticker pays the extra hop.
  */
  const url = `${SITE_URL}/${cafe.slug}`;

  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#14101f", light: "#00000000" },
  });

  // What the customer gets — read from the shop's real settings, never invented.
  const promise = program.stampsEnabled
    ? `${program.stampsRequired} visites = ${program.stampReward.toLowerCase()}`
    : program.welcomePoints > 0
      ? `${program.welcomePoints} points offerts à l'inscription`
      : "Cumulez des points à chaque visite";

  return (
    <QrScreen
      url={url}
      svg={svg}
      logoUrl={cafe.logoUrl}
      emoji={type.emoji}
      cafeName={cafe.name}
    >
      <PrintKit
        url={url}
        svg={svg}
        name={cafe.name}
        logoUrl={cafe.logoUrl}
        emoji={type.emoji}
        promise={promise}
      />
    </QrScreen>
  );
}
