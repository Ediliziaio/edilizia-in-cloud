/**
 * La coda dei lead Meta (integration_webhook_events) si svuota a lotti, dal più
 * vecchio. Un evento di un collegamento col token scaduto resta «pending» senza
 * consumare tentativi (meta-process-leads, MetaAuthError): aspetta che l'azienda
 * si ricolleghi. Ma se entra nel lotto, a ogni giro occupa un posto.
 *
 * Il 16/09/2026 Demo Azienda, col token scaduto dall'08/06, aveva 23 eventi più
 * vecchi di tutti gli altri: il lotto da 20 era sempre e solo loro, e per undici
 * ore nessun lead delle altre aziende è diventato un contatto (BeMade: 19 lead
 * fermi dalle 22:08 alle 9:10 del giorno dopo).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Filtro PostgREST, da passare a `.or(...)`, che tiene fuori dal lotto gli
 * eventi dei collegamenti scaduti. `integration_id.not.in.(…)` da solo
 * scarterebbe anche gli eventi senza collegamento (NULL non passa un NOT IN),
 * quindi quelli si tengono esplicitamente. `null` = nessun collegamento
 * scaduto, nessun filtro.
 */
export function filtroSenzaCollegamentiScaduti(idScaduti: Array<string | null | undefined>): string | null {
  const ids = [...new Set(idScaduti.filter((id): id is string => typeof id === "string" && UUID.test(id)))];
  if (ids.length === 0) return null;
  return `integration_id.is.null,integration_id.not.in.(${ids.join(",")})`;
}

/**
 * Oltre questa attesa un lead mai tentato vuol dire che la coda non scorre:
 * il giro è ogni 2 minuti e un lotto da 20 si smaltisce in pochi secondi.
 * Il 16/09 nessuno se n'è accorto per undici ore: i cron risultavano riusciti.
 */
export const MINUTI_CODA_FERMA = 30;

/** Minuti interi da quando è arrivato il lead, `null` senza una data valida. */
export function minutiDiAttesa(ricevutoIl: string | null | undefined, adesso: Date = new Date()): number | null {
  if (!ricevutoIl) return null;
  const t = Date.parse(ricevutoIl);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((adesso.getTime() - t) / 60_000));
}
