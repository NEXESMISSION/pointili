"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A camera QR reader. Streams the rear camera into a hidden canvas and decodes
 * frames with jsQR (dynamically imported, so its ~40 KB only loads when a cashier
 * actually scans). Calls onScan once with the decoded text, then stops.
 *
 * Fails soft: if the camera is blocked or unavailable, it says so — the caisse
 * always keeps a manual ID/number field as the fallback.
 */
export function QrScanner({
  onScan,
  onClose,
}: {
  onScan: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      let jsQR: typeof import("jsqr").default;
      try {
        jsQR = (await import("jsqr")).default;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        if (!cancelled) setError("Caméra indisponible — saisissez l'ID à la place.");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
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
            onScan(code.data.trim());
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
  }, [onScan]);

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-hair bg-charcoal">
      <div className="relative aspect-square w-full">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {/* viewfinder */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-2/3 w-2/3 rounded-2xl border-2 border-white/80 shadow-[0_0_0_2000px_rgba(0,0,0,.35)]" />
        </div>
      </div>
      {error && <p className="px-4 py-2.5 text-center text-[12.5px] font-semibold text-white">{error}</p>}
      <button
        type="button"
        onClick={onClose}
        className="w-full border-t border-white/15 py-3 text-[13px] font-bold text-white active:bg-white/10"
      >
        Fermer
      </button>
    </div>
  );
}
