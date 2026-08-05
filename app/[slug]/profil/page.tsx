import Link from "next/link";
import { CafeClosed } from "@/components/CafeClosed";
import { notFound, redirect } from "next/navigation";
import { GiftIcon, HistoryIcon, ScanIcon, StampIcon } from "@/components/icons";
import { businessType } from "@/lib/businessTypes";
import { getCafe, getMember } from "@/lib/data";
import { logoutDinerAction } from "../actions";
import { fmtPoints } from "@/lib/points";

export const metadata = { title: "Profil" };

/**
 * Profil — the diner's hub. Who they are, quick access to everything they'd want
 * (their code, the offers, history, all their cards), the current card summary,
 * and signing out. No dead ends.
 */
export default async function Profil({
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

  const type = businessType(cafe.businessType);
  const pendingCodes = diner.codes.length;

  const actions = [
    { href: `/${slug}/scanner`, Icon: ScanIcon, label: "Montrer ma carte", hint: "M'identifier au comptoir" },
    {
      href: `/${slug}/codes`,
      Icon: StampIcon,
      label: "À récupérer",
      hint: pendingCodes > 0 ? `${pendingCodes} code${pendingCodes > 1 ? "s" : ""} en attente` : "Aucun code",
    },
    { href: `/${slug}/boutique`, Icon: GiftIcon, label: "Récompenses", hint: "Échanger mes points" },
    { href: `/${slug}/historique`, Icon: HistoryIcon, label: "Historique", hint: "Mes points & récompenses" },
  ];

  return (
    <div className="flex flex-1 flex-col px-5 pb-6">
      {/* who */}
      <section className="flex items-center gap-3.5 pb-5 pt-3">
        <span
          className="grid h-14 w-14 place-items-center rounded-full text-[20px] font-extrabold"
          style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
        >
          {(diner.name ?? "M").charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[17px] font-extrabold leading-tight text-charcoal">
            {diner.name ?? "Membre"}
          </span>
          <span className="block text-[13px] font-medium text-slate">{diner.phone}</span>
          {/*
            The code sits with the NAME and the NUMBER because it is an account
            fact, the same four characters at every shop. It used to live under
            "Cette carte", which now reads as a bug: the identical code would
            appear beneath every shop's panel.
          */}
          <span
            className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ background: "var(--cafe-soft)" }}
          >
            <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate">
              Mon code client
            </span>
            <span
              className="font-mono text-[13px] font-bold tracking-[0.14em]"
              style={{ color: "var(--cafe-text)" }}
            >
              {diner.code}
            </span>
          </span>
        </span>
      </section>

      {/* quick actions */}
      <ul className="grid grid-cols-2 gap-2.5">
        {actions.map(({ href, Icon, label, hint }) => (
          <li key={href}>
            <Link
              href={href}
              className="d-card flex h-full flex-col gap-2 px-4 py-3.5 active:scale-[0.98]"
            >
              <span
                className="grid h-9 w-9 place-items-center rounded-xl"
                style={{ background: "var(--cafe-soft)", color: "var(--cafe-text)" }}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span>
                <span className="block text-[14px] font-bold text-charcoal">{label}</span>
                <span className="block text-[11px] text-slate">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* current card summary */}
      <h2 className="mt-6 text-[14px] font-extrabold text-charcoal">Cette carte</h2>
      <div className="d-card mt-2.5 flex items-center gap-3 px-3.5 py-3">
        {cafe.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
          <img src={cafe.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
        ) : (
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[17px]"
            style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
          >
            {type.emoji}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold text-charcoal">{cafe.name}</span>
          <span className="block text-[11.5px] font-medium text-slate">
            {type.label} · {fmtPoints(diner.balance)} pts
          </span>
        </span>
      </div>

      <Link
        href={`/cartes?from=${slug}`}
        className="d-card mt-2.5 flex items-center justify-center gap-2 py-3 text-[13px] font-bold text-charcoal active:scale-[0.99]"
      >
        Voir toutes mes cartes →
      </Link>

      <form action={logoutDinerAction.bind(null, slug)} className="mt-6">
        <button
          type="submit"
          className="w-full rounded-2xl border border-[var(--line-strong)] py-3 text-[13px] font-bold text-slate active:scale-[0.99]"
        >
          Changer de compte
        </button>
      </form>
    </div>
  );
}
