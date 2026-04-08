import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ArchivioDocument {
  id: string;
  company_id: string;
  tipo_documento: 'fattura_attiva' | 'fattura_passiva' | 'nota_credito' | 'altro';
  documento_id: string | null;
  anno_fiscale: number;
  storage_path: string;
  hash_sha256: string;
  data_archivio: string;
  scadenza_conservazione: string;
  note: string | null;
  created_at: string;
}

/** Calcola hash SHA-256 di un file */
async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function useArchivioSostitutivo(anno?: number) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const archivioQuery = useQuery({
    queryKey: ['archivio-sostitutivo', 'list', companyId, anno],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from('archivio_sostitutivo')
        .select('id, company_id, tipo_documento, documento_id, anno_fiscale, storage_path, hash_sha256, data_archivio, scadenza_conservazione, note, created_at')
        .eq('company_id', companyId!)
        .order('data_archivio', { ascending: false });
      if (anno) q = q.eq('anno_fiscale', anno);
      const { data, error } = await q;
      if (error) throw new Error(`[useArchivioSostitutivo] ${error.message}`);
      return (data ?? []) as ArchivioDocument[];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (params: {
      file: File;
      tipo_documento: ArchivioDocument['tipo_documento'];
      anno_fiscale: number;
      documento_id?: string;
      note?: string;
    }) => {
      const hash = await hashFile(params.file);
      const path = `${companyId}/${params.anno_fiscale}/${Date.now()}-${params.file.name}`;

      const { error: upErr } = await supabase.storage
        .from('archivio-sostitutivo')
        .upload(path, params.file, { contentType: params.file.type });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from('archivio_sostitutivo').insert({
        company_id: companyId!,
        tipo_documento: params.tipo_documento,
        documento_id: params.documento_id ?? null,
        anno_fiscale: params.anno_fiscale,
        storage_path: path,
        hash_sha256: hash,
        note: params.note ?? null,
      });
      if (dbErr) throw dbErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['archivio-sostitutivo', 'list', companyId, anno] });
      toast.success('Documento archiviato con successo');
    },
    onError: (err) => toast.error('Errore archiviazione', { description: err instanceof Error ? err.message : '' }),
  });

  const documenti = archivioQuery.data ?? [];
  const oggi = new Date();
  const inScadenzaProssimi365gg = documenti.filter(d => {
    const diff = (new Date(d.scadenza_conservazione).getTime() - oggi.getTime()) / (86400000 * 365);
    return diff >= 0 && diff < 1;
  });

  return {
    documenti,
    isLoading: archivioQuery.isLoading,
    upload: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    inScadenzaProssimi365gg,
    getSignedUrl: async (path: string) => {
      const { data } = await supabase.storage.from('archivio-sostitutivo').createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
  };
}
