/**
 * Il ricavo NETTO di un preventivo, quello su cui si calcola il margine.
 *
 * Con il prezzo scritto a mano le righe stanno a 0 € e il ricavo vero è quello
 * salvato sul preventivo (prezzo − sconto). Altrimenti è la somma delle righe
 * VENDUTE (senza le opzionali) meno lo sconto globale: la pagina «Margine &
 * Pianificazione» e la scheda rapida sommavano le righe al lordo dello sconto
 * globale, e il margine usciva più alto di quello del builder (10.000 € a
 * costo 6.000 con un 10% di sconto: 40% invece di 33,3%).
 */
const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function ricavoNettoPreventivo(input: {
  prezzoManualeAttivo: boolean;
  subtotal?: unknown;
  discount_amount?: unknown;
  discount_percent?: unknown;
  /** Somma delle righe vendute (non opzionali), prima dello sconto globale. */
  sommaRighe: number;
}): number {
  if (input.prezzoManualeAttivo) {
    return Math.round((num(input.subtotal) - num(input.discount_amount)) * 100) / 100;
  }
  const fattore = 1 - num(input.discount_percent) / 100;
  return Math.round(num(input.sommaRighe) * fattore * 100) / 100;
}
