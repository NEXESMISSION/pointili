import type { MetadataRoute } from "next";
import { DESCRIPTION, SITE_NAME, TAGLINE } from "@/lib/seo";

/**
 * What Android and iOS need in order to put Pointili on a home screen.
 *
 * This is the whole reason the product can be installed at all — without a
 * manifest a browser has nothing to install, and Chrome will not fire
 * `beforeinstallprompt`. The other half is a service worker with a fetch
 * handler (public/sw.js, registered in components/InstallPrompt.tsx).
 *
 * DELIBERATE CHOICES
 *
 * start_url "/" — not /cartes and not /owner. One installed icon has to serve
 * both audiences, and "/" already routes each of them correctly: a phone
 * holding a diner cookie lands on its wallet, an owner session lands on the
 * marketing page with its own door, and a stranger gets the sales page. Hard
 * wiring either side would give the wrong person the wrong app.
 *
 * display "standalone" — no browser chrome. The whole pitch to a shop is "sans
 * application", and an installed card that still shows an address bar looks
 * like a bookmark rather than the thing it replaced.
 *
 * TWO icon entries per size, one "any" and one "maskable". Android crops a
 * maskable icon to the launcher's shape and only guarantees the inner 80%; a
 * plain icon used as maskable gets its corners eaten. Listing both lets each
 * platform pick the one it can honour.
 *
 * NO screenshots and NO shortcuts. Both are real manifest features and both
 * would be fiction here: shortcuts would name screens that depend on who is
 * signed in, and screenshots would be of a test café.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${TAGLINE}`,
    short_name: SITE_NAME,
    description: DESCRIPTION,
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    /* The install splash and the Android task-switcher tint. #07030f is
       DINER_BG's base (lib/brand.ts) so the launch screen and the app's first
       paint are the same colour and there is no white flash between them. */
    background_color: "#07030f",
    theme_color: "#5b3fd1",
    categories: ["business", "food", "shopping"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
