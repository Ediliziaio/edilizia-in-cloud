/**
 * La numerazione prima della prima fattura (16/11/2026).
 *
 * Un'azienda nuova nasce col contatore a zero: la prima fattura che emette è la numero 1. Se
 * quell'azienda ha già una storia — e quasi tutte ce l'hanno, importata dal gestionale di prima —
 * il numero giusto non è 1, è quello dopo l'ultima che ha davvero emesso. L'editor quelle fatture
 * importate non le guarda: le due cose vivono in tabelle diverse.
 *
 * Il 16/11/2026 è successo a Impresa Vulcano: contatore a 226, archivio importato fino alla 1/238,
 * e la fattura emessa è uscita come 1/227 — un numero già usato il 31/10 per un altro cliente. Una
 * fattura emessa non si rinumera dall'interfaccia (è bloccata apposta), quindi è servito un
 * intervento sul database.
 *
 * Qui si decide cosa dire prima di emettere. Il conto è tutto in questo file; chi legge i dati sta
 * in hooks/useAvvisoNumerazione.ts, chi lo disegna in components/fatturazione/AvvisoNumerazione.tsx.
 */

export interface StatoNumerazione {
  /** Nessun documento fiscale ancora emesso da questa azienda dentro l'app. */
  prima: boolean;
  /** Il numero progressivo che prenderà questa emissione. Null se non lo si sa. */
  prossimo: number | null;
  /**
   * Il progressivo più alto già presente nell'archivio dell'azienda per lo stesso anno (fatture
   * importate dal gestionale di prima). Null se non c'è storia importata.
   */
  massimoArchivio: number | null;
}

export type AvvisoNumerazione =
  /** Niente da dire. */
  | { tipo: "nessuno" }
  /** È la prima fattura di questa azienda: vale la pena guardare il numero prima di emettere. */
  | { tipo: "prima"; prossimo: number | null }
  /** Il numero che uscirebbe è già stato usato, o torna indietro: qui si ferma davvero. */
  | { tipo: "conflitto"; prossimo: number; massimoArchivio: number; suggerito: number };

/**
 * Cosa mostrare prima di emettere.
 *
 * Il conflitto viene prima di tutto: vale anche quando non è la prima fattura, perché il contatore
 * può essere stato rimesso indietro a mano. «Prima» è l'invito a controllare, non un errore.
 */
export function avvisoNumerazione(s: StatoNumerazione): AvvisoNumerazione {
  if (s.prossimo !== null && s.massimoArchivio !== null && s.prossimo <= s.massimoArchivio) {
    return {
      tipo: "conflitto",
      prossimo: s.prossimo,
      massimoArchivio: s.massimoArchivio,
      suggerito: s.massimoArchivio + 1,
    };
  }
  if (s.prima) return { tipo: "prima", prossimo: s.prossimo };
  return { tipo: "nessuno" };
}

/** I tipi di documento che hanno una numerazione fiscale da proteggere. */
export const TIPI_CON_NUMERAZIONE = [
  "fattura", "fattura_pa", "nota_credito", "nota_debito", "autofattura", "fattura_riepilogativa",
  "reverse_charge_interno", "integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue",
] as const;

export const haNumerazioneFiscale = (tipo: string): boolean =>
  (TIPI_CON_NUMERAZIONE as readonly string[]).includes(tipo);

/**
 * L'anno della serie di un documento: quello scritto, se c'è, altrimenti quello della data di
 * emissione, altrimenti l'anno corrente (una bozza senza data prende oggi quando la si emette).
 */
export function annoDelDocumento(
  doc: { anno?: number | null; data_emissione?: string | null },
  oggi: Date = new Date(),
): number {
  if (typeof doc.anno === "number" && doc.anno > 0) return doc.anno;
  const dallaData = Number(String(doc.data_emissione ?? "").slice(0, 4));
  return Number.isFinite(dallaData) && dallaData > 0 ? dallaData : oggi.getFullYear();
}
