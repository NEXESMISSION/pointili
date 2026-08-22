"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABEL, ROLE_NOTE, type StaffRole } from "@/lib/roles";
import {
  addStaffAction,
  removeStaffAction,
  setPinsEnabledAction,
  setStaffPinAction,
  setStaffRoleAction,
} from "./actions";

type Entry = {
  id: string;
  name: string;
  role: StaffRole;
  actions: number;
  lastAt: string | null;
};

const ROLES: StaffRole[] = ["owner", "manager", "cashier"];

/**
 * The team, edited in place.
 *
 * Every control here is one round trip and a refresh: the list is server data
 * and there is no version of it worth keeping in client state — a stale role on
 * this screen is a stale answer to "who can open Réglages".
 */
export function Team({
  enabled,
  team,
  me,
}: {
  enabled: boolean;
  team: Entry[];
  /** The signed-in person, so the list can say which tile is theirs. */
  me: string | null;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<StaffRole>("cashier");
  /** Which person's code is being changed, if any. */
  const [editing, setEditing] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError("");
    start(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "Échec.");
      after?.();
      router.refresh();
    });
  };

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  return (
    <div className="space-y-4">
      {/* ── the switch ─────────────────────────────────────────────────── */}
      <section className="a-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-charcoal">Demander un code</p>
            <p className="mt-0.5 text-[12px] leading-snug text-slate">
              {enabled
                ? "À l'ouverture, l'application demande qui est à la caisse."
                : "Activez-le pour savoir qui a fait quoi. Ajoutez d'abord les personnes."}
            </p>
          </div>
          {/*
            A checkbox, not a styled div. It is the one control on this screen
            that changes who can open every other screen, and a div with an
            onClick is not reachable by a keyboard or announced as a switch.
          */}
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              name="staffPins"
              checked={enabled}
              disabled={busy}
              onChange={(e) => run(() => setPinsEnabledAction(e.target.checked))}
              className="peer sr-only"
            />
            <span className="h-7 w-12 rounded-full bg-[var(--o-inset)] transition peer-checked:bg-[#2f9e6e]" />
            <span className="absolute start-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
          </label>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-2xl bg-[#e5484d]/12 px-4 py-3 text-[13px] font-semibold leading-snug text-[#e5484d]">
          {error}
        </p>
      )}

      {/* ── the people ─────────────────────────────────────────────────── */}
      <section className="a-card p-4">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
          Les personnes
        </h2>

        {team.length === 0 ? (
          <p className="mt-3 text-[13px] leading-snug text-slate">
            Personne pour l&apos;instant. Ajoutez-vous en premier, avec le rôle
            « Propriétaire » — c&apos;est le seul qui peut ouvrir les réglages et
            cette page.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--o-edge)]">
            {team.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-extrabold text-charcoal">
                      {p.name}
                      {p.id === me && <span className="ms-1.5 text-[11px] font-bold text-[#2f9e6e]">· vous</span>}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate">
                      {p.actions === 0
                        ? "aucune opération"
                        : `${p.actions} opération${p.actions > 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <select
                    aria-label={`Rôle de ${p.name}`}
                    value={p.role}
                    disabled={busy}
                    onChange={(e) => run(() => setStaffRoleAction(p.id, e.target.value))}
                    className="shrink-0 rounded-xl bg-[var(--o-inset)] px-3 py-2 text-[12px] font-bold text-charcoal outline-none"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-slate">{ROLE_NOTE[p.role]}</p>

                {editing === p.id ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      name="newStaffPin"
                      value={newPin}
                      onChange={(e) => setNewPin(digits(e.target.value))}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="••••"
                      aria-label={`Nouveau code de ${p.name}`}
                      className="a-field font-mono tracking-[0.4em]"
                    />
                    <button
                      type="button"
                      disabled={busy || newPin.length !== 4}
                      onClick={() =>
                        run(() => setStaffPinAction(p.id, newPin), () => {
                          setEditing(null);
                          setNewPin("");
                        })
                      }
                      className="a-btn a-btn--dark !w-auto shrink-0 px-4 !text-[12px]"
                    >
                      Enregistrer
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(p.id);
                        setNewPin("");
                        setError("");
                      }}
                      className="rounded-full bg-[var(--o-inset)] px-3.5 py-1.5 text-[12px] font-bold text-charcoal active:scale-95"
                    >
                      Changer le code
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => removeStaffAction(p.id))}
                      className="rounded-full px-3.5 py-1.5 text-[12px] font-bold text-[#e5484d] active:scale-95"
                    >
                      Retirer
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {open ? (
          <div className="mt-3 space-y-2 border-t border-[var(--o-edge)] pt-3">
            <input
              name="staffName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Prénom"
              maxLength={40}
              aria-label="Prénom"
              className="a-field"
            />
            <div className="flex gap-2">
              <input
                name="staffPin"
                value={pin}
                onChange={(e) => setPin(digits(e.target.value))}
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                aria-label="Code à 4 chiffres"
                className="a-field font-mono tracking-[0.4em]"
              />
              <select
                aria-label="Rôle"
                value={role}
                onChange={(e) => setRole(e.target.value as StaffRole)}
                className="shrink-0 rounded-2xl bg-[var(--o-inset)] px-3 text-[13px] font-bold text-charcoal outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11.5px] leading-snug text-slate">{ROLE_NOTE[role]}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError("");
                }}
                className="a-btn a-btn--ghost !min-h-[46px]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busy || !name.trim() || pin.length !== 4}
                onClick={() =>
                  run(() => addStaffAction(name, pin, role), () => {
                    setName("");
                    setPin("");
                    setRole("cashier");
                    setOpen(false);
                  })
                }
                className="a-btn !min-h-[46px]"
              >
                {busy ? "· · ·" : "Ajouter"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setError("");
            }}
            className="a-btn a-btn--dark mt-3 !min-h-[46px]"
          >
            Ajouter une personne
          </button>
        )}
      </section>
    </div>
  );
}
