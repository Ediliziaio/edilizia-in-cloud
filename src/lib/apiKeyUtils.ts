/**
 * Genera una API key sicura: sk_live_ + 56 char hex casuali.
 */
export function generateApiKey(): string {
  const randomPart = new Uint8Array(28);
  crypto.getRandomValues(randomPart);
  const hex = Array.from(randomPart).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sk_live_${hex}`;
}

/**
 * SHA-256 della chiave per il salvataggio nel DB.
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Primissimi 12 caratteri della chiave.
 */
export function getKeyPrefix(key: string): string {
  return key.slice(0, 12);
}

export type ExpiryOption = "never" | "30d" | "90d" | "1y";

/**
 * Calcola la data di scadenza.
 */
export function computeExpiresAt(option: ExpiryOption): Date | null {
  if (option === "never") return null;
  const now = new Date();
  const map: Record<Exclude<ExpiryOption, "never">, number> = {
    "30d": 30,
    "90d": 90,
    "1y": 365,
  };
  now.setDate(now.getDate() + map[option]);
  return now;
}
