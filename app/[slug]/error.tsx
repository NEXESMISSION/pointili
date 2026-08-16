"use client";

import { ErrorScreen } from "@/components/ErrorScreen";
import { translator } from "@/lib/dict";
import { langFromCookie } from "@/lib/langClient";

/** Diner-facing: reassuring, points are safe, just retry. */
export default function CafeError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  /* Read, not received: see langFromCookie. */
  const t = translator(langFromCookie());
  return (
    <ErrorScreen
      title={t("Un petit souci")}
      message={t("Impossible d'afficher ta carte pour l'instant. Tes points sont bien là — réessaie.")}
      retryLabel={t("Réessayer")}
      reset={reset}
    />
  );
}
