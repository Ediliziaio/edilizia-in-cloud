import {getAmountCollected, getAmountDue, getGrossOrderAmount, type OrderWithDetails} from "@/lib/orderUtils";

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

export function orderEconomics(orders: OrderWithDetails[]) {
  return orders.reduce((total, order) => ({
    count: total.count + 1,
    sold: total.sold + getGrossOrderAmount(order),
    collected: total.collected + getAmountCollected(order),
    pending: total.pending + getAmountDue(order),
  }), {count: 0, sold: 0, collected: 0, pending: 0});
}
