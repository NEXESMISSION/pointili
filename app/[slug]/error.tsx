"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/** Diner-facing: reassuring, points are safe, just retry. */
export default function CafeError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      title="Un petit souci"
      message="Impossible d'afficher ta carte pour l'instant. Tes points sont bien là — réessaie."
      reset={reset}
      tone="dark" // this boundary renders inside the deep-purple diner shell
    />
  );
}
