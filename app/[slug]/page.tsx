import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GiftIcon } from "@/components/icons";
import { getCafe, getDiner, getRewards, nextRewardNudge } from "@/lib/data";
import { dinerWallet } from "@/lib/db";

/**
 * Accueil — the diner's home, in the mockup's shape:
 * greeting → the points card (big number, progress toward the next reward) on
 * the café-coloured gradient, then a white sheet with the counter codes and the
 * available offers. History, other cards and logout live in Profil.
 */
export default async function Accueil({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();

  const diner = await getDiner(cafe.id);
  if (!diner) redirect(`/${slug}/rejoindre`);

  /*
    Signed in, but is this a café they've actually joined? A diner who scans a
    NEW café's QR lands here directly — send them through /rejoindre to enroll
    (welcome bonus + passport) so the card never renders empty.
  */
  const wallet = await dinerWallet(diner.phone);
  if (!wallet.some((w) => w.slug === cafe.slug)) redirect(`/${slug}/rejoindre`);

  const rewards = await getRewards(cafe.id);

  const nudge = nextRewardNudge(diner.balance, rewards);
  const pct = nudge ? Math.round(nudge.progress * 100) : 100;
  const offers = [...rewards].sort((a, b) => a.pointsCost - b.pointsCost).slice(0, 4);

  return (
    <div className="flex flex-1 flex-col">
      {/* ── hero, on the café's colour ─────────────────────── */}
      <section className="px-5 pb-6 pt-2 text-white">
        <p className="text-[19px] font-extrabold leading-tight">
          👋 Bonjour {diner.name ?? "toi"}
        </p>
        <p className="mt-0.5 text-[13px] font-medium text-white/75">
          Voici ta carte de fidélité
        </p>

        {/* the points card — a frosted lavender inset over the brand colour */}
        <div className="mt-4 rounded-3xl bg-white/10 px-5 pb-5 pt-4 shadow-[0_18px_40px_-18px_rgba(0,0,0,.45)] ring-1 ring-white/20 backdrop-blur-sm">
          <p className="text-[12px] font-semibold text-white/75">Tes points</p>
          <p className="mt-1 flex items-center gap-2.5">
            <span className="text-[52px] font-extrabold leading-none tabular-nums">
              {diner.balance}
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-b from-[#ffe08a] to-[#f0a819] text-[15px] shadow-[0_4px_10px_rgba(0,0,0,.3)]">
              ⭐
            </span>
          </p>

          {nudge ? (
            <>
              <p className="mt-3 text-[13px] font-medium text-white/90">
                Encore <b>{nudge.needed} points</b> pour{" "}
                {nudge.target.label.toLowerCase()} !
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11.5px] font-semibold tabular-nums text-white/60">
                {diner.balance} / {nudge.target.pointsCost}
              </p>
            </>
          ) : rewards.length > 0 ? (
            <p className="mt-3 text-[13.5px] font-semibold text-white/95">
              ✦ Tu peux t&apos;offrir une récompense.
            </p>
          ) : (
            <p className="mt-3 text-[13px] font-medium text-white/75">
              Cumule des points — des offres arrivent bientôt.
            </p>
          )}
        </div>
      </section>

      {/* ── the white sheet ────────────────────────────────── */}
      <div className="flex-1 rounded-t-[28px] bg-white px-5 pb-6 pt-5">
        {/* codes to show at the counter */}
        {diner.codes.length > 0 && (
          <section className="mb-4">
            <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-slate">
              À montrer au comptoir
            </p>
            <ul className="space-y-2">
              {diner.codes.map((c) => (
                <li
                  key={c.code}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold-soft/50 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-bold text-charcoal">
                      {c.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium text-seal">
                      {expiresIn(c.expiresAt)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-charcoal px-2.5 py-1.5 font-mono text-[14px] font-bold tracking-[0.14em] text-white">
                    {c.code}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* offers preview — the reason to keep collecting */}
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-extrabold text-royal">
            Offres disponibles
          </h2>
          <Link
            href={`/${slug}/boutique`}
            className="text-[12.5px] font-bold text-royal2"
          >
            Voir tout
          </Link>
        </div>

        {offers.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-hair bg-lilac-2/60 px-4 py-5 text-center text-[13px] text-slate">
            Pas encore d&apos;offres — reviens bientôt.
          </p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {offers.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/${slug}/boutique`}
                  className="flex items-center gap-3.5 rounded-2xl border border-hair bg-white px-3.5 py-3 shadow-[0_8px_20px_-14px_rgba(40,18,59,.35)] active:scale-[0.99]"
                >
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
                    <img
                      src={r.imageUrl}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-charcoal text-white">
                      <GiftIcon className="h-5 w-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-charcoal">
                      {r.label}
                    </span>
                    <span className="block text-[12.5px] font-bold text-gold">
                      {r.pointsCost} points 🪙
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** "expire dans 5 h" — the countdown a diner needs before a code lapses. */
function expiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expiré";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `expire dans ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `expire dans ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "expire demain" : `expire dans ${d} j`;
}
