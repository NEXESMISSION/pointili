import { NextResponse } from "next/server";
import { currentDiner } from "@/lib/auth/diner";
import { playGame } from "@/lib/db";
import type { PlayResult } from "@/lib/types";

/**
 * The Spin (§10 · moment 2) — SERVER-AUTHORITATIVE.
 *
 * This route decides nothing. It resolves WHO you are from the signed session
 * cookie (never from the request body — otherwise anyone could spin as anyone),
 * then hands off to the play_game() RPC, which enforces the cooldown from the
 * play log, picks the prize by the owner's weights, and writes the win — all in
 * one transaction, behind an advisory lock.
 *
 * Odds are never sent to, or trusted from, the client.
 */
export async function POST(request: Request) {
  const { slug } = await request.json().catch(() => ({ slug: null }));
  if (typeof slug !== "string") {
    return NextResponse.json({ error: "requête invalide" }, { status: 400 });
  }

  const phone = await currentDiner();
  if (!phone) {
    return NextResponse.json({ error: "Connecte-toi pour jouer" }, { status: 401 });
  }

  const device = request.headers.get("user-agent")?.slice(0, 200) ?? null;

  let res;
  try {
    res = await playGame(slug, phone, device);
  } catch {
    return NextResponse.json({ error: "Impossible de jouer" }, { status: 500 });
  }

  if (!res.ok) {
    if (res.reason === "cooldown") {
      const hours = Math.max(
        1,
        Math.ceil((new Date(res.nextPlayAt).getTime() - Date.now()) / 3600_000),
      );
      return NextResponse.json(
        { error: `Ton prochain tour est dans ${hours} h.`, nextPlayAt: res.nextPlayAt },
        { status: 429 },
      );
    }
    if (res.reason === "not_found") {
      return NextResponse.json({ error: "café introuvable" }, { status: 404 });
    }
    return NextResponse.json({ error: "jeu inactif" }, { status: 400 });
  }

  const result: PlayResult = {
    prizeId: res.prizeId,
    prizeIndex: res.prizeIndex,
    prizeLabel: res.prizeLabel,
    isLose: res.isLose,
    code: res.code,
    nextPlayAt: res.nextPlayAt,
  };
  return NextResponse.json(result);
}
