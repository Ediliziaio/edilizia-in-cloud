import { faseDiAppartenenza } from "./rapportinoFasi";

export interface RapportinoMaterialDraft {
  nome: string;
  quantita: number;
  unita?: string;
  /** La fase scelta dall'operaio per questo materiale (vedi rapportinoFasi.ts). */
  faseId?: string;
  /** Explicit identity only; a report does not create another warehouse withdrawal. */
  stockItemId?: string;
  orderItemId?: string | null;
}

export const rapportinoStockSelectionKey = (stockId: string) => `libero_stock_${stockId}`;

export function restoreRapportinoMaterials(materials: { nome: string; quantita: number; unita?: string; order_item_id?: string; stock_item_id?: string; fase_id?: string }[]): Record<string, RapportinoMaterialDraft> {
  const selection: Record<string, RapportinoMaterialDraft> = {};
  materials.forEach((m, i) => {
    const base = m.stock_item_id ? rapportinoStockSelectionKey(m.stock_item_id) : m.order_item_id ?? `libero_${i}`;
    const key = base in selection ? `${base}:material:${i}` : base;
    selection[key] = { nome: m.nome, quantita: Number(m.quantita), unita: m.unita,
      orderItemId: m.order_item_id ?? null,
      ...(m.stock_item_id ? { stockItemId: m.stock_item_id } : {}),
      ...(m.fase_id ? { faseId: m.fase_id } : {}) };
  });
  return selection;
}

export interface RapportinoArticle {
  id: string;
  name: string;
  categoria?: string | null;
  stock_item_id?: string | null;
  /** Delivery-backed choices may have no unique bill-of-quantities parent. */
  order_item_id?: string | null;
  template?: { unit_of_measure: string | null; category: string | null } | null;
}

/** Classify explicit metadata only: a name is not proof of a stock item/service. */
export function rapportinoArticleKind(article: RapportinoArticle): "material" | "service" | "unknown" {
  const category = (article.categoria?.trim() || article.template?.category?.trim() || "").toLowerCase();
  if (["manodopera", "servizio", "servizi", "prestazione", "prestazioni", "lavorazione", "lavorazioni", "subappalto", "subappalti", "noleggio", "noleggi", "trasporto", "trasporti"].includes(category)) return "service";
  if (["materiale", "materiali", "magazzino", "consumabili", "attrezzature"].includes(category) || article.stock_item_id) return "material";
  return "unknown";
}

export function rapportinoMaterialUnit(raw?: string | null): string {
  const unit = raw?.trim() || "";
  return ({ mq: "m²", m2: "m²", mc: "m³", m3: "m³", pezzi: "pz", pezzo: "pz", litri: "l", litro: "l" } as Record<string, string>)[unit.toLowerCase()] ?? unit;
}

export function rapportinoUnitOptions(unit?: string): string[] {
  return Array.from(new Set(["pz", "m", "m²", "m³", "kg", "l", "sacco", "confezione", ...(unit ? [unit] : [])]));
}

/**
 * Keep the order article reference in the existing JSON payload; no stock movement.
 * Con `fasiDichiarate` ogni materiale porta anche la fase a cui appartiene (`fase_id`), se ce n'è una.
 */
export function buildRapportinoMaterials(selection: Record<string, RapportinoMaterialDraft>, fasiDichiarate: string[] = []) {
  return Object.entries(selection).map(([key, material]) => {
    if (!Number.isFinite(material.quantita) || material.quantita <= 0) {
      throw new Error(`Indica una quantità maggiore di zero per ${material.nome}`);
    }
    const unita = rapportinoMaterialUnit(material.unita);
    if (!unita) throw new Error(`Scegli l'unità di misura per ${material.nome}`);
    const fase = faseDiAppartenenza(material.faseId, fasiDichiarate);
    const orderItemId = material.orderItemId === undefined ? (!key.startsWith('libero_') ? key : null) : material.orderItemId;
    return {
      nome: material.nome,
      quantita: material.quantita,
      unita,
      da_furgone: false,
      ...(orderItemId ? { order_item_id: orderItemId } : {}),
      ...(material.stockItemId ? { stock_item_id: material.stockItemId } : {}),
      ...(fase ? { fase_id: fase } : {}),
    };
  });
}
