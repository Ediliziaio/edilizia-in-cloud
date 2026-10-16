import { format } from "date-fns";
import { calculateGrossFromNet } from "@/lib/vatUtils";
import { safeNumber } from "@/lib/numberUtils";

export type WorkState = "open" | "completed" | "support" | "cancelled" | "unknown";
export interface WorkStatus { id: string; position: number; is_support_phase?: boolean | null }
export interface WorkOrder {
  id: string;
  current_status_id: string | null;
  status: string | null;
  fulfillment_status: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  expected_date: string | null;
  order_code: string | null;
  description: string | null;
}
export type WorkSnapshot = WorkOrder & { work_state: WorkState };

/** Same terminal workflow phase as Commesse. Dates never imply completion. */
export function classifyWorkOrders(orders: WorkOrder[], statuses: WorkStatus[]): WorkSnapshot[] {
  const workflow = statuses.filter(s => !s.is_support_phase);
  const completed = workflow.reduce<WorkStatus | null>((last, s) => !last || s.position > last.position ? s : last, null);
  const byId = new Map(statuses.map(s => [s.id, s]));
  return orders.map(order => {
    const phase = order.current_status_id ? byId.get(order.current_status_id) : undefined;
    let work_state: WorkState;
    if (phase?.is_support_phase) work_state = "support";
    else if (phase) work_state = phase.id === completed?.id ? "completed" : "open";
    else if (["annullato", "cancelled", "canceled"].includes(order.status ?? "")) work_state = "cancelled";
    else if (order.fulfillment_status === "completed" || order.status === "completato") work_state = "completed";
    else work_state = "open";
    return { ...order, work_state };
  });
}

export function isLateWork(order: Pick<WorkSnapshot, "work_state" | "work_end_date" | "expected_date">, today = new Date()): boolean {
  const deadline = order.work_end_date || order.expected_date;
  return order.work_state === "open" && !!deadline && deadline < format(today, "yyyy-MM-dd");
}

export function registeredCostAmount(row: {amount: number | null; vat_rate?: number | null}): number {
  return calculateGrossFromNet(safeNumber(row.amount), safeNumber(row.vat_rate)).grossAmount;
}

export interface OpenPayment { amount: number | null; expected_date: string | null }
/** Remaining scheduled flows, not movements or the balance of a bank account. */
export function scheduledMonthFlows(payments: OpenPayment[], costs: Array<{amount: number | null; due_date: string | null; vat_rate?: number | null}>, today = new Date()) {
  const from = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd");
  const until = format(new Date(today.getFullYear(), today.getMonth() + 1, 1), "yyyy-MM-dd");
  let incoming = 0, outgoing = 0, priorReceivables = 0, priorPayables = 0;
  for (const row of payments) {
    const amount = Math.max(0, safeNumber(row.amount));
    if (row.expected_date && row.expected_date < from) priorReceivables += amount;
    else if (row.expected_date && row.expected_date < until) incoming += amount;
  }
  for (const row of costs) {
    const amount = registeredCostAmount(row);
    if (row.due_date && row.due_date < from) priorPayables += amount;
    else if (row.due_date && row.due_date < until) outgoing += amount;
  }
  return { incoming, outgoing, priorReceivables, priorPayables, net: incoming - outgoing };
}

export function recordedMonthIncome(rows: Array<{amount: number | null; is_paid: boolean; paid_date: string | null}>, today = new Date()): number {
  const from = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd");
  const until = format(new Date(today.getFullYear(), today.getMonth() + 1, 1), "yyyy-MM-dd");
  return rows.reduce((sum, row) => row.is_paid && row.paid_date && row.paid_date.slice(0, 10) >= from && row.paid_date.slice(0, 10) < until && row.paid_date.slice(0, 10) <= format(today, "yyyy-MM-dd") ? sum + safeNumber(row.amount) : sum, 0);
}

export function upcomingWorkDeliveries(orders: Pick<WorkSnapshot, "work_state" | "expected_date">[], from: string, until: string): number {
  return orders.filter(o => o.work_state === "open" && !!o.expected_date && o.expected_date >= from && o.expected_date <= until).length;
}
