/**
 * Ritenuta di garanzia sui SAL.
 *
 * NB: il calcolo del margine di commessa NON sta qui — quella pagina esiste
 * gia' come /strumenti/calcolatore-margine-commessa, con la propria logica.
 * Duplicarla avrebbe creato due pagine in concorrenza sulla stessa query e
 * due implementazioni della stessa aritmetica da tenere allineate.
 */

function safe(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function round(value: number, decimali = 2): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimali;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/* ────────────────────────── RITENUTA DI GARANZIA ────────────────────────── */

export interface RitenutaInput {
  /** Importo complessivo dei lavori, IVA esclusa. */
  importoLavori: number;
  /** Percentuale di ritenuta applicata a ogni SAL (per legge nei pubblici: 0,50%). */
  percentualeRitenuta: number;
  /** Numero di SAL previsti nel corso dell'opera. */
  numeroSal: number;
  /** Mesi fra il collaudo e lo svincolo effettivo della ritenuta. */
  mesiSvincolo: number;
}

export interface RitenutaResult {
  /** Importo medio di un singolo SAL. */
  importoPerSal: number;
  /** Quanto viene trattenuto su ogni SAL. */
  trattenutaPerSal: number;
  /** Totale trattenuto a fine lavori. */
  trattenutaTotale: number;
  /** Quanto incassi effettivamente per ogni SAL. */
  nettoPerSal: number;
  /** Totale incassato prima dello svincolo. */
  nettoTotale: number;
  /**
   * Costo finanziario dell'immobilizzo, calcolato al tasso indicato.
   * Serve a rispondere alla domanda vera: quanto mi costa questo credito
   * che resta fermo per mesi?
   */
  costoImmobilizzo: number;
}

/**
 * @param tassoAnnuo costo del denaro in % annua (per stimare l'immobilizzo).
 *   Default 6%: è un ordine di grandezza prudente per un affidamento a
 *   breve di una PMI, non un tasso di mercato. Va sovrascritto con il
 *   proprio.
 */
export function calcolaRitenuta(input: RitenutaInput, tassoAnnuo = 6): RitenutaResult {
  const importo = safe(input.importoLavori);
  const perc = safe(input.percentualeRitenuta);
  const nSal = Math.max(1, Math.round(safe(input.numeroSal)) || 1);
  const mesi = safe(input.mesiSvincolo);

  const importoPerSal = round(importo / nSal);
  const trattenutaPerSal = round((importoPerSal * perc) / 100);
  const trattenutaTotale = round((importo * perc) / 100);
  const nettoPerSal = round(importoPerSal - trattenutaPerSal);
  const nettoTotale = round(importo - trattenutaTotale);

  // Approssimazione volutamente semplice e dichiarata: la trattenuta
  // completa immobilizzata per i mesi che separano il collaudo dallo
  // svincolo. Non sconta il fatto che le prime trattenute restano ferme
  // più a lungo — sottostima, quindi non gonfia il risultato.
  const costoImmobilizzo = round((trattenutaTotale * (tassoAnnuo / 100) * mesi) / 12);

  return {
    importoPerSal,
    trattenutaPerSal,
    trattenutaTotale,
    nettoPerSal,
    nettoTotale,
    costoImmobilizzo,
  };
}
