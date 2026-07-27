import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ownerCafe } from "@/lib/auth/owner";
import { businessType } from "@/lib/businessTypes";
import { getLoyaltyProgram } from "@/lib/data";
import { QrActions } from "./QrActions";

export const metadata = { title: "Mon QR" };

/**
 * The QR — the front door of the whole product.
 *
 * Rebuilt as the THING YOU PUT ON THE TABLE, not a bare code with a caption:
 * a real branded table tent (logo, name, the promise, the QR, the link) that
 * prints clean and downloads as a big PNG for a poster or a story. The promise
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
        <h1 className="text-[24px] font-extrabold text-charcoal">Mon QR</h1>
        <p className="mt-0.5 text-[13px] text-slate">
          Posez-le sur vos tables. C&apos;est par là que tout commence.
        </p>
      </div>

      {/* ── the table tent, exactly as it prints ───────────────────── */}
      <section className="o-card overflow-hidden print:border-0 print:shadow-none">
        <div className="bg-charcoal px-5 py-7 text-center text-white print:bg-white print:text-charcoal">
          <div className="flex items-center justify-center gap-2.5">
            {cafe.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
              <img src={cafe.logoUrl} alt="" className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/12 text-[18px] print:bg-lilac-2">
                {type.emoji}
              </span>
            )}
            <span className="text-[19px] font-extrabold">{cafe.name}</span>
          </div>

          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/55 print:text-slate">
            Carte de fidélité
          </p>
          <p className="mx-auto mt-1 max-w-[22ch] text-[21px] font-extrabold leading-tight">
            {promise}
          </p>

          {/* the code always sits on white so it always scans */}
          <div className="mx-auto mt-5 w-[210px] rounded-2xl bg-white p-4">
            <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>

          <p className="mt-4 text-[14px] font-bold">Scannez pour commencer</p>
          <p className="mt-0.5 text-[12px] text-white/60 print:text-slate">
            Sans application · en 10 secondes
          </p>

          <p className="mt-5 break-all font-mono text-[10px] tracking-[0.04em] text-white/40 print:text-slate">
            {url}
          </p>
        </div>
      </section>

      <QrActions url={url} svg={svg} name={cafe.name} />

      {/* ── where to put it ────────────────────────────────────────── */}
      <section className="o-card p-5 print:hidden">
        <h2 className="text-[13.5px] font-extrabold text-charcoal">Où le mettre</h2>
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
                <span className="block text-[13.5px] font-bold text-charcoal">{t}</span>
                <span className="block text-[12px] leading-snug text-slate">{d}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl bg-gold-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-gold-deep">
          Plus il est visible, plus vos clients s&apos;inscrivent. Imprimez-en
          plusieurs — un par table.
        </p>
      </section>
    </div>
  );
}
