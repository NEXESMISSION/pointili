import { redirect } from "next/navigation";
import { currentOwner, ownerCafe } from "@/lib/auth/owner";
import { getLoyaltyProgram, getOwnerGame, getRewards } from "@/lib/data";
import { remaining } from "@/lib/platform";
import { logoutAction } from "../../(auth)/login/actions";
import { EarnForm, PlayForm, PrizesEditor, RewardsEditor, ReturnForm } from "./SettingsForms";

export const metadata = { title: "Réglages" };

const PLAN_LABEL: Record<string, string> = {
  trial: "essai",
  pro: "pro",
  free: "gratuite",
};

/**
 * The control panel (§09).
 *
 * Grouped by MOMENT (Earn / Play / Reward / Return), not by table — the owner
 * thinks "how often can they spin?", not "which jsonb key". Every control has a
 * plain-French label + a one-line helper, and every one of them writes.
 */
export default async function Reglages() {
  const cafe = await ownerCafe();
  // No café yet → set one up. NOT /owner/login: that would see a valid session
  // and bounce straight back here, forever.
  if (!cafe) redirect("/owner/nouveau");

  const left = remaining(cafe.planExpiresAt);
  const [owner, program, game, rewards] = await Promise.all([
    currentOwner(),
    getLoyaltyProgram(cafe.id),
    getOwnerGame(cafe.id),
    getRewards(cafe.id),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <p className="ticket-label">◆ Contrôles</p>
        <h1 className="mt-1 font-display text-[26px]">Réglages</h1>
        <p className="mt-1 text-[13px] text-mut">
          Chaque levier de la boucle, regroupé par moment.
        </p>
      </div>

      <Moment title="Gagner" tag="à la caisse">
        <EarnForm cafe={cafe} program={program} />
      </Moment>

      <Moment title="Jouer" tag="le plaisir">
        <PlayForm game={game} />
        <PrizesEditor game={game} />
      </Moment>

      <Moment title="Récompenser" tag="le retour sur effort">
        <p className="border-b border-line/60 px-4 py-2.5 text-[11.5px] leading-snug text-mut">
          Du plus accessible au plus désirable. Le premier palier devrait être
          atteignable en 2–3 visites — c&apos;est ce qui fait revenir.
        </p>
        <RewardsEditor rewards={rewards} />
      </Moment>

      <Moment title="Faire revenir" tag="tout l'enjeu">
        <ReturnForm cafe={cafe} />
      </Moment>

      {/* The owner's own plan — always visible, not only once it's nearly too
          late. "When does this stop working, and what am I on?" should never
          require asking. */}
      <Moment title="Abonnement" tag={PLAN_LABEL[cafe.plan]}>
        <div className="flex items-start justify-between gap-3 border-b border-line/60 px-4 py-3">
          <span>
            <span className="block text-[13.5px] font-semibold text-ink">
              Formule {PLAN_LABEL[cafe.plan]}
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-mut">
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
          <p className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">
            Expire le{" "}
            {new Date(cafe.planExpiresAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
      </Moment>

      <Moment
        title="Compte"
        tag={owner?.role === "super_admin" ? "super-admin" : "propriétaire"}
      >
        <div className="px-4 py-3">
          <p className="font-mono text-[11.5px] text-ink2">{owner?.email ?? "—"}</p>
          <p className="mt-0.5 font-mono text-[10px] text-mut">
            pointili.online/{cafe.slug}
          </p>
          {/* Being signed in with no way out is a trap — the owner app had no
              logout at all until this. */}
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="w-full rounded-xl border border-line py-2.5 text-[11px] font-bold text-ink2 active:scale-[0.98]"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      </Moment>
    </div>
  );
}

function Moment({
  title,
  tag,
  children,
}: {
  title: string;
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-paper2">
      <div className="flex items-baseline gap-2 border-b border-line px-4 py-3">
        <h2 className="font-display text-[17px] text-ink">{title}</h2>
        <span className="ml-auto text-[9.5px] font-semibold uppercase tracking-[0.06em] text-mut">
          {tag}
        </span>
      </div>
      {children}
    </section>
  );
}
