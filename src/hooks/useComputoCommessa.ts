/**
 * Computo metrico della commessa: il caricamento (PDF PriMus / XPWE / Excel),
 * lo stato di lettura, le voci con le righe di misura e i dati da lavoro pubblico.
 * Chi vede o modifica la commessa vede o modifica il suo computo (i permessi li
 * passa la scheda: canViewOrders / canEditOrders).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computoFileType } from "@/lib/computo/uploadFileType";
import { MESSAGGIO_DCF } from "@/lib/computo/xpwe";
import type { VoceComputo } from "@/lib/computo/alberoComputo";
import type { ControlloTotali } from "@/lib/computo/computoStrutturato";

export type StatoComputo = "bozza" | "verificato" | "contrattuale" | "archiviato";

export interface ComputoCommessa {
  id: string;
  titolo: string | null;
  file_name: string;
  file_type: string;
  stato: StatoComputo;
  extraction_status: string;
  extraction_error: string | null;
  extraction_method: string | null;
  progresso: string | null;
  oggetto_lavori: string | null;
  committente: string | null;
  totale_dichiarato: number | null;
  totale_calcolato: number | null;
  controllo_totali: ControlloTotali | null;
  lavoro_pubblico: boolean;
  stazione_appaltante: string | null;
  cig: string | null;
  cup: string | null;
  ribasso_percentuale: number | null;
  oneri_sicurezza: number | null;
  created_at: string | null;
  variante_di: string | null;
  numero_variante: number | null;
  motivo_variante: string | null;
  contrattuale_dal: string | null;
}

// Stringa non letterale: il tipo della select resta quello dichiarato sotto (ComputoCommessa).
const COLONNE: string = "id, titolo, file_name, file_type, stato, extraction_status, extraction_error, extraction_method, progresso:raw_extracted_json->>progress, oggetto_lavori, committente, totale_dichiarato, totale_calcolato, controllo_totali, lavoro_pubblico, stazione_appaltante, cig, cup, ribasso_percentuale, oneri_sicurezza, created_at, variante_di, numero_variante, motivo_variante, contrattuale_dal";
const IN_CORSO = ["uploading", "extracting_text", "analyzing_ai", "validating"];
export const computoInLettura = (c: Pick<ComputoCommessa, "extraction_status"> | null | undefined) => !!c && IN_CORSO.includes(c.extraction_status);
export const computoLetto = (c: Pick<ComputoCommessa, "extraction_status"> | null | undefined) => !!c && ["review", "completed"].includes(c.extraction_status);

export function useComputiCommessa(orderId: string | undefined, companyId: string | undefined) {
  return useQuery({
    queryKey: ["computo-commessa", orderId, companyId],
    enabled: !!orderId && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("computo_uploads").select(COLONNE)
        .eq("order_id", orderId!).eq("company_id", companyId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ComputoCommessa[];
    },
    refetchInterval: query => (query.state.data ?? []).some(c => computoInLettura(c)) ? 2000 : false,
  });
}

/** Voci con le righe di misura, a pagine da mille (PostgREST non ne dà di più per volta). */
export function useVociComputo(uploadId: string | undefined, abilitato: boolean) {
  return useQuery({
    queryKey: ["computo-commessa-voci", uploadId],
    enabled: !!uploadId && abilitato,
    queryFn: async () => {
      const tutte: VoceComputo[] = [];
      for (let da = 0; ; da += 1000) {
        const { data, error } = await supabase.from("computo_voci_estratte")
          .select("id, ordine, numero_ordine, codice_voce, codice_tariffa, codice_prezzario, descrizione_breve, descrizione_estesa, unita_misura, quantita, prezzo_unitario_computo, importo_computo, super_categoria, categoria, sotto_categoria, is_sicurezza, is_detrazione, a_corpo, warnings, quadro_voce, voce_origine_id, nuovo_prezzo, misure:computo_voci_misure(id, ordine, descrizione, parti_uguali, lunghezza, larghezza, altezza_peso, quantita, formula, planimetria_id, planimetria_versione, planimetria_chiavi)")
          .eq("computo_upload_id", uploadId!).order("ordine").range(da, da + 999);
        if (error) throw error;
        tutte.push(...((data ?? []) as unknown as VoceComputo[]).map(v => ({ ...v, misure: [...(v.misure ?? [])].sort((a, b) => a.ordine - b.ordine) })));
        if (!data || data.length < 1000) break;
      }
      return tutte;
    },
  });
}

export function useCaricaComputo(orderId: string, companyId: string, userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, titolo }: { file: File; titolo: string }) => {
      if (!userId) throw new Error("Accesso scaduto: rientra e riprova.");
      if (/\.dcf$/i.test(file.name)) throw new Error(MESSAGGIO_DCF);
      const fileType = computoFileType(file);
      if (fileType === "image") throw new Error("Per il computo di commessa carica il PDF di PriMus, l'XPWE o l'Excel: una foto non basta per le misure.");
      if (file.size > 50 * 1024 * 1024) throw new Error("File troppo grande: massimo 50 MB.");
      const storagePath = `${companyId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error: errUpload } = await supabase.storage.from("computi").upload(storagePath, file);
      if (errUpload) throw new Error(`Caricamento non riuscito: ${errUpload.message}`);
      const { data: riga, error } = await supabase.from("computo_uploads").insert({
        company_id: companyId, uploaded_by: userId, order_id: orderId, titolo: titolo.trim() || file.name.replace(/\.[^.]+$/, ""),
        file_name: file.name, file_type: fileType, file_size: file.size, storage_path: storagePath,
        extraction_status: "uploading", stato: "bozza",
      }).select("id").single();
      if (error) throw new Error(`Salvataggio non riuscito: ${error.message}`);
      await qc.invalidateQueries({ queryKey: ["computo-commessa", orderId] });
      // La lettura può durare: se la chiamata scade, lo stato lo dice comunque il polling.
      const { error: errFn } = await supabase.functions.invoke("computo-ai-extract", { body: { computoUploadId: riga.id } });
      if (errFn) {
        const { data: salvato } = await supabase.from("computo_uploads").select("extraction_status, extraction_error").eq("id", riga.id).single();
        if (salvato?.extraction_status === "failed") throw new Error(salvato.extraction_error || "Lettura del computo non riuscita.");
      }
      return riga.id;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["computo-commessa", orderId] });
      qc.invalidateQueries({ queryKey: ["computo-commessa-voci"] });
    },
  });
}

export type ModificaComputo = Partial<Pick<ComputoCommessa, "stato" | "titolo" | "lavoro_pubblico" | "stazione_appaltante" | "cig" | "cup" | "ribasso_percentuale">>;

export function useModificaComputo(orderId: string, companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, modifica }: { id: string; modifica: ModificaComputo }) => {
      const { error } = await supabase.from("computo_uploads").update(modifica).eq("id", id).eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["computo-commessa", orderId] }),
  });
}

/** Lavori o somme a disposizione, per una o più voci (un capitolo intero in una volta). */
export function useClassificaVoci(uploadId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, sezione }: { ids: string[]; sezione: "lavori" | "somme_a_disposizione" | null }) => {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from("computo_voci_estratte").update({ quadro_voce: sezione }).in("id", ids.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["computo-commessa-voci", uploadId] }),
  });
}

/** Sblocco del contrattuale: solo con «Ordini e Commesse» e il motivo (lo controlla e lo registra il database). */
export function useSbloccaComputo(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc("computo_sblocca_contrattuale", { p_upload_id: id, p_motivo: motivo });
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["computo-commessa", orderId] }),
  });
}

/** Scarta un computo ancora in bozza (le voci e le misure se ne vanno con lui). */
export function useScartaComputo(orderId: string, companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("computo_uploads").delete().eq("id", id).eq("company_id", companyId).eq("stato", "bozza");
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["computo-commessa", orderId] }),
  });
}
