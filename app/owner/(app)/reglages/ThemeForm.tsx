"use client";

import { useActionState, useState, useTransition } from "react";
import { businessType } from "@/lib/businessTypes";
import { BRAND_SWATCHES, inkOn, textOnWhite, safeColor } from "@/lib/theme";
import { LOOKS } from "@/lib/looks";
import type { Cafe, CardTheme } from "@/lib/types";
import { ShopLogo } from "@/components/ShopLogo";
import { removeCoverAction, saveCoverAction, saveThemeAction, type SettingsState } from "./actions";

/**
 * ── LE THÈME ──────────────────────────────────────────────────────────────
 * One screen where a shop decides what its customers' card looks like, with
 * that card drawn beside the controls and changing as they are touched.
 *
 * WHY A LIVE PREVIEW AND NOT A ROW OF SAMPLE THUMBNAILS. Five little cards in
 * five fixed colours show you what the PRODUCT can look like. This shop needs
 * to know what THEIR card looks like — with their name, their logo, their
 * balance figure — because the thing that goes wrong is never "is teal nice",
 * it is "does my logo disappear on that". So the preview is the real card, at
 * a real size, in front of them while they choose.
 *
 * WHAT IS DELIBERATELY NOT OFFERED, and why:
 *   · ready-made gradient ramps. A shop picks ONE colour and the gradient is
 *     derived from it. A preset ramp is somebody else's two colours sitting
 *     next to this shop's logo.
 *   · a third typeface. Inter and Poppins are already loaded on every page in
 *     the product, so choosing between them costs the customer nothing. A third
 *     family is a real download on a real phone, charged to the customer, to
 *     change the shape of a heading.
 *   · free control of the text colour. It is computed from the background and
 *     always readable — that is not a decision worth handing over.
 */

const RADII = [
  { key: "s", label: "Net", px: 10 },
  { key: "m", label: "Doux", px: 22 },
  { key: "l", label: "Rond", px: 30 },
] as const;

const FONTS = [
  { key: "inter", label: "Inter", css: "var(--font-inter), system-ui, sans-serif" },
  { key: "poppins", label: "Poppins", css: "var(--font-poppins-var), sans-serif" },
] as const;

/* The two corners under the shop's header — an AMOUNT, not a switch. */
const CURVES = [
  { key: "none", label: "Net" },
  { key: "s", label: "Léger" },
  { key: "m", label: "Doux" },
  { key: "l", label: "Rond" },
] as const;

/* How much of the shop's colour there is before the card begins. */
const HEIGHTS = [
  { key: "s", label: "Compact" },
  { key: "m", label: "Normal" },
  { key: "l", label: "Ample" },
] as const;

/*
  Whether the logo gets CUT to a circle, or shown whole.

  Every surface used to force the disc, which is right for a photograph and
  wrong for the thing this field actually holds — a wordmark came back with its
  first and last letters sliced off, and a mark drawn on transparency got a
  white plate stamped behind it. "Entier" is the escape hatch for both.
*/
const LOGO_SHAPES = [
  { key: "circle", label: "Rond" },
  { key: "free", label: "Entier" },
] as const;

/* A texture drawn from the shop's own ink. Never over a photograph. */
const PATTERNS = [
  { key: "none", label: "Aucun" },
  { key: "dots", label: "Pois" },
  { key: "stripes", label: "Rayures" },
  { key: "grid", label: "Grille" },
] as const;

const BANNERS = [
  { key: "flat", label: "Uni" },
  { key: "gradient", label: "Dégradé" },
  { key: "photo", label: "Photo" },
] as const;

/** Downscale to a banner-sized WebP before it ever reaches the server. */
async function fileToCover(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  /*
    900×540 is twice the banner's drawn size on a phone, which is as much as any
    screen can show. Anything larger is bytes the customer pays for and cannot
    see — and the server caps it again at ~118 KB regardless.
  */
  const W = 900;
  const H = 540;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");

  // cover-crop: fill the frame, centred, rather than squashing the photo
  const scale = Math.max(W / bitmap.width, H / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (W - w) / 2, (H - h) / 2, w, h);
  bitmap.close?.();

  let uri = canvas.toDataURL("image/webp", 0.72);
  if (!uri.startsWith("data:image/webp")) uri = canvas.toDataURL("image/jpeg", 0.72);
  return uri;
}

export function ThemeForm({ cafe }: { cafe: Cafe }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveThemeAction, {});
  const t = cafe.designSettings.theme;

  const [colour, setColour] = useState(cafe.primaryColor || BRAND_SWATCHES[0].hex);
  const [banner, setBanner] = useState<(typeof BANNERS)[number]["key"]>(t.banner);
  const [surface, setSurface] = useState<"light" | "dark">(t.surface);
  const [radius, setRadius] = useState<(typeof RADII)[number]["key"]>(t.radius);
  const [font, setFont] = useState<(typeof FONTS)[number]["key"]>(t.font);
  const [round, setRound] = useState(t.bannerRound);
  const [height, setHeight] = useState(t.bannerHeight);
  const [pattern, setPattern] = useState(t.pattern);
  const [scrim, setScrim] = useState(t.scrim);
  const [logoShape, setLogoShape] = useState(t.logoShape);

  /* The cover is saved on its own, the moment it is chosen — see saveCoverAction. */
  const [cover, setCover] = useState<string | null>(t.coverAt ? `/api/cover/${cafe.slug}?v=${t.coverAt}` : null);
  const [coverMsg, setCoverMsg] = useState<SettingsState>({});
  const [coverBusy, startCover] = useTransition();

  const safe = safeColor(colour);
  const ink = inkOn(safe);
  const onSoft = textOnWhite(safe, mixHex(safe, "#ffffff", 0.86));
  const type = businessType(cafe.businessType);
  const px = RADII.find((r) => r.key === radius)?.px ?? 22;
  const dark = surface === "dark";

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverMsg({});
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      setCoverMsg({ error: "Choisissez une image PNG, JPG ou WebP." });
      return;
    }
    let uri: string;
    try {
      uri = await fileToCover(file);
    } catch {
      setCoverMsg({ error: "Image illisible — essayez-en une autre." });
      return;
    }
    startCover(async () => {
      const res = await saveCoverAction(uri);
      setCoverMsg(res);
      if (res.saved) {
        setCover(uri);
        setBanner("photo");
      }
    });
  }

  return (
    /*
      One column on a phone: preview, then the knobs under it, and you scroll
      between them. On a laptop that same stack pushed the preview off the top
      the moment you reached "Police" — you were choosing a typeface for a card
      you could no longer see. At lg the card sticks to the left and every
      control lives beside it, so nothing you change happens off screen.
    */
    <form
      action={action}
      className="px-4 py-3 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-7"
    >
      {/* what actually gets written */}
      <input type="hidden" name="primaryColor" value={colour} />
      <input type="hidden" name="banner" value={banner} />
      <input type="hidden" name="surface" value={surface} />
      <input type="hidden" name="radius" value={radius} />
      <input type="hidden" name="font" value={font} />
      <input type="hidden" name="bannerRound" value={round} />
      <input type="hidden" name="bannerHeight" value={height} />
      <input type="hidden" name="pattern" value={pattern} />
      <input type="hidden" name="logoShape" value={logoShape} />
      {/* checkboxes post "on"/absent, which is what saveThemeAction reads */}
      <input type="checkbox" name="scrim" checked={scrim} readOnly hidden />

      {/* ══ THE PREVIEW — their card, not a swatch ═══════════════════════ */}
      <div className="lg:sticky lg:top-0">
      <Preview
        cafe={cafe}
        emoji={type.emoji}
        colour={safe}
        ink={ink}
        onSoft={onSoft}
        banner={banner}
        cover={cover}
        dark={dark}
        px={px}
        font={FONTS.find((f) => f.key === font)?.css ?? FONTS[0].css}
        curve={round}
        height={height}
        pattern={pattern}
        logoShape={logoShape}
      />
      </div>

      <div className="min-w-0">
      {/*
        ══ READY-MADE IDENTITIES ═══════════════════════════════════════
        First, and above the knobs, because most shops have a colour in mind
        and no opinion about corner radii. One tap fills in all eight controls;
        everything below still works exactly as it did for the shop that wants
        to keep going. Nothing is saved until Enregistrer — a preset changes
        the PREVIEW, which is the point of having one.
      */}
      <Label>Styles prêts à l&apos;emploi</Label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {LOOKS.map((l) => {
          const on =
            l.colour.toLowerCase() === colour.toLowerCase() &&
            l.theme.banner === banner &&
            l.theme.bannerRound === round &&
            l.theme.pattern === pattern &&
            l.theme.surface === surface;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setColour(l.colour);
                setBanner(l.theme.banner);
                setSurface(l.theme.surface);
                setRadius(l.theme.radius);
                setRound(l.theme.bannerRound);
                setHeight(l.theme.bannerHeight);
                setPattern(l.theme.pattern);
                setFont(l.theme.font);
              }}
              aria-pressed={on}
              className={`overflow-hidden rounded-2xl border text-left transition active:scale-[0.98] ${
                on ? "border-[#5b3fd1] ring-2 ring-[#5b3fd1]/30" : "border-[var(--o-edge)]"
              }`}
            >
              {/* the look, actually drawn — a name alone tells nobody anything */}
              <span
                className="block h-[52px] w-full"
                style={{
                  backgroundColor: l.colour,
                  backgroundImage: [
                    l.theme.pattern === "none"
                      ? null
                      : patternLayer(l.theme.pattern, inkOn(l.colour)),
                    l.theme.banner === "flat"
                      ? null
                      : `linear-gradient(168deg, ${l.colour} 0%, ${mixHex(l.colour, "#000", 0.28)} 100%)`,
                  ]
                    .filter(Boolean)
                    .join(", ") || undefined,
                  backgroundSize:
                    l.theme.pattern === "none" ? undefined : patternSize(l.theme.pattern),
                  borderBottomLeftRadius: CURVE_PX[l.theme.bannerRound],
                  borderBottomRightRadius: CURVE_PX[l.theme.bannerRound],
                }}
              />
              <span className="block px-3 py-2">
                <span className="block text-[12.5px] font-bold text-charcoal">{l.name}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate">{l.note}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ══ COLOUR ══════════════════════════════════════════════════════ */}
      <Label>Couleur principale</Label>
      <div className="flex flex-wrap gap-2">
        {BRAND_SWATCHES.map((s) => (
          <button
            key={s.hex}
            type="button"
            onClick={() => setColour(s.hex)}
            aria-label={s.name}
            aria-pressed={s.hex.toLowerCase() === colour.toLowerCase()}
            className={`h-10 w-10 rounded-full transition active:scale-95 ${
              s.hex.toLowerCase() === colour.toLowerCase()
                ? "ring-2 ring-charcoal ring-offset-2 ring-offset-[var(--o-panel)]"
                : "ring-1 ring-[var(--o-edge)]"
            }`}
            style={{ background: s.hex }}
          />
        ))}
        {/* the free picker, as one more swatch — a separate labelled row made
            the eight above look like the only real answer */}
        <label
          className="relative grid h-10 w-10 cursor-pointer place-items-center rounded-full ring-1 ring-[var(--o-edge)]"
          style={{ background: "conic-gradient(#ff4d4d,#ffd400,#4ade80,#22d3ee,#5b3fd1,#ec4899,#ff4d4d)" }}
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

      {/* ══ BANNER ══════════════════════════════════════════════════════ */}
      <Label>En-tête de la carte</Label>
      <Segmented
        options={BANNERS}
        value={banner}
        onChange={(v) => setBanner(v)}
        /* Photo is only selectable once there is one — otherwise it is a
           setting that silently does nothing. */
        disabled={cover ? [] : ["photo"]}
      />

      <div className="mt-2.5 flex items-center gap-2.5">
        <label className="a-btn a-btn--dark !w-auto cursor-pointer px-4 !text-[12.5px]">
          <input type="file" accept="image/*" onChange={pickCover} className="hidden" />
          {coverBusy ? "· · ·" : cover ? "Changer la photo" : "Ajouter une photo"}
        </label>
        {cover && (
          <button
            type="button"
            disabled={coverBusy}
            onClick={() =>
              startCover(async () => {
                const res = await removeCoverAction();
                setCoverMsg(res);
                if (res.saved) {
                  setCover(null);
                  setBanner("gradient");
                }
              })
            }
            className="text-[12px] font-bold text-slate hover:text-slate"
          >
            Retirer
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-snug text-slate">
        Votre salle, votre comptoir, votre vitrine. Elle est recadrée et allégée
        automatiquement — et le nom reste lisible dessus.
      </p>
      {coverMsg.error && (
        <p role="alert" className="mt-1.5 text-[12px] font-semibold text-[#e5484d]">
          {coverMsg.error}
        </p>
      )}

      {/* ══ THE BANNER'S OWN SHAPE ══════════════════════════════════════
          Three levers that do more for "this looks like my shop" than the
          colour picker does, and none of them can break legibility. */}
      <Label>Coins du bandeau</Label>
      <Segmented options={CURVES} value={round} onChange={(v) => setRound(v)} />

      <Label>Hauteur du bandeau</Label>
      <Segmented options={HEIGHTS} value={height} onChange={(v) => setHeight(v)} />

      {/* a photograph brings its own texture — a pattern on top is noise */}
      {banner !== "photo" && (
        <>
          <Label>Motif</Label>
          <Segmented options={PATTERNS} value={pattern} onChange={(v) => setPattern(v)} />
        </>
      )}

      <div className="mt-3 space-y-1">
        {/* only means anything with a photograph — a scrim over a flat colour
            is a darker flat colour, which is what the colour picker is for */}
        {banner === "photo" && (
          <Switch
            label="Assombrir la photo"
            hint="Gardez-le si votre nom ou votre solde passe sur une zone claire."
            on={scrim}
            onChange={setScrim}
          />
        )}
      </div>

      {/* ══ THE LOGO'S SHAPE ════════════════════════════════════════════
          Only worth asking a shop that HAS a logo — without one the card
          shows its business-type emoji and there is nothing to crop. */}
      {cafe.logoUrl && (
        <>
          <Label>Votre logo</Label>
          <Segmented
            options={LOGO_SHAPES}
            value={logoShape}
            onChange={(v) => setLogoShape(v)}
          />
          <p className="mt-1.5 text-[12px] leading-snug text-[var(--o-muted)]">
            «&nbsp;Entier&nbsp;» affiche votre logo tel quel, sans le découper
            en rond et sans fond derrière — pour un logo large, ou sur fond
            transparent.
          </p>
        </>
      )}

      {/* ══ SURFACE ═════════════════════════════════════════════════════ */}
      <Label>Style de l&apos;app</Label>
      <Segmented
        options={[
          { key: "light", label: "Clair" },
          { key: "dark", label: "Sombre" },
        ] as const}
        value={surface}
        onChange={(v) => setSurface(v)}
      />

      {/* ══ RADIUS ══════════════════════════════════════════════════════ */}
      <Label>Coins</Label>
      <Segmented options={RADII} value={radius} onChange={(v) => setRadius(v)} />

      {/* ══ FONT ════════════════════════════════════════════════════════ */}
      <Label>Police</Label>
      <Segmented options={FONTS} value={font} onChange={(v) => setFont(v)} />

      {state.error && (
        <p role="alert" className="mt-3 rounded-xl bg-[#e5484d]/12 px-3.5 py-2.5 text-[13px] font-semibold text-[#e5484d]">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className="mt-3 rounded-xl bg-[#2f9e6e]/12 px-3.5 py-2.5 text-[13px] font-semibold text-[#2f9e6e]">
          Enregistré ✦
        </p>
      )}

      <button type="submit" disabled={pending} className="a-btn mt-4">
        {pending ? "· · ·" : "Enregistrer le thème"}
      </button>
      </div>
    </form>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────── */

/** A labelled switch, in the owner app's voice. */
function Switch({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className="flex w-full items-start justify-between gap-3 rounded-2xl px-1 py-2 text-left"
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-charcoal">{label}</span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-slate">{hint}</span>
      </span>
      <span
        className="mt-0.5 h-[24px] w-[42px] shrink-0 rounded-full border p-[3px] transition-colors"
        style={{
          background: on ? "var(--o-accent)" : "var(--o-inset)",
          borderColor: on ? "var(--o-accent)" : "var(--o-edge)",
        }}
      >
        <span
          className="block h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform"
          style={{ transform: on ? "translateX(18px)" : "none" }}
        />
      </span>
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
      {children}
    </p>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = [],
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: readonly T[];
}) {
  return (
    <div className="flex gap-1 rounded-2xl bg-[var(--o-inset)] p-1">
      {options.map((o) => {
        const off = disabled.includes(o.key);
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            disabled={off}
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={`min-h-[40px] flex-1 rounded-xl text-[13px] font-bold transition ${
              on
                ? "bg-[var(--o-panel)] text-charcoal shadow-sm"
                : off
                  ? "text-slate/40"
                  : "text-slate"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The customer's card, at half scale, drawn from the same rules the real one
 * uses. Not a screenshot and not an iframe: an iframe of the live page would
 * need a signed-in customer with a balance, and a screenshot would be a lie the
 * moment anything here moved.
 */
function Preview({
  cafe,
  emoji,
  colour,
  ink,
  onSoft,
  banner,
  cover,
  dark,
  px,
  font,
  curve,
  height,
  pattern,
  logoShape,
}: {
  cafe: Cafe;
  emoji: string;
  colour: string;
  ink: string;
  onSoft: string;
  banner: string;
  cover: string | null;
  dark: boolean;
  px: number;
  font: string;
  /** The banner's own three: its corners, its height, its texture. */
  curve: "none" | "s" | "m" | "l";
  height: "s" | "m" | "l";
  pattern: "none" | "dots" | "stripes" | "grid";
  /** Whether the logo is cut to a disc or shown whole — see LOGO_SHAPES. */
  logoShape: CardTheme["logoShape"];
}) {
  const soft = mixHex(colour, dark ? "#17141f" : "#ffffff", 0.86);
  const usePhoto = banner === "photo" && cover;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[var(--o-edge)]"
      style={{ background: dark ? "#0e0c15" : "#f6f6f8", fontFamily: font }}
    >
      <div
        className={`relative px-4 pt-4 ${{ s: "pb-3", m: "pb-5", l: "pb-8" }[height]}`}
        style={{
          color: usePhoto ? "#fff" : ink,
          backgroundColor: usePhoto ? mixHex(colour, "#000", 0.28) : colour,
          /* the preview draws the SAME layers the real banner does — the
             texture over the gradient, in the ink's own colour */
          backgroundImage: [
            usePhoto ? null : !usePhoto && pattern !== "none" ? patternLayer(pattern, ink) : null,
            usePhoto
              ? `linear-gradient(170deg, ${mixHex(colour, "#000", 0.28)}cc, #000000bf), url(${cover})`
              : banner === "flat"
                ? null
                : `linear-gradient(168deg, ${colour} 0%, ${mixHex(colour, "#000", 0.28)} 100%)`,
          ]
            .filter(Boolean)
            .join(", ") || undefined,
          backgroundSize: usePhoto
            ? "cover"
            : pattern === "none"
              ? undefined
              : patternSize(pattern),
          backgroundPosition: "center",
          borderBottomLeftRadius: CURVE_PX[curve],
          borderBottomRightRadius: CURVE_PX[curve],
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* The same component the real card uses, so "Entier" is answered
              here — where the owner is looking — rather than after a save. */}
          <ShopLogo
            url={cafe.logoUrl}
            shape={logoShape}
            emoji={emoji}
            size={36}
            tint="color-mix(in oklab, currentColor 16%, transparent)"
          />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-extrabold">{cafe.name}</span>
            <span className="block text-[10.5px] font-semibold opacity-75">145 points</span>
          </span>
        </div>
      </div>

      {/* relative + z-10, same as the real card: the banner above is positioned,
          so without it the banner paints over the top of this pass. */}
      <div className="relative z-10 px-4 pb-4" style={{ marginTop: -14 }}>
        <div
          className="flex items-center gap-3 px-3 py-2.5"
          style={{
            background: dark ? "#17141f" : "#fff",
            border: `1px solid ${dark ? "#272233" : "#ebe9ef"}`,
            borderRadius: px,
          }}
        >
          <span className="grid h-8 w-8 place-items-center rounded-md bg-[#ffffff] text-[9px] font-bold text-charcoal">
            QR
          </span>
          <span className="min-w-0">
            <span className="block text-[8.5px] font-bold uppercase tracking-[0.1em]" style={{ color: dark ? "#a9a3ba" : "#625c7d" }}>
              Mon code client
            </span>
            <span className="block font-mono text-[15px] font-extrabold" style={{ color: onSoft }}>
              84ZG
            </span>
          </span>
        </div>

        <div
          className="mt-2 flex items-center gap-2 px-3 py-2"
          style={{ background: soft, borderRadius: px * 0.8 }}
        >
          <span className="h-6 w-6 shrink-0 rounded-full" style={{ background: colour }} />
          <span className="text-[11px] font-extrabold" style={{ color: onSoft }}>
            2 récompenses à récupérer
          </span>
        </div>
      </div>
    </div>
  );
}

/** Blend two hex colours — the preview's own copy of what lib/theme computes. */
function mixHex(a: string, b: string, amount: number): string {
  const p = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return [0, 0, 0];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [x, y] = [p(a), p(b)];
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Same three numbers the stylesheet uses (globals.css, .d-banner--round-*). */
const CURVE_PX: Record<"none" | "s" | "m" | "l", number> = { none: 0, s: 16, m: 30, l: 46 };

/** Tile sizes for those layers, in the same order patternLayer emits them. */
function patternSize(kind: "dots" | "stripes" | "grid"): string {
  if (kind === "dots") return "14px 14px, auto";
  if (kind === "stripes") return "auto, auto";
  return "22px 22px, 22px 22px, auto";
}

/** The texture, as an inline layer — the preview cannot borrow a class. */
function patternLayer(kind: "dots" | "stripes" | "grid", ink: string): string {
  const tint = `color-mix(in oklab, ${ink} 14%, transparent)`;
  if (kind === "dots") return `radial-gradient(${tint} 1.5px, transparent 1.6px)`;
  if (kind === "stripes")
    return `repeating-linear-gradient(135deg, ${tint} 0 2px, transparent 2px 12px)`;
  return `linear-gradient(${tint} 1px, transparent 1px), linear-gradient(90deg, ${tint} 1px, transparent 1px)`;
}
