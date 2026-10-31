/**
 * IVA della commessa (31/10/2026): a debito, a credito e saldo, dalla funzione commessa_iva.
 *
 *  - A debito: IVA delle fatture emesse (note di credito in meno). Lo split payment non è a debito.
 *  - A credito: IVA delle fatture d'acquisto collegate (costi anche ripartiti, contratti di subappalto).
 *  - Reverse charge: l'IVA si integra e va sia a debito sia a credito, quindi è neutra sul saldo e
 *    non compensa l'IVA delle vendite: quella si versa comunque per intero.
 *  - Saldo = debito − credito: positivo si versa, negativo è un credito.
 */
export interface IvaCommessa {
  aliquota: number;
  valore_commessa: number;
  debito_fatturato: number;
  imponibile_fatturato: number;
  fatture_emesse: number;
  debito_previsto: number;
  debito_da_fatturare: number;
  split_payment: number;
  credito_fatture: number;
  imponibile_acquisti: number;
  fatture_ricevute: number;
  credito_previsto_costi: number;
  costi_senza_fattura_elettronica: number;
  credito_previsto_ditte: number;
  reverse_charge_imponibile: number;
  reverse_charge_iva: number;
  saldo_ad_oggi: number;
  saldo_previsto: number;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function normalizzaIvaCommessa(raw: unknown): IvaCommessa | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const chiavi: Array<keyof IvaCommessa> = [
    "aliquota", "valore_commessa", "debito_fatturato", "imponibile_fatturato", "fatture_emesse", "debito_previsto",
    "debito_da_fatturare", "split_payment", "credito_fatture", "imponibile_acquisti", "fatture_ricevute",
    "credito_previsto_costi", "costi_senza_fattura_elettronica", "credito_previsto_ditte", "reverse_charge_imponibile",
    "reverse_charge_iva", "saldo_ad_oggi", "saldo_previsto",
  ];
  return Object.fromEntries(chiavi.map((k) => [k, n(r[k])])) as unknown as IvaCommessa;
}

/** Saldo IVA: quanto si versa (positivo) o quanto resta a credito (negativo). Il reverse charge non entra. */
export function saldoIva(debito: number, credito: number): { importo: number; verso: "versare" | "credito" | "pari" } {
  const importo = Math.round((debito - credito) * 100) / 100;
  return { importo: Math.abs(importo), verso: importo > 0.004 ? "versare" : importo < -0.004 ? "credito" : "pari" };
}
