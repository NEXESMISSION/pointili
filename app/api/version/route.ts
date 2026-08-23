/**
 * Which build is serving RIGHT NOW.
 *
 * Four bytes of JSON, no database, no session — the whole point is that it is
 * cheap enough for an open tab to ask on every return to the foreground.
 *
 * The id is substituted into this file AT BUILD TIME (see next.config), so this
 * route always answers with the id of the deployment it shipped in. A browser
 * still running an older bundle carries an older literal, and the difference
 * between the two is the only reliable signal that a deploy has happened while
 * somebody's till was open — see components/StayFresh.
 *
 * force-dynamic + no-store, because a cached answer to "what is current?" is
 * the one answer that can never be right.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(JSON.stringify({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
