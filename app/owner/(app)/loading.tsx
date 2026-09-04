/**
 * What the owner sees while the next screen is fetched.
 *
 * ── THIS FILE EXISTED ONCE AND WAS RIGHT TO DELETE ─────────────────────────
 *
 * The old one replaced the whole page with the Pointili mark and a sliding bar,
 * on every navigation. That turned a 300ms move between two of your own tabs
 * into what felt like a cold launch of a different app, and it is why routing
 * felt slow. Nothing here brings that back: a splash throws the screen away and
 * says "wait", a skeleton keeps the shape and says "here, shortly".
 *
 * What changed since is that the feedback it used to be competing with is gone.
 * The old note argued the TAB was the loading indicator — it lights on tap, the
 * page arrives under it. On a phone there are no tabs any more (OwnerMenu), and
 * these routes are all server-rendered per request, so a tap from the menu had
 * nothing between the tap and the answer. The sheet covers the first part of
 * that wait; this covers the rest, and every direct load and every click of the
 * desktop sidebar, which the sheet never sees.
 *
 * Réglages is the reason it is worth having at all: it is by far the heaviest
 * screen in this app, and it is the one an owner opens from a standing start.
 */
export default function Loading() {
  return (
    <div className="sk-page w-full" aria-hidden>
      {/* the screen's own title line */}
      <div className="sk h-[20px] w-[44%] rounded-[9px]" />

      {/*
        Two wide blocks then rows. Every screen behind this boundary is some
        version of that — the till's two acts, the client list's summary and
        its people, Réglages' panels — so the shape is honest about all of them
        rather than exact about one. Content that lands somewhere other than
        where the grey promised is what makes a skeleton feel cheap.
      */}
      <div className="mt-4 space-y-3">
        <div className="sk h-[104px] w-full rounded-[22px]" />
        <div className="sk h-[84px] w-full rounded-[22px]" style={{ ["--sk-delay" as string]: "80ms" }} />
      </div>

      <div className="mt-4 space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="sk h-[58px] w-full rounded-[18px]"
            style={{ ["--sk-delay" as string]: `${160 + i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
