/**
 * cronAuth — riconoscimento delle chiamate provenienti dai cron interni.
 *
 * IL GUASTO CHE QUESTO FILE ESISTE PER EVITARE (27/07/2026)
 * --------------------------------------------------------
 * Il secret dei cron è UNO solo, ma nel codice veniva letto sotto tre nomi
 * diversi: INTERNAL_CRON_SECRET (41 funzioni), PROACTIVE_CRON_SECRET (31),
 * CRON_SECRET (26). In produzione risultava configurato solo il secondo.
 *
 * Risultato: le funzioni che leggevano INTERNAL_CRON_SECRET trovavano la
 * variabile vuota, saltavano al controllo JWT e rispondevano 401 a OGNI
 * chiamata del cron. Sono rimaste morte 11 giorni — system-emails-tick,
 * lifecycle-email-tick, hr-check-scadenze, whatsapp-operational-reminders —
 * senza che nulla lo segnalasse: pg_cron registrava 269 esecuzioni
 * "succeeded", perché `net.http_post` considera riuscito l'AVER SPEDITO la
 * richiesta e non guarda il codice di risposta.
 *
 * Qui si accettano tutti i nomi noti. Non è tolleranza al disordine: è che il
 * costo di un nome non allineato (email ai clienti che non partono, in
 * silenzio, per settimane) è enormemente più alto del beneficio di
 * imporne uno solo. Se un giorno si consolida su un nome unico, questo
 * elenco si accorcia senza rompere nulla.
 */

const NOMI_SECRET = [
  "INTERNAL_CRON_SECRET",
  "PROACTIVE_CRON_SECRET",
  "CRON_SECRET",
] as const;

/**
 * true se la richiesta porta un `x-cron-secret` (o `x-internal-cron-secret`)
 * che combacia con almeno uno dei secret configurati. Confronto a lunghezza
 * costante per non offrire un oracolo temporale a chi provasse a indovinarlo
 * byte per byte.
 *
 * 2026-08-05: accettato anche l'header `x-internal-cron-secret`. Lo stesso
 * disallineamento che questo file cura sui NOMI delle variabili esisteva
 * anche sul nome dell'HEADER: silvio_invoke_edge (la funzione SQL che fa da
 * ponte per 11 job pg_cron) manda `x-internal-cron-secret`, questo file
 * leggeva solo `x-cron-secret`, e whatsapp-operational-reminders rispondeva
 * 401 a ogni giro — con pg_cron che segnava "succeeded", perche' net.http_post
 * considera riuscito l'aver spedito la richiesta.
 */
export function cronSecretValido(req: Request): boolean {
  const inviato = req.headers.get("x-cron-secret") ?? req.headers.get("x-internal-cron-secret");
  if (!inviato) return false;

  let combacia = false;
  for (const nome of NOMI_SECRET) {
    const atteso = Deno.env.get(nome);
    if (!atteso) continue;
    if (confrontoCostante(inviato, atteso)) combacia = true;
  }
  return combacia;
}

/** Nomi delle variabili effettivamente valorizzate: utile per diagnostica. */
export function secretCronConfigurati(): string[] {
  return NOMI_SECRET.filter((n) => !!Deno.env.get(n));
}

function confrontoCostante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
