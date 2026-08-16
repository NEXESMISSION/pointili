import { setLangAction } from "@/lib/langAction";
import type { Lang } from "@/lib/dict";

/**
 * FR · تونسي — the language control for the LANDING PAGE.
 *
 * WHY NOT components/LangSwitch. That one is a settings CARD: it wears `d-card`
 * and paints itself from --cafe-soft / --cafe-text / --track, which are the
 * customer card's per-shop theme variables. They do not exist out here, so on
 * the landing it would render as an unstyled box, and even themed it is the
 * wrong furniture — a titled panel with 42px targets, sitting in a masthead
 * row that is otherwise 13px type. Same cookie, same server action
 * (lib/langAction), different object.
 *
 * BOTH OPTIONS ARE ALWAYS VISIBLE, which is the one decision worth repeating
 * from LangSwitch: a toggle showing only the OTHER language makes you work out
 * whether it is telling you what you have or offering what you could have.
 * Here the current one is filled and the other is not.
 *
 * "تونسي" in its own script, never "Tounsi" — somebody who wants this language
 * is not reading the Latin word for it. And "FR" rather than "Français"
 * because this sits in a masthead that also has to hold a brand, an audience
 * switch and a call to action on a 390px phone.
 *
 * No JavaScript: a form, two submit buttons, a cookie, a re-render. The page
 * coming back in the other language is also the only proof worth showing that
 * the control worked.
 */
export function LangToggle({ current, className = "" }: { current: Lang; className?: string }) {
  const opts = [
    { key: "fr", label: "FR", aria: "Français" },
    { key: "tn", label: "تونسي", aria: "بالتونسي" },
  ] as const;

  return (
    <form
      action={setLangAction}
      className={`shrink-0 ${className}`}
      /* The control names itself for a screen reader; the buttons carry only
         the language names, which is all a sighted reader needs. */
      aria-label={current === "tn" ? "اللغة" : "Langue"}
    >
      <div className="flex items-stretch overflow-hidden rounded-[3px] border border-hair">
        {opts.map((o, i) => {
          const on = o.key === current;
          return (
            <button
              key={o.key}
              type="submit"
              name="lang"
              value={o.key}
              aria-label={o.aria}
              aria-pressed={on}
              /* dir is forced per option so the Arabic label is laid out as
                 Arabic even while the page is still in French, and the Latin
                 one stays Latin once the page has flipped to RTL. Without it
                 the inactive option renders in the page's direction and the
                 two buttons swap places on every switch. */
              dir={o.key === "tn" ? "rtl" : "ltr"}
              className={[
                "px-2.5 py-1.5 text-[12px] font-bold leading-none transition",
                i === 1 ? "border-s border-hair" : "",
                on
                  ? "bg-charcoal text-white"
                  : "bg-white text-slate hover:bg-mist hover:text-charcoal",
              ].join(" ")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </form>
  );
}
