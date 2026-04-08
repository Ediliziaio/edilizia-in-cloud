import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useGanttOrdini(filtroStatoId?: string) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const ordersQuery = useQuery({
    queryKey: ['gantt-ordini', companyId, filtroStatoId],
    enabled: !!companyId,
    staleTime: 3 * 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from('orders')
        .select(`
          id, order_code, title, status_id, work_start_date, work_end_date,
          customer_id, total_amount, company_id,
          customers(name),
          order_statuses(id, name, color)
        `)
        .eq('company_id', companyId!)
        .not('work_start_date', 'is', null)
        .order('work_start_date', { ascending: true });

      if (filtroStatoId) q = q.eq('status_id', filtroStatoId);

      const { data, error } = await q;
      if (error) throw new Error(`[useGanttOrdini] ${error.message}`);
      return data ?? [];
    },
  });

  const statusesQuery = useQuery({
    queryKey: ['order-statuses', companyId],
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_statuses')
        .select('id, name, color, position')
        .eq('company_id', companyId!)
        .order('position');
      if (error) throw error;
      return data ?? [];
    },
  });

  return {
    orders: ordersQuery.data ?? [],
    statuses: statusesQuery.data ?? [],
    isLoading: ordersQuery.isLoading,
    isError: ordersQuery.isError,
  };
}
