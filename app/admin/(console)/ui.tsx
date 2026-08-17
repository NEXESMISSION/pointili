import Link from "next/link";

/**
 * The console's vocabulary — the handful of shapes every page is built from.
 *
 * WHY THESE EXIST AT ALL. The old console was one file, so every panel invented
 * its own furniture as it went: three card radii, four heading treatments, two
 * different green ticks, and a stat tile in the traffic panel that looked
 * nothing like the stat line at the top of the page. That is survivable in one
 * screen and not survivable across seven — a shop's status has to look the same
 * in the roster, on its own page and in the alert queue, or the operator is
 * reading a different language on each.
 *
 * Server components, all of them: none holds state, and a console that ships
 * JavaScript to draw a heading is a console that got the split wrong.
 */

/* ── the page header ──────────────────────────────────────────────────────
   Every page opens the same way: what this is, one line of what it currently
   says, and the actions that belong to the whole page. `context` is not
   decoration — it is the answer to "do I need to be here?", which is the
   question that makes a seven-page console faster than a one-page one rather
   than slower. */
export function PageHead({
  title,
  context,
  back,
  children,
}: {
  title: string;
  context?: React.ReactNode;
  /** A parent to climb back to — a shop's page is the only place this is used. */
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate transition hover:text-royal"
          >
            <span aria-hidden>←</span>
            {back.label}
          </Link>
        )}
        <h1 className="truncate text-[22px] font-extrabold tracking-tight text-charcoal">
          {title}
        </h1>
        {context && <div className="mt-1 text-[12.5px] text-slate">{context}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/* ── a section of a page ──────────────────────────────────────────────── */
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="k-h">{title}</h2>
        {aside && <span className="k-num text-[11px] text-slate">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * What a section says when there is nothing in it.
 *
 * Deliberately a full-width panel with a sentence in it rather than a blank
 * space. On most days most of this console is empty, and empty has to read as
 * "checked, nothing waiting" — a section that simply disappears reads as
 * "broken" or, worse, is not noticed to be missing.
 */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="k-card px-4 py-5 text-[13px] text-slate">{children}</p>
  );
}

/* ── one number ───────────────────────────────────────────────────────────
   The figure leads, the label sits under it. `sub` is where the number's own
   caveat goes — "sur 30 jours", "0 visite mesurée" — because a figure whose
   basis is stated somewhere else on the page is a figure that gets quoted
   wrongly. */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "ok" | "warn" | "bad";
}) {
  const ink =
    tone === "ok" ? "text-[#1f7a52]" : tone === "warn" ? "text-[#8a5a00]" : tone === "bad" ? "text-[#b3202f]" : "text-charcoal";
  /*
    MONO IS FOR FIGURES, and this decides automatically rather than asking every
    call site to remember. A number or a string like "80 TND" is set in Space
    Mono with tabular figures, so a row of tiles lines up; anything passed as an
    element is prose — "il y a 1 j", "Essai" — and mono made those look like a
    terminal had leaked into the page. Space Mono's lowercase is very wide, so
    "il y a 1 j" was nearly as long as the number beside it and read as data.
  */
  const figure = typeof value !== "object";
  return (
    <div className="k-card px-4 py-3.5">
      <p className="k-h">{label}</p>
      <p
        className={`mt-1.5 font-extrabold leading-none ${ink} ${
          figure ? "k-num text-[24px]" : "text-[19px]"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[11.5px] leading-snug text-slate">{sub}</p>}
    </div>
  );
}

/* ── status, in one place ─────────────────────────────────────────────────
   Every screen that shows whether a shop is up derives it HERE. The rule is
   ordered, and the order is the point: a suspended shop that is also expired is
   suspended — that is the fact an operator has to act on, and reporting the
   expiry instead would send them to renew a shop we deliberately switched off. */
export type Tone = "ok" | "warn" | "bad" | "idle";

export function shopTone(shop: {
  suspendedAt: string | null;
  live: boolean;
  planExpiresAt: string | null;
}): { tone: Tone; label: string } {
  if (shop.suspendedAt) return { tone: "bad", label: "Suspendu" };
  if (!shop.live) return { tone: "bad", label: "Hors ligne" };
  if (shop.planExpiresAt) {
    const days = (new Date(shop.planExpiresAt).getTime() - Date.now()) / 86_400_000;
    if (days < 7) return { tone: "warn", label: "Expire bientôt" };
  }
  return { tone: "ok", label: "En ligne" };
}

export function Dot({ tone, title }: { tone: Tone; title?: string }) {
  return <span className={`k-dot k-${tone}`} title={title} aria-hidden />;
}

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`k-pill k-${tone}`}>{children}</span>;
}

/* ── formatting, so no two screens disagree ───────────────────────────── */

/** "16 août", "16 août 2025" once it is not this year. */
export function day(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    ...(thisYear ? {} : { year: "numeric" }),
  });
}

/** "16 août, 14:32" — for anything where the hour is part of the answer. */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${day(iso)}, ${new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * "il y a 3 j" — how long ago, in the shortest true form.
 *
 * The console asks "when did this last do anything?" far more often than it
 * asks "on what date"; a shop whose last sale was 41 days ago is a shop in
 * trouble, and "6 juillet" does not say that without arithmetic.
 */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "jamais";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 60) return `il y a ${d} j`;
  return `il y a ${Math.round(d / 30)} mois`;
}

/** The plan as a word, so "trial" never reaches a screen. */
export const PLAN_LABEL: Record<string, string> = {
  trial: "Essai",
  pro: "Pro",
  free: "Gratuit",
};

/**
 * The answer to something the operator just pressed.
 *
 * The queue's one-tap buttons (+6 mois, Réactiver) are plain <form action={…}>
 * server actions, which have nowhere to return a value to — so they used to
 * discard it, and a failed renewal repainted an unchanged row in silence. They
 * now redirect with ?ok= or ?err= and this renders it.
 *
 * role="status" / role="alert" so the outcome is announced rather than only
 * shown: the operator's eyes are on the row they just acted on, not on the top
 * of the page where this appears.
 */
export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  const bad = Boolean(err);
  return (
    <p
      role={bad ? "alert" : "status"}
      className={`mb-4 rounded-lg px-4 py-2.5 text-[13px] font-semibold ${
        bad
          ? "bg-[#fdecec] text-[#c0341c]"
          : "bg-[#e7f6ee] text-[#1f7a52]"
      }`}
    >
      {err || ok}
    </p>
  );
}
