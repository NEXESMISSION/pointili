"use client";

import { translator, type Lang } from "@/lib/dict";
import { Tpl } from "@/components/Tpl";
import { useActionState } from "react";
import { forgetDeviceAction, joinAction, type JoinState } from "./actions";

/**
 * ── THE SCREEN FOR SOMEBODY WHO IS ALREADY A CUSTOMER ─────────────────────
 *
 * A session can end for reasons the customer had no part in: they scanned the
 * QR from inside Instagram's browser this time and Safari last time, they
 * cleared their history, the phone dropped a cookie. Until now the product had
 * exactly one screen for "no session" — Nouveau compte, three fields, "choisis
 * un code secret" — and it is not a stretch to read that as "your card is gone,
 * make another one". People said so.
 *
 * Nothing was ever lost. Enrolment is idempotent, the welcome bonus is granted
 * once per shop, and the points sat there the whole time. So this screen says
 * that, and asks for the one thing it genuinely needs: the secret code.
 *
 * The number itself is not printed — the device remembers it (see
 * lib/auth/diner, DINER_HINT) and the action reads it from the cookie. What is
 * shown is the last three digits, which is enough for "yes, that's me" and
 * useless to anyone else.
 */
export function WelcomeBack({
  slug,
  masked,
  name,
  points,
  cafeName,
  lang = "fr",
}: {
  slug: string;
  /** "••• 123" — enough to recognise, not enough to be a phone number. */
  masked: string;
  /** Their first name, if they gave one. */
  name: string | null;
  /** What is waiting for them at THIS shop. The reassurance, in a number. */
  points: number | null;
  cafeName: string;
  /** The reader's language — a translator cannot cross the server boundary. */
  lang?: Lang;
}) {
  const t = translator(lang);
  const [state, formAction, pending] = useActionState<JoinState, FormData>(
    joinAction.bind(null, slug),
    {},
  );

  return (
    <div className="mt-7">
      <div
        className="rounded-3xl px-5 py-5 text-center"
        style={{ background: "var(--cafe-soft)" }}
      >
        <p className="text-[19px] font-extrabold leading-tight text-charcoal">
          {name ? t("Bon retour, {name}", { name }) : t("Bon retour")}
        </p>
        {/*
          The point of the whole screen: your card is not gone. Said with the
          balance when we have one, because a number is believed and a
          reassurance is not.
        */}
        <p className="mt-1 text-[13.5px] leading-relaxed text-charcoal/75">
          {points !== null && points > 0 ? (
            <Tpl
              tpl={t("Ta carte {shop} t'attend avec {n}. Entre ton code secret pour la rouvrir.")}
              slots={{
                shop: cafeName,
                n: (
                  <b className="font-extrabold" style={{ color: "var(--cafe-text)" }}>
                    {t.n(points, "point")}
                  </b>
                ),
              }}
            />
          ) : (
            t("Ta carte {shop} est toujours là. Entre ton code secret pour la rouvrir.", {
              shop: cafeName,
            })
          )}
        </p>
        {/* dir=ltr: the "+" of +216 is a Unicode neutral and lands at the far
            end of an RTL run — the masked number read "123 ••• 216+". */}
        <p dir="ltr" className="mt-2 font-mono text-[12.5px] text-charcoal/60">
          +216 {masked}
        </p>
      </div>

      <form action={formAction} className="mt-5 space-y-3">
        {/* the number comes from the cookie, server-side — never from here */}
        <input type="hidden" name="mode" value="return" />
        <label htmlFor="pin" className="mb-2 block text-[13px] font-semibold text-charcoal">
          {t("Ton code secret")}
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          dir="ltr"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={4}
          autoFocus
          placeholder="••••"
          /* 16px floor — anything smaller makes iOS zoom the page on focus */
          className="w-full rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3.5 text-center text-[22px] font-bold tracking-[0.5em] text-charcoal outline-none focus:border-[var(--cafe)]"
        />

        {state.error && (
          <p role="alert" className="rounded-2xl bg-[#e5484d]/12 px-4 py-3 text-[13px] font-semibold text-[#e5484d]">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl py-3.5 text-[15px] font-bold transition active:scale-[0.99] disabled:opacity-60"
          style={{ background: "var(--cafe)", color: "var(--cafe-ink)" }}
        >
          {pending ? "…" : t("Rouvrir ma carte")}
        </button>
      </form>

      {/*
        The other person who holds this phone.

        A shared family phone is normal here, so "ce n'est pas moi" has to be a
        real door and not fine print — it forgets the number and puts the full
        form back.
      */}
      <form action={forgetDeviceAction} className="mt-4 text-center">
        <button type="submit" className="text-[12.5px] font-semibold text-slate underline underline-offset-2">
          {t("Ce n'est pas moi — utiliser un autre numéro")}
        </button>
      </form>
    </div>
  );
}
