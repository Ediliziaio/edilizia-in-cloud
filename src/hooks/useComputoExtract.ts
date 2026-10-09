/**
 * Hook per gestire l'upload e l'estrazione AI di computi metrici.
 * Gestisce: upload file → invoca edge function → polling stato → carica voci estratte.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { computoFileType } from "@/lib/computo/uploadFileType";
import type {
  ComputoUpload,
  ComputoVoceEstratta,
  ComputoExtractionStatus,
} from "@/types/computo";
import type { ComputoQuoteItemPayload } from "@/lib/computo/quoteItemMapping";

export function useComputoExtract() {
  const { effectiveCompany, user } = useAuth();
  const qc = useQueryClient();
  const companyId = effectiveCompany?.id;
  const uploadRun = useRef(0);
  useEffect(() => () => { uploadRun.current += 1; }, []);

  const [computoId, setComputoId] = useState<string | null>(null);
  const [status, setStatus] = useState<ComputoExtractionStatus | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // ── Upload + create record ─────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async ({ file, run }: { file: File; run: number }) => {
      if (!companyId || !user) throw new Error("Utente non autenticato");

      setStatus("uploading");
      setError(null);
      setProgress("Caricamento file...");

      // Determine file type
      const fileType = computoFileType(file);

      // Upload to storage
      const storagePath = `${companyId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("computi")
        .upload(storagePath, file);
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);
      if (run !== uploadRun.current) return null;

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
      if (run !== uploadRun.current) return null;

      setComputoId(upload.id);

      // The request can time out even after the database has committed review.
      setProgress("Avvio estrazione AI...");
      const { error: fnErr } = await supabase.functions.invoke(
        "computo-ai-extract",
        { body: { computoUploadId: upload.id } }
      );
      if (run !== uploadRun.current) return upload.id;

      if (fnErr) {
        const { data: saved } = await supabase
          .from("computo_uploads")
          .select("extraction_status, extraction_error")
          .eq("id", upload.id)
          .eq("company_id", companyId)
          .single();
        if (run !== uploadRun.current) return upload.id;
        if (saved && ["review", "completed"].includes(saved.extraction_status)) {
          setStatus(saved.extraction_status as ComputoExtractionStatus);
          setError(null);
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["computo-voci", upload.id] }),
            qc.invalidateQueries({ queryKey: ["computo-upload", upload.id] }),
          ]);
          return upload.id;
        }
        setStatus("failed");
        throw new Error(saved?.extraction_error || fnErr.message);
      }

      return upload.id;
    },
    onError: (err: any, { run }) => {
      if (run !== uploadRun.current) return;
      setStatus("failed");
      setError(err.message);
      toast.error(`Errore: ${err.message}`);
    },
  });

  // ── Poll status via Supabase Realtime or interval ──────────────────────────
  useEffect(() => {
    if (!computoId || !companyId) return;
    let disposed = false;
    let pending = false;
    const run = uploadRun.current;

    const interval = setInterval(async () => {
      if (pending || disposed || run !== uploadRun.current) return;
      pending = true;
      try {
      const { data } = await supabase
        .from("computo_uploads")
        .select("extraction_status, extraction_error, raw_extracted_json")
        .eq("id", computoId)
        .eq("company_id", companyId)
        .single();

      if (disposed || run !== uploadRun.current || !data) return;

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

      setError(data.extraction_error || null);

      // Stop polling when terminal
      if (["review", "completed", "failed"].includes(newStatus)) {
        clearInterval(interval);
        if (newStatus === "review") {
          qc.invalidateQueries({ queryKey: ["computo-voci", computoId] });
          qc.invalidateQueries({ queryKey: ["computo-upload", computoId] });
        }
      }
      } catch {
        // A transient network failure must not mark the server job as failed.
      } finally {
        pending = false;
      }
    }, 2000);

    return () => { disposed = true; clearInterval(interval); };
  }, [computoId, companyId, qc]);

  // ── Load extracted voci ────────────────────────────────────────────────────
  const {
    data: voci = [],
    isLoading: vociLoading,
    error: vociQueryError,
    refetch: refetchVoci,
  } = useQuery({
    queryKey: ["computo-voci", computoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("computo_voci_estratte")
        .select("*")
        .eq("computo_upload_id", computoId!)
        .order("ordine");
      if (error) throw error;
      return (data ?? []) as ComputoVoceEstratta[];
    },
    enabled: !!computoId && status === "review",
  });

  // ── Load upload metadata ───────────────────────────────────────────────────
  const { data: computoUpload, error: uploadQueryError } = useQuery({
    queryKey: ["computo-upload", computoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("computo_uploads")
        .select("*")
        .eq("id", computoId!)
        .single();
      if (error) throw error;
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
      vociIncluse: ComputoQuoteItemPayload[];
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
      const items = vociIncluse.map((voce, index) => ({
        ...voce,
        sort_order: voce.sort_order || index + 1,
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
    uploadRun.current += 1;
    setComputoId(null);
    setStatus(null);
    setProgress("");
    setError(null);
  }, []);

  const loadExistingComputo = useCallback((id: string) => {
    uploadRun.current += 1;
    setComputoId(id);
    setStatus("review");
    setProgress("Pronti per la revisione!");
    setError(null);
    qc.invalidateQueries({ queryKey: ["computo-voci", id] });
    qc.invalidateQueries({ queryKey: ["computo-upload", id] });
  }, [qc]);

  return {
    // State
    computoId,
    status,
    progress,
    error,
    voci,
    vociLoading,
    computoUpload,
    reviewError: vociQueryError || uploadQueryError,
    // Actions
    upload: (file: File) => {
      const run = ++uploadRun.current;
      setComputoId(null);
      uploadMutation.mutate({ file, run });
    },
    isUploading: uploadMutation.isPending,
    generatePreventivo: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
    refetchVoci,
    loadExistingComputo,
    reset,
  };
}
