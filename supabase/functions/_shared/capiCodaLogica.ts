/**
 * Regole della coda delle conversioni CRM verso Meta (meta-crm-conversion-sync).
 *
 * Settembre 2026: 1.969 eventi fermi da giugno, nessun job che li lavorasse,
 * nessun pixel con token CAPI configurato. Accendere il job così com'era
 * voleva dire ritentare all'infinito eventi destinati a fallire.
 */

/** Oltre questo numero di tentativi un evento resta "failed" e non si riprende più. */
export const MAX_TENTATIVI_CAPI = 5;

/** Meta rifiuta gli eventi con event_time più vecchio di 7 giorni. */
export const FINESTRA_META_SECONDI = 7 * 24 * 60 * 60;

/** Vero se Meta rifiuterebbe l'evento perché troppo vecchio (con un'ora di margine). */
export function eventoTroppoVecchio(eventTimeSecondi: number, oraMs: number = Date.now()): boolean {
  if (!Number.isFinite(eventTimeSecondi)) return false;
  return oraMs / 1000 - eventTimeSecondi > FINESTRA_META_SECONDI - 3600;
}

/** Aziende distinte con un pixel attivo e il token CAPI. */
export function aziendeConPixelAttivo(righe: Array<{ company_id?: string | null }> | null | undefined): string[] {
  return [...new Set((righe ?? []).map((r) => r?.company_id).filter((id): id is string => !!id))];
}
