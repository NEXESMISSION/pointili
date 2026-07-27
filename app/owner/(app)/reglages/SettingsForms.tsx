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
      <p role="alert" className="mt-2 rounded-xl bg-seal-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-seal">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return (
      <p role="status" className="mt-2 rounded-xl bg-ok/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-ok">
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
        <span className="block text-[13.5px] font-semibold text-charcoal">{label}</span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-slate">{help}</span>
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="mt-0.5 h-[24px] w-[42px] shrink-0 rounded-full border border-hair bg-lilac-2 p-[3px] transition-colors peer-checked:border-royal peer-checked:bg-royal">
        <span className="block h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-[18px]" />
      </span>
    </label>
  );
}

/** A concrete example under a setting — the fastest way to make it click. */
function Example({ children }: { children: ReactNode }) {
  return (
    <p className="o-inset mt-1.5 px-3.5 py-2.5 text-[12px] leading-snug text-slate">
      <span className="font-bold text-charcoal">Exemple :</span> {children}
    </p>
  );
}

/** Advanced settings, hidden by default — a first-timer should see 2-3 knobs. */
function Advanced({ children }: { children: ReactNode }) {
  return (
    <details className="group mt-2 border-t border-hair/70 pt-1">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-2.5 text-[12.5px] font-bold text-slate [&::-webkit-details-marker]:hidden">
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
      <span className="block text-[13.5px] font-semibold text-charcoal">{label}</span>
      <span className="mt-0.5 mb-2 block text-[11.5px] leading-snug text-slate">{help}</span>
      <span className="flex items-center gap-2.5">
        <input
          type="number"
          name={name}
          defaultValue={value}
          step={step}
          inputMode="decimal"
          className="o-field font-mono"
        />
        {suffix && <span className="shrink-0 text-[12px] font-semibold text-slate">{suffix}</span>}
      </span>
    </label>
  );
}

/* Les points -------------------------------------------------------------- */

export function EarnForm({ cafe, program }: { cafe: Cafe; program: LoyaltyProgram }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveEarnAction, {});
  const rate = program.pointsPerTnd;
  return (
    <form action={action} className="px-4 py-3">
      <Num
        name="pointsPerTnd"
        label="Points par dinar dépensé"
        help="Le cœur de votre programme."
        value={rate}
        step="0.1"
        suffix="points / dinar"
      />
      <Example>
        un café à 4 dinars rapporte <b className="text-charcoal">{Math.round(4 * rate)} points</b> au client.
      </Example>
      <Num
        name="welcomePoints"
        label="Cadeau de bienvenue"
        help="Offert une seule fois, dès la première carte — pour donner envie de revenir."
        value={program.welcomePoints}
        suffix="points"
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
          <span className="block text-[13.5px] font-semibold text-charcoal">Carte à tampons activée</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-slate">
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
        <span className="mt-0.5 h-[24px] w-[42px] shrink-0 rounded-full border border-hair bg-lilac-2 p-[3px] transition-colors peer-checked:border-royal peer-checked:bg-royal">
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
          <span className="block text-[13.5px] font-semibold text-charcoal">Récompense de la carte</span>
          <span className="mt-0.5 mb-2 block text-[11.5px] text-slate">
            Ce que le client gagne en remplissant sa carte.
          </span>
          <input
            name="stampReward"
            defaultValue={program.stampReward}
            maxLength={80}
            placeholder="-20% sur la prochaine commande"
            className="o-field"
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
      <span className="block text-[13.5px] font-semibold text-charcoal">Logo de la boutique</span>
      <span className="mt-0.5 mb-2.5 block text-[11.5px] leading-snug text-slate">
        Il s&apos;affiche en haut de la carte de vos clients.
      </span>

      <div className="flex items-center gap-3.5">
        {/* preview */}
        <span
          className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-hair"
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
            className={`flex cursor-pointer items-center justify-center rounded-xl border border-hair bg-white py-2.5 text-[12.5px] font-bold text-charcoal transition active:scale-[0.99] ${
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
              className="mt-1.5 w-full text-[11px] font-bold uppercase tracking-[0.05em] text-seal underline underline-offset-2 disabled:opacity-55"
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

      <form action={action} className="border-t border-hair/70 pt-1">
        <label className="block py-2.5">
          <span className="block text-[13.5px] font-semibold text-charcoal">Nom de la boutique</span>
          <span className="mt-0.5 mb-2 block text-[11.5px] text-slate">
            Ce que vos clients voient en haut de leur carte.
          </span>
          <input name="name" defaultValue={cafe.name} maxLength={60} className="o-field" />
        </label>

        <div className="py-2.5">
          <span className="block text-[13.5px] font-semibold text-charcoal">Type de commerce</span>
          <span className="mt-0.5 mb-2.5 block text-[11.5px] text-slate">
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
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-hair bg-lilac-2">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URI preview
            <img src={img} alt="" className="h-full w-full object-cover" />
          ) : (
            <GiftIcon className="h-5 w-5 text-slate" />
          )}
        </span>
        <label
          className={`flex cursor-pointer items-center rounded-xl border border-hair bg-white px-3 py-2 text-[12px] font-bold text-charcoal active:scale-[0.99] ${
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
            className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-seal underline underline-offset-2 disabled:opacity-55"
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
function RewardRow({ reward }: { reward: Reward | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveRewardAction, {});
  return (
    <div className="border-b border-hair/60 px-4 py-3.5 last:border-b-0">
      {reward && <RewardImageUploader reward={reward} />}
      <form action={action}>
      {reward && <input type="hidden" name="id" value={reward.id} />}
      <div className="flex items-center gap-2.5">
        <input
          name="label"
          defaultValue={reward?.label ?? ""}
          placeholder="Espresso offert"
          maxLength={60}
          className="o-field min-w-0 flex-1"
        />
        <input
          name="pointsCost"
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={reward?.pointsCost ?? ""}
          placeholder="40"
          aria-label="Coût en points"
          /* !w-[84px]: .o-field is non-layered CSS (width:100%) and would beat a
             plain w-[84px] utility, stretching the cost box and collapsing the
             label. The important flag wins it back. */
          className="o-field !w-[84px] shrink-0 text-center font-mono"
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={reward?.active ?? true} className="peer sr-only" />
          <span className="h-[20px] w-[34px] rounded-full border border-hair bg-lilac-2 p-[2px] transition-colors peer-checked:border-royal peer-checked:bg-royal">
            <span className="block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-[14px]" />
          </span>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-slate">Visible</span>
        </label>

        <span className="flex items-center gap-3">
          {reward && (
            <button
              type="submit"
              formAction={deleteRewardAction.bind(null, reward.id)}
              className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-seal underline underline-offset-2"
            >
              Supprimer
            </button>
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

export function RewardsEditor({ rewards }: { rewards: Reward[] }) {
  return (
    <>
      {rewards.map((r) => (
        <RewardRow key={r.id} reward={r} />
      ))}
      <div className="border-t border-hair bg-lilac-2/50">
        <p className="px-4 pt-3 text-[10.5px] font-bold uppercase tracking-[0.05em] text-slate">
          Ajouter une récompense
        </p>
        <RewardRow reward={null} />
      </div>
    </>
  );
}
