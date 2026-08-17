import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/seo";

/**
 * The sitemap, including every LIVE shop.
 *
 * This is the part that compounds. Each café on Pointili gets a real page at
 * pointili.online/{slug} that describes a real local business — so the platform
 * accumulates local pages that rank for shop names, and each shop gets a page it
 * did not have to build. A café with no website suddenly has one.
 *
 * Only live shops are listed. A suspended or expired café serves "Momentanément
 * fermé", and pointing a crawler at that would index a closed sign.
 */

// Shops come and go, so this cannot be baked at build time.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const fixed: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    /* The early-access page ranks for a different question than the landing
       does — a shop owner searching whether this exists yet, rather than one
       ready to sign up — so it is listed rather than left to be found only
       through the link in a bio. */
    { url: `${SITE_URL}/early`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/conditions`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/confidentialite`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const db = createAdminClient();
    const { data } = await db
      .from("businesses")
      .select("slug, status, suspended_at, plan_expires_at, created_at")
      .eq("status", "active")
      .is("suspended_at", null)
      .order("created_at", { ascending: false })
      .limit(5000);

    const live = (data ?? []).filter(
      (b) => !b.plan_expires_at || new Date(b.plan_expires_at).getTime() > Date.now(),
    );

    return [
      ...fixed,
      ...live.map((b) => ({
        url: `${SITE_URL}/${b.slug}`,
        lastModified: b.created_at ? new Date(b.created_at) : now,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // A database blip must not take the sitemap down entirely — the fixed pages
    // are still worth serving.
    return fixed;
  }
}
