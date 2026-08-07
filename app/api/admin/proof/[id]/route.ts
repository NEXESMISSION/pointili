import { requireSuperAdmin } from "@/lib/auth/owner";
import { createAdminClient } from "@/lib/supabase/admin";

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
  let me;
  try {
    me = await requireSuperAdmin();
  } catch {
    // 404, not 403: an unauthorised caller learns nothing about what exists.
    return new Response("Not found", { status: 404 });
  }

  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const db = createAdminClient();
  const { data } = await db.rpc("admin_renewal_proof", { p_actor: me.id, p_id: id });
  const uri = data as string | null;
  if (!uri || !uri.startsWith("data:image/")) {
    return new Response("Not found", { status: 404 });
  }

  const [head, b64] = uri.split(",", 2);
  const type = head.slice(5).split(";")[0] || "image/webp";
  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64 ?? "", "base64");
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
}
