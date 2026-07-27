import { activeNotices, adminOverview, platformStats, recentActions, remaining } from "@/lib/platform";
import { dismissNoticeAction } from "./actions";
import { BroadcastForm, CafeControls } from "./CafeControls";

const KIND_LABEL: Record<string, string> = { info: "Info", warning: "Attention", urgent: "Urgent" };

export const metadata = { title: "Console" };

/**
 * The platform console.
 *
 * Leads with what needs attention (expiring, expired, suspended) rather than
 * vanity totals — the operator opens this to find problems, not to feel good.
 */
export default async function AdminPage() {
  const [stats, cafes, actions, notices] = await Promise.all([
    platformStats(),
    adminOverview(),
    recentActions(12),
    activeNotices(),
  ]);

  const cafeName = new Map(cafes.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9d86ff]">
          Plateforme
        </p>
        <h1 className="mt-0.5 text-[26px] font-extrabold text-white">
          Tous les cafés
        </h1>
      </div>

      {/* what needs a decision today */}
      {(stats.expired > 0 || stats.expiring7d > 0 || stats.suspended > 0) && (
        <section className="rounded-2xl border border-[#4a3a12] bg-[#221c0b] px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#ffc861]">
            À traiter
          </p>
          <ul className="mt-1.5 space-y-0.5 text-[12.5px] font-medium text-[#8a6d00]">
            {stats.expired > 0 && <li>· {stats.expired} café(s) expiré(s) — accès coupé</li>}
            {stats.expiring7d > 0 && <li>· {stats.expiring7d} expire(nt) sous 7 jours</li>}
            {stats.suspended > 0 && <li>· {stats.suspended} suspendu(s)</li>}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-3 gap-2.5">
        <Stat label="Cafés" value={stats.cafes} />
        <Stat label="En ligne" value={stats.live} tone="ok" />
        <Stat label="Suspendus" value={stats.suspended} tone={stats.suspended ? "bad" : undefined} />
        <Stat label="Diners" value={stats.diners} />
        <Stat label="Points émis" value={stats.pointsIssued} tone="royal" />
      </section>

      <section>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b93a7]">
          Cafés ({cafes.length})
        </p>
        {cafes.length === 0 ? (
          <p className="rounded-2xl border border-[#232838] bg-[#12151d] px-4 py-8 text-center text-[13px] text-[#8b93a7]">
            Aucun café pour l&apos;instant.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {cafes.map((c) => (
              <CafeControls key={c.id} cafe={c} left={remaining(c.planExpiresAt)} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[#232838] bg-[#12151d] p-4 shadow-[0_10px_30px_-24px_rgba(40,18,59,.5)]">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b93a7]">
          Message à tous
        </p>
        <BroadcastForm />
      </section>

      {/* Notices still live on owners' dashboards — retractable here. */}
      {notices.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b93a7]">
            Annonces actives ({notices.length})
          </p>
          <ul className="space-y-2">
            {notices.map((n) => (
              <li
                key={n.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-[#232838] bg-[#12151d] px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#8b93a7]">
                    {n.businessId ? (cafeName.get(n.businessId) ?? "café") : "tous les cafés"}
                    {" · "}
                    {KIND_LABEL[n.kind] ?? n.kind}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-[#e6e8ee]">{n.message}</span>
                  <span className="mt-0.5 block text-[10.5px] text-[#8b93a7]">
                    {n.expiresAt ? `expire dans ${remaining(n.expiresAt).label}` : "sans expiration"}
                  </span>
                </span>
                <form action={dismissNoticeAction.bind(null, n.id)} className="shrink-0">
                  <button
                    type="submit"
                    className="rounded-lg border border-[#232838] px-2.5 py-1.5 text-[11px] font-bold text-[#8b93a7] active:scale-95"
                  >
                    Retirer
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {actions.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b93a7]">
            Journal ({actions.length})
          </p>
          <ul className="divide-y divide-[#232838] rounded-2xl border border-[#232838] bg-[#12151d] px-4">
            {actions.map((a, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[12px] font-bold text-[#e6e8ee]">
                    {actionLabel(a.action)}
                    {actionTarget(a.action, a.cafe) && (
                      <span className="font-semibold text-[#8b93a7]">
                        {" · "}
                        {actionTarget(a.action, a.cafe)}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[10.5px] text-[#8b93a7]">
                    {a.actor ?? "—"}
                  </span>
                </span>
                <span className="shrink-0 text-[10.5px] text-[#8b93a7]">
                  {new Date(a.at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * The audit log stores raw action codes (set_plan, elevate, …). An operator
 * scanning the journal wants to read what happened, not decode it — so map each
 * code to plain French, and fall back to the raw code for anything new.
 */
const ACTION_LABELS: Record<string, string> = {
  set_plan: "Abonnement modifié",
  suspend: "Café suspendu",
  unsuspend: "Café réactivé",
  notice: "Message envoyé",
  elevate: "Accès console ouvert",
  elevate_failed: "Accès refusé",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/**
 * The target line, honest about scope:
 *   - elevation is a session event, scoped to nobody → no suffix;
 *   - a notice with no café is a genuine platform-wide broadcast;
 *   - plan/suspend/unsuspend are ALWAYS café-scoped, so a missing café means the
 *     café was since deleted — say so rather than implying it hit everyone.
 */
function actionTarget(action: string, cafe: string | null): string | null {
  if (action === "elevate" || action === "elevate_failed") return null;
  if (cafe) return cafe;
  return action === "notice" ? "tous les cafés" : "café supprimé";
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "bad" | "royal";
}) {
  const colour =
    tone === "ok"
      ? "text-[#2f9e6e]"
      : tone === "bad"
        ? "text-[#e5484d]"
        : tone === "royal"
          ? "text-[#9d86ff]"
          : "text-[#e6e8ee]";
  return (
    <div className="rounded-2xl border border-[#232838] bg-[#12151d] px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#8b93a7]">{label}</p>
      <p className={`mt-0.5 text-[22px] font-extrabold leading-none tabular-nums ${colour}`}>
        {value}
      </p>
    </div>
  );
}
