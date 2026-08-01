"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js, once, for the whole origin — and keeps it honest.
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
 * STAYING FRESH BY ITSELF
 *
 * An installed app has no reload button and nobody to press it. Three things
 * here make "close it and open it again" unnecessary — which matters because
 * that instruction is useless to a shop owner mid-service, and because a
 * standalone window is often never closed at all.
 *
 * Renders nothing. Failure is silent by design: an unregistrable worker costs
 * the install offer and nothing else, and the app must not care.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    /*
      1 · updateViaCache: "none".

      By default a browser may serve /sw.js itself from the HTTP cache for up to
      24 hours. That is the version bump that never lands: a deploy fixes the
      worker, and every phone that already has one keeps the old one for a day
      because it never re-fetches the script to notice. "none" forces the
      script (and its imports) to be checked against the network every time.
    */
    let reg: ServiceWorkerRegistration | null = null;
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((r) => {
        reg = r;
      })
      .catch(() => {});

    /*
      2 · Ask again whenever the app comes back to the foreground.

      A browser only checks for a new worker on navigation, and an installed PWA
      that lives on a home screen can go days without one — the owner switches to
      it, takes a payment, switches away. This is the moment they are looking at
      it, so it is the moment worth checking.
    */
    const onVisible = () => {
      if (document.visibilityState === "visible") reg?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    /*
      3 · When a NEW worker takes over, reload once.

      sw.js calls skipWaiting() + clients.claim(), so a new worker controls the
      page the moment it activates — but the page itself is still running the
      markup and scripts it loaded before that. Reloading here is what turns a
      deploy into something the user actually has.

      Guarded twice. `had` is false on the very first registration (there was no
      controller to change FROM) and reloading then would bounce every
      first-time visitor for nothing. `done` makes it once per page, because a
      reload can itself trigger another controllerchange and two guards are
      cheaper than an infinite refresh loop on somebody's till.
    */
    const had = Boolean(navigator.serviceWorker.controller);
    let done = false;
    const onController = () => {
      if (!had || done) return;
      done = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
    };
  }, []);

  return null;
}
