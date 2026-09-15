/**
 * Il primo errore di un form react-hook-form, pronto da mostrare.
 *
 * Nasce da un blocco muto su "Nuova commessa" (Green Energy, 15/09): il
 * pulsante "Crea Commessa" non faceva niente e non diceva perché. Due cause:
 *
 *   1. il gestore degli errori leggeva `errors` dalla fotografia del render,
 *      che al primo clic è ancora vuota — react-hook-form la riempie solo al
 *      render successivo, mentre gli errori veri li passa come argomento;
 *   2. un errore su un campo annidato (i dati del venditore:
 *      `salesperson_data.commission_value`) non ha un `.message` in cima, e
 *      chi guardava solo il primo livello non trovava niente da mostrare.
 *
 * Qui si scende nell'albero finché non si trova un messaggio. Se un errore
 * c'è ma nessun messaggio, si restituisce comunque il campo: meglio "Venditore:
 * dato non valido" che un pulsante che non risponde.
 */

export interface ErroreForm {
  /** Nome del campo come lo legge l'utente. */
  campo: string;
  messaggio: string;
  /** Percorso tecnico, es. "salesperson_data.commission_value". */
  percorso: string;
}

/** Nomi dei campi della commessa per chi usa il gestionale, non per chi lo scrive. */
const ETICHETTE: Record<string, string> = {
  customer_id: "Cliente",
  order_code: "Codice commessa",
  description: "Descrizione",
  internal_notes: "Note interne",
  status_id: "Stato",
  salesperson_id: "Venditore",
  salesperson_data: "Venditore",
  commission_type: "Tipo provvigione",
  commission_value: "Provvigione",
  assigned_to: "Responsabile",
  expected_date: "Data prevista",
  warehouse_arrival_date: "Arrivo in magazzino",
  work_start_date: "Inizio lavori",
  work_end_date: "Fine lavori",
  destination_warehouse_id: "Magazzino",
  sede_id: "Sede",
  payment_type: "Tipo pagamento",
  total_amount: "Importo totale",
  vat_rate: "IVA",
  financing_cost: "Costo finanziaria",
  has_building_bonus: "Bonus edilizio",
};

// `ref` punta all'elemento HTML del campo: seguirlo farebbe un giro infinito.
// `types` duplica i messaggi già presenti.
const CHIAVI_DA_SALTARE = new Set(["ref", "types", "message", "type", "root"]);

function etichetta(percorso: string[]): string {
  // Il nome più vicino all'utente: il campo di primo livello, se lo conosciamo;
  // altrimenti l'ultimo pezzo del percorso.
  for (const pezzo of percorso) {
    if (ETICHETTE[pezzo]) return ETICHETTE[pezzo];
  }
  return percorso[percorso.length - 1] ?? "Campo";
}

function cerca(nodo: unknown, percorso: string[], visti: Set<unknown>): ErroreForm | null {
  if (!nodo || typeof nodo !== "object" || visti.has(nodo)) return null;
  visti.add(nodo);

  const msg = (nodo as { message?: unknown }).message;
  if (typeof msg === "string" && msg.trim() && percorso.length > 0) {
    return { campo: etichetta(percorso), messaggio: msg.trim(), percorso: percorso.join(".") };
  }

  for (const [chiave, figlio] of Object.entries(nodo as Record<string, unknown>)) {
    if (CHIAVI_DA_SALTARE.has(chiave)) continue;
    const trovato = cerca(figlio, [...percorso, chiave], visti);
    if (trovato) return trovato;
  }
  return null;
}

export function primoErroreForm(errori: object | null | undefined): ErroreForm | null {
  if (!errori) return null;
  const chiavi = Object.keys(errori).filter((k) => !CHIAVI_DA_SALTARE.has(k));
  if (chiavi.length === 0) return null;

  const trovato = cerca(errori, [], new Set());
  if (trovato) return trovato;

  // C'è un errore ma nessun messaggio da nessuna parte: non si resta muti.
  return { campo: etichetta([chiavi[0]]), messaggio: "dato non valido", percorso: chiavi[0] };
}
