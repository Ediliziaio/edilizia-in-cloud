/**
 * «Cosa ti consiglio»: poche frasi operative ricavate dai numeri del preventivo, mai da un'opinione.
 *
 * Ogni consiglio nasce da un calcolo già mostrato nella scheda (sforo di margine, ore-persona, squadra,
 * date) e dice il numero su cui agire: prezzo minimo, voce da cui tagliare, operai da mettere in squadra,
 * entro quando ordinare. Niente consigli quando il dato non c'è (costi incompleti, date non scritte).
 */
import type { EsitoObiettivo } from './obiettivoMargine';
import type { EsitoTempi } from './stimaTempi';
import { dataFine, dataPrima } from './scenariPreventivo';

export interface InputConsigli {
  margine: EsitoObiettivo;
  tempi: EsitoTempi;
  operaiOggi: number;
  inizioIso: string;
  /** Giorni lavorativi che il fornitore impiega a consegnare; 0 o vuoto = non indicato. */
  consegnaGiorni: number;
  formatEuro: (v: number) => string;
}

const dataIt = (iso: string) => iso.split('-').reverse().join('/');
const giorni = (n: number) => `${n} ${n === 1 ? 'giorno' : 'giorni'}`;

export function consigliPreventivo(i: InputConsigli): string[] {
  const out: string[] = [];
  const m = i.margine;
  if (m.stato === 'sforo') {
    const top = m.voci[0];
    out.push(`Per tenere il margine, o porti il prezzo ad almeno ${i.formatEuro(m.prezzoMinimoIvato)} (IVA inclusa) o tagli ${i.formatEuro(m.scarto)} di costi${top ? `: parti da «${top.descrizione}» (−${i.formatEuro(top.taglio)})` : ''}.`);
  } else if (m.stato === 'ok' && m.prezzoNetto > 0) {
    const sconto = Math.floor((1 - m.prezzoMinimoNetto / m.prezzoNetto) * 1000) / 10;
    if (sconto >= 0.5) out.push(`Ci stai dentro: puoi concedere al cliente fino a circa il ${sconto.toLocaleString('it-IT')}% di sconto prima di scendere sotto il margine che vuoi.`);
  } else if (m.stato === 'costi_incompleti') {
    out.push(`Completa il costo ${m.righeSenzaCosto === 1 ? 'della riga venduta senza costo' : `delle ${m.righeSenzaCosto} righe vendute senza costo`}: finché manca, non posso dirti se il margine regge.`);
  }
  const t = i.tempi;
  if (t.stato === 'ok') {
    if (t.operaiPerTarget && t.operaiPerTarget.operai > i.operaiOggi) {
      const k = t.operaiPerTarget.operai - i.operaiOggi;
      out.push(`Per chiudere in ${giorni(t.operaiPerTarget.giorni)} inserisci ${k} ${k === 1 ? 'persona' : 'persone'} in più in squadra (${t.operaiPerTarget.operai} in tutto, ora ${i.operaiOggi}). Le ore-persona restano le stesse: cambia il calendario, non il costo del lavoro.`);
    } else if (t.operaiPerTarget && t.operaiPerTarget.operai < i.operaiOggi) {
      out.push(`Per chiudere in ${giorni(t.operaiPerTarget.giorni)} bastano ${t.operaiPerTarget.operai} operai: puoi tenerne ${i.operaiOggi - t.operaiPerTarget.operai} su un altro cantiere.`);
    }
    if (i.inizioIso) {
      const fine = dataFine(i.inizioIso, t.giorniLavorativi);
      if (fine) out.push(`Se parti il ${dataIt(i.inizioIso)}, con ${i.operaiOggi} ${i.operaiOggi === 1 ? 'operaio' : 'operai'} finisci il ${dataIt(fine)} (festivi e ferie esclusi dal conto: controlla il calendario).`);
      if (i.consegnaGiorni > 0) {
        const ordine = dataPrima(i.inizioIso, i.consegnaGiorni);
        if (ordine) out.push(`Con ${giorni(i.consegnaGiorni)} lavorativi di consegna, ordina i materiali entro il ${dataIt(ordine)} per averli all'inizio.`);
      }
    } else if (i.consegnaGiorni > 0) {
      out.push(`Scrivi la data di inizio lavori per sapere entro quando ordinare i materiali (consegna: ${i.consegnaGiorni} giorni lavorativi).`);
    }
  }
  return out;
}
