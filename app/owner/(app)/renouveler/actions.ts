"use server";

import { revalidatePath } from "next/cache";
import { currentOwner, ownerCafe } from "@/lib/auth/owner";
import { requireArea } from "@/lib/auth/staff";
import { pickMethod, pickOffer, platformSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export type RenewState = { ok?: string; error?: string };

/**
 * Send a renewal for review.
 *
 * Everything that decides money is resolved HERE, from the offer id: the
 * months and the amount are read out of the PLATFORM SETTINGS, never off the
 * form. A form that carried its own price would let anyone renew for a year at
 * 1 TND by editing one hidden field, and the operator approving it would have
 * no way to notice — the console shows what the row says.
 *
 * The prices used to come from lib/billing's constants, which meant changing
 * one was a deploy. They come from the settings row now (0041) and the rule is
 * unchanged: whatever the owner's browser sent, the amount written down is the
 * one the platform currently charges.
 */
export async function submitRenewalAction(
  _prev: RenewState,
  formData: FormData,
): Promise<RenewState> {
  const [me, cafe] = await Promise.all([currentOwner(), ownerCafe()]);
  /* Paying for the shop is the owner's business, not a cashier's — and this
     posts a receipt the console acts on. Same door as Réglages. */
  if (cafe) await requireArea(cafe.id, "reglages");
  if (!me || !cafe) return { error: "Non autorisé." };

  const settings = await platformSettings();
  const chosen = pickOffer(settings, String(formData.get("offer") ?? ""));
  const pay = pickMethod(settings, String(formData.get("method") ?? ""));
  if (!chosen) return { error: "Choisissez une formule." };
  if (!pay) return { error: "Choisissez un moyen de paiement." };

  const proof = String(formData.get("proof") ?? "");
  if (!proof.startsWith("data:image/")) {
    return { error: "Ajoutez la photo de votre reçu." };
  }
  /* ~500 KB. The browser downscales before this, so hitting it means either a
     very odd image or somebody posting by hand. */
  if (proof.length > 700_000) {
    return { error: "Image trop lourde — reprenez la photo." };
  }

  const note = String(formData.get("note") ?? "").trim().slice(0, 300);

  const db = createAdminClient();
  const { data, error } = await db.rpc("submit_renewal_request", {
    p_owner: me.id, // the session's id, never the form's
    p_business_id: cafe.id,
    p_offer: chosen.id,
    p_months: chosen.months,
    p_amount: chosen.price,
    p_method: pay.id,
    p_proof: proof,
    p_note: note || null,
  });

  const res = data as { ok?: boolean; reason?: string } | null;
  if (error || !res?.ok) {
    if (res?.reason === "already_pending") {
      return { error: "Une demande est déjà en cours de vérification." };
    }
    if (res?.reason === "too_big") return { error: "Image trop lourde — reprenez la photo." };
    if (res?.reason === "no_proof") return { error: "Ajoutez la photo de votre reçu." };
    return { error: "Envoi impossible pour le moment." };
  }

  revalidatePath("/owner/renouveler");
  revalidatePath("/owner/reglages");
  revalidatePath("/admin");
  return { ok: "Demande envoyée. On vérifie et on prolonge votre compte." };
}
