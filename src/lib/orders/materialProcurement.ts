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
  posizioni?: Array<{ descrizione: string; misure?: string | null; quantita: number }> | null;
}

export interface ProcurementCoverage {
  id: string;
  order_item_id: string | null;
  quantity: number;
  quantity_received: number;
  unit_of_measure?: string | null;
  purchase_orders: { id: string; oda_number: string; status: string };
}

const roundQty = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

export function planMaterial(item: ProcurementItem, rows: ProcurementCoverage[]) {
  const active = rows.filter(r => r.order_item_id === item.id && r.purchase_orders.status !== "annullato");
  const drafted = roundQty(active.filter(r => r.purchase_orders.status === "bozza").reduce((n, r) => n + Number(r.quantity), 0));
  const issued = roundQty(active.filter(r => (ODA_STATI_EMESSI as string[]).includes(r.purchase_orders.status)).reduce((n, r) => n + Number(r.quantity), 0));
  const received = roundQty(active.filter(r => (ODA_STATI_EMESSI as string[]).includes(r.purchase_orders.status)).reduce((n, r) => n + Number(r.quantity_received), 0));
  const covered = roundQty(active.reduce((n, r) => n + Number(r.quantity), 0));
  const required = Number(item.quantity);
  const remaining = positive(required) ? roundQty(Math.max(0, required - covered)) : 0;
  let review: string | null = null;
  if (!positive(required)) review = "Quantità prevista non valida";
  else if (active.some(r => r.unit_of_measure && r.unit_of_measure.trim().toLowerCase() !== "pz")) {
    // order_items has no canonical unit column yet; cannot compare boxes/kg/m²
    // to its legacy piece quantity, or generate a residual by guessing a ratio.
    review = "Unità di misura dell’OdA da verificare prima di calcolare il residuo";
  }
  else if (item.posizioni?.length && (item.posizioni.some(p => !positive(p.quantita)) || Math.abs(item.posizioni.reduce((n, p) => n + Number(p.quantita), 0) - required) > 0.000001)) {
    review = "La distinta non coincide con la quantità prevista";
  } else if (item.posizioni?.length && covered > 0 && remaining > 0) {
    // No position ID in purchase_order_items: never guess which openings remain.
    review = "Distinta parzialmente coperta: verifica le posizioni nell’OdA";
  } else if (!item.stock_item_id && remaining > 0 && item.status && item.status !== "da_ordinare" && covered === 0) {
    review = "Stato avanzato senza OdA collegato: verifica prima di riordinare";
  }
  return { item, drafted, issued, received, covered, remaining, review,
    overOrdered: positive(required) && covered > required,
    canOrder: !!item.id && !item.stock_item_id && remaining > 0 && !review,
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
      discount_percent: 0, unit_of_measure: "pz",
    }));
  });
}
