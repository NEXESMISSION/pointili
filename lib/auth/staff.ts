import "server-only";
import { cache } from "react";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Area, type StaffRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * WHICH PERSON BEHIND THE COUNTER IS HOLDING THE PHONE.
 *
 * Not a login. Reaching any of this already required the shop's Supabase email
 * and password — see 0048 for the full statement of what a 4-digit PIN does and
 * does not buy. This is the second half of an identity, inside a session that
 * is already authenticated: it turns "the shop credited 40 dinars" into "Sami
 * credited 40 dinars", and it splits the app by role so that the screen holding
 * the switch is not reachable by the people the switch is about.
 *
 * ── THE COOKIE ────────────────────────────────────────────────────────────
 *
 * Signed with HMAC-SHA256 over the same secret the diner session uses, with a
 * DOMAIN SEPARATOR baked into the signed string ("staff.v1"). That separator is
 * not decoration: without it a valid diner token and a valid staff token are
 * both "a base64 payload signed with this key", and the only thing standing
 * between them is that their payloads happen to have different fields. With it,
 * a token minted for one purpose cannot verify for the other at all.
 *
 * httpOnly, so a script on the page cannot lift a colleague's identity out of
 * document.cookie; and it carries the business id, so a cookie from one shop is
 * refused at another even in the impossible case that both are open.
 *
 * TWELVE HOURS, which is a shift. The point of the red button in the caisse is
 * that somebody can leave deliberately; the expiry is what covers the evening
 * they forget. Longer would mean the morning shift inherits last night's name.
 */
export const STAFF_COOKIE = "pointili_staff";
const SHIFT_HOURS = 12;
const DOMAIN = "staff.v1";

/* The role table lives in lib/roles — the sign-in screen and the team editor
   are Client Components and this module is server-only. Re-exported here so a
   server caller has one import for "who is on, and what may they open". */
export { ROLE_LABEL, ROLE_NOTE, ROLES, can, allowedAreas } from "@/lib/roles";
export type { StaffRole, Area } from "@/lib/roles";

export type Staff = {
  id: string;
  name: string;
  role: StaffRole;
};

type Payload = { k: string; s: string; b: string; n: string; r: StaffRole; exp: number };

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function secret() {
  const s = process.env.DINER_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("DINER_SESSION_SECRET is missing or too short — set it in .env.local");
  }
  return s;
}

function sign(data: string) {
  return b64url(createHmac("sha256", secret()).update(`${DOMAIN}.${data}`).digest());
}

function mint(staff: Staff, businessId: string): string {
  const payload: Payload = {
    k: DOMAIN,
    s: staff.id,
    b: businessId,
    n: staff.name,
    r: staff.role,
    exp: Math.floor(Date.now() / 1000) + SHIFT_HOURS * 3600,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function read(token: string | undefined): Payload | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  /*
    timingSafeEqual, and it throws on a length mismatch — so compare lengths
    first. A plain `===` on two base64 strings leaks how much of a forged
    signature was right, one byte at a time.
  */
  const expected = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;

  try {
    const p = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()) as Payload;
    if (p.k !== DOMAIN) return null;
    if (!p.s || !p.b || !p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

/**
 * Who is on this device, re-checked against the database.
 *
 * The cookie is tamper-evident, so its NAME and ROLE could simply be trusted —
 * and that is exactly the trap. A role lives in a token for twelve hours; a
 * shop that demotes somebody at nine in the morning means it at nine in the
 * morning, not at nine at night. The same goes for removing a person outright.
 *
 * So the token proves WHO, and the row decides WHAT. One indexed read per
 * request, deduped by cache() for the several places that ask.
 */
export const currentStaff = cache(async function currentStaff(businessId: string): Promise<Staff | null> {
  const jar = await cookies();
  const p = read(jar.get(STAFF_COOKIE)?.value);
  if (!p || p.b !== businessId) return null;

  const db = createAdminClient();
  const { data } = await db
    .from("staff")
    .select("id, name, role, active")
    .eq("id", p.s)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!data || !data.active) return null;
  return { id: data.id, name: data.name, role: data.role as StaffRole };
});

export async function startStaffSession(staff: Staff, businessId: string) {
  const jar = await cookies();
  jar.set(STAFF_COOKIE, mint(staff, businessId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SHIFT_HOURS * 3600,
  });
}

/** The red button. Nobody should wear somebody else's name home. */
export async function endStaffSession() {
  const jar = await cookies();
  jar.delete(STAFF_COOKIE);
}

/**
 * The same question for a server action, phrased so the answer cannot be
 * ignored: it throws.
 *
 * Every guarded PAGE also guards its ACTIONS with this. Hiding a tab is a
 * courtesy to the person holding the phone; a server action is a public HTTP
 * endpoint, and a cashier who knows the URL is exactly the person this feature
 * is about.
 */
export async function guardArea(businessId: string, area: Area): Promise<Staff | null> {
  const staff = await currentStaff(businessId);
  /* Back to the till, which is where they work — not a 404, and not an error
     screen. Somebody tapping a bookmarked link is not doing anything wrong. */
  if (!can(staff, area)) redirect("/owner");
  return staff;
}

export async function requireArea(businessId: string, area: Area): Promise<Staff | null> {
  const staff = await currentStaff(businessId);
  if (!can(staff, area)) throw new Error("FORBIDDEN");
  return staff;
}

/* ── and the record ─────────────────────────────────────────────────────── */

export type ActionKind =
  | "credit"
  | "stamp"
  | "collect"
  | "adjust"
  | "set_stamps"
  | "pin_reset"
  | "sign_in"
  | "sign_out";

/**
 * Write one line of "who did that".
 *
 * NEVER THROWS. This is bookkeeping attached to something that has already
 * happened — the points are credited, the reward is collected — so a failure to
 * write the note must not turn a completed sale into an error message at the
 * counter. It is logged where an engineer will see it instead.
 *
 * When the feature is off there is no staff row, and the line is recorded
 * against "Propriétaire". That is not a placeholder: the owner's login is the
 * only identity the shop has, and saying so is more honest than a blank.
 */
export async function logStaffAction(
  businessId: string,
  kind: ActionKind,
  details: {
    staff?: Staff | null;
    customer?: string | null;
    points?: number | null;
    amountTnd?: number | null;
    label?: string | null;
  } = {},
) {
  try {
    const staff = details.staff === undefined ? await currentStaff(businessId) : details.staff;
    const db = createAdminClient();
    await db.from("staff_actions").insert({
      business_id: businessId,
      staff_id: staff?.id ?? null,
      staff_name: staff?.name ?? "Propriétaire",
      staff_role: staff?.role ?? "owner",
      kind,
      customer: details.customer ?? null,
      points: details.points ?? null,
      amount_tnd: details.amountTnd ?? null,
      label: details.label ?? null,
    });
  } catch (e) {
    console.error("[staff] could not record an action:", e);
  }
}
