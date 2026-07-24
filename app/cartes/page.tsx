import Link from "next/link";
import { redirect } from "next/navigation";
import { currentDiner } from "@/lib/auth/diner";
import { businessType } from "@/lib/businessTypes";
import { dinerWallet, type WalletCafe } from "@/lib/db";

export const metadata = { title: "Mes cartes" };
export const dynamic = "force-dynamic";

/**
 * The wallet — every shop the diner holds a card at, as small colour-coded
 * boxes. It's the home base above any single café: tap a box to open that
 * shop's card. The account is global (one phone), the cards are per shop, so
 * this is where "which card, and switch to it" is answered in one screen.
 */
export default async function Cartes() {
  const phone = await currentDiner();
  // Signing in is per-shop (scan a QR), so there's nothing to show signed-out.
  if (!phone) redirect("/");

  const cards = await dinerWallet(phone);

  return (
    <div
      className="app-shell flex min-h-dvh flex-col px-5 pb-10 pt-7 text-white"
      style={{
        backgroundColor: "#0f0a1c",
        backgroundImage:
          "radial-gradient(120% 55% at 50% -8%, #3a2a6b 0%, transparent 62%), linear-gradient(180deg, #241546 0%, #150c2b 55%, #0a0614 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <header className="pb-5">
        <h1 className="text-[27px] font-extrabold">Mes cartes</h1>
        <p className="mt-0.5 text-[13px] text-white/60">
          {cards.length} carte{cards.length === 1 ? "" : "s"} de fidélité
        </p>
      </header>

      {cards.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-white/12 bg-white/[0.06] px-6 py-12 text-center">
          <p className="text-[15px] font-bold">Aucune carte pour l&apos;instant</p>
          <p className="mx-auto mt-1.5 max-w-[28ch] text-[13px] text-white/60">
            Scanne le QR d&apos;un commerce pour ajouter ta première carte de fidélité.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <CardBox key={c.businessId} card={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** One shop card, tinted with that shop's own colour. */
function CardBox({ card }: { card: WalletCafe }) {
  const t = businessType(card.businessType);
  const pending = card.pendingWins + card.pendingRewards;

  return (
    <li>
      <Link
        href={`/${card.slug}`}
        className="flex aspect-[5/6] flex-col justify-between rounded-3xl p-4 ring-1 ring-white/10 transition active:scale-[0.98]"
        style={{
          backgroundImage: `linear-gradient(150deg, color-mix(in oklab, ${card.primaryColor}, #000 14%) 0%, color-mix(in oklab, ${card.primaryColor}, #000 52%) 100%)`,
        }}
      >
        <div className="flex items-start justify-between">
          {card.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
            <img src={card.logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/25" />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 text-[22px] ring-1 ring-white/20">
              {t.emoji}
            </span>
          )}
          {pending > 0 && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-charcoal">
              {pending}
            </span>
          )}
        </div>

        <div>
          <p className="truncate text-[15px] font-extrabold leading-tight">{card.name}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-white/60">
            {t.emoji} {t.label}
          </p>
          <p className="mt-2 text-[13px] font-bold text-white/90">
            {card.balance} pts
            {card.stamps > 0 && <span className="font-semibold text-white/60"> · {card.stamps} tampons</span>}
          </p>
        </div>
      </Link>
    </li>
  );
}
