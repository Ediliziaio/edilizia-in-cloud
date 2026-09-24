/**
 * Conservazione a norma delle fatture elettroniche (24/09/2026).
 *
 * Le fatture elettroniche, emesse e ricevute, vanno conservate in digitale con
 * un sistema a norma (DMEF 17/06/2014). Openapi, il canale d'invio della
 * fatturazione interna, non lo fa ancora; il servizio gratuito dell'Agenzia
 * delle Entrate sì, per 15 anni.
 *
 * La convenzione dura tre anni e si rinnova da sola, salvo revoca (FAQ n. 34
 * dell'Agenzia, aggiornata il 23/04/2021; la prima versione del 2018 chiedeva
 * il rinnovo a mano). Non scade, quindi: la data di adesione serve a ricordare
 * di controllare nel portale che il rinnovo sia avvenuto davvero, perché ad
 * alcuni contribuenti non è risultato.
 */

export const ANNI_RINNOVO_ADE = 3;
/** Per quanti giorni dopo un rinnovo la pagina chiede di controllarlo. */
export const GIORNI_CONTROLLO_RINNOVO = 30;

export type StatoConservazione =
  | { stato: "da_segnare" }
  | { stato: "attiva"; prossimoRinnovo: string; giorni: number }
  | { stato: "da_controllare"; rinnovataIl: string; prossimoRinnovo: string };

const GIORNO = 86_400_000;

/** Giorno di calendario come numero di giorni, senza ore né fusi orari. */
function giornoDa(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t / GIORNO : null;
}

/** L'adesione più n rinnovi di tre anni: dal 29 febbraio si arriva al 1° marzo. */
function rinnovo(inizio: number, n: number): number {
  const d = new Date(inizio * GIORNO);
  return Date.UTC(d.getUTCFullYear() + ANNI_RINNOVO_ADE * n, d.getUTCMonth(), d.getUTCDate()) / GIORNO;
}

const iso = (giorno: number) => new Date(giorno * GIORNO).toISOString().slice(0, 10);

/**
 * @param aderitoIl data di adesione, AAAA-MM-GG (come la salva il database)
 * @param oggi il giorno di oggi, AAAA-MM-GG (nel fuso dell'utente)
 */
export function statoConservazione(aderitoIl: string | null | undefined, oggi: string): StatoConservazione {
  const inizio = aderitoIl ? giornoDa(aderitoIl) : null;
  const adesso = giornoDa(oggi);
  if (inizio === null || adesso === null) return { stato: "da_segnare" };

  let n = 1;
  while (rinnovo(inizio, n) <= adesso) n++;
  const prossimo = rinnovo(inizio, n);
  const ultimo = n > 1 ? rinnovo(inizio, n - 1) : null;

  if (ultimo !== null && adesso - ultimo <= GIORNI_CONTROLLO_RINNOVO) {
    return { stato: "da_controllare", rinnovataIl: iso(ultimo), prossimoRinnovo: iso(prossimo) };
  }
  return { stato: "attiva", prossimoRinnovo: iso(prossimo), giorni: prossimo - adesso };
}

/**
 * Da quando si possono portare in conservazione fatture già passate dallo SDI:
 * il 1° gennaio del secondo anno prima di quello di adesione (pagina «Il
 * servizio di conservazione a norma» dell'Agenzia). Aderendo nel 2026: 2024.
 */
export function conservazioneRetroattivaDal(annoAdesione: number): string {
  return `${annoAdesione - 2}-01-01`;
}
