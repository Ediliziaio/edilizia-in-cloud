/**
 * Il ritorno dopo l'accesso: un percorso interno ricordato per dieci minuti e
 * una volta sola (vedi RitornoDopoLogin). Oggi lo usa il QR degli attrezzi.
 */
const CHIAVE = "eic_dopo_login";
const DURATA_MS = 10 * 60 * 1000;

export function ricordaDopoLogin(percorso: string) {
  // Solo percorsi interni: niente «//sito.esterno» o indirizzi completi.
  if (!percorso.startsWith("/") || percorso.startsWith("//")) return;
  try {
    sessionStorage.setItem(CHIAVE, JSON.stringify({ percorso, scade: Date.now() + DURATA_MS }));
  } catch {
    // sessionStorage non disponibile: si torna alla home, pazienza.
  }
}

export function leggiDopoLogin(): string | null {
  try {
    const raw = sessionStorage.getItem(CHIAVE);
    if (!raw) return null;
    sessionStorage.removeItem(CHIAVE);
    const { percorso, scade } = JSON.parse(raw) as { percorso?: string; scade?: number };
    if (!percorso || !scade || scade < Date.now()) return null;
    if (!percorso.startsWith("/") || percorso.startsWith("//")) return null;
    return percorso;
  } catch {
    return null;
  }
}
