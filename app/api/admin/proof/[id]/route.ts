import { adminRpc } from "@/lib/adminRpc";

/**
 * A payment receipt, as bytes, for the console.
 *
 * ── WHY A ROUTE AND NOT A DATA URI IN THE PAGE ────────────────────────────
 * The queue can hold twenty requests. Twenty receipts inlined as base64 is
 * several megabytes of HTML for a page whose job is to show a list — and every
 * one of them would be re-sent on every render. Here the list carries twenty
 * forty-character URLs and the browser fetches the one an operator opens.
 *
 * ── WHY IT ASKS WHO IS CALLING ────────────────────────────────────────────
 * This is not the shop's logo. It is somebody's bank transfer: a name, a phone
 * number, part of an account number. So the id being unguessable is not the
 * lock — requireSuperAdmin() is, on every single request, and the RPC re-checks
 * is_super() from inside Postgres. An owner cannot read even their own receipt
 * back through here; they already have it, on their phone.
 *
 * `private, no-store`: a receipt must not sit in a shared cache, and there is
 * nothing to gain from caching one glance at one image.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  /* adminRpc throws if the caller is not an elevated super-admin. 404, not
     403: an unauthorised caller learns nothing about what exists. */
  let uri: string | null;
  try {
    uri = await adminRpc<string>("admin_renewal_proof", { p_id: id });
  } catch {
    return new Response("Not found", { status: 404 });
  }

  if (!uri || !uri.startsWith("data:image/")) {
    return new Response("Not found", { status: 404 });
  }

  /*
    PARSED, NOT SPLIT.

    This took the Content-Type straight out of the stored data-URI — whatever
    text sat between "data:" and the first ";" or "," was echoed into the
    response header. The value is owner-supplied (it is whatever the uploader
    wrote when a shop submitted a payment receipt), so `data:image/svg+xml,...`
    came back as an SVG, and an SVG is a document that runs script ON OUR
    ORIGIN — served to a super-admin, from an admin page, with their session.
    That is stored XSS aimed squarely at the one account that can do the most.

    /api/cover already does it this way. This route is the same shape of thing
    — an uploaded file turned into bytes — and now reads the same: an anchored
    regex allowing only the raster types the uploader actually produces, plus
    nosniff so a browser cannot decide it knows better.
  */
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(uri);
  if (!m) return new Response("Not found", { status: 404 });

  const bytes = Buffer.from(m[2], "base64");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": m[1],
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // A receipt is never a page. Belt and braces if the type check ever slips.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
