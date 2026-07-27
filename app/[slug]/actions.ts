"use server";

import { redirect } from "next/navigation";
import { clearDinerSession } from "@/lib/auth/diner";

/**
 * Sign out / switch account. Clears the signed session cookie.
 *
 * Lands on the GLOBAL door, never back on /[slug]/rejoindre. A shop can go dark
 * (suspended, or the plan lapsed) and its layout swallows the whole subtree
 * including that form — so signing out there destroyed the only session and
 * dropped the diner somewhere with no way back in.
 */
export async function logoutDinerAction(_slug: string) {
  await clearDinerSession();
  redirect("/moi");
}
