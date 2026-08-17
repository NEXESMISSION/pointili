/**
 * Raw action codes, in French.
 *
 * The audit table stores what the RPC called the thing — `set_plan`,
 * `dismiss_notice`, `early_status`. An operator scanning a journal wants to
 * read what happened, not decode it, and the same codes now surface in two
 * places (the journal page and each shop's own history), so the mapping lives
 * in one file rather than being pasted into whichever screen needed it next.
 *
 * Anything unmapped falls through to the raw code on purpose: a new action
 * showing up as `foo_bar` is legible enough to be a to-do, and far better than
 * a screen that hides actions it has not been taught about.
 */
export const ACTION_LABEL: Record<string, string> = {
  set_plan: "Abonnement modifié",
  suspend: "Café suspendu",
  unsuspend: "Café réactivé",
  notice: "Message envoyé",
  dismiss_notice: "Annonce retirée",
  renewal_approved: "Renouvellement validé",
  renewal_rejected: "Renouvellement refusé",
  early_status: "Demande d'accès suivie",
  early_delete: "Demande d'accès supprimée",
};

/**
 * How destructive was it — so the journal can be read at a glance.
 *
 * Suspending a shop and sending it an info message are both "an action" and
 * they are not the same event; a log where every line looks identical is a log
 * nobody scans. Not a security claim, just weight.
 */
export const ACTION_TONE: Record<string, "bad" | "warn" | "ok" | "idle"> = {
  suspend: "bad",
  early_delete: "bad",
  renewal_rejected: "warn",
  set_plan: "warn",
  unsuspend: "ok",
  renewal_approved: "ok",
  notice: "idle",
  dismiss_notice: "idle",
  early_status: "idle",
};

/**
 * The target line, honest about scope.
 *
 * A notice with no café is a genuine platform-wide broadcast, while plan and
 * suspend are ALWAYS café-scoped — so a missing café there means it was since
 * deleted, and saying "tous les cafés" would imply we suspended the platform.
 * The early-access actions have no café by construction, because a lead is a
 * shop that does not exist here yet; without their own answer they fell through
 * to "café supprimé", which is a sentence about a disaster that never happened.
 */
const CAFELESS = new Set(["early_status", "early_delete"]);

export function actionTarget(action: string, cafe: string | null): string | null {
  if (cafe) return cafe;
  if (CAFELESS.has(action)) return "accès anticipé";
  return action === "notice" ? "tous les cafés" : "café supprimé";
}
