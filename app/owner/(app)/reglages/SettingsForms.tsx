"use client";

import { useState, useTransition, useActionState, type ReactNode } from "react";
import { BusinessTypePicker } from "@/components/BusinessTypePicker";
import { GiftIcon } from "@/components/icons";
import { fmtPoints } from "@/lib/points";
import {
  EASY_FIRST_VISITS,
  VISIT_PRESETS,
  pointsForVisits,
  rewardIdeas,
  visitsForPoints,
  type Ticket,
} from "@/lib/rewards";
import { BRAND_COLOR } from "@/lib/brand";
import { businessType } from "@/lib/businessTypes";
import { BRAND_SWATCHES, inkOn, textOnWhite } from "@/lib/theme";
import type { Cafe, Game, LoyaltyProgram, Reward } from "@/lib/types";
import {
  deleteRewardAction,
  reorderRewardsAction,
  toggleRewardActiveAction,
  removeLogoAction,
  saveWheelAction,
  savePrizeAction,
  deletePrizeAction,
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
  "w-full rounded-2xl bg-royal py-3 text-[13px] font-bold text-white transition active:scale-[0.99] disabled:opacity-55";

function Feedback({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p role="alert" className="mt-2 rounded-xl bg-[#e5484d]/12 px-3.5 py-2.5 text-[12px] font-semibold text-[#e5484d]">
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return (
      <p role="status" className="mt-2 rounded-xl bg-ok/10 px-3.5 py-2.5 text-[12px] font-semibold text-[#2f9e6e]">
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
  onChecked,
}: {
  name: string;
  label: string;
  help: string;
  defaultChecked: boolean;
  /** Mirror the switch out, for forms that dim the fields it governs. */
  onChecked?: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-1">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-charcoal">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-slate">{help}</span>
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        onChange={onChecked ? (e) => onChecked(e.target.checked) : undefined}
        className="peer sr-only"
      />
      <span className="mt-0.5 h-[24px] w-[42px] shrink-0 rounded-full border border-[var(--o-edge)] bg-[var(--o-inset)] p-[3px] transition-colors peer-checked:border-royal peer-checked:bg-royal">
        <span className="block h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-[18px]" />
      </span>
    </label>
  );
}

/** A concrete example under a setting — the fastest way to make it click. */
function Example({ children }: { children: ReactNode }) {
  return (
    <p className="a-inset mt-1.5 px-3.5 py-2.5 text-[12px] leading-snug text-slate">
      <span className="font-bold text-charcoal">Exemple :</span> {children}
    </p>
  );
}

/** Advanced settings, hidden by default — a first-timer should see 2-3 knobs. */
function Advanced({ children }: { children: ReactNode }) {
  return (
    <details className="group mt-2 border-t border-[var(--o-edge)] pt-1">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-2.5 text-[12px] font-bold text-slate [&::-webkit-details-marker]:hidden">
        <span className="text-[15px] transition-transform group-open:rotate-90">›</span>
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
      <span className="block text-[13px] font-semibold text-charcoal">{label}</span>
      <span className="mt-0.5 mb-2 block text-[12px] leading-snug text-slate">{help}</span>
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
        {suffix && <span className="shrink-0 text-[12px] font-semibold text-slate">{suffix}</span>}
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
  const [welcome, setWelcome] = useState(program.welcomePoints);
  /*
    THE RATE IS NO LONGER A SETTING. One dinar is one point, in every shop on
    the platform — see 0031, which also puts a CHECK on the column so this is
    true of the database and not merely of this screen.

    It was a field here, and it should not have been: it is the one number a
    customer has to be able to carry from one counter to the next without doing
    arithmetic. A card worth double at one café and half at another is not a
    loyalty scheme, it is a currency exchange.
  */
  const rate = 1;
  const cheapest = rewards.filter((r) => r.active).sort((a, b) => a.pointsCost - b.pointsCost)[0];
  const perTicket = Math.floor(TICKET * rate);
  const visitsToReward = cheapest && perTicket > 0
    ? Math.max(1, Math.ceil((cheapest.pointsCost - welcome) / perTicket))
    : null;

  return (
    <form action={action} className="px-4 py-3">
      {/* Stated, not offered. An owner still needs to know the rate to price a
          reward — they simply do not get to change it. */}
      <div className="flex items-baseline justify-between rounded-xl bg-[var(--o-inset)] px-3.5 py-3">
        <span className="text-[13px] font-semibold text-charcoal">1 dinar dépensé</span>
        <span className="text-[13px] font-extrabold text-[#5b3fd1]">= 1 point</span>
      </div>
      <Example>
        un café à {TICKET.toString().replace(".", ",")} dinars rapporte{" "}
        <b className="text-charcoal">{perTicket} points</b>.
        {/*
          THE line this screen was missing. The rate lives here and the reward
          prices live one editor away, so the two numbers never met: this shop
          shipped at 1 pt/DT with a 200-point espresso — 200 dinars of café —
          and nothing on either screen said so.
        */}
        {cheapest && (
          <>
            {" "}
            <b className="text-charcoal">{cheapest.label}</b> coûte {cheapest.pointsCost} points, soit{" "}
            <b className="text-charcoal">
              {Math.round(cheapest.pointsCost / (rate || 1))} dinars de dépense
            </b>
            {visitsToReward && (
              <>
                {" "}
                — environ <b className="text-charcoal">{visitsToReward} visites</b> après le cadeau de
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
        {/* "Validité d'un code" is gone. A customer earned the reward; giving
            them a code that dies in 48 hours turns a thank-you into a chore,
            and the clock ran while the shop was shut. Codes keep (0031). */}
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
          <span className="block text-[13px] font-semibold text-charcoal">Carte à tampons activée</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-slate">
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
        <span className="mt-0.5 h-[24px] w-[42px] shrink-0 rounded-full border border-[var(--o-edge)] bg-[var(--o-inset)] p-[3px] transition-colors peer-checked:border-royal peer-checked:bg-royal">
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
          <span className="block text-[13px] font-semibold text-charcoal">Récompense de la carte</span>
          <span className="mt-0.5 mb-2 block text-[12px] text-slate">
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
      <span className="block text-[13px] font-semibold text-charcoal">Logo de la boutique</span>
      <span className="mt-0.5 mb-2.5 block text-[12px] leading-snug text-slate">
        Il s&apos;affiche en haut de la carte de vos clients.
      </span>

      <div className="flex items-center gap-3.5">
        {/* preview */}
        <span
          className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[var(--o-edge)]"
          style={{ background: logo ? "#fff" : BRAND_COLOR }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URI preview
            <img src={logo} alt="Logo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[24px] font-extrabold text-charcoal">
              {cafe.name.charAt(0).toUpperCase()}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <label
            className={`flex cursor-pointer items-center justify-center rounded-xl border border-[var(--o-edge)] bg-[var(--o-inset)] py-2.5 text-[12px] font-bold text-charcoal transition active:scale-[0.99] ${
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
              className="mt-1.5 w-full text-[12px] font-bold uppercase tracking-[0.05em] text-[#e5484d] underline underline-offset-2 disabled:opacity-55"
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

      <form action={action} className="border-t border-[var(--o-edge)] pt-1">
        <label className="block py-2.5">
          <span className="block text-[13px] font-semibold text-charcoal">Nom de la boutique</span>
          <span className="mt-0.5 mb-2 block text-[12px] text-slate">
            Ce que vos clients voient en haut de leur carte.
          </span>
          <input name="name" defaultValue={cafe.name} maxLength={60} className="a-field" />
        </label>

        <div className="py-2.5">
          <span className="block text-[13px] font-semibold text-charcoal">Type de commerce</span>
          <span className="mt-0.5 mb-2.5 block text-[12px] text-slate">
            Vos clients le voient pour reconnaître votre carte.
          </span>
          <BusinessTypePicker defaultValue={cafe.businessType} collapsible />
        </div>

        <BrandColour cafe={cafe} />

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

/**
 * THE COLOUR OF THE CUSTOMER'S APP.
 *
 * It writes businesses.primary_color, which every diner screen reads (see
 * lib/theme.ts). The column and its validation have existed all along — what was
 * missing was any way for the person who owns the brand to set it.
 *
 * Eight swatches for the shop that just wants to look like itself in one tap,
 * and a real colour picker for the one that knows its hex. Neither can produce
 * an unreadable screen: the text on the banner is computed from the colour, not
 * assumed, and the preview here shows exactly what that produces — including the
 * flip to dark text on a pale brand, which is the moment an owner needs to SEE
 * rather than be told about.
 */
function BrandColour({ cafe }: { cafe: Cafe }) {
  const [colour, setColour] = useState(cafe.primaryColor || BRAND_SWATCHES[0].hex);
  const ink = inkOn(colour);
  const type = businessType(cafe.businessType);

  return (
    <div className="py-2.5">
      <span className="block text-[13px] font-semibold text-charcoal">Couleur de la marque</span>
      <span className="mt-0.5 mb-2.5 block text-[12px] text-slate">
        Elle habille la carte de vos clients — en-tête, boutons, progression.
      </span>

      {/* the value that actually gets saved */}
      <input type="hidden" name="primaryColor" value={colour} />

      <div className="flex flex-wrap gap-2">
        {BRAND_SWATCHES.map((s) => {
          const on = s.hex.toLowerCase() === colour.toLowerCase();
          return (
            <button
              key={s.hex}
              type="button"
              onClick={() => setColour(s.hex)}
              aria-label={s.name}
              aria-pressed={on}
              className={`h-10 w-10 rounded-full transition active:scale-95 ${
                on ? "ring-2 ring-charcoal ring-offset-2 ring-offset-[var(--o-panel)]" : "ring-1 ring-[var(--o-edge)]"
              }`}
              style={{ background: s.hex }}
            />
          );
        })}

        {/*
          The free picker, as a ninth swatch.

          A separate labelled row for it made the eight above look like the only
          real answer. It is the same size and the same shape as they are — it
          just opens the system colour wheel, and it shows the CURRENT colour so
          a shop that pasted its own hex can still see what it chose.
        */}
        <label
          className="relative grid h-10 w-10 cursor-pointer place-items-center rounded-full ring-1 ring-[var(--o-edge)]"
          style={{
            background:
              "conic-gradient(#ff4d4d, #ffd400, #4ade80, #22d3ee, #5b3fd1, #ec4899, #ff4d4d)",
          }}
        >
          <input
            type="color"
            value={colour}
            onChange={(e) => setColour(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Choisir une autre couleur"
          />
          <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[#ffffff] text-[13px] font-bold leading-none text-charcoal">
            +
          </span>
        </label>
      </div>

      {/* what the customer will actually be looking at */}
      <p className="mt-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
        Aperçu côté client
      </p>
      <div className="mt-1.5 overflow-hidden rounded-2xl border border-[var(--o-edge)]">
        <div
          className="flex items-center gap-3 px-3.5 py-3"
          style={{
            backgroundImage: `linear-gradient(168deg, ${colour} 0%, ${mixToBlack(colour, 0.28)} 100%)`,
            color: ink,
          }}
        >
          {cafe.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded
            <img src={cafe.logoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span
              className="grid h-9 w-9 place-items-center rounded-full text-[16px]"
              style={{ background: "color-mix(in oklab, currentColor 16%, transparent)" }}
            >
              {type.emoji}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-extrabold">{cafe.name}</span>
            <span className="block text-[11px] font-bold opacity-75">130 points</span>
          </span>
        </div>
        <div className="bg-white px-3.5 py-2.5">
          <span className="text-[11px] font-bold" style={{ color: textOnWhite(colour) }}>
            Encore 20 points pour votre récompense
          </span>
        </div>
      </div>
    </div>
  );
}

/** The banner's darker end, mirrored from lib/theme so the preview cannot lie. */
function mixToBlack(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - amount)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
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
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--o-edge)] bg-[var(--o-inset)]">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URI preview
            <img src={img} alt="" className="h-full w-full object-cover" />
          ) : (
            <GiftIcon className="h-5 w-5 text-slate" />
          )}
        </span>
        <label
          className={`flex cursor-pointer items-center rounded-xl border border-[var(--o-edge)] bg-[var(--o-inset)] px-3 py-2 text-[12px] font-bold text-charcoal active:scale-[0.99] ${
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
            className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#e5484d] underline underline-offset-2 disabled:opacity-55"
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

/* PencilIcon went with the Modifier button — the whole row is the button now. */

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

/**
 * One reward, as a LINE — not a card of controls.
 *
 * This used to carry four separate controls: a visibility toggle, a points
 * column, Modifier, and Supprimer, laid out as a table that only resolved
 * around 900px. On the 390px screen every owner actually uses, that table
 * collapsed: the cost landed top-right, the name mid-left, the toggle under the
 * name, and Modifier and Supprimer stacked in a floating column beside them.
 * Four rewards filled the screen with twenty controls and not one straight
 * edge.
 *
 * A reward has exactly two things an owner does to it. Every day: take it off
 * the menu because the pâtisserie ran out at eleven — that is the toggle, and
 * it stays on the line. Occasionally: change its name, photo or price — that is
 * the whole row, tapped, exactly like every other row in Réglages.
 *
 * Supprimer moved inside the editor. It was sitting a thumb's width from
 * Modifier on the destructive side of a two-step it could not explain, and
 * deleting a reward is not something anyone does from a list.
 */
function RewardCard({
  reward,
  ticket,
  isFirst,
  dragging,
  editing,
  onEdit,
  onGrab,
}: {
  reward: Reward;
  ticket: Ticket;
  /** The cheapest visible one — marked, because it carries the programme. */
  isFirst: boolean;
  dragging: boolean;
  editing: boolean;
  onEdit: () => void;
  onGrab: (e: React.PointerEvent) => void;
}) {
  const [active, setActive] = useState(reward.active);
  const [pending, start] = useTransition();
  const visits = visitsForPoints(reward.pointsCost, ticket);
  const tooHard = isFirst && visits > EASY_FIRST_VISITS;

  return (
    <div
      data-rid={reward.id}
      className={`a-card flex items-center gap-2.5 px-3 py-2.5 transition ${
        dragging ? "scale-[1.01] opacity-90 ring-1 ring-royal" : ""
      } ${active ? "" : "opacity-55"}`}
    >
      {/*
        The handle, and ONLY the handle, starts a drag — the line is tappable
        and a draggable line means every tap begins by looking like a drag.
        Hidden on a phone: touch-drag inside a scrolling sheet fights the scroll.
      */}
      <button
        type="button"
        onPointerDown={onGrab}
        aria-label={`Déplacer ${reward.label}`}
        className="hidden shrink-0 cursor-grab touch-none px-0.5 py-2 text-slate transition hover:text-slate active:cursor-grabbing sm:block"
      >
        <GripIcon className="h-5 w-3" />
      </button>

      {/* the whole line opens the editor */}
      <button
        type="button"
        onClick={onEdit}
        aria-expanded={editing}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--o-inset)]">
          {reward.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded, not a build asset
            <img src={reward.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <GiftIcon className="h-5 w-5 text-slate" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {/*
              The ladder's first rung, named. An owner scanning this list has no
              other way to tell which of six rewards is the one almost every
              customer is actually working towards.

              Not uppercase: "1re" set in caps renders "1RE", which reads as an
              acronym rather than an ordinal.
            */}
            {isFirst && (
              <span className="shrink-0 rounded-full bg-[#5b3fd1]/15 px-2 py-0.5 text-[10px] font-extrabold text-[#5b3fd1]">
                1<sup>re</sup>
              </span>
            )}
            <span className="min-w-0 truncate text-[15px] font-bold text-charcoal">
              {reward.label}
            </span>
          </span>
          {/* Stated in VISITS, the unit the editor now asks in — a row that
              reads "45 pts" and an editor that asks "how many visits" are not
              the same screen. Points stay, small, because the customer's card
              counts in them. */}
          <span className="block truncate text-[12px] font-semibold text-slate">
            <b className={`font-extrabold ${tooHard ? "text-[#a06e00]" : "text-[#5b3fd1]"}`}>
              {visits} visite{visits > 1 ? "s" : ""}
            </b>
            {" · "}
            {fmtPoints(reward.pointsCost)} pts
          </span>
        </span>
        <span className="shrink-0 text-[17px] leading-none text-slate">
          {editing ? "⌄" : "›"}
        </span>
      </button>

      {/*
        Saves on the spot, and stays out on the line because it is the daily
        one. Hiding a reward used to mean opening the editor, unticking a box
        and pressing save — three steps for the thing an owner does most.
      */}
      <label
        className="flex shrink-0 cursor-pointer items-center border-l border-[var(--o-edge)] py-1.5 pl-3"
        title={active ? "Visible par vos clients" : "Masquée"}
      >
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
        <span className="sr-only">{active ? "Visible" : "Masquée"}</span>
        <span className="h-[22px] w-[38px] rounded-full border border-[var(--o-edge)] bg-[var(--o-inset)] p-[2.5px] transition-colors peer-checked:border-royal peer-checked:bg-royal">
          <span className="block h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-[15px]" />
        </span>
      </label>
    </div>
  );
}

/**
 * The editor for ONE reward — two questions, and neither of them is "points".
 *
 * It used to ask for a name and a number of points, in a bare numeric field
 * with the placeholder "25". That second question is unanswerable: the owner
 * would have to know their own average ticket, divide, and guess — and if they
 * guessed high, nothing anywhere told them. See lib/rewards.ts for what that
 * cost this product.
 *
 * Now it asks what every shop owner already has an answer for: WHAT do you give
 * away, and AFTER HOW MANY VISITS. The points are derived and posted in a
 * hidden field, so saveRewardAction is untouched and points_cost still means
 * exactly what it always meant.
 */
function RewardEditor({
  reward,
  ticket,
  ideas,
  isFirst,
  onDone,
}: {
  reward: Reward | null;
  ticket: Ticket;
  /** Names to tap instead of facing an empty field, chosen by trade. */
  ideas: string[];
  /** Is this the cheapest one — the reward that decides whether the card works? */
  isFirst: boolean;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveRewardAction, {});
  const [label, setLabel] = useState(reward?.label ?? "");
  const [visits, setVisits] = useState(
    reward ? visitsForPoints(reward.pointsCost, ticket) : 3,
  );
  const [custom, setCustom] = useState(!VISIT_PRESETS.includes(visits as never));
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();

  /*
    Opening a reward and saving it unchanged must not move its price.

    points → visits → points does not round-trip: a 40-point reward against a
    7,86 TND ticket displays as 5 visits, and 5 visits computes back to 39. So
    an owner who opened "Thé à la menthe" to fix a typo would silently re-price
    it by a point, every time, and again the next time.

    While the visits figure is untouched, the stored cost is therefore posted
    back verbatim. Only actually moving the control means "re-price this".
  */
  const initialVisits = reward ? visitsForPoints(reward.pointsCost, ticket) : null;
  const cost =
    reward && visits === initialVisits ? reward.pointsCost : pointsForVisits(visits, ticket);
  const tooHard = isFirst && visits > EASY_FIRST_VISITS;

  return (
    <div className="a-card border border-royal/40 px-4 py-3.5">
      <form action={action}>
        {reward && <input type="hidden" name="id" value={reward.id} />}
        {/* the unit the database wants, derived from the unit the owner gave */}
        <input type="hidden" name="pointsCost" value={cost} />

        {/* ── 1. what do they get ─────────────────────────────────── */}
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-bold text-charcoal">
            Qu&apos;est-ce qu&apos;ils gagnent ?
          </span>
          <input
            name="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={ideas[0]}
            maxLength={60}
            className="a-field"
          />
        </label>
        {/* An empty field is the hardest question on the screen. These are one
            tap, and they are picked for the trade the owner already chose. */}
        {!label.trim() && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ideas.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setLabel(idea)}
                className="rounded-full border border-[var(--o-edge)] bg-[var(--o-inset)] px-3 py-1.5 text-[12px] font-semibold text-slate transition active:scale-95"
              >
                {idea}
              </button>
            ))}
          </div>
        )}

        {/* ── 2. how hard is it ───────────────────────────────────── */}
        <div className="mt-4">
          <span className="block text-[13px] font-bold text-charcoal">
            Après combien de visites ?
          </span>
          <span className="mt-0.5 mb-2 block text-[12px] leading-snug text-slate">
            {isFirst
              ? "C'est votre première récompense — celle qui donne envie de revenir. Visez 2 ou 3."
              : "Les suivantes peuvent demander plus d'efforts."}
          </span>

          <div className="grid grid-cols-6 gap-1.5">
            {VISIT_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setVisits(v);
                  setCustom(false);
                }}
                className={`rounded-xl py-2.5 text-[15px] font-extrabold tabular-nums transition ${
                  !custom && visits === v
                    ? "bg-royal text-white"
                    : "bg-[var(--o-inset)] text-slate"
                }`}
              >
                {v}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustom(true)}
              className={`rounded-xl py-2.5 text-[12px] font-bold transition ${
                custom ? "bg-royal text-white" : "bg-[var(--o-inset)] text-slate"
              }`}
            >
              autre
            </button>
          </div>

          {custom && (
            <input
              type="number"
              min={1}
              max={200}
              inputMode="numeric"
              value={visits}
              onChange={(e) => setVisits(Math.max(1, Number(e.target.value) || 1))}
              className="a-field mt-2 tabular-nums"
              aria-label="Nombre de visites"
            />
          )}
        </div>

        {/*
          The arithmetic, shown rather than demanded. `measured` is the
          difference between "we counted your tickets" and "we are guessing
          until you have customers", and saying which is which is the only way
          this number deserves to be believed.
        */}
        <p className="a-inset mt-2.5 px-3.5 py-2.5 text-[12px] leading-snug text-slate">
          <b className="text-charcoal">{`${visits} visite${visits > 1 ? "s" : ""}`}</b>
          {" = "}
          <b className="text-charcoal">{`${cost} points`}</b>
          {`, soit ${cost} dinars d'achats.`}
          <br />
          {ticket.measured
            ? `Calculé sur votre ticket moyen réel : ${ticket.tnd.toFixed(2)} TND.`
            : `Estimé sur un ticket de ${ticket.tnd.toFixed(2)} TND — ça s'ajustera avec vos vraies ventes.`}
        </p>

        {tooHard && (
          <p className="mt-2 rounded-xl bg-[#a06e00]/12 px-3.5 py-2.5 text-[12px] font-semibold leading-snug text-[#a06e00]">
            {visits} visites avant le premier cadeau, c&apos;est long — beaucoup
            abandonneront avant. Une première récompense facile est ce qui fait
            revenir.
          </p>
        )}
        {/*
          Visibility is set on the CARD, not in here, so the editor must not
          post a stale value: an unchecked box would submit nothing and quietly
          hide a reward every time its name was corrected.
        */}
        <input type="hidden" name="active" value="on" />
        <Feedback state={state} />
        <div className="mt-3.5 flex items-center gap-2">
          <button type="submit" disabled={pending} className={btn}>
            {pending ? "· · ·" : reward ? "Enregistrer" : "Ajouter"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="shrink-0 rounded-2xl px-4 py-3 text-[13px] font-bold text-slate"
          >
            Fermer
          </button>
        </div>
      </form>

      {/*
        The photo, LAST and folded.

        It used to be the first thing in this editor — a 12 Mo file picker
        between an owner and naming their reward, for something entirely
        optional that a shop can only supply once it has thought of the reward
        at all. It is also the one control here that saves instantly, so it
        cannot sit above a form that waits for Enregistrer without implying the
        button covers it.

        Only for a saved reward: the upload action needs an id.
      */}
      {reward && (
        <details className="group mt-3 border-t border-[var(--o-edge)] pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1.5 text-[12px] font-bold text-slate [&::-webkit-details-marker]:hidden">
            <span className="text-[15px] transition-transform group-open:rotate-90">›</span>
            {reward.imageUrl ? "Changer la photo" : "Ajouter une photo (facultatif)"}
          </summary>
          <div className="pt-1.5">
            <RewardImageUploader reward={reward} />
          </div>
        </details>
      )}

      {/*
        Deleting lives here now, not on the list.

        It used to sit a thumb's width below Modifier on every row, so the list
        of things you own was also a grid of ways to destroy them. Here it is
        behind opening the reward — an act that already means "I am changing
        this one" — set apart below the save, and still two-step because it
        cannot be undone.

        Deliberately in-page rather than confirm(): a native dialog is blocked
        in some in-app browsers, which silently made it one tap again.
      */}
      {reward && (
        <div className="mt-3 border-t border-[var(--o-edge)] pt-3">
          {confirming ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => startDelete(() => deleteRewardAction(reward.id))}
                className="flex-1 rounded-2xl bg-[#e5484d] px-3 py-2.5 text-[13px] font-bold text-white"
              >
                {deleting ? "· · ·" : `Supprimer « ${reward.label} »`}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="shrink-0 px-3 py-2.5 text-[13px] font-bold text-slate"
              >
                Non
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1.5 text-[12px] font-bold text-[#e5484d] transition active:scale-95"
            >
              <TrashIcon className="h-3.5 w-3.5" /> Supprimer cette récompense
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function RewardsEditor({
  rewards,
  ticket,
  businessType,
}: {
  rewards: Reward[];
  ticket: Ticket;
  businessType: string | null;
}) {
  const [order, setOrder] = useState(rewards);
  const ideas = rewardIdeas(businessType);
  /*
    The cheapest VISIBLE reward, by points.

    Not the first row: the list order is the owner's own arrangement (they drag
    it), and a masked reward is not something any customer is working towards.
    This is the one that decides whether the card feels winnable, so it is the
    one that gets marked and the one the "too hard" warning is about.
  */
  const firstId = [...order]
    .filter((r) => r.active)
    .sort((a, b) => a.pointsCost - b.pointsCost)[0]?.id;
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
      {/* Full width, not floated right. A lone pill in the top-right corner
          above a list of cards has nothing to align to, and it is the first
          thing a shop with no rewards has to find. */}
      <button
        type="button"
        onClick={() => {
          setAdding(true);
          setEditing(null);
        }}
        className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-royal py-3 text-[13px] font-bold text-white transition active:scale-[0.99]"
      >
        <span className="text-[17px] leading-none">+</span> Ajouter une récompense
      </button>

      {adding && (
        <div className="mb-3">
          <RewardEditor
            reward={null}
            ticket={ticket}
            ideas={ideas}
            // a shop with nothing on the ladder is adding its first rung
            isFirst={order.filter((r) => r.active).length === 0}
            onDone={() => setAdding(false)}
          />
        </div>
      )}

      <div className="space-y-2.5">
        {order.map((r) => (
          <div key={r.id}>
            <RewardCard
              reward={r}
              ticket={ticket}
              isFirst={r.id === firstId}
              dragging={dragId === r.id}
              editing={editing === r.id}
              onEdit={() => setEditing(editing === r.id ? null : r.id)}
              onGrab={(e) => onGrab(e, r.id)}
            />
            {editing === r.id && (
              <div className="mt-2">
                <RewardEditor
                  reward={r}
                  ticket={ticket}
                  ideas={ideas}
                  isFirst={r.id === firstId}
                  onDone={() => setEditing(null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {order.length === 0 && !adding && (
        <p className="a-inset px-4 py-6 text-center text-[13px] leading-snug text-slate">
          Aucune récompense pour l&apos;instant — vos clients n&apos;ont rien à viser.
        </p>
      )}

      {order.length > 1 && (
        <p className="mt-4 hidden items-center justify-center gap-1.5 text-[12px] text-slate sm:flex">
          <GripIcon className="h-3.5 w-2.5" /> Glissez pour réorganiser vos récompenses
        </p>
      )}
    </div>
  );
}

/* La roue ----------------------------------------------------------------- */

/**
 * The wheel's controls, and the honest version of its odds.
 *
 * The draw is UNIFORM over the active segments (spin_wheel, 0031), so the odds
 * are simply one in however many lots there are — and the screen says so, with
 * the actual percentage, because an owner setting a price needs to know how
 * often the expensive lot comes up. There is no weight slider, and adding one
 * back would mean hiding the odds from the customer who pays to spin.
 *
 * ONE screen, in the order the job is done: switch it on, put the lots in, price
 * the spin, save. The prize list used to be a second component rendered BELOW
 * this form, which put an "Enregistrer" button in the middle of the sheet with
 * a list under it that saved itself on every tap — two save models stacked, and
 * no way to tell by looking which half the button applied to. The list comes
 * through as `prizes` and sits inside, so the only button below everything is
 * the one that saves.
 */
export function WheelForm({ game, prizes }: { game: Game | null; prizes: ReactNode }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveWheelAction, {});
  const [on, setOn] = useState(game?.active ?? false);
  const [cost, setCost] = useState(game?.spinCost ?? 10);

  if (!game) {
    return (
      <p className="px-4 py-6 text-center text-[13px] text-slate">
        La roue n&apos;est pas encore disponible pour ce commerce.
      </p>
    );
  }

  const n = game.prizes.length;

  return (
    <form action={action} className="px-4 py-3">
      <Toggle
        name="wheelActive"
        label="La roue est active"
        help="Vos clients la voient sur la page des récompenses."
        defaultChecked={on}
        onChecked={setOn}
      />

      <div className={on ? "" : "pointer-events-none opacity-45"}>
        {/* The lots, before the price — you cannot price a spin at anything
            sensible until you know what is in it. */}
        {prizes}

        <Num
          name="spinCost"
          label="Coût d'un tour"
          help="Ce que le client paie, en points, pour tourner une fois."
          value={cost}
          suffix="points"
          onValue={setCost}
        />
        <Example>
          {n === 0 ? (
            <>aucun lot pour l&apos;instant — la roue reste invisible tant qu&apos;elle est vide.</>
          ) : (
            <>
              {n} lot{n > 1 ? "s" : ""}, tirés au hasard :{" "}
              <b className="text-charcoal">chacun sort {Math.round(100 / n)}% du temps</b>. Un tour à{" "}
              {cost} points, c&apos;est {cost} dinars de dépense.
            </>
          )}
        </Example>
      </div>

      <Feedback state={state} />
      <button type="submit" disabled={pending} className={`${btn} mt-3`}>
        {pending ? "· · ·" : "Enregistrer"}
      </button>
    </form>
  );
}

/** The segments. Order does not matter — the draw is uniform. */
export function PrizesEditor({ game }: { game: Game | null }) {
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!game) return null;

  async function add() {
    const label = adding.trim();
    if (!label || busy) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("label", label);
    const res = await savePrizeAction({}, fd);
    setBusy(false);
    if (res.error) setErr(res.error);
    else setAdding("");
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await deletePrizeAction(id);
    setBusy(false);
    if (res.error) setErr(res.error);
  }

  return (
    /*
      No horizontal padding and no width cap: this now renders INSIDE WheelForm
      (see its note), which already provides both. Keeping its own would have
      indented the lots one step further in than every other field beside them.
    */
    <div className="py-3">
      <p className="mb-1.5 text-[13px] font-bold text-charcoal">Les lots</p>
      {/* Says so out loud, because everything else on this screen waits for
          Enregistrer and these do not. */}
      <p className="mb-2 text-[12px] text-slate">
        Ajoutés et retirés tout de suite — pas besoin d&apos;enregistrer.
      </p>
      <ul className="space-y-2">
        {game.prizes.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-[var(--o-inset)] px-3.5 py-3"
          >
            <span className="min-w-0 truncate text-[15px] font-semibold text-charcoal">{p.label}</span>
            <button
              type="button"
              onClick={() => remove(p.id)}
              disabled={busy}
              className="shrink-0 text-[12px] font-bold text-slate hover:text-[#e5484d] disabled:opacity-40"
            >
              Retirer
            </button>
          </li>
        ))}
        {game.prizes.length === 0 && (
          <li className="rounded-xl bg-[var(--o-inset)] px-3.5 py-6 text-center text-[13px] text-slate">
            Ajoutez au moins un lot pour que la roue apparaisse.
          </li>
        )}
      </ul>

      <div className="mt-3 flex gap-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          maxLength={40}
          placeholder="Café offert"
          className="a-field min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !adding.trim()}
          className="shrink-0 rounded-xl bg-[#5b3fd1] px-4 text-[12px] font-bold text-white disabled:opacity-40"
        >
          Ajouter
        </button>
      </div>
      {err && <p className="mt-2 text-[12px] font-semibold text-[#e5484d]">{err}</p>}

      <p className="mt-3 text-[12px] leading-snug text-slate">
        Le tirage est au hasard, à parts égales. Pour qu&apos;un lot sorte moins
        souvent, ajoutez d&apos;autres lots — vos clients voient la roue, donc ils
        voient les chances.
      </p>
    </div>
  );
}
