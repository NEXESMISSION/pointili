/**
 * What the customer sees while the next screen is being fetched.
 *
 * WHY THIS FILE EXISTS AT ALL. Every route under /[slug] is server-rendered per
 * request — the balance has to be true, so it cannot be static — and there was
 * no Suspense boundary anywhere in the app. In the App Router that means a tab
 * tap BLOCKS: the tab lights up (BottomNav does that with useLinkStatus) and
 * then the old page just sits there, complete and looking interactive, until
 * the server answers. People tap again, and the second tap lands on the screen
 * they were leaving.
 *
 * This file turns that dead time into a paint. The layout — shop header, top
 * bar, bottom nav — is untouched by a sibling navigation, so only the content
 * column swaps, and it swaps to something the right shape.
 *
 * ONE FILE FOR THE WHOLE SECTION, on purpose. A loading.tsx covers its segment
 * and every child that has not got its own, so this stands in for the card, the
 * rewards list, the codes and the history alike. That argues for a shape that
 * is honest about all of them rather than a pixel-perfect copy of one: a
 * heading, a big block, then rows. Every one of those screens is that. A
 * skeleton that mimics ONE of them precisely would be a small lie on the other
 * three, and lying about the layout is what makes a skeleton feel cheap — the
 * content lands somewhere other than where the grey said it would.
 *
 * SILENT ON PURPOSE. The whole block is aria-hidden and carries no text. A live
 * region saying "Chargement…" would have to pick a language here — and this
 * file must stay synchronous to be the instant fallback it exists to be, so it
 * cannot read the language cookie to find out which. Next's own route announcer
 * already reads the new page when it lands, which is the thing worth hearing.
 */
export default function Loading() {
  return (
    <div className="sk-page flex flex-1 flex-col px-5 pb-6" aria-hidden>
      {/* the line the real screens open with */}
      <div className="sk mt-3 h-[13px] w-[62%] rounded-[7px]" />

      {/* the card / balance block: the tallest thing on every screen here */}
      <div className="sk mt-4 h-[168px] w-full rounded-[22px]" />

      {/* and then rows — rewards, codes and history entries are all rows */}
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="sk h-[76px] w-full rounded-[18px]"
            /*
              Offsets the SHEEN, not the block. The sweep lives on .sk::after,
              which an inline style cannot reach, so the delay travels as a
              custom property the pseudo-element reads. Setting animationDelay
              here directly would have been silently inert — .sk itself has no
              animation to delay.
            */
            style={{ ["--sk-delay" as string]: `${i * 90}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
