import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface RitenuteGaranzia {
  id: string;
  company_id: string;
  contratto_id: string;
  sal_id: string;
  importo: number;
  stato: 'trattenuta' | 'svincolata' | 'persa';
  data_svincolo_prevista: string | null;
  data_svincolo_effettiva: string | null;
  percentuale_applicata: number | null;
  note: string | null;
  created_at: string;
}

export interface ContrattoSubappalto {
  id: string;
  importo_contrattuale: number;
  subappaltatore_id: string;
  stato: string;
  ritenuta_garanzia_pct: number | null;
}

export function useRitenuteGaranzia(orderId: string | undefined) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  // 1. Trova contratti_subappalto collegati all'ordine
  const contrattiQuery = useQuery({
    queryKey: ['contratti-subappalto', companyId, orderId],
    enabled: !!companyId && !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contratti_subappalto')
        .select('id, importo_contrattuale, subappaltatore_id, stato, ritenuta_garanzia_pct')
        .eq('company_id', companyId!)
        .eq('order_id', orderId!);
      if (error) throw new Error(`[useRitenuteGaranzia] ${error.message}`);
      return (data ?? []) as ContrattoSubappalto[];
    },
  });

  const contrattoIds = contrattiQuery.data?.map(c => c.id) ?? [];

  // 2. Carica ritenute dei contratti trovati
  const ritenuteQuery = useQuery({
    queryKey: ['ritenute-garanzia', companyId, orderId],
    enabled: contrattoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ritenute_garanzia')
        .select('id, contratto_id, sal_id, importo, stato, data_svincolo_prevista, data_svincolo_effettiva, percentuale_applicata, note, created_at')
        .eq('company_id', companyId!)
        .in('contratto_id', contrattoIds)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`[useRitenuteGaranzia] ${error.message}`);
      return (data ?? []) as RitenuteGaranzia[];
    },
  });

  const svincolaMutation = useMutation({
    mutationFn: async ({ id, data_svincolo_effettiva, note }: { id: string; data_svincolo_effettiva: string; note?: string }) => {
      const { error } = await supabase
        .from('ritenute_garanzia')
        .update({ stato: 'svincolata', data_svincolo_effettiva, note })
        .eq('id', id)
        .eq('company_id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ritenute-garanzia', companyId, orderId] });
      toast.success('Ritenuta svincolata con successo');
    },
    onError: () => toast.error('Errore durante lo svincolo della ritenuta'),
  });

  const aggiungiMutation = useMutation({
    mutationFn: async (payload: { contratto_id: string; sal_id: string; importo: number; percentuale_applicata?: number; data_svincolo_prevista?: string; note?: string }) => {
      const { error } = await supabase
        .from('ritenute_garanzia')
        .insert({ ...payload, company_id: companyId!, stato: 'trattenuta' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ritenute-garanzia', companyId, orderId] });
      toast.success('Ritenuta aggiunta');
    },
    onError: () => toast.error('Errore durante l\'aggiunta della ritenuta'),
  });

  const ritenute = ritenuteQuery.data ?? [];
  return {
    ritenute,
    contratti: contrattiQuery.data ?? [],
    isLoading: contrattiQuery.isLoading || (contrattoIds.length > 0 && ritenuteQuery.isLoading),
    noContratti: !contrattiQuery.isLoading && contrattoIds.length === 0,
    svincola: svincolaMutation.mutateAsync,
    isSvincolando: svincolaMutation.isPending,
    aggiungi: aggiungiMutation.mutateAsync,
    isAggiungendo: aggiungiMutation.isPending,
    totaleRitenuto: ritenute.filter(r => r.stato === 'trattenuta').reduce((s, r) => s + Number(r.importo), 0),
    totaleSvincolato: ritenute.filter(r => r.stato === 'svincolata').reduce((s, r) => s + Number(r.importo), 0),
  };
}
