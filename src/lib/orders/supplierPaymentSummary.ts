/** Supplier cash is not the material budget. All amounts here are document gross amounts.
 * Bank reconciliations mirror prima nota and must NEVER be added a second time.
 * Ambiguous costs/credit notes stay visible for review instead of inventing a payment.
 */
export interface SupplierOrder {
  id: string; supplier_id: string | null; oda_number: string; status: string; total: number | null;
}
export interface SupplierInvoice {
  id: string; purchase_order_id: string | null; company_cost_id: string | null;
  prima_nota_id: string | null; cedente_ragione_sociale: string;
  cedente_piva: string | null; numero_fattura: string; totale_documento: number | null;
  tipo_documento: string; stato: string;
}
export interface SupplierCashEntry {
  id: string; cost_id: string | null; supplier_id: string | null;
  scadenza_id: string | null; amount: number; direction: string;
}
export interface SupplierDue {
  id: string; cost_id: string | null; supplier_id: string | null;
  amount: number; paid_amount: number; due_date: string; status: string;
}
export interface SupplierBudgetItem {
  supplier_id: string | null; purchase_price: number | null; quantity: number;
}
export interface SupplierPaymentGroup {
  key: string; name: string; ordered: number; invoiced: number; paid: number;
  unpaid: number; estimated: number; review: number; nextDeadline: string | null;
  orders: SupplierOrder[]; invoiceCount: number; reviewCount: number;
}
const cents = (v: number | null | undefined) => Number.isFinite(v) ? Math.round(Number(v) * 100) : 0;
const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map(r => [r.id, r])).values()];

/** A global cost allocated 100% to this job is proven; a split needs allocation-aware cash. */
export function supplierCostNeedsAllocationReview(allocations: unknown, orderId: string): boolean {
  if (!Array.isArray(allocations) || allocations.length === 0) return false;
  return allocations.length !== 1 || allocations[0]?.order_id !== orderId || Number(allocations[0]?.pct) !== 100;
}

export function supplierPaymentSummary(input: {
  orders: SupplierOrder[]; invoices: SupplierInvoice[]; entries: SupplierCashEntry[];
  dues: SupplierDue[]; items: SupplierBudgetItem[]; names: Record<string, string>;
  ambiguousCostIds?: string[];
}): SupplierPaymentGroup[] {
  const orders = unique(input.orders);
  const orderMap = new Map(orders.map(o => [o.id, o]));
  const entries = unique(input.entries);
  const dues = unique(input.dues).filter(d => d.status !== 'annullata');
  const ambiguous = new Set(input.ambiguousCostIds ?? []);
  const groups = new Map<string, SupplierPaymentGroup>();
  const get = (key: string, name: string) => {
    if (!groups.has(key)) groups.set(key, { key, name, ordered: 0, invoiced: 0, paid: 0,
      unpaid: 0, estimated: 0, review: 0, nextDeadline: null, orders: [], invoiceCount: 0, reviewCount: 0 });
    return groups.get(key)!;
  };
  for (const order of orders) {
    const key = order.supplier_id ?? `oda:${order.id}`;
    const group = get(key, input.names[key] ?? 'Fornitore da verificare');
    group.orders.push(order);
    if (!['annullato', 'annullata', 'cancelled', 'bozza', 'draft'].includes(order.status)) {
      group.ordered += Math.max(0, cents(order.total));
    }
  }
  const invoices = unique(input.invoices).filter(i => !['annullata', 'scartata', 'rifiutata'].includes(i.stato));
  const pools = new Map<string, SupplierInvoice[]>();
  for (const invoice of invoices) {
    const pool = invoice.company_cost_id ? `cost:${invoice.company_cost_id}` : `invoice:${invoice.id}`;
    pools.set(pool, [...(pools.get(pool) ?? []), invoice]);
  }
  const matchingEntries = (pool: SupplierInvoice[]) => entries.filter(e =>
    (!!pool[0].company_cost_id && e.cost_id === pool[0].company_cost_id) || pool.some(i => e.id === i.prima_nota_id));
  const entryPoolCount = new Map<string, number>();
  for (const pool of pools.values()) for (const entry of matchingEntries(pool)) entryPoolCount.set(entry.id, (entryPoolCount.get(entry.id) ?? 0) + 1);
  for (const pool of pools.values()) {
    const invoice = pool[0];
    const costId = invoice.company_cost_id;
    const poolEntries = matchingEntries(pool);
    // Only explicit supplier IDs; never join suppliers by a fuzzy display name.
    const supplierIds = new Set([
      ...pool.map(i => orderMap.get(i.purchase_order_id ?? '')?.supplier_id),
      ...poolEntries.map(e => e.supplier_id),
    ].filter((id): id is string => !!id));
    const supplierId = supplierIds.size === 1 ? [...supplierIds][0] : null;
    const key = supplierId ?? `invoice:${invoice.cedente_piva || invoice.id}`;
    const group = get(key, (supplierId && input.names[supplierId]) || invoice.cedente_ragione_sociale || 'Fornitore');
    const total = pool.reduce((sum, i) => sum + Math.max(0, cents(i.totale_documento)), 0);
    group.invoiceCount += pool.length;
    const poolDues = costId ? dues.filter(d => d.cost_id === costId) : [];
    const hasCredit = pool.some(i => i.tipo_documento === 'TD04' || cents(i.totale_documento) < 0);
    const uncertain = hasCredit || supplierIds.size > 1 || (costId && ambiguous.has(costId)) ||
      pool.some(i => i.totale_documento == null) || poolEntries.some(e => (entryPoolCount.get(e.id) ?? 0) > 1);
    if (uncertain) { group.review += total; group.reviewCount += pool.length; continue; }
    const cash = poolEntries.reduce((sum, e) => sum + (e.direction === 'uscita' ? cents(e.amount) : -cents(e.amount)), 0);
    // Due paid_amount and prima nota usually describe the same money, not two payments.
    const settled = poolDues.reduce((sum, d) => sum + Math.max(0, cents(d.paid_amount)), 0);
    const paid = Math.min(total, Math.max(0, cash, settled));
    if (cash > total || settled > total) { group.review += Math.max(cash, settled) - total; group.reviewCount++; }
    group.invoiced += total;
    group.paid += paid;
    group.unpaid += total - paid;
    if (total > paid) for (const due of poolDues) {
      if (cents(due.amount) > cents(due.paid_amount) && due.status !== 'pagata' &&
        (!group.nextDeadline || due.due_date < group.nextDeadline)) group.nextDeadline = due.due_date;
    }
  }
  for (const item of input.items) {
    if (!item.supplier_id) continue;
    const group = get(item.supplier_id, input.names[item.supplier_id] ?? 'Fornitore');
    // Legacy item flags are estimates, never evidence of actual cash paid.
    group.estimated += Math.max(0, cents(Number(item.purchase_price ?? 0) * Number(item.quantity ?? 0)));
  }
  return [...groups.values()].map(group => ({ ...group,
    ordered: group.ordered / 100, invoiced: group.invoiced / 100, paid: group.paid / 100,
    unpaid: group.unpaid / 100, estimated: group.estimated / 100, review: group.review / 100,
  })).sort((a, b) => (b.invoiced + b.ordered + b.estimated) - (a.invoiced + a.ordered + a.estimated));
}
