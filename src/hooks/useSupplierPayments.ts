import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { supplierCostNeedsAllocationReview, type SupplierInvoice } from '@/lib/orders/supplierPaymentSummary';

// Stable, paginated reads: an invoice/payment disappearing beyond the API's row cap
// must not turn a paid supplier into an unpaid one. Every query remains tenant-scoped.
export async function allPaymentRows<T>(request: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await request(from, from + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}
const allRows = allPaymentRows;
const batches = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i * 50, (i + 1) * 50));
const dedup = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map(r => [r.id, r])).values()];
const invoiceFields = 'id,purchase_order_id,company_cost_id,prima_nota_id,cedente_ragione_sociale,cedente_piva,numero_fattura,totale_documento,tipo_documento,stato';

export function useSupplierPayments(companyId: string, orderId?: string) {
  return useQuery({
    queryKey: ['order-supplier-payments', orderId, companyId],
    enabled: !!companyId && !!orderId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const [orders, directCosts, allocatedCosts] = await Promise.all([
        allRows((from, to) => supabase.from('purchase_orders')
          .select('id,supplier_id,oda_number,status,total').eq('company_id', companyId).eq('order_id', orderId!)
          .order('id').range(from, to)),
        allRows((from, to) => supabase.from('company_costs').select('id')
          .eq('company_id', companyId).eq('order_id', orderId!).order('id').range(from, to)),
        allRows((from, to) => supabase.from('company_costs').select('id')
          // JSONB must be serialized explicitly: JS arrays use Postgres array syntax in postgrest-js.
          .eq('company_id', companyId).contains('allocations', JSON.stringify([{ order_id: orderId! }])).order('id').range(from, to)),
      ]);
      const costs = dedup([...directCosts, ...allocatedCosts]);
      const invoiceReads = [
        ...batches(orders.map(o => o.id)).map(ids => allRows((from, to) => supabase.from('fatture_ricevute')
          .select(invoiceFields).eq('company_id', companyId).in('purchase_order_id', ids).order('id').range(from, to))),
        ...batches(costs.map(c => c.id)).map(ids => allRows((from, to) => supabase.from('fatture_ricevute')
          .select(invoiceFields).eq('company_id', companyId).in('company_cost_id', ids).order('id').range(from, to))),
      ];
      // Only proven OdA/cost links. order_id_suggerito is an AI suggestion, not allocation evidence.
      const jobOrderIds = new Set(orders.map(o => o.id));
      const linkedInvoices = dedup((await Promise.all(invoiceReads)).flat()) as SupplierInvoice[];
      const invoices = linkedInvoices.filter(i => !i.purchase_order_id || jobOrderIds.has(i.purchase_order_id));
      const costIds = [...new Set(invoices.map(i => i.company_cost_id).filter((id): id is string => !!id))];
      const noteIds = [...new Set(invoices.map(i => i.prima_nota_id).filter((id): id is string => !!id))];
      const entryFields = 'id,cost_id,supplier_id,scadenza_id,amount,direction,order_id';
      const [costEntries, directEntries, dues, costInvoices, costOwners] = await Promise.all([
        Promise.all(batches(costIds).map(ids => allRows((from, to) => supabase.from('prima_nota_entries')
          .select(entryFields).eq('company_id', companyId).in('cost_id', ids).order('id').range(from, to)))),
        Promise.all(batches(noteIds).map(ids => allRows((from, to) => supabase.from('prima_nota_entries')
          .select(entryFields).eq('company_id', companyId).in('id', ids).order('id').range(from, to)))),
        Promise.all(batches(costIds).map(ids => allRows((from, to) => supabase.from('scadenze')
          .select('id,cost_id,supplier_id,amount,paid_amount,due_date,status').eq('company_id', companyId)
          .eq('direction', 'uscita').in('cost_id', ids).order('id').range(from, to)))),
        Promise.all(batches(costIds).map(ids => allRows((from, to) => supabase.from('fatture_ricevute')
          .select('id,company_cost_id').eq('company_id', companyId).in('company_cost_id', ids).order('id').range(from, to)))),
        Promise.all(batches(costIds).map(ids => allRows((from, to) => supabase.from('company_costs')
          .select('id,order_id,allocations').eq('company_id', companyId).in('id', ids).order('id').range(from, to)))),
      ]);
      const entries = dedup([...costEntries.flat(), ...directEntries.flat()]);
      const currentInvoiceIds = new Set(invoices.map(i => i.id));
      const knownCostIds = new Set(costOwners.flat().map(c => c.id));
      const ambiguousCostIds = [...new Set([
        ...costInvoices.flat().filter(i => !currentInvoiceIds.has(i.id)).map(i => i.company_cost_id).filter((id): id is string => !!id),
        ...costOwners.flat().filter(c => c.order_id && c.order_id !== orderId).map(c => c.id),
        ...costOwners.flat().filter(c => supplierCostNeedsAllocationReview(c.allocations, orderId!)).map(c => c.id),
        ...entries.filter(e => e.order_id && e.order_id !== orderId).map(e => e.cost_id).filter((id): id is string => !!id),
        ...costIds.filter(id => !knownCostIds.has(id)),
      ])];
      return { orders, invoices, entries, dues: dedup(dues.flat()), ambiguousCostIds };
    },
  });
}

export function useSupplierPaymentNames(companyId: string, ids: string[]) {
  return useQuery({
    queryKey: ['suppliers-for-payments', companyId, ids],
    enabled: !!companyId && ids.length > 0,
    staleTime: 300_000,
    queryFn: async () => {
      const results = await Promise.all(batches(ids).map(batch => allRows<Pick<Tables<'suppliers'>, 'id' | 'name'>>((from, to) =>
        supabase.from('suppliers').select('id,name').eq('company_id', companyId).in('id', batch).order('id').range(from, to))));
      return Object.fromEntries(results.flat().map(s => [s.id, s.name]));
    },
  });
}
