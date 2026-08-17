"use client";

import { useActionState } from "react";
import { EARLY_TYPES } from "@/lib/businessTypes";
import { translator, type Lang } from "@/lib/dict";
import {
  answerWantAction,
  requestEarlyAccessAction,
  type EarlyState,
  type WantState,
} from "./actions";

/**
 * THREE FIELDS AND A BUTTON.
 *
 * Every decision in here is a defence of that number. There is no e-mail field,
 * no city, no Instagram, no "how did you hear about us", no password, no
 * checkbox to accept anything, and no second call to action. The form asks who
 * they are, what they are, and how to reach them — and then it stops.
 *
 * ── THE CATEGORY IS FIVE BUTTONS, NOT A DROPDOWN OF TWENTY-THREE ──────────
 *
 * lib/businessTypes has twenty-three categories and every one of them is right
 * for the owner app, where a shop is naming itself properly and once. Here it
 * would be a search: a <select> asks the reader to open it, read a list, and
 * decide which of "Boulangerie" and "Pâtisserie" they are. Five radio buttons
 * are one glance and one tap, and "Autre" catches the rest honestly — which is
 * information too, since nobody has yet proved which trades want this.
 *
 * They are REAL RADIO INPUTS wearing labels, not buttons driving useState. The
 * selection is then part of the form the browser submits, it survives a failed
 * attempt without any state to restore, it is reachable with a keyboard and
 * announced correctly by a screen reader, and it costs no JavaScript.
 *
 * ── AND THE THANK-YOU ASKS ONE MORE THING ─────────────────────────────────
 *
 * Only after `done`. By then the row exists: the question cannot cost the lead,
 * because there is no longer a lead to lose. Skipping it is a real option and
 * looks like one — no dimmed overlay, no "just one more step", no way to fail.
 */
export function EarlyForm({ lang, source }: { lang: Lang; source: string }) {
  const t = translator(lang);
  const action = requestEarlyAccessAction.bind(null, lang);
  const [state, formAction, pending] = useActionState<EarlyState, FormData>(action, {});

  if (state.done) return <Done lang={lang} />;

  const label = "mb-2 block text-[13px] font-semibold text-charcoal";
  const box =
    /* 16px is a FLOOR, not a taste: any input under 16px makes iOS zoom the
       whole page the instant it is focused, and this form is read on a phone
       almost exclusively. Shrink anything else, never this. */
    "w-full rounded-[3px] border bg-white px-4 py-3.5 text-[16px] font-medium text-charcoal outline-none transition-colors placeholder:font-normal placeholder:text-slate/60 focus:border-royal";
  const edge = (bad: boolean) => (bad ? "border-seal" : "border-hair");

  return (
    <form
      action={formAction}
      /* relative so the honeypot below is positioned against THIS form and not
         against whatever happens to be positioned further up the page */
      className="relative rounded-[3px] border border-hair bg-white p-5 shadow-[0_1px_0_rgba(26,19,48,.04)] md:p-6"
    >
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-royal">
        {t("Demander l'accès")}
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-slate">
        {t("Trois questions. Ça prend vingt secondes.")}
      </p>

      {/* Where they came from, carried through the submit. Written down, never
          trusted — see cleanSource in actions.ts. */}
      <input type="hidden" name="source" value={source} />

      {/*
        The honeypot: no label, no tab stop, no autocomplete, off the screen for
        everyone. A person never meets it; a form-filling bot fills everything.
        aria-hidden as well as visually hidden, so a screen reader does not read
        out a field its user cannot be allowed to fill in.
      */}
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor="company_url">Site</label>
        {/* aria-hidden on the INPUT as well as the wrapper. The wrapper alone
            is not enough in practice: a screen reader that walks the form's
            field list can reach it anyway, and a blind user being told to fill
            in "Site" is a blind user whose submission gets silently discarded.
            tabIndex=-1 keeps it out of the tab order, which is also what makes
            aria-hidden legitimate here rather than a violation. */}
        <input
          id="company_url"
          name="company_url"
          type="text"
          tabIndex={-1}
          aria-hidden
          autoComplete="off"
        />
      </div>

      <div className="mt-6 space-y-5">
        {/* 1 ── the name */}
        <div>
          <label htmlFor="name" className={label}>
            <span className="font-mono text-[11px] text-royal">01</span>{" "}
            {t("Nom de votre commerce")}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={80}
            autoComplete="organization"
            placeholder={t("Café El Manar")}
            aria-invalid={state.field === "name" || undefined}
            className={`${box} ${edge(state.field === "name")}`}
          />
        </div>

        {/* 2 ── what kind of shop */}
        <fieldset>
          <legend className={label}>
            <span className="font-mono text-[11px] text-royal">02</span>{" "}
            {t("Quel type de commerce ?")}
          </legend>
          {/*
            Wrapping pills rather than a grid: the labels have very different
            lengths ("Café" against "Beauté & cosmétiques") and a fixed grid
            either wraps the long one onto two lines or makes every cell as tall
            as the worst case. Wrapping lets each be its own width and stays
            correct in Arabic, where the same five words measure differently.
          */}
          <div className="flex flex-wrap gap-2">
            {EARLY_TYPES.map((type, i) => (
              /* htmlFor/id rather than relying on the label wrapping the input.
                 Both are valid HTML, but with a visually-hidden input the
                 EXPLICIT association is what reliably gives the control its
                 accessible name — otherwise it is announced as its value
                 ("cafe", "beaute") instead of "Café", "Beauté & cosmétiques".
                 dir stays with the page: the emoji leads the word in both
                 directions because it is a picture of the thing, and `gap` is
                 direction-aware. */
              <label key={type.key} htmlFor={`type-${type.key}`} className="cursor-pointer">
                <input
                  id={`type-${type.key}`}
                  type="radio"
                  name="type"
                  value={type.key}
                  defaultChecked={i === 0}
                  className="peer sr-only"
                />
                <span
                  className={`flex items-center gap-2 rounded-[3px] border px-3.5 py-2.5 text-[14px] font-semibold transition ${edge(
                    state.field === "type",
                  )} bg-white text-slate hover:border-royal/50 peer-checked:border-charcoal peer-checked:bg-charcoal peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-royal/40`}
                >
                  <span aria-hidden>{type.emoji}</span>
                  {t(type.label)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* 3 ── the number, which is the whole point of the page */}
        <div>
          <label htmlFor="phone" className={label}>
            <span className="font-mono text-[11px] text-royal">03</span>{" "}
            {t("Numéro WhatsApp")}
          </label>
          {/* The +216 is fixed furniture, not something to type — same reason as
              the diner's join form: a number typed with its country code and one
              typed without it must not become two different people, and showing
              the prefix makes the 8-digit local number the only thing on offer. */}
          <div className="flex items-stretch gap-2">
            {/*
              NO FLAG HERE, unlike the diner's join form — and for the reason
              the landing page footer already writes down. Windows ships no
              regional-indicator glyphs, so 🇹🇳 renders there as the two bare
              letters "TN", which next to "+216" reads as a rendering fault
              rather than a country. The join form can keep its flag because it
              is only ever reached from a QR code on a table, i.e. a phone; this
              page is indexed, linked and read on desktops too.

              dir=ltr: a phone number is typed left to right in every language,
              and the + jumps to the wrong end without it.
            */}
            <span
              dir="ltr"
              className="flex shrink-0 items-center rounded-[3px] border border-hair bg-white px-3.5 text-[14px] font-semibold text-charcoal"
            >
              +216
            </span>
            <input
              id="phone"
              name="phone"
              type="tel"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="25 123 456"
              aria-invalid={state.field === "phone" || undefined}
              className={`${box} ${edge(state.field === "phone")} tracking-[0.04em]`}
            />
          </div>
          <p className="mt-2 text-[12px] leading-snug text-slate">
            {t("On vous écrit ici quand l'accès anticipé ouvre. Rien d'autre.")}
          </p>
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="mt-5 rounded-[3px] border border-seal/25 bg-seal-soft px-4 py-3 text-[13px] font-semibold text-seal"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-[3px] bg-royal px-6 py-4 text-[15px] font-bold text-white transition hover:bg-[#4c33b4] active:translate-y-px disabled:opacity-60"
      >
        {pending ? (
          "· · ·"
        ) : (
          <>
            <span aria-hidden>🚀</span>
            {t("Demander l'accès anticipé")}
          </>
        )}
      </button>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */

/**
 * THE ONE OPTIONAL QUESTION.
 *
 * The four answers were nearly three ways of saying "make my customers come
 * back", which as market research is a question with one option. They are
 * distinct now — come back more often / have a real programme at all / know who
 * my customers are / just looking — because the point of asking is to learn
 * something, and four bars all meaning the same thing teach nothing.
 *
 * Each answer is a submit button carrying its own value, so this is one form
 * and no state: tap, it posts, the screen thanks them.
 */
const WANTS = [
  { key: "retour", emoji: "🔄", label: "Faire revenir mes clients plus souvent" },
  { key: "systeme", emoji: "🎁", label: "Avoir un vrai programme de fidélité" },
  { key: "connaitre", emoji: "👥", label: "Savoir qui sont mes habitués" },
  { key: "curieux", emoji: "👀", label: "Je veux juste en savoir plus" },
];

function Done({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const [state, formAction, pending] = useActionState<WantState, FormData>(answerWantAction, {});

  return (
    <div className="rounded-[3px] border border-hair bg-white p-5 md:p-6">
      <p className="text-[34px] leading-none" aria-hidden>
        🚀
      </p>
      <h2 className="mt-4 text-[26px] md:text-[30px]">{t("Vous êtes sur la liste")}</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-slate">
        {t("Merci ! On vous écrit sur WhatsApp dès que Pointili ouvre pour votre commerce.")}
      </p>

      {/* The rule under this line is the whole design of the screen: everything
          above it is the confirmation they came for and is finished; everything
          below it is a favour they can walk away from. */}
      <div className="my-6 h-px bg-hair" />

      {state.answered ? (
        <p className="text-[14.5px] font-semibold text-charcoal">
          {t("Merci — ça nous aide vraiment.")} <span aria-hidden>🙏</span>
        </p>
      ) : (
        <form action={formAction}>
          <p className="text-[15px] font-bold text-charcoal">
            {t("Une dernière chose, si vous voulez :")}
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-slate">
            {t("Qu'est-ce qui vous intéresse le plus dans Pointili ?")}
          </p>

          <div className="mt-4 grid gap-2">
            {WANTS.map((w) => (
              <button
                key={w.key}
                type="submit"
                name="want"
                value={w.key}
                disabled={pending}
                className="flex items-center gap-3 rounded-[3px] border border-hair bg-white px-4 py-3 text-start text-[14px] font-semibold text-charcoal transition hover:border-royal hover:bg-mist active:translate-y-px disabled:opacity-50"
              >
                <span aria-hidden className="text-[16px]">
                  {w.emoji}
                </span>
                {t(w.label)}
              </button>
            ))}
          </div>
        </form>
      )}
    </div>
  );
}
