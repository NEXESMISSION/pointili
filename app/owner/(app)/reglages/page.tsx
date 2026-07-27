import { redirect } from "next/navigation";
import { currentOwner, ownerCafe } from "@/lib/auth/owner";
import { businessType } from "@/lib/businessTypes";
import { getLoyaltyProgram, getRewards } from "@/lib/data";
import { remaining } from "@/lib/platform";
import { logoutAction } from "../../(auth)/login/actions";
import { CafeForm, EarnForm, RewardsEditor, StampsForm } from "./SettingsForms";

export const metadata = { title: "Réglages" };

const PLAN_LABEL: Record<string, string> = { trial: "Essai", pro: "Pro", free: "Gratuite" };

/**
 * Réglages — rebuilt around a summary, not a form dump.
 *
 * The old page was six identical accordions: the owner had to open each one
 * just to remember what their own programme did. Now the first card answers
 * that in one glance ("1 point par dinar · première récompense à 40 points"),
 * and the sections below are short, always visible, and ordered by how often
 * they're actually touched.
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

  const cheapest = [...rewards].sort((a, b) => a.pointsCost - b.pointsCost)[0];
  const type = businessType(cafe.businessType);

  return (
    <div className="space-y-3.5">
      <div className="px-1">
        <h1 className="text-[24px] font-extrabold text-white">Réglages</h1>
        <p className="mt-0.5 text-[13px] text-white/55">
          Tout marche déjà — changez seulement ce que vous voulez.
        </p>
      </div>

      {/* ── your programme, in one glance ──────────────────────────── */}
      <section className="a-card p-5">
        <div className="flex items-center gap-3">
          {cafe.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
            <img src={cafe.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-[20px]">
              {type.emoji}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[16px] font-extrabold text-white">{cafe.name}</p>
            <p className="text-[11.5px] text-white/55">
              {type.label} · pointili.online/{cafe.slug}
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 border-t border-white/12 pt-3.5">
          <Fact label="Gain" value={`${program.pointsPerTnd} point${program.pointsPerTnd > 1 ? "s" : ""} par dinar`} />
          {program.welcomePoints > 0 && (
            <Fact label="Bienvenue" value={`${program.welcomePoints} points offerts`} />
          )}
          <Fact
            label="1ʳᵉ récompense"
            value={cheapest ? `${cheapest.label} · ${cheapest.pointsCost} pts` : "aucune — ajoutez-en une"}
            warn={!cheapest}
          />
          <Fact
            label="Tampons"
            value={
              program.stampsEnabled
                ? `${program.stampsRequired} visites = ${program.stampReward}`
                : "désactivés"
            }
          />
        </ul>
      </section>

      <Card title="Les points" sub="Ce que chaque dinar rapporte.">
        <EarnForm cafe={cafe} program={program} />
      </Card>

      <Card
        title="Les récompenses"
        sub="Visez une première récompense atteignable en 2–3 visites."
      >
        <RewardsEditor rewards={rewards} />
      </Card>

      <Card title="Carte à tampons" sub="Une visite = un tampon. En plus des points, si vous voulez.">
        <StampsForm program={program} />
      </Card>

      <Card title="Ma boutique" sub="Le logo, le nom et le type que voient vos clients.">
        <CafeForm cafe={cafe} />
      </Card>

      {/* ── account + plan, compact ────────────────────────────────── */}
      <section className="a-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13.5px] font-extrabold text-white">
              Formule {PLAN_LABEL[cafe.plan] ?? cafe.plan}
            </p>
            <p className="mt-0.5 truncate font-mono text-[11.5px] text-white/55">{owner?.email ?? "—"}</p>
          </div>
          <span
            className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${
              left.expired
                ? "bg-[#ff6b6b]/12 text-[#ff9a9a]"
                : left.soon && !left.unlimited
                  ? "bg-[#ffd27a]/12 text-[#ffd27a]"
                  : "bg-ok/10 text-[#7ff0b0]"
            }`}
          >
            {left.label}
          </span>
        </div>

        {cafe.planExpiresAt && (
          <p className="mt-2 text-[11px] text-white/55">
            {left.expired ? "Expiré le " : "Expire le "}
            {new Date(cafe.planExpiresAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}

        <form action={logoutAction} className="mt-4">
          <button
            type="submit"
            className="w-full rounded-xl border border-white/12 py-2.5 text-[12.5px] font-bold text-white/55 active:scale-[0.98]"
          >
            Se déconnecter
          </button>
        </form>
      </section>
    </div>
  );
}

function Fact({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-white/55">
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-right text-[13px] font-bold ${
          warn ? "text-[#ff9a9a]" : "text-white"
        }`}
      >
        {value}
      </span>
    </li>
  );
}

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="a-card overflow-hidden">
      <div className="px-4 pt-4">
        <h2 className="text-[15.5px] font-extrabold text-white">{title}</h2>
        {sub && <p className="mt-0.5 text-[11.5px] leading-snug text-white/55">{sub}</p>}
      </div>
      {children}
    </section>
  );
}
