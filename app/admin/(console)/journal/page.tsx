import Link from "next/link";
import { activeNotices, adminOverview, auditLog } from "@/lib/platform";
import { dismissNoticeAction } from "../actions";
import { PageHead, Pill, Section, stamp } from "../ui";
import { ACTION_LABEL, ACTION_TONE, actionTarget } from "./labels";
import { Broadcast } from "./Broadcast";

export const metadata = { title: "Journal" };

const KIND_LABEL: Record<string, string> = {
  info: "Info",
  warning: "Attention",
  urgent: "Urgent",
};

/**
 * THE JOURNAL — the record of what we did, as a page.
 *
 * It used to be a <details> at the very bottom of the console holding the last
 * TWELVE entries, with no filter, no paging and no search. Which made the audit
 * log — the thing that exists so there is always a record of who suspended whom
 * — the least reachable surface in the tool, below the traffic charts and
 * behind a fold.
 *
 * A hundred entries now, filterable to one shop from that shop's own page, and
 * every line says who did it. The two things an operator does WITH the platform
 * rather than to one shop — broadcasting, and retracting a broadcast — live
 * here too, because they are the same kind of act and this is where their
 * record lands.
 *
 * ── ?cafe=<id> ────────────────────────────────────────────────────────────
 *
 * A shop's own page shows its last thirty entries inline; this is the same read
 * without the ceiling. It is a query parameter rather than a route because the
 * journal is one thing viewed at two scopes, not two pages that would drift.
 */
/**
 * Fifty a page.
 *
 * The first build of this page rendered two hundred entries in one list, which
 * on a platform with eight hundred audit rows produced a document twenty-seven
 * thousand pixels tall — a scroll bar with no bottom, and no way to reach
 * anything older than the two hundredth entry anyway. Fifty is a screenful or
 * two, and `?p=` makes every page of the log a real address.
 */
const PER_PAGE = 50;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ cafe?: string; p?: string }>;
}) {
  const { cafe, p } = await searchParams;
  /* A hand-typed ?p=-3 or ?p=abc must land on page one rather than throwing an
     offset at Postgres. */
  const page = Math.max(0, Number.isFinite(Number(p)) ? Math.floor(Number(p) || 0) : 0);

  const [batch, notices, cafes] = await Promise.all([
    /* One MORE than the page holds. There is no count query anywhere in this
       console and adding one just to draw a "next" link would double the cost
       of the page; asking for 51 and rendering 50 answers "is there another
       page?" exactly, for free. */
    auditLog(cafe ?? null, PER_PAGE + 1, page * PER_PAGE),
    activeNotices(),
    adminOverview(),
  ]);

  const entries = batch.slice(0, PER_PAGE);
  const more = batch.length > PER_PAGE;

  const names = new Map(cafes.map((c) => [c.id, c.name]));
  const scoped = cafe ? names.get(cafe) : null;
  const at = (n: number) =>
    `/admin/journal?${new URLSearchParams({ ...(cafe ? { cafe } : {}), ...(n > 0 ? { p: String(n) } : {}) })}`;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead
        title="Journal"
        back={cafe ? { href: `/admin/cafes/${cafe}`, label: scoped ?? "Le café" } : undefined}
        context={
          scoped
            ? `Toutes les actions de la plateforme sur ${scoped}.`
            : "Chaque action privilégiée, avec son auteur. Rien n'est modifiable ici."
        }
      >
        {cafe && (
          <Link href="/admin/journal" className="k-btn k-btn--sm k-btn--ghost">
            Voir tout
          </Link>
        )}
      </PageHead>

      {/* ── the platform's own voice ─────────────────────────────────
              A message to every shop at once is the one action here that is not
              about a single café, so it lives on the platform page rather than
              in a drawer under a table of cafés. */}
      {!cafe && page === 0 && (
        <div className="mb-6 grid gap-2.5 lg:grid-cols-2">
          <Section title="Message à tous les cafés">
            <Broadcast />
          </Section>

          <Section title={`Annonces affichées (${notices.length})`}>
            {notices.length === 0 ? (
              <p className="k-card px-4 py-4 text-[13px] text-slate">
                Aucune annonce en cours sur les tableaux de bord.
              </p>
            ) : (
              <ul className="k-card divide-y divide-[var(--o-edge)]">
                {notices.map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="k-h block">
                        {n.businessId ? (names.get(n.businessId) ?? "café") : "tous les cafés"}
                        {" · "}
                        {KIND_LABEL[n.kind] ?? n.kind}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-charcoal">{n.message}</span>
                      <span className="k-num mt-0.5 block text-[10.5px] text-slate">
                        {n.expiresAt ? `expire ${stamp(n.expiresAt)}` : "sans expiration"}
                      </span>
                    </span>
                    <form action={dismissNoticeAction.bind(null, n.id)} className="shrink-0">
                      <button type="submit" className="k-btn k-btn--sm k-btn--ghost">
                        Retirer
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      <Section
        title="Historique"
        aside={
          page === 0
            ? `${entries.length}${more ? "+" : ""} entrées`
            : `entrées ${page * PER_PAGE + 1}–${page * PER_PAGE + entries.length}`
        }
      >
        {entries.length === 0 ? (
          <p className="k-card px-4 py-5 text-[13px] text-slate">
            {page > 0 ? "Rien de plus ancien." : "Aucune action enregistrée."}
          </p>
        ) : (
          <ul className="k-card divide-y divide-[var(--o-edge)]">
            {entries.map((a, i) => {
              const target = actionTarget(a.action, a.cafe);
              return (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-2.5">
                  <Pill tone={ACTION_TONE[a.action] ?? "idle"}>
                    {ACTION_LABEL[a.action] ?? a.action}
                  </Pill>

                  {target && (
                    <span className="text-[12.5px] font-semibold text-charcoal">
                      {a.businessId ? (
                        <Link href={`/admin/cafes/${a.businessId}`} className="hover:text-royal">
                          {target}
                        </Link>
                      ) : (
                        target
                      )}
                    </span>
                  )}

                  {/* Who did it. The console has one operator today and will not
                      always; a log without an actor is a log that cannot answer
                      the only question it will ever be asked in anger. */}
                  <span className="k-num min-w-0 flex-1 truncate text-[11px] text-slate/70">
                    {a.actor ?? "—"}
                  </span>
                  <span className="k-num shrink-0 text-[11px] text-slate/70">{stamp(a.at)}</span>

                  {/* The detail payload, one line, mono. It is what distinguishes
                      "abonnement modifié" from "abonnement modifié à zéro". */}
                  {Object.keys(a.detail).length > 0 && (
                    <span className="k-num w-full truncate text-[10.5px] text-slate/60">
                      {Object.entries(a.detail)
                        .map(([k, v]) => `${k}=${String(v)}`)
                        .join("  ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Plain links, so a page of the log is a real address you can send to
            somebody — which is the whole reason this console was split up. */}
        {(page > 0 || more) && (
          <nav className="mt-3 flex items-center justify-between" aria-label="Pagination du journal">
            {page > 0 ? (
              <Link href={at(page - 1)} className="k-btn k-btn--sm k-btn--ghost">
                ← Plus récent
              </Link>
            ) : (
              <span />
            )}
            <span className="k-num text-[11px] text-slate">page {page + 1}</span>
            {more ? (
              <Link href={at(page + 1)} className="k-btn k-btn--sm k-btn--ghost">
                Plus ancien →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </Section>
    </div>
  );
}
