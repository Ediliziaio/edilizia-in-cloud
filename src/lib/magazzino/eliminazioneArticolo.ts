/**
 * Quando un articolo di magazzino si può eliminare, e quando no.
 *
 * Finora non si poteva eliminare affatto: un articolo censito per sbaglio, o un
 * duplicato, restava in elenco per sempre. Ma "si può eliminare" non è ovvio:
 *
 *  - `warehouse_movements.stock_item_id` referenzia l'articolo SENZA cascata:
 *    il database rifiuterebbe la cancellazione con un errore di vincolo, che
 *    all'utente arriverebbe come "errore imprevisto". Meglio dirglielo prima,
 *    e col motivo giusto: quei movimenti sono lo storico di magazzino.
 *  - `stock_units` invece referenzia CON cascata: cancellare l'articolo
 *    cancellerebbe in silenzio i seriali. Silenzio è la parte inaccettabile.
 *  - con giacenza o quantità impegnata, cancellare significa far sparire roba
 *    che fisicamente è in magazzino.
 *
 * Quindi si elimina solo un articolo davvero vuoto e mai movimentato.
 */

export interface StatoArticolo {
  quantity: number;
  quantity_reserved: number;
  /** Movimenti di carico/scarico registrati. */
  movimenti: number;
  /** Unità serializzate collegate. */
  seriali: number;
  /** Lotti collegati. */
  lotti: number;
  /**
   * Righe di trasferimento tra magazzini (warehouse_transfer_items, RESTRICT
   * senza cascata). Facoltativo: chi non le conta non cambia comportamento.
   */
  trasferimenti?: number;
}

export interface EsitoEliminazione {
  eliminabile: boolean;
  /** Perché no, in una frase da mostrare all'utente. Vuoto se eliminabile. */
  motivo: string;
}

export function valutaEliminazione(stato: StatoArticolo): EsitoEliminazione {
  if (stato.quantity > 0) {
    return {
      eliminabile: false,
      motivo: `Ci sono ancora ${stato.quantity} pezzi a magazzino. Scaricali prima di eliminare l'articolo.`,
    };
  }
  if (stato.quantity_reserved > 0) {
    return {
      eliminabile: false,
      motivo: `Ci sono ${stato.quantity_reserved} pezzi impegnati su una commessa. Liberali prima di eliminare l'articolo.`,
    };
  }
  if (stato.movimenti > 0) {
    return {
      eliminabile: false,
      motivo: `L'articolo ha ${stato.movimenti} movimenti registrati: eliminarlo cancellerebbe lo storico di magazzino. Se non serve più, portalo a zero e lascialo in elenco.`,
    };
  }
  if (stato.seriali > 0) {
    return {
      eliminabile: false,
      motivo: `Ci sono ${stato.seriali} seriali collegati a questo articolo, e verrebbero cancellati con lui.`,
    };
  }
  if (stato.lotti > 0) {
    return {
      eliminabile: false,
      motivo: `Ci sono ${stato.lotti} lotti collegati a questo articolo.`,
    };
  }
  if ((stato.trasferimenti ?? 0) > 0) {
    return {
      eliminabile: false,
      motivo: `L'articolo compare in ${stato.trasferimenti} righe di trasferimento tra magazzini: eliminarlo cancellerebbe quello storico.`,
    };
  }
  return { eliminabile: true, motivo: "" };
}
