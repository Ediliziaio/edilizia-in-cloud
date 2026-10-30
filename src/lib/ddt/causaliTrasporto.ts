/**
 * Causali di trasporto del DDT: UNA lista per la finestra «Crea DDT» della
 * commessa, per l'editor del documento e per il PDF.
 *
 * Il valore salvato in `documenti_fiscali.ddt_causale_trasporto` è il codice
 * (`vendita`, `trasferimento_cantiere`…); sul PDF va l'etichetta. Prima il PDF
 * stampava il codice così com'era («conto_lavoro»), e il DDT creato da
 * un'uscita di magazzino scriveva «Vendita» con la maiuscola, che nell'editor
 * non corrispondeva a nessuna voce: la tendina restava vuota.
 */
export const CAUSALI_TRASPORTO = [
  { value: "vendita", label: "Vendita" },
  { value: "trasferimento_cantiere", label: "Trasferimento a cantiere" },
  { value: "conto_lavoro", label: "Conto lavoro" },
  { value: "reso", label: "Reso" },
  { value: "omaggio", label: "Omaggio" },
  { value: "deposito", label: "Deposito" },
  { value: "esposizione", label: "Esposizione" },
  { value: "riparazione", label: "Riparazione" },
  { value: "altro", label: "Altro" },
] as const;

export type CausaleTrasporto = (typeof CAUSALI_TRASPORTO)[number]["value"];

/** Da dove parte la merce: decide la causale proposta. */
export type DestinatarioUscita = "cliente" | "cantiere" | "libero";

/**
 * La causale proposta per un'uscita di magazzino. Materiale portato su un
 * proprio cantiere non è una vendita: viaggia come trasferimento. Stessa regola
 * di `create_ddt_from_uscita` nel database.
 */
export function causalePerDestinatario(tipo: DestinatarioUscita): CausaleTrasporto {
  return tipo === "cantiere" ? "trasferimento_cantiere" : "vendita";
}

/** L'etichetta da stampare. Un testo libero o vecchio si mostra com'è. */
export function etichettaCausale(valore: string | null | undefined): string {
  const v = (valore ?? "").trim();
  if (!v) return "";
  const trovata = CAUSALI_TRASPORTO.find(
    (c) => c.value === v || c.label.toLowerCase() === v.toLowerCase(),
  );
  return trovata ? trovata.label : v;
}

/** Il codice di una causale salvata con l'etichetta («Vendita» → `vendita`). */
export function codiceCausale(valore: string | null | undefined): string {
  const v = (valore ?? "").trim();
  const trovata = CAUSALI_TRASPORTO.find(
    (c) => c.value === v || c.label.toLowerCase() === v.toLowerCase(),
  );
  return trovata ? trovata.value : v;
}
