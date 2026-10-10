import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { allPaymentRows } from '@/hooks/useSupplierPayments';
import { recordedCashFlow } from '@/lib/controlloGestione/recordedCashFlow';

export function useRecordedCashFlow(year: number) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ['cg', 'cash-flow-recorded', year, companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const rows = await allPaymentRows((from, to) => supabase.from('prima_nota_entries')
        .select('id,direction,amount,entry_date,category').eq('company_id', companyId!)
        .gte('entry_date', `${year}-01-01`).lt('entry_date', `${year + 1}-01-01`)
        .order('id').range(from, to));
      return recordedCashFlow(rows, year);
    },
  });
}
