import { ODA_STATI_EMESSI } from "@/lib/odaStatus";

/** Quantities, never inferred from the article name. A purchased service can
 * legitimately be on an OdA; labour classification needs explicit user intent. */
export interface ProcurementItem {
  id?: string;
  name: string;
  quantity: number;
  purchase_price?: number | null;
  supplier_id?: string | null;
  vat_rate?: number | null;
  stock_item_id?: string | null;
  status?: string | null;
  /** Unità di misura del materiale (vuota = pezzi). */
  unita_misura?: string | null;
  posizioni?: Array<{ descrizione: string; misure?: string | null; quantita: number }> | null;
}

export interface ProcurementCoverage {
  id: string;
  order_item_id: string | null;
  quantity: number;
  quantity_received: number;
  unit_of_measure?: string | null;
  purchase_orders: { id: string; oda_number: string; status: string; issue_date?: string | null; expected_delivery_date?: string | null; actual_delivery_date?: string | null };
}

/** Unità del materiale: quella scritta sulla riga, altrimenti pezzi come prima. */
export function unitaMateriale(item: { unita_misura?: string | null }): string {
  return (item.unita_misura ?? "").trim().toLowerCase() || "pz";
}

const roundQty = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

/** A draft or cancelled purchase is not a supplier commitment. Shared with
 * the phase board, so its badge follows the same rules as procurement. */
export function issuedPurchaseOrderNumber(order: { oda_number: string; status: string } | null | undefined): string | null {
  return order && (ODA_STATI_EMESSI as string[]).includes(order.status) ? order.oda_number : null;
}

export function planMaterial(item: ProcurementItem, rows: ProcurementCoverage[]) {
  const active = rows.filter(r => r.order_item_id === item.id && r.purchase_orders.status !== "annullato");
  const drafted = roundQty(active.filter(r => r.purchase_orders.status === "bozza").reduce((n, r) => n + Number(r.quantity), 0));
  const issued = roundQty(active.filter(r => (ODA_STATI_EMESSI as string[]).includes(r.purchase_orders.status)).reduce((n, r) => n + Number(r.quantity), 0));
  const received = roundQty(active.filter(r => (ODA_STATI_EMESSI as string[]).includes(r.purchase_orders.status)).reduce((n, r) => n + Number(r.quantity_received), 0));
  const covered = roundQty(active.reduce((n, r) => n + Number(r.quantity), 0));
  const required = Number(item.quantity);
  const remaining = positive(required) ? roundQty(Math.max(0, required - covered)) : 0;
  const unitaScritta = (item.unita_misura ?? "").trim().toLowerCase();
  const unitaOrdine = active.map(r => (r.unit_of_measure ?? "").trim().toLowerCase()).find(u => u && u !== unitaMateriale(item));
  const ordini = [...new Map(active.map(r => [r.purchase_orders.id, { id: r.purchase_orders.id, oda_number: r.purchase_orders.oda_number }])).values()];
  let review: string | null = null;
  if (!positive(required)) review = "Quantità prevista non valida";
  else if (unitaOrdine && (unitaScritta || remaining > 0)) {
    // Never compare boxes/kg/m² with a quantity in another unit, or generate
    // a residual by guessing a ratio. Un articolo senza unità già tutto coperto non ha residuo
    // da calcolare: «1 a corpo» su «1» non è una differenza, è un'unità mai scritta.
    review = `Unità di misura diversa: ordine in «${unitaOrdine}», articolo in «${unitaScritta || "pz"}»`;
  }
  else if (item.posizioni?.length && (item.posizioni.some(p => !positive(p.quantita)) || Math.abs(item.posizioni.reduce((n, p) => n + Number(p.quantita), 0) - required) > 0.000001)) {
    review = "La distinta non coincide con la quantità prevista";
  } else if (item.posizioni?.length && covered > 0 && remaining > 0) {
    // No position ID in purchase_order_items: never guess which openings remain.
    review = "Distinta parzialmente coperta: verifica le posizioni nell’OdA";
  } else if (!item.stock_item_id && remaining > 0 && item.status && item.status !== "da_ordinare" && covered === 0) {
    review = "Stato avanzato senza OdA collegato: verifica prima di riordinare";
  }
  return { item, drafted, issued, received, covered, remaining, review, ordini,
    ricevuto: positive(required) && received >= required,
    overOrdered: positive(required) && covered > required,
    canOrder: !!item.id && !item.stock_item_id && remaining > 0 && !review,
  };
}

/** La riga di un ordine nella commessa: quante righe sono arrivate e se la consegna è in ritardo. */
export function avanzamentoOrdine(
  ordine: { status: string; expected_delivery_date?: string | null; righe?: Array<{ quantity: number; quantity_received: number }> | null },
  oggi: string,
) {
  const righe = ordine.righe ?? [];
  const aperto = ["inviato", "confermato", "parziale"].includes(ordine.status);
  return {
    righeTotali: righe.length,
    righeArrivate: righe.filter(r => positive(r.quantity) && Number(r.quantity_received) >= Number(r.quantity)).length,
    aperto,
    inRitardo: aperto && !!ordine.expected_delivery_date && ordine.expected_delivery_date.slice(0, 10) < oggi,
  };
}

export function pendingMaterials<T extends ProcurementItem>(items: T[], rows: ProcurementCoverage[]): T[] {
  return items.flatMap(item => {
    const plan = planMaterial(item, rows);
    return plan.canOrder ? [{ ...item, quantity: plan.remaining }] : [];
  });
}

export function procurementLines(items: ProcurementItem[]) {
  return items.flatMap(item => {
    if (!item.id || !positive(item.quantity)) throw new Error("Articolo non salvato o quantità non valida");
    const price = Number(item.purchase_price ?? 0);
    const vat = Number(item.vat_rate ?? 22);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(vat) || vat < 0 || vat > 100) throw new Error("Costo o IVA non validi");
    return (item.posizioni?.length ? item.posizioni.map(p => ({
      description: `${item.name} — ${p.descrizione}${p.misure ? ` ${p.misure}` : ""}`, quantity: p.quantita,
    })) : [{ description: item.name, quantity: item.quantity }]).map(row => ({
      ...row, order_item_id: item.id!, unit_price: price, vat_rate: vat,
      discount_percent: 0, unit_of_measure: unitaMateriale(item),
    }));
  });
}
