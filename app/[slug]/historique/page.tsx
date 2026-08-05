import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CafeClosed } from "@/components/CafeClosed";
import { GiftIcon, Sparkle } from "@/components/icons";
import { getCafe, getMember } from "@/lib/data";
import { getActivity, type Activity } from "@/lib/db";
import { fmtPoints } from "@/lib/points";

export const metadata = { title: "Historique" };

/**
 * ── ACTIVITÉ — ONE SCREEN, NOT TWO ────────────────────────────────────────
 *
 * This page and /notifications used to be separate, and they listed THE SAME
 * LEDGER: "Achat · +12" here, "+12 points · Un achat chez Café Test" there.
 * Same rows, same order, different words — and both were linked from the card,
 * one from the bell and one from a tile. A customer who looked at both found
 * their history twice and had no way to know they were the same thing.
 *
 * So there is one screen. It leads with what is WAITING (a code already paid
 * for is the only thing in this product that needs doing), and then it is the
 * timeline. /notifications redirects here.
 *
 * WHAT WAS DROPPED IN THE MERGE, deliberately:
 *   · the "Débloqué" list of affordable rewards. The card already says "3
 *     récompenses à ta portée" and the Récompenses tab is one tap away and
 *     shows them properly, with photographs and prices. Three places telling
 *     you the same thing is how a screen stops being read.
 *   · the icon on every ledger row. Nine identical sparkles in nine identical
 *     tiles is not a column of information, it is a column of decoration.
 */

const LABEL: Record<Activity["reason"], string> = {
  earn: "Achat",
  welcome: "Bienvenue",
  redeem: "Échange",
  adjust: "Correction",
  expire: "Expiration",
  spin: "Roue",
  collected: "Récupéré",
};

/** "il y a 2 j" — elapsed time is the useful bit, not a raw date. */
function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
}

/**
 * "Août 2026", capitalised — the heading a month of rows sits under.
 *
 * Grouping is what turns thirty rows of "il y a 27 j" into something you can
 * read: the relative time answers "how long ago", the heading answers "when",
 * and only the second one lets you find the week you were looking for.
 */
function monthKey(iso: string): string {
  const s = new Date(iso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The dinars a row is worth saying, or null. */
function ticket(a: Activity): string | null {
  if (a.reason !== "earn" || a.amount === null || a.amount <= 0) return null;
  const n = Math.round(a.amount * 100) / 100;
  return `${String(n).replace(".", ",")} TND`;
}

export default async function Historique({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafe(slug);
  if (!cafe) notFound();
  // Re-checked per PAGE, not just in the layout: Next does not re-run a layout
  // on client-side transitions, so a shop that went dark mid-session kept
  // serving every screen.
  if (!cafe.live) return <CafeClosed name={cafe.name} />;

  const diner = await getMember(cafe.id);
  if (!diner) redirect(`/${slug}/rejoindre`);

  /* 40, not 8: this is the screen someone opens to catch up, and a feed that
     stops after eight rows sends them looking for a second one. */
  const activity = await getActivity(cafe.id, diner.phone, 40);

  /* Grouped in order — the RPC already returns newest first, so a plain walk
     keeps the months in sequence without a second sort. */
  const months: { key: string; rows: Activity[] }[] = [];
  for (const a of activity) {
    const key = monthKey(a.at);
    const last = months[months.length - 1];
    if (last && last.key === key) last.rows.push(a);
    else months.push({ key, rows: [a] });
  }

  const earned = activity
    .filter((a) => a.delta > 0)
    .reduce((sum, a) => sum + a.delta, 0);

  return (
    <div className="flex flex-1 flex-col px-5 pb-6 pt-3">
      {/*
        ── WHAT IS WAITING ────────────────────────────────────────────────
        First, because it is the only thing on this screen that is an errand
        rather than a record. Absent entirely when there is nothing — a
        permanent "0 codes" heading teaches people that headings mean nothing.
      */}
      {diner.codes.length > 0 && (
        <Link
          href={`/${slug}/codes`}
          className="mb-5 flex items-center gap-3 rounded-[20px] px-4 py-3.5 transition active:scale-[0.99]"
          style={{ background: "var(--cafe-soft)", border: "1px solid var(--cafe-line)" }}
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
          >
            <GiftIcon className="h-[19px] w-[19px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-[14px] font-extrabold"
              style={{ color: "var(--cafe-text)" }}
            >
              {diner.codes.length} récompense{diner.codes.length > 1 ? "s" : ""} à récupérer
            </span>
            <span className="block truncate text-[11.5px] text-slate">
              Fais scanner le QR au comptoir.
            </span>
          </span>
          <span className="shrink-0 text-[17px] leading-none text-slate">›</span>
        </Link>
      )}

      {/*
        The total, stated once. "Historique" is already in the bar above — this
        line says the thing the bar cannot: how much this card has actually been
        worth. It is also what keeps the word on the page for the suites.
      */}
      <div className="mb-4">
        <h1 className="text-[13px] font-bold uppercase tracking-[0.08em] text-slate">Historique</h1>
        <p className="mt-1 text-[15px] leading-snug text-charcoal">
          <b className="text-[19px] font-extrabold" style={{ color: "var(--cafe-text)" }}>
            {fmtPoints(earned)}
          </b>{" "}
          points gagnés chez {cafe.name}.
        </p>
      </div>

      {activity.length === 0 ? (
        <div className="d-card px-6 py-12 text-center">
          <span
            className="mx-auto grid h-12 w-12 place-items-center rounded-2xl"
            style={{ background: "var(--cafe-soft)", color: "var(--cafe-text)" }}
          >
            <Sparkle className="h-6 w-6" />
          </span>
          <p className="mt-3 text-[14px] font-bold text-charcoal">Rien pour l&apos;instant</p>
          <p className="mx-auto mt-1 max-w-[28ch] text-[13px] text-slate">
            Ta prochaine visite chez {cafe.name} apparaîtra ici.
          </p>
        </div>
      ) : (
        months.map((m) => (
          <section key={m.key} className="mb-4">
            <h2 className="mb-1.5 px-1 text-[11.5px] font-bold uppercase tracking-[0.06em] text-slate">
              {m.key}
            </h2>
            <ul className="d-card divide-y divide-[var(--edge-2)] px-4">
              {m.rows.map((a, i) => {
                const tnd = ticket(a);
                return (
                  <li key={`${a.at}-${i}`} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      {/*
                        THE AMOUNT IS THE LABEL.

                        Every purchase used to read "Achat", nine times in a
                        column — a word that identifies nothing. What a customer
                        remembers is what they paid, and the ledger has known it
                        since 0024. "Achat · 12 TND" is a row you can place.
                      */}
                      <span className="block truncate text-[13.5px] font-semibold text-charcoal">
                        {a.reason === "collected"
                          ? `Récupéré${a.label ? ` · ${a.label}` : ""}`
                          : tnd
                            ? `Achat · ${tnd}`
                            : LABEL[a.reason]}
                      </span>
                      <span className="block text-[11px] text-slate">{ago(a.at)}</span>
                    </span>
                    {a.reason === "collected" ? (
                      <span className="shrink-0 text-[12px] font-bold text-slate">✓ pris</span>
                    ) : (
                      /* Earned is the shop's colour, spent is grey: on a white
                         page that is the only thing telling them apart. */
                      <span
                        className="shrink-0 text-[14px] font-extrabold tabular-nums"
                        style={{ color: a.delta > 0 ? "var(--cafe-text)" : "var(--muted)" }}
                      >
                        {a.delta > 0 ? "+" : ""}
                        {fmtPoints(a.delta)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
