import { ImageResponse } from "next/og";
import { SITE_DOMAIN, TAGLINE } from "@/lib/seo";

/**
 * The card people actually see when the link is pasted into WhatsApp.
 *
 * In Tunisia that is how this link will travel — owner to owner, in a group. A
 * shared link with no image is a grey rectangle nobody taps, so this is not
 * decoration; it is most of the click-through.
 *
 * TWO SATORI RULES this had to learn the hard way:
 *   1. Every element with more than one child needs an explicit display. Satori
 *      does not assume block layout and fails the whole render if it is missing.
 *   2. Any glyph outside the loaded font triggers a dynamic font download at
 *      render time. "✦" did, the fetch 400'd, and the route returned nothing.
 *      So: no decorative glyphs — the mark is drawn, not typed.
 */
export const alt = `${SITE_DOMAIN} — ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 84px",
          background:
            "radial-gradient(1100px 620px at 78% -10%, #7c3aed 0%, rgba(124,58,237,0.18) 42%, transparent 66%), #070510",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* brand row */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 46 }}>
          {/* the mark, drawn rather than typed — no glyph, no font fetch */}
          <div
            style={{
              display: "flex",
              width: 46,
              height: 46,
              borderRadius: 13,
              background: "#7c3aed",
              marginRight: 16,
            }}
          />
          <div style={{ display: "flex", fontSize: 31, fontWeight: 800 }}>
            <span style={{ color: "#ffffff" }}>pointili</span>
            <span style={{ color: "#a78bfa" }}>.online</span>
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 84, fontWeight: 800, letterSpacing: -3 }}>
          Une seule carte.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 84,
            fontWeight: 800,
            letterSpacing: -3,
            color: "#a78bfa",
            marginTop: 4,
          }}
        >
          Toutes vos récompenses.
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: "rgba(255,255,255,0.55)",
            marginTop: 34,
          }}
        >
          La carte de fidélité sans application, pour les commerces tunisiens.
        </div>

        <div style={{ display: "flex", alignItems: "center", marginTop: 46 }}>
          <div
            style={{
              display: "flex",
              background: "#7c3aed",
              borderRadius: 999,
              padding: "15px 32px",
              fontSize: 27,
              fontWeight: 700,
              marginRight: 20,
            }}
          >
            120 TND / an
          </div>
          <div style={{ display: "flex", fontSize: 25, color: "rgba(255,255,255,0.45)" }}>
            14 jours gratuits · sans carte bancaire
          </div>
        </div>
      </div>
    ),
    size,
  );
}
