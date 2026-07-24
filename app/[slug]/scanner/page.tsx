import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getCafe, getDiner } from "@/lib/data";

export const metadata = { title: "Ma carte" };

/**
 * Scanner — the diner's "I'm here, give me my points" screen.
 *
 * In this system the CASHIER credits points at the till by phone number, so the
 * useful thing a diner can do at the counter is *show that number*. This screen
 * makes it unmissable: the number huge, plus a QR of it for a café that later
 * scans instead of types. Named "Scanner" to match the product mockup.
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

  // Encode the bare phone — a café that adds a scanner reads exactly what the
  // cashier would otherwise type.
  const qr = await QRCode.toString(diner.phone, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#1e1233", light: "#00000000" },
  });

  return (
    <div className="flex flex-1 flex-col">
      {/* ── hero ───────────────────────────────────────────── */}
      <section className="px-5 pb-6 pt-2 text-center text-white">
        <h1 className="text-[24px] font-extrabold">Gagne tes points</h1>
        <p className="mt-0.5 text-[13px] font-medium text-white/75">
          Montre ça au comptoir avant de payer.
        </p>
      </section>

      {/* ── the white sheet ────────────────────────────────── */}
      <div className="flex-1 rounded-t-[28px] bg-white px-5 pb-8 pt-7">
        <div className="mx-auto max-w-[300px] text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate">
            Mon numéro
          </p>
          <p className="mt-1 text-[30px] font-extrabold tabular-nums tracking-[0.02em] text-charcoal">
            {formatPhone(diner.phone)}
          </p>

          <div className="mx-auto mt-5 w-[190px] [&>svg]:h-auto [&>svg]:w-full">
            <div dangerouslySetInnerHTML={{ __html: qr }} />
          </div>

          <p className="mx-auto mt-5 max-w-[30ch] text-[13px] leading-relaxed text-slate">
            Le serveur entre ton numéro et tes points arrivent tout de suite —
            pas besoin de scanner.
          </p>

          <div className="mt-6 rounded-2xl bg-lilac-2/70 px-4 py-3.5 text-left">
            <p className="text-[12.5px] font-bold text-royal">Solde actuel</p>
            <p className="mt-0.5 text-[15px] font-extrabold text-charcoal">
              {diner.balance} points 🪙
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 24 123 456 → grouped, easier to read aloud to a cashier. */
function formatPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  // Tunisian 8-digit local numbers read best as 2-3-3.
  if (digits.length === 8) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  }
  return raw;
}
