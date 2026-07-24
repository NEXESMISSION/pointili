import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCafe, getDiner } from "@/lib/data";
import { dinerWallet, type WalletCafe } from "@/lib/db";
import { logoutDinerAction } from "../actions";

export const metadata = { title: "Profil" };

/**
 * Profil — the PERSON: who they are, every card they hold (with a one-tap switch
 * to another café), and signing out. Activity lives on Historique now.
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

  const wallet = await dinerWallet(diner.phone);
  const others = wallet.filter((w) => w.slug !== cafe.slug);

  return (
    <div className="flex flex-1 flex-col px-5 pb-6">
      {/* who */}
      <section className="flex items-center gap-3.5 pb-5 pt-3">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-white/12 text-[22px] font-extrabold ring-1 ring-white/20">
          {(diner.name ?? "M").charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[19px] font-extrabold leading-tight">
            {diner.name ?? "Membre"}
          </span>
          <span className="block text-[13px] font-medium text-white/55">{diner.phone}</span>
        </span>
      </section>

      {/* cards */}
      <h2 className="text-[15px] font-extrabold text-white">
        {others.length > 0 ? "Mes cartes" : "Ma carte"}
      </h2>
      <ul className="mt-2.5 space-y-2">
        {/* the card you're on right now */}
        <li className="flex items-center gap-3 rounded-2xl border-2 border-white/30 bg-white/[0.08] px-3.5 py-3">
          <CardBadge name={cafe.name} logoUrl={cafe.logoUrl} color={cafe.primaryColor} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-bold text-white">{cafe.name}</span>
            <span className="block text-[12px] font-bold text-[#ffd27a]">{diner.balance} points 🪙</span>
          </span>
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.04em] text-charcoal">
            Actuelle
          </span>
        </li>
        {others.map((w) => (
          <WalletChip key={w.businessId} cafe={w} />
        ))}
      </ul>

      <form action={logoutDinerAction.bind(null, slug)} className="mt-6">
        <button
          type="submit"
          className="w-full rounded-2xl border border-white/20 py-3 text-[13px] font-bold text-white/80 active:scale-[0.99]"
        >
          Changer de compte
        </button>
      </form>
    </div>
  );
}

function CardBadge({ name, logoUrl, color }: { name: string; logoUrl: string | null; color: string }) {
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
    <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
  ) : (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white"
      style={{ background: color }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** One switchable card for another café the diner belongs to. */
function WalletChip({ cafe }: { cafe: WalletCafe }) {
  return (
    <li>
      <Link
        href={`/${cafe.slug}`}
        className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.06] px-3.5 py-3 active:scale-[0.99]"
      >
        <CardBadge name={cafe.name} logoUrl={cafe.logoUrl} color={cafe.primaryColor} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-bold text-white">{cafe.name}</span>
          <span className="block text-[12px] font-bold text-[#ffd27a]">
            {cafe.balance} points 🪙
            {cafe.pendingWins + cafe.pendingRewards > 0 && (
              <span className="font-semibold text-white/55">
                {" "}
                · {cafe.pendingWins + cafe.pendingRewards} code(s)
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-white/40">›</span>
      </Link>
    </li>
  );
}
