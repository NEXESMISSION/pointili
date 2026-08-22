"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABEL, type StaffRole } from "@/lib/roles";
import { recoverAction, signInAction } from "./actions";

/**
 * WHO IS HOLDING THE PHONE — the first screen of the shift.
 *
 * It renders instead of the app, from the layout, so there is no version of any
 * owner screen that a person can reach without having said who they are. That
 * placement is the whole design: a gate that each page opts into is a gate with
 * a page somebody forgot to add it to.
 *
 * ── TAP YOUR NAME, THEN YOUR CODE ─────────────────────────────────────────
 *
 * Not "type your code and we will work out who you are". Two people picking the
 * same four digits is not a possibility to design against, it is a Tuesday —
 * and when it happens, a code-first screen silently signs in whichever row the
 * query returned first, and attributes somebody's whole shift to their
 * colleague. That is the exact failure this feature exists to prevent, so the
 * person is chosen explicitly and the code only ever proves one identity.
 *
 * It also makes the lockout usable: five wrong tries stops ONE tile, not the
 * shop.
 *
 * ── AND IT IS A KEYPAD ────────────────────────────────────────────────────
 *
 * Four big keys' worth of screen, one-handed, no keyboard sliding up over the
 * layout. The dots fill as you press and the code submits itself on the fourth
 * digit — there is nothing else it could be waiting for.
 */
export function StaffGate({
  shop,
  people,
}: {
  shop: string;
  people: { id: string; name: string; role: StaffRole }[];
}) {
  const router = useRouter();
  const [who, setWho] = useState<{ id: string; name: string; role: StaffRole } | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  /* The way back in for an owner who forgot four digits — see recoverAction. */
  const [lost, setLost] = useState(false);
  const [password, setPassword] = useState("");
  /* Guards the auto-submit: the fourth digit fires it from an effect, and a
     second render before the transition settles would fire it twice. */
  const sending = useRef(false);

  useEffect(() => {
    if (pin.length !== 4 || !who || sending.current) return;
    sending.current = true;
    const code = pin;
    start(async () => {
      const res = await signInAction(who.id, code);
      sending.current = false;
      if (res.ok) {
        /* refresh(), not a push: the gate is rendered by the layout in place of
           the app, so the same URL renders the app once the cookie is set. */
        router.refresh();
        return;
      }
      setPin("");
      setError(res.error ?? "Code incorrect.");
    });
  }, [pin, who, router]);

  const key = (k: string) => {
    setError("");
    if (k === "⌫") return setPin((p) => p.slice(0, -1));
    setPin((p) => (p.length >= 4 ? p : p + k));
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-8">
      <p className="text-center text-[11px] font-bold uppercase tracking-[0.1em] text-slate">{shop}</p>

      {!who ? (
        <>
          <h1 className="mt-1 text-center text-[24px] font-extrabold leading-tight text-charcoal">
            Qui est à la caisse ?
          </h1>
          <p className="mt-1.5 text-center text-[13px] leading-snug text-slate">
            Chaque opération sera enregistrée à votre nom.
          </p>
          <div className="mt-6 space-y-2.5">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setError("");
                  setPin("");
                  setWho(p);
                }}
                className="flex w-full items-center justify-center gap-3 rounded-3xl border border-[var(--o-edge)] bg-[var(--o-panel)] px-4 py-4 text-center transition active:scale-[0.99]"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#5b3fd1]/12 text-[18px] font-extrabold text-[#5b3fd1]">
                  {p.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-extrabold text-charcoal">{p.name}</span>
                  <span className="block text-[12px] font-semibold text-slate">{ROLE_LABEL[p.role]}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-1 text-center text-[24px] font-extrabold leading-tight text-charcoal">
            {who.name}
          </h1>
          <p className="mt-1 text-center text-[12px] font-semibold text-slate">{ROLE_LABEL[who.role]}</p>

          {/* four dots, filling — the only progress this screen has to report */}
          <div className="mt-6 flex justify-center gap-3" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-3.5 w-3.5 rounded-full transition ${
                  i < pin.length ? "bg-[#5b3fd1]" : "bg-[var(--o-inset)]"
                }`}
              />
            ))}
          </div>
          {/* The real value, for a password manager and for the suites — the
              dots above are a picture of it and nothing can read a picture. */}
          <input
            type="password"
            name="pin"
            value={pin}
            onChange={(e) => {
              setError("");
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
            }}
            inputMode="numeric"
            maxLength={4}
            aria-label="Code à 4 chiffres"
            className="sr-only"
          />

          <p className="mt-3 h-5 text-center text-[13px] font-semibold text-[#e5484d]" role={error ? "alert" : undefined}>
            {busy ? "" : error}
          </p>

          <div className="mt-2 grid grid-cols-3 gap-2.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
              k === "" ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  disabled={busy}
                  onClick={() => key(k)}
                  className={`h-[62px] rounded-2xl text-[24px] font-bold tabular-nums transition active:scale-95 disabled:opacity-50 ${
                    k === "⌫" ? "bg-[var(--o-inset)] text-slate" : "bg-[var(--o-inset)] text-charcoal"
                  }`}
                >
                  {k}
                </button>
              ),
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setWho(null);
              setPin("");
              setError("");
              setLost(false);
              setPassword("");
            }}
            className="mt-4 w-full py-2 text-center text-[13px] font-bold text-slate"
          >
            Ce n&apos;est pas moi
          </button>

          {/*
            THE ONE-WAY DOOR, AND ITS KEY.

            Only on an owner's tile, because only an owner is locked out of
            anything by forgetting: every screen that could reset a code is
            behind this gate and only their role opens it. The key is the
            account password — the credential that already means "I am this
            business", and the one thing the person holding the counter phone
            does not have.
          */}
          {who.role === "owner" &&
            (lost ? (
              <div className="mt-2 rounded-2xl border border-[var(--o-edge)] p-3">
                <p className="text-center text-[12px] leading-snug text-slate">
                  Entrez le mot de passe du compte {shop} pour reprendre la main
                  et changer votre code.
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="password"
                    name="ownerPassword"
                    value={password}
                    onChange={(e) => {
                      setError("");
                      setPassword(e.target.value);
                    }}
                    placeholder="Mot de passe"
                    aria-label="Mot de passe du compte"
                    className="a-field text-center"
                  />
                  <button
                    type="button"
                    disabled={busy || !password}
                    onClick={() =>
                      start(async () => {
                        const res = await recoverAction(who.id, password);
                        if (res.ok) return router.refresh();
                        setPassword("");
                        setError(res.error ?? "Mot de passe incorrect.");
                      })
                    }
                    className="a-btn a-btn--dark !w-auto shrink-0 px-4 !text-[12px]"
                  >
                    Entrer
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLost(true);
                  setError("");
                }}
                className="w-full py-1 text-center text-[12px] font-bold text-slate underline underline-offset-4"
              >
                Code oublié ?
              </button>
            ))}
        </>
      )}
    </div>
  );
}
