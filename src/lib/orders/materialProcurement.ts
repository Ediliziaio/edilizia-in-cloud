import { errorePrecisioneOda } from "./preparazioneForniture";
import { ODA_STATI_EMESSI } from "@/lib/odaStatus";
import { valoreAsse } from "@/lib/surveys/misureRilievo";

/** Quantities, never inferred from the article name. A purchased service can
 * legitimately be on an OdA; labour classification needs explicit user intent. */
export interface ProcurementItem {
  id?: string;
  name: string;
  quantity: number;
  purchase_price?: number | null;
  prezzo_da_definire?: boolean;
  prezzo_fonte?: string | null;
  supplier_id?: string | null;
  vat_rate?: number | null;
  stock_item_id?: string | null;
  product_code?: string | null;
  riferimento?: string | null;
  specifiche?: string | null;
  measure_status?: string | null;
  misure_preventivo?: Record<string, number> | null;
  misure_da_ordinare?: Record<string, number> | null;
  axis_selections?: Record<string, unknown> | null;
  status?: string | null;
  /** Unità di misura del materiale (vuota = pezzi). */
  unita_misura?: string | null;
  posizioni?: Array<{ descrizione: string; misure?: string | null; quantita: number }> | null;
}

export const daListinoFornitoreSuMisura = (item: Pick<ProcurementItem, "axis_selections">) =>
  item.axis_selections?._fornitura_su_misura === "listino_fornitore";

export function chiaveMisureAcquisto(misure: ProcurementItem["misure_da_ordinare"]): string | null {
  const l = valoreAsse(misure, "larghezza_mm");
  const h = valoreAsse(misure, "altezza_mm");
  return l != null && h != null && positive(l) && positive(h) ? `${l}×${h}` : null;
}

export function fornituraDaVerificare(item: Pick<ProcurementItem, "axis_selections" | "measure_status" | "misure_da_ordinare" | "misure_preventivo">): boolean {
  if (!daListinoFornitoreSuMisura(item) || item.measure_status !== "confermato") return false;
  const chiave = chiaveMisureAcquisto(item.misure_da_ordinare);
  const verificata = item.axis_selections?._misure_listino_verificate ?? chiaveMisureAcquisto(item.misure_preventivo);
  return chiave != null && chiave !== verificata;
}

export function dettaglioFornituraPerOda(item: ProcurementItem): string | null {
  if (!daListinoFornitoreSuMisura(item)) return null;
  const l = valoreAsse(item.misure_da_ordinare, "larghezza_mm");
  const h = valoreAsse(item.misure_da_ordinare, "altezza_mm");
  return [item.riferimento, item.product_code,
    l && h ? `${l} × ${h} mm` : null,
    item.specifiche].filter(Boolean).join(" · ");
}

export function ivaAcquistoMateriale(item: ProcurementItem): number {
  const listino = item.axis_selections?._iva_acquisto_listino;
  return Number(daListinoFornitoreSuMisura(item) && listino != null ? listino : item.vat_rate ?? 22);
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
  else if (daListinoFornitoreSuMisura(item) && (item.measure_status !== "confermato"
    || !chiaveMisureAcquisto(item.misure_da_ordinare))) {
    review = "Conferma le misure del serramento prima di ordinare";
  } else if (fornituraDaVerificare(item)) {
    review = "Misure cambiate: verifica il prezzo e il codice con il fornitore";
  }
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

export function prezzoAcquistoDaDefinire(item: Pick<ProcurementItem,"purchase_price"|"prezzo_da_definire"|"prezzo_fonte">): boolean {
  return item.prezzo_da_definire === true || (!(Number(item.purchase_price) > 0) && !item.prezzo_fonte);
}

export function procurementLines(items: ProcurementItem[]) {
  return items.flatMap(item => {
    if (!item.id || !positive(item.quantity)) throw new Error("Articolo non salvato o quantità non valida");
    const price = Number(item.purchase_price ?? 0);
    // La RPC esistente confronta l'IVA della riga di commessa. Il trigger
    // dell'OdA applica l'aliquota d'acquisto al salvataggio dei serramenti.
    const vat = Number(item.vat_rate ?? 22);
    const vatAcquisto = ivaAcquistoMateriale(item);
    const precisione = errorePrecisioneOda(price, item.quantity, vat);
    if (precisione) throw new Error(`${item.name}: ${precisione}`);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(vat) || vat < 0 || vat > 100) throw new Error("Costo o IVA non validi");
    return (item.posizioni?.length ? item.posizioni.map(p => ({
      description: `${item.name} — ${p.descrizione}${p.misure ? ` ${p.misure}` : ""}`, quantity: p.quantita,
    })) : [{ description: item.name, quantity: item.quantity }]).map(row => {
      const errore = errorePrecisioneOda(price,row.quantity,vatAcquisto);
      if (errore) throw new Error(`${row.description}: ${errore}`);
      return { ...row, order_item_id: item.id!, unit_price: price, vat_rate: vat,
        price_pending: prezzoAcquistoDaDefinire(item), discount_percent: 0, unit_of_measure: unitaMateriale(item) };
    });
  });
}
