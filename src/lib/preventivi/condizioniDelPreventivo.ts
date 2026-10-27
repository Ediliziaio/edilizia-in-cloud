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

/** Chi può riscrivere le condizioni di un preventivo: chi gestisce i modelli dell'azienda, e gli amministratori. */
export function puoRiscrivereLeCondizioni(permessi: { isAdmin?: boolean; canEditSettingsPricing?: boolean; isLoading?: boolean } | null | undefined): boolean {
  if (!permessi || permessi.isLoading) return false;
  return !!permessi.isAdmin || !!permessi.canEditSettingsPricing;
}
