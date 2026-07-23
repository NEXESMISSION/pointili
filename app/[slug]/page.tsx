import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCafe, getDiner, getGame, getRewards, nextRewardNudge } from "@/lib/data";
import {
  dinerWallet,
  getActivity,
  nextPlayAt,
  type Activity,
  type WalletCafe,
} from "@/lib/db";
import { logoutDinerAction } from "./actions";

/**
 * Ma carte — the diner's home. Deliberately SIMPLE.
 *
 * One card per café. The account is global (phone + PIN); points are per-café.
 * The card is painted in the café's own colour and names it, so you always know
 * which shop you're looking at. Your other cafés sit at the bottom as switchable
 * cards. The reward catalogue lives in the Boutique — not here.
 */
export default async function MaCarte({
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
    NEW café's QR lands here directly (the QR points at /[slug], not /rejoindre),
    so they'd otherwise see an empty 0-point card and never get the welcome. If
    they're not in their wallet yet, send them through /rejoindre to enroll —
    which grants this café's welcome and records the passport, so the round-trip
    happens once and can't loop.
  */
  const wallet = await dinerWallet(diner.phone);
  if (!wallet.some((w) => w.slug === cafe.slug)) redirect(`/${slug}/rejoindre`);

  const [rewards, game] = await Promise.all([
    getRewards(cafe.id),
    getGame(cafe.id),
  ]);
  const [activity, next] = await Promise.all([
    getActivity(cafe.id, diner.phone),
    game ? nextPlayAt(game.id, diner.phone, game.cooldownHours) : Promise.resolve(null),
  ]);

  const nudge = nextRewardNudge(diner.balance, rewards);
  const canRedeem = rewards.some((r) => r.pointsCost <= diner.balance);
  const canSpin = Boolean(game) && !next;
  const pct = nudge ? Math.round(nudge.progress * 100) : 100;
  const others = wallet.filter((w) => w.slug !== cafe.slug);

  const color = cafe.primaryColor;

  return (
    <div className="space-y-4">
      {/* ── the card — in THIS café's colour, naming THIS café ─── */}
      <section
        className="rounded-3xl px-6 pt-5 pb-7 text-white"
        style={{
          backgroundImage: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color}, #000 45%))`,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-extrabold leading-tight">{cafe.name}</span>
          <span className="text-[11px] font-semibold text-white/70">
            {diner.name ?? "Membre"}
          </span>
        </div>
        <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
          Carte fidélité
        </span>

        <p className="mt-4 flex items-baseline gap-2">
          <span className="text-[52px] font-extrabold leading-none tabular-nums">
            {diner.balance}
          </span>
          <span className="text-[13px] font-semibold text-white/70">points</span>
        </p>

        {nudge ? (
          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-black/20">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2.5 text-[13.5px] leading-snug text-white/90">
              Encore <b className="text-white">{nudge.needed} points</b> pour{" "}
              {nudge.target.label.toLowerCase()}.
            </p>
          </div>
        ) : rewards.length > 0 ? (
          <p className="mt-5 text-[13.5px] font-semibold text-white/95">
            ✦ Tu peux t&apos;offrir une récompense.
          </p>
        ) : (
          <p className="mt-5 text-[13.5px] font-medium text-white/80">
            Cumule des points — des récompenses arrivent bientôt.
          </p>
        )}
      </section>

      {/* ── your free spin is ready ───────────────────────── */}
      {canSpin && (
        <Link
          href={`/${slug}/jeux`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-royal/30 bg-lilac px-4 py-4"
        >
          <span>
            <span className="block text-[15.5px] font-bold text-charcoal">
              Ton tour de roue t&apos;attend
            </span>
            <span className="block text-[12.5px] text-slate">
              Offert — tout le monde gagne.
            </span>
          </span>
          <span className="shrink-0 rounded-xl bg-royal px-4 py-2.5 text-[13px] font-bold text-white">
            Jouer ✦
          </span>
        </Link>
      )}

      {/* ── codes to show at the counter ──────────────────── */}
      {diner.codes.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
            À montrer au comptoir
          </p>
          <ul className="space-y-2">
            {diner.codes.map((c) => (
              <li
                key={c.code}
                className="flex items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold-soft/50 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-bold text-charcoal">
                    {c.label}
                  </span>
                  {/* The code silently vanishes when it lapses — say when, so the
                      diner doesn't lose points they already spent. */}
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

      {/* ── one line to the store, only if something's in reach ── */}
      {canRedeem && (
        <Link
          href={`/${slug}/boutique`}
          className="flex items-center justify-center gap-2 rounded-2xl bg-royal py-3.5 text-[14px] font-bold text-white active:scale-[0.99]"
        >
          Échanger mes points ✦
        </Link>
      )}

      {/* ── where the points came from ────────────────────── */}
      {activity.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
            Mon activité
          </p>
          <ul className="divide-y divide-hair rounded-2xl border border-hair bg-white px-4">
            {activity.map((a, i) => (
              <ActivityRow key={i} a={a} />
            ))}
          </ul>
        </section>
      )}

      {/* ── my other cafés — switch without re-scanning ───── */}
      {others.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
            Mes autres cartes
          </p>
          <ul className="space-y-2">
            {others.map((w) => (
              <WalletChip key={w.businessId} cafe={w} />
            ))}
          </ul>
        </section>
      )}

      <form action={logoutDinerAction.bind(null, slug)}>
        <button
          type="submit"
          className="w-full py-1 text-center text-[12px] text-slate"
        >
          Changer de compte
        </button>
      </form>
    </div>
  );
}

/** One switchable card for another café the diner belongs to. */
function WalletChip({ cafe }: { cafe: WalletCafe }) {
  return (
    <li>
      <Link
        href={`/${cafe.slug}`}
        className="flex items-center gap-3 rounded-2xl border border-hair bg-white px-3.5 py-3 active:scale-[0.99]"
      >
        {cafe.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, arbitrary host
          <img src={cafe.logoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] font-bold text-white"
            style={{ background: cafe.primaryColor }}
          >
            {cafe.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-bold text-charcoal">
            {cafe.name}
          </span>
          <span className="block text-[12px] text-slate">
            {cafe.balance} points
            {cafe.pendingWins + cafe.pendingRewards > 0 &&
              ` · ${cafe.pendingWins + cafe.pendingRewards} code(s)`}
          </span>
        </span>
        <span className="shrink-0 text-slate">›</span>
      </Link>
    </li>
  );
}

const LABELS: Record<Activity["reason"], string> = {
  earn: "Achat",
  welcome: "Bienvenue",
  redeem: "Échange",
  adjust: "Ajustement",
  expire: "Expiration",
  collected: "Récupéré",
};

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

/** "il y a 2 j" — elapsed time is the useful bit, not a raw date. */
function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
}

function ActivityRow({ a }: { a: Activity }) {
  // Collected items carry no points delta — they're a "you picked this up" line.
  if (a.reason === "collected") {
    return (
      <li className="flex items-center justify-between gap-3 py-3">
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-charcoal">
            Récupéré{a.label ? ` · ${a.label}` : ""}
          </span>
          <span className="block text-[11px] text-slate">{ago(a.at)}</span>
        </span>
        <span className="shrink-0 text-[12px] font-bold text-royal">✓ pris</span>
      </li>
    );
  }

  const positive = a.delta > 0;
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-charcoal">
          {LABELS[a.reason]}
        </span>
        <span className="block text-[11px] text-slate">{ago(a.at)}</span>
      </span>
      <span
        className={`shrink-0 text-[14px] font-bold tabular-nums ${
          positive ? "text-ok" : "text-slate"
        }`}
      >
        {positive ? "+" : ""}
        {a.delta}
      </span>
    </li>
  );
}
