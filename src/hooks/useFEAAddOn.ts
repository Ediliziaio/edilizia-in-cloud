import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { FEAConfigurazione } from '@/types/fea';

export function useFEAAddOn() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['fea-config', effectiveCompany?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('fea_configurazione' as never)
        .select('*')
        .eq('company_id', effectiveCompany!.id)
        .maybeSingle() as unknown as { data: FEAConfigurazione | null };
      return data;
    },
    enabled: !!effectiveCompany?.id,
  });

  const salvaConfig = useMutation({
    mutationFn: async (updates: Partial<FEAConfigurazione>) => {
      const { error } = await supabase
        .from('fea_configurazione' as never)
        .upsert({
          company_id: effectiveCompany!.id,
          ...updates,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id' }) as unknown as { error: unknown };
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fea-config'] });
      toast.success('Configurazione FEA salvata');
    },
    onError: () => toast.error('Errore nel salvataggio della configurazione'),
  });

  const isAttivo = config?.addon_attivo ?? false;
  return { config, isLoading, isAttivo, salvaConfig };
}
