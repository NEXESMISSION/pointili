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
 * A YEAR, so nobody is asked twice. httpOnly because nothing on the client
 * needs to read it — every surface that cares is server-rendered and reads it
 * through lib/i18n's currentLang().
 *
 * revalidatePath("/", "layout") because a layout is not re-rendered by a plain
 * action, and the layouts are where dir() and the lang-tn class are applied.
 * Without it the copy switches while the page is still laid out left-to-right.
 */
export async function setLangAction(formData: FormData) {
  const lang: Lang = formData.get("lang") === "tn" ? "tn" : "fr";
  const jar = await cookies();
  jar.set(LANG_COOKIE, lang, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 86400,
  });
  revalidatePath("/", "layout");
}
