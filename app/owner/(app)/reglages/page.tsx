import { redirect } from "next/navigation";
import { currentOwner, ownerCafe } from "@/lib/auth/owner";
import { getLoyaltyProgram, getRewards } from "@/lib/data";
import { remaining } from "@/lib/platform";
import { logoutAction } from "../../(auth)/login/actions";
import { CafeForm, EarnForm, RewardsEditor } from "./SettingsForms";

export const metadata = { title: "Réglages" };

const PLAN_LABEL: Record<string, string> = {
  trial: "essai",
  pro: "pro",
  free: "gratuite",
};

/**
 * The control panel (§09) — points-only MVP.
 *
 * One section per question the owner actually asks: "comment ils gagnent des
 * points ?", "qu'est-ce qu'ils gagnent ?", "à quoi ressemble ma carte ?". Each
 * has a plain-French title + a one-line subtitle; nothing is required to start.
 */
export default async function Reglages() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a valid session
  // and bounce straight back here, forever.
  if (!cafe) redirect("/owner/nouveau");

  const left = remaining(cafe.planExpiresAt);
  const [owner, program, rewards] = await Promise.all([
    currentOwner(),
    getLoyaltyProgram(cafe.id),
    getRewards(cafe.id),
  ]);

  return (
    <div className="space-y-5">
      <div className="px-1">
        <h1 className="text-[24px] font-extrabold text-charcoal">Réglages</h1>
        <p className="mt-0.5 text-[13px] text-slate">
          Tout est déjà prêt — changez seulement ce que vous voulez.
        </p>
      </div>

      <Section
        title="Les points"
        subtitle="Comment vos clients gagnent des points, à la caisse."
      >
        <EarnForm cafe={cafe} program={program} />
      </Section>

      <Section
        title="Les récompenses"
        subtitle="Ce que vos clients échangent contre leurs points."
      >
        <p className="border-b border-hair/60 px-4 py-2.5 text-[12px] leading-snug text-slate">
          Du plus accessible au plus désirable. Visez un premier palier atteignable
          en 2–3 visites — c&apos;est lui qui fait revenir.
        </p>
        <RewardsEditor rewards={rewards} />
      </Section>

      <Section
        title="Ma boutique"
        subtitle="Le logo, le nom et la couleur que voient vos clients."
      >
        <CafeForm cafe={cafe} />
      </Section>

      {/* The owner's own plan — always visible, not only once it's nearly too
          late. "When does this stop working, and what am I on?" should never
          require asking. */}
      <Section title="Abonnement" tag={PLAN_LABEL[cafe.plan]}>
        <div className="flex items-start justify-between gap-3 px-4 py-3.5">
          <span>
            <span className="block text-[13.5px] font-semibold text-charcoal">
              Formule {PLAN_LABEL[cafe.plan]}
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-slate">
              {left.unlimited
                ? "Sans limite de date."
                : left.expired
                  ? "Vos clients ne peuvent plus scanner."
                  : "Temps restant avant expiration."}
            </span>
          </span>
          <span
            className={`shrink-0 whitespace-nowrap font-mono text-[13px] font-bold ${
              left.expired ? "text-seal" : left.soon && !left.unlimited ? "text-gold-deep" : "text-ok"
            }`}
          >
            {left.label}
          </span>
        </div>
        {cafe.planExpiresAt && (
          <p className="border-t border-hair/60 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate/70">
            Expire le{" "}
            {new Date(cafe.planExpiresAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
      </Section>

      <Section title="Compte" tag={owner?.role === "super_admin" ? "super-admin" : "propriétaire"}>
        <div className="px-4 py-3.5">
          <p className="font-mono text-[12px] text-charcoal">{owner?.email ?? "—"}</p>
          <p className="mt-0.5 font-mono text-[10.5px] text-slate">pointili.online/{cafe.slug}</p>
          {/* Being signed in with no way out is a trap — the owner app had no
              logout at all until this. */}
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="w-full rounded-xl border border-hair py-2.5 text-[12px] font-bold text-slate active:scale-[0.98]"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  tag,
  children,
}: {
  title: string;
  subtitle?: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="o-card overflow-hidden">
      <div className="border-b border-hair px-4 py-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[17px] font-extrabold text-charcoal">{title}</h2>
          {tag && (
            <span className="ml-auto rounded-full bg-lilac px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-royal">
              {tag}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-0.5 text-[12px] leading-snug text-slate">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
