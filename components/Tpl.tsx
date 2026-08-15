import { Fragment } from "react";
import { parts } from "@/lib/dict";

/**
 * A translated sentence whose {slots} are React, not strings.
 *
 * The counted sentences on the diner side all emphasise their figure — «Encore
 * **30 points** pour **Thé à la menthe**» — and that used to be built in JSX
 * out of dictionary fragments:
 *
 *     {t("Encore")} <b>{n} {t(n >= 2 ? "points" : "point")}</b> {t("pour")} {label}
 *
 * which fixes FRENCH word order into the markup. Tunisian puts the same pieces
 * in a different order (باقيلك {n} باش تاخذ {reward}), so the Arabic could
 * never be right no matter how good each fragment's translation was.
 *
 * Here the whole sentence is one dictionary entry — reviewable by somebody who
 * speaks the language, with no HTML in it — and this component drops the
 * caller's nodes into whichever positions that language chose.
 *
 * Server component: it renders no interactivity, so it costs a client bundle
 * nothing and works inside the client components that import it too.
 */
export function Tpl({
  tpl,
  slots,
}: {
  /** An ALREADY-TRANSLATED template, still holding its {braces}. */
  tpl: string;
  /** What each {slot} renders as. A slot with no entry prints its own name. */
  slots: Record<string, React.ReactNode>;
}) {
  return (
    <>
      {parts(tpl).map((p, i) => (
        <Fragment key={i}>{p.slot ? (slots[p.slot] ?? p.text) : p.text}</Fragment>
      ))}
    </>
  );
}
