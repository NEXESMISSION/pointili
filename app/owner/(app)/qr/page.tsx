import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ownerCafe, ownerHome } from "@/lib/auth/owner";
import { SITE_URL } from "@/lib/seo";
import { QrScreen } from "./QrScreen";

export const metadata = { title: "Mon QR" };

/**
 * The QR — the front door of the whole product.
 *
 * It computes one thing: the address a customer lands on. The generated poster
 * kit that used to hang off this page (table tent, A5, sticker, story) is gone
 * — see QrScreen for why — and with it the shop's promise line, which existed
 * only to be printed on those objects.
 */
export default async function QrPage() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a valid session
  // and bounce straight back here, forever.
  if (!cafe) redirect(await ownerHome());

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

  return <QrScreen url={url} svg={svg} />;
}
