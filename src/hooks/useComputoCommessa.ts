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
import type { VoceImportata } from "@/lib/computo/importaVoci";
import { improntaVoci, metodoLettura, rigaDaVoce, tipoFileComputo, titoloComputo, type FileOrigine } from "@/lib/computo/computoDaVoci";

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

/**
 * Rilegge un computo la cui lettura è fallita (11/11/2026): stesso caricamento, stesso
 * file, nessun nuovo upload. Serve soprattutto dopo un blocco tolto (carta registrata,
 * abbonamento rinnovato, crediti ricaricati): la funzione accetta un computo `failed`.
 * Se il blocco c'è ancora, il 402 riapre la finestra giusta (lib/creditoEsaurito).
 */
export function useRiprovaLetturaComputo(orderId: string, companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (computoUploadId: string) => {
      const { error: errFn } = await supabase.functions.invoke("computo-ai-extract", { body: { computoUploadId } });
      if (errFn) {
        // La chiamata può scadere anche a lettura finita: conta lo stato salvato.
        const { data: salvato } = await supabase.from("computo_uploads").select("extraction_status, extraction_error")
          .eq("id", computoUploadId).eq("company_id", companyId).single();
        if (salvato?.extraction_status === "failed") throw new Error(salvato.extraction_error || "Lettura del computo non riuscita.");
      }
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

/**
 * Il computo letto e riveduto in «Importa voci» diventa il computo della commessa
 * (14/11/2026, «Genera dal computo» dei materiali): file nel bucket `computi`, riga in
 * `computo_uploads` con `order_id`, voci e misure. Se lo stesso elenco di voci è già
 * caricato nella commessa (stessa impronta) si riusa quello: nessun doppione.
 * Il computo sostituito, se non è una bozza, si archivia (non si cancella), come prima.
 */
export function useSalvaComputoImportato(orderId: string, companyId: string, userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ voci, file, totaleDocumento, sostituisce }: {
      voci: VoceImportata[];
      file: { file: File; formato: string; via: "browser" | "server" }[];
      totaleDocumento: number | null;
      sostituisce?: Pick<ComputoCommessa, "id" | "stato"> | null;
    }): Promise<{ id: string; riusato: boolean }> => {
      if (!userId) throw new Error("Accesso scaduto: rientra e riprova.");
      if (!voci.length) throw new Error("Nessuna voce da salvare.");
      const impronta = improntaVoci(voci);
      const { data: gia, error: errGia } = await supabase.from("computo_uploads").select("id")
        .eq("order_id", orderId).eq("company_id", companyId).neq("stato", "archiviato")
        .eq("raw_extracted_json->>impronta", impronta).limit(1);
      if (errGia) throw new Error(errGia.message);
      if (gia?.length) return { id: gia[0].id, riusato: true };

      const origini: FileOrigine[] = file.map(f => ({ nome: f.file.name, formato: f.formato, via: f.via, dimensione: f.file.size }));
      const percorsi: string[] = [];
      for (const f of file) {
        const percorso = `${companyId}/${Date.now()}-${f.file.name.replace(/[^\w.-]+/g, "_")}`;
        const { error } = await supabase.storage.from("computi").upload(percorso, f.file);
        if (error) throw new Error(`Il file «${f.file.name}» non si è caricato: ${error.message}`);
        percorsi.push(percorso);
      }
      const primo = origini[0];
      const righe = voci.map(rigaDaVoce);
      const totale = righe.reduce((s, r) => s + (r.voce.importo_computo ?? 0) * (r.voce.is_detrazione ? -1 : 1), 0);
      const { data: riga, error } = await supabase.from("computo_uploads").insert({
        company_id: companyId, uploaded_by: userId, order_id: orderId,
        titolo: titoloComputo(origini), file_name: origini.map(o => o.nome).join(", ").slice(0, 500) || "computo",
        file_type: primo ? tipoFileComputo(primo.nome) : "pdf", file_size: origini.reduce((s, o) => s + o.dimensione, 0),
        storage_path: percorsi[0] ?? "", extraction_status: "completed", extraction_method: primo ? metodoLettura(primo) : "xlsx_parse",
        extraction_completed_at: new Date().toISOString(), stato: "bozza",
        totale_calcolato: Math.round(totale * 100) / 100, totale_dichiarato: totaleDocumento,
        raw_extracted_json: { impronta, origine: "genera-materiali", file: origini.map((o, i) => ({ ...o, percorso: percorsi[i] })) },
      }).select("id").single();
      if (error || !riga) throw new Error(`Computo non salvato: ${error?.message ?? "riprova"}`);

      try {
        for (let da = 0; da < righe.length; da += 500) {
          const lotto = righe.slice(da, da + 500);
          const { data: inserite, error: errVoci } = await supabase.from("computo_voci_estratte")
            .insert(lotto.map(r => ({ ...r.voce, computo_upload_id: riga.id, company_id: companyId })))
            .select("id, ordine");
          if (errVoci) throw new Error(`Voci non salvate: ${errVoci.message}`);
          const idPerOrdine = new Map((inserite ?? []).map(v => [v.ordine, v.id]));
          const misure = lotto.flatMap(r => r.misure.map(m => ({ ...m, voce_id: idPerOrdine.get(r.voce.ordine)!, company_id: companyId })))
            .filter(m => m.voce_id);
          for (let j = 0; j < misure.length; j += 1000) {
            const { error: errMisure } = await supabase.from("computo_voci_misure").insert(misure.slice(j, j + 1000));
            if (errMisure) throw new Error(`Misure non salvate: ${errMisure.message}`);
          }
        }
      } catch (e) {
        // Un computo a metà non serve a nessuno: si toglie (le voci vanno con lui).
        await supabase.from("computo_uploads").delete().eq("id", riga.id).eq("company_id", companyId);
        throw e;
      }
      if (sostituisce && sostituisce.stato !== "bozza") {
        await supabase.from("computo_uploads").update({ stato: "archiviato" }).eq("id", sostituisce.id).eq("company_id", companyId);
      }
      return { id: riga.id, riusato: false };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["computo-commessa", orderId] });
      qc.invalidateQueries({ queryKey: ["computo-commessa-voci"] });
    },
  });
}
