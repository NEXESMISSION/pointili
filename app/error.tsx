"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/**
 * The app-wide boundary. Catches anything without a closer one — including a
 * throw in the café layout (getCafe) that a segment error.tsx can't reach.
 */
export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      title="Un souci de notre côté"
      message="Quelque chose n'a pas répondu. Réessaie dans un instant."
      reset={reset}
      homeHref="/"
      homeLabel="Accueil"
    />
  );
}
