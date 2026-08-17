"use client";

import { useActionState, useState } from "react";
import type { Method, Offer } from "@/lib/billing";
import type { PlatformSettings } from "@/lib/settings";
import { saveSettingsAction, type AdminState } from "../actions";

/**
 * The prices and the payment coordinates, as a form.
 *
 * ── WHY THESE ARE EDITED AS LISTS AND NOT AS FIXED FIELDS ─────────────────
 *
 * There are two offers and three payment methods TODAY. Hard-coding six inputs
 * for "6 mois", "1 an", "D17", "Flouci" and "RIB" would make adding a fourth
 * method — a new wallet, a second bank — a code change, which is the exact
 * problem this whole page exists to remove. So both are variable-length, with
 * add and remove, and they serialise into two hidden JSON fields on submit.
 *
 * ── THE PER-MONTH LINE IS NOT AN INPUT ────────────────────────────────────
 *
 * It is derived from the price and the duration on the server (lib/settings).
 * An operator who edits a price and forgets the comparison line publishes two
 * numbers that contradict each other on the same card, and the wrong one is the
 * one a shop owner does the arithmetic on.
 */
export function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(saveSettingsAction, {});
  const [offers, setOffers] = useState<Offer[]>(settings.offers);
  const [methods, setMethods] = useState<Method[]>(settings.methods);
  const [live, setLive] = useState(settings.paymentsLive);

  const setOffer = (i: number, patch: Partial<Offer>) =>
    setOffers((o) => o.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const setMethod = (i: number, patch: Partial<Method>) =>
    setMethods((m) => m.map((x, n) => (n === i ? { ...x, ...patch } : x)));

  return (
    <form action={act} className="space-y-5">
      {/* The two lists travel as JSON. Everything the operator sees is a real
          input; these two carry the assembled result. */}
      <input type="hidden" name="offers" value={JSON.stringify(offers)} />
      <input type="hidden" name="methods" value={JSON.stringify(methods)} />

      {/* ── offers ──────────────────────────────────────────────────── */}
      <div className="k-card p-4">
        <p className="k-h">Offres d&apos;abonnement</p>
        <p className="mt-1 text-[11.5px] leading-snug text-slate">
          Ce que voient la page d&apos;accueil et l&apos;écran de renouvellement. La
          ligne « ≈ X TND / mois » est calculée, pas saisie.
        </p>

        <ul className="mt-3 space-y-2">
          {offers.map((o, i) => (
            <li key={i} className="k-inset space-y-2 p-3">
              <div className="flex flex-wrap gap-2">
                <Labelled label="Identifiant" hint="ne le changez pas après la mise en ligne">
                  <input
                    value={o.id}
                    onChange={(e) => setOffer(i, { id: e.target.value as Offer["id"] })}
                    className="k-field k-field--num w-[80px]"
                  />
                </Labelled>
                <Labelled label="Libellé">
                  <input
                    value={o.label}
                    onChange={(e) => setOffer(i, { label: e.target.value })}
                    className="k-field w-[120px]"
                  />
                </Labelled>
                <Labelled label="Mois">
                  <input
                    type="number"
                    min={1}
                    max={36}
                    value={o.months}
                    onChange={(e) => setOffer(i, { months: Number(e.target.value) })}
                    className="k-field k-field--num w-[70px] text-center"
                  />
                </Labelled>
                <Labelled label="Prix TND">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={o.price}
                    onChange={(e) => setOffer(i, { price: Number(e.target.value) })}
                    className="k-field k-field--num w-[90px] text-center"
                  />
                </Labelled>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[12px] font-semibold text-charcoal">
                  <input
                    type="checkbox"
                    checked={Boolean(o.best)}
                    onChange={(e) =>
                      /* Only one can be "best" — the badge means nothing on two
                         cards, and the server refuses it anyway. Enforced here
                         so it cannot even be typed. */
                      setOffers((all) =>
                        all.map((x, n) =>
                          n === i
                            ? { ...x, ...(e.target.checked ? { best: true as const } : { best: undefined }) }
                            : { ...x, best: undefined },
                        ),
                      )
                    }
                    className="h-4 w-4 accent-[var(--color-royal)]"
                  />
                  Meilleure offre
                </label>
                <span className="k-num text-[11.5px] text-slate">
                  ≈ {o.months > 0 ? Math.round(o.price / o.months) : "?"} TND / mois
                </span>
                <button
                  type="button"
                  onClick={() => setOffers((all) => all.filter((_, n) => n !== i))}
                  className="ms-auto text-[11px] font-semibold text-slate/70 hover:text-[#b3202f]"
                >
                  Retirer
                </button>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() =>
            setOffers((all) => [
              ...all,
              { id: `offre${all.length + 1}` as Offer["id"], label: "", months: 12, price: 0, perMonth: "" },
            ])
          }
          className="k-btn k-btn--sm k-btn--ghost mt-2.5"
        >
          + Ajouter une offre
        </button>
      </div>

      {/* ── payment methods ─────────────────────────────────────────── */}
      <div className="k-card p-4">
        <p className="k-h">Où les cafés envoient l&apos;argent</p>
        <p className="mt-1 text-[11.5px] leading-snug text-slate">
          Chaque moyen doit porter au moins une ligne (un numéro, un RIB, un lien) —
          sinon le café arrive sur un écran qui nomme un moyen de paiement sans dire
          où payer.
        </p>

        <ul className="mt-3 space-y-2">
          {methods.map((m, i) => (
            <li key={i} className="k-inset space-y-2 p-3">
              <div className="flex flex-wrap gap-2">
                <Labelled label="Identifiant">
                  <input
                    value={m.id}
                    onChange={(e) => setMethod(i, { id: e.target.value as Method["id"] })}
                    className="k-field k-field--num w-[80px]"
                  />
                </Labelled>
                <Labelled label="Nom affiché">
                  <input
                    value={m.label}
                    onChange={(e) => setMethod(i, { label: e.target.value })}
                    className="k-field w-[150px]"
                  />
                </Labelled>
              </div>
              <Labelled label="Comment faire, dans les mots du propriétaire">
                <input
                  value={m.how}
                  onChange={(e) => setMethod(i, { how: e.target.value })}
                  placeholder="Ouvrez D17 → Transfert → saisissez le numéro…"
                  className="k-field w-full"
                />
              </Labelled>

              <div className="space-y-1.5">
                {m.lines.map((l, j) => (
                  <div key={j} className="flex flex-wrap gap-1.5">
                    <input
                      value={l.label}
                      onChange={(e) =>
                        setMethod(i, {
                          lines: m.lines.map((x, n) =>
                            n === j ? { ...x, label: e.target.value } : x,
                          ),
                        })
                      }
                      placeholder="Numéro D17"
                      className="k-field w-[168px]"
                      aria-label="Intitulé"
                    />
                    <input
                      value={l.value}
                      onChange={(e) =>
                        setMethod(i, {
                          lines: m.lines.map((x, n) =>
                            n === j ? { ...x, value: e.target.value } : x,
                          ),
                        })
                      }
                      dir="ltr"
                      placeholder="TN59 …"
                      className="k-field k-field--num min-w-[160px] flex-1"
                      aria-label="Valeur"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setMethod(i, { lines: m.lines.filter((_, n) => n !== j) })
                      }
                      className="px-2 text-[11px] font-semibold text-slate/70 hover:text-[#b3202f]"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setMethod(i, { lines: [...m.lines, { label: "", value: "" }] })}
                  className="text-[11px] font-semibold text-royal"
                >
                  + ligne
                </button>
              </div>

              <button
                type="button"
                onClick={() => setMethods((all) => all.filter((_, n) => n !== i))}
                className="text-[11px] font-semibold text-slate/70 hover:text-[#b3202f]"
              >
                Retirer ce moyen de paiement
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() =>
            setMethods((all) => [
              ...all,
              { id: `moyen${all.length + 1}` as Method["id"], label: "", how: "", lines: [{ label: "", value: "" }] },
            ])
          }
          className="k-btn k-btn--sm k-btn--ghost mt-2.5"
        >
          + Ajouter un moyen de paiement
        </button>
      </div>

      {/* ── support ─────────────────────────────────────────────────── */}
      <div className="k-card p-4">
        <p className="k-h">Contact affiché aux commerces</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Labelled label="WhatsApp / téléphone">
            <input
              name="supportPhone"
              defaultValue={settings.supportPhone ?? ""}
              dir="ltr"
              placeholder="+216 25 123 456"
              className="k-field k-field--num w-[180px]"
            />
          </Labelled>
          <Labelled label="Email">
            <input
              name="supportEmail"
              type="email"
              defaultValue={settings.supportEmail ?? ""}
              placeholder="contact@pointili.online"
              className="k-field w-[220px]"
            />
          </Labelled>
        </div>
      </div>

      {/* ── the switch ──────────────────────────────────────────────── */}
      <div className="k-card p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="live"
            checked={live}
            onChange={(e) => setLive(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-royal)]"
          />
          <span>
            <span className="block text-[13.5px] font-bold text-charcoal">
              Les coordonnées ci-dessus sont réelles
            </span>
            <span className="mt-1 block text-[11.5px] leading-relaxed text-slate">
              Tant que cette case est décochée, chaque écran qui affiche un numéro ou un
              RIB prévient que ce sont des exemples. Ne la cochez qu&apos;une fois les
              vraies coordonnées vérifiées : après ça, un café qui envoie 120 TND
              l&apos;envoie pour de bon.
            </span>
          </span>
        </label>

        {/* The consequence, said at the moment of the change and not before. */}
        {live && !settings.paymentsLive && (
          <p className="k-note k-warn mt-3 w-full  px-3 py-2">
            Vous êtes sur le point de passer les paiements en direct. Relisez chaque
            numéro ci-dessus.
          </p>
        )}
        {!live && settings.paymentsLive && (
          <p className="k-note k-warn mt-3 w-full  px-3 py-2">
            Vous repassez en mode test : les cafés reverront un avertissement au-dessus
            des coordonnées.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="k-btn">
          {pending ? "· ·" : "Enregistrer les réglages"}
        </button>
        {state.error && (
          <p role="alert" className="k-note k-bad  px-3 py-2">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="k-note k-ok  px-3 py-2">
            {state.ok}
          </p>
        )}
      </div>
    </form>
  );
}

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-slate">
        {label}
        {hint && <span className="font-normal text-slate/70"> — {hint}</span>}
      </span>
      {children}
    </label>
  );
}
