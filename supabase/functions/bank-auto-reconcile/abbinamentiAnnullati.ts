/**
 * La memoria degli abbinamenti annullati: una riga di bank_reconciliations con unmatched_at.
 * Il bonifico sganciato torna libero, e senza questa memoria il controllo automatico lo
 * riabbinerebbe alla stessa fattura, ripagandola. Vale la coppia: lo stesso bonifico può
 * ancora andare su un'altra fattura, e la stessa coppia si può rifare a mano dalla Tesoreria.
 */
export type RigaAbbinamentoAnnullato = {
  transaction_id: string;
  invoice_id: string | null;
  documento_id: string | null;
  scadenza_id: string | null;
  /** La scadenza di una fattura importata: sganciato dalla scadenza vale anche per la fattura. */
  scadenze?: { invoice_id: string | null } | null;
};

export type BersaglioAbbinamento = "fattura" | "documento" | "scadenza";

const chiave = (transazione: string, bersaglio: BersaglioAbbinamento, id: string) =>
  `${transazione}:${bersaglio}:${id}`;

export function chiaviAbbinamentiAnnullati(righe: RigaAbbinamentoAnnullato[]): Set<string> {
  const chiavi = new Set<string>();
  for (const r of righe) {
    if (r.invoice_id) chiavi.add(chiave(r.transaction_id, "fattura", r.invoice_id));
    if (r.documento_id) chiavi.add(chiave(r.transaction_id, "documento", r.documento_id));
    if (r.scadenza_id) chiavi.add(chiave(r.transaction_id, "scadenza", r.scadenza_id));
    if (r.scadenze?.invoice_id) chiavi.add(chiave(r.transaction_id, "fattura", r.scadenze.invoice_id));
  }
  return chiavi;
}

export function abbinamentoAnnullato(
  chiavi: Set<string>,
  transazione: string,
  bersaglio: BersaglioAbbinamento,
  id: string,
): boolean {
  return chiavi.has(chiave(transazione, bersaglio, id));
}
