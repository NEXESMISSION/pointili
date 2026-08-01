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
    <div className="safe-t safe-b a-shell flex min-h-dvh flex-col items-center px-5 [--safe-pb:2.25rem] [--safe-pt:2.25rem]">
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
      {/*
        A named way back to the site.

        The mark above has always been a link, but a logo is not an exit — it is
        decoration until you happen to try it. Somebody who arrives on this
        screen and decides they want to read about the product first, or who
        landed here by mistake, had nothing to press.

        An explicit LINK, not the shared BackLink: that one calls router.back()
        first, and the commonest way to arrive here is the (app) layout guard
        bouncing you off /owner — so "back" lands on /owner, which bounces you
        straight here again. A loop, from a button whose whole job is escape.

        ?pro=1 because "/" returns a signed-in owner to their till and a
        signed-in diner to their wallet; a stale cookie on this very screen is
        the normal case, not the odd one.
      */}
      <div className="mb-4 w-full max-w-[400px]">
        <Link
          href="/?pro=1"
          className="-ml-2 inline-flex items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3 text-[13px] font-semibold text-white/55 transition hover:bg-white/[0.07] hover:text-white/85"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Retour au site
        </Link>
      </div>

      <Link href="/?pro=1" className="mb-7 inline-flex">
        <BrandLockup size={40} />
      </Link>
      <div className="w-full max-w-[400px]">{children}</div>
    </div>
  );
}
