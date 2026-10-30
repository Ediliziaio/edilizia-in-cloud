// ============================================================================
// I metodi di pagamento di un costo — una lista sola
// ----------------------------------------------------------------------------
// Sono esattamente i valori ammessi da `company_costs_payment_method_check`.
// Prima la lista viveva scritta a mano dentro il dialogo «Registra pagamento»,
// e la RiBa non c'era né lì né nel database: un debito non poteva dire che si
// paga con RiBa (aggiunta il 29/10/2026, migrazione 20281029233000).
//
// Dialogo, tabella e filtro leggono da qui: un metodo nuovo si aggiunge in un
// posto solo, insieme al vincolo del database.
// ============================================================================

export const METODI_PAGAMENTO_COSTO = [
  { value: "bonifico", label: "Bonifico" },
  { value: "riba", label: "RiBa" },
  { value: "contanti", label: "Contanti" },
  { value: "carta", label: "Carta" },
  { value: "rid", label: "RID" },
  { value: "assegno", label: "Assegno" },
  { value: "altro", label: "Altro" },
] as const;

export type MetodoPagamentoCosto = (typeof METODI_PAGAMENTO_COSTO)[number]["value"];

/** L'etichetta da mostrare; un codice sconosciuto si mostra com'è, non sparisce. */
export function etichettaMetodoCosto(value: string | null | undefined): string | null {
  if (!value) return null;
  return METODI_PAGAMENTO_COSTO.find((m) => m.value === value)?.label ?? value;
}
