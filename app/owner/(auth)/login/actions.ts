"use server";

import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/auth/owner";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  error?: string;
  notice?: string;
  /** What they typed, so a rejected form does not make them type it again. */
  email?: string;
  /** Set when the address already has an account — the form offers the door. */
  signIn?: true;
};

/*
  SUPABASE SPEAKS ENGLISH. THE PEOPLE USING THIS DO NOT.

  `return { error: error.message }` put the library's own strings in front of a
  café owner in Tunis: "User already registered", "Password should be at least
  6 characters", "Unable to validate email address: invalid format". Every one
  of those is a sentence written for the developer reading a stack trace.

  The mapping is on the SHAPE of the message rather than an exact match,
  because these strings change between Supabase releases and a missed variant
  should degrade to a sentence in French, not to English.
*/
function inFrench(message: string): { error: string; signIn?: true } {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered")) {
    return { error: "Cette adresse a déjà un compte.", signIn: true };
  }
  if (m.includes("password") && (m.includes("least") || m.includes("short"))) {
    return { error: "Mot de passe : 8 caractères minimum." };
  }
  if (m.includes("invalid format") || m.includes("validate email")) {
    return { error: "Cette adresse e-mail n'est pas valide." };
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return { error: "Trop de tentatives. Réessayez dans quelques minutes." };
  }
  /* Anything unmapped: say what happened without repeating English at them. */
  return { error: "La création du compte a échoué. Réessayez dans un instant." };
}

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
  if (!email || !password) return { error: "E-mail et mot de passe requis.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Vague on purpose — don't reveal which accounts exist.
  if (error) return { error: "E-mail ou mot de passe incorrect.", email };

  /*
    Send them straight to the right screen instead of bouncing off "/".

    A server-action redirect is a CLIENT navigation, and "/" is itself a server
    redirect for an owner with no café ("/" → /nouveau). Chaining those two
    across the host rewrite left a brand-new owner parked on an empty till: the
    second hop never committed. Resolving the destination here removes the chain
    — and saves every returning owner a redirect on every sign-in.
  */
  const { ownerHome } = await import("@/lib/auth/owner");
  redirect(await ownerHome());
}

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!supabaseConfigured()) {
    return { error: "Supabase n'est pas configuré (voir .env.local)." };
  }
  const { email, password } = readCreds(formData);
  if (!email || !password) return { error: "E-mail et mot de passe requis.", email };
  if (password.length < 8) {
    return { error: "Mot de passe : 8 caractères minimum.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return { ...inFrench(error.message), email };

  return {
    notice: "Compte créé. Vérifie tes e-mails pour confirmer ton adresse.",
    email,
  };
}

export async function logoutAction() {
  if (supabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  /*
    The sign-in screen, not "/". Someone who just signed out wants to sign back
    in, not a sales page — and on one domain "/" is dangerous here: signOut()
    has already cleared the session, so the landing page's owner-cookie guard
    cannot see them, and a diner cookie left on a shared phone would bounce
    them into somebody else's wallet.
  */
  redirect("/owner/login");
}
