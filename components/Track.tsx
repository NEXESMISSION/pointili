"use client";

import { useEffect } from "react";

/**
 * One beacon per visit, so the console can tell whether an ad did anything.
 *
 * It reports a random session id, the page landed on, the referrer, the utm
 * tags a campaign puts in its own links, and a device bucket. It does NOT
 * report who anybody is: there is no id, no account, no page trail, and the
 * server throws the referrer away except for its host.
 *
 * THE SESSION ID LIVES IN sessionStorage, NOT localStorage.
 *
 * That is the whole privacy design in one line. sessionStorage dies with the
 * tab, so the id cannot follow somebody across days and cannot be joined up
 * into a history of one person. It lasts exactly long enough to measure one
 * visit, which is all the question needs.
 *
 * TWO BEACONS, NOT A TIMER. One when the page opens, one when it is hidden or
 * closed — the difference between the two timestamps IS the dwell time, and it
 * needs no polling, no interval, and nothing running while somebody reads.
 */

const KEY = "pointili.visit";

function device(): "mobile" | "tablet" | "desktop" {
  /* by viewport, not by user agent: the string is fingerprintable and the
     number is what actually decides how the page looks */
  const w = Math.min(window.innerWidth, window.innerHeight);
  if (w < 480) return "mobile";
  if (w < 900) return "tablet";
  return "desktop";
}

function side(path: string): "landing" | "diner" | "owner" {
  if (path.startsWith("/owner") || path.startsWith("/admin")) return "owner";
  /* /early is a marketing page for SHOPS, not a diner's card. Without it named
     here the fallback below filed every early-access visitor under "diner",
     because the rule is "anything with a path segment is a shop's page" — which
     is true of /cafe-el-manar and of nothing else on this list. It also makes
     the visit countable against the leads it produced: admin_early_access_stats
     divides submissions by sessions whose ENTRY path was this page. */
  if (path === "/" || path === "" || path === "/early") return "landing";
  return "diner";
}

export function Track() {
  useEffect(() => {
    let id: string;
    try {
      id = sessionStorage.getItem(KEY) ?? "";
      if (!id) {
        id = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
        sessionStorage.setItem(KEY, id);
      }
    } catch {
      /* storage blocked (private mode, embedded webview) — measure nothing
         rather than fall back to something that persists longer */
      return;
    }

    const url = new URL(window.location.href);
    const q = url.searchParams;
    const path = url.pathname;

    /* Only the FIRST beacon of a session carries the arrival details. A later
       one re-sending them would overwrite the entry page with wherever they
       have wandered to, and turn a referral into "direct". */
    const first = !sessionStorage.getItem(KEY + ".sent");
    const body: Record<string, unknown> = { s: id };
    if (first) {
      Object.assign(body, {
        p: path,
        r: document.referrer || null,
        us: q.get("utm_source"),
        um: q.get("utm_medium"),
        uc: q.get("utm_campaign"),
        d: device(),
        side: side(path),
      });
      try { sessionStorage.setItem(KEY + ".sent", "1"); } catch { /* ignore */ }
    }

    /*
      A brand-new card is the signal that this visit converted. The wallet is
      where a diner lands the moment their account exists, so arriving there
      inside the same session is the closest honest proxy for "signed up" that
      does not involve telling the analytics table who they are.
    */
    if (path === "/cartes" || path.endsWith("/rejoindre/fait")) body.up = true;

    const send = (payload: Record<string, unknown>, beacon = false) => {
      const json = JSON.stringify(payload);
      if (beacon && navigator.sendBeacon) {
        /* text/plain: anything else makes it a CORS preflight, which an
           unloading page never survives */
        navigator.sendBeacon("/api/visit", new Blob([json], { type: "text/plain" }));
        return;
      }
      fetch("/api/visit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: json,
        keepalive: true,
      }).catch(() => { /* a lost visit is not worth a console error */ });
    };

    send(body);

    /*
      visibilitychange, not beforeunload. beforeunload never fires on mobile
      Safari when the tab is swiped away, which is most of this audience — the
      dwell time for every phone visitor would have been the moment they
      arrived and nothing else.
    */
    const close = () => {
      if (document.visibilityState === "hidden") send({ s: id }, true);
    };
    document.addEventListener("visibilitychange", close);
    return () => document.removeEventListener("visibilitychange", close);
  }, []);

  return null;
}
