import { formatDecimalIT } from "@/lib/parseDecimalIT";

/** I campi di una riga della commessa che servono al conto. */
interface RigaConPrezzi {
  quantity: number;
  description?: string | null;
  unit_price?: number | null;
  purchase_price?: number | null;
  standard_cost?: number | null;
}

const arrotonda2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Una riga con quantità non intera («massetto 12,5 mq») diventa 1 × il totale
 * di riga, come nel simulatore (`src/lib/simulatore/trasforma.ts`):
 * `order_items.quantity` è un intero e `create_order_atomic` lo converte, quindi
 * 12,5 la farebbe fallire. Prezzo di vendita, costo d'acquisto e costo standard
 * diventano importi di riga; la quantità vera resta scritta nella descrizione.
 * Le righe con quantità intera restano come sono.
 */
export function rigaConQuantitaIntera<T extends RigaConPrezzi>(riga: T): T {
  const quantita = Number(riga.quantity);
  if (!Number.isFinite(quantita) || Number.isInteger(quantita) || quantita <= 0) return riga;
  const quantitaScritta = `Quantità ${quantita.toLocaleString("it-IT", { maximumFractionDigits: 4 })}`
    + (riga.unit_price ? ` × ${formatDecimalIT(riga.unit_price)} €` : "");
  const perRiga = (v: number | null | undefined) => (v == null ? v : arrotonda2(Number(v) * quantita));
  return {
    ...riga,
    quantity: 1,
    unit_price: perRiga(riga.unit_price),
    purchase_price: perRiga(riga.purchase_price),
    standard_cost: perRiga(riga.standard_cost),
    description: riga.description?.trim() ? `${riga.description.trim()} · ${quantitaScritta}` : quantitaScritta,
  };
}
