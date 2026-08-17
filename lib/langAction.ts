"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LANG_COOKIE, type Lang } from "./dict";

/**
 * Set the reader's language and re-render.
 *
 * ONE action, because there are now two controls that set this cookie and they
 * must not drift: the settings card inside the customer's app (LangSwitch) and
 * the toggle in the landing page's header (LangToggle). A second copy of a
 * cookie write is the kind of duplication that is identical the day it is
 * written and subtly different a month later — different maxAge, one of them
 * missing the revalidate, and a language that sticks on one screen and not the
 * other.
 *
 * A YEAR, so nobody is asked twice.
 *
 * NOT httpOnly, and that is a correction. It was, on the reasoning that every
 * surface reading it is server-rendered — which is true of all but one, and the
 * exception is the one that matters most. app/[slug]/error.tsx is mounted by
 * React after a render below it has already failed: there is no server parent
 * left to hand it a language, so lib/langClient reads the cookie from
 * document.cookie. An httpOnly cookie is invisible there BY DEFINITION, so that
 * helper could only ever return "fr" and the error screen was permanently
 * French and left-to-right — for a Tunisian customer, on the screen that is
 * already the worst moment of their visit.
 *
 * There is nothing to protect here. A language preference is not a credential;
 * a script that can read it learns which of two languages somebody reads, which
 * it could also learn by looking at the page.
 *
 * revalidatePath("/", "layout") because a layout is not re-rendered by a plain
 * action, and the layouts are where dir() and the lang-tn class are applied.
 * Without it the copy switches while the page is still laid out left-to-right.
 */
export async function setLangAction(formData: FormData) {
  const lang: Lang = formData.get("lang") === "tn" ? "tn" : "fr";
  const jar = await cookies();
  jar.set(LANG_COOKIE, lang, {
    httpOnly: false, // see above — the error boundary reads this from document.cookie

    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 86400,
  });
  revalidatePath("/", "layout");
}
