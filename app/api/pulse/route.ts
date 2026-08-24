import { getCafe } from "@/lib/data";
import { dinerPulse } from "@/lib/db";
import { currentDiner } from "@/lib/auth/diner";

/**
 * WHAT A CUSTOMER'S OPEN CARD ASKS, WHILE IT IS BEING SERVED.
 *
 * The whole point of this product happens at a counter: the cashier scans, the
 * points land, and the customer is looking at their phone the entire time. Until
 * now that phone showed the balance it had loaded a minute earlier, and the
 * moment the product exists for was invisible on the only screen that was
 * watching.
 *
 * ── WHY POLLING, WHICH IS THE UNFASHIONABLE ANSWER ────────────────────────
 *
 * Supabase Realtime was the obvious first thought and it cannot work here: it
 * enforces RLS, `points_ledger` is revoked from anon with no policy (0039, and
 * scripts/attack.mjs keeps it that way), and a diner has no Supabase identity to
 * write a policy against — they carry a signed cookie of ours, not a JWT.
 * Minting real Supabase tokens for every customer to power an animation would
 * be a large new attack surface bought for a flourish.
 *
 * A held connection was the second thought. This deploys to Vercel, where a
 * function has a wall-clock ceiling, so an SSE stream is a connection that
 * drops and reconnects on a timer — polling with extra steps and a worse
 * failure mode.
 *
 * So: the client asks, quickly while somebody is being served and rarely
 * otherwise (components/LivePoints). Three indexed reads in one round trip. At
 * a counter that is a second and a half of latency and a query load that does
 * not register.
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────
 *
 * The phone comes from the caller's OWN httpOnly signed cookie and never from
 * the request, so the only figures anybody can ask for are the ones already on
 * the screen they are holding. No phone in the answer, no cache anywhere, and a
 * caller with no card gets the same shape as a caller with an empty one — this
 * route is never an oracle for whether a given shop knows you.
 */
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

const NOTHING = { balance: 0, stamps: 0, codes: [] };

function answer(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("s") ?? "";
  if (!SLUG_RE.test(slug)) return answer(NOTHING);

  const [cafe, phone] = await Promise.all([getCafe(slug), currentDiner()]);
  /* A shop that is suspended or lapsed serves nothing — same gate as every
     screen under /[slug]. */
  if (!cafe || !cafe.live || !phone) return answer(NOTHING);

  return answer(await dinerPulse(cafe.id, phone));
}
