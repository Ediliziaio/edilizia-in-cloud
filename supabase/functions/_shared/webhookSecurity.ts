/**
 * Helper condivisi per sicurezza webhook.
 * Introdotto nello sprint P2 — sostituisce pattern duplicati in 6+ edge
 * functions (verifyHmac locale, string compare non constant-time,
 * phone interpolation raw in `.or()`).
 */

/**
 * Constant-time string comparison.
 * Evita timing attack su confronto di firme HMAC o secret: l'operatore
 * `===` di V8/Deno esce al primo byte diverso, permettendo a un
 * attaccante con accesso a latenze misurabili di ricostruire il valore
 * corretto byte per byte. Lo XOR a lunghezza costante non leakka
 * informazioni di prefisso.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifica firma HMAC-SHA256 in modo constant-time.
 *
 * Accetta formati:
 *   - raw hex: "d2f6a8..."
 *   - prefisso "sha256=..." (usato da Meta, GitHub, GoCardless).
 *
 * Ritorna true se la firma è valida, false altrimenti (incluso
 * receivedSignature vuoto o secret vuoto).
 */
export async function verifyHmacSha256(
  body: string,
  receivedSignature: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!receivedSignature || !secret) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const normalized = receivedSignature.startsWith("sha256=")
    ? receivedSignature.slice(7)
    : receivedSignature;

  return timingSafeEqual(expected, normalized);
}

/**
 * Sanitizza un numero di telefono per uso in query Supabase (PostgREST).
 *
 * Ritorna una stringa di sole cifre e '+' (prefisso opzionale) oppure
 * null se l'input è invalido o troppo corto (< 6 cifre sono indicativi
 * di un probabile payload malformato o di un attacco).
 *
 * Uso tipico:
 *   const clean = sanitizePhoneForQuery(webhookMsg.from);
 *   if (!clean) return 400;
 *   .in('phone', [clean, `+${clean}`])   // safe: PostgREST quota i valori
 *
 * Da preferire sempre a `.or("phone.eq.${raw}")` che interpola raw nel
 * DSL di PostgREST (injection pattern già sanato in P0-7 / P1-*).
 */
export function sanitizePhoneForQuery(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = String(raw).replace(/[^\d+]/g, "");
  // Strip '+' non iniziali (un + può esserci solo come primo char)
  const normalized = clean.startsWith("+")
    ? "+" + clean.slice(1).replace(/\+/g, "")
    : clean.replace(/\+/g, "");
  // Almeno 6 cifre significative
  const digitsOnly = normalized.replace(/\+/g, "");
  if (digitsOnly.length < 6) return null;
  return normalized;
}
