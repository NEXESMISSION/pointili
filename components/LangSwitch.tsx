import { type Lang } from "@/lib/dict";
import { setLangAction } from "@/lib/langAction";

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

/*
  The action moved to lib/langAction.

  The landing page now has its own language control (components/LangToggle) —
  different furniture, same cookie — and two copies of a cookie write are
  identical the day they are written and subtly different a month later. The
  shared one also revalidates the layout, which this one did not need while the
  diner screens were the only caller (they are all force-dynamic) and which the
  landing does need.
*/
