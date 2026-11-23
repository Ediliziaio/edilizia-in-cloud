import { nettoUnitaInLordo } from "@/lib/orders/incassiCommessa";
import {getAmountCollected, getAmountDue, getGrossOrderAmount, type OrderPaymentDetails, type OrderWithDetails} from "@/lib/orderUtils";
import { netOrderTotals } from "./summaryIndicators";

export function orderYear(order: Pick<OrderWithDetails, "created_at">): number {
  return new Date(order.created_at).getFullYear();
}

/** Reasons overlap; the scope itself always contains each order once. */
export function previousOrderReasons(order: OrderWithDetails, year: number, completedId: string | null, supportId: string | null, ticketIds: ReadonlySet<string>): string[] {
  if (orderYear(order) >= year || !Number.isFinite(orderYear(order))) return [];
  const reasons: string[] = [];
  if (!completedId || (order.current_status_id !== completedId && (!supportId || order.current_status_id !== supportId))) reasons.push("Lavori aperti");
  if ((supportId && order.current_status_id === supportId) || ticketIds.has(order.id)) reasons.push("Assistenza aperta");
  if (getAmountDue(order) > 0) reasons.push("Saldo da incassare");
  return reasons;
}

export function currentManagementScope<T extends OrderWithDetails>(orders: T[], year: number, completedId: string | null, supportId: string | null, ticketIds: ReadonlySet<string>): T[] {
  return orders.filter(order => orderYear(order) === year || previousOrderReasons(order, year, completedId, supportId, ticketIds).length > 0);
}

/**
 * `incassiUnita`: caparre, acconti e saldi delle unità in vendita (commesse generali), per commessa.
 * Si prende il più alto tra rate/fatture e incassi dell'unità (stessi soldi, mai sommati).
 */
type OrderEconomicPayment = OrderPaymentDetails & Pick<OrderWithDetails, "id">;

export function orderEconomics(orders: readonly OrderEconomicPayment[], incassiUnita?: ReadonlyMap<string, number>, permuteUnita?: ReadonlyMap<string, number>) {
  return orders.reduce((total, order) => {
    const daRate = getAmountCollected(order);
    const inPiu = order.incasso_unita_lordo!=null ? 0 : Math.max(0, nettoUnitaInLordo(incassiUnita?.get(order.id) ?? 0, order.vat_rate) - daRate);
    return {
      count: total.count + 1,
      sold: total.sold + getGrossOrderAmount(order),
      collected: total.collected + daRate + inPiu,
      pending: total.pending + Math.max(0, getAmountDue(order) - inPiu - nettoUnitaInLordo(permuteUnita?.get(order.id) ?? 0, order.vat_rate)),
    };
  }, {count: 0, sold: 0, collected: 0, pending: 0});
}

/** Una riga economica per commessa, condivisa da riepilogo e grafico. */
export function orderEconomicsRow(
  order: OrderEconomicPayment & Pick<OrderWithDetails, "created_at"> & Partial<Pick<OrderWithDetails, "expected_date" | "current_status_id">>,
  incassiUnita?: ReadonlyMap<string, number>,
  permuteUnita?: ReadonlyMap<string, number>,
) {
  return {
    id: order.id,
    created_at: order.created_at,
    expected_date: order.expected_date,
    current_status_id: order.current_status_id,
    vatRate: order.vat_rate ?? null,
    ...orderEconomics([order], incassiUnita, permuteUnita),
  };
}

export function summarizeOrderEconomics(rows: readonly ReturnType<typeof orderEconomicsRow>[]) {
  const gross = { count: rows.length, sold: 0, collected: 0, pending: 0 };
  for (const row of rows) {
    gross.sold += row.sold;
    gross.collected += row.collected;
    gross.pending += row.pending;
  }
  return { gross, vat: netOrderTotals(rows), ids: rows.map(row => row.id) };
}

export type OrderScopeGroup = "all" | "annual" | "previous";
export function orderScopeGroupIds(orders: OrderWithDetails[], group: OrderScopeGroup, year: number): string[] {
  return orders.filter(order => group === "all" || (group === "annual" ? orderYear(order) === year : orderYear(order) < year)).map(order => order.id);
}

export function orderWorkflowCounts(orders: OrderWithDetails[], completedId: string | null, supportId: string | null, supportOrderIds: ReadonlySet<string>) {
  return {
    toComplete: orders.filter(order => (!completedId || order.current_status_id !== completedId) && (!supportId || order.current_status_id !== supportId)).length,
    completed: completedId ? orders.filter(order => order.current_status_id === completedId).length : 0,
    support: orders.filter(order => (!!supportId && order.current_status_id === supportId) || supportOrderIds.has(order.id)).length,
  };
}
