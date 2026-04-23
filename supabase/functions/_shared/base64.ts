/**
 * P2-8: encode/decode UTF-8 ↔ base64 safe per Deno.
 *
 * `btoa(unescape(encodeURIComponent(...)))` era un trucco legacy
 * JavaScript: `unescape` è deprecato (MDN/TC39) e può sparire in
 * runtime futuri. Inoltre dà risultati inconsistenti su alcuni code
 * point Unicode (emoji, surrogate pair rari).
 *
 * `TextEncoder` + `btoa` su stringhe latin1 è la forma moderna e
 * portabile, corretta su tutti i code point Unicode fino a 0x10FFFF.
 */

export function utf8ToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  // btoa accetta solo stringhe latin1 (0x00-0xFF). Convertiamo i byte
  // UTF-8 in una stringa latin1 a chunk per evitare stack overflow su
  // input molto grossi (String.fromCharCode(...bytes) fallisce > ~65k).
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUtf8(input: string): string {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
