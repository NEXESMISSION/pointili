"use client";

import { useActionState } from "react";
import type { Cafe, Game, LoyaltyProgram, Prize, Reward } from "@/lib/types";
import {
  deletePrizeAction,
  deleteRewardAction,
  saveEarnAction,
  savePlayAction,
  savePrizeAction,
  saveRewardAction,
  saveReturnAction,
  type SettingsState,
} from "./actions";

/**
 * Base input style — deliberately WITHOUT a width.
 *
 * `w-full` here fought `flex-1` / `w-[84px]` in the reward row and collapsed the
 * name field to nothing, so the rewards looked blank. Widths belong at the call
 * site.
 */
const field =
  "rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] font-semibold text-ink outline-none transition-colors focus:border-royal focus:ring-2 focus:ring-royal/15";
const save =
  "w-full rounded-xl bg-brand py-2.5 text-[11px] font-bold text-white active:scale-[0.98] disabled:opacity-50";

function Feedback({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-seal-soft px-3 py-2 text-[12px] font-semibold text-seal">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return (
      <p role="status" className="rounded-lg bg-ok/10 px-3 py-2 text-[12px] font-semibold text-ok">
        Enregistré ✦
      </p>
    );
  }
  return null;
}

/** A real switch, in the ticket voice. */
function Toggle({
  name,
  label,
  help,
  defaultChecked,
}: {
  name: string;
  label: string;
  help: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-mut">{help}</span>
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span className="mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full border border-line bg-kraft2 p-[2px] transition-colors peer-checked:border-brand peer-checked:bg-brand">
        <span className="block h-[14px] w-[14px] rounded-full bg-paper transition-transform peer-checked:translate-x-[16px]" />
      </span>
    </label>
  );
}

function Num({
  name,
  label,
  help,
  value,
  step = "1",
  suffix,
}: {
  name: string;
  label: string;
  help: string;
  value: number;
  step?: string;
  suffix?: string;
}) {
  return (
    <label className="block py-2.5">
      <span className="block text-[13.5px] font-semibold text-ink">{label}</span>
      <span className="mt-0.5 mb-1.5 block text-[11px] leading-snug text-mut">{help}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          name={name}
          defaultValue={value}
          step={step}
          inputMode="decimal"
          className={`${field} w-full font-mono`}
        />
        {suffix && <span className="shrink-0 font-mono text-[11px] text-mut">{suffix}</span>}
      </span>
    </label>
  );
}

export function EarnForm({
  cafe,
  program,
}: {
  cafe: Cafe;
  program: LoyaltyProgram;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveEarnAction, {});
  return (
    <form action={action} className="space-y-1 px-4 py-2">
      <Toggle
        name="loyaltyActive"
        label="Fidélité activée"
        help="Coupe tout le programme de points."
        defaultChecked={program.active && cafe.designSettings.loyaltyEnabled}
      />
      <Num
        name="pointsPerTnd"
        label="Points par dinar"
        help="Combien de points pour 1 TND dépensé."
        value={program.pointsPerTnd}
        step="0.1"
        suffix="pts / TND"
      />
      <Num
        name="welcomePoints"
        label="Bonus de bienvenue"
        help="Offert une seule fois, à la première visite."
        value={program.welcomePoints}
        suffix="points"
      />
      <Num
        name="redeemExpiryHours"
        label="Validité des codes"
        help="Durée avant qu'un code gagné ou échangé n'expire."
        value={program.redeemExpiryHours}
        suffix="heures"
      />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={`${save} !mt-2.5`}>
        {pending ? "· · ·" : "Enregistrer"}
      </button>
    </form>
  );
}

export function PlayForm({ game }: { game: Game | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(savePlayAction, {});
  if (!game) {
    return (
      <p className="px-4 py-4 text-[12.5px] text-mut">
        Aucun jeu configuré pour ce café.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-1 px-4 py-2">
      <Toggle
        name="wheelActive"
        label="Roue activée"
        help="Affiche l'onglet Jeux à vos clients."
        defaultChecked={game.active}
      />
      <Num
        name="cooldownHours"
        label="Fréquence de jeu"
        help="Délai avant qu'un client puisse rejouer."
        value={game.cooldownHours}
        suffix="heures"
      />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={`${save} !mt-2.5`}>
        {pending ? "· · ·" : "Enregistrer"}
      </button>
    </form>
  );
}

/**
 * One wheel segment. Label + weight (odds) + a "perdant" flag for a no-win slice.
 * The share hint turns raw weights into the number the owner actually cares
 * about — how often this lands — so they don't have to do the maths.
 */
function PrizeRow({ prize, share }: { prize: Prize | null; share: number | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(savePrizeAction, {});
  return (
    <form action={action} className="border-b border-line/60 px-4 py-3 last:border-b-0">
      {prize && <input type="hidden" name="id" value={prize.id} />}
      <div className="flex items-center gap-2">
        <input
          name="label"
          defaultValue={prize?.label ?? ""}
          placeholder="Café offert"
          maxLength={40}
          className={`${field} min-w-0 flex-1`}
        />
        <input
          name="weight"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={prize?.weight ?? ""}
          placeholder="10"
          aria-label="Poids (chance)"
          className={`${field} w-[64px] shrink-0 text-center font-mono`}
        />
        {share !== null && (
          <span className="w-[42px] shrink-0 text-right font-mono text-[11px] text-mut">
            ~{share}%
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" name="isLose" defaultChecked={prize?.isLose ?? false} className="peer sr-only" />
          <span className="h-[18px] w-[32px] rounded-full border border-line bg-kraft2 p-[2px] transition-colors peer-checked:border-seal peer-checked:bg-seal">
            <span className="block h-[11px] w-[11px] rounded-full bg-paper transition-transform peer-checked:translate-x-[14px]" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-mut">
            Perdant
          </span>
        </label>

        <span className="flex items-center gap-2">
          {prize && (
            <button
              type="submit"
              formAction={deletePrizeAction.bind(null, prize.id)}
              className="text-[10px] font-semibold uppercase tracking-[0.06em] text-seal underline underline-offset-2"
            >
              Retirer
            </button>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-3 py-1.5 text-[10px] font-bold text-white active:scale-95 disabled:opacity-50"
          >
            {pending ? "· ·" : prize ? "Enregistrer" : "Ajouter"}
          </button>
        </span>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function PrizesEditor({ game }: { game: Game | null }) {
  if (!game) return null;
  const total = game.prizes.reduce((s, p) => s + p.weight, 0) || 1;
  return (
    <>
      <p className="border-t border-line/60 px-4 py-2.5 text-[11.5px] leading-snug text-mut">
        Les lots de la roue. Le poids fixe la chance de chaque case ; « perdant »
        fait une case sans lot.
      </p>
      {game.prizes.map((p) => (
        <PrizeRow key={p.id} prize={p} share={Math.round((p.weight / total) * 100)} />
      ))}
      <div className="border-t border-line bg-kraft/40">
        <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-mut">
          Ajouter un lot
        </p>
        <PrizeRow prize={null} share={null} />
      </div>
    </>
  );
}

export function ReturnForm({ cafe }: { cafe: Cafe }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveReturnAction, {});
  return (
    <form action={action} className="space-y-1 px-4 py-2">
      <label className="block py-2.5">
        <span className="block text-[13.5px] font-semibold text-ink">Nom du café</span>
        <span className="mt-0.5 mb-1.5 block text-[11px] text-mut">
          Ce que vos clients voient en haut de leur carte.
        </span>
        <input name="name" defaultValue={cafe.name} maxLength={60} className={`${field} w-full`} />
      </label>
      <Toggle
        name="showEngagement"
        label="Séries et niveaux visibles"
        help="Masquez-les pour garder l'app ultra simple."
        defaultChecked={cafe.designSettings.showEngagement}
      />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={`${save} !mt-2.5`}>
        {pending ? "· · ·" : "Enregistrer"}
      </button>
    </form>
  );
}

/** One row per reward — the ladder is the main tuning lever for returns. */
function RewardRow({ reward }: { reward: Reward | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveRewardAction, {});
  return (
    <form
      action={action}
      className="border-b border-line/60 px-4 py-3 last:border-b-0"
    >
      {reward && <input type="hidden" name="id" value={reward.id} />}
      <div className="flex items-center gap-2">
        <input
          name="label"
          defaultValue={reward?.label ?? ""}
          placeholder="Espresso offert"
          maxLength={60}
          className={`${field} min-w-0 flex-1`}
        />
        <input
          name="pointsCost"
          type="number"
          inputMode="numeric"
          defaultValue={reward?.pointsCost ?? ""}
          placeholder="40"
          className={`${field} w-[76px] shrink-0 text-center font-mono`}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name="active"
            defaultChecked={reward?.active ?? true}
            className="peer sr-only"
          />
          <span className="h-[18px] w-[32px] rounded-full border border-line bg-kraft2 p-[2px] transition-colors peer-checked:border-brand peer-checked:bg-brand">
            <span className="block h-[11px] w-[11px] rounded-full bg-paper transition-transform peer-checked:translate-x-[14px]" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-mut">
            Visible
          </span>
        </label>

        <span className="flex items-center gap-2">
          {reward && (
            <button
              type="submit"
              formAction={deleteRewardAction.bind(null, reward.id)}
              className="text-[10px] font-semibold uppercase tracking-[0.06em] text-seal underline underline-offset-2"
            >
              Supprimer
            </button>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-3 py-1.5 text-[10px] font-bold text-white active:scale-95 disabled:opacity-50"
          >
            {pending ? "· ·" : reward ? "Enregistrer" : "Ajouter"}
          </button>
        </span>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function RewardsEditor({ rewards }: { rewards: Reward[] }) {
  return (
    <>
      {rewards.map((r) => (
        <RewardRow key={r.id} reward={r} />
      ))}
      <div className="border-t border-line bg-kraft/40">
        <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-mut">
          Ajouter une récompense
        </p>
        <RewardRow reward={null} />
      </div>
    </>
  );
}
