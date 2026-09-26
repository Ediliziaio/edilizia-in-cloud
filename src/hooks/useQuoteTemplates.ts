import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { QuoteTemplate } from '@/types/quoteTemplate';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
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

  // Bug-fix (libreria template per kind): il default per generare PDF deve essere
  // SOLO un template kind='offerta' (i blocchi standalone come copertina/condizioni
  // non possono essere default). Fallback sulla prima offerta esistente, mai su un blocco.
  const offertaTemplates = templates.filter(t => ((t as { kind?: string }).kind ?? 'offerta') === 'offerta');
  const defaultTemplate = offertaTemplates.find(t => t.is_default) ?? offertaTemplates[0] ?? null;

  const upsertTemplate = useMutation({
    mutationFn: async (template: QuoteTemplateMutation) => {
      if (!companyId) throw new Error('Azienda non disponibile');
      const { id, ...rest } = template;
      if (id) {
        const { data, error } = await supabase
          .from('quote_templates')
          // QuoteTemplate (tipo locale) è più largo delle colonne reali: il cast
          // evita che i tipi generati rifiutino chiavi che a runtime restano undefined.
          .update({ ...rest, updated_at: new Date().toISOString() } as unknown as TablesUpdate<'quote_templates'>)
          .eq('id', id)
          .eq('company_id', companyId)
          .select('id')
          .single();
        if (error) throw error;
        return data; // { id }
      } else {
        const { data, error } = await supabase
          .from('quote_templates')
          .insert({ ...rest, company_id: companyId } as unknown as TablesInsert<'quote_templates'>)
          .select('id')
          .single();
        if (error) throw error;
        return data; // { id }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.quoteTemplates.all }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error('Azienda non disponibile');
      const { data, error } = await supabase
        .from('quote_templates')
        .update({ is_active: false })
        .eq('id', id)
        .eq('company_id', companyId)
        .select('id');
      if (error) throw error;
      // Una UPDATE che la RLS filtra non dà errore: senza righe non si è tolto nulla.
      if (!data || data.length === 0) throw new Error('I modelli li cambia chi può modificare il listino');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.quoteTemplates.all }),
  });

  return { templates, defaultTemplate, isLoading, fetchError, upsertTemplate, deleteTemplate };
}
