import { redirect } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { ownerCafe, ownerHome } from "@/lib/auth/owner";
import { can, currentStaff, ROLE_LABEL } from "@/lib/auth/staff";
import { staffJournal, staffTeam } from "@/lib/db";
import { fmtDinars, fmtPoints } from "@/lib/points";
import { Team } from "./TeamForms";

export const metadata = { title: "L'équipe" };

/**
 * L'ÉQUIPE — the people, their codes, and the record of what they did.
 *
 * OWNER ONLY, and the check is here rather than in the navigation because a tab
 * bar is markup. This screen holds the switch that turns the whole record on,
 * and the roles that decide who can reach it: a cashier who could open it could
 * promote themselves, or simply switch it off and go back to being anonymous.
 * Every action behind it repeats the check for the same reason (actions.ts).
 */
export default async function EquipePage() {
  const cafe = await ownerCafe();
  if (!cafe) redirect(await ownerHome());

  const staff = await currentStaff(cafe.id);
  /* Not a 404 and not an error page: a cashier who taps a stale link should
     land on the till, which is where they work. */
  if (!can(staff, "equipe")) redirect("/owner");

  const [team, journal] = await Promise.all([staffTeam(cafe.id), staffJournal(cafe.id, 60)]);

  return (
    <div data-owner-wide className="space-y-4">
      <BackLink fallback="/owner/reglages" label="Réglages" />

      <header>
        <h1 className="text-[24px] font-extrabold leading-tight text-charcoal">L&apos;équipe</h1>
        <p className="mt-1 text-[13px] leading-snug text-slate">
          Un code à 4 chiffres par personne. Chaque opération à la caisse est
          enregistrée à son nom.
        </p>
      </header>

      <Team enabled={cafe.staffPinsEnabled} team={team} me={staff?.id ?? null} />

      {/* ── what was done, and by whom ─────────────────────────────────── */}
      <section className="a-card p-4">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
          Journal
        </h2>
        {journal.length === 0 ? (
          <p className="mt-3 text-[13px] leading-snug text-slate">
            Rien pour l&apos;instant. Dès qu&apos;une opération est faite à la caisse,
            elle apparaît ici avec le nom de la personne.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--o-edge)]">
            {journal.map((a, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-charcoal">
                    {a.who}
                    <span className="ms-1.5 font-semibold text-slate">{VERB[a.kind] ?? a.kind}</span>
                  </span>
                  <span className="block truncate text-[12px] text-slate">
                    {detail(a)}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-slate">{when(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const VERB: Record<string, string> = {
  credit: "a crédité",
  stamp: "a tamponné",
  collect: "a remis",
  adjust: "a corrigé",
  set_stamps: "a réglé les tampons",
  pin_reset: "a remis un code secret",
  sign_in: "a pris la caisse",
  sign_out: "a quitté la caisse",
};

/** One line of context, in the units the owner reads everywhere else. */
function detail(a: {
  kind: string;
  customer: string | null;
  points: number | null;
  amountTnd: number | null;
  label: string | null;
  role: string | null;
}): string {
  const who = a.customer ? ` · ${a.customer}` : "";
  if (a.kind === "credit") {
    return `${a.amountTnd !== null ? `${fmtDinars(a.amountTnd)} DT · ` : ""}+${fmtPoints(a.points ?? 0)} points${who}`;
  }
  if (a.kind === "adjust") return `${(a.points ?? 0) > 0 ? "+" : ""}${fmtPoints(a.points ?? 0)} points${who}`;
  if (a.kind === "collect") return `${a.label ?? "récompense"}${who}`;
  if (a.kind === "stamp") return `${a.label ?? "un tampon"}${who}`;
  if (a.kind === "set_stamps") return `${a.label ?? ""}${who}`.trim();
  if (a.kind === "pin_reset") return `code secret${who}`;
  return a.role ? (ROLE_LABEL[a.role as keyof typeof ROLE_LABEL] ?? "") : "";
}

/** "14:32" today, "hier", then a date. A shift is read in hours. */
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return "hier";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
