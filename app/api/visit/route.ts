import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Where the visit beacon lands.
 *
 * The browser sends a session id it made up, plus what it can see about how it
 * got here. Everything is written through `record_visit`, which upserts on that
 * id — so a reload never becomes a second visitor, and a later beacon only
 * pushes `last_seen` forward.
 *
 * NOTHING IDENTIFYING IS ACCEPTED OR STORED. No IP, no user-agent string, no
 * account. The referrer is reduced to a host before it is written, because a
 * full referrer URL carries the search terms somebody typed to find you — which
 * is exactly the kind of thing that is interesting right up until it is a
 * liability. See supabase/migrations/0028 for the rest of the reasoning.
 *
 * It answers 204 no matter what. A beacon is fire-and-forget: the sender is
 * often already unloading and will never read the response, and an analytics
 * endpoint must never be the thing that makes a page look broken.
 */

/** The one thing worth keeping from a referrer, and the only thing kept. */
function host(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const h = new URL(raw).hostname.replace(/^www\./, "");
    /* our own pages are not a referral */
    return h.endsWith("pointili.online") || h === "localhost" ? null : h.slice(0, 120);
  } catch {
    return null;
  }
}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

const DEVICES = new Set(["mobile", "tablet", "desktop"]);
const SIDES = new Set(["landing", "diner", "owner"]);

export async function POST(req: Request) {
  try {
    const b = await req.json();

    const session = str(b?.s, 64);
    if (!session || session.length < 8) return new Response(null, { status: 204 });

    const device = str(b?.d, 12);
    const side = str(b?.side, 12);

    await createAdminClient().rpc("record_visit", {
      p_session_id: session,
      p_entry_path: str(b?.p, 200),
      p_referrer: host(b?.r),
      p_utm_source: str(b?.us, 80),
      p_utm_medium: str(b?.um, 80),
      p_utm_campaign: str(b?.uc, 120),
      p_device: device && DEVICES.has(device) ? device : null,
      p_side: side && SIDES.has(side) ? side : null,
      p_signed_up: b?.up === true,
    });
  } catch {
    /* malformed body, database hiccup — a lost visit is not worth an error */
  }
  return new Response(null, { status: 204 });
}
