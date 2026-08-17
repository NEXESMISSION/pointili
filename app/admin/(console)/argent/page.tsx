import { renewalQueue } from "@/lib/platform";
import { tnd } from "@/lib/billing";
import { platformSettings } from "@/lib/settings";
import { PageHead, Section, Stat } from "../ui";
import { Renewals } from "./Renewals";

export const metadata = { title: "Renouvellements" };

/**
 * THE MONEY — shops that have paid and are waiting to be switched back on.
 *
 * Everywhere else in this console the operator is noticing something: a café
 * expired, one went dark, a stranger left a phone number. This is the only
 * page where somebody has ALREADY ACTED — transferred eighty dinars from their
 * own account — and is now waiting on us. That asymmetry is why it has its own
 * page rather than a band on a dashboard, and why the front page links here
 * instead of offering a one-tap approve: a receipt has to be looked at, and a
 * queue you can clear without looking is a rubber stamp.
 *
 * ── THE THREE FIGURES ARE NOT A DASHBOARD ─────────────────────────────────
 *
 * "En attente" is money we are sitting on. "Encaissé" is what the platform has
 * actually taken through this flow, which is the only revenue number that
 * exists anywhere in the product — nothing else in the console knows what
 * Pointili earns. "Refusées" is the honesty check on the other two: a rising
 * refusal count means the payment instructions are wrong, not that shops are
 * cheating.
 */
/**
 * The queue holds the recent history as well as the pending requests, so the
 * figures below are over THIS WINDOW, not over all time. That is said on the
 * tiles rather than left for somebody to discover: "Encaissé" with no
 * qualifier is a lifetime revenue claim, and a screen that quietly means
 * something narrower than its label is how a number gets quoted wrongly.
 */
const WINDOW = 60;

export default async function MoneyPage() {
  const [rows, settings] = await Promise.all([renewalQueue(WINDOW), platformSettings()]);

  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");
  const rejected = rows.filter((r) => r.status === "rejected");
  const sum = (list: typeof rows) => list.reduce((n, r) => n + r.amount, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead
        title="Renouvellements"
        context={
          pending.length === 0
            ? "Aucun paiement n'attend de décision."
            : `${pending.length} paiement${pending.length === 1 ? "" : "s"} à vérifier — ${tnd(
                sum(pending),
              )}.`
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <Stat
          label="En attente"
          value={tnd(sum(pending))}
          sub={`${pending.length} demande${pending.length === 1 ? "" : "s"}`}
          tone={pending.length > 0 ? "warn" : undefined}
        />
        <Stat
          label="Encaissé"
          value={tnd(sum(approved))}
          sub={
            approved.length === 0
              ? `aucun renouvellement validé sur les ${WINDOW} dernières demandes`
              : `${approved.length} validé${approved.length === 1 ? "" : "s"} sur les ${WINDOW} dernières demandes`
          }
          /* Green only when there is something to be pleased about. A tinted
             "0 TND" reads as good news about no money at all. */
          tone={sum(approved) > 0 ? "ok" : undefined}
        />
        <Stat
          label="Refusées"
          value={rejected.length}
          sub={
            rejected.length > 0
              ? "vérifiez que les coordonnées de paiement sont justes"
              : "aucun reçu rejeté"
          }
        />
      </div>

      <Section title={`À vérifier${pending.length > 0 ? ` (${pending.length})` : ""}`}>
        <Renewals
          rows={rows}
          naming={{
            offers: settings.offers.map((o) => ({ id: o.id, label: o.label })),
            methods: settings.methods.map((m) => ({ id: m.id, label: m.label })),
          }}
        />
      </Section>
    </div>
  );
}
