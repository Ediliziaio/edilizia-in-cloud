/**
 * Hook per gestire l'upload e l'estrazione AI di computi metrici.
 * Gestisce: upload file → invoca edge function → polling stato → carica voci estratte.
 */
import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type {
  ComputoUpload,
  ComputoVoceEstratta,
  ComputoExtractionStatus,
} from "@/types/computo";

const FILE_TYPE_MAP: Record<string, ComputoUpload["file_type"]> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/xml": "xpwe",
  "application/xml": "xpwe",
  "image/jpeg": "image",
  "image/png": "image",
};

export function useComputoExtract() {
  const { effectiveCompany, user } = useAuth();
  const qc = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [computoId, setComputoId] = useState<string | null>(null);
  const [status, setStatus] = useState<ComputoExtractionStatus | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // ── Upload + create record ─────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!companyId || !user) throw new Error("Utente non autenticato");

      setStatus("uploading");
      setError(null);
      setProgress("Caricamento file...");

      // Determine file type
      let fileType = FILE_TYPE_MAP[file.type] || "pdf";
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "xpwe" || ext === "dcf") fileType = "xpwe";

      // Upload to storage
      const storagePath = `${companyId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("computi")
        .upload(storagePath, file);
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      // Create computo_uploads record
      const { data: upload, error: dbErr } = await supabase
        .from("computo_uploads")
        .insert({
          company_id: companyId,
          uploaded_by: user.id,
          file_name: file.name,
          file_type: fileType,
          file_size: file.size,
          storage_path: storagePath,
          extraction_status: "uploading",
        })
        .select()
        .single();
      if (dbErr) throw new Error(`DB error: ${dbErr.message}`);

      setComputoId(upload.id);

      // Invoke edge function (async - non-blocking)
      setProgress("Avvio estrazione AI...");
      const { error: fnErr } = await supabase.functions.invoke(
        "computo-ai-extract",
        { body: { computoUploadId: upload.id } }
      );

      if (fnErr) {
        setStatus("failed");
        setError(fnErr.message);
        throw fnErr;
      }

      return upload.id;
    },
    onError: (err: any) => {
      setStatus("failed");
      setError(err.message);
      toast.error(`Errore: ${err.message}`);
    },
  });

  // ── Poll status via Supabase Realtime or interval ──────────────────────────
  useEffect(() => {
    if (!computoId) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("computo_uploads")
        .select("extraction_status, extraction_error, raw_extracted_json")
        .eq("id", computoId)
        .single();

      if (!data) return;

      const newStatus = data.extraction_status as ComputoExtractionStatus;
      setStatus(newStatus);

      // Update progress text
      const progressMap: Record<string, string> = {
        uploading: "Caricamento file...",
        extracting_text: "Estrazione testo dal documento...",
        analyzing_ai: "Analisi AI in corso...",
        validating: "Validazione dati estratti...",
        review: "Pronti per la revisione!",
        generating: "Generazione preventivo...",
        completed: "Completato!",
        failed: "Errore durante l'estrazione",
      };

      let progressText = progressMap[newStatus] || newStatus;
      // Check for page progress in raw_extracted_json
      if (data.raw_extracted_json && typeof data.raw_extracted_json === "object") {
        const json = data.raw_extracted_json as Record<string, unknown>;
        if (json.progress) progressText = String(json.progress);
      }
      setProgress(progressText);

      if (data.extraction_error) {
        setError(data.extraction_error);
      }

      // Stop polling when terminal
      if (["review", "completed", "failed"].includes(newStatus)) {
        clearInterval(interval);
        if (newStatus === "review") {
          qc.invalidateQueries({ queryKey: ["computo-voci", computoId] });
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [computoId, qc]);

  // ── Load extracted voci ────────────────────────────────────────────────────
  const {
    data: voci = [],
    isLoading: vociLoading,
    refetch: refetchVoci,
  } = useQuery({
    queryKey: ["computo-voci", computoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("computo_voci_estratte")
        .select("*")
        .eq("computo_upload_id", computoId!)
        .order("ordine");
      return (data ?? []) as ComputoVoceEstratta[];
    },
    enabled: !!computoId && status === "review",
  });

  // ── Load upload metadata ───────────────────────────────────────────────────
  const { data: computoUpload } = useQuery({
    queryKey: ["computo-upload", computoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("computo_uploads")
        .select("*")
        .eq("id", computoId!)
        .single();
      return data as ComputoUpload | null;
    },
    enabled: !!computoId && status === "review",
  });

  // ── Generate preventivo from confirmed voci ────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: async ({
      vociIncluse,
      config,
    }: {
      vociIncluse: Array<{
        id: string;
        is_included: boolean;
        descrizione_breve: string;
        descrizione_estesa: string | null;
        capitolo_nome: string | null;
        codice_voce: string | null;
        codice_prezzario: string | null;
        unita_misura: string | null;
        quantita: number;
        prezzo_unitario: number;
        importo: number;
        sconto_percentuale: number;
        // Match listino (opzionale, popolato da auto-match o picker utente)
        matched_template_id?: string;
        matched_family_id?: string;
        matched_name?: string;
      }>;
      config: {
        contactId?: string;
        oggetto?: string;
        note?: string;
      };
    }) => {
      if (!companyId || !user || !computoId) throw new Error("Dati mancanti");

      setStatus("generating");

      // Usa RPC transazionale: crea quote + items in un unico transaction block.
      // Elimina il rischio di quote orfani se items INSERT fallisce (Fix P0-#2).
      const items = vociIncluse
        .filter((v) => v.is_included)
        .map((voce, index) => ({
          id: voce.id,                           // computo_voce_id
          name: voce.matched_name ?? voce.descrizione_breve,
          description: voce.descrizione_estesa || null,
          unit_of_measure: voce.unita_misura || "cad",
          quantity: voce.quantita,
          unit_price: voce.prezzo_unitario,
          line_total: voce.importo * (1 - (voce.sconto_percentuale || 0) / 100),
          discount_percent: voce.sconto_percentuale || 0,
          codice_prezzario: voce.codice_prezzario || null,
          article_template_id: voce.matched_template_id ?? null,
          family_id: voce.matched_family_id ?? null,
          sort_order: index + 1,
        }));

      const { data: rpcResult, error: rpcErr } = await supabase.rpc(
        "silvio_tool_apply_computo_review",
        {
          p_company_id: companyId,
          p_computo_id: computoId,
          p_items: items,
          p_config: {
            oggetto: config.oggetto || computoUpload?.oggetto_lavori || null,
            contact_id: config.contactId || null,
            note: config.note || null,
          },
        }
      );

      if (rpcErr) throw rpcErr;

      const result = rpcResult as { ok: boolean; quote_id?: string; error?: string } | null;
      if (!result?.ok) {
        throw new Error(result?.error || "Generazione fallita lato server");
      }

      return result.quote_id!;
    },
    onSuccess: () => {
      setStatus("completed");
      toast.success("Preventivo generato con successo!");
    },
    onError: (err: any) => {
      setStatus("review");
      toast.error(`Errore generazione: ${err.message}`);
    },
  });

  const reset = useCallback(() => {
    setComputoId(null);
    setStatus(null);
    setProgress("");
    setError(null);
  }, []);

  return {
    // State
    computoId,
    status,
    progress,
    error,
    voci,
    vociLoading,
    computoUpload,
    // Actions
    upload: uploadMutation.mutate,
    isUploading: uploadMutation.isPending,
    generatePreventivo: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
    refetchVoci,
    reset,
  };
}
