/**
 * Un ordine d'acquisto nato dalla commessa, nel popup «Nuovo ordine» (30/10/2026).
 *
 * Prima dalla commessa si poteva solo «Crea bozza OdA», e solo con articoli
 * che avevano già fornitore e prezzo: con zero articoli pronti il pulsante
 * restava spento e l'ordine si faceva altrove. Qui le righe vengono da due
 * parti: gli articoli della commessa ancora da comprare (collegati con
 * order_item_id, così il pianificatore sa cosa è coperto) e righe libere per
 * quello che in commessa non c'è (un sacco di malta, un noleggio).
 */
import { unitaMateriale, type ProcurementItem } from "./materialProcurement";

export interface RigaNuovoOda {
  /** Chiave locale della riga nel popup. */
  key: string;
  /** L'articolo della commessa da cui viene, se viene da lì. */
  order_item_id: string | null;
  description: string;
  quantity: number;
  unit_of_measure: string;
  unit_price: number;
  vat_rate: number;
  /** Solo per le righe degli articoli: spuntata = entra nell'ordine. */
  scelta: boolean;
  /** Il fornitore indicato sull'articolo, se c'è. */
  fornitore_articolo?: string | null;
}

const n = (v: unknown, d = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};
const centesimi = (x: number) => Math.round(x * 100) / 100;

/**
 * Le righe dagli articoli ancora da comprare. Spuntate solo quelle del
 * fornitore scelto (o senza fornitore, se non ne è scelto nessuno): le altre
 * restano in elenco, si spuntano a mano.
 */
export function righeDagliArticoli(daComprare: ProcurementItem[], fornitoreScelto: string | null): RigaNuovoOda[] {
  return daComprare
    .filter((i) => !!i.id && n(i.quantity) > 0)
    .map((i) => ({
      key: `art:${i.id}`,
      order_item_id: i.id!,
      description: i.name,
      quantity: n(i.quantity),
      unit_of_measure: unitaMateriale(i),
      unit_price: n(i.purchase_price),
      vat_rate: n(i.vat_rate, 22),
      scelta: !!fornitoreScelto && i.supplier_id === fornitoreScelto,
      fornitore_articolo: i.supplier_id ?? null,
    }));
}

export function rigaLibera(key: string): RigaNuovoOda {
  return { key, order_item_id: null, description: "", quantity: 1, unit_of_measure: "pz", unit_price: 0, vat_rate: 22, scelta: true };
}

/** Le righe che entrano nell'ordine: le libere sempre, quelle degli articoli se spuntate. */
export function righeInOrdine(righe: RigaNuovoOda[]): RigaNuovoOda[] {
  return righe.filter((r) => (r.order_item_id ? r.scelta : true));
}

export interface TotaliNuovoOda {
  imponibile: number;
  iva: number;
  totale: number;
}

export function totaliNuovoOda(righe: RigaNuovoOda[]): TotaliNuovoOda {
  let imponibile = 0;
  let iva = 0;
  for (const r of righeInOrdine(righe)) {
    const riga = n(r.quantity) * n(r.unit_price);
    imponibile += riga;
    iva += (riga * n(r.vat_rate)) / 100;
  }
  return { imponibile: centesimi(imponibile), iva: centesimi(iva), totale: centesimi(imponibile + iva) };
}

/** Il motivo per cui l'ordine non si può creare, o null. */
export function erroreNuovoOda(input: { fornitore: string | null; origine: string | null; righe: RigaNuovoOda[] }): string | null {
  if (!input.fornitore) return "Scegli il fornitore.";
  if (!input.origine) return "Scegli come lo ordini.";
  const dentro = righeInOrdine(input.righe);
  if (dentro.length === 0) return "Aggiungi almeno una riga: spunta un articolo o scrivine una.";
  for (const r of dentro) {
    if (!r.description.trim()) return "Ogni riga ha bisogno di una descrizione.";
    if (!(n(r.quantity) > 0)) return `«${r.description.trim()}»: la quantità deve essere maggiore di zero.`;
    if (n(r.unit_price, -1) < 0) return `«${r.description.trim()}»: il prezzo non può essere negativo.`;
    if (n(r.vat_rate, -1) < 0 || n(r.vat_rate) > 100) return `«${r.description.trim()}»: l'IVA va da 0 a 100.`;
  }
  return null;
}

/** Le righe come le vuole purchase_order_items. */
export function righePerDatabase(righe: RigaNuovoOda[], companyId: string, poId: string) {
  return righeInOrdine(righe).map((r, i) => ({
    company_id: companyId,
    purchase_order_id: poId,
    order_item_id: r.order_item_id,
    description: r.description.trim(),
    quantity: n(r.quantity),
    unit_of_measure: r.unit_of_measure.trim() || "pz",
    unit_price: n(r.unit_price),
    vat_rate: n(r.vat_rate, 22),
    discount_percent: 0,
    sort_order: i,
  }));
}
