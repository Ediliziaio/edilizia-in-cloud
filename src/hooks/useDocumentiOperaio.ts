/**
 * Hook CRUD per i documenti operaio.
 * Storage bucket: "documenti-operai" (PRIVATE — signed URL 1h)
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type {
  DocumentoOperaio,
  DocumentoOperaioInsert,
  TipoDocumentoOperaio,
  ScadenzeKPI,
  ScadenzaRow,
} from "@/types/documenti";
import { calcolaStato, giorniAllaScadenza } from "@/types/documenti";

// ── Storage bucket ─────────────────────────────────────────────────────────────
const BUCKET = "documenti-operai";

// ── Tipi documento ────────────────────────────────────────────────────────────
export function useTipiDocumento() {
  const { profile } = useAuth();
  return useQuery<TipoDocumentoOperaio[]>({
    queryKey: ["tipi-documento-operaio", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipi_documento_operaio")
        .select("id, company_id, nome, descrizione, richiede_scadenza, alert_giorni_prima, obbligatorio, is_default, attivo, ordine, created_at")
        .eq("company_id", profile!.company_id)
        .eq("attivo", true)
        .order("ordine", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TipoDocumentoOperaio[];
    },
    enabled: !!profile?.company_id,
  });
}

// ── Documenti per operaio ─────────────────────────────────────────────────────
export function useDocumentiOperaio(operaioId: string | null | undefined) {
  const { profile } = useAuth();
  return useQuery<DocumentoOperaio[]>({
    queryKey: ["documenti-operaio", profile?.company_id, operaioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documenti_operai")
        .select("id, company_id, operaio_id, tipo_id, nome_file, file_path, data_emissione, data_scadenza, stato, note, caricato_da, created_at, tipo:tipi_documento_operaio(id,nome,richiede_scadenza,alert_giorni_prima)")
        .eq("company_id", profile!.company_id)
        .eq("operaio_id", operaioId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocumentoOperaio[];
    },
    enabled: !!profile?.company_id && !!operaioId,
  });
}

// ── Tutti i documenti della company (per dashboard scadenze) ──────────────────
export function useDocumentiCompany() {
  const { profile } = useAuth();
  return useQuery<DocumentoOperaio[]>({
    queryKey: ["documenti-company", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documenti_operai")
        .select("id, company_id, operaio_id, tipo_id, nome_file, file_path, data_emissione, data_scadenza, stato, note, caricato_da, created_at, tipo:tipi_documento_operaio(id,nome,richiede_scadenza,alert_giorni_prima), operaio:profiles!documenti_operai_operaio_id_fkey(first_name,last_name)")
        .eq("company_id", profile!.company_id)
        .order("data_scadenza", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocumentoOperaio[];
    },
    enabled: !!profile?.company_id,
  });
}

// ── KPI scadenze ──────────────────────────────────────────────────────────────
export function useScadenzeKPI(): ScadenzeKPI {
  const { data: docs = [] } = useDocumentiCompany();
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const fra30  = new Date(oggi); fra30.setDate(fra30.getDate() + 30);
  const fra60  = new Date(oggi); fra60.setDate(fra60.getDate() + 60);
  const fra90  = new Date(oggi); fra90.setDate(fra90.getDate() + 90);

  let scaduti = 0, in30 = 0, in60 = 0, in90 = 0, validi = 0;
  for (const d of docs) {
    if (!d.data_scadenza) continue;
    const scad = new Date(d.data_scadenza + "T00:00:00");
    if (scad < oggi)  { scaduti++; continue; }
    if (scad <= fra30) { in30++; continue; }
    if (scad <= fra60) { in60++; continue; }
    if (scad <= fra90) { in90++; continue; }
    validi++;
  }
  return { scaduti, in_scadenza_30: in30, in_scadenza_60: in60, in_scadenza_90: in90, validi };
}

// ── Tabella scadenze ──────────────────────────────────────────────────────────
export function useScadenzeTable(): ScadenzaRow[] {
  const { data: docs = [] } = useDocumentiCompany();
  return docs
    .filter(d => d.data_scadenza !== null)
    .map(d => ({
      id: d.id,
      operaio_id: d.operaio_id,
      operaio_nome: d.operaio
        ? `${d.operaio.first_name ?? ""} ${d.operaio.last_name ?? ""}`.trim()
        : "—",
      tipo_nome: d.tipo?.nome ?? "—",
      data_scadenza: d.data_scadenza,
      giorni_mancanti: giorniAllaScadenza(d.data_scadenza),
      stato: d.stato,
      nome_file: d.nome_file,
    }))
    .sort((a, b) => {
      // Scaduti prima, poi in_scadenza, poi validi
      const order: Record<string, number> = { scaduto: 0, in_scadenza: 1, valido: 2, senza_scadenza: 3 };
      const diff = (order[a.stato] ?? 9) - (order[b.stato] ?? 9);
      if (diff !== 0) return diff;
      return (a.giorni_mancanti ?? 9999) - (b.giorni_mancanti ?? 9999);
    });
}

// ── Upload documento ──────────────────────────────────────────────────────────
export function useUploadDocumento() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      file,
      operaioId,
      tipoId,
      dataEmissione,
      dataScadenza,
      note,
    }: {
      file: File;
      operaioId: string;
      tipoId: string | null;
      dataEmissione: string | null;
      dataScadenza: string | null;
      note: string;
    }) => {
      if (!profile?.company_id || !user) throw new Error("Utente non autenticato");

      const { data: operaio, error: operaioErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("company_id", profile.company_id)
        .eq("id", operaioId)
        .maybeSingle();

      if (operaioErr) throw operaioErr;
      if (!operaio) throw new Error("Operaio non valido per questa azienda");

      // 1. Upload su Storage (privato)
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const filePath = `${profile.company_id}/${operaioId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      // 2. Calcola stato
      const stato = calcolaStato(dataScadenza);

      // 3. Inserisci record
      const insert: DocumentoOperaioInsert = {
        company_id: profile.company_id,
        operaio_id: operaioId,
        tipo_id: tipoId || null,
        nome_file: file.name,
        file_path: filePath,
        data_emissione: dataEmissione || null,
        data_scadenza: dataScadenza || null,
        stato,
        note: note.trim() || null,
        caricato_da: user.id,
      };

      const { error: insErr } = await supabase
        .from("documenti_operai")
        .insert(insert);
      if (insErr) {
        // Rimuovi il file se l'insert fallisce
        await supabase.storage.from(BUCKET).remove([filePath]);
        throw new Error(`Salvataggio fallito: ${insErr.message}`);
      }
    },
    onSuccess: (_data, vars) => {
      toast.success("Documento caricato");
      qc.invalidateQueries({ queryKey: ["documenti-operaio", profile?.company_id, vars.operaioId] });
      qc.invalidateQueries({ queryKey: ["documenti-company", profile?.company_id] });
    },
    onError: (err: Error) => {
      toast.error(err.message ?? "Errore caricamento documento");
    },
  });
}

// ── Elimina documento ─────────────────────────────────────────────────────────
export function useEliminaDocumento(operaioId: string) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ id }: { id: string; filePath: string }) => {
      if (!profile?.company_id) throw new Error("Azienda non disponibile");

      const { data: doc, error: docErr } = await supabase
        .from("documenti_operai")
        .select("file_path")
        .eq("id", id)
        .eq("company_id", profile.company_id)
        .eq("operaio_id", operaioId)
        .maybeSingle();

      if (docErr) throw new Error(docErr.message);
      if (!doc?.file_path) throw new Error("Documento non trovato per questa azienda");

      // 1. Rimuovi da Storage solo il path verificato a database
      const { error: storErr } = await supabase.storage.from(BUCKET).remove([doc.file_path]);
      if (storErr) console.warn("Storage remove:", storErr.message);

      // 2. Rimuovi il record
      const { error } = await supabase
        .from("documenti_operai")
        .delete()
        .eq("id", id)
        .eq("company_id", profile.company_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Documento eliminato");
      qc.invalidateQueries({ queryKey: ["documenti-operaio", profile?.company_id, operaioId] });
      qc.invalidateQueries({ queryKey: ["documenti-company", profile?.company_id] });
    },
    onError: (err: Error) => toast.error(err.message ?? "Errore eliminazione"),
  });
}

// ── Ottieni signed URL per download (1h) ──────────────────────────────────────
export async function getSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 3600); // 1 ora
  if (error) {
    toast.error("Errore generazione link download");
    return null;
  }
  return data.signedUrl;
}
