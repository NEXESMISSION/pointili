/*
  The smallest service worker that makes Pointili installable, and nothing more.

  Chrome will not offer to install a site without a service worker that handles
  `fetch`. That is the entire job here. It is NOT a caching layer, and the
  restraint is the design:

  Pointili is a points ledger. Every screen a customer or a cashier looks at is a
  live balance, and a cached one is worse than no screen at all — a cashier
  reading a stale "Solde 70 points" would credit or refuse against a number that
  is no longer true. So HTML and every API/action response go straight to the
  network, always.

  The second reason is operational. A service worker that caches an app shell
  outlives the deploy that fixed it: it keeps serving yesterday's JavaScript to a
  phone that has already downloaded today's, and the only way out is a version
  bump the user has to trigger by closing every tab. At three real accounts, with
  the test database being production, that risk buys nothing.

  So: pass everything through, precache one offline page, and serve it only when
  the network genuinely is not there.
*/

const VERSION = "pointili-v1";
const OFFLINE_URL = "/hors-ligne.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"])),
  );
  // Take over immediately rather than waiting for every tab to close — there is
  // no cached app shell here, so there is no old version to conflict with.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any cache from an older VERSION, so a rename is a real reset.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever touch top-level navigations. Everything else — JS, CSS, images,
  // server actions, Supabase — is left entirely alone.
  if (request.mode !== "navigate" || request.method !== "GET") return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        // Genuinely offline (a thrown fetch, not a 4xx/5xx — those are real
        // answers from the server and must be shown as-is).
        const cache = await caches.open(VERSION);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }
    })(),
  );
});
