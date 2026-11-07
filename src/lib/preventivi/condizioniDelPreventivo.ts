/**
 * Le condizioni contrattuali di un singolo preventivo (27/10/2026) — lato applicazione.
 *
 * La regola vive in una sola copia, in `supabase/functions/_shared/condizioniDelPreventivo.ts`, perché serve anche
 * ai preventivatori che impaginano nel server (il classico e il fotovoltaico): qui si riusa, e si aggiunge la sola
 * cosa che nel server non esiste — chi ha il permesso di riscrivere le condizioni di un preventivo.
 */
export {
  condizioniRiscritte, condizioniTolteDalPdf, haTesto, perLaFirma, testoCondizioniDelPdf,
  type CondizioniDelPreventivo,
} from "../../../supabase/functions/_shared/condizioniDelPreventivo";

/**
 * Chi può riscrivere le condizioni su UN documento, in fase di creazione, senza toccare il modello
 * dell'azienda (07/11/2026). È un permesso suo — «Riscrivere le condizioni su un documento» — perché il
 * venditore che tratta col committente non è detto che debba anche gestire il listino.
 *
 * Chi gestisce Listino & Prezzi lo ha comunque: le aziende che ci sono già non devono riaprire niente a mano
 * (la ricaduta è in `usePermissions`, su `canRiscrivereCondizioni`).
 */
export function puoRiscrivereLeCondizioni(
  permessi: { isAdmin?: boolean; canRiscrivereCondizioni?: boolean; canEditSettingsPricing?: boolean; isLoading?: boolean } | null | undefined,
): boolean {
  if (!permessi || permessi.isLoading) return false;
  return !!permessi.isAdmin || !!permessi.canRiscrivereCondizioni || !!permessi.canEditSettingsPricing;
}
