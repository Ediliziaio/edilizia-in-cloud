import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { DocumentoTemplate, DocumentoTemplateField } from '@/types/fea';

export function useDocumentoTemplates() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['documento-templates', effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documento_templates' as never)
        .select('*, campi:documento_template_fields(*)')
        .eq('company_id', effectiveCompany!.id)
        .eq('attivo', true)
        .order('created_at', { ascending: false }) as unknown as { data: DocumentoTemplate[] | null; error: unknown };
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const uploadTemplate = useMutation({
    mutationFn: async ({ file, nome, descrizione, tipo_doc }: {
      file: File; nome: string; descrizione?: string; tipo_doc: string;
    }) => {
      const ext = file.name.split('.').pop()?.toLowerCase() as 'pdf' | 'docx';
      const path = `${effectiveCompany!.id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage
        .from('documento-templates')
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data, error } = await supabase
        .from('documento_templates' as never)
        .insert({
          company_id: effectiveCompany!.id,
          nome, descrizione: descrizione ?? null,
          tipo_doc,
          file_url: path,
          file_type: ext,
          file_size: file.size,
        })
        .select('id')
        .single() as unknown as { data: { id: string } | null; error: unknown };
      if (error) throw error;
      return data!.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documento-templates'] });
      toast.success('Template caricato con successo');
    },
    onError: () => toast.error('Errore nel caricamento del template'),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('documento_templates' as never)
        .update({ attivo: false })
        .eq('id', id) as unknown as { error: unknown };
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documento-templates'] });
      toast.success('Template eliminato');
    },
    onError: () => toast.error('Errore nell\'eliminazione del template'),
  });

  return { templates, isLoading, uploadTemplate, deleteTemplate };
}

export function useTemplateFields(templateId: string | null) {
  const queryClient = useQueryClient();

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ['template-fields', templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documento_template_fields' as never)
        .select('*')
        .eq('template_id', templateId!)
        .order('ordinamento') as unknown as { data: DocumentoTemplateField[] | null; error: unknown };
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!templateId,
  });

  const addField = useMutation({
    mutationFn: async (field: Omit<DocumentoTemplateField, 'id' | 'created_at'>) => {
      const { error } = await supabase
        .from('documento_template_fields' as never)
        .insert(field) as unknown as { error: unknown };
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-fields', templateId] });
    },
    onError: () => toast.error('Errore nel salvataggio del campo'),
  });

  const removeField = useMutation({
    mutationFn: async (fieldId: string) => {
      const { error } = await supabase
        .from('documento_template_fields' as never)
        .delete()
        .eq('id', fieldId) as unknown as { error: unknown };
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-fields', templateId] });
    },
  });

  return { fields, isLoading, addField, removeField };
}
