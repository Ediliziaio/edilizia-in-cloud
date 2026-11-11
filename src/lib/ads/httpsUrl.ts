/**
 * FIX P1: validazione URL https più rigorosa di startsWith("https://").
 * Rifiuta "https://", "https://x", "https://-bad", URL relativi.
 * Mantiene il controllo condiviso del wizard: HTTPS e host di almeno quattro
 * caratteri contenente un punto. Non verifica raggiungibilità o contenuto della policy.
 */
export function isValidHttpsUrl(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://")) return false;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return false;
    if (!url.hostname || url.hostname.length < 4) return false;
    if (!url.hostname.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}
