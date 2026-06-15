/**
 * outreach-abz — A/Z testing PURO (niente Deno/Supabase). Più varianti di
 * oggetto/corpo separate da "===": il dispatcher ne sceglie una per destinatario
 * (rotazione deterministica per seed) e poi si calcola la vincente per reply rate.
 * Testato in vitest.
 */

export const VARIANT_DELIM = "===";

/** Divide un testo multi-variante; se non ci sono separatori ritorna l'unica variante. */
export function parseVariants(text: string, delim: string = VARIANT_DELIM): string[] {
  if (!text) return [];
  const parts = text.split(delim).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [text.trim()].filter(Boolean);
}

/** Sceglie una variante in modo deterministico dal seed (rotazione equa tra destinatari). */
export function pickVariant(variants: string[], seed: number): { index: number; text: string } | null {
  if (!variants.length) return null;
  const index = ((Math.trunc(seed) % variants.length) + variants.length) % variants.length;
  return { index, text: variants[index] };
}

export interface VariantStat { index: number; sent: number; replied: number; }

/** Variante vincente = miglior reply rate tra quelle con volume minimo. null se nessuna qualificata. */
export function pickWinner(stats: VariantStat[], minVolume = 20): { index: number; rate: number } | null {
  let best: { index: number; rate: number } | null = null;
  for (const s of stats) {
    if (s.sent < minVolume) continue;
    const rate = s.sent > 0 ? s.replied / s.sent : 0;
    if (!best || rate > best.rate) best = { index: s.index, rate };
  }
  return best;
}

/**
 * Collassa un oggetto multi-variante alla sola variante vincente: "applica" il
 * risultato dell'A/Z al testo dello step. Se l'indice è fuori range o non ci sono
 * varianti multiple, ritorna l'oggetto invariato (no-op sicuro). Puro/testabile.
 */
export function applyWinnerToSubject(subject: string, winnerIndex: number, delim: string = VARIANT_DELIM): string {
  const variants = parseVariants(subject, delim);
  if (variants.length < 2) return subject; // niente A/Z → invariato
  if (winnerIndex < 0 || winnerIndex >= variants.length) return subject; // indice non valido → invariato
  return variants[winnerIndex];
}
