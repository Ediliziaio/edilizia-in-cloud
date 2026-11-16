/**
 * Contabilità → «Da verificare» (16/11/2026, docs/piano-punti-aperti-20261116.md §10).
 * Le anomalie di cdg_controllo_doppi lette da cdg_da_verificare, che per ogni id dice che
 * documento è. Qui: dove si apre ogni documento. Nessuna correzione automatica.
 */
export interface DocumentoDaAprire {
  tipo: "movimento" | "fattura_emessa" | "costo" | "scadenza" | "fattura_ricevuta" | "prima_nota" | "sconosciuto" | string;
  id: string;
  titolo: string;
  origine?: string | null;
  numero?: string | null;
  costo_id?: string | null;
  movimento_id?: string | null;
}

export interface AnomaliaDaVerificare {
  chiave: string;
  controllo: string;
  ids: string[];
  importo: number | null;
  descrizione: string;
  cosa_fare: string;
  documenti: DocumentoDaAprire[];
}

/** L'indirizzo che apre il documento, o null se non ha una pagina sua. */
export function indirizzoDocumento(d: DocumentoDaAprire): string | null {
  const id = encodeURIComponent(d.id);
  switch (d.tipo) {
    case "movimento":
      return `/azienda/tesoreria?tab=transazioni&movimento=${id}`;
    case "fattura_emessa":
      return d.origine === "importata" ? `/azienda/documenti/importata/${id}` : `/azienda/documenti/${id}/dettaglio`;
    case "costo":
      return `/azienda/costi?costo=${id}`;
    case "scadenza":
      // Una scadenza di un costo si guarda dal costo; le altre dallo scadenzario.
      return d.costo_id ? `/azienda/costi?costo=${encodeURIComponent(d.costo_id)}` : "/azienda/scadenzario";
    case "fattura_ricevuta":
      return d.numero ? `/azienda/documenti/fatture-ricevute?cerca=${encodeURIComponent(d.numero)}` : "/azienda/documenti/fatture-ricevute";
    case "prima_nota":
      return d.movimento_id ? `/azienda/tesoreria?tab=transazioni&movimento=${encodeURIComponent(d.movimento_id)}` : "/azienda/prima-nota";
    default:
      return null;
  }
}

/** L'etichetta del pulsante. */
export function etichettaApri(d: DocumentoDaAprire): string {
  switch (d.tipo) {
    case "movimento": return "Apri il movimento";
    case "fattura_emessa": return "Apri la fattura";
    case "costo": return "Apri il costo";
    case "scadenza": return d.costo_id ? "Apri il costo della scadenza" : "Apri lo scadenzario";
    case "fattura_ricevuta": return "Apri la fattura ricevuta";
    case "prima_nota": return d.movimento_id ? "Apri il movimento" : "Apri la prima nota";
    default: return "Apri";
  }
}
