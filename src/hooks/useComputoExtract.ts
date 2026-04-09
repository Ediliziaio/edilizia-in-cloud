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
      }>;
      config: {
        contactId?: string;
        oggetto?: string;
        note?: string;
      };
    }) => {
      if (!companyId || !user || !computoId) throw new Error("Dati mancanti");

      setStatus("generating");

      // 1. Generate quote number
      const { data: numData } = await supabase.rpc("generate_quote_number", {
        p_company_id: companyId,
      });
      const quoteNumber = numData || `P-${Date.now()}`;

      // 2. Create quote
      const { data: quote, error: qErr } = await supabase
        .from("quotes")
        .insert({
          company_id: companyId,
          created_by: user.id,
          quote_number: quoteNumber,
          title: config.oggetto || computoUpload?.oggetto_lavori || "Da Computo Metrico",
          status: "bozza",
          source: "computo_ai",
          computo_upload_id: computoId,
          notes: config.note || `Generato da computo metrico: ${computoUpload?.file_name}`,
        })
        .select()
        .single();
      if (qErr) throw qErr;

      // 3. Create quote items
      const items = vociIncluse
        .filter((v) => v.is_included)
        .map((voce, index) => ({
          quote_id: quote.id,
          company_id: companyId,
          sort_order: index + 1,
          item_type: "service" as const,
          item_category: "prodotto" as const,
          name: voce.descrizione_breve,
          description: voce.descrizione_estesa || "",
          unit_of_measure: voce.unita_misura || "cad",
          quantity: voce.quantita,
          unit_price: voce.prezzo_unitario,
          line_total: voce.importo,
          discount_percent: voce.sconto_percentuale || 0,
          vat_rate: 10,
          computo_voce_id: voce.id,
          codice_prezzario: voce.codice_prezzario || null,
          is_optional: false,
          mostra_nel_pdf: true,
        }));

      if (items.length > 0) {
        const { error: iErr } = await supabase.from("quote_items").insert(items);
        if (iErr) throw iErr;
      }

      // 4. Update totals
      const subtotal = items.reduce((s, v) => s + (v.line_total || 0), 0);
      const vatAmount = subtotal * 0.1;
      await supabase
        .from("quotes")
        .update({
          subtotal,
          vat_amount: vatAmount,
          total: subtotal + vatAmount,
        })
        .eq("id", quote.id);

      // 5. Update computo upload
      await supabase
        .from("computo_uploads")
        .update({
          extraction_status: "completed",
          quote_id: quote.id,
        })
        .eq("id", computoId);

      return quote.id;
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
