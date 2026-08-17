import { adminOverview, platformStats, remaining } from "@/lib/platform";
import { PageHead } from "../ui";
import { Roster } from "./Roster";

export const metadata = { title: "Cafés" };

/**
 * The roster — every shop on the platform.
 *
 * Nothing but the list. The old console put this table underneath the alert
 * queue and above the traffic panel, which meant the answer to "how is the
 * platform doing?" and the answer to "which shop is Karim asking about?" were
 * the same scroll. They are different jobs, done at different moments, and this
 * page only does the second one.
 *
 * remaining() is server-only, so each row is handed its own verdict rather than
 * the table recomputing dates in the browser.
 */
export default async function CafesPage() {
  const [cafes, stats] = await Promise.all([adminOverview(), platformStats()]);
  const rows = cafes.map((c) => ({ ...c, left: remaining(c.planExpiresAt) }));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHead
        title="Cafés"
        context={
          <>
            {stats.cafes} au total
            <span className="text-slate/40"> · </span>
            {stats.live} en ligne
            <span className="text-slate/40"> · </span>
            {stats.diners.toLocaleString("fr-FR")} clients
          </>
        }
      />
      <Roster rows={rows} />
    </div>
  );
}
