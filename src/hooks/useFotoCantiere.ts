import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { compressImage } from '@/lib/campo/foto-compressor';
import { applyWatermark } from '@/lib/campo/foto-watermark';
import { useOfflineSync } from '@/hooks/campo/useOfflineSync';

/** Quante foto salgono insieme: 2 tiene occupata la rete senza affamare il
 *  resto dell'app su 4G di cantiere. */
const CONCORRENZA_UPLOAD = 2;

/** Esegue i lavori a gruppetti invece che tutti in fila (com'era prima) o
 *  tutti insieme (che su rete debole li fa fallire a catena). */
async function inParallelo<T, R>(
  elementi: T[],
  limite: number,
  lavoro: (el: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const esiti: PromiseSettledResult<R>[] = new Array(elementi.length);
  let prossimo = 0;
  const corsie = Array.from({ length: Math.min(limite, elementi.length) }, async () => {
    for (;;) {
      const i = prossimo++;
      if (i >= elementi.length) return;
      try {
        esiti[i] = { status: 'fulfilled', value: await lavoro(elementi[i]) };
      } catch (e) {
        esiti[i] = { status: 'rejected', reason: e };
      }
    }
  });
  await Promise.all(corsie);
  return esiti;
}

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
  const { effectiveCompany, user, profile } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const { enqueue } = useOfflineSync();

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
    mutationFn: async ({
      files,
      descrizione,
      nomeCantiere,
    }: { files: FileList; descrizione?: string; nomeCantiere?: string }) => {
      const immagini = Array.from(files).filter((f) => {
        if (f.type.startsWith('image/')) return true;
        toast.error(`${f.name}: solo immagini supportate`);
        return false;
      });
      if (immagini.length === 0) return [];

      // Una sola lettura del GPS per l'intera infornata: chiederla per ogni
      // foto costa secondi e batteria, e la posizione è la stessa.
      const geo = await getGeoPosition();
      const scattataIl = new Date();
      const operaio = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || undefined;

      const esiti = await inParallelo(immagini, CONCORRENZA_UPLOAD, async (file) => {
        // Comprimi sempre: una foto da telefono moderno è 4-8 MB e in cantiere
        // la rete non la regge. Se la compressione fallisce si prosegue con
        // l'originale — meglio una foto pesante che nessuna foto.
        let blob: Blob = file;
        try {
          blob = (await compressImage(file)).blob;
        } catch {
          /* si prosegue con l'originale */
        }

        // Data, ora, cantiere e coordinate impresse sull'immagine: è ciò che
        // rende la foto una prova opponibile al cliente, non un ricordo.
        if (geo) {
          try {
            blob = await applyWatermark(blob, {
              dataOra: scattataIl,
              nomeCantiere,
              operaio,
              geo: {
                lat: geo.coords.latitude,
                lng: geo.coords.longitude,
                accuracy: geo.coords.accuracy,
                timestamp: geo.timestamp,
              },
            });
          } catch {
            /* senza watermark la foto vale comunque */
          }
        }

        const nomePulito = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${companyId}/${orderId ?? 'senza-ordine'}/${Date.now()}-${nomePulito}`;
        const riga = {
          company_id: companyId!,
          order_id: orderId ?? null,
          uploaded_by: user!.id,
          latitudine: geo?.coords.latitude ?? null,
          longitudine: geo?.coords.longitude ?? null,
          accuracy_meters: geo?.coords.accuracy ?? null,
          taken_at: scattataIl.toISOString(),
          descrizione: descrizione ?? null,
        };

        // Senza rete la foto non si perde: va in coda su IndexedDB e parte da
        // sola al ritorno del campo. È il caso normale in cantiere, non l'eccezione.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          await enqueue('foto', {
            bucket: 'foto-cantiere',
            path,
            blob,
            contentType: blob.type || file.type,
            riga,
          });
          return { path, inCoda: true };
        }

        const { error: upErr } = await supabase.storage
          .from('foto-cantiere')
          .upload(path, blob, { contentType: blob.type || file.type });
        if (upErr) throw new Error(upErr.message);

        const { error: dbErr } = await supabase.from('foto_cantiere').insert({ ...riga, storage_path: path });
        if (dbErr) {
          // Riga fallita: si toglie il file, altrimenti resta a occupare
          // spazio senza comparire in nessuna galleria.
          await supabase.storage.from('foto-cantiere').remove([path]);
          throw new Error(dbErr.message);
        }
        return { path, inCoda: false };
      });

      const caricate = esiti.filter((e) => e.status === 'fulfilled');
      const inCoda = caricate.filter((e) => (e as PromiseFulfilledResult<{ inCoda: boolean }>).value.inCoda).length;
      const falliti = esiti.length - caricate.length;

      if (inCoda > 0) {
        toast.success(`${inCoda} foto in attesa di rete`, {
          description: 'Partono da sole appena torna il campo.',
        });
      }
      const salite = caricate.length - inCoda;
      if (salite > 0) {
        toast.success(`${salite} foto caricate${geo ? ' con GPS' : ''}`);
      }
      if (falliti > 0) {
        toast.error(`${falliti} foto non caricate`, { description: 'Riprova: le altre sono salve.' });
      }

      return caricate.map((e) => (e as PromiseFulfilledResult<{ path: string }>).value.path);
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
