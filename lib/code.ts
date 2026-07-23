/**
 * Counter codes.
 *
 * The charset omits 0/O and 1/I: these get read aloud and typed by staff on a
 * phone, and an ambiguous glyph turns into a support problem. Kept in one place
 * so the generator and any validator can never drift apart.
 */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function genCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export const CODE_PATTERN = new RegExp(`^[${CODE_CHARS}]{6}$`);
