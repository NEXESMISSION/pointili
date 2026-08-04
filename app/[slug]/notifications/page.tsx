import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CafeClosed } from "@/components/CafeClosed";
import { GiftIcon, Sparkle, StampIcon } from "@/components/icons";
import { getCafe, getLoyaltyProgram, getMember, getRewards } from "@/lib/data";
import { getActivity, type Activity } from "@/lib/db";
import { fmtPoints } from "@/lib/points";

export const metadata = { title: "Notifications" };

/**
 * ── NOTIFICATIONS ──────────────────────────────────────────────────────────
 *
 * NOTHING HERE IS STORED. There is no notifications table, no read/unread
 * column, and no background job — and that is a decision, not a shortcut.
 *
 * Every line on this page is DERIVED from something that already happened and
 * is already recorded: the points ledger, the codes waiting at the counter, the
 * stamp count, the reward catalogue. A separate notifications table would be a
 * second copy of facts the database already holds, and second copies drift —
 * the first time a correction moved someone's balance, their notification would
 * still be quoting the old number. Deriving cannot drift.
 *
 * It also means this page is honest on day one for every existing customer:
 * somebody who joined three months ago opens it and sees their real history,
 * not an empty state that says "no notifications yet" because the feature was
 * only switched on this morning.
 *
 * WHAT SEPARATES THIS FROM /historique. History is a ledger — every movement,
 * in order, for answering "where did my points go?". This page answers a
 * different question: "is there anything I should DO?". So it is ordered by
 * what is actionable, not by what is recent:
 *
 *   1 · À récupérer   — codes already paid for, sitting unclaimed. The only
 *                       thing in the product genuinely waiting for someone.
 *   2 · Débloqué      — rewards the balance now covers. Nobody is told this
 *                       anywhere else; they are left to do the subtraction.
 *   3 · Ta carte      — the stamp card, when it is full or one visit away.
 *   4 · Activité      — the timeline, in plain language.
 *
 * Sections 1–3 disappear entirely when they are empty. A page that always shows
 * three headings teaches people that the headings mean nothing.
 */

/** "il y a 2 j" — elapsed time is the useful part, not a timestamp. */
function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "hier";
  if (d < 30) return `il y a ${d} j`;
  const m = Math.floor(d / 30);
  return m === 1 ? "il y a 1 mois" : `il y a ${m} mois`;
}

/**
 * One ledger row, in words a customer would use.
 *
 * `spin` is here because migration 0029 added it to the ledger and
 * diner_history does not filter reasons — so a spin arrives in this feed. It
 * was missing from the Activity union, which meant the history screen rendered
 * a blank label for anyone who had played the wheel.
 */
function describe(a: Activity, cafeName: string): { title: string; detail: string; tone: "up" | "down" | "flat" } {
  const n = fmtPoints(Math.abs(a.delta));
  switch (a.reason) {
    case "earn":
      return { title: `+${n} points`, detail: `Un achat chez ${cafeName}`, tone: "up" };
    case "welcome":
      return { title: `+${n} points offerts`, detail: "Cadeau de bienvenue, pour ta première carte", tone: "up" };
    case "redeem":
      return { title: `−${n} points`, detail: "Tu as échangé une récompense", tone: "down" };
    case "spin":
      return { title: `−${n} points`, detail: "Un tour de roue", tone: "down" };
    case "adjust":
      return a.delta >= 0
        ? { title: `+${n} points`, detail: "Correction en ta faveur", tone: "up" }
        : { title: `−${n} points`, detail: "Correction d'une erreur de caisse", tone: "down" };
    case "expire":
      return { title: `−${n} points`, detail: "Points expirés", tone: "down" };
    case "collected":
      return { title: a.label ?? "Récompense récupérée", detail: "Récupérée au comptoir", tone: "flat" };
    default:
      return { title: `${a.delta >= 0 ? "+" : "−"}${n} points`, detail: "Mouvement de points", tone: "flat" };
  }
}

function Row({
  icon,
  title,
  detail,
  right,
  href,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  right?: string;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <span className="flex items-center gap-3 px-3.5 py-3">
      {/* `accent` means "this one is waiting for you" — the shop's colour,
          filled, against the quiet tint every other row wears. */}
      <span
        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl"
        style={
          accent
            ? { background: "var(--cafe)", color: "var(--cafe-ink)" }
            : { background: "var(--cafe-soft)", color: "var(--cafe-text)" }
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-bold text-charcoal">{title}</span>
        <span className="mt-0.5 block truncate text-[11.5px] font-medium text-slate">{detail}</span>
      </span>
      {right && (
        <span className="shrink-0 whitespace-nowrap text-[11.5px] font-semibold text-slate">
          {right}
        </span>
      )}
    </span>
  );

  return href ? (
    <Link href={href} className="block transition active:bg-[#f4f3f7]">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 pt-6">
      <h2 className="mb-3 text-[16.5px] font-extrabold text-charcoal">{title}</h2>
      <ul className="d-card divide-y divide-[#f0eef4] overflow-hidden">{children}</ul>
    </section>
  );
}

export default async function Notifications({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();
  /* Re-checked per PAGE, not just in the layout: Next does not re-run a layout
     on client-side transitions, so a shop that went dark mid-session kept
     serving every screen. */
  if (!cafe.live) return <CafeClosed name={cafe.name} />;

  const [diner, program, rewards] = await Promise.all([
    getMember(cafe.id),
    getLoyaltyProgram(cafe.id),
    getRewards(cafe.id),
  ]);
  if (!diner) redirect(`/${slug}/rejoindre`);

  /* 30, not 8. This is the screen someone opens to catch up, and a feed that
     stops after eight rows sends them to /historique to finish reading. */
  const activity = await getActivity(cafe.id, diner.phone, 30);

  /* Rewards the balance already covers — the subtraction nobody does for them.
     Dearest first, so the best thing they can have leads. */
  const affordable = rewards
    .filter((r) => r.active && diner.balance >= r.pointsCost)
    .sort((a, b) => b.pointsCost - a.pointsCost);

  const stampsLeft = program.stampsEnabled
    ? Math.max(0, program.stampsRequired - diner.stamps)
    : null;
  const stampCardFull = stampsLeft !== null && diner.stamps > 0 && stampsLeft === 0;
  const stampNearlyFull = stampsLeft !== null && stampsLeft > 0 && stampsLeft <= 2;

  const nothing =
    diner.codes.length === 0 &&
    affordable.length === 0 &&
    !stampCardFull &&
    !stampNearlyFull &&
    activity.length === 0;

  return (
    <div className="pb-6">
      {nothing ? (
        <div className="px-6 pt-16 text-center">
          <span
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: "var(--cafe-soft)", color: "var(--cafe-text)" }}
          >
            <Sparkle className="h-6 w-6" />
          </span>
          <p className="mt-4 text-[15px] font-extrabold text-charcoal">Rien de neuf</p>
          <p className="mx-auto mt-1.5 max-w-[30ch] text-[13.5px] leading-relaxed text-slate">
            Ta prochaine visite chez {cafe.name} apparaîtra ici : les points
            gagnés, les récompenses débloquées, les codes à récupérer.
          </p>
        </div>
      ) : null}

      {/* 1 · things already paid for and still waiting */}
      {diner.codes.length > 0 && (
        <Section title="À récupérer">
          {diner.codes.map((c) => (
            <li key={c.code}>
              <Row
                accent
                icon={<GiftIcon className="h-[18px] w-[18px]" />}
                title={c.label}
                detail={`Code ${c.code} — à montrer au comptoir`}
                href={`/${slug}/codes`}
              />
            </li>
          ))}
        </Section>
      )}

      {/* 2 · what the balance now covers */}
      {affordable.length > 0 && (
        <Section title="Débloqué">
          {affordable.map((r) => (
            <li key={r.id}>
              <Row
                icon={<Sparkle className="h-[18px] w-[18px]" />}
                title={r.label}
                /* Short on purpose: this row carries a right-hand action, so a
                   longer sentence truncates mid-word on a 390px screen. */
                detail={`${fmtPoints(r.pointsCost)} points — c'est bon`}
                right="Échanger"
                href={`/${slug}/boutique`}
              />
            </li>
          ))}
        </Section>
      )}

      {/* 3 · the stamp card, only when it is worth saying */}
      {(stampCardFull || stampNearlyFull) && (
        <Section title="Ta carte à tampons">
          <li>
            <Row
              accent={stampCardFull}
              icon={
                <StampIcon className="h-[18px] w-[18px]" />
              }
              title={stampCardFull ? "Ta carte est pleine 🎉" : `Encore ${stampsLeft} visite${stampsLeft! > 1 ? "s" : ""}`}
              detail={
                stampCardFull
                  ? `${program.stampReward} t'attend au comptoir`
                  : `pour ${program.stampReward}`
              }
              href={`/${slug}`}
            />
          </li>
        </Section>
      )}

      {/* 4 · everything that happened, in plain language */}
      {activity.length > 0 && (
        <section className="px-4 pt-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[16.5px] font-extrabold text-charcoal">Ton activité</h2>
            <Link href={`/${slug}/historique`} className="text-[13.5px] font-bold"
              style={{ color: "var(--cafe-text)" }}>
              Historique
            </Link>
          </div>
          <ul className="d-card divide-y divide-[#f0eef4] overflow-hidden">
            {activity.map((a, i) => {
              const d = describe(a, cafe.name);
              return (
                <li key={`${a.at}-${i}`}>
                  <Row
                    icon={
                      d.tone === "up" ? (
                        <Sparkle className="h-[18px] w-[18px]" />
                      ) : (
                        <GiftIcon className="h-[18px] w-[18px]" />
                      )
                    }
                    title={d.title}
                    detail={d.detail}
                    right={ago(a.at)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
