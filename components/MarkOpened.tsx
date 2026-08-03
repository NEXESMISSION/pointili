"use client";

import { useEffect, useRef } from "react";
import { markCardOpenedAction } from "@/app/[slug]/actions";

/**
 * Fires once, after paint, to record that this card was actually SEEN.
 *
 * Renders nothing. It exists because the write it performs must not happen
 * during render — see markCardOpenedAction for what that cost.
 *
 * The ref guard is not belt-and-braces: React 19 double-invokes effects in
 * development, and without it the mark would move twice for one visit, which
 * is the same class of bug in a smaller costume.
 */
export function MarkOpened({ slug }: { slug: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void markCardOpenedAction(slug);
  }, [slug]);
  return null;
}
