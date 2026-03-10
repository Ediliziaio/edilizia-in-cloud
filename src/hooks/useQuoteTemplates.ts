import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { QuoteTemplate } from '@/types/quoteTemplate';
import { queryKeys } from '@/lib/queryKeys';

export function useQuoteTemplates() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading, error: fetchError } = useQuery({
    queryKey: ['quote-templates', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_templates')
        .select('*')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) {
        console.error('Errore caricamento template:', error);
        throw error;
      }
      return (data ?? []) as unknown as QuoteTemplate[];
    },
    enabled: !!companyId,
  });

  const defaultTemplate = templates.find(t => t.is_default) ?? templates[0] ?? null;

  const upsertTemplate = useMutation({
    mutationFn: async (template: Partial<QuoteTemplate> & { id?: string }) => {
      const { id, created_at, updated_at, ...rest } = template as any;
      if (id) {
        const { error } = await supabase
          .from('quote_templates')
          .update({ ...rest, updated_at: new Date().toISOString() } as any)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('quote_templates')
          .insert({ ...rest, company_id: companyId! } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quote-templates'] }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('quote_templates')
        .update({ is_active: false } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quote-templates'] }),
  });

  return { templates, defaultTemplate, isLoading, fetchError, upsertTemplate, deleteTemplate };
}
