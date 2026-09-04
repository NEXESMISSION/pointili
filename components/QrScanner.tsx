"use client";

import { useEffect, useRef, useState } from "react";

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
 * Only mounted once the operator asks for it: getUserMedia lights the lens and
 * (on first use) raises a permission prompt, and neither should happen just
 * because someone opened the till.
 *
 * Fails soft: if the camera is blocked or missing it says so and calls
 * onUnavailable, so the caller can fall back to typing.
 *
 * The callbacks are held in refs on purpose. The parent re-renders often
 * (recents polling, transitions); putting onScan in the effect deps would tear
 * the camera down and restart it on every one of those renders.
 */
export function QrScanner({
  onScan,
  onUnavailable,
  aspect = "aspect-[4/5]",
}: {
  onScan: (text: string) => void;
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
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanRef = useRef(onScan);
  const failRef = useRef(onUnavailable);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState("");

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
      ONE RETRY, BECAUSE THE LAST LENS MAY NOT HAVE LET GO YET.

      The till now keeps a viewfinder live on the screens that need one, so two
      of them can exist within a second of each other — finish a sale, go
      straight to validating a reward. The first scanner stops its tracks on
      unmount, but the release is not instantaneous, and a getUserMedia landing
      inside that window fails with the same error as "this device has no
      camera". Treating those two as the same thing is what put a cashier on the
      typed field for the rest of the visit, on a phone whose camera was
      perfectly fine.

      So the first failure is not an answer. A short wait, one more attempt, and
      only then is the camera genuinely unavailable.
    */
    async function open(): Promise<MediaStream> {
      const ask = () =>
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false });
      try {
        return await ask();
      } catch (first) {
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
      } catch {
        if (!cancelled) {
          setError("Caméra indisponible");
          failRef.current?.();
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setError("");
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
  }, [facing]);

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

      <button
        type="button"
        onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
        aria-label="Changer de caméra"
        className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-[18px] text-white backdrop-blur active:scale-95"
      >
        ⟳
      </button>

      {error && (
        <p className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-center text-[13px] font-bold text-white">
          {error}
        </p>
      )}
    </div>
  );
}
