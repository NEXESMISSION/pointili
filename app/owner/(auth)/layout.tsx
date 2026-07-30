import Link from "next/link";
import { BrandLockup } from "@/components/BrandMark";

/**
 * Public auth shell — deliberately OUTSIDE app/owner/(app)/layout.tsx, whose
 * guard redirects here. Nesting these under the guard would be an infinite
 * redirect loop.
 *
 * Modern, friendly: the brand on a soft lilac field, a single centered card
 * (each page fills it), matching the royal / a-card system used everywhere else.
 */
export default function OwnerAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="safe-t safe-b a-shell flex min-h-dvh flex-col items-center px-5 py-9">
      {/*
        The mark sits on PAPER, not straight on the page.

        The artwork is a purple card on a transparent background, and .a-shell is
        #08040f under a purple gradient — so purple-on-purple made the mark
        effectively invisible next to a crisp white wordmark. The fix is not to
        recolour the brand: it is to give it the same light tile it already wears
        as an app icon. Two wins for one change — it reads on any background, and
        the sign-in screen now looks like the icon the owner just installed on
        their home screen.

        Same tile as components/InstallPrompt.tsx and the same #f8f7fc as
        scripts/icons.mjs, so all three are one object.
      */}
      <Link href="/" className="mb-7 mt-2 inline-flex">
        <BrandLockup size={40} />
      </Link>
      <div className="w-full max-w-[400px]">{children}</div>
    </div>
  );
}
