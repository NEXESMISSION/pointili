"use server";

import { redirect } from "next/navigation";
import { clearDinerSession } from "@/lib/auth/diner";

/** Sign out / switch account. Clears the signed session cookie. */
export async function logoutDinerAction(slug: string) {
  await clearDinerSession();
  redirect(`/${slug}/rejoindre`);
}
