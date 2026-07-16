/**
 * Etichetta leggibile per una transazione bancaria (Open Banking / PSD2).
 *
 * Le transazioni sincronizzate arrivano spesso con `description` grezza:
 * codici tecnici del provider (es. "fx_card"), snake_case, o vuota ("—").
 * Questo helper produce un testo pulito:
 *   1. codice noto → etichetta italiana (mappa TX_LABELS);
 *   2. codice tecnico minuscolo/snake_case → Title Case;
 *   3. descrizione già leggibile → invariata;
 *   4. descrizione vuota → controparte (creditore/debitore), poi categoria, poi tipo.
 */
const TX_LABELS: Record<string, string> = {
  fx_card: "Pagamento carta (estero)",
  card: "Pagamento con carta",
  card_payment: "Pagamento con carta",
  pos: "Pagamento POS",
  transfer: "Bonifico",
  sepa: "Bonifico SEPA",
  sepa_credit_transfer: "Bonifico SEPA",
  direct_debit: "Addebito diretto (SDD)",
  sdd: "Addebito diretto (SDD)",
  fee: "Commissione bancaria",
  interest: "Interessi",
  cash: "Contante",
  cheque: "Assegno",
  refund: "Rimborso",
  withdrawal: "Prelievo",
};

export interface TxLike {
  description?: string | null;
  category?: string | null;
  transaction_type?: string | null;
  creditor_name?: string | null;
  debtor_name?: string | null;
}

export function prettyTxDesc(tx: TxLike): string {
  const raw = (tx.description ?? "").trim();
  if (raw && raw !== "—") {
    const key = raw.toLowerCase();
    if (TX_LABELS[key]) return TX_LABELS[key];
    // codice tecnico tutto minuscolo / snake_case → Title Case leggibile
    if (/^[a-z0-9][a-z0-9_ ]*$/.test(raw)) {
      return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return raw;
  }
  // Controparte: per un'uscita chi ho pagato (creditore), per un'entrata chi mi
  // ha pagato (debitore).
  const counterparty = tx.transaction_type === "credit" ? tx.debtor_name : tx.creditor_name;
  if (counterparty && counterparty.trim()) return counterparty.trim();
  if (tx.category && tx.category !== "Non categorizzata") return tx.category;
  return tx.transaction_type === "credit" ? "Entrata" : "Uscita";
}
