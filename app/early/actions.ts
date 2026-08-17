"use server";

import { cookies } from "next/headers";
import { isEarlyType } from "@/lib/businessTypes";
import { isValidPhone, normalisePhone } from "@/lib/auth/crypto";
import { answerEarlyAccess, submitEarlyAccess, type EarlyWant } from "@/lib/earlyAccess";
import { translator, type Lang } from "@/lib/dict";

/**
 * The two writes behind /early, and they are not symmetrical.
 *
 * The FIRST one is the whole business: a shop owner who fills three fields and
 * gets an error has, in practice, gone. So every failure it can produce says
 * which field to fix, in the reader's own language, and a database problem says
 * so out loud instead of pretending.
 *
 * The SECOND is optional by construction. It runs after the row is already
 * saved, it can fail silently, and it is never allowed to make the first one
 * look like it did not work.
 */

export type EarlyState = {
  error?: string;
  /** Which field to point at, so the form can mark it. */
  field?: "name" | "type" | "phone";
  /** Set once the lead is saved — the screen switches to the thank-you. */
  done?: true;
};

/**
 * WHERE THE ID GOES, AND WHY NOT TO THE BROWSER.
 *
 * The thank-you question has to update the row that was just written, so
 * something has to carry its id from the first action to the second. Returning
 * it in the action's state is the obvious move and it hands every visitor a
 * uuid that names a lead; ids are not guessable, but a page that prints one is
 * a page that puts it in a screenshot, a bug report and a browser history.
 *
 * An httpOnly cookie carries it instead: the browser holds it and cannot read
 * it, the second action reads it back server-side, and it is gone in an hour.
 * Scoped to /early so it is never sent with any other request on the origin.
 */
const LEAD_COOKIE = "pointili_early";

/**
 * WHERE THEY CAME FROM, capped and taken as a label rather than a fact.
 *
 * It arrives from a hidden field the page filled in from its own query string,
 * so it is client-supplied and treated as such: it decides nothing, it is only
 * written down. 'tag' is the one value with a meaning attached — see the page
 * for why that headline is only shown when it is true.
 */
function cleanSource(raw: FormDataEntryValue | null): string | null {
  const s = String(raw ?? "").trim().slice(0, 60);
  return /^[a-z0-9_.:-]{1,60}$/i.test(s) ? s : null;
}

export async function requestEarlyAccessAction(
  lang: Lang,
  _prev: EarlyState,
  formData: FormData,
): Promise<EarlyState> {
  const t = translator(lang);

  /*
    The honeypot. A field with no label, no tab stop and no autocomplete, which
    a person never sees and a form-filling bot cannot resist. Tripping it
    answers "saved" and writes nothing — telling a bot it was caught is telling
    it what to change.
  */
  if (String(formData.get("company_url") ?? "").trim()) return { done: true };

  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const type = String(formData.get("type") ?? "").trim();
  const rawPhone = String(formData.get("phone") ?? "").trim();

  if (name.length < 2) {
    return { error: t("Écris le nom de ton commerce."), field: "name" };
  }
  if (name.length > 80) {
    return { error: t("Ce nom est trop long."), field: "name" };
  }
  /* The five the page offered, re-checked here: the <input> that carries this
     is hidden, and a hidden field is a suggestion. */
  if (!isEarlyType(type)) {
    return { error: t("Choisis le type de ton commerce."), field: "type" };
  }

  const phone = normalisePhone(rawPhone);
  /*
    Tunisian numbers are checked HARDER than isValidPhone alone, and that is the
    point of the whole row. A seven-digit typo normalises to a perfectly valid
    +2167123456 and gets written down as a lead; nobody finds out until an
    operator opens WhatsApp weeks later and there is no such account. A number
    we cannot call is not a lead, so it is refused while the person is still
    looking at the field.
  */
  const tunisian = /^\+216\d{8}$/.test(phone);
  if (!tunisian && !(isValidPhone(phone) && !phone.startsWith("+216"))) {
    return { error: t("Ce numéro n'a pas l'air correct — 8 chiffres."), field: "phone" };
  }

  const res = await submitEarlyAccess(name, type, phone, cleanSource(formData.get("source")));
  if (!res.ok) {
    if (res.reason === "bad_phone") {
      return { error: t("Ce numéro n'a pas l'air correct — 8 chiffres."), field: "phone" };
    }
    /* Never a silent failure: nobody is going to call them if this row does not
       exist, and they have no way of finding that out. */
    return { error: t("Ça n'a pas marché. Réessaie dans un moment.") };
  }

  const jar = await cookies();
  jar.set(LEAD_COOKIE, res.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/early",
    maxAge: 60 * 60,
  });

  return { done: true };
}

const WANTS: EarlyWant[] = ["retour", "systeme", "connaitre", "curieux"];

export type WantState = { answered?: true };

/**
 * The optional answer.
 *
 * IT HAS NO FAILURE STATE, and that is deliberate rather than sloppy. The
 * screen thanks them the moment they tap, whether or not the write landed:
 * they have already given us the three things that mattered, and an error
 * message here would be the app complaining about a favour. If the row does not
 * get its `want`, the only cost is one missing data point in a bar chart.
 */
export async function answerWantAction(
  _prev: WantState,
  formData: FormData,
): Promise<WantState> {
  const want = String(formData.get("want") ?? "") as EarlyWant;
  if (!WANTS.includes(want)) return { answered: true };

  const jar = await cookies();
  const id = jar.get(LEAD_COOKIE)?.value;
  if (id) {
    await answerEarlyAccess(id, want);
    /* Answered once is answered. The function refuses a second write anyway;
       clearing it stops the cookie outliving its use on a shared phone. */
    jar.delete({ name: LEAD_COOKIE, path: "/early" });
  }
  return { answered: true };
}
