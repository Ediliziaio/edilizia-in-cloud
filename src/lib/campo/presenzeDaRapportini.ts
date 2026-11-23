/**
 * Le ore dei rapportini nelle presenze dell'operaio (collaudo 23/11/2026).
 *
 * «Le mie presenze» contava solo le timbrature: Marco Verdi aveva rapportini per 7 ore e vedeva «0 giorni, 0 h».
 * Capita di scordarsi di timbrare (la timbratura non è obbligatoria per il rapportino), e il mese sembrava vuoto.
 * Regola: dove ci sono timbrature con ore, valgono quelle (sono la presenza vera); nei giorni senza, contano le ore
 * dei rapportini inviati o approvati, sommate se i cantieri sono più d'uno, e il giorno dice «dal rapportino».
 * Bozze, rapportini respinti e annullati non contano.
 */
export interface GiornoPresenza {
  status: string;
  ore?: number;
  entrata?: string;
  uscita?: string;
  daRapportino?: boolean;
}

export interface OreRapportino {
  data_lavoro: string;
  ore_lavorate: number | string | null;
  ore_straordinario?: number | string | null;
  stato?: string | null;
  annullato_at?: string | null;
}

const numero = (valore: unknown) => {
  const n = Number(valore);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function aggiungiOreRapportini(
  giorni: Record<string, GiornoPresenza>,
  rapportini: readonly OreRapportino[],
): Record<string, GiornoPresenza> {
  const perGiorno = new Map<string, number>();
  for (const r of rapportini) {
    if (r.annullato_at || r.stato === "bozza" || r.stato === "rifiutato") continue;
    const ore = numero(r.ore_lavorate) + numero(r.ore_straordinario);
    if (!ore) continue;
    perGiorno.set(r.data_lavoro, (perGiorno.get(r.data_lavoro) ?? 0) + ore);
  }
  const risultato = { ...giorni };
  for (const [giorno, ore] of perGiorno) {
    const esistente = risultato[giorno];
    if (esistente && (esistente.ore ?? 0) > 0) continue;
    if (esistente && esistente.status !== "presente") continue;
    risultato[giorno] = { ...esistente, status: "presente", ore: Math.round(ore * 100) / 100, daRapportino: true };
  }
  return risultato;
}
