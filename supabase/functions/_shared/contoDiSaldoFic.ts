/**
 * Conto di saldo per segnare pagata una fattura su Fatture in Cloud.
 *
 * FIC rifiuta un pagamento «saldato» senza conto (422 «È necessario impostare il
 * conto di saldo nel pagamento»). Lo si sceglie come lo proporrebbe FIC: il conto
 * predefinito del metodo di pagamento della fattura, poi il conto con lo stesso
 * IBAN, poi l'unico conto esistente. Con più conti e nessun indizio non si tira a
 * indovinare: null, e l'utente sistema il predefinito su FIC.
 *
 * Modulo puro: lo usa billing-payment-push, lo provano i test in
 * src/test/logic/contoDiSaldoFic.test.ts.
 */

export type ContoFic = { id: number; name?: string; type?: string; iban?: string | null };
export type MetodoFic = {
  id: number;
  name?: string;
  default_payment_account?: { id?: number } | null;
  bank_iban?: string | null;
};

const normIban = (v: unknown) => String(v ?? "").replace(/\s+/g, "").toUpperCase();

export function scegliContoDiSaldo(p: {
  conti: ContoFic[];
  metodo: MetodoFic | null;
  ibanFattura: string | null;
}): ContoFic | null {
  const { conti, metodo, ibanFattura } = p;
  if (conti.length === 0) return null;
  const predefinito = metodo?.default_payment_account?.id;
  if (predefinito) {
    const c = conti.find((x) => x.id === predefinito);
    if (c) return c;
  }
  for (const iban of [ibanFattura, metodo?.bank_iban]) {
    const n = normIban(iban);
    if (!n) continue;
    const c = conti.find((x) => normIban(x.iban) === n);
    if (c) return c;
  }
  return conti.length === 1 ? conti[0] : null;
}
