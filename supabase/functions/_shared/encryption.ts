// Shared encryption utilities — AES-GCM (enterprise-grade)
// Backward-compatible: decrypts both legacy XOR+base64 and new AES-GCM formats

const AES_PREFIX = "aes:";

export function getEncryptionKey(): string {
  const key = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (key) return key;
  // Fallback: derive from service role key (always available)
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "default-dev-key";
  return srk.substring(0, 32);
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret.padEnd(32, "0").substring(0, 32));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt text using AES-256-GCM. Output: "aes:<base64(iv+ciphertext)>" */
export async function encrypt(text: string, key: string): Promise<string> {
  const aesKey = await deriveAesKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(text);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintext)
  );
  // Concatenate IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv);
  combined.set(ciphertext, iv.length);
  return AES_PREFIX + btoa(String.fromCharCode(...combined));
}

/** Decrypt text. Handles both AES-GCM ("aes:...") and legacy XOR+base64 formats. */
export async function decrypt(encoded: string, key: string): Promise<string> {
  if (encoded.startsWith(AES_PREFIX)) {
    // AES-GCM format
    const aesKey = await deriveAesKey(key);
    const combined = Uint8Array.from(
      atob(encoded.slice(AES_PREFIX.length)),
      (c) => c.charCodeAt(0)
    );
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      ciphertext
    );
    return new TextDecoder().decode(plaintext);
  }

  // Legacy XOR+base64 fallback (backward compatibility)
  const encrypted = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(key);
  const decrypted = new Uint8Array(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(decrypted);
}

// Synchronous legacy encrypt for backward compat (XOR) — NOT recommended for new code
export function encryptSync(text: string, key: string): string {
  const textBytes = new TextEncoder().encode(text);
  const keyBytes = new TextEncoder().encode(key);
  const encrypted = new Uint8Array(textBytes.length);
  for (let i = 0; i < textBytes.length; i++) {
    encrypted[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return btoa(String.fromCharCode(...encrypted));
}
