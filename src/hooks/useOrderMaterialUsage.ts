import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { allPaymentRows } from './useSupplierPayments';
import { materialUsage } from '@/lib/orders/materialUsage';

export function useOrderMaterialUsage(companyId: string | null | undefined, orderId: string) {
  return useQuery({
    queryKey: ['order-material-usage', orderId, companyId],
    enabled: !!companyId && !!orderId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [moves, reports] = await Promise.all([
        allPaymentRows((from, to) => supabase.from('warehouse_movements')
          .select('id,stock_item_id,movement_type,quantity,unit_cost').eq('company_id', companyId!)
          .eq('order_id', orderId).order('id').range(from, to)),
        allPaymentRows((from, to) => supabase.from('campo_rapportini')
          .select('id,stato,materiali_usati').eq('company_id', companyId!).eq('order_id', orderId)
          .eq('stato', 'approvato').order('id').range(from, to)),
      ]);
      const ids = [...new Set([...moves.map(m => m.stock_item_id), ...reports.flatMap(r =>
        Array.isArray(r.materiali_usati) ? r.materiali_usati.flatMap(m => m && typeof m === 'object' && !Array.isArray(m) && typeof m.stock_item_id === 'string' ? [m.stock_item_id] : []) : [])])];
      const names: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 50) {
        const stock = await allPaymentRows((from, to) => supabase.from('warehouse_stock').select('id,name')
          .eq('company_id', companyId!).in('id', ids.slice(i, i + 50)).order('id').range(from, to));
        for (const row of stock) names[row.id] = row.name;
      }
      return materialUsage(moves, reports, names);
    },
  });
}
