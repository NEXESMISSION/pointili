import { BrandMark } from "./BrandMark";
import { DINER_BG } from "@/lib/brand";

/**
 * The screen between tapping the icon and the app being there.
 *
 * An installed PWA has no address bar, no tab spinner and no browser throbber —
 * every signal a phone normally gives you that something is happening is gone.
 * So a slow first paint read as a dead app: the OS splash vanished and left a
 * flat colour with nothing on it, and the honest guess from the other side of a
 * counter is "it's broken", not "it's loading".
 *
 * The same gradient as every other dark screen (lib/brand.ts, one definition),
 * the same mark on the same paper tile as the icon the owner just installed, and
 * a bar that moves. Nothing else — this is the least interesting screen in the
 * product and it should be over before it is read.
 *
 * Deliberately NOT a spinner. A spinner says "wait"; a mark says "you are in the
 * right place", which is the actual question during a cold launch.
 */
export function Splash({
  /** Fills the viewport (a route loader) rather than sitting inside a page. */
  full = false,
  label = "Chargement…",
}: {
  full?: boolean;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-5 text-white ${
        full ? "fixed inset-0 z-[80]" : "min-h-[55vh] w-full"
      }`}
      style={full ? DINER_BG : undefined}
    >
      <span className="splash-mark">
        <BrandMark size={64} />
      </span>

      {/* an indeterminate rail — it cannot know the progress, and a fake
          percentage is a lie the person is standing there waiting on */}
      <span className="block h-[3px] w-[132px] overflow-hidden rounded-full bg-white/12">
        <span className="splash-bar block h-full w-1/3 rounded-full bg-white/70" />
      </span>

      <span className="sr-only">{label}</span>
    </div>
  );
}
