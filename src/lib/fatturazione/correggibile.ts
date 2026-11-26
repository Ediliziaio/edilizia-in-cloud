/**
 * Quando una fattura emessa si può ancora correggere (16/11/2026).
 *
 * Finora l'editor riapriva i campi solo per le bozze e per le fatture scartate dallo SDI. Ma una
 * fattura emessa e mai trasmessa, per l'Agenzia, non esiste ancora: è lo stesso caso. Fatture in
 * Cloud e gli altri si comportano così — si corregge il contenuto finché non è stata inviata, e
 * numero e data restano quelli.
 *
 * Questa è la stessa regola che il database applica nel trigger `documenti_fiscali_proteggi_emessi`
 * (migrazione 20290418100000). Qui serve a decidere se mostrare i campi aperti; l'ultima parola
 * resta al database, che controlla anche due cose che il documento da solo non dice: se è partita
 * un'email al cliente e se esiste una nota di credito che la cita. Nei casi rari in cui quelle
 * scattano, il salvataggio viene rifiutato con il motivo scritto.
 */

/**
 * I tipi che prendono un numero fiscale, cioè quelli che vanno allo SDI nella forma che
 * `documento_elimina_bozza` conosce. Un DDT non ci va mai, quindi non rientra:
 * resterebbe sempre aperto. Non è la lista di `sdiCassetto.TIPI_SDI`, che è più larga
 * (parcella, acconti) e serve a un'altra domanda.
 */
export const TIPI_NUMERO_FISCALE = [
  "fattura", "fattura_pa", "nota_credito", "nota_debito", "autofattura", "fattura_riepilogativa",
  "reverse_charge_interno", "integrazione_servizi_estero", "integrazione_beni_ue", "integrazione_beni_extra_ue",
];

export interface DocumentoDaCorreggere {
  tipo?: string | null;
  stato?: string | null;
  sdi_stato?: string | null;
  sdi_id_trasmissione?: string | null;
  sdi_identificativo?: string | null;
  importo_pagato?: number | null;
  pagato_at?: string | null;
}

/**
 * Emessa e mai uscita di qui: niente SDI, niente incassi. Il contenuto si corregge, numero e
 * data no.
 */
export function emessaMaiUscita(d: DocumentoDaCorreggere): boolean {
  return (
    !!d.tipo && TIPI_NUMERO_FISCALE.includes(d.tipo) &&
    d.stato === "emessa" &&
    !d.sdi_id_trasmissione &&
    !d.sdi_stato &&
    !d.sdi_identificativo &&
    !(d.importo_pagato && d.importo_pagato > 0) &&
    !d.pagato_at
  );
}

/**
 * Il documento può finire nel cestino (26/11/2026, Impresa Vulcano): una bozza, una già
 * annullata, o una emessa mai uscita di qui.
 *
 * Vulcano aveva emesso la 1/242 senza mandarla allo SDI e non poteva né eliminarla né
 * stornarla: una nota di credito avrebbe stornato una fattura che per l'Agenzia non
 * esiste, e il numero 242 restava bruciato in cima alla serie. Lo stesso caso che qui
 * sopra apre i campi apre anche il cestino: il documento va nel cestino con un
 * segnaposto al posto del numero e il contatore torna al più alto ancora in uso, come
 * per una bozza (`documento_elimina_bozza`, migrazione 20290611100000).
 *
 * Tutto il resto è uscito davvero e si storna con una nota di credito.
 */
export function documentoEliminabile(d: DocumentoDaCorreggere): boolean {
  return d.stato === "bozza" || d.stato === "annullata" || emessaMaiUscita(d);
}
