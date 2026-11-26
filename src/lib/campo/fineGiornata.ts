/**
 * Fine giornata guidata del caposquadra (24/11/2026): i passi che restano, nell'ordine in cui si fanno.
 * Si adatta a come lavora l'azienda: chi non timbra dall'app non ha il passo «uscita»; il rapportino
 * compare per i cantieri di oggi dove è caposquadra o capocantiere.
 */
export interface CantiereOggi { order_id: string; codice: string | null; capo: boolean }
export interface PassoFineGiornata {
  chiave: string;
  testo: string;
  dettaglio?: string;
  fatto: boolean;
  link: string;
}

export function passiFineGiornata(input: {
  giorno: string;
  cantieri: CantiereOggi[];
  rapportiniInviati: Set<string>;
  timbra: boolean;
  dentro: boolean;
  haTimbratoOggi: boolean;
  /** Il capo ha detto «No, tutto a posto» al passo del materiale (piano campo completo 2.8). */
  materialeOk?: boolean;
}): PassoFineGiornata[] {
  const passi: PassoFineGiornata[] = [];
  const miei = input.cantieri.filter(c => c.capo);
  for (const c of miei) {
    passi.push({
      chiave: `rapportino:${c.order_id}`,
      testo: "Rapportino della squadra",
      dettaglio: c.codice ?? undefined,
      fatto: input.rapportiniInviati.has(c.order_id),
      link: `/campo/lavoro/${c.order_id}/rapportino?data=${input.giorno}`,
    });
  }
  if (miei.length > 0) {
    passi.push({
      chiave: "materiale",
      testo: "Manca qualcosa per domani?",
      dettaglio: "Dillo ora all'ufficio",
      fatto: !!input.materialeOk,
      link: miei.length === 1 ? `/campo/ticket/nuovo/${miei[0].order_id}?tipo=materiale` : "/campo/ticket/nuovo?tipo=materiale",
    });
  }
  if (input.timbra && (input.dentro || input.haTimbratoOggi)) {
    passi.push({ chiave: "uscita", testo: "Timbra l'uscita", fatto: !input.dentro, link: "/campo/timbratura" });
  }
  return passi;
}
