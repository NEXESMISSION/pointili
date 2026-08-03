import { notFound, redirect } from "next/navigation";
import { CafeClosed } from "@/components/CafeClosed";
import { GiftIcon } from "@/components/icons";
import { getCafe, getMember } from "@/lib/data";
import { codeQr } from "@/lib/qr";

export const metadata = { title: "Mes codes" };

const KIND_LABEL: Record<string, string> = {
  win: "Gain",
  reward: "Récompense",
  stamp: "Carte pleine",
};

/**
 * Every code the diner has to collect at the counter, in one place — rewards
 * they bought, and full stamp cards. Kept separate from the card itself so the
 * "what do I still have to pick up?" list is never buried.
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
    Every code gets its PICTURE, drawn here on the server.

    Reading six characters out loud across a counter is the slowest part of
    collecting a reward, and the part that goes wrong: "B" and "8", "0" and "O",
    in a queue, over a coffee machine. The till already has a camera on this
    exact screen — it just had nothing to point at. Now it does, and the printed
    code stays underneath for when a lens will not focus.
  */
  const codes = await Promise.all(
    diner.codes.map(async (c) => ({ ...c, qr: await codeQr(c.code) })),
  );

  return (
    <div className="flex flex-1 flex-col px-5 pb-6">
      <section className="pb-4 pt-3">
        <h1 className="text-[21px] font-extrabold">Mes codes</h1>
        <p className="mt-0.5 text-[13px] text-white/60">
          Fais scanner le QR au comptoir — rien à dicter.
        </p>
      </section>

      {codes.length === 0 ? (
        <div className="d-card px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/12">
            <GiftIcon className="h-6 w-6 text-white" />
          </span>
          <p className="mt-3 text-[14px] font-bold text-white">Aucun code en attente</p>
          <p className="mx-auto mt-1 max-w-[28ch] text-[13px] text-white/60">
            Échange tes points dans les Récompenses — le code apparaîtra ici.
          </p>
        </div>
      ) : (
        /*
          ONE TICKET PER CODE, in the same shape as the card screen's ticket:
          what it is on top, a perforation, and the pass zone underneath.

          The row used to be a name beside a small white chip holding the code —
          which said "here is a reference number", so people read it out. A pass
          zone with a QR in it says "hold this up", which is the faster thing
          and the thing the till is built for.
        */
        <ul className="stagger space-y-3">
          {codes.map((c, i) => (
            <li
              key={c.code}
              style={{ ["--i" as string]: i }}
              className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.05]"
            >
              <div className="px-4 pb-3 pt-3.5">
                <span className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-white/50">
                  {KIND_LABEL[c.kind] ?? "Récompense"}
                </span>
                <span className="mt-0.5 block truncate text-[15px] font-bold text-white">
                  {c.label}
                </span>
                {/*
                  No countdown, because there is nothing to count down to
                  (0031). This line used to read "expire dans 5 h" and, once
                  the column went null, "expiré" — on a code that is perfectly
                  valid, to the customer holding it. The reassurance a code
                  needs now is that it does NOT run out, and the quietest way
                  to say that is to stop mentioning time at all.
                */}
              </div>

              <div aria-hidden className="mx-4 border-t-2 border-dashed border-white/15" />

              {/* the pass zone — white, because that is the polarity every
                  decoder is promised, and because it reads as "detachable" */}
              <div className="flex items-center gap-4 bg-white px-4 py-4">
                <div
                  className="w-[86px] shrink-0 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: c.qr }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#17121f]/45">
                    À scanner au comptoir
                  </p>
                  {/* kept, and kept BIG: a scratched lens, a dead battery, a
                      shop whose only phone is in someone's pocket */}
                  <p className="mt-1 font-mono text-[26px] font-extrabold leading-none tracking-[0.14em] text-[#4c2fd6]">
                    {c.code}
                  </p>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-[#17121f]/55">
                    Ou dicte le code — les deux marchent.
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

