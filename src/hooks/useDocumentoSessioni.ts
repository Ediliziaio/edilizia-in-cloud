import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { DocumentoSessione } from '@/types/fea';

export function useDocumentoSessioni(templateId?: string) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: sessioni = [], isLoading } = useQuery({
    queryKey: ['documento-sessioni', effectiveCompany?.id, templateId],
    queryFn: async () => {
      let q = supabase
        .from('documento_sessioni' as never)
        .select('*, template:documento_templates(nome, tipo_doc)')
        .eq('company_id', effectiveCompany!.id)
        .order('created_at', { ascending: false });
      if (templateId) q = q.eq('template_id', templateId) as typeof q;
      const { data, error } = await (q as unknown as Promise<{ data: DocumentoSessione[] | null; error: unknown }>);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const creaSessione = useMutation({
    mutationFn: async (input: {
      template_id: string;
      nome: string;
      valori_campi: Record<string, string>;
      order_id?: string | null;
      quote_id?: string | null;
      contact_id?: string | null;
      note?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('documento_sessioni' as never)
        .insert({ ...input, company_id: effectiveCompany!.id })
        .select('id')
        .single() as unknown as { data: { id: string } | null; error: unknown };
      if (error) throw error;
      return data!.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documento-sessioni'] });
      toast.success('Documento creato');
    },
    onError: () => toast.error('Errore nella creazione del documento'),
  });

  const aggiornaStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: DocumentoSessione['stato'] }) => {
      const { error } = await supabase
        .from('documento_sessioni' as never)
        .update({ stato, updated_at: new Date().toISOString() })
        .eq('id', id) as unknown as { error: unknown };
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documento-sessioni'] }),
  });

  return { sessioni, isLoading, creaSessione, aggiornaStato };
}
