"use server";

import { revalidatePath } from "next/cache";
import { ownerCafe } from "@/lib/auth/owner";
import {
  getActivity,
  ownerAdjustPoints,
  ownerCards,
  ownerSetStamps,
  type Activity,
  type OwnerCards,
} from "@/lib/db";

/**
 * Card management is owner-only and café-scoped. Every action resolves the café
 * from the session first (ownerCafe), so the phone/business a client sends can
 * never reach another café's cards.
 */

const PAGE = 30;

export async function searchCardsAction(search: string, offset: number): Promise<OwnerCards> {
  const cafe = await ownerCafe();
  if (!cafe) return { total: 0, cards: [] };
  return ownerCards(cafe.id, search.trim().slice(0, 60), PAGE, Math.max(0, offset));
}

export type AdjustResult = { ok: boolean; balance?: number; error?: string };

export async function adjustPointsAction(phone: string, delta: number): Promise<AdjustResult> {
  const cafe = await ownerCafe();
  if (!cafe) return { ok: false, error: "Non autorisé." };
  if (!Number.isFinite(delta) || delta === 0) return { ok: false, error: "Entrez un nombre." };
  if (Math.abs(delta) > 1_000_000) return { ok: false, error: "Trop grand." };

  const res = await ownerAdjustPoints(cafe.id, phone, Math.round(delta));
  if (!res.ok) return { ok: false, error: "Échec." };
  revalidatePath(`/${cafe.slug}`);
  return { ok: true, balance: res.balance };
}

export type StampsResult = { ok: boolean; count?: number; required?: number; error?: string };

export async function setStampsAction(phone: string, count: number): Promise<StampsResult> {
  const cafe = await ownerCafe();
  if (!cafe) return { ok: false, error: "Non autorisé." };
  if (!Number.isFinite(count) || count < 0) return { ok: false, error: "Nombre invalide." };

  const res = await ownerSetStamps(cafe.id, phone, Math.round(count));
  if (!res.ok) return { ok: false, error: "Échec." };
  revalidatePath(`/${cafe.slug}`);
  return { ok: true, count: res.count, required: res.required };
}

export async function cardHistoryAction(phone: string): Promise<Activity[]> {
  const cafe = await ownerCafe();
  if (!cafe) return [];
  return getActivity(cafe.id, phone, 12);
}
