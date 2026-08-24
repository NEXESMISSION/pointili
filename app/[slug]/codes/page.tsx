import { notFound, redirect } from "next/navigation";
import { CafeClosed } from "@/components/CafeClosed";
import { getCafe, getMember } from "@/lib/data";
import { codeQr } from "@/lib/qr";
import { currentLang, t as translation } from "@/lib/i18n";
import { CodeTickets } from "./CodeTickets";

export const metadata = { title: "Mes codes" };

/**
 * Every code the diner has to collect at the counter, in one place — rewards
 * they bought, and full stamp cards. Kept separate from the card itself so the
 * "what do I still have to pick up?" list is never buried.
 *
 * THE PICTURES LIVE IN THE SHEET, NOT IN THE LIST. This page used to print
 * every code as a full ticket, QR and all, stacked down the screen: three
 * rewards meant three scannable pictures inside a few centimetres of glass, and
 * a camera does not ask which one you meant. See CodeTickets.
 */
export default async function Codes({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();
  // Re-checked per PAGE, not just in the layout: Next does not re-run a layout
  // on client-side transitions, so a shop that went dark mid-session kept
  // serving every screen.
  if (!cafe.live) return <CafeClosed name={cafe.name} />;

  const diner = await getMember(cafe.id);
  if (!diner) redirect(`/${slug}/rejoindre`);

  /*
    Every code still gets its PICTURE, drawn here on the server.

    Reading six characters out loud across a counter is the slowest part of
    collecting a reward, and the part that goes wrong: "B" and "8", "0" and "O",
    in a queue, over a coffee machine. What changed is WHEN it is on screen —
    one at a time, in the sheet the customer opened — not whether it exists.
  */
  const codes = await Promise.all(
    diner.codes.map(async (c) => ({ ...c, qr: await codeQr(c.code) })),
  );

  const t = await translation();
  const lang = await currentLang();

  return (
    <div className="flex flex-1 flex-col px-5 pb-6">
      {/* The bar above already says "Mes codes". What is left is the one line
          the bar cannot carry: what to DO with these. */}
      <p className="pb-4 pt-3 text-[13px] text-slate">
        {codes.length > 0
          ? t("Ouvre une récompense, puis fais scanner son QR au comptoir.")
          : t("Fais scanner le QR au comptoir — rien à dicter.")}
      </p>

      <CodeTickets codes={codes} lang={lang} />
    </div>
  );
}
