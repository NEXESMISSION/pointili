import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCafe, getDiner } from "@/lib/data";
import { dinerWallet, getActivity, type Activity, type WalletCafe } from "@/lib/db";
import { logoutDinerAction } from "../actions";

export const metadata = { title: "Profil" };

/**
 * Profil — everything about the PERSON rather than today's visit: their
 * history at this café (incl. what they've collected), their cards at other
 * cafés, and switching account. Keeps Accueil focused on points + offers.
 */
export default async function Profil({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();

  const diner = await getDiner(cafe.id);
  if (!diner) redirect(`/${slug}/rejoindre`);

  const [activity, wallet] = await Promise.all([
    getActivity(cafe.id, diner.phone),
    dinerWallet(diner.phone),
  ]);
  const others = wallet.filter((w) => w.slug !== cafe.slug);

  return (
    <div className="flex flex-1 flex-col">
      {/* ── hero ───────────────────────────────────────────── */}
      <section className="px-5 pb-6 pt-2 text-white">
        <div className="flex items-center gap-3.5">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-[22px] font-extrabold ring-1 ring-white/25">
            {(diner.name ?? "M").charAt(0).toUpperCase()}
          </span>
          <span>
            <span className="block text-[19px] font-extrabold leading-tight">
              {diner.name ?? "Membre"}
            </span>
            <span className="block text-[13px] font-medium text-white/70">
              {diner.phone}
            </span>
          </span>
        </div>
      </section>

      {/* ── the white sheet ────────────────────────────────── */}
      <div className="flex-1 rounded-t-[28px] bg-white px-5 pb-6 pt-5">
        {/* which cards I hold — the current one marked, the rest one tap away.
            This is the answer to "which café am I on, and how do I switch?" */}
        <h2 className="text-[15px] font-extrabold text-royal">
          {others.length > 0 ? "Mes cartes" : "Ma carte"}
        </h2>
        <ul className="mt-2.5 space-y-2">
          {/* the card you're looking at right now */}
          <li className="flex items-center gap-3 rounded-2xl border-2 border-royal/35 bg-lilac-2/50 px-3.5 py-3">
            {cafe.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
              <img src={cafe.logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
            ) : (
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white"
                style={{ background: cafe.primaryColor }}
              >
                {cafe.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold text-charcoal">
                {cafe.name}
              </span>
              <span className="block text-[12px] font-bold text-gold">
                {diner.balance} points 🪙
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-royal px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.04em] text-white">
              Actuelle
            </span>
          </li>
          {others.map((w) => (
            <WalletChip key={w.businessId} cafe={w} />
          ))}
        </ul>

        {/* history at THIS café */}
        <h2 className="mt-6 text-[15px] font-extrabold text-royal">Mon activité</h2>
        {activity.length === 0 ? (
          <p className="mt-2.5 rounded-2xl border border-hair bg-lilac-2/60 px-4 py-5 text-center text-[13px] text-slate">
            Rien pour l&apos;instant — tes points et tes cadeaux s&apos;afficheront ici.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-hair">
            {activity.map((a, i) => (
              <ActivityRow key={i} a={a} />
            ))}
          </ul>
        )}

        <form action={logoutDinerAction.bind(null, slug)} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-2xl border border-hair py-3 text-[13px] font-bold text-slate active:scale-[0.99]"
          >
            Changer de compte
          </button>
        </form>
      </div>
    </div>
  );
}

/** One switchable card for another café the diner belongs to. */
function WalletChip({ cafe }: { cafe: WalletCafe }) {
  return (
    <li>
      <Link
        href={`/${cafe.slug}`}
        className="flex items-center gap-3 rounded-2xl border border-hair bg-white px-3.5 py-3 shadow-[0_8px_20px_-14px_rgba(40,18,59,.35)] active:scale-[0.99]"
      >
        {cafe.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, arbitrary host
          <img src={cafe.logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
        ) : (
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white"
            style={{ background: cafe.primaryColor }}
          >
            {cafe.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-bold text-charcoal">
            {cafe.name}
          </span>
          <span className="block text-[12px] font-bold text-gold">
            {cafe.balance} points 🪙
            {cafe.pendingWins + cafe.pendingRewards > 0 && (
              <span className="font-semibold text-slate">
                {" "}· {cafe.pendingWins + cafe.pendingRewards} code(s)
              </span>
            )}
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
