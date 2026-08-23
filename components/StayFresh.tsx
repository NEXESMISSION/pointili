"use client";

import { useEffect } from "react";

/**
 * THE APP REPAIRS ITSELF AFTER A DEPLOY. Nobody clears a cache.
 *
 * ── THE PROBLEM, EXACTLY ──────────────────────────────────────────────────
 *
 * Every HTML response Pointili sends is `no-store`, so a NAVIGATION always
 * lands on the new deploy and no browser reuses a page across sessions. That
 * part was never broken.
 *
 * What is broken is the tab that is already open. After the first load this is
 * a single page: the till behind a counter and an installed PWA window are the
 * same document for a whole shift, sometimes for days, running the JavaScript
 * they launched with and fetching only RSC payloads. They never ask for HTML
 * again, so they never learn that anything changed.
 *
 * And it does not stay merely stale. The next deploy deletes the content-hashed
 * chunks the old bundle still refers to, so the first screen that needs one
 * dies with a ChunkLoadError — a blank or broken page, mid-service, that only a
 * hard refresh fixes. "Clear your cache" is the instruction nobody can act on
 * with a queue in front of them.
 *
 * sw.js does not cover this and never claimed to: it caches nothing but the
 * offline page, and the reload it performs fires on `controllerchange` — when a
 * NEW WORKER takes over. sw.js is a static file that does not change between
 * deploys, so on an ordinary release that event never happens.
 *
 * ── TWO NETS ──────────────────────────────────────────────────────────────
 *
 * 1 · THE POLITE ONE. When the app comes back to the foreground it asks
 *     /api/version which build is serving. Different id ⇒ reload.
 *
 * 2 · THE LAST-RESORT ONE. If a chunk fails to load, the app is already broken;
 *     reload immediately, because there is nothing to protect any more.
 *
 * ── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
 *
 * RELOAD OVER SOMEBODY'S WORK. A cashier who has keyed 47,500 and glanced at
 * another app must not come back to an empty box, and a receipt or a fiche on
 * screen is a thing being read. So the polite net waits for a moment when there
 * is demonstrably nothing to lose — no dialog open, no text typed into any
 * field — and simply asks again next time. A till that is being used constantly
 * updates the moment it is put down, which is the same minute either way.
 *
 * AND IT WILL NOT LOOP. A reload is recorded against the version it was for, in
 * sessionStorage, and never repeated for that version. If the comparison were
 * somehow wrong — a misconfigured id, a proxy answering for another
 * deployment — the worst case is ONE extra reload per tab, not a device
 * refreshing itself forever behind a counter.
 */

const KEY = "pointili_fresh_for";
const MINE = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

/** Have we already reloaded this tab because of that version? */
function alreadyDone(version: string): boolean {
  try {
    return sessionStorage.getItem(KEY) === version;
  } catch {
    /* Private mode, or storage disabled. Refusing to reload is the safe way to
       be wrong: stale beats a loop. */
    return true;
  }
}

function remember(version: string) {
  try {
    sessionStorage.setItem(KEY, version);
  } catch {
    /* ignore — the guard above already treats this as "do not reload" */
  }
}

/**
 * Is there anything on screen that a reload would destroy?
 *
 * Deliberately crude and DOM-wide rather than a store the screens have to
 * remember to update: any dialog (a receipt, a customer's fiche, the confirm
 * sheets) and any field somebody has typed into. Both are cheap to read and
 * neither can be forgotten by a new screen added later, which a registry of
 * "busy" flags certainly would be.
 */
function safeToReload(): boolean {
  if (document.querySelector('[role="dialog"]')) return false;
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  for (const f of fields) {
    if (f.type === "hidden") continue;
    if (f.value) return false;
  }
  return true;
}

export function StayFresh() {
  useEffect(() => {
    let stopped = false;

    const refresh = (version: string) => {
      if (alreadyDone(version)) return;
      remember(version);
      /*
        reload() and nothing more. The document is `no-store`, so there is no
        cached copy to defeat and no cache-busting query to add — and adding one
        would put ?v= in the address bar of a shop's own till forever.
      */
      window.location.reload();
    };

    /* ── net 1: a new deploy, noticed when the app is picked back up ── */
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (!safeToReload()) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        /* An unknown or matching id is not a reason to do anything. Only a
           different, non-empty one is. */
        if (!build || build === MINE) return;
        if (!safeToReload()) return; // it can change during the round trip
        refresh(build);
      } catch {
        /* Offline, or the route is missing on an older server. Either way the
           app keeps working exactly as it did before this file existed. */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    /* ── net 2: the bundle is already broken ── */
    const looksLikeAMissingChunk = (text: string) =>
      /ChunkLoadError|Loading chunk \S+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
        text,
      );

    const onError = (e: ErrorEvent) => {
      if (looksLikeAMissingChunk(e.message ?? "")) refresh(`chunk:${MINE}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string } | string | undefined;
      const text = typeof r === "string" ? r : (r?.message ?? "");
      if (looksLikeAMissingChunk(text)) refresh(`chunk:${MINE}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
