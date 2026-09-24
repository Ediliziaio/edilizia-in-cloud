/**
 * Conservazione a norma delle fatture elettroniche (24/09/2026).
 *
 * Le fatture elettroniche, emesse e ricevute, vanno conservate in digitale con
 * un sistema a norma (DMEF 17/06/2014). Openapi, il canale d'invio della
 * fatturazione interna, non lo fa ancora; il servizio gratuito dell'Agenzia
 * delle Entrate sì, per 15 anni, ma l'adesione dura TRE anni e si rinnova a
 * mano: chi se ne dimentica smette di conservare senza accorgersene.
 *
 * Qui il conto della scadenza a partire dalla data segnata in Impostazioni.
 */

export const ANNI_ADESIONE_ADE = 3;
/** Da quanti giorni prima della scadenza la pagina chiede di rinnovare. */
export const GIORNI_PREAVVISO_RINNOVO = 90;

export type StatoConservazione =
  | { stato: "da_segnare" }
  | { stato: "attiva" | "in_scadenza" | "scaduta"; scade: string; giorni: number };

const GIORNO = 86_400_000;

/** Giorno di calendario come numero di giorni, senza ore né fusi orari. */
function giornoDa(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t / GIORNO : null;
}

/**
 * @param aderitoIl data di adesione, AAAA-MM-GG (come la salva il database)
 * @param oggi il giorno di oggi, AAAA-MM-GG (nel fuso dell'utente)
 */
export function statoConservazione(aderitoIl: string | null | undefined, oggi: string): StatoConservazione {
  const inizio = aderitoIl ? giornoDa(aderitoIl) : null;
  const adesso = giornoDa(oggi);
  if (inizio === null || adesso === null) return { stato: "da_segnare" };

  const d = new Date(inizio * GIORNO);
  // Tre anni di calendario: dal 29 febbraio si arriva al 1° marzo.
  const scadenza = Date.UTC(d.getUTCFullYear() + ANNI_ADESIONE_ADE, d.getUTCMonth(), d.getUTCDate()) / GIORNO;
  const scade = new Date(scadenza * GIORNO).toISOString().slice(0, 10);
  const giorni = scadenza - adesso;

  if (giorni < 0) return { stato: "scaduta", scade, giorni };
  if (giorni <= GIORNI_PREAVVISO_RINNOVO) return { stato: "in_scadenza", scade, giorni };
  return { stato: "attiva", scade, giorni };
}
