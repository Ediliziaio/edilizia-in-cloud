import { supabase } from "@/integrations/supabase/client";
import type { OrderItem } from "@/components/orders/OrderItemsList";

export interface OrderWithDetails {
  id: string;
  order_code: string | null;
  description: string;
  total_amount: number;
  vat_rate?: number | null;
  deposit_amount: number;
  deposit_paid: boolean | null;
  deposit_2_amount: number | null;
  deposit_2_paid: boolean | null;
  balance_amount: number;
  balance_paid: boolean | null;
  expected_date: string | null;
  warehouse_arrival_date: string | null;
  created_at: string;
  current_status_id: string | null;
  // Financing
  financing_amount?: number | null;
  financing_paid?: boolean | null;
  financing_paid_date?: string | null;
  financing_expected_date?: string | null;
  financing_cost?: number | null;
  payment_type?: string | null;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  status: {
    name: string;
    color: string;
  } | null;
}

export interface OrderStatus {
  id: string;
  name: string;
  color: string;
  icon?: string;
  position?: number;
}

export interface OrderCustomer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface OrderItemData {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  status: string;
  position: number;
  supplier_id: string | null;
  purchase_price: number | null;
  vat_rate: number | null;
  stock_item_id: string | null;
  is_paid: boolean | null;
  paid_date: string | null;
  payment_method: string | null;
  unit_price: number | null;
  discount_percent: number | null;
  standard_cost: number | null;
  deposit_amount: number | null;
  deposit_paid: boolean | null;
  deposit_paid_date: string | null;
  balance_amount: number | null;
  balance_paid: boolean | null;
  balance_paid_date: string | null;
  balance_expected_date: string | null;
  deposit_expected_date: string | null;
}

export function mapDbItemToOrderItem(item: OrderItemData): OrderItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description || undefined,
    quantity: item.quantity,
    status: item.status as OrderItem['status'],
    position: item.position,
    supplier_id: item.supplier_id || undefined,
    purchase_price: item.purchase_price || undefined,
    vat_rate: item.vat_rate ?? undefined,
    stock_item_id: item.stock_item_id || undefined,
    is_paid: item.is_paid || false,
    paid_date: item.paid_date || undefined,
    payment_method: item.payment_method || undefined,
    deposit_amount: item.deposit_amount || 0,
    deposit_paid: item.deposit_paid || false,
    deposit_paid_date: item.deposit_paid_date || undefined,
    balance_amount: item.balance_amount || 0,
    balance_paid: item.balance_paid || false,
    balance_paid_date: item.balance_paid_date || undefined,
    balance_expected_date: item.balance_expected_date || undefined,
    deposit_expected_date: item.deposit_expected_date || undefined,
  };
}

export async function deleteOrderCascading(orderId: string): Promise<void> {
  // First get item IDs to delete their attachments
  const { data: items } = await supabase.from("order_items").select("id").eq("order_id", orderId);
  if (items && items.length > 0) {
    const itemIds = items.map(i => i.id);
    await supabase.from("order_item_attachments").delete().in("order_item_id", itemIds);
  }
  // Delete all related records in parallel
  await Promise.all([
    supabase.from("order_items").delete().eq("order_id", orderId),
    supabase.from("order_status_history").delete().eq("order_id", orderId),
    supabase.from("order_employees").delete().eq("order_id", orderId),
    supabase.from("order_external_teams").delete().eq("order_id", orderId),
    supabase.from("order_salespeople").delete().eq("order_id", orderId),
    supabase.from("order_attachments").delete().eq("order_id", orderId),
    supabase.from("order_errors").delete().eq("order_id", orderId),
    supabase.from("tasks").delete().eq("order_id", orderId),
    supabase.from("appointments").delete().eq("order_id", orderId),
  ]);
  // Finally delete the order itself
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw error;
}

export function getAmountDue(order: OrderWithDetails): number {
  let due = 0;
  if (!order.deposit_paid) due += order.deposit_amount || 0;
  if (!order.deposit_2_paid) due += (order.deposit_2_amount || 0);
  if (!order.balance_paid) due += order.balance_amount || 0;
  return due;
}

export function getAmountCollected(order: OrderWithDetails): number {
  let collected = 0;
  if (order.deposit_paid) collected += order.deposit_amount || 0;
  if (order.deposit_2_paid) collected += (order.deposit_2_amount || 0);
  if (order.balance_paid) collected += order.balance_amount || 0;
  return collected;
}

export function getPendingPayments(order: OrderWithDetails): string[] {
  const pending: string[] = [];
  if (order.deposit_amount > 0 && !order.deposit_paid) pending.push("Acc. 1");
  if (order.deposit_2_amount && order.deposit_2_amount > 0 && !order.deposit_2_paid) pending.push("Acc. 2");
  if (order.balance_amount > 0 && !order.balance_paid) pending.push("Saldo");
  if (order.financing_amount && order.financing_amount > 0 && !order.financing_paid) pending.push("Finanz.");
  return pending;
}
