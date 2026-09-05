"use client";

import { useEffect, useRef, useState } from "react";
import { translator, type Lang } from "@/lib/dict";

/**
 * A camera QR reader — a bare viewfinder. The caller owns the surrounding
 * chrome, so this renders nothing but the picture and its own flip button.
 *
 * Starts on the REAR camera: a cashier points the phone at the customer's
 * screen, not at their own face. `facingMode: {ideal:"environment"}` is a hint,
 * not a guarantee — a laptop has only a front camera, and some Androids expose
 * their lenses in an order the hint can't express — so there is a flip button
 * that switches sides and restarts the stream.
 *
 * ── IT MOUNTS WITH THE SCREEN, WHICH IS WHY THE PROMPT NEEDS A BUTTON ───────
 *
 * The till used to hide this behind "Scanner le QR" and the tap bought nothing,
 * so the lens is live the moment the counter opens. That is right for the
 * hundred sales after the first one — and it is exactly what broke the
 * installed app, because a getUserMedia on mount carries NO USER GESTURE.
 *
 * A browser tab gets away with it: the permission was granted months ago on the
 * same origin, so nothing is asked. A PWA added to the home screen is a fresh
 * permission context. The first call there has to raise a prompt, a prompt with
 * no gesture behind it is suppressed, and the answer comes back exactly like a
 * phone with no camera at all. The cashier landed on the typed field with
 * "Caméra indisponible" and no way back but a reload.
 *
 * So a refusal is not the same news as an absence. `blocked` and `busy` are
 * recoverable and say so with a button — and that button is a real tap, which
 * is the whole point: it asks inside a gesture, so the prompt actually appears.
 * Only a genuine absence calls onUnavailable and sends the caller to the field.
 */

/** Why there is no picture. The kinds differ in ONE way that matters: whether
 *  the operator can do something about it. */
type Trouble = "blocked" | "busy" | "none" | "insecure";

/**
 * getUserMedia's failures all arrive as a DOMException and only the NAME
 * separates them. Collapsing them into one string is what made a permission
 * prompt indistinguishable from a back-office laptop.
 */
function classify(e: unknown): Trouble {
  if (typeof window !== "undefined" && !window.isSecureContext) return "insecure";
  if (!navigator.mediaDevices?.getUserMedia) return "none";
  const name = e instanceof DOMException ? e.name : "";
  /* SecurityError is how some browsers phrase a policy refusal. */
  if (name === "NotAllowedError" || name === "SecurityError") return "blocked";
  /* The lens exists but something else holds it — another app, or the previous
     scanner on this very screen, which does not release instantly. */
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "busy";
  /* NotFoundError, OverconstrainedError, DevicesNotFoundError: no such camera. */
  return "none";
}

export function QrScanner({
  onScan,
  onUnavailable,
  aspect = "aspect-[4/5]",
  lang = "fr",
}: {
  onScan: (text: string) => void;
  /** Called ONLY when the device genuinely has no camera. A blocked or busy
   *  lens is recoverable, and telling the caller to fall back would throw away
   *  the one screen that can still fix it. */
  onUnavailable?: () => void;
  /**
   * How tall the viewfinder is, as a Tailwind aspect class.
   *
   * 4/5 is a portrait window: right when scanning IS the screen. It is wrong
   * when the camera shares a screen with a keypad, where a tall box pushes the
   * thing being scanned for off the bottom. The video is object-cover either
   * way, so a shorter frame crops the view rather than shrinking the picture —
   * a card held up to the phone still fills it.
   */
  aspect?: string;
  /** The owner app is French; the customer's Add-card is whatever they chose. */
  lang?: Lang;
}) {
  const t = translator(lang);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanRef = useRef(onScan);
  const failRef = useRef(onUnavailable);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  /* Bumped by the retry button to re-run the effect. */
  const [attempt, setAttempt] = useState(0);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    scanRef.current = onScan;
    failRef.current = onUnavailable;
  }, [onScan, onUnavailable]);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    /*
      ONE RETRY, BUT ONLY FOR THE FAILURE THAT DESERVES ONE.

      The till keeps a viewfinder live on the screens that need one, so two of
      them can exist within a second of each other — finish a sale, go straight
      to validating a reward. The first scanner stops its tracks on unmount, but
      the release is not instantaneous, and a getUserMedia landing inside that
      window fails. That one is worth asking again.

      A refusal is NOT: re-asking a permission the browser just declined buys
      nothing, and repeating it is how an origin gets its prompt suppressed for
      good. Same for a device with no lens. Those two answer on the first try.
    */
    async function open(): Promise<MediaStream> {
      const ask = () =>
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false });
      try {
        return await ask();
      } catch (first) {
        if (classify(first) !== "busy") throw first;
        await new Promise((r) => setTimeout(r, 400));
        if (cancelled) throw first;
        return ask();
      }
    }

    async function start() {
      let jsQR: typeof import("jsqr").default;
      try {
        jsQR = (await import("jsqr")).default;
        stream = await open();
      } catch (e) {
        if (!cancelled) {
          const why = classify(e);
          setTrouble(why);
          /* Only an absence sends the caller to the typed field. A prompt that
             has not been answered yet is not an absence. */
          if (why === "none" || why === "insecure") failRef.current?.();
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setTrouble(null);
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      try {
        await v.play();
      } catch {
        /* autoplay quirks — the loop still runs once frames arrive */
      }

      const tick = () => {
        if (cancelled || !ctx) return;
        const vid = videoRef.current;
        if (vid && vid.readyState >= vid.HAVE_ENOUGH_DATA && vid.videoWidth) {
          canvas.width = vid.videoWidth;
          canvas.height = vid.videoHeight;
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            cancelled = true;
            stream?.getTracks().forEach((t) => t.stop());
            scanRef.current(code.data.trim());
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, attempt]);

  /*
    THE ASK HAPPENS HERE, INSIDE THE TAP.

    Not by bumping `attempt` and letting the effect do it: the prompt has to be
    raised while the browser still counts the click as user activation, and an
    effect is a frame later and a different call stack. So this awaits the real
    getUserMedia, throws the stream away the moment permission lands, and only
    then re-runs the effect — which now finds the permission already granted and
    opens the lens for good.
  */
  async function allow() {
    setAsking(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
        audio: false,
      });
      s.getTracks().forEach((tr) => tr.stop());
      setTrouble(null);
      setAttempt((n) => n + 1);
    } catch (e) {
      const why = classify(e);
      setTrouble(why);
      if (why === "none" || why === "insecure") failRef.current?.();
    } finally {
      setAsking(false);
    }
  }

  const say: Record<Trouble, string> = {
    blocked: t("Autorise la caméra pour scanner."),
    busy: t("La caméra est prise par une autre app."),
    none: t("Pas de caméra sur cet appareil."),
    insecure: t("La caméra a besoin d'une connexion sécurisée."),
  };
  /* The two the operator can act on. The other two are statements of fact and a
     button under them would be a lie. */
  const fixable = trouble === "blocked" || trouble === "busy";

  return (
    <div className={`relative w-full bg-black ${aspect}`}>
      <video
        ref={videoRef}
        playsInline
        muted
        /* the selfie camera is mirrored, or aiming it is disorienting */
        className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
      />
      {/* viewfinder: a bright frame, the rest dimmed by a huge spread shadow */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        {/*
          SMALLER, because it is a sight and not a shutter.

          At 62% it filled the frame and read as the thing being scanned — on
          the short band the till uses it was a white box with a face in it. The
          decoder reads the WHOLE video either way; this rectangle only tells a
          hand where to hold the card, so it can be modest.
        */}
        <div className="h-[52%] w-[42%] min-w-[104px] rounded-2xl border-2 border-white/80 shadow-[0_0_0_2000px_rgba(0,0,0,.42)]" />
      </div>

      {/* Hidden while there is nothing to see: flipping a dead lens is noise. */}
      {!trouble && (
        <button
          type="button"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          aria-label="Changer de caméra"
          className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-[18px] text-white backdrop-blur active:scale-95"
        >
          ⟳
        </button>
      )}

      {/*
        COVERS THE FRAME, rather than sitting in a strip along the bottom.

        The old line lived under a black rectangle that still looked like a
        camera warming up, so the message read as a caption on a working
        viewfinder. There is no picture here; the panel should say so with the
        whole space, and put the way out in the middle of it.
      */}
      {trouble && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 px-4 text-center">
          <div>
            {/*
              role="status", NOT role="alert", and data-camera so a suite can
              name it. [role=alert] in this app means "the form refused what you
              just did" — the till waits on exactly that to prove a bad amount is
              rejected. A camera message wearing the same role answered that wait
              instead, and a working refusal read as broken. The lens having no
              picture is a state of the screen, not a verdict on an act.
            */}
            <p
              role="status"
              data-camera={trouble}
              className="text-[13px] font-bold leading-snug text-white"
            >
              {say[trouble]}
            </p>
            {fixable && (
              <button
                type="button"
                onClick={allow}
                disabled={asking}
                className="mt-2.5 rounded-full bg-white px-4 py-2 text-[13px] font-extrabold text-black active:scale-95 disabled:opacity-70"
              >
                {asking ? "…" : trouble === "blocked" ? t("Autoriser") : t("Réessayer")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
