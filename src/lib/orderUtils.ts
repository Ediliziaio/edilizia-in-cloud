import { supabase } from "@/integrations/supabase/client";
import type { OrderItem } from "@/components/orders/OrderItemsList";
import type { PaymentType } from "@/components/orders/FinancialSummary";

// ── Installment type ──────────────────────────────────────────────
export interface Installment {
  id?: string;
  position: number;
  label: string;
  type: 'deposit' | 'balance' | 'financing';
  amount: number;
  is_paid: boolean;
  paid_date?: string | null;
  expected_date?: string | null;
}

export function createDefaultInstallments(paymentType: PaymentType, numInstallments: number = 2): Installment[] {
  if (paymentType === 'financing') {
    const numDeposits = Math.max(0, numInstallments - 2);
    const installments: Installment[] = [];
    for (let i = 0; i < numDeposits; i++) {
      installments.push({
        position: i,
        label: numDeposits === 1 ? 'Acconto' : `Acconto ${i + 1}`,
        type: 'deposit',
        amount: 0,
        is_paid: false,
      });
    }
    installments.push({
      position: installments.length,
      label: 'Finanziamento',
      type: 'financing',
      amount: 0,
      is_paid: false,
    });
    installments.push({
      position: installments.length,
      label: 'Saldo',
      type: 'balance',
      amount: 0,
      is_paid: false,
    });
    return installments;
  }
  const installments: Installment[] = [];
  for (let i = 0; i < numInstallments - 1; i++) {
    installments.push({
      position: i,
      label: numInstallments <= 3 ? `Acconto ${i + 1}` : `Rata ${i + 1}`,
      type: 'deposit',
      amount: 0,
      is_paid: false,
    });
  }
  installments.push({
    position: numInstallments - 1,
    label: 'Saldo',
    type: 'balance',
    amount: 0,
    is_paid: false,
  });
  return installments;
}

export function buildInstallmentsFromLegacy(order: {
  deposit_amount?: number | null;
  deposit_paid?: boolean | null;
  deposit_paid_date?: string | null;
  deposit_expected_date?: string | null;
  deposit_2_amount?: number | null;
  deposit_2_paid?: boolean | null;
  deposit_2_paid_date?: string | null;
  deposit_2_expected_date?: string | null;
  balance_amount?: number | null;
  balance_paid?: boolean | null;
  balance_paid_date?: string | null;
  balance_expected_date?: string | null;
  financing_amount?: number | null;
  financing_paid?: boolean | null;
  financing_paid_date?: string | null;
  financing_expected_date?: string | null;
  payment_type?: string | null;
}): Installment[] {
  const installments: Installment[] = [];
  const paymentType = order.payment_type || 'standard';

  if (paymentType === 'standard') {
    if ((order.deposit_amount || 0) > 0) {
      installments.push({
        position: 0,
        label: 'Acconto 1',
        type: 'deposit',
        amount: order.deposit_amount || 0,
        is_paid: order.deposit_paid || false,
        paid_date: order.deposit_paid_date,
        expected_date: order.deposit_expected_date,
      });
    }
    if ((order.deposit_2_amount || 0) > 0) {
      installments.push({
        position: installments.length,
        label: 'Acconto 2',
        type: 'deposit',
        amount: order.deposit_2_amount || 0,
        is_paid: order.deposit_2_paid || false,
        paid_date: order.deposit_2_paid_date,
        expected_date: order.deposit_2_expected_date,
      });
    }
    installments.push({
      position: installments.length,
      label: 'Saldo',
      type: 'balance',
      amount: order.balance_amount || 0,
      is_paid: order.balance_paid || false,
      paid_date: order.balance_paid_date,
      expected_date: order.balance_expected_date,
    });
  } else {
    if ((order.deposit_amount || 0) > 0) {
      installments.push({
        position: 0,
        label: 'Acconto',
        type: 'deposit',
        amount: order.deposit_amount || 0,
        is_paid: order.deposit_paid || false,
        paid_date: order.deposit_paid_date,
        expected_date: order.deposit_expected_date,
      });
    }
    installments.push({
      position: installments.length,
      label: 'Finanziamento',
      type: 'financing',
      amount: order.financing_amount || 0,
      is_paid: order.financing_paid || false,
      paid_date: order.financing_paid_date,
      expected_date: order.financing_expected_date,
    });
    installments.push({
      position: installments.length,
      label: 'Saldo',
      type: 'balance',
      amount: order.balance_amount || 0,
      is_paid: order.balance_paid || false,
      paid_date: order.balance_paid_date,
      expected_date: order.balance_expected_date,
    });
  }

  return installments;
}

/** Map installments array to legacy order columns for backward compatibility */
export function installmentsToLegacyColumns(installments: Installment[]) {
  const deposits = installments.filter(i => i.type === 'deposit').sort((a, b) => a.position - b.position);
  const balance = installments.find(i => i.type === 'balance');
  const financing = installments.find(i => i.type === 'financing');

  return {
    deposit_amount: deposits[0]?.amount || 0,
    deposit_paid: deposits[0]?.is_paid || false,
    deposit_paid_date: deposits[0]?.paid_date || null,
    deposit_expected_date: deposits[0]?.expected_date || null,
    deposit_2_amount: deposits[1]?.amount || 0,
    deposit_2_paid: deposits[1]?.is_paid || false,
    deposit_2_paid_date: deposits[1]?.paid_date || null,
    deposit_2_expected_date: deposits[1]?.expected_date || null,
    balance_amount: balance?.amount || 0,
    balance_paid: balance?.is_paid || false,
    balance_paid_date: balance?.paid_date || null,
    balance_expected_date: balance?.expected_date || null,
    financing_amount: financing?.amount || 0,
    financing_paid: financing?.is_paid || false,
    financing_paid_date: financing?.paid_date || null,
    financing_expected_date: financing?.expected_date || null,
  };
}

// ── Existing types (unchanged) ────────────────────────────────────

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
  work_start_date?: string | null;
  work_end_date?: string | null;
  warehouse_arrival_date: string | null;
  indirizzo_lavori?: string | null;
  created_at: string;
  current_status_id: string | null;
  financing_amount?: number | null;
  financing_paid?: boolean | null;
  financing_paid_date?: string | null;
  financing_expected_date?: string | null;
  financing_cost?: number | null;
  payment_type?: string | null;
  // ── Modulo Appaltatori ──────────────────────────────────────
  // Default a 'cliente' lato server (migration); manteniamo nullable
  // per safe-fall sui record letti prima del refresh delle types.
  order_type?: "cliente" | "appaltatore_lavoro" | null;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  status: {
    name: string;
    color: string;
  } | null;
  order_items?: Array<{
    id: string;
    status: string | null;
    quantity: number | null;
  }> | null;
  order_employees?: Array<{
    employee?: {
      id: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
  }> | null;
  order_external_teams?: Array<{
    external_team?: {
      id: string;
      name: string | null;
    } | null;
  }> | null;
}

export interface OrderStatus {
  id: string;
  name: string;
  color: string;
  icon?: string;
  position?: number;
  is_default?: boolean;
  is_support_phase?: boolean;
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

export async function deleteOrderCascading(orderId: string, companyId?: string): Promise<void> {
  let orderQuery = supabase.from("orders").select("id").eq("id", orderId);
  if (companyId) orderQuery = orderQuery.eq("company_id", companyId);
  const { data: order, error: orderError } = await orderQuery.maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error("Commessa non trovata o non accessibile.");

  const [
    { count: invoicesCount, error: invoicesError },
    { count: costsCount, error: costsError },
    { count: fiscalDocsCount, error: fiscalDocsError },
    { count: fiscalLinksCount, error: fiscalLinksError },
    { count: installmentsCount, error: installmentsError },
  ] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("order_id", orderId),
    supabase.from("company_costs").select("id", { count: "exact", head: true }).eq("order_id", orderId),
    supabase.from("documenti_fiscali" as never).select("id", { count: "exact", head: true }).eq("ordine_id", orderId).is("deleted_at", null),
    supabase.from("fattura_ordine" as never).select("id", { count: "exact", head: true }).eq("ordine_id", orderId),
    supabase.from("order_installments" as never).select("id", { count: "exact", head: true }).eq("order_id", orderId),
  ]);
  if (invoicesError) throw invoicesError;
  if (costsError) throw costsError;
  if (fiscalDocsError) throw fiscalDocsError;
  if (fiscalLinksError) throw fiscalLinksError;
  if (installmentsError) throw installmentsError;
  const blockers: string[] = [];
  if ((invoicesCount ?? 0) > 0 || (fiscalDocsCount ?? 0) > 0 || (fiscalLinksCount ?? 0) > 0) blockers.push("documenti fiscali/fatture");
  if ((costsCount ?? 0) > 0) blockers.push("costi collegati");
  if ((installmentsCount ?? 0) > 0) blockers.push("scadenze o pagamenti");
  if (blockers.length > 0) {
    throw new Error(`Eliminazione bloccata: la commessa ha ${blockers.join(", ")}. Mantienila nello storico o scollega prima i movimenti.`);
  }

  const { data: items, error: itemsError } = await supabase.from("order_items").select("id").eq("order_id", orderId);
  if (itemsError) throw itemsError;
  if (items && items.length > 0) {
    const itemIds = items.map(i => i.id);
    const { error } = await supabase.from("order_item_attachments").delete().in("order_item_id", itemIds);
    if (error) throw error;
  }
  const results = await Promise.all([
    supabase.from("order_items").delete().eq("order_id", orderId),
    supabase.from("order_status_history").delete().eq("order_id", orderId),
    supabase.from("order_employees").delete().eq("order_id", orderId),
    supabase.from("order_external_teams").delete().eq("order_id", orderId),
    supabase.from("order_salespeople").delete().eq("order_id", orderId),
    supabase.from("order_attachments").delete().eq("order_id", orderId),
    supabase.from("order_errors").delete().eq("order_id", orderId),
    supabase.from("tasks").delete().eq("order_id", orderId),
    supabase.from("appointments").delete().eq("order_id", orderId),
    supabase.from("order_installments").delete().eq("order_id", orderId),
  ]);
  const cascadeError = results.find((result) => result.error)?.error;
  if (cascadeError) throw cascadeError;
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw error;
}

function positiveAmount(value?: number | null): number {
  const amount = Number(value) || 0;
  return amount > 0 ? amount : 0;
}

function getNormalizedPaymentParts(order: Pick<OrderWithDetails,
  "total_amount" | "deposit_amount" | "deposit_2_amount" | "financing_amount" | "balance_amount"
>) {
  const total = positiveAmount(order.total_amount);
  const deposit1 = positiveAmount(order.deposit_amount);
  const deposit2 = positiveAmount(order.deposit_2_amount);
  const financing = positiveAmount(order.financing_amount);
  const rawBalance = positiveAmount(order.balance_amount);
  const residualBalance = Math.max(0, total - deposit1 - deposit2 - financing);
  const rawPlannedTotal = deposit1 + deposit2 + financing + rawBalance;

  let balance = rawBalance;
  if (total > 0 && (rawPlannedTotal > total * 1.01 || rawBalance > residualBalance * 1.01)) {
    balance = residualBalance;
  } else if (total > 0 && rawBalance === 0 && residualBalance > 0) {
    balance = residualBalance;
  }

  return { total, deposit1, deposit2, financing, balance };
}

export function getAmountDue(order: OrderWithDetails): number {
  const parts = getNormalizedPaymentParts(order);
  const collected = getAmountCollected(order);
  let due = 0;
  if (!order.deposit_paid) due += parts.deposit1;
  if (!order.deposit_2_paid) due += parts.deposit2;
  if (parts.financing > 0 && !order.financing_paid) due += parts.financing;
  if (!order.balance_paid) due += parts.balance;
  return parts.total > 0 ? Math.min(due, Math.max(0, parts.total - collected)) : due;
}

export function getAmountCollected(order: OrderWithDetails): number {
  const parts = getNormalizedPaymentParts(order);
  let collected = 0;
  if (order.deposit_paid) collected += parts.deposit1;
  if (order.deposit_2_paid) collected += parts.deposit2;
  if (parts.financing > 0 && order.financing_paid) collected += parts.financing;
  if (order.balance_paid) collected += parts.balance;
  return parts.total > 0 ? Math.min(collected, parts.total) : collected;
}

export function getPendingPayments(order: OrderWithDetails): string[] {
  const pending: string[] = [];
  if (order.deposit_amount > 0 && !order.deposit_paid) pending.push("Acc. 1");
  if (order.deposit_2_amount && order.deposit_2_amount > 0 && !order.deposit_2_paid) pending.push("Acc. 2");
  if (order.balance_amount > 0 && !order.balance_paid) pending.push("Saldo");
  if (order.financing_amount && order.financing_amount > 0 && !order.financing_paid) pending.push("Finanz.");
  return pending;
}

export function getGrossOrderAmount(order: Pick<OrderWithDetails, "total_amount" | "vat_rate">): number {
  return (order.total_amount || 0) * (1 + ((order.vat_rate ?? 22) / 100));
}

export function getOrderMargin(totalAmount: number, variableCosts: number): {
  grossMargin: number;
  marginPercent: number;
  level: "good" | "low" | "negative";
} {
  const grossMargin = totalAmount - variableCosts;
  const marginPercent = totalAmount > 0 ? (grossMargin / totalAmount) * 100 : 0;
  return {
    grossMargin,
    marginPercent,
    level: grossMargin < 0 ? "negative" : marginPercent < 20 ? "low" : "good",
  };
}
