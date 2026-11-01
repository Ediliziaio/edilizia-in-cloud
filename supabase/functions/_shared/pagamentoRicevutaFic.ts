/**
 * Fatture in Cloud, fatture RICEVUTE: rate, scadenze, metodo e ritenuta d'acconto (01/11/2026).
 *
 * L'import le scaricava con `fieldset=detailed` e le buttava: ogni debito FIC nasceva «senza
 * scadenza», una rata unica lorda (Dimora, Innovasol, Best Infissi). Qui diventano lo stesso piano
 * che il database legge dall'XML (`fatture_ricevute.piano_pagamento`: scadenza, importo, modalità MP,
 * IBAN), così le rate nascono uguali da qualunque canale arrivi la fattura.
 */

export interface RataPiano {
  scadenza: string | null;
  importo: number | null;
  modalita: string | null;
  iban: string | null;
  /** FIC sa già se è pagata: lo si conserva, la rata nasce comunque da pagare finché lo dice il costo. */
  pagata_il?: string | null;
}

const data = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const numero = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

/** Il nome del metodo di FIC («RiBa», «Bonifico bancario»…) nel codice FatturaPA. */
export function codiceMpDaNomeFic(nome: unknown): string | null {
  const t = String(nome ?? "").toLowerCase().replace(/[\s.]/g, "");
  if (!t) return null;
  if (t.includes("riba") || t.includes("ricevutabancaria")) return "MP12";
  if (t.includes("bonifico")) return "MP05";
  if (t.includes("carta") || t.includes("pos") || t.includes("bancomat")) return "MP08";
  if (t.includes("contant")) return "MP01";
  if (t.includes("assegn")) return "MP02";
  if (t.includes("rid") || t.includes("sdd") || t.includes("addebito")) return "MP19";
  return null;
}

/**
 * Il piano di pagamento e la ritenuta di una fattura ricevuta di FIC.
 * `piano` è null se FIC non dice niente (il database userà allora l'accordo del fornitore o niente).
 */
export function pagamentoRicevutaFic(doc: any): { piano: RataPiano[] | null; ritenuta: number | null } {
  const lista: any[] = Array.isArray(doc?.payments_list) ? doc.payments_list : [];
  const mpDocumento = codiceMpDaNomeFic(doc?.payment_method?.name);
  const piano: RataPiano[] = lista
    .filter((p) => p && (data(p.due_date) || numero(p.amount) != null))
    .map((p) => ({
      scadenza: data(p.due_date),
      importo: numero(p.amount),
      modalita: codiceMpDaNomeFic(p.payment_account?.name) ?? mpDocumento,
      iban: typeof p.payment_account?.iban === "string" && p.payment_account.iban.trim() ? p.payment_account.iban.replace(/\s/g, "") : null,
      pagata_il: data(p.paid_date) ?? (p.status === "paid" ? data(p.due_date) : null),
    }));
  // Nessuna rata ma una scadenza sul documento: una rata unica a quella data.
  if (piano.length === 0 && data(doc?.next_due_date ?? doc?.due_date)) {
    piano.push({ scadenza: data(doc?.next_due_date ?? doc?.due_date), importo: null, modalita: mpDocumento, iban: null });
  }
  const ritenuta = numero(doc?.amount_withholding_tax);
  return { piano: piano.length ? piano : null, ritenuta: ritenuta && ritenuta > 0 ? ritenuta : null };
}
