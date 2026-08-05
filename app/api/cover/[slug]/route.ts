import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The shop's banner photograph, as bytes.
 *
 * ── WHY THIS EXISTS AT ALL ────────────────────────────────────────────────
 * The logo is ~10 KB and rides inside the row as a data URI, which is fine. A
 * cover photograph is 40–90 KB, and the café row is read by every single client
 * page — card, boutique, codes, historique, profil, wallet. Inlined, that
 * photograph would be re-sent as base64 INSIDE THE HTML on every one of those
 * navigations, uncacheable, on the phone-on-3G this product is built for.
 *
 * Served from here it is one request, cached for a year, and the HTML carries a
 * URL. cover_url is deliberately absent from CAFE_COLS so nothing else can drag
 * it into a query by accident.
 *
 * ── WHY IMMUTABLE IS SAFE ─────────────────────────────────────────────────
 * The URL carries ?v=<coverAt>, stamped when the owner saves a new photograph.
 * A new photograph is a new URL, so "immutable" is true of any given URL rather
 * than a promise we might break. Without the version we would be choosing
 * between a stale banner for a year and re-downloading a photograph on every
 * visit; with it, both problems are gone.
 *
 * A request with no ?v (a hand-typed URL, an old cached HTML page) still works
 * — it just gets a short cache instead of a year.
 */
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return new Response("Not found", { status: 404 });

  const db = createAdminClient();
  const { data } = await db
    .from("businesses")
    .select("cover_url")
    .eq("slug", slug)
    .maybeSingle();

  const uri = (data as { cover_url: string | null } | null)?.cover_url;
  if (!uri) return new Response("Not found", { status: 404 });

  /*
    Parsed, not trusted. The column holds what saveCoverAction wrote, but this
    route turns whatever is in a database column into bytes with a
    Content-Type — so it re-checks the shape rather than splitting on a comma
    and hoping. Only the raster types the uploader produces are served; an
    image/svg+xml would be a script the browser runs on our origin.
  */
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(uri);
  if (!m) return new Response("Not found", { status: 404 });

  const body = Buffer.from(m[2], "base64");
  const versioned = new URL(req.url).searchParams.has("v");

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": m[1],
      "Content-Length": String(body.length),
      "Cache-Control": versioned
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
      /* It is a shop's own marketing photograph on its own public card — but
         it is still an owner-uploaded file being served from our origin. */
      "X-Content-Type-Options": "nosniff",
    },
  });
}
