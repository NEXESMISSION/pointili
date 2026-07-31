"use client";

import { useState, useTransition, useActionState, type ReactNode } from "react";
import { BusinessTypePicker } from "@/components/BusinessTypePicker";
import { GiftIcon } from "@/components/icons";
import { fmtPoints } from "@/lib/points";
import { BRAND_COLOR } from "@/lib/brand";
import type { Cafe, LoyaltyProgram, Reward } from "@/lib/types";
import {
  deleteRewardAction,
  reorderRewardsAction,
  toggleRewardActiveAction,
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

/* Les récompenses — the catalogue, not a stack of forms ------------------- */

/*
  This screen used to be four editable rows: two bare inputs side by side, a
  toggle, a delete link and a save button, repeated four times. Everything was
  equally loud, nothing was readable at a glance, and the one number that
  decides whether the programme works — the points cost — was an unlabelled box
  the same size as the name field.

  So the list STATES the catalogue and the editing is one tap in: the photo the
  customer sees, the name, whether it is on the menu today, and the cost with
  its own label, its own weight, and its price in dinars underneath. Modifier
  opens the editor for that reward alone; the rest of the list stays put.
*/

const PencilIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const TrashIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

const GripIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 12 20" fill="currentColor" className={className} aria-hidden>
    {[3, 9].map((x) =>
      [3, 8, 13, 18].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.15" />),
    )}
  </svg>
);

/** The reward as the owner reads it: photo, name, on the menu or not, cost. */
function RewardCard({
  reward,
  rate,
  dragging,
  editing,
  onEdit,
  onGrab,
}: {
  reward: Reward;
  rate: number;
  dragging: boolean;
  editing: boolean;
  onEdit: () => void;
  onGrab: (e: React.PointerEvent) => void;
}) {
  const [active, setActive] = useState(reward.active);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const dinars = rate > 0 ? Math.round(reward.pointsCost / rate) : 0;

  return (
    <div
      data-rid={reward.id}
      className={`a-card flex items-center gap-3 px-3 py-3 transition ${
        dragging ? "scale-[1.01] opacity-90 ring-1 ring-royal" : ""
      } ${active ? "" : "opacity-60"}`}
    >
      {/*
        The handle, and ONLY the handle, starts a drag. The card carries a
        toggle and two buttons; making the whole thing draggable would mean
        every tap on Modifier begins by looking like a drag.
        Hidden on a phone: a one-column list of four is not worth reordering by
        finger, and touch-drag inside a scrolling sheet fights the scroll.
      */}
      <button
        type="button"
        onPointerDown={onGrab}
        aria-label={`Déplacer ${reward.label}`}
        className="hidden shrink-0 cursor-grab touch-none px-1 py-2 text-white/25 transition hover:text-white/50 active:cursor-grabbing sm:block"
      >
        <GripIcon className="h-5 w-3" />
      </button>

      <span className="grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/[0.07]">
        {reward.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not a build asset
          <img src={reward.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <GiftIcon className="h-6 w-6 text-white/35" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-extrabold text-white">{reward.label}</span>
        {/*
          Saves on the spot. Hiding a reward used to mean opening the editor,
          unticking a box and pressing save — three steps for the thing an owner
          does most, when the pâtisserie runs out at eleven and has to come off
          the list until tomorrow.
        */}
        <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              setActive(next);
              start(() => toggleRewardActiveAction(reward.id, next));
            }}
            className="peer sr-only"
          />
          <span className="h-[19px] w-[33px] rounded-full border border-white/12 bg-white/[0.08] p-[2px] transition-colors peer-checked:border-royal peer-checked:bg-royal">
            <span className="block h-[13px] w-[13px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-[14px]" />
          </span>
          <span className="text-[11px] font-bold text-white/50">
            {active ? "Visible" : "Masquée"}
          </span>
        </label>
      </span>

      {/* the number that decides whether the programme works — with its price
          in dinars right under it, because the two used to live on separate
          screens and never met */}
      <span className="hidden shrink-0 border-l border-white/[0.08] px-4 text-center sm:block">
        <span className="block text-[10px] font-bold uppercase tracking-[0.06em] text-white/40">
          Points requis
        </span>
        <span className="block text-[22px] font-extrabold leading-tight text-[#b9a3ff]">
          {fmtPoints(reward.pointsCost)}
        </span>
        <span className="block text-[10.5px] text-white/35">≈ {dinars} DT</span>
      </span>

      <span className="flex shrink-0 flex-col items-stretch gap-1.5 sm:border-l sm:border-white/[0.08] sm:pl-4">
        {/* the cost has to survive the narrow layout, where the column above is
            dropped for width */}
        <span className="text-right sm:hidden">
          <span className="text-[14px] font-extrabold text-[#b9a3ff]">
            {fmtPoints(reward.pointsCost)} pts
          </span>
          <span className="block text-[10.5px] text-white/35">≈ {dinars} DT</span>
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.08] px-3.5 py-2 text-[12.5px] font-bold text-white transition active:scale-95"
        >
          <PencilIcon className="h-3.5 w-3.5" /> {editing ? "Fermer" : "Modifier"}
        </button>
        {/*
          Two-step, because it is irreversible and it sits inches from Modifier.
          Deliberately in-page rather than confirm(): a native dialog is blocked
          in some in-app browsers, which silently made it one tap again.
        */}
        {confirming ? (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => start(() => deleteRewardAction(reward.id))}
              className="flex-1 rounded-xl bg-[#ff6b6b] px-2 py-1.5 text-[11px] font-bold text-white"
            >
              Confirmer
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[11px] font-bold text-white/45"
            >
              Non
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-1 text-[12px] font-bold text-[#ff9a9a] transition active:scale-95"
          >
            <TrashIcon className="h-3.5 w-3.5" /> Supprimer
          </button>
        )}
      </span>
    </div>
  );
}

/** The editor for ONE reward — opened by Modifier, or by Ajouter. */
function RewardEditor({
  reward,
  rate,
  onDone,
}: {
  reward: Reward | null;
  rate: number;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveRewardAction, {});
  const [cost, setCost] = useState(reward?.pointsCost ?? 0);
  const dinars = rate > 0 ? Math.round(cost / rate) : 0;
  const perTicket = Math.floor(TICKET * rate);
  const visits = perTicket > 0 ? Math.ceil(cost / perTicket) : null;

  return (
    <div className="a-card border border-royal/40 px-4 py-3.5">
      {reward && <RewardImageUploader reward={reward} />}
      <form action={action}>
        {reward && <input type="hidden" name="id" value={reward.id} />}
        <label className="block py-2">
          <span className="mb-1.5 block text-[12px] font-bold text-white/70">Nom</span>
          <input
            name="label"
            defaultValue={reward?.label ?? ""}
            placeholder="Espresso offert"
            maxLength={60}
            className="a-field"
          />
        </label>
        <label className="block py-2">
          <span className="mb-1.5 block text-[12px] font-bold text-white/70">Points requis</span>
          <input
            name="pointsCost"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={reward?.pointsCost ?? ""}
            onChange={(e) => setCost(Number(e.target.value) || 0)}
            placeholder="25"
            className="a-field font-mono"
          />
        </label>
        {cost > 0 && (
          <p className="a-inset px-3.5 py-2 text-[11.5px] leading-snug text-white/55">
            soit <b className="text-white">{dinars} dinars</b> de dépense
            {visits ? (
              <>
                {" "}
                · environ <b className="text-white">{visits} visites</b>
              </>
            ) : null}
          </p>
        )}
        {/*
          Visibility is set on the CARD, not in here, so the editor must not
          post a stale value: an unchecked box would submit nothing and quietly
          hide a reward every time its name was corrected.
        */}
        <input type="hidden" name="active" value="on" />
        <Feedback state={state} />
        <div className="mt-3 flex items-center gap-2">
          <button type="submit" disabled={pending} className={btn}>
            {pending ? "· · ·" : reward ? "Enregistrer" : "Ajouter"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="shrink-0 rounded-2xl px-4 py-3 text-[13px] font-bold text-white/55"
          >
            Fermer
          </button>
        </div>
      </form>
    </div>
  );
}

export function RewardsEditor({ rewards, rate }: { rewards: Reward[]; rate: number }) {
  const [order, setOrder] = useState(rewards);
  const [editing, setEditing] = useState<string | null>(null);
  // a shop with no rewards has nothing for anyone to aim at — open the form
  const [adding, setAdding] = useState(rewards.length === 0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, start] = useTransition();

  /*
    Pointer events, not HTML5 drag-and-drop.

    dragstart/drop do not fire for touch at all, and this is a phone-first
    product — an owner reordering their menu is doing it behind the counter on
    the same handset they take orders with. Pointer capture gives one code path
    for finger, mouse and stylus.
  */
  function onGrab(e: React.PointerEvent, id: string) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
  }

  function onMove(e: React.PointerEvent) {
    if (!dragId) return;
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-rid]"));
    const over = cards.find((c) => {
      const r = c.getBoundingClientRect();
      return e.clientY >= r.top && e.clientY <= r.bottom;
    });
    const overId = over?.dataset.rid;
    if (!overId || overId === dragId) return;
    setOrder((cur) => {
      const from = cur.findIndex((r) => r.id === dragId);
      const to = cur.findIndex((r) => r.id === overId);
      if (from < 0 || to < 0) return cur;
      const next = [...cur];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  }

  function onDrop() {
    if (!dragId) return;
    setDragId(null);
    // persist the order already on screen, so nothing jumps back under the cursor
    start(() => reorderRewardsAction(order.map((r) => r.id)));
  }

  return (
    <div className="px-4 py-3" onPointerMove={onMove} onPointerUp={onDrop} onPointerCancel={onDrop}>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setEditing(null);
          }}
          className="flex items-center gap-1.5 rounded-2xl bg-royal px-4 py-2.5 text-[13px] font-bold text-white transition active:scale-95"
        >
          <span className="text-[17px] leading-none">+</span> Ajouter une récompense
        </button>
      </div>

      {adding && (
        <div className="mb-3">
          <RewardEditor reward={null} rate={rate} onDone={() => setAdding(false)} />
        </div>
      )}

      <div className="space-y-2.5">
        {order.map((r) => (
          <div key={r.id}>
            <RewardCard
              reward={r}
              rate={rate}
              dragging={dragId === r.id}
              editing={editing === r.id}
              onEdit={() => setEditing(editing === r.id ? null : r.id)}
              onGrab={(e) => onGrab(e, r.id)}
            />
            {editing === r.id && (
              <div className="mt-2">
                <RewardEditor reward={r} rate={rate} onDone={() => setEditing(null)} />
              </div>
            )}
          </div>
        ))}
      </div>

      {order.length === 0 && !adding && (
        <p className="a-inset px-4 py-6 text-center text-[13px] leading-snug text-white/50">
          Aucune récompense pour l&apos;instant — vos clients n&apos;ont rien à viser.
        </p>
      )}

      {order.length > 1 && (
        <p className="mt-4 hidden items-center justify-center gap-1.5 text-[11.5px] text-white/35 sm:flex">
          <GripIcon className="h-3.5 w-2.5" /> Glissez pour réorganiser vos récompenses
        </p>
      )}
    </div>
  );
}
