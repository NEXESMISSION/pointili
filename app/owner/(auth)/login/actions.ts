"use server";

import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/auth/owner";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string };

function readCreds(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!supabaseConfigured()) {
    return { error: "Supabase n'est pas configuré (voir .env.local)." };
  }
  const { email, password } = readCreds(formData);
  if (!email || !password) return { error: "E-mail et mot de passe requis." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Vague on purpose — don't reveal which accounts exist.
  if (error) return { error: "E-mail ou mot de passe incorrect." };

  /*
    Send them straight to the right screen instead of bouncing off "/".

    A server-action redirect is a CLIENT navigation, and "/" is itself a server
    redirect for an owner with no café ("/" → /nouveau). Chaining those two
    across the host rewrite left a brand-new owner parked on an empty till: the
    second hop never committed. Resolving the destination here removes the chain
    — and saves every returning owner a redirect on every sign-in.
  */
  const { ownerCafe } = await import("@/lib/auth/owner");
  redirect((await ownerCafe()) ? "/owner" : "/owner/nouveau");
}

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!supabaseConfigured()) {
    return { error: "Supabase n'est pas configuré (voir .env.local)." };
  }
  const { email, password } = readCreds(formData);
  if (!email || !password) return { error: "E-mail et mot de passe requis." };
  if (password.length < 8) {
    return { error: "Mot de passe : 8 caractères minimum." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  return {
    notice: "Compte créé. Vérifie tes e-mails pour confirmer ton adresse.",
  };
}

export async function logoutAction() {
  if (supabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
