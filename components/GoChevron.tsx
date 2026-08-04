"use client";

import { useLinkStatus } from "next/link";

/**
 * The chevron on a card, which answers when you press it.
 *
 * Tapping a card used to do nothing visible until the next page painted. On a
 * café's 4G that is long enough to wonder whether the tap landed, so people tap
 * again — and the honest reading of a second tap is "the first one missed".
 *
 * useLinkStatus reports the pending state of the enclosing <Link>, so the one
 * thing on the card that looks pressable is also the thing that reacts: the
 * chevron becomes a spinner for exactly as long as the navigation takes.
 *
 * TWO DETAILS FROM THE NEXT DOCS, both of which matter more than they look:
 *
 *   · The hint is always rendered at a fixed size and only swaps what is drawn
 *     inside it. Showing or hiding an element here would shift the row it sits
 *     in, at the moment the user is looking straight at it.
 *
 *   · The spinner fades in after 120ms. A prefetched route resolves in a few
 *     milliseconds and the pending state is skipped entirely; without the
 *     delay, the routes in between produce a flash of spinner that reads as a
 *     glitch rather than as progress.
 *
 * It must stay a descendant of <Link> — the hook reads the nearest one, and
 * returns a permanent { pending: false } anywhere else.
 */
export function GoChevron({
  /** Diameter in px. The wallet's cards want a bigger target than a list row. */
  size = 36,
}: {
  size?: number;
} = {}) {
  const { pending } = useLinkStatus();
  return (
    <span
      style={{ width: size, height: size }}
      className={`grid shrink-0 place-items-center rounded-full transition ${
        pending ? "opacity-80" : ""
      }`}
      aria-hidden
    >
      <span className={`go-spin ${pending ? "is-pending" : ""}`}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: Math.round(size * 0.46), height: Math.round(size * 0.46) }}
        >
          {/* the arrow, and the arc it becomes — same box, so nothing moves */}
          <path className="go-arrow" d="m9 18 6-6-6-6" />
          <path className="go-arc" d="M21 12a9 9 0 1 1-6.2-8.6" />
        </svg>
      </span>
    </span>
  );
}
