/**
 * The early-access list, minus the database — the half a browser is allowed.
 *
 * WHY THIS FILE IS SEPARATE FROM lib/earlyAccess, which is the same split
 * lib/dict and lib/i18n already use, and for the same reason.
 *
 * The console's panel is a Client Component: it has per-row action state, an
 * expandable drawer and a two-step delete. It needs the status words, the
 * pipeline order and the wa.me helper — none of which touch a database — and it
 * was importing them from lib/earlyAccess, which begins `import "server-only"`.
 *
 * That does not fail quietly. `server-only` in a client module is a build
 * error, and because the module graph is shared it takes down every route that
 * transitively reaches it: the console, the owner app, and /owner/login, all at
 * once, with a page of errors naming lib/db and lib/auth rather than the file
 * that actually did it.
 *
 * So the pure half lives here, the privileged half imports it, and the rule is
 * simple enough to hold: if a Client Component needs it, it belongs in this
 * file. lib/billing.ts is the same shape for the renewal screens.
 */

export type EarlyWant = "retour" | "systeme" | "connaitre" | "curieux";
export type EarlyStatus = "new" | "contacted" | "demo" | "client" | "lost";

export type EarlyLead = {
  id: string;
  name: string;
  /** A key from BUSINESS_TYPES — resolve with businessType(). */
  type: string;
  phone: string;
  want: EarlyWant | null;
  source: string | null;
  status: EarlyStatus;
  note: string | null;
  createdAt: string;
  handledAt: string | null;
};

export type EarlyStats = {
  days: number;
  total: number;
  /** Leads nobody has opened WhatsApp for yet. */
  new: number;
  clients: number;
  /** Submitted inside the window — the numerator for `visits`. */
  recent: number;
  /** Sessions whose ENTRY page was /early inside the window. */
  visits: number;
  byType: { type: string; n: number }[];
  byWant: { want: EarlyWant; n: number }[];
};

/* ── words, in one place, so no screen invents its own ────────────────────── */

export const STATUS_LABEL: Record<EarlyStatus, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  demo: "Démo",
  client: "Client",
  lost: "Perdu",
};

/** The pipeline in order. `new` is not offered as a button — it is where they start. */
export const STATUS_FLOW: EarlyStatus[] = ["contacted", "demo", "client", "lost"];

export const WANT_LABEL: Record<EarlyWant, string> = {
  retour: "Faire revenir ses clients",
  systeme: "Avoir un vrai programme",
  connaitre: "Connaître ses clients",
  curieux: "Curieux",
};

/**
 * wa.me, from a stored +216… number.
 *
 * WhatsApp wants the digits WITHOUT the plus. Getting this wrong opens a broken
 * chat rather than failing visibly, which is the sort of thing an operator
 * discovers by not hearing back from anyone.
 */
export function whatsappLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

/** "+216 25 123 456" — readable at a glance, and dir="ltr" wherever it renders. */
export function prettyPhone(phone: string): string {
  const m = /^\+216(\d{2})(\d{3})(\d{3})$/.exec(phone);
  return m ? `+216 ${m[1]} ${m[2]} ${m[3]}` : phone;
}
