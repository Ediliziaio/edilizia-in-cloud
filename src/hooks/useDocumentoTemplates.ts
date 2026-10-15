import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { DocumentoTemplate, DocumentoTemplateField } from '@/types/fea';
import { caricaTemplateDocumento } from '@/lib/documenti/templateUpload';
import { testoErrore } from '@/lib/impostazioni/testoErrore';
import { posizioneValida } from '@/lib/documenti/templateCompilazione';
import { DOCUMENTO_TEMPLATE_SELECT } from '@/lib/documenti/templateQuery';

export function useDocumentoTemplates() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading, error, refetch } = useQuery({
    queryKey: ['documento-templates', effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documento_templates' as never)
        .select(DOCUMENTO_TEMPLATE_SELECT)
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
      if (!effectiveCompany?.id) throw new Error('Seleziona un’azienda prima di caricare il modello.');
      const companyId = effectiveCompany.id;
      return caricaTemplateDocumento({
        upload: async (path, document) => {
          const { error } = await supabase.storage.from('documento-templates').upload(path, document,
            { contentType: document.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
          if (error) throw error;
        },
        register: async (row) => {
          const { data, error } = await supabase.from('documento_templates' as never)
            .insert(row as never).select('id').single() as unknown as { data: { id: string } | null; error: unknown };
          if (error) throw error;
          if (!data?.id) throw new Error('Il modello non è stato registrato. Verifica i permessi dell’azienda.');
        },
        registered: async (id) => {
          const { data, error } = await supabase.from('documento_templates' as never).select('id')
            .eq('id', id).eq('company_id', companyId).maybeSingle();
          if (error) throw error;
          return !!data;
        },
        remove: async (path) => { const { error } = await supabase.storage.from('documento-templates').remove([path]); if (error) throw error; },
      }, companyId, { file, nome, descrizione, tipo_doc });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['documento-templates'] });
      toast.success('Template caricato con successo');
    },
    onError: (error) => toast.error(`Caricamento non riuscito: ${testoErrore(error)}`),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('documento_templates' as never)
        .update({ attivo: false })
        .eq('id', id).eq('company_id', effectiveCompany!.id).select('id') as unknown as { data: { id: string }[] | null; error: unknown };
      if (error) throw error;
      if (!data?.length) throw new Error('Modello non disattivato. Verifica azienda e permessi.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documento-templates'] });
      toast.success('Template eliminato');
    },
    onError: () => toast.error('Errore nell\'eliminazione del template'),
  });

  return { templates, isLoading, error, refetch, uploadTemplate, deleteTemplate };
}

export function useTemplateFields(templateId: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: fields = [], isLoading, error, refetch } = useQuery({
    queryKey: ['template-fields', companyId, templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documento_template_fields' as never)
        .select('*')
        .eq('template_id', templateId!)
        .eq('company_id', companyId!)
        .order('ordinamento') as unknown as { data: DocumentoTemplateField[] | null; error: unknown };
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!templateId && !!companyId,
  });

  const addField = useMutation({
    mutationFn: async (field: Omit<DocumentoTemplateField, 'id' | 'created_at'>) => {
      if (!companyId || field.company_id !== companyId || field.template_id !== templateId) throw new Error('Azienda o modello non corrispondenti.');
      const { data, error } = await supabase
        .from('documento_template_fields' as never)
        .insert(field as never).select('id').single() as unknown as { data: { id: string } | null; error: unknown };
      if (error) throw error;
      if (!data?.id) throw new Error('Campo non salvato. Verifica i permessi del modello.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-fields', companyId, templateId] });
      queryClient.invalidateQueries({ queryKey: ['documento-templates', companyId] });
    },
    onError: (error) => toast.error(`Campo non salvato: ${testoErrore(error)}`),
  });

  const removeField = useMutation({
    mutationFn: async (fieldId: string) => {
      const { data, error } = await supabase
        .from('documento_template_fields' as never)
        .delete()
        .eq('id', fieldId).eq('template_id', templateId!).eq('company_id', companyId!).select('id') as unknown as { data: { id: string }[] | null; error: unknown };
      if (error) throw error;
      if (!data?.length) throw new Error('Campo non rimosso. Verifica azienda e permessi.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-fields', companyId, templateId] });
      queryClient.invalidateQueries({ queryKey: ['documento-templates', companyId] });
    },
  });

  const updatePositions = useMutation({
    mutationFn: async ({ id, posizioni_pdf }: Pick<DocumentoTemplateField, 'id' | 'posizioni_pdf'>) => {
      if (!companyId || !templateId || !posizioni_pdf?.every(posizioneValida)) throw new Error('Posizioni PDF non valide.');
      const { data, error } = await supabase.from('documento_template_fields' as never)
        .update({ posizioni_pdf } as never).eq('id', id).eq('company_id', companyId!)
        .eq('template_id', templateId!).select('id') as unknown as { data: { id: string }[] | null; error: unknown };
      if (error) throw error;
      if (!data?.length) throw new Error('Campo non modificato. Verifica azienda e permessi.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-fields', companyId, templateId] });
      queryClient.invalidateQueries({ queryKey: ['documento-templates', companyId] });
    },
    onError: (error) => toast.error(`Posizione non salvata: ${testoErrore(error)}`),
  });

  return { fields, isLoading, error, refetch, addField, removeField, updatePositions };
}
