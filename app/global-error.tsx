"use client";

/**
 * Last resort: this fires only when the ROOT layout itself throws, so the app's
 * stylesheet and fonts aren't loaded — it must render its own <html>/<body> and
 * style itself inline. Kept deliberately tiny and dependency-free.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#eae5f6",
          color: "#1a1330",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "22rem" }}>
          <div
            style={{
              margin: "0 auto",
              width: 48,
              height: 48,
              display: "grid",
              placeItems: "center",
              borderRadius: 16,
              background: "#e7e0ff",
              color: "#5b3fd1",
              fontSize: 24,
              fontWeight: 800,
            }}
            aria-hidden
          >
            !
          </div>
          <h1 style={{ margin: "16px 0 8px", fontSize: 22, fontWeight: 800 }}>
            Application indisponible
          </h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#625c7d" }}>
            Une erreur inattendue s&apos;est produite. Réessaie dans un instant.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              width: "100%",
              padding: "14px 0",
              border: 0,
              borderRadius: 16,
              background: "#5b3fd1",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
