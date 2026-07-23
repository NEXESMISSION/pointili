"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/** Owner-facing: the caisse/analyses can fail on a DB blip; offer a retry. */
export default function OwnerError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      title="Impossible de charger"
      message="Un souci de connexion à la base. Réessaie — c'est souvent momentané."
      reset={reset}
      homeHref="/owner"
      homeLabel="Retour à la caisse"
    />
  );
}
