import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Same rows for variation editor, agreed revenue and customer payment plan. */
export function useOrderVariations(orderId?: string, companyId?: string, enabled = true) {
  return useQuery({
    queryKey: ['ordini-variazione', orderId, companyId],
    enabled: enabled && !!orderId && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('ordini_variazione').select('*')
        .eq('order_id', orderId!).eq('company_id', companyId!).order('numero_odv', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
