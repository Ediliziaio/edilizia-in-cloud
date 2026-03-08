// Shared encryption utilities — AES-GCM (enterprise-grade)
// Legacy XOR fallback has been REMOVED for security.
// All tokens must use AES-GCM format (prefixed with "aes:").

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

/** Decrypt text. Only supports AES-GCM format ("aes:..."). Legacy XOR is no longer supported. */
export async function decrypt(encoded: string, key: string): Promise<string> {
  if (!encoded.startsWith(AES_PREFIX)) {
    console.error(
      "[SECURITY] Attempted to decrypt a non-AES token. Legacy XOR fallback has been removed. " +
      "This token must be re-encrypted using AES-GCM."
    );
    throw new Error("Unsupported encryption format. Token must be re-encrypted with AES-GCM.");
  }

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
