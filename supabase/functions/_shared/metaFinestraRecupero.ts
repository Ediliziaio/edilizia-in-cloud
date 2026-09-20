/**
 * Da quando si leggono i lead di un modulo Facebook nel recupero (19/09/2026).
 *
 * Tre casi, dal più prudente al più esplicito:
 *   1. giro automatico: finestra breve, mai prima del «solo i nuovi», mai prima
 *      del collegamento del modulo (chi collega oggi non vuole i lead del mese
 *      scorso), e dal segnalibro dell'ultimo giro;
 *   2. recupero per giorni (company_id + days): come sopra, senza segnalibro;
 *   3. recupero ESPLICITO di un modulo da una data (company_id + form_id + da):
 *      è l'«Importa lead → Da una data» del pannello chiesto a voce dal
 *      titolare — «importa gli ultimi 15 giorni di quel modulo» — e vale la
 *      data chiesta, anche prima del collegamento. Senza, dopo aver collegato
 *      un modulo lo storico si poteva riprendere solo dal pannello.
 *
 * Il segnalibro non si prende alla lettera (20/09/2026): si riparte da sei ore
 * prima. Facebook può mostrare un lead qualche istante dopo averlo creato, e il
 * segnalibro veniva scritto a lettura finita: un lead nato in quel mezzo secondo,
 * o comparso in ritardo, restava per sempre dietro il segnalibro. Se in quel
 * momento mancava anche il webhook, era perso. Rileggere sei ore non costa: i
 * lead già presenti si riconoscono e non si riscrivono. Il margine non scavalca
 * mai il collegamento del modulo né il «solo i nuovi».
 *
 * Modulo puro: provato in src/test/logic/metaFinestraRecupero.test.ts.
 */

/** Di quanto si torna indietro rispetto al segnalibro dell'ultimo giro. */
export const MARGINE_SEGNALIBRO_S = 6 * 60 * 60;

export interface ConfigModulo {
  sync_mode: string | null;
  since_date: string | null;
  last_pull_at: string | null;
  created_at: string | null;
}

const secondi = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};

/** Il primo istante (secondi Unix) da cui chiedere i lead a Facebook. */
export function inizioFinestra(p: {
  sinceTs: number;
  cfg?: ConfigModulo | null;
  ignoraSegnalibro?: boolean;
  daEsplicita?: number | null;
}): number {
  if (p.daEsplicita != null && Number.isFinite(p.daEsplicita)) return p.daEsplicita;
  let inizio = p.sinceTs;
  const cfg = p.cfg;
  if (!cfg) return inizio;
  if (cfg.sync_mode === "new_only") {
    const s = secondi(cfg.since_date);
    if (s != null) inizio = Math.max(inizio, s);
  }
  const collegato = secondi(cfg.created_at);
  if (collegato != null) inizio = Math.max(inizio, collegato);
  if (!p.ignoraSegnalibro) {
    const segnalibro = secondi(cfg.last_pull_at);
    if (segnalibro != null) inizio = Math.max(inizio, segnalibro - MARGINE_SEGNALIBRO_S);
  }
  return inizio;
}

/** «2026-09-05» → secondi Unix della mezzanotte UTC; null se non è una data. */
export function dataInSecondi(da: unknown): number | null {
  if (typeof da !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(da)) return null;
  return secondi(`${da}T00:00:00Z`);
}
