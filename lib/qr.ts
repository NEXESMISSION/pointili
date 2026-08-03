import QRCode from "qrcode";

/**
 * The QR a cashier points a camera at — one renderer, so every screen that
 * shows a code draws the same picture.
 *
 * DARK MODULES ON TRANSPARENT, sized by the caller's CSS. Every place this is
 * used sits it on a white pass zone, which is the polarity the QR spec actually
 * promises decoders will read (the diner's account-code QR on /scanner is
 * inverted and was measured against jsQR before it shipped; there is no reason
 * to spend that margin twice).
 *
 * It encodes the RAW code and nothing else — not a URL. The only camera that
 * matters is the till's, which runs jsQR inside this app, and the till reads a
 * 6-character payload as a voucher (see CaisseForms). A URL would only add
 * bytes, hence modules, hence a denser picture to focus on across a counter.
 */
export function codeQr(value: string): Promise<string> {
  return QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#1a1128", light: "#00000000" },
  });
}
