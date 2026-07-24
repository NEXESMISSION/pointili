import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { ownerCafe } from "@/lib/auth/owner";
import { QrActions } from "./QrActions";

const STEPS = [
  ["Imprimez-le", "Le bouton est juste en dessous."],
  ["Posez-le sur vos tables", "Et au comptoir. Plus il est visible, plus vos clients s'inscrivent."],
  ["Vos clients scannent", "Leur carte de fidélité s'ouvre toute seule — sans rien installer."],
];

export const metadata = { title: "Mon QR" };

/**
 * The café's QR — the front door of the entire product.
 *
 * Everything starts with "scan the QR on the table" (§07), so the owner has to
 * be able to get it onto paper. Rendered as SVG, not PNG: it stays crisp at any
 * print size, which matters when this ends up on a table tent.
 */
export default async function QrPage() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a
  // valid session and bounce straight back here, forever.
  if (!cafe) redirect("/owner/nouveau");

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pointili.online";
  const url = `${base.replace(/\/$/, "")}/${cafe.slug}`;

  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#241C10", light: "#FCF8EF" },
  });

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <p className="ticket-label">◆ La porte d&apos;entrée</p>
        <h1 className="mt-1 font-display text-[26px]">Mon QR</h1>
        <p className="mt-1 text-[13px] text-mut">
          C&apos;est par là que tout commence. Voici comment l&apos;utiliser :
        </p>
      </div>

      {/* how to use — 3 steps, so a first-timer knows exactly what to do */}
      <ol className="space-y-2 print:hidden">
        {STEPS.map(([title, desc], i) => (
          <li
            key={i}
            className="o-card flex items-start gap-3 px-4 py-3.5"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-royal text-[12px] font-bold text-white">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-ink">{title}</span>
              <span className="block text-[12px] leading-snug text-mut">{desc}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* the printable table tent */}
      <section className="o-card px-5 py-6 text-center print:border-0 print:shadow-none">
        <p className="ticket-label">Carte fidélité</p>
        <p className="mt-1 font-display text-[22px]">{cafe.name}</p>

        <div
          className="mx-auto mt-4 w-[210px] [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <p className="mt-4 font-display text-[17px]">Scannez. Gagnez.</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">
          Des points à chaque visite, des récompenses à la clé.
        </p>

        <div className="tear mt-4" />
        <p className="mt-2 break-all font-mono text-[9.5px] tracking-[0.06em] text-faint">
          {url}
        </p>
      </section>

      <QrActions url={url} />

      <p className="rounded-xl border border-gold/40 bg-gold-soft px-3.5 py-2.5 text-[11.5px] leading-relaxed text-gold-deep print:hidden">
        Astuce : imprimez-le en A5 et posez-le sur chaque table. Plus il est
        visible, plus vos clients s&apos;inscrivent.
      </p>
    </div>
  );
}
