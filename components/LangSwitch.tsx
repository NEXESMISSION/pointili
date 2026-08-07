import { LANG_COOKIE, type Lang } from "@/lib/dict";

/**
 * FRANÇAIS · تونسي — the whole language control.
 *
 * A form and two buttons, no JavaScript: the choice is a cookie, and a server
 * action that sets one is the smallest correct thing. It reloads the screen
 * they are on, in the other language, which is also the only proof worth
 * showing that it worked.
 *
 * "Tunisien" is written in its own script (تونسي) rather than transliterated —
 * somebody who wants this language is not reading the Latin word for it. And
 * both options are always visible: a toggle that shows only the OTHER language
 * makes you work out whether it is stating what you have or offering what you
 * could have.
 */
export function LangSwitch({ current }: { current: Lang }) {
  return (
    <form action={setLangAction} className="d-card px-4 py-3.5">
      <p className="text-[13px] font-bold text-charcoal">
        {current === "tn" ? "اللغة" : "Langue"}
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {(
          [
            { key: "fr", label: "Français" },
            { key: "tn", label: "تونسي" },
          ] as const
        ).map((o) => {
          const on = o.key === current;
          return (
            <button
              key={o.key}
              type="submit"
              name="lang"
              value={o.key}
              aria-pressed={on}
              className="min-h-[42px] rounded-2xl text-[13.5px] font-bold transition active:scale-[0.98]"
              style={
                on
                  ? { background: "var(--cafe-soft)", color: "var(--cafe-text)" }
                  : { background: "var(--track)", color: "var(--muted)" }
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </form>
  );
}

/**
 * Set the cookie and re-render.
 *
 * A YEAR, and no revalidatePath: the diner screens are all force-dynamic, so
 * the next render reads the new cookie on its own. There is nothing cached to
 * bust and nothing to redirect to — they stay exactly where they were.
 */
async function setLangAction(formData: FormData) {
  "use server";
  const { cookies } = await import("next/headers");
  const { revalidatePath } = await import("next/cache");
  const lang: Lang = formData.get("lang") === "tn" ? "tn" : "fr";
  const jar = await cookies();
  jar.set(LANG_COOKIE, lang, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 86400,
  });
  /* The layout reads the cookie, and a layout is not re-rendered by a plain
     action — without this the tab bar keeps the old language until a hard
     navigation. */
  revalidatePath("/", "layout");
}
