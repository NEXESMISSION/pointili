import type { Metadata, Viewport } from "next";
import { DESCRIPTION, KEYWORDS, SITE_NAME, SITE_URL, TAGLINE } from "@/lib/seo";
import { Fraunces, Space_Mono, Inter, Poppins } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "900"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
};

// Mobile-only mandate (§01): lock the viewport to phone width.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#5b3fd1",
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
      <body>{children}</body>
    </html>
  );
}
