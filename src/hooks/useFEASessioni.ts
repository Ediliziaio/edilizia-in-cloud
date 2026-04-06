import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { FEASignatureRequest, FEARichiediDTO } from '@/types/fea';

export function useFEASessioni(entityType?: string, entityId?: string) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: richieste = [], isLoading } = useQuery({
    queryKey: ['fea-sessioni', effectiveCompany?.id, entityType, entityId],
    queryFn: async () => {
      let q = supabase
        .from('signature_requests' as never)
        .select('*')
        .eq('company_id', effectiveCompany!.id)
        .not('tipo_documento', 'is', null)
        .order('created_at', { ascending: false });
      if (entityType === 'sessione' && entityId) q = q.eq('sessione_id', entityId) as typeof q;
      if (entityType === 'order' && entityId) q = q.eq('order_id', entityId) as typeof q;
      if (entityType === 'quote' && entityId) q = q.eq('quote_id', entityId) as typeof q;
      const { data, error } = await (q as unknown as Promise<{ data: FEASignatureRequest[] | null; error: unknown }>);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const richiediRichiesta = useMutation({
    mutationFn: async (dto: FEARichiediDTO) => {
      const { data, error } = await supabase.functions.invoke('fea-richiedi-firma', {
        body: dto,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? 'Errore');
      return data as { success: true; request_id: string; token: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fea-sessioni'] });
      toast.success('Richiesta di firma inviata! Il firmatario riceverà un\'email con il codice OTP.');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Errore invio richiesta firma';
      toast.error(msg);
    },
  });

  const annullaRichiesta = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('signature_requests' as never)
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('company_id', effectiveCompany!.id) as unknown as { error: unknown };
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fea-sessioni'] });
      toast.success('Richiesta annullata');
    },
    onError: () => toast.error('Errore nell\'annullamento'),
  });

  return { richieste, isLoading, richiediRichiesta, annullaRichiesta };
}

export function useFEAAuditLog(requestId: string | null) {
  const { data: log = [], isLoading } = useQuery({
    queryKey: ['fea-audit', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fea_audit_log' as never)
        .select('*')
        .eq('request_id', requestId!)
        .order('created_at') as unknown as { data: unknown[] | null; error: unknown };
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!requestId,
  });
  return { log, isLoading };
}
