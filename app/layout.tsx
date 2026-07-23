import type { Metadata, Viewport } from "next";
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

export const metadata: Metadata = {
  title: {
    default: "pointili.online — Drink. Earn. Play. Win.",
    template: "%s · pointili.online",
  },
  description:
    "Le programme de fidélité qui transforme vos clients de passage en habitués. Points, jeux et récompenses — sans app à installer.",
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
