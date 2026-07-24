import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getCafe, getDiner } from "@/lib/data";

export const metadata = { title: "Ma carte" };

/**
 * The diner's "I'm here, give me my points/stamp" screen. Staff credits by phone
 * number at the till, so the useful thing to show is that number — big — plus a
 * QR of it for a café that later scans instead of types.
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

  // A QR needs dark-on-light to scan, so it lives on a white card.
  const qr = await QRCode.toString(diner.phone, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#1e1233", light: "#00000000" },
  });

  return (
    <div className="flex flex-1 flex-col px-5 pb-8">
      <section className="pb-5 pt-3 text-center">
        <h1 className="text-[24px] font-extrabold">Gagne tes points</h1>
        <p className="mt-0.5 text-[13px] text-white/60">Montre ça au comptoir avant de payer.</p>
      </section>

      <div className="mx-auto w-full max-w-[320px] rounded-3xl bg-white px-6 pb-7 pt-6 text-center shadow-[0_24px_48px_-24px_rgba(0,0,0,.7)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate">Mon numéro</p>
        <p className="mt-1 text-[28px] font-extrabold tabular-nums tracking-[0.02em] text-charcoal">
          {formatPhone(diner.phone)}
        </p>
        <div className="mx-auto mt-5 w-[180px] [&>svg]:h-auto [&>svg]:w-full">
          <div dangerouslySetInnerHTML={{ __html: qr }} />
        </div>
        <p className="mx-auto mt-5 max-w-[30ch] text-[12.5px] leading-relaxed text-slate">
          Le serveur entre ton numéro et tes points arrivent tout de suite.
        </p>
      </div>

      <div className="mx-auto mt-4 w-full max-w-[320px] rounded-2xl bg-white/[0.07] px-4 py-3.5 text-center ring-1 ring-white/10">
        <p className="text-[12.5px] font-bold text-white/70">Solde actuel</p>
        <p className="mt-0.5 text-[15px] font-extrabold text-white">{diner.balance} points 🪙</p>
      </div>
    </div>
  );
}

/** 24 123 456 → grouped, easier to read aloud to a cashier. */
function formatPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  }
  return raw;
}
