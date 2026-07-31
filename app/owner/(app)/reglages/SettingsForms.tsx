"use client";

import { useState, useTransition, useActionState, type ReactNode } from "react";
import { BusinessTypePicker } from "@/components/BusinessTypePicker";
import { GiftIcon } from "@/components/icons";
import { BRAND_COLOR } from "@/lib/brand";
import type { Cafe, LoyaltyProgram, Reward } from "@/lib/types";
import {
  deleteRewardAction,
  removeLogoAction,
  removeRewardImageAction,
  saveCafeAction,
  saveEarnAction,
  saveLogoAction,
  saveRewardAction,
  saveRewardImageAction,
  saveStampsAction,
  type SettingsState,
} from "./actions";

/* Shared bits ------------------------------------------------------------- */

const btn =
  "w-full rounded-2xl bg-royal py-3 text-[13.5px] font-bold text-white transition active:scale-[0.99] disabled:opacity-55";

function Feedback({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 rounded-xl bg-[#ff6b6b]/12 px-3.5 py-2.5 text-[12.5px] font-semibold text-[#ff9a9a]">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return (
      <p role="status" className="mt-2 rounded-xl bg-ok/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-[#7ff0b0]">
        Enregistré ✦
      </p>
    );
  }
  return null;
}

/** A real switch. */
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
    <label className="flex cursor-pointer items-start justify-between gap-3 py-1">
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-white">{label}</span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-white/55">{help}</span>
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="mt-0.5 h-[24px] w-[42px] shrink-0 rounded-full border border-white/12 bg-white/[0.08] p-[3px] transition-colors peer-checked:border-royal peer-checked:bg-royal">
        <span className="block h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-[18px]" />
      </span>
    </label>
  );
}

/** A concrete example under a setting — the fastest way to make it click. */
function Example({ children }: { children: ReactNode }) {
  return (
    <p className="a-inset mt-1.5 px-3.5 py-2.5 text-[12px] leading-snug text-white/55">
      <span className="font-bold text-white">Exemple :</span> {children}
    </p>
  );
}

/** Advanced settings, hidden by default — a first-timer should see 2-3 knobs. */
function Advanced({ children }: { children: ReactNode }) {
  return (
    <details className="group mt-2 border-t border-white/10 pt-1">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-2.5 text-[12.5px] font-bold text-white/55 [&::-webkit-details-marker]:hidden">
        <span className="text-[14px] transition-transform group-open:rotate-90">›</span>
        Réglages avancés
      </summary>
      <div className="pb-1">{children}</div>
    </details>
  );
}

function Num({
  name,
  label,
  help,
  value,
  step = "1",
  suffix,
  onValue,
}: {
  name: string;
  label: string;
  help: string;
  value: number;
  step?: string;
  suffix?: string;
  /** Set to mirror the field's value out — for settings whose example moves live. */
  onValue?: (n: number) => void;
}) {
  return (
    <label className="block py-2.5">
      <span className="block text-[13.5px] font-semibold text-white">{label}</span>
      <span className="mt-0.5 mb-2 block text-[11.5px] leading-snug text-white/55">{help}</span>
      <span className="flex items-center gap-2.5">
        <input
          type="number"
          name={name}
          defaultValue={value}
          step={step}
          inputMode="decimal"
          onChange={onValue ? (e) => onValue(Number(e.target.value) || 0) : undefined}
          className="a-field font-mono"
        />
        {suffix && <span className="shrink-0 text-[12px] font-semibold text-white/55">{suffix}</span>}
      </span>
    </label>
  );
}

/* Les points -------------------------------------------------------------- */

/** A typical Tunisian café ticket — the yardstick the examples are drawn in. */
const TICKET = 2.5;

export function EarnForm({
  cafe,
  program,
  rewards,
}: {
  cafe: Cafe;
  program: LoyaltyProgram;
  /** Cheapest-first, so the example can name the reward that is actually next. */
  rewards: Reward[];
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveEarnAction, {});
  /*
    Controlled, because the point of the example is to move while you type.
    Reading program.pointsPerTnd meant the owner set 1, read "un café rapporte
    2 points" computed from the OLD value, saved, and only then found out.
  */
  const [rate, setRate] = useState(program.pointsPerTnd);
  const [welcome, setWelcome] = useState(program.welcomePoints);
  const cheapest = rewards.filter((r) => r.active).sort((a, b) => a.pointsCost - b.pointsCost)[0];
  const perTicket = Math.floor(TICKET * rate);
  const visitsToReward = cheapest && perTicket > 0
    ? Math.max(1, Math.ceil((cheapest.pointsCost - welcome) / perTicket))
    : null;

  return (
    <form action={action} className="px-4 py-3">
      <Num
        name="pointsPerTnd"
        label="Points par dinar dépensé"
        help="Le cœur de votre programme."
        value={rate}
        step="0.1"
        suffix="points / dinar"
        onValue={setRate}
      />
      <Example>
        un café à {TICKET.toString().replace(".", ",")} dinars rapporte{" "}
        <b className="text-white">{perTicket} points</b>.
        {/*
          THE line this screen was missing. The rate lives here and the reward
          prices live one editor away, so the two numbers never met: this shop
          shipped at 1 pt/DT with a 200-point espresso — 200 dinars of café —
          and nothing on either screen said so.
        */}
        {cheapest && (
          <>
            {" "}
            <b className="text-white">{cheapest.label}</b> coûte {cheapest.pointsCost} points, soit{" "}
            <b className="text-white">
              {Math.round(cheapest.pointsCost / (rate || 1))} dinars de dépense
            </b>
            {visitsToReward && (
              <>
                {" "}
                — environ <b className="text-white">{visitsToReward} visites</b> après le cadeau de
                bienvenue
              </>
            )}
            .
          </>
        )}
      </Example>
      <Num
        name="welcomePoints"
        label="Cadeau de bienvenue"
        help="Offert une seule fois, dès la première carte — pour donner envie de revenir."
        value={program.welcomePoints}
        suffix="points"
        onValue={setWelcome}
      />

      <Advanced>
        <Num
          name="redeemExpiryHours"
          label="Validité d'un code"
          help="Combien de temps un code échangé reste utilisable au comptoir."
          value={program.redeemExpiryHours}
          suffix="heures"
        />
        <Toggle
          name="loyaltyActive"
          label="Programme de points activé"
          help="Décochez pour tout mettre en pause."
          defaultChecked={program.active && cafe.designSettings.loyaltyEnabled}
        />
      </Advanced>

      <Feedback state={state} />
      <button type="submit" disabled={pending} className={`${btn} mt-3`}>
        {pending ? "· · ·" : "Enregistrer"}
      </button>
    </form>
  );
}

/* La carte à tampons ------------------------------------------------------ */

export function StampsForm({ program }: { program: LoyaltyProgram }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveStampsAction, {});
  const [on, setOn] = useState(program.stampsEnabled);
  return (
    <form action={action} className="px-4 py-3">
      <label className="flex cursor-pointer items-start justify-between gap-3 py-1">
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold text-white">Carte à tampons activée</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-white/55">
            Un tampon par visite ; carte pleine = récompense. Fonctionne en plus des points.
          </span>
        </span>
        <input
          type="checkbox"
          name="stampsEnabled"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="peer sr-only"
        />
        <span className="mt-0.5 h-[24px] w-[42px] shrink-0 rounded-full border border-white/12 bg-white/[0.08] p-[3px] transition-colors peer-checked:border-royal peer-checked:bg-royal">
          <span className="block h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-[18px]" />
        </span>
      </label>

      {/* fields stay mounted (so they submit) but dim + disable when off */}
      <div className={on ? "" : "pointer-events-none opacity-45"}>
        <Num
          name="stampsRequired"
          label="Tampons pour une carte pleine"
          help="Le nombre de visites avant la récompense."
          value={program.stampsRequired}
          suffix="tampons"
        />
        <label className="block py-2.5">
          <span className="block text-[13.5px] font-semibold text-white">Récompense de la carte</span>
          <span className="mt-0.5 mb-2 block text-[11.5px] text-white/55">
            Ce que le client gagne en remplissant sa carte.
          </span>
          <input
            name="stampReward"
            defaultValue={program.stampReward}
            maxLength={80}
            placeholder="-20% sur la prochaine commande"
            className="a-field"
          />
        </label>
        <Num
          name="stampExpiryDays"
          label="Validité de la carte"
          help="Jours avant qu'une carte en cours ne s'efface. 0 = jamais."
          value={program.stampExpiryDays}
          suffix="jours"
        />
      </div>

      <Feedback state={state} />
      <button type="submit" disabled={pending} className={`${btn} mt-3`}>
        {pending ? "· · ·" : "Enregistrer"}
      </button>
    </form>
  );
}

/* Mon café — logo, name, colour ------------------------------------------- */

/**
 * Downscale a chosen image to a small square-ish logo on a canvas, then hand
 * back a compact data-URI. Doing the shrinking in the browser keeps the upload
 * tiny (~10-30 KB) and means we never ship a multi-MB photo to the server.
 */
async function fileToLogoDataUri(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const MAX = 256;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  // Prefer WebP for size; browsers without WebP encode fall back to PNG.
  let uri = canvas.toDataURL("image/webp", 0.85);
  if (!uri.startsWith("data:image/webp")) uri = canvas.toDataURL("image/png");
  return uri;
}

function LogoUploader({ cafe }: { cafe: Cafe }) {
  const [logo, setLogo] = useState<string | null>(cafe.logoUrl);
  const [msg, setMsg] = useState<SettingsState>({});
  const [pending, start] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after a remove
    if (!file) return;
    setMsg({});

    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      setMsg({ error: "Choisissez une image PNG, JPG ou WebP." });
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setMsg({ error: "Image trop lourde (12 Mo max)." });
      return;
    }

    let dataUri: string;
    try {
      dataUri = await fileToLogoDataUri(file);
    } catch {
      setMsg({ error: "Impossible de lire cette image." });
      return;
    }

    start(async () => {
      const res = await saveLogoAction(dataUri);
      setMsg(res);
      if (!res.error) setLogo(dataUri);
    });
  }

  function onRemove() {
    setMsg({});
    start(async () => {
      const res = await removeLogoAction();
      setMsg(res);
      if (!res.error) setLogo(null);
    });
  }

  return (
    <div className="py-2.5">
      <span className="block text-[13.5px] font-semibold text-white">Logo de la boutique</span>
      <span className="mt-0.5 mb-2.5 block text-[11.5px] leading-snug text-white/55">
        Il s&apos;affiche en haut de la carte de vos clients.
      </span>

      <div className="flex items-center gap-3.5">
        {/* preview */}
        <span
          className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/12"
          style={{ background: logo ? "#fff" : BRAND_COLOR }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URI preview
            <img src={logo} alt="Logo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[24px] font-extrabold text-white">
              {cafe.name.charAt(0).toUpperCase()}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <label
            className={`flex cursor-pointer items-center justify-center rounded-xl border border-white/14 bg-white/[0.08] py-2.5 text-[12.5px] font-bold text-white transition active:scale-[0.99] ${
              pending ? "opacity-55" : ""
            }`}
          >
            {pending ? "· · ·" : logo ? "Changer le logo" : "Ajouter un logo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onPick}
              disabled={pending}
              className="sr-only"
            />
          </label>
          {logo && (
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              className="mt-1.5 w-full text-[11px] font-bold uppercase tracking-[0.05em] text-[#ff9a9a] underline underline-offset-2 disabled:opacity-55"
            >
              Retirer
            </button>
          )}
        </div>
      </div>
      <Feedback state={msg} />
    </div>
  );
}

export function CafeForm({ cafe }: { cafe: Cafe }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveCafeAction, {});
  return (
    <div className="px-4 py-3">
      {/* logo saves on its own (instant), so it lives outside the name/colour form */}
      <LogoUploader cafe={cafe} />

      <form action={action} className="border-t border-white/10 pt-1">
        <label className="block py-2.5">
          <span className="block text-[13.5px] font-semibold text-white">Nom de la boutique</span>
          <span className="mt-0.5 mb-2 block text-[11.5px] text-white/55">
            Ce que vos clients voient en haut de leur carte.
          </span>
          <input name="name" defaultValue={cafe.name} maxLength={60} className="a-field" />
        </label>

        <div className="py-2.5">
          <span className="block text-[13.5px] font-semibold text-white">Type de commerce</span>
          <span className="mt-0.5 mb-2.5 block text-[11.5px] text-white/55">
            Vos clients le voient pour reconnaître votre carte.
          </span>
          <BusinessTypePicker defaultValue={cafe.businessType} collapsible />
        </div>

        <Advanced>
          <Toggle
            name="showEngagement"
            label="Séries et niveaux visibles"
            help="Masquez-les pour garder l'app ultra simple."
            defaultChecked={cafe.designSettings.showEngagement}
          />
        </Advanced>

        <Feedback state={state} />
        <button type="submit" disabled={pending} className={`${btn} mt-3`}>
          {pending ? "· · ·" : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}

/* Les récompenses --------------------------------------------------------- */

/** A photo for one reward — instant-save, hard-downscaled like the logo. */
function RewardImageUploader({ reward }: { reward: Reward }) {
  const [img, setImg] = useState<string | null>(reward.imageUrl);
  const [msg, setMsg] = useState<SettingsState>({});
  const [pending, start] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg({});
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      setMsg({ error: "Choisissez une image PNG, JPG ou WebP." });
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setMsg({ error: "Image trop lourde (12 Mo max)." });
      return;
    }
    let dataUri: string;
    try {
      dataUri = await fileToLogoDataUri(file);
    } catch {
      setMsg({ error: "Impossible de lire cette image." });
      return;
    }
    start(async () => {
      const res = await saveRewardImageAction(reward.id, dataUri);
      setMsg(res);
      if (!res.error) setImg(dataUri);
    });
  }

  function onRemove() {
    setMsg({});
    start(async () => {
      const res = await removeRewardImageAction(reward.id);
      setMsg(res);
      if (!res.error) setImg(null);
    });
  }

  return (
    <div className="mb-2.5">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/12 bg-white/[0.08]">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URI preview
            <img src={img} alt="" className="h-full w-full object-cover" />
          ) : (
            <GiftIcon className="h-5 w-5 text-white/55" />
          )}
        </span>
        <label
          className={`flex cursor-pointer items-center rounded-xl border border-white/14 bg-white/[0.08] px-3 py-2 text-[12px] font-bold text-white active:scale-[0.99] ${
            pending ? "opacity-55" : ""
          }`}
        >
          {pending ? "· ·" : img ? "Changer la photo" : "Ajouter une photo"}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPick} disabled={pending} className="sr-only" />
        </label>
        {img && (
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#ff9a9a] underline underline-offset-2 disabled:opacity-55"
          >
            Retirer
          </button>
        )}
      </div>
      <Feedback state={msg} />
    </div>
  );
}

/** One row per reward — the ladder is the main tuning lever for returns. */
function RewardRow({ reward, rate }: { reward: Reward | null; rate: number }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveRewardAction, {});
  const [confirming, setConfirming] = useState(false);
  /*
    A points cost is an abstraction; dinars are not. Typed here in isolation,
    "200" looks like a normal number — it is 200 dinars of café at 1 pt/DT, and
    this editor never said so. Now it does, while you type.
  */
  const [cost, setCost] = useState(reward?.pointsCost ?? 0);
  const dinars = rate > 0 ? Math.round(cost / rate) : 0;
  return (
    <div className="border-b border-white/10 px-4 py-3.5 last:border-b-0">
      {reward && <RewardImageUploader reward={reward} />}
      <form action={action}>
      {reward && <input type="hidden" name="id" value={reward.id} />}
      <div className="flex items-center gap-2.5">
        <input
          name="label"
          defaultValue={reward?.label ?? ""}
          placeholder="Espresso offert"
          maxLength={60}
          className="a-field min-w-0 flex-1"
        />
        <input
          name="pointsCost"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={reward?.pointsCost ?? ""}
          onChange={(e) => setCost(Number(e.target.value) || 0)}
          placeholder="250"
          aria-label="Coût en points"
          /* !w-[84px]: .a-field is non-layered CSS (width:100%) and would beat a
             plain w-[84px] utility, stretching the cost box and collapsing the
             label. The important flag wins it back. */
          className="a-field !w-[84px] shrink-0 text-center font-mono"
        />
      </div>
      {cost > 0 && (
        <p className="mt-1.5 text-right text-[11px] font-semibold text-white/45">
          soit <b className="text-white/70">{dinars} dinars</b> de dépense
          {rate > 0 && Math.floor(TICKET * rate) > 0 && (
            <> · ~{Math.ceil(cost / Math.floor(TICKET * rate))} visites</>
          )}
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={reward?.active ?? true} className="peer sr-only" />
          <span className="h-[20px] w-[34px] rounded-full border border-white/12 bg-white/[0.08] p-[2px] transition-colors peer-checked:border-royal peer-checked:bg-royal">
            <span className="block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-[14px]" />
          </span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-white/55">Visible</span>
        </label>

        <span className="flex items-center gap-3">
          {/*
            Two-step, because this is irreversible and it sits inches from
            "Enregistrer". One mis-aimed tap used to delete a reward with no
            confirmation and no acknowledgement that anything had happened.
            Deliberately in-page rather than confirm(): a native dialog is
            blocked in some in-app browsers, which silently made it a one-tap
            delete again.
          */}
          {reward && (
            confirming ? (
              <span className="flex items-center gap-2">
                <button
                  type="submit"
                  formAction={deleteRewardAction.bind(null, reward.id)}
                  className="rounded-lg bg-[#ff6b6b] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-white"
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-white/45"
                >
                  Annuler
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#ff9a9a] underline underline-offset-2"
              >
                Supprimer
              </button>
            )
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-royal px-4 py-2 text-[11.5px] font-bold text-white active:scale-95 disabled:opacity-55"
          >
            {pending ? "· ·" : reward ? "Enregistrer" : "Ajouter"}
          </button>
        </span>
      </div>
      <Feedback state={state} />
      </form>
    </div>
  );
}

export function RewardsEditor({ rewards, rate }: { rewards: Reward[]; rate: number }) {
  return (
    <>
      {rewards.map((r) => (
        <RewardRow key={r.id} reward={r} rate={rate} />
      ))}
      <div className="border-t border-white/12 bg-white/[0.06]">
        <p className="px-4 pt-3 text-[10.5px] font-bold uppercase tracking-[0.05em] text-white/55">
          Ajouter une récompense
        </p>
        <RewardRow reward={null} rate={rate} />
      </div>
    </>
  );
}
