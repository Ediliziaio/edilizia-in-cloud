/**
 * Un nuovo lavoro per un cliente che hai già: le righe si possono riprendere da un lavoro precedente (09/11/2026).
 * Si copia cosa si fa e a che prezzo; non si copia niente di quello che è successo (fornitori, pagamenti, consegne).
 */
import type { OrderItem } from "@/components/orders/OrderItemsList";

export const COLONNE_RIGHE_LAVORO = "name, description, quantity, unit_price, discount_percent, vat_rate, standard_cost, unita_misura, categoria, article_template_id, product_code, position";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function righeDaLavoroPrecedente(voci: ReadonlyArray<Record<string, any>>): OrderItem[] {
  return voci.map((v, position) => ({
    name: String(v.name ?? ""), description: v.description ?? undefined, quantity: Number(v.quantity) || 1, status: "da_ordinare", position,
    unit_price: Number(v.unit_price) || 0, discount_percent: Number(v.discount_percent) || 0, vat_rate: v.vat_rate ?? undefined, standard_cost: Number(v.standard_cost) || 0,
    unita_misura: v.unita_misura ?? null, categoria: v.categoria ?? null, article_template_id: v.article_template_id ?? null, product_code: v.product_code ?? null,
  }));
}

/** Il totale delle righe, per non doverlo riscrivere. */
export const totaleDelleRighe = (righe: ReadonlyArray<OrderItem>): number =>
  Math.round(righe.reduce((s, r) => s + (r.quantity || 0) * (r.unit_price || 0) * (1 - (r.discount_percent || 0) / 100), 0) * 100) / 100;
