/**
 * La riga delle scadenze della ditta in Attività.
 *
 * La pagina «Documenti e scadenze» la apri se ti ricordi che esiste — sta in
 * Impostazioni, e nessuno ci passa di mattina. Attività invece la guardano tutti
 * ogni giorno. Una riga sola lì vale più di dieci schermate nascoste: dice quante
 * carte sono scadute e quante stanno per scadere, e si apre dove si rimedia.
 *
 * Conta **solo le carte della ditta**, non le scadenze dei mezzi, benché la vista
 * `azienda_scadenze_tutte` le unisca: i mezzi hanno un permesso proprio
 * (`can_view_mezzi`) e una pagina propria, e una riga che somma le due cose
 * manderebbe chi la tocca su una pagina dove metà dei numeri non c'è. Una riga,
 * un conto, un posto dove finisce.
 */
import type { StatoDocumento } from '@/types/documentiAzienda';

export interface ConteggioScadenze {
  scadute: number;
  inScadenza: number;
}

/**
 * «In scadenza» è lo stato che decide il database, cioè il preavviso scelto su
 * quella carta (sessanta giorni su un DURC, trenta su un contatore): la stessa
 * soglia dell'elenco e dell'email. Un conto che usasse «entro trenta giorni»
 * direbbe un numero diverso da quello che si legge nella pagina.
 */
export function contaScadenze(righe: Array<{ stato: StatoDocumento | null }>): ConteggioScadenze {
  let scadute = 0;
  let inScadenza = 0;
  for (const r of righe) {
    if (r.stato === 'scaduto') scadute++;
    else if (r.stato === 'in_scadenza') inScadenza++;
  }
  return { scadute, inScadenza };
}

/** «2 carte scadute · 1 in scadenza». Null quando non c'è niente da dire. */
export function frasiScadenze({ scadute, inScadenza }: ConteggioScadenze): string | null {
  const pezzi: string[] = [];
  if (scadute > 0) pezzi.push(scadute === 1 ? '1 carta scaduta' : `${scadute} carte scadute`);
  if (inScadenza > 0) {
    // «1 carta scaduta · 1 in scadenza»: la parola «carte» una volta sola, se
    // l'ha già detta la prima metà.
    const carte = pezzi.length > 0 ? '' : inScadenza === 1 ? ' carta' : ' carte';
    pezzi.push(`${inScadenza}${carte} in scadenza`);
  }
  return pezzi.length > 0 ? pezzi.join(' · ') : null;
}
