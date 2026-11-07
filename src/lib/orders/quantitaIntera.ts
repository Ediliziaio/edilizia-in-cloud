import { formatDecimalIT } from "@/lib/parseDecimalIT";

/** I campi di una riga della commessa che servono al conto. */
interface RigaConPrezzi {
  quantity: number;
  stock_item_id?: string | null;
  description?: string | null;
  unit_price?: number | null;
  purchase_price?: number | null;
  standard_cost?: number | null;
}

const arrotonda2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Solo per un ARTICOLO DI MAGAZZINO con quantità non intera: diventa 1 × il
 * totale di riga, perché il magazzino conta pezzi interi (giacenze e scarichi
 * sono interi, e il trigger order_items_magazzino_pezzi_interi rifiuta 12,5 su
 * una riga collegata a un articolo). Prezzo di vendita, costo d'acquisto e costo
 * standard diventano importi di riga; la quantità vera resta nella descrizione.
 *
 * Tutte le altre righe restano come sono, anche 12,5 m²: order_items.quantity
 * ha i decimali dal 20281222140000. Fino ad allora valeva per ogni riga decimale.
 */
export function rigaConQuantitaIntera<T extends RigaConPrezzi>(riga: T): T {
  const quantita = Number(riga.quantity);
  if (!riga.stock_item_id) return riga;
  if (!Number.isFinite(quantita) || Number.isInteger(quantita) || quantita <= 0) return riga;
  const unita = (riga as { unita_misura?: string | null }).unita_misura?.trim();
  const quantitaScritta = `Quantità ${quantita.toLocaleString("it-IT", { maximumFractionDigits: 4 })}`
    + (unita ? ` ${unita}` : "")
    + (riga.unit_price ? ` × ${formatDecimalIT(riga.unit_price)} €` : "");
  const perRiga = (v: number | null | undefined) => (v == null ? v : arrotonda2(Number(v) * quantita));
  return {
    ...riga,
    quantity: 1,
    unit_price: perRiga(riga.unit_price),
    purchase_price: perRiga(riga.purchase_price),
    standard_cost: perRiga(riga.standard_cost),
    description: riga.description?.trim() ? `${riga.description.trim()} · ${quantitaScritta}` : quantitaScritta,
    // «1 × il totale» è una riga a corpo: l'unità vera (m, kg) resta nella descrizione,
    // altrimenti si leggerebbe «1 m × 425 €».
    ...(unita ? { unita_misura: "a corpo" } : {}),
  };
}
