import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getCafe, getDiner } from "@/lib/data";

export const metadata = { title: "Ma carte" };

/**
 * The diner's "I'm here" screen. Staff scans this QR (or types the short 4-char
 * CODE) to credit points / add a stamp — so it encodes the per-shop code, never
 * the phone number. The phone is never shown here or to the cashier.
 */
export default async function Scanner({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();

  const diner = await getDiner(cafe.id);
  if (!diner) redirect(`/${slug}/rejoindre`);

  const qr = await QRCode.toString(diner.code, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#1e1233", light: "#00000000" },
  });

  return (
    <div className="flex flex-1 flex-col px-5 pb-8">
      <section className="pb-5 pt-3 text-center">
        <h1 className="text-[24px] font-extrabold">Ma carte</h1>
        <p className="mt-0.5 text-[13px] text-white/60">Montre ce code au comptoir.</p>
      </section>

      <div className="mx-auto w-full max-w-[320px] rounded-3xl bg-white px-6 pb-7 pt-6 text-center shadow-[0_24px_48px_-24px_rgba(0,0,0,.7)]">
        <div className="mx-auto w-[200px] [&>svg]:h-auto [&>svg]:w-full">
          <div dangerouslySetInnerHTML={{ __html: qr }} />
        </div>
        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate">Mon code</p>
        <p className="mt-1 font-mono text-[32px] font-extrabold tracking-[0.3em] text-charcoal">
          {diner.code}
        </p>
        <p className="mx-auto mt-4 max-w-[30ch] text-[12.5px] leading-relaxed text-slate">
          Le serveur scanne ce QR (ou saisit le code) — pas besoin de donner ton numéro.
        </p>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[320px] rounded-2xl bg-white/[0.07] px-4 py-3.5 text-center ring-1 ring-white/10">
        <p className="text-[12.5px] font-bold text-white/70">Solde actuel</p>
        <p className="mt-0.5 text-[15px] font-extrabold text-white">{diner.balance} points 🪙</p>
      </div>
    </div>
  );
}
