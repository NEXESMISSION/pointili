import Link from "next/link";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { ownerCafe, ownerHome } from "@/lib/auth/owner";
import { guardArea } from "@/lib/auth/staff";
import { ownerRewards } from "@/lib/db";
import { getLoyaltyProgram } from "@/lib/data";

export const metadata = { title: "Récompenses" };

/**
 * LES RÉCOMPENSES — and, for the first time, whether anybody takes them.
 *
 * ── WHERE THIS USED TO LIVE ───────────────────────────────────────────────
 *
 * Inside a modal, inside Réglages: Réglages → Les récompenses → a full-screen
 * sheet. Three taps, filed beside the theme picker and the shop's photo, as
 * though choosing what a customer can earn were a matter of decoration.
 *
 * It is the setting that decides whether the whole programme works. A ladder
 * priced too high is a card nobody ever cashes in, which is a loyalty scheme
 * that quietly does nothing — and the owner has no way to know, because until
 * now no screen in the owner app counted a single redemption.
 *
 * ── THE COLUMN THAT CHANGES THE DECISION ──────────────────────────────────
 *
 * "Prise 7 fois" and "jamais prise" are the same two words the console has had
 * since 0040, where they were called the most actionable fact about a shop's
 * programme — shown to the operator, and not to the shop it is about. An
 * operator could ring a café and tell them their brunch at 300 points has never
 * been taken. The café could not work it out.
 *
 * `pending` is separate from `taken` on purpose: a code issued and not yet
 * collected is a customer with a booked reason to come back, which is a
 * different fact from a reward that has been redeemed and finished with.
 *
 * ── AND THE PRICES ARE READ AGAINST THE RATE ──────────────────────────────
 *
 * One dinar earns one point (0031), so a 40-point reward is "about 40 dinars
 * spent". That conversion is the only way a price is judgeable at all, and an
 * owner setting a number in an abstract unit had to do it in their head, if it
 * occurred to them to do it.
 */
export default async function Recompenses() {
  const cafe = await ownerCafe();
  if (!cafe) redirect(await ownerHome());

  /* Roles: a cashier does not open this one. Enforced here AND in every action
     behind it — a server action is a public endpoint (lib/auth/staff). */
  await guardArea(cafe.id, "recompenses");

  const [rewards, program] = await Promise.all([
    ownerRewards(cafe.id),
    getLoyaltyProgram(cafe.id),
  ]);

  const live = rewards.filter((r) => r.active);
  const takenTotal = rewards.reduce((n, r) => n + r.taken, 0);
  const pendingTotal = rewards.reduce((n, r) => n + r.pending, 0);
  const never = live.filter((r) => r.taken === 0);
  /* The cheapest LIVE reward is the one that decides whether the programme
     feels reachable — a customer judges the whole ladder by its first rung. */
  const cheapest = live.reduce<number | null>(
    (m, r) => (m === null || r.cost < m ? r.cost : m),
    null,
  );

  return (
    <div data-owner-wide className="space-y-4">
      <div className="px-1 md:hidden">
        <BackLink fallback="/owner" exact />
      </div>

      <header className="px-1">
        <h1 className="text-[24px] font-extrabold leading-tight text-charcoal">
          Vos récompenses
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-slate">
          {live.length === 0
            ? "Aucune récompense active : vos clients cumulent des points qu'ils ne peuvent pas échanger."
            : cheapest !== null
              ? `${live.length} récompense${live.length === 1 ? "" : "s"} en vitrine. La première est à ${cheapest} points, soit environ ${Math.round(cheapest / program.pointsPerTnd)} dinars dépensés.`
              : `${live.length} récompense${live.length === 1 ? "" : "s"} en vitrine.`}
        </p>
      </header>

      {/*
        THE THREE NUMBERS THAT SAY WHETHER IT IS WORKING.

        Not a dashboard — the honest summary of the list below it. "0 échangée"
        under a shop that has been open two months is the single most important
        sentence this page can print, and it was unprintable before 0042.
      */}
      <section className="a-card grid grid-cols-3 gap-px overflow-hidden bg-[var(--o-edge)]">
        <Cell
          k="Échangées"
          v={takenTotal}
          hint={takenTotal === 0 ? "aucune, pour l'instant" : "remises au comptoir"}
        />
        <Cell
          k="En attente"
          v={pendingTotal}
          hint={pendingTotal === 0 ? "aucun code en circulation" : "clients qui vont revenir"}
        />
        <Cell
          k="Jamais prises"
          v={never.length}
          hint={
            never.length === 0
              ? "toutes ont trouvé preneur"
              : "trop chères, ou pas assez tentantes"
          }
          tone={never.length > 0 && takenTotal > 0 ? "warn" : undefined}
        />
      </section>

      {rewards.length === 0 ? (
        <section className="a-card p-5 text-center">
          <p className="text-[15px] font-bold text-charcoal">Aucune récompense</p>
          <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-slate">
            Vos clients accumulent des points sans rien pouvoir en faire. Ajoutez-en
            au moins une — un café offert suffit pour commencer.
          </p>
          <Link href="/owner/reglages?panel=rewards" className="a-btn mt-4 inline-flex !w-auto px-5">
            Ajouter une récompense
          </Link>
        </section>
      ) : (
        <ul className="space-y-2">
          {rewards.map((r) => {
            const dinars = Math.round(r.cost / program.pointsPerTnd);
            return (
              <li key={r.id} className="a-card flex items-center gap-3.5 p-3.5">
                {/* The picture the customer sees, if there is one. A reward is
                    chosen off a card in a phone, not off this list. */}
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URI / stored path
                  <img
                    src={r.imageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-[var(--o-edge)]"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--o-inset)] text-[18px]"
                  >
                    🎁
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-bold text-charcoal">
                    <span className="truncate">{r.label}</span>
                    {!r.active && (
                      <span className="rounded-full bg-[var(--o-inset)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-slate">
                        Masquée
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[12px] text-slate">
                    <b className="font-mono text-[13px] text-charcoal">{r.cost}</b> points ·
                    environ {dinars} dinars dépensés
                  </p>
                </div>

                {/*
                  THE VERDICT, in words rather than a bare count. "0" in a
                  column is a number to skim past; "Jamais prise" is a sentence
                  that asks a question.
                */}
                <div className="shrink-0 text-end">
                  {r.taken === 0 ? (
                    <p
                      className={`text-[12.5px] font-bold ${
                        r.active ? "text-[#a06e00]" : "text-slate"
                      }`}
                    >
                      Jamais prise
                    </p>
                  ) : (
                    <p className="text-[12.5px] font-bold text-[#2f9e6e]">
                      Prise {r.taken} fois
                    </p>
                  )}
                  {r.pending > 0 && (
                    <p className="mt-0.5 text-[11px] text-slate">
                      {r.pending} code{r.pending === 1 ? "" : "s"} à récupérer
                    </p>
                  )}
                  {r.lastTaken && r.taken > 0 && (
                    <p className="mt-0.5 text-[11px] text-slate">
                      dernière {new Date(r.lastTaken).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        The editor is still where it was. This page's job is the DECISION —
        which reward, at what price — and the form that changes it is one tap
        away rather than duplicated here, so there is one place a reward is
        edited and one place it is judged.
      */}
      <section className="a-card flex flex-wrap items-center gap-3 p-4">
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate">
          {never.length > 0 && takenTotal > 0
            ? `${never.length} récompense${never.length === 1 ? " n'a" : "s n'ont"} jamais été échangée${never.length === 1 ? "" : "s"}. Baisser son prix, ou la remplacer, coûte une minute.`
            : "Modifier les libellés, les prix, ou en ajouter une nouvelle."}
        </p>
        <Link
          href="/owner/reglages?panel=rewards"
          className="a-btn !w-auto shrink-0 px-5"
        >
          Modifier
        </Link>
      </section>
    </div>
  );
}

function Cell({
  k,
  v,
  hint,
  tone,
}: {
  k: string;
  v: number;
  hint: string;
  tone?: "warn";
}) {
  return (
    <div className="bg-[var(--o-panel)] px-4 py-3.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate">{k}</p>
      <p
        className={`mt-1 font-display text-[26px] font-extrabold leading-none tabular-nums ${
          tone === "warn" ? "text-[#a06e00]" : "text-charcoal"
        }`}
      >
        {v}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate">{hint}</p>
    </div>
  );
}
