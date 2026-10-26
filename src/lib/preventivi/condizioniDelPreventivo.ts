/**
 * Le condizioni contrattuali di un singolo preventivo (27/10/2026).
 *
 * Stavano solo nel modello dell'azienda: valevano per tutti i preventivi insieme. Chi mandava il primo preventivo
 * «solo per far vedere il prezzo» non poteva toglierle, e chi doveva cambiare una clausola per un cliente doveva
 * cambiarla a tutti. Ora il preventivo può:
 *   · uscire SENZA la parte contrattuale (`condizioni_nel_pdf = false`), per il primo invio;
 *   · avere condizioni SUE (`condizioni_testo`), scritte per quel cliente.
 *
 * Una regola non si tocca: il PDF che va in FIRMA ha sempre le condizioni, perché il preventivo firmato è il
 * contratto. Chi genera quel PDF passa il progetto da `perLaFirma()`, che rimette le condizioni.
 *
 * Modulo puro: niente React, niente Supabase.
 */

export interface CondizioniDelPreventivo {
  /** false = fuori dal PDF. NULL/true = come il modello. */
  condizioni_nel_pdf?: boolean | null;
  /** Le condizioni riscritte per questo preventivo. Vuoto = quelle del modello. */
  condizioni_testo?: string | null;
}

/** Un testo che, tolti i tag, ha davvero delle parole: «<p> </p>» non è un testo. */
export function haTesto(valore: unknown): boolean {
  return String(valore ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim().length > 0;
}

/** Le condizioni di questo preventivo sono state riscritte (e non sono vuote). */
export function condizioniRiscritte(progetto: CondizioniDelPreventivo | null | undefined): boolean {
  return haTesto(progetto?.condizioni_testo);
}

/** Il preventivo è impostato per uscire senza la parte contrattuale. */
export function condizioniTolteDalPdf(progetto: CondizioniDelPreventivo | null | undefined): boolean {
  return progetto?.condizioni_nel_pdf === false;
}

/**
 * Il testo delle condizioni che il PDF deve stampare: quelle riscritte sul preventivo, se ci sono; altrimenti
 * quelle del modello. Un preventivo impostato «senza» non ne stampa nessuna — tranne quando va in firma, perché
 * chi lo manda passa prima da `perLaFirma()`.
 */
export function testoCondizioniDelPdf(
  progetto: CondizioniDelPreventivo | null | undefined,
  delModello: string | null | undefined,
): string {
  if (condizioniTolteDalPdf(progetto)) return "";
  const proprie = progetto?.condizioni_testo;
  return haTesto(proprie) ? String(proprie) : String(delModello ?? "");
}

/**
 * Il preventivo come va stampato per la FIRMA: le condizioni tornano comunque. Chi manda in firma passa di qui, così
 * nessun contratto parte senza la sua parte contrattuale.
 */
export function perLaFirma<T extends CondizioniDelPreventivo>(progetto: T): T {
  return condizioniTolteDalPdf(progetto) ? { ...progetto, condizioni_nel_pdf: true } : progetto;
}

/** Chi può riscrivere le condizioni di un preventivo: chi gestisce i modelli dell'azienda, e gli amministratori. */
export function puoRiscrivereLeCondizioni(permessi: { isAdmin?: boolean; canEditSettingsPricing?: boolean; isLoading?: boolean } | null | undefined): boolean {
  if (!permessi || permessi.isLoading) return false;
  return !!permessi.isAdmin || !!permessi.canEditSettingsPricing;
}
