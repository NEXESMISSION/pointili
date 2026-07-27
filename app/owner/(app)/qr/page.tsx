import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ownerCafe } from "@/lib/auth/owner";
import { businessType } from "@/lib/businessTypes";
import { getLoyaltyProgram } from "@/lib/data";
import { PrintKit } from "./PrintKit";

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
  if (!cafe) redirect("/owner/nouveau");

  const program = await getLoyaltyProgram(cafe.id);
  const type = businessType(cafe.businessType);

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pointili.online";
  const url = `${base.replace(/\/$/, "")}/${cafe.slug}`;

  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#1a1330", light: "#00000000" },
  });

  // What the customer gets — read from the shop's real settings, never invented.
  const promise = program.stampsEnabled
    ? `${program.stampsRequired} visites = ${program.stampReward.toLowerCase()}`
    : program.welcomePoints > 0
      ? `${program.welcomePoints} points offerts à l'inscription`
      : "Cumulez des points à chaque visite";

  return (
    <div className="space-y-3.5">
      <div className="px-1 print:hidden">
        <h1 className="text-[24px] font-extrabold text-white">Mon QR</h1>
        <p className="mt-0.5 text-[13px] text-white/55">
          Posez-le sur vos tables. C&apos;est par là que tout commence.
        </p>
      </div>

      <PrintKit
        url={url}
        svg={svg}
        name={cafe.name}
        logoUrl={cafe.logoUrl}
        emoji={type.emoji}
        promise={promise}
      />

      {/* ── where to put it ────────────────────────────────────────── */}
      <section className="a-card p-5 print:hidden">
        <h2 className="text-[13.5px] font-extrabold text-white">Où le mettre</h2>
        <ul className="mt-2.5 space-y-2.5">
          {[
            ["Sur chaque table", "C'est là qu'ils ont le temps de scanner."],
            ["Au comptoir", "Juste à côté de la caisse, visible en payant."],
            ["Sur la vitrine", "Les passants voient que vous avez une carte."],
            ["En story / bio", "Utilisez « Télécharger », puis publiez l'image."],
          ].map(([t, d]) => (
            <li key={t} className="flex items-start gap-2.5">
              <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-royal" />
              <span>
                <span className="block text-[13.5px] font-bold text-white">{t}</span>
                <span className="block text-[12px] leading-snug text-white/55">{d}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl bg-[#ffd27a]/12 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#ffd27a]">
          Plus il est visible, plus vos clients s&apos;inscrivent. Imprimez-en
          plusieurs — un par table.
        </p>
      </section>
    </div>
  );
}
