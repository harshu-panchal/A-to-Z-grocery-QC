// Easy-to-read characters only (no 0/O, 1/l/I), so a password read out loud
// or copied from a screen is not misread.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomPassword(length = 8) {
  const bytes = new Uint32Array(length);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const MIN_PASSWORD = 6;
