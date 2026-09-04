/**
 * WHO MAY OPEN WHAT — the role table, and nothing else.
 *
 * A separate file from lib/auth/staff on purpose, and the reason is a hard
 * boundary rather than tidiness: staff.ts is "server-only" (it reads cookies
 * and the database), while the sign-in screen and the team editor are Client
 * Components that need the same three role names and the same sentence
 * describing each. Importing them from staff.ts pulls next/headers into the
 * browser bundle and the build fails — with a message about the Pages Router
 * that names none of this.
 *
 * So the DECISION lives here, where both sides can read it, and the SESSION
 * lives there. There is still exactly one table.
 */

export type StaffRole = "owner" | "manager" | "cashier";

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Propriétaire",
  manager: "Gérant",
  cashier: "Caissier",
};

/** What the person choosing a role is actually choosing, in one line. */
export const ROLE_NOTE: Record<StaffRole, string> = {
  owner: "Tout, y compris les réglages et cette page",
  manager: "La caisse, les clients, les récompenses, les chiffres",
  cashier: "La caisse et le QR",
};

export const ROLES: StaffRole[] = ["owner", "manager", "cashier"];

/** The areas of the owner app. One name per screen a role can be kept out of. */
export type Area = "caisse" | "qr" | "clients" | "analyses" | "reglages" | "equipe";

/**
 * THE LOAD-BEARING LINE IS `reglages`.
 *
 * That screen holds the switch that turns the record of who-did-what on, and
 * the roles themselves. A role that can reach it can switch off the account of
 * its own actions, which would make this whole feature decorative. `equipe` is
 * owner-only for the same reason — it is where the codes and the roles are set.
 *
 * Everything else is a judgement about what a job needs: a cashier serves the
 * queue, a manager also reads the numbers and the customers.
 */
const ALLOWED: Record<StaffRole, Area[]> = {
  owner: ["caisse", "qr", "clients", "analyses", "reglages", "equipe"],
  manager: ["caisse", "qr", "clients", "analyses"],
  cashier: ["caisse", "qr"],
};

export function allowedAreas(role: StaffRole): Area[] {
  return ALLOWED[role];
}

/**
 * May this person open that area?
 *
 * `null` means NOBODY IS SIGNED IN AS ANYONE, which is every shop that has not
 * switched staff codes on — and there the answer is yes to everything, because
 * the owner's own login is the only identity in play. It is the layout's job to
 * have refused already when the gate is on and the session is missing; that is
 * one decision, made once, above every screen.
 */
export function can(staff: { role: StaffRole } | null, area: Area): boolean {
  if (!staff) return true;
  return ALLOWED[staff.role].includes(area);
}
