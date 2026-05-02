import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { QuoteTemplate } from '@/types/quoteTemplate';
import { queryKeys } from '@/lib/queryKeys';
import { logger } from '@/utils/logger';

type QuoteTemplateMutation = Partial<Omit<QuoteTemplate, 'created_at' | 'updated_at'>> & { id?: string };

export function useQuoteTemplates() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading, error: fetchError } = useQuery({
    queryKey: queryKeys.quoteTemplates.list(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_templates')
        .select('*')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) {
        logger.error('Errore caricamento template:', error);
        throw error;
      }
      return (data ?? []) as unknown as QuoteTemplate[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const defaultTemplate = templates.find(t => t.is_default) ?? templates[0] ?? null;

  const upsertTemplate = useMutation({
    mutationFn: async (template: QuoteTemplateMutation) => {
      if (!companyId) throw new Error('Azienda non disponibile');
      const { id, ...rest } = template;
      if (id) {
        const { error } = await supabase
          .from('quote_templates')
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('company_id', companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('quote_templates')
          .insert({ ...rest, company_id: companyId });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.quoteTemplates.all }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error('Azienda non disponibile');
      const { error } = await supabase
        .from('quote_templates')
        .update({ is_active: false })
        .eq('id', id)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.quoteTemplates.all }),
  });

  return { templates, defaultTemplate, isLoading, fetchError, upsertTemplate, deleteTemplate };
}
