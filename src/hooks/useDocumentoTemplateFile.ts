import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DocumentoTemplate } from '@/types/fea';

export function useDocumentoTemplateFile(template: DocumentoTemplate) {
  return useQuery({
    queryKey: ['documento-template-file', template.company_id, template.id, template.file_url],
    queryFn: async () => {
      if (!template.file_url.startsWith(`${template.company_id}/`)) throw new Error('Il file non appartiene alla cartella del modello.');
      const { data, error } = await supabase.storage.from('documento-templates').download(template.file_url);
      if (error) throw error;
      if (!data) throw new Error('File del modello non disponibile.');
      return new Uint8Array(await data.arrayBuffer());
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
