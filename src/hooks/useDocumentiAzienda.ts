import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type {
  DatiDocumento, DocumentoAzienda, VersioneDocumento,
} from '@/types/documentiAzienda';

const BUCKET = 'azienda-documenti';

// Una chiave per forma di dato: la stessa chiave con select diversi avvelena la cache.
const chiavi = {
  elenco: (companyId: string | null) => ['documenti-azienda', 'elenco', companyId] as const,
  storico: (documentoId: string | undefined) => ['documenti-azienda', 'storico', documentoId] as const,
  avvio: (companyId: string | null) => ['documenti-azienda', 'avvio', companyId] as const,
};

// Il client tipizzato su tabelle con molte relazioni manda TypeScript in
// «instantiation excessively deep»: si passa dal client senza tipi e si
// ritipizza il risultato qui sotto, come in useMezzi.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Il messaggio vero del database (i trigger scrivono in italiano). */
function messaggio(e: unknown, riserva: string): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message || riserva;
  }
  return riserva;
}

/** Campi di testo e data: stringa vuota → null, così il database non rifiuta "". */
function pulisci(dati: DatiDocumento): Record<string, unknown> {
  const out: Record<string, unknown> = { ...dati };
  for (const campo of ['ente', 'numero', 'sede_id', 'data_documento', 'data_scadenza', 'note', 'file_path', 'file_name']) {
    if (out[campo] === '') out[campo] = null;
  }
  if (out.rinnovo_mesi === 0 || out.rinnovo_mesi === undefined) out.rinnovo_mesi = null;
  return out;
}

// ── Lettura ──────────────────────────────────────────────────────────────────

/** I documenti vivi dell'azienda, con lo stato già deciso dal database. */
export function useDocumentiAzienda() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.elenco(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<DocumentoAzienda[]> => {
      const { data, error } = await db
        .from('azienda_documenti_stato')
        .select('*')
        .eq('company_id', companyId)
        .order('data_scadenza', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as DocumentoAzienda[];
    },
    staleTime: 30 * 1000,
  });
}

/** Le versioni precedenti di un documento: la catena dei rinnovi, dalla più recente. */
export function useStoricoDocumento(documentoId: string | undefined) {
  return useQuery({
    queryKey: chiavi.storico(documentoId),
    enabled: !!documentoId,
    queryFn: async (): Promise<VersioneDocumento[]> => {
      const versioni: VersioneDocumento[] = [];
      let cercato: string | undefined = documentoId;
      // La catena è corta (un rinnovo all'anno): si risale finché c'è.
      for (let giro = 0; giro < 50 && cercato; giro++) {
        const { data, error } = await db
          .from('azienda_documenti')
          .select('id, titolo, numero, data_documento, data_scadenza, file_path, file_name, archiviato_il, sostituisce_id')
          .eq('id', cercato)
          .maybeSingle();
        if (error) throw error;
        if (!data) break;
        if (data.id !== documentoId) versioni.push(data as VersioneDocumento);
        cercato = (data as VersioneDocumento).sostituisce_id ?? undefined;
      }
      return versioni;
    },
    staleTime: 60 * 1000,
  });
}

/** Se l'azienda ha già chiuso l'elenco di partenza, non si ripresenta più. */
export function useElencoDiPartenzaDaMostrare() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: chiavi.avvio(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await db
        .from('azienda_documenti_avvio')
        .select('company_id')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      return !data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── File ─────────────────────────────────────────────────────────────────────

/** Carica un file nel bucket privato: {company_id}/{uuid}-{nome}. */
export async function caricaFileDocumento(companyId: string, file: File): Promise<{ path: string; name: string }> {
  const sicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const path = `${companyId}/${crypto.randomUUID()}-${sicuro}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return { path, name: file.name };
}

/** Toglie un file caricato che non serve più (il salvataggio non è andato). */
export async function rimuoviFileDocumento(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

/** Link temporaneo (un'ora) per aprire un file. */
export async function linkFileDocumento(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ── Scritture ────────────────────────────────────────────────────────────────

export function useSalvaDocumentoAzienda() {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dati }: { id?: string; dati: DatiDocumento }) => {
      const riga = pulisci(dati);
      if (id) {
        const { error } = await db.from('azienda_documenti').update(riga).eq('id', id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await db
        .from('azienda_documenti')
        .insert({ ...riga, company_id: companyId, created_by: user?.id ?? null })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (_id, { id }) => {
      qc.invalidateQueries({ queryKey: chiavi.elenco(companyId) });
      toast.success(id ? 'Documento aggiornato' : 'Documento aggiunto');
    },
    onError: (e) => toast.error(messaggio(e, 'Non è riuscito a salvare il documento')),
  });
}

/**
 * Attacca (o sostituisce) il file di un documento senza passare dalla finestra di modifica.
 *
 * È il gesto più frequente della pagina — le scadenze arrivano da un import, i file no — e
 * farlo costare l'apertura di un modulo con dodici campi vuol dire che i file non li carica
 * nessuno. Il file vecchio se ne va dall'archivio: resterebbe lì senza che nulla lo mostri.
 */
export function useAllegaFileDocumento() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documento, file }: {
      documento: Pick<DocumentoAzienda, 'id' | 'file_path'>;
      file: File;
    }) => {
      if (!companyId) throw new Error('Azienda non trovata');
      const caricato = await caricaFileDocumento(companyId, file);
      const { error } = await db
        .from('azienda_documenti')
        .update({ file_path: caricato.path, file_name: caricato.name })
        .eq('id', documento.id);
      if (error) {
        // La riga non è stata salvata: il file appena caricato resterebbe orfano nel bucket.
        await rimuoviFileDocumento(caricato.path);
        throw error;
      }
      if (documento.file_path) await rimuoviFileDocumento(documento.file_path);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chiavi.elenco(companyId) });
      toast.success('File caricato');
    },
    onError: (e) => toast.error(messaggio(e, 'Non è riuscito a caricare il file')),
  });
}

export function useEliminaDocumentoAzienda() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (documento: Pick<DocumentoAzienda, 'id' | 'file_path'>) => {
      // Si butta via tutta la catena, non solo l'ultima versione: le vecchie sono archiviate e
      // nessuna schermata le mostra più, quindi resterebbero nel database per sempre, coi loro
      // file nell'archivio, senza che nessuno possa arrivarci.
      const ids: string[] = [];
      const files: string[] = [];
      let cercato: string | undefined = documento.id;
      for (let giro = 0; giro < 50 && cercato; giro++) {
        const { data, error } = await db
          .from('azienda_documenti')
          .select('id, file_path, sostituisce_id')
          .eq('id', cercato)
          .maybeSingle();
        if (error) throw error;
        if (!data) break;
        ids.push(data.id as string);
        if (data.file_path) files.push(data.file_path as string);
        cercato = (data.sostituisce_id as string | null) ?? undefined;
      }
      if (ids.length === 0) ids.push(documento.id);

      const { error } = await db.from('azienda_documenti').delete().in('id', ids);
      if (error) throw error;
      for (const path of files) await rimuoviFileDocumento(path);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chiavi.elenco(companyId) });
      toast.success('Documento eliminato');
    },
    onError: (e) => toast.error(messaggio(e, 'Non è riuscito a eliminare il documento')),
  });
}

/**
 * «Rinnovato il …»: la riga nuova prende il posto della vecchia, che scivola
 * nello storico col suo file. Lo fa il database in una transazione sola.
 */
export function useRinnovaDocumentoAzienda() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      documentoId: string;
      dataDocumento: string;
      dataScadenza?: string | null;
      filePath?: string | null;
      fileName?: string | null;
      numero?: string | null;
    }) => {
      const { data, error } = await db.rpc('azienda_documento_rinnova', {
        p_documento_id: p.documentoId,
        p_data_documento: p.dataDocumento,
        p_data_scadenza: p.dataScadenza || null,
        p_file_path: p.filePath || null,
        p_file_name: p.fileName || null,
        p_numero: p.numero || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_nuovo, p) => {
      qc.invalidateQueries({ queryKey: chiavi.elenco(companyId) });
      qc.invalidateQueries({ queryKey: chiavi.storico(p.documentoId) });
      toast.success('Rinnovo registrato');
    },
    onError: (e) => toast.error(messaggio(e, 'Non è riuscito a registrare il rinnovo')),
  });
}

/** Aggiunge in blocco le voci spuntate nell'elenco di partenza e lo chiude. */
export function useAggiungiDaElencoDiPartenza() {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (righe: DatiDocumento[]) => {
      if (righe.length > 0) {
        const { error } = await db.from('azienda_documenti').insert(
          righe.map((r) => ({ ...pulisci(r), company_id: companyId, created_by: user?.id ?? null })),
        );
        if (error) throw error;
      }
      const { error: erroreAvvio } = await db
        .from('azienda_documenti_avvio')
        .upsert({ company_id: companyId, chiuso_da: user?.id ?? null }, { onConflict: 'company_id' });
      if (erroreAvvio) throw erroreAvvio;
      return righe.length;
    },
    onSuccess: (quante) => {
      qc.invalidateQueries({ queryKey: chiavi.elenco(companyId) });
      qc.invalidateQueries({ queryKey: chiavi.avvio(companyId) });
      if (quante > 0) toast.success(quante === 1 ? 'Documento aggiunto' : `${quante} documenti aggiunti`);
    },
    onError: (e) => toast.error(messaggio(e, 'Non è riuscito ad aggiungere i documenti')),
  });
}
