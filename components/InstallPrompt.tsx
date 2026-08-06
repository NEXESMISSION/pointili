"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";

/**
 * "Add Pointili to your home screen" — and the two platforms need opposite
 * things.
 *
 * ANDROID / Chrome fires `beforeinstallprompt`. Catching it and calling
 * `prompt()` later gives the real OS install sheet, which is one tap and looks
 * like installing an app. That is the whole flow.
 *
 * iOS / Safari has no such event and no API: Apple only allows install from the
 * Share sheet, by hand. There is nothing to call, so the only honest thing is to
 * SHOW the three steps. Pretending otherwise — a button that does nothing, or
 * one that opens a help page — is worse than saying it plainly.
 *
 * WHY IT ALSO MOUNTS ON THE OWNER SIDE. The cashier's till is the screen used
 * hundreds of times a week, always on the same phone, always in a hurry. An
 * installed icon removes the address bar and the "which tab was it" problem, so
 * it matters more there than on the customer side.
 *
 * WHAT IT MUST NEVER DO
 *   - appear when the app is already installed (display-mode: standalone)
 *   - appear again after being dismissed (localStorage, per surface)
 *   - appear on a desktop browser — nobody adds a till to a laptop dock, and the
 *     bar would sit over the content of a screen that has room to spare
 *   - block anything: it is a bar at the bottom, above the tab bar, dismissible
 */

const DISMISS_KEY = "pointili_install_dismissed";

/** Standalone means it is already installed — iOS uses a non-standard flag. */
function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- iOS-only, not in lib.dom
    (window.navigator as any).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac, so touch points are the tell.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

type Deferred = Event & { prompt: () => Promise<void> };

export function InstallPrompt({
  /** Where it is mounted, so the copy can name the right thing. */
  audience,
}: {
  audience: "client" | "owner";
}) {
  const [deferred, setDeferred] = useState<Deferred | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [gone, setGone] = useState(true);

  useEffect(() => {
    const eligible = () =>
      !isInstalled() &&
      !localStorage.getItem(DISMISS_KEY) &&
      // Phones only. matchMedia rather than a width check: a narrow desktop
      // window is still a desktop, and nobody docks a till on a laptop.
      window.matchMedia("(max-width: 900px)").matches;

    const onPrompt = (e: Event) => {
      // Without this Chrome shows its own mini-infobar as well as ours.
      e.preventDefault();
      if (!eligible()) return;
      setDeferred(e as Deferred);
      setGone(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const onInstalled = () => setGone(true);
    window.addEventListener("appinstalled", onInstalled);

    /*
      Deliberately late, and deliberately in a timer rather than in the effect
      body. Two reasons, and they happen to agree:

      - a bar that slides in over the first paint reads as an advert, and this is
        the first thing a customer sees after scanning a QR at a table. Let them
        look at their points first.
      - the environment reads above (display-mode, localStorage, matchMedia) only
        exist on the client, so they cannot run during render — and setting state
        straight from an effect body is what react-hooks/set-state-in-effect
        forbids. A callback is the honest place for both.

      iOS is checked here because Safari never fires beforeinstallprompt: there is
      no event to wait for, so the only trigger is us deciding to ask.
    */
    const t = setTimeout(() => {
      if (!eligible()) return;
      if (isIos()) {
        setShowIos(true);
        setGone(false);
      }
    }, 1800);

    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setGone(true);
  }

  // Nothing to offer: not a phone, already installed, dismissed, or an Android
  // browser that has not (yet) said the app is installable.
  if (gone || (!deferred && !showIos)) return null;

  const what = audience === "owner" ? "Ma caisse" : "Ma carte";
  /*
    The two apps no longer share a surface: the till is a dark terminal and the
    customer's app is white. A single dark toast was fine when both were dark;
    on the client it now lands as a black slab over a white page.
  */
  const dark = audience === "owner";
  const panel = dark
    ? "border-white/12 bg-[#181031]/95 text-white"
    : "border-[#ebe9ef] bg-white/95 text-charcoal";
  const sub = dark ? "text-white/50" : "text-slate";
  const cta = dark
    ? "bg-[#7c3aed] text-white"
    : "text-[var(--cafe-ink)] [background:var(--cafe)]";

  return (
    <>
      {/*
        The offset clears the diner's BottomNav and the owner's nav, both of
        which are fixed — plus the home indicator, since installed there is no
        browser chrome holding anything clear of it. pointer-events-none on the wrapper so the gap either
        side of the bar never swallows a tap meant for the page.
      */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-40 flex justify-center px-3">
        <div
          className={`pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-[0_16px_40px_-16px_rgba(23,18,31,.5)] backdrop-blur ${panel}`}
        >
          <BrandMark size={40} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[13.5px] font-bold">
              Ajouter à l&apos;écran d&apos;accueil
            </span>
            <span className={`block truncate text-[11.5px] ${sub}`}>
              « {what} » — sans store, sans installation
            </span>
          </span>
          {deferred ? (
            <button
              type="button"
              onClick={async () => {
                // One shot: the event cannot be reused, so drop it either way.
                const e = deferred;
                setDeferred(null);
                setGone(true);
                await e.prompt().catch(() => {});
              }}
              className={`shrink-0 rounded-full px-4 py-2 text-[12.5px] font-bold active:scale-95 ${cta}`}
            >
              Ajouter
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setHowTo(true)}
              className={`shrink-0 rounded-full px-4 py-2 text-[12.5px] font-bold active:scale-95 ${cta}`}
            >
              Comment ?
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Masquer"
            className={`-mr-1 shrink-0 px-1.5 text-[18px] leading-none ${sub}`}
          >
            ×
          </button>
        </div>
      </div>

      {/* iOS: the Share-sheet route, spelled out. There is no API to call. */}
      {howTo && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 pb-5 lg:items-center lg:pb-5"
          onClick={() => setHowTo(false)}
        >
          <div
            className={`w-full max-w-[420px] rounded-3xl border p-5 ${panel}`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[16px] font-extrabold">Ajouter à l&apos;écran d&apos;accueil</p>
            <p className={`mt-1 text-[12.5px] leading-relaxed ${sub}`}>
              Sur iPhone, c&apos;est Safari qui installe — en trois gestes.
            </p>
            <ol className="mt-4 space-y-3">
              {[
                ["1", "Touche le bouton Partager", "en bas de Safari — le carré avec une flèche vers le haut."],
                ["2", "Fais défiler et choisis « Sur l'écran d'accueil »", "dans la liste des options."],
                ["3", "Touche « Ajouter »", "en haut à droite. L'icône Pointili apparaît avec tes autres apps."],
              ].map(([n, title, hint]) => (
                <li key={n} className="flex gap-3">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12.5px] font-bold ${dark ? "bg-white/12" : "bg-[#f2f1f5]"}`}>
                    {n}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-bold leading-snug">{title}</span>
                    <span className={`block text-[12px] leading-snug ${sub}`}>{hint}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className={`mt-4 rounded-xl px-3.5 py-2.5 text-[11.5px] leading-relaxed ${dark ? "bg-white/[0.06]" : "bg-[#f2f1f5]"} ${sub}`}>
              Si tu ne vois pas « Sur l&apos;écran d&apos;accueil », ouvre cette page
              dans Safari : Chrome et les autres navigateurs iOS ne peuvent pas
              installer.
            </p>
            <button
              type="button"
              onClick={() => setHowTo(false)}
              className={`mt-4 w-full rounded-2xl py-3 text-[13.5px] font-bold ${cta}`}
            >
              C&apos;est fait
            </button>
          </div>
        </div>
      )}
    </>
  );
}
