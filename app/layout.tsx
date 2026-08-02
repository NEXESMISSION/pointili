import type { Metadata, Viewport } from "next";
import { DESCRIPTION, KEYWORDS, SITE_NAME, SITE_URL, TAGLINE } from "@/lib/seo";
import { Fraunces, Space_Mono, Inter, Poppins } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import { Track } from "@/components/Track";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "900"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  /*
    400 and 700 are the ONLY weights Space Mono ships. Anything heavier is
    synthesised by the browser, and at the sizes the customer's 4-character code
    is drawn (13–34px) the fake bold smears the wide glyphs — M and W fill in
    solid. Four independent walkthroughs of the app failed to read a code for
    exactly this reason ("E A ▮ ▮"), on the one string a customer has to say out
    loud at a counter. Every code chip is font-bold, never font-extrabold.
  */
  weight: ["400", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  /*
    NO weight list, on purpose — that loads Inter's VARIABLE font, which covers
    100–900 in a single file.

    Pinning it to 400/500/600/700 meant every `font-extrabold` that resolved to
    Inter got a browser-synthesised bold: the brand wordmark ".online" in every
    header, and the primary button on both auth screens. Fake bold is the same
    defect that made the customer's 4-character code unreadable (see Space Mono
    below) — it thickens strokes until counters close up.

    One variable file is also fewer requests than four static cuts, so this is
    cheaper as well as correct. Poppins stays pinned: it is not variable on
    Google Fonts, so it has to name its weights.
  */
});

// The brand's display face (marketing + admin, the "modern" surfaces).
const poppins = Poppins({
  variable: "--font-poppins-var",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

/*
  The default title said "Drink. Earn. Play. Win." and the description promised
  "jeux" — both left over from the prize wheel, which is not part of the product
  and has not been for some time. A stale title is not cosmetic: it is what a
  search result and an AI answer both quote.

  metadataBase matters more than it looks. Without it every Open Graph and
  canonical URL is emitted relative, which means a shared link has no image and
  a crawler cannot resolve the canonical. Set NEXT_PUBLIC_SITE_URL to the host
  that does NOT redirect — the apex 308s to www, so it is the www one.
*/
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  keywords: KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: { canonical: "/" },
  category: "business",
  openGraph: {
    type: "website",
    locale: "fr_TN",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  formatDetection: { telephone: false },
  /*
    The iOS half of "add to home screen".

    Android reads display/theme/icons out of the manifest. Safari reads some of
    it, but the installed-app behaviour still hangs off these meta tags: without
    `capable` an installed icon can reopen inside Safari chrome, which defeats
    the point. `title` is what shows UNDER the icon on the home screen — the full
    "Pointili — la carte de fidélité…" would be truncated to nonsense there.

    statusBarStyle black-translucent so the dark app paints under the notch
    rather than sitting below a white bar.
  */
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  manifest: "/manifest.webmanifest",
};

// Mobile-only mandate (§01): lock the viewport to phone width.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#5b3fd1",
  /*
    THE LINE THAT MAKES THE SAFE AREAS REAL.

    BottomNav and OwnerTabs have carried pb-[env(safe-area-inset-bottom)] all
    along and it did nothing: without viewport-fit=cover the browser keeps the
    layout inside the safe area itself and every env(safe-area-inset-*) resolves
    to 0px. In a normal tab that is invisible, because the browser chrome is
    doing the insetting.

    Installed to a home screen there IS no browser chrome, so the page owns the
    whole display — and the status bar / notch sat on top of the header while the
    home indicator sat on top of the tab bar. Which is exactly the cropping the
    owner reported, top AND bottom.

    Turning it on hands us the full screen and makes the env() values non-zero;
    the padding those bars already had then starts working, and .safe-t /
    .safe-b in globals.css handle the top.
  */
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${fraunces.variable} ${spaceMono.variable} ${inter.variable} ${poppins.variable}`}
    >
      {/*
        No shell here. The mobile-only mandate (§01) governs the *app*, so the
        phone column is applied by app/[slug] and app/owner. The marketing
        landing page is explicitly outside the app and lays out full-width.
      */}
      <body>
        {children}
        {/* Registers the service worker for the whole origin, which is what
            makes the site installable. Renders nothing. */}
        <ServiceWorker />
        {/* One anonymous beacon per visit, so the console can tell whether an
            ad brought anybody. No id, no account, no page trail — see
            components/Track.tsx. Renders nothing. */}
        <Track />
      </body>
    </html>
  );
}
