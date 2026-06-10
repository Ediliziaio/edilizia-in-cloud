import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface FotoCantiere {
  id: string;
  company_id: string;
  order_id: string | null;
  uploaded_by: string;
  storage_path: string;
  thumbnail_path: string | null;
  latitudine: number | null;
  longitudine: number | null;
  accuracy_meters: number | null;
  taken_at: string;
  server_timestamp: string;
  descrizione: string | null;
  tags: string[];
  created_at: string;
}

/** Ottiene la posizione GPS (fallback silenzioso a null) */
export async function getGeoPosition(): Promise<GeolocationPosition | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000 },
    );
  });
}

export function useFotoCantiere(orderId?: string) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const queryKey = orderId
    ? ['foto-cantiere', 'order', companyId, orderId]
    : ['foto-cantiere', 'company', companyId];

  const fotoQuery = useQuery({
    queryKey,
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from('foto_cantiere')
        .select('id, company_id, order_id, uploaded_by, storage_path, thumbnail_path, latitudine, longitudine, accuracy_meters, taken_at, server_timestamp, descrizione, tags, created_at')
        .eq('company_id', companyId!)
        .order('taken_at', { ascending: false });
      if (orderId) q = q.eq('order_id', orderId);
      // Vista azienda (senza orderId): cap a 500 per non scaricare migliaia di
      // foto cantiere di tutta l'impresa. La vista per-ordine resta completa.
      else q = q.limit(500);
      const { data, error } = await q;
      if (error) throw new Error(`[useFotoCantiere] ${error.message}`);
      return (data ?? []) as FotoCantiere[];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ files, descrizione }: { files: FileList; descrizione?: string }) => {
      const geo = await getGeoPosition();
      const results: string[] = [];

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name}: solo immagini supportate`);
          continue;
        }

        const path = `${companyId}/${orderId ?? 'senza-ordine'}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from('foto-cantiere')
          .upload(path, file, { contentType: file.type });

        if (upErr) { toast.error(`Errore upload ${file.name}`); continue; }

        const { error: dbErr } = await supabase.from('foto_cantiere').insert({
          company_id: companyId!,
          order_id: orderId ?? null,
          uploaded_by: user!.id,
          storage_path: path,
          latitudine: geo?.coords.latitude ?? null,
          longitudine: geo?.coords.longitude ?? null,
          accuracy_meters: geo?.coords.accuracy ?? null,
          taken_at: new Date().toISOString(),
          descrizione: descrizione ?? null,
        });

        if (dbErr) toast.error('Errore salvataggio metadati foto');
        else { toast.success(`Foto caricata${geo ? ' con GPS' : ''}`); results.push(path); }
      }
      return results;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: () => toast.error('Errore durante il caricamento foto'),
  });

  const eliminaMutation = useMutation({
    mutationFn: async (foto: FotoCantiere) => {
      await supabase.storage.from('foto-cantiere').remove([foto.storage_path]);
      const { error } = await supabase.from('foto_cantiere').delete().eq('id', foto.id).eq('company_id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success('Foto eliminata');
    },
    onError: () => toast.error('Errore eliminazione foto'),
  });

  return {
    foto: fotoQuery.data ?? [],
    isLoading: fotoQuery.isLoading,
    upload: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    elimina: eliminaMutation.mutate,
    isEliminando: eliminaMutation.isPending,
    getSignedUrl: async (path: string) => {
      const { data } = await supabase.storage.from('foto-cantiere').createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
  };
}
