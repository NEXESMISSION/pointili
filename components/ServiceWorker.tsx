"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js, once, for the whole origin.
 *
 * Separate from InstallPrompt on purpose. The worker is what makes the SITE
 * installable — Chrome will not offer to install an origin whose worker does not
 * handle `fetch` — and that has to be true on every page, including the landing
 * and /cartes. The prompt is only the UI that ASKS, and it deliberately appears
 * on a couple of screens and on phones only.
 *
 * They were one component at first, which quietly meant the worker was only ever
 * registered on /[slug] and /owner: a customer sitting on their wallet, the most
 * likely place to install from, had nothing registered at all.
 *
 * Renders nothing. Failure is silent by design: an unregistrable worker costs the
 * install offer and nothing else, and the app must not care.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
