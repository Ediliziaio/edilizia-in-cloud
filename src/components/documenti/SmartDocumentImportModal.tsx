/**
 * SmartDocumentImportModal — Importa qualsiasi documento, l'AI capisce cos'è
 * e lo smista al modulo giusto.
 *
 * Pipeline:
 *   1. Upload (drag/drop, qualsiasi formato compatibile)
 *   2. Storage upload bucket "documenti-smart" o fallback "computi"
 *   3. Invoke ai-document-analyzer → classifica, salva audit e lancia parser verticale
 *   4. Mostra risultato + CTA (review computo / dati estratti / redirect / manuale)
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  XCircle,
  Sparkles,
  ArrowRight,
  Brain,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AIProcessingStage } from "@/components/computo/AIProcessingStage";
import {
  SMART_ACCEPTED_EXT,
  SMART_DOC_TYPE_EMOJI,
  SMART_DOC_TYPE_LABEL,
  SMART_DOC_TYPE_OPTIONS,
  SMART_IMPORT_MAX_SIZE,
  buildSmartImportRedirectPath,
  buildSmartImportActionPlan,
  getSmartImportFileKind,
  getSmartImportRiskLevel,
  requiresDocTypeConfirmation,
  type SmartValidationWarning,
} from "@/lib/documenti/smartDocumentImport";
import type { JSX } from "react";

// Sostituiamo i tip di AIProcessingStage iniettando un wrapper minimale.
// (Per non duplicare tutto il file riusiamo lo stesso componente — i tip
//  generici "Sto leggendo…" funzionano anche qui.)

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComputoReady?: (computoUploadId: string) => void;
  /** Bucket dove caricare. Default "documenti-smart"; fallback "computi". */
  storageBucket?: string;
  /** File pre-selezionato (es. da drag&drop esterno). Verrà caricato automaticamente sullo step 1. */
  initialFile?: File | null;
}

const ACCEPTED_EXT = [...SMART_ACCEPTED_EXT];
const MAX_SIZE = SMART_IMPORT_MAX_SIZE;
const DOC_TYPE_LABEL = SMART_DOC_TYPE_LABEL;
const DOC_TYPE_EMOJI = SMART_DOC_TYPE_EMOJI;

function safeStorageName(name: string): string {
  const ext = name.includes(".") ? `.${name.split(".").pop()}` : "";
  const base = name.replace(/\.[^.]+$/, "");
  const cleaned = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${cleaned || "documento"}${ext.toLowerCase()}`;
}

interface ClassifyResponse {
  success: boolean;
  analysis_id?: string;
  doc_type: string;
  confidence: number;
  reasoning: string | null;
  key_fields: Record<string, unknown>;
  next_action: {
    kind: "autoflow" | "redirect" | "manual";
    autoflow_function?: string;
    redirect_url?: string;
    hint?: string;
  };
  ai_meta: {
    model_used: string;
    cost_billed_eur: number;
    elapsed_ms: number;
  };
  file?: {
    storage_bucket: string;
    storage_path: string;
    name: string;
    size: number | null;
    mime_type: string | null;
  };
  cached?: boolean;
  parser_used?: string | null;
  structured_fields?: Record<string, unknown> | null;
  validation?: {
    warnings: SmartValidationWarning[];
    valid: boolean;
    score?: number;
  };
  status?: "success" | "review_required" | "failed" | string;
  processing_time_ms?: number;
  cost_eur?: number | null;
}

interface AnalyzerResponse {
  analysis_id?: string;
  cached?: boolean;
  doc_type?: string;
  classification_confidence?: number | null;
  reasoning?: string | null;
  key_fields?: Record<string, unknown> | null;
  next_action?: ClassifyResponse["next_action"] | null;
  parser_used?: string | null;
  structured_fields?: Record<string, unknown> | null;
  validation?: {
    warnings?: SmartValidationWarning[];
    valid?: boolean;
    score?: number;
  };
  status?: string;
  processing_time_ms?: number;
  cost_eur?: number | null;
  file?: ClassifyResponse["file"];
}

interface DeepExtractResponse {
  success: boolean;
  // ddt-ai-extract returns { ddt: {...} }
  ddt?: Record<string, unknown>;
  // generic-doc-ai-extract returns { extracted: {...}, summary, confidence }
  extracted?: Record<string, unknown>;
  summary?: string;
  confidence?: number;
  warnings?: string[];
  ai_meta: {
    model_used: string;
    cost_billed_eur: number;
    elapsed_ms: number;
  };
}

interface LinkerSuggestion {
  entity_table: string;
  entity_id: string;
  label: string;
  summary: Record<string, unknown>;
  scores: { layer1_supplier: number; layer2_heuristic: number; layer3_ai: number; combined: number };
  reasoning: string;
  rank: number;
}

interface LinkerResponse {
  success: boolean;
  doc_type: string;
  supplier_match?: { id: string; name: string; match_kind: string; score: number };
  suggestions: LinkerSuggestion[];
  best_reasoning?: string;
  policy: { auto_execute_threshold: number; always_confirm: boolean; show_alternatives: boolean };
  auto_executable: boolean;
  message?: string;
  ai_meta?: { model_used: string; cost_billed_eur: number; elapsed_ms: number };
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="h-8 w-8 text-red-500" />;
  if (["xlsx", "xls"].includes(ext || "")) return <FileSpreadsheet className="h-8 w-8 text-green-600" />;
  if (["jpg", "jpeg", "png", "heic", "webp"].includes(ext || ""))
    return <ImageIcon className="h-8 w-8 text-purple-500" />;
  return <FileCode className="h-8 w-8 text-slate-400" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SmartFilePreview({
  file,
  resultFile,
  previewUrl,
}: {
  file: File | null;
  resultFile?: ClassifyResponse["file"];
  previewUrl: string | null;
}) {
  const name = file?.name ?? resultFile?.name ?? "Documento";
  const mime = file?.type || resultFile?.mime_type || "";
  const size = file?.size ?? resultFile?.size ?? null;
  const kind = getSmartImportFileKind(name, mime);

  return (
    <div className="overflow-hidden rounded-lg border bg-slate-50">
      <div className="flex items-center gap-3 border-b bg-white p-3">
        {getFileIcon(name)}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900" title={name}>{name}</p>
          <p className="text-xs text-muted-foreground">
            {kind === "computo_data" ? "File computo" : kind}
            {size ? ` · ${formatBytes(size)}` : ""}
          </p>
        </div>
      </div>

      {kind === "image" && previewUrl ? (
        <div className="flex h-[360px] items-center justify-center bg-slate-100">
          <img loading="lazy" src={previewUrl} alt={name} className="max-h-full max-w-full object-contain" />
        </div>
      ) : kind === "pdf" && previewUrl ? (
        <iframe title={name} src={previewUrl} className="h-[360px] w-full bg-white" />
      ) : (
        <div className="flex h-[220px] flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
          {getFileIcon(name)}
          <p>Anteprima visuale non disponibile per questo formato.</p>
          <p className="text-xs">Il file resta comunque collegato al job AI e al modulo di destinazione.</p>
        </div>
      )}
    </div>
  );
}

export function SmartDocumentImportModal({
  open,
  onOpenChange,
  onComputoReady,
  storageBucket = "documenti-smart",
  initialFile,
}: Props) {
  const navigate = useNavigate();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [file, setFile] = useState<File | null>(null);

  // Quando apriamo il modal con un file pre-selezionato (es. da drag&drop esterno),
  // lo carichiamo automaticamente al primo render del modal aperto.
  useEffect(() => {
    if (open && initialFile && !file) {
      setFile(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [classifyStatus, setClassifyStatus] =
    useState<"uploading" | "extracting_text" | "analyzing_ai" | "validating" | "review" | "failed" | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClassifyResponse | null>(null);
  const [selectedDocType, setSelectedDocType] = useState<string>("altro");
  const [deepResult, setDeepResult] = useState<DeepExtractResponse | null>(null);
  const [linkerResult, setLinkerResult] = useState<LinkerResponse | null>(null);
  const [linking, setLinking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1);
    setFile(null);
    setClassifyStatus(null);
    setProgress("");
    setError(null);
    setResult(null);
    setSelectedDocType("altro");
    setDeepResult(null);
    setLinkerResult(null);
    setLinking(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const kind = getSmartImportFileKind(file.name, file.type);
    if (kind !== "image" && kind !== "pdf") {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFileSelect = useCallback((f: File) => {
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXT.includes(ext)) {
      toast.error("Formato non supportato. Usa PDF, immagine, Excel, XPWE o DCF.");
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error(`File troppo grande (max ${formatBytes(MAX_SIZE)}).`);
      return;
    }
    setFile(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelect(f);
    },
    [handleFileSelect]
  );

  const handleStartClassify = async () => {
    if (!file || !companyId || !user) return;
    setStep(2);
    setError(null);
    setClassifyStatus("uploading");
    setProgress("Carico il file…");

    try {
      // 1. Upload to storage. Try preferred bucket first, fallback su "computi"
      const path = `${companyId}/smart-${Date.now()}-${safeStorageName(file.name)}`;

      let usedBucket = storageBucket;
      let upErr = (
        await supabase.storage.from(storageBucket).upload(path, file)
      ).error;

      if (upErr && upErr.message?.includes("Bucket not found")) {
        // Bucket non ancora creato → fallback su "computi" che esiste sicuramente
        usedBucket = "computi";
        upErr = (await supabase.storage.from("computi").upload(path, file)).error;
      }
      if (upErr) throw new Error(`Upload: ${upErr.message}`);

      setClassifyStatus("extracting_text");
      setProgress("Preparo il documento per l'AI…");

      // 2. Invoke analyzer: classifica, salva audit e prova il parser verticale.
      setClassifyStatus("analyzing_ai");
      setProgress("L'AI classifica il documento ed estrae i dati utili…");
      const { data, error: fnErr } = await supabase.functions.invoke<AnalyzerResponse>(
        "ai-document-analyzer",
        {
          body: {
            storage_bucket: usedBucket,
            storage_path: path,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type || "application/pdf",
            company_id: companyId,
          },
        }
      );

      if (fnErr || !data?.doc_type) {
        // supabase-js maschera il body dell'errore con "Edge Function returned
        // a non-2xx status code": qui si ripesca il messaggio vero (es. crediti
        // AI esauriti, saldo OpenRouter, documento illeggibile…).
        let realMsg = fnErr?.message || "Analisi documento fallita";
        const ctx = (fnErr as unknown as { context?: Response } | null)?.context;
        if (ctx && typeof ctx.text === "function") {
          try {
            const body = await ctx.clone().text();
            const parsed = JSON.parse(body) as { error?: string; message?: string };
            realMsg = parsed.error ?? parsed.message ?? realMsg;
          } catch { /* body non-JSON */ }
        }
        throw new Error(realMsg);
      }

      const normalized: ClassifyResponse = {
        success: true,
        analysis_id: data.analysis_id,
        cached: data.cached,
        doc_type: data.doc_type,
        confidence: data.classification_confidence ?? 0,
        reasoning: data.reasoning ?? "",
        key_fields: data.key_fields ?? {},
        next_action: data.next_action ?? {
          kind: "manual",
          hint: "Documento analizzato. Verifica manualmente il tipo prima di proseguire.",
        },
        ai_meta: {
          model_used: data.parser_used ?? "ai-document-analyzer",
          cost_billed_eur: data.cost_eur ?? 0,
          elapsed_ms: data.processing_time_ms ?? 0,
        },
        file: data.file,
        parser_used: data.parser_used,
        structured_fields: data.structured_fields ?? null,
        validation: {
          warnings: data.validation?.warnings ?? [],
          valid: data.validation?.valid ?? true,
          score: data.validation?.score,
        },
        status: data.status,
        processing_time_ms: data.processing_time_ms,
        cost_eur: data.cost_eur,
      };

      setClassifyStatus("validating");
      setProgress(`Riconosciuto: ${DOC_TYPE_LABEL[normalized.doc_type] ?? normalized.doc_type}`);
      // Lascia un attimo per mostrare il "validating" pulse
      await new Promise((r) => setTimeout(r, 400));
      setClassifyStatus("review");
      setResult(normalized);
      setSelectedDocType(normalized.doc_type);
      setStep(3);
    } catch (e) {
      setClassifyStatus("failed");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAction = async () => {
    if (!result) return;

    const isAiType = selectedDocType === result.doc_type;
    const plan = buildSmartImportActionPlan({
      docType: selectedDocType,
      nextAction: isAiType ? result.next_action : null,
      parserUsed: isAiType ? result.parser_used : null,
      structuredFields: isAiType ? result.structured_fields : null,
    });

    if (plan.kind === "computo_review") {
      toast.success("Computo estratto: apro la revisione delle voci.");
      handleClose();
      if (onComputoReady) {
        onComputoReady(plan.computoUploadId);
      } else {
        navigate(`/azienda/marketing/preventivi?action=import-computo&computo_id=${encodeURIComponent(plan.computoUploadId)}`);
      }
      return;
    }

    if (plan.kind === "review_extracted") {
      const extracted = result.structured_fields ?? result.key_fields ?? {};
      setDeepResult({
        success: true,
        extracted,
        summary: `Documento analizzato e salvato${result.analysis_id ? ` (#${result.analysis_id.slice(0, 8)})` : ""}.`,
        confidence: result.validation?.score ?? result.confidence,
        warnings: result.validation?.warnings?.map((warning) => warning.message ?? "Verifica consigliata"),
        ai_meta: {
          model_used: result.parser_used ?? result.ai_meta.model_used,
          cost_billed_eur: result.cost_eur ?? result.ai_meta.cost_billed_eur,
          elapsed_ms: result.processing_time_ms ?? result.ai_meta.elapsed_ms,
        },
      });
      setStep(4);
      if (selectedDocType === "ddt" && result.file) {
        await runLinker(selectedDocType, extracted, result.file);
      }
      return;
    }

    if (plan.kind === "redirect") {
      const redirectPath = buildSmartImportRedirectPath(plan.url, {
        analysisId: result.analysis_id,
        docType: selectedDocType,
      });
      handleClose();
      navigate(redirectPath);
      toast.info("Documento salvato: continuo nel modulo corretto.");
      return;
    }

    toast.info(plan.hint ?? "Verifica manualmente il documento.");
    handleClose();
  };

  // ── Linker: cerca match nel DB e propone / auto-esegue ─────────────────
  const runLinker = async (
    docType: string,
    extracted: Record<string, unknown>,
    fileInfo?: ClassifyResponse["file"],
  ) => {
    if (!companyId) return;
    setLinking(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke<LinkerResponse>(
        "document-ai-linker",
        {
          body: {
            doc_type: docType,
            extracted,
            company_id: companyId,
            file_info: fileInfo
              ? {
                  storage_bucket: fileInfo.storage_bucket,
                  storage_path: fileInfo.storage_path,
                  file_name: fileInfo.name,
                }
              : undefined,
          },
        }
      );
      if (fnErr || !data?.success) {
        toast.error(`Linker fallito: ${fnErr?.message ?? "?"}`);
        return;
      }
      setLinkerResult(data);

      // Auto-execute se policy lo permette E top suggestion supera soglia
      if (data.auto_executable && data.suggestions[0]) {
        const top = data.suggestions[0];
        await attachToEntity(top, true, data);
        toast.success(
          `🔗 Allegato automaticamente a ${top.label} (confidence ${(top.scores.combined * 100).toFixed(0)}%)`,
          { duration: 6000, action: { label: "Annulla", onClick: () => undoLastAttach() } }
        );
        setStep(5);
      } else if (data.suggestions.length > 0) {
        setStep(5); // utente sceglie
      } else {
        // Nessun match — mostra messaggio nel modal
        setStep(5);
      }
    } catch (e) {
      toast.error(`Linker errore: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLinking(false);
    }
  };

  const [lastAttachId, setLastAttachId] = useState<string | null>(null);

  const attachToEntity = async (
    suggestion: LinkerSuggestion,
    aiSuggested: boolean,
    linker: LinkerResponse,
  ): Promise<string | null> => {
    if (!companyId || !user || !result?.file || !deepResult) return null;
    try {
      // FIX 13 (C7): upsert con onConflict per evitare duplicati su doppio click/retry
      // L'unique index parziale (company_id,entity_table,entity_id,storage_path) WHERE deleted_at IS NULL
      // garantisce idempotenza dell'INSERT.
      const { data, error: insErr } = await supabase
        .from("entity_attachments" as never)
        .upsert({
          company_id: companyId,
          entity_table: suggestion.entity_table,
          entity_id: suggestion.entity_id,
          storage_bucket: result.file.storage_bucket,
          storage_path: result.file.storage_path,
          file_name: result.file.name,
          file_size: result.file.size,
          mime_type: result.file.mime_type,
          doc_type: linker.doc_type,
          ai_payload: deepResult.ddt ?? deepResult.extracted ?? {},
          attached_by: user.id,
          ai_suggested: aiSuggested,
          user_confirmed: !aiSuggested,
          link_confidence: suggestion.scores.combined,
          link_reasoning: suggestion.reasoning,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any, {
          onConflict: "company_id,entity_table,entity_id,storage_path",
          ignoreDuplicates: false,
        })
        .select("id")
        .single();
      if (insErr) {
        toast.error(`Allegato fallito: ${insErr.message}`);
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const id = (data as any)?.id ?? null;
      setLastAttachId(id);
      return id;
    } catch (e) {
      toast.error(`Allegato eccezione: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };

  const undoLastAttach = async () => {
    if (!lastAttachId) return;
    await supabase
      .from("entity_attachments" as never)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id } as any)
      .eq("id", lastAttachId);
    toast.info("Allegato annullato");
    setLastAttachId(null);
  };

  const handleConfirmManual = async (suggestion: LinkerSuggestion) => {
    if (!linkerResult) return;
    const id = await attachToEntity(suggestion, false, linkerResult);
    if (id) {
      toast.success(`Allegato a ${suggestion.label}`);
      handleClose();
    }
  };

  // Helper: render JSON nidificato come tree leggibile
  const renderValue = (val: unknown, depth = 0): JSX.Element => {
    if (val === null || val === undefined) {
      return <span className="text-muted-foreground italic">—</span>;
    }
    if (typeof val === "boolean") {
      return <span className={val ? "text-green-600" : "text-red-600"}>{val ? "sì" : "no"}</span>;
    }
    if (typeof val === "number") {
      return <span className="tabular-nums">{val.toLocaleString("it-IT")}</span>;
    }
    if (typeof val === "string") {
      return <span title={val}>{val.length > 100 ? val.slice(0, 100) + "…" : val}</span>;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return <span className="text-muted-foreground italic">vuoto</span>;
      if (typeof val[0] !== "object") {
        return (
          <span>
            {val.slice(0, 6).map((x, i) => (
              <span key={i} className="inline-block bg-slate-100 px-1.5 py-0.5 rounded text-xs mr-1 mb-1">
                {String(x)}
              </span>
            ))}
            {val.length > 6 && <span className="text-xs text-slate-500">+{val.length - 6}</span>}
          </span>
        );
      }
      return (
        <ul className="list-disc list-inside space-y-1">
          {val.slice(0, 8).map((item, i) => (
            <li key={i} className="text-xs">
              {typeof item === "object"
                ? Object.entries(item as Record<string, unknown>).slice(0, 4).map(([k, v]) => (
                    <span key={k} className="mr-2">
                      <span className="text-slate-500">{k}:</span> {String(v ?? "—")}
                    </span>
                  ))
                : String(item)}
            </li>
          ))}
          {val.length > 8 && <li className="text-xs text-slate-500">…+{val.length - 8} altre</li>}
        </ul>
      );
    }
    if (typeof val === "object") {
      const entries = Object.entries(val as Record<string, unknown>);
      if (entries.length === 0) return <span className="text-muted-foreground italic">—</span>;
      if (depth >= 2) return <span className="text-muted-foreground italic">…</span>;
      return (
        <dl className={`grid grid-cols-[max-content_1fr] gap-x-2 gap-y-0.5 ${depth > 0 ? "pl-3 border-l border-slate-200" : ""}`}>
          {entries.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-xs text-slate-500 capitalize">{k.replace(/_/g, " ")}</dt>
              <dd className="text-xs text-slate-800">{renderValue(v, depth + 1)}</dd>
            </div>
          ))}
        </dl>
      );
    }
    return <span>{String(val)}</span>;
  };

  const selectedMatchesAi = result ? selectedDocType === result.doc_type : true;
  const actionPlan = result
    ? buildSmartImportActionPlan({
        docType: selectedDocType,
        nextAction: selectedMatchesAi ? result.next_action : null,
        parserUsed: selectedMatchesAi ? result.parser_used : null,
        structuredFields: selectedMatchesAi ? result.structured_fields : null,
      })
    : null;
  const riskLevel = result ? getSmartImportRiskLevel(result.confidence, result.validation?.warnings) : "ok";
  const selectedDocLabel = DOC_TYPE_LABEL[selectedDocType] ?? selectedDocType;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={step === 3 || step === 4
          ? "sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
          : "sm:max-w-xl"}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-orange-500" />
            {step === 1 && "Importa documento intelligente"}
            {step === 2 && "Analisi documento in corso…"}
            {step === 3 && "Documento riconosciuto"}
            {step === 4 && result && (
              <>
                <span>{DOC_TYPE_EMOJI[result.doc_type] ?? "📄"}</span>
                Dati estratti: {DOC_TYPE_LABEL[result.doc_type] ?? result.doc_type}
              </>
            )}
            {step === 5 && (
              <>
                <Link2 className="h-5 w-5 text-orange-500" />
                Collegamenti suggeriti dall'AI
              </>
            )}
          </DialogTitle>
          {/* Mobile: niente spiegazione, basta il riquadro per scegliere il file. */}
          {step === 1 && (
            <p className="text-sm text-muted-foreground max-sm:hidden">
              Carica un PDF, una foto, un Excel o un file computo. L'AI lo classifica,
              prova a estrarre i dati e lo porta al modulo corretto senza farti
              ricaricare il documento.
            </p>
          )}
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer max-sm:p-5 ${
                dragOver ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:border-slate-300"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ACCEPTED_EXT.join(",")}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
              {file ? (
                <div className="flex items-center gap-3 justify-center">
                  {getFileIcon(file.name)}
                  <div className="text-left">
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-slate-300 mb-3 max-sm:mb-2 max-sm:h-8 max-sm:w-8" />
                  {/* Sul telefono non si trascina: si tocca il riquadro. */}
                  <p className="text-sm font-medium max-sm:hidden">Trascina qui un documento</p>
                  <p className="text-sm font-medium sm:hidden">Tocca per scegliere il file</p>
                  <p className="text-xs text-muted-foreground mt-1 max-sm:hidden">
                    PDF, immagine, Excel, XPWE o DCF — Max {formatBytes(MAX_SIZE)}
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleStartClassify} disabled={!file} className="max-sm:w-full">
                <Sparkles className="h-4 w-4 mr-1" /> Analizza e prepara importazione
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <AIProcessingStage
            status={classifyStatus}
            progress={progress}
            error={error}
            onRetry={() => { reset(); }}
            onCancel={handleClose}
          />
        )}

        {step === 3 && result && (
          <div className="grid gap-4 overflow-y-auto pr-1 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            <SmartFilePreview file={file} resultFile={result.file} previewUrl={previewUrl} />
            <div className="space-y-4">
            {/* Hero risultato */}
            <div
              className={`text-center py-4 rounded-xl border ${
                riskLevel === "error"
                  ? "bg-red-50 border-red-200"
                  : riskLevel === "warn"
                    ? "bg-amber-50 border-amber-200"
                    : "bg-gradient-to-br from-orange-50 to-amber-50 border-orange-100"
              }`}
            >
              <div className="text-5xl mb-2">{DOC_TYPE_EMOJI[result.doc_type] ?? "📄"}</div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Tipo documento rilevato
              </p>
              <p className="text-xl font-semibold text-slate-800 mt-0.5">
                {DOC_TYPE_LABEL[result.doc_type] ?? result.doc_type}
              </p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    result.confidence >= 0.85
                      ? "border-green-400 text-green-700"
                      : result.confidence >= 0.6
                        ? "border-amber-400 text-amber-700"
                        : "border-red-400 text-red-700"
                  }
                >
                  Confidence: {(result.confidence * 100).toFixed(0)}%
                </Badge>
                {result.parser_used && (
                  <Badge variant="secondary">
                    {result.parser_used === "router_only" ? "solo classificazione" : "parser attivo"}
                  </Badge>
                )}
              </div>
            </div>

            {/* Override tipo documento */}
            <div className="rounded-lg border bg-white p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Conferma destinazione
                  </p>
                  <p className="text-sm text-slate-700">
                    Se l'AI ha sbagliato, scegli il modulo corretto prima di proseguire.
                  </p>
                </div>
                {requiresDocTypeConfirmation(result.confidence) && (
                  <Badge variant="outline" className="border-amber-400 text-amber-700 shrink-0">
                    verifica richiesta
                  </Badge>
                )}
              </div>
              <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo documento" />
                </SelectTrigger>
                <SelectContent>
                  {SMART_DOC_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {DOC_TYPE_EMOJI[option.value] ?? "📄"} {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedMatchesAi && (
                <p className="text-xs text-amber-700">
                  Procedo come {selectedDocLabel}: uso il modulo dedicato e conservo il job AI come audit.
                </p>
              )}
            </div>

            {/* Reasoning — mobile no: spiegazione, non serve per proseguire. */}
            <div className="text-sm bg-slate-50 rounded-lg p-3 max-sm:hidden">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Perché?
              </p>
              <p className="text-slate-700 italic">{result.reasoning}</p>
            </div>

            {result.validation?.warnings && result.validation.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">
                  Controlli qualità
                </p>
                <ul className="space-y-1 text-amber-900">
                  {result.validation.warnings.slice(0, 3).map((warning, index) => (
                    <li key={`${warning.message ?? "warning"}-${index}`}>
                      {warning.severity === "error" ? "Errore: " : "Avviso: "}
                      {warning.message ?? "Verifica consigliata"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Key fields */}
            {Object.keys(result.key_fields).length > 0 && (
              <div className="text-sm">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Dati estratti
                </p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {Object.entries(result.key_fields).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-slate-500">{k.replace(/_/g, " ")}</dt>
                      <dd className="text-slate-800 font-medium truncate" title={String(v)}>
                        {v == null || v === "" ? "—" : String(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* AI meta — mobile no: modello, tempi e costo sono dati tecnici. */}
            <p className="text-[10px] text-muted-foreground text-right max-sm:hidden">
              {result.analysis_id ? `job ${result.analysis_id.slice(0, 8)} · ` : ""}
              {result.ai_meta.model_used} · {(result.ai_meta.elapsed_ms / 1000).toFixed(1)}s · €{result.ai_meta.cost_billed_eur.toFixed(4)}
            </p>

            {/* CTA */}
            <div className="flex justify-between gap-2 pt-2 border-t">
              <Button variant="outline" onClick={handleClose}>
                Chiudi
              </Button>
              <Button onClick={handleAction} className="gap-1">
                {actionPlan?.label ?? "Continua"}
                {actionPlan?.kind === "redirect" && <ExternalLink className="h-4 w-4" />}
                {actionPlan?.kind === "computo_review" && <ArrowRight className="h-4 w-4" />}
                {actionPlan?.kind === "review_extracted" && <ArrowRight className="h-4 w-4" />}
                {actionPlan?.kind === "manual" && <CheckCircle2 className="h-4 w-4" />}
              </Button>
            </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Deep extract result ──────────────────────────────── */}
        {step === 4 && deepResult && result && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            {/* Sintesi narrativa */}
            {deepResult.summary && (
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-sm">
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-1">
                  Sintesi
                </p>
                <p className="text-slate-700">{deepResult.summary}</p>
              </div>
            )}

            {/* Warnings */}
            {deepResult.warnings && deepResult.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
                <p className="font-semibold mb-1">⚠️ Attenzione</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {deepResult.warnings.map((w, i) => (<li key={i}>{w}</li>))}
                </ul>
              </div>
            )}

            {/* Dati estratti — JSON tree readable */}
            <div className="flex-1 overflow-auto border rounded-lg p-3 bg-slate-50/50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Dati estratti (JSON strutturato)
              </p>
              {renderValue(deepResult.ddt ?? deepResult.extracted ?? {})}
            </div>

            {/* Footer meta + actions */}
            <div className="flex items-center justify-between border-t pt-3">
              <div className="text-[10px] text-muted-foreground max-sm:hidden">
                {deepResult.ai_meta.model_used} · {(deepResult.ai_meta.elapsed_ms / 1000).toFixed(1)}s · €{deepResult.ai_meta.cost_billed_eur.toFixed(4)}
                {deepResult.confidence != null && (
                  <span className="ml-2">· confidence {(deepResult.confidence * 100).toFixed(0)}%</span>
                )}
              </div>
              <div className="flex gap-2 max-sm:w-full">
                <Button variant="outline" size="sm" className="max-sm:hidden" onClick={() => {
                  const payload = JSON.stringify(deepResult.ddt ?? deepResult.extracted ?? {}, null, 2);
                  navigator.clipboard?.writeText(payload).then(
                    () => toast.success("JSON copiato negli appunti"),
                    () => toast.error("Copia non riuscita"),
                  );
                }}>
                  Copia JSON
                </Button>
                {linking && (
                  <div className="flex items-center text-xs text-muted-foreground gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cerco collegamenti…
                  </div>
                )}
                <Button onClick={handleClose} className="max-sm:flex-1">
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Fatto
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 5: Collegamenti suggeriti dal Linker ─────────────────── */}
        {step === 5 && linkerResult && (
          <div className="space-y-4">
            {/* Banner riepilogo */}
            {linkerResult.supplier_match && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
                  Fornitore identificato
                </p>
                <p className="text-slate-800 font-medium">
                  {linkerResult.supplier_match.name}
                  <span className="ml-2 text-xs text-blue-600">
                    ({linkerResult.supplier_match.match_kind === "vat_exact" ? "match P.IVA esatto" : "match nome fuzzy"})
                  </span>
                </p>
              </div>
            )}

            {/* Best reasoning AI */}
            {linkerResult.best_reasoning && (
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-sm">
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-1">
                  💡 Cosa ha capito l'AI
                </p>
                <p className="text-slate-700 italic">{linkerResult.best_reasoning}</p>
              </div>
            )}

            {/* Empty state — con CTA "Crea fornitore al volo" se DDT senza supplier */}
            {linkerResult.suggestions.length === 0 && (
              <div className="text-center py-5 px-4 bg-slate-50 rounded-lg space-y-3">
                <div>
                  <p className="text-sm text-slate-700 font-medium mb-1">Nessun collegamento trovato</p>
                  <p className="text-xs text-muted-foreground">
                    {linkerResult.message ?? "L'AI non ha trovato un OdA o entità a cui collegare questo documento."}
                  </p>
                </div>
                {linkerResult.doc_type === "ddt" && (() => {
                  // Estrai suggerimento fornitore da DDT estratto
                  const ddt = (deepResult?.ddt ?? {}) as Record<string, unknown>;
                  const mittente = (ddt.mittente ?? {}) as Record<string, unknown>;
                  const ragSoc = String(mittente.ragione_sociale ?? "");
                  const piva = String(mittente.partita_iva ?? "");
                  const indirizzo = String(mittente.indirizzo ?? "");
                  const comune = String(mittente.comune ?? "");
                  const provincia = String(mittente.provincia ?? "");
                  const paese = String(mittente.paese ?? "");
                  if (!ragSoc) return null;
                  return (
                    <div className="bg-white border border-orange-200 rounded-lg p-3 text-left">
                      <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-1.5">
                        💡 Crea il fornitore con i dati del DDT
                      </p>
                      <div className="text-xs space-y-0.5 text-slate-700 mb-2.5">
                        <p><strong>{ragSoc}</strong></p>
                        {piva && <p>P.IVA: {piva}</p>}
                        {indirizzo && <p>{indirizzo}</p>}
                        {(comune || provincia || paese) && (
                          <p className="text-slate-500">{[comune, provincia, paese].filter(Boolean).join(", ")}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={async () => {
                          if (!companyId) return;
                          try {
                            const isForeign = paese && !/italia|italy/i.test(paese);
                            const { error: insErr } = await supabase
                              .from("suppliers" as never)
                              .insert({
                                company_id: companyId,
                                name: ragSoc,
                                vat_number: piva || null,
                                address: indirizzo || null,
                                city: comune || null,
                                province: provincia || null,
                                country: paese || "Italia",
                                is_foreign: !!isForeign,
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              } as any)
                              .select("id, name")
                              .single();
                            if (insErr) {
                              toast.error(`Creazione fornitore: ${insErr.message}`);
                              return;
                            }
                            toast.success(`Fornitore "${ragSoc}" creato. Ricerco i collegamenti…`);
                            // Re-run linker per cercare di nuovo (ora con il fornitore esistente, troverà OdA se ce ne sono)
                            await runLinker(linkerResult.doc_type, ddt, result?.file);
                          } catch (e) {
                            toast.error(`Errore: ${e instanceof Error ? e.message : String(e)}`);
                          }
                        }}
                      >
                        + Crea fornitore al volo
                      </Button>
                    </div>
                  );
                })()}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(linkerResult.doc_type === "ddt" ? "/azienda/operativo/fornitori" : "/azienda")}
                >
                  Apri sezione gestione →
                </Button>
              </div>
            )}

            {/* Auto-executed banner */}
            {linkerResult.auto_executable && linkerResult.suggestions[0] && lastAttachId && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5" /> Auto-collegato
                </p>
                <p className="text-slate-800">
                  Allegato a <strong>{linkerResult.suggestions[0].label}</strong> (confidence{" "}
                  {(linkerResult.suggestions[0].scores.combined * 100).toFixed(0)}%).
                </p>
                <Button variant="link" size="sm" onClick={undoLastAttach} className="text-red-600 px-0 h-auto">
                  Annulla collegamento
                </Button>
              </div>
            )}

            {/* Lista candidati ranked */}
            {linkerResult.suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {linkerResult.auto_executable ? "Alternative considerate" : "Scegli a cosa allegare"}
                </p>
                {linkerResult.suggestions.map((s) => {
                  const isTop = s.rank === 1;
                  const isAlreadyAttached = isTop && linkerResult.auto_executable && lastAttachId;
                  const scorePercent = (s.scores.combined * 100).toFixed(0);
                  return (
                    <div
                      key={s.entity_id}
                      className={`border rounded-lg p-3 ${
                        isTop ? "border-orange-200 bg-orange-50/30" : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant="outline"
                              className={
                                s.scores.combined >= 0.85
                                  ? "border-green-400 text-green-700 bg-white"
                                  : s.scores.combined >= 0.6
                                  ? "border-amber-400 text-amber-700 bg-white"
                                  : "border-red-400 text-red-700 bg-white"
                              }
                            >
                              #{s.rank} · {scorePercent}%
                            </Badge>
                            <span className="text-sm font-medium text-slate-800 truncate">{s.label}</span>
                          </div>
                          {s.summary?.order_description ? (
                            <p className="text-xs text-slate-600 mb-1">
                              📁 Commessa: <em>{String(s.summary.order_description)}</em>
                            </p>
                          ) : null}
                          <p className="text-xs text-muted-foreground italic">{s.reasoning}</p>
                          <div className="flex gap-3 mt-1.5 text-[10px] text-slate-500">
                            <span>Fornitore: {(s.scores.layer1_supplier * 100).toFixed(0)}%</span>
                            <span>Heuristic: {(s.scores.layer2_heuristic * 100).toFixed(0)}%</span>
                            <span>AI: {(s.scores.layer3_ai * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={isAlreadyAttached ? "outline" : isTop ? "default" : "outline"}
                          disabled={!!isAlreadyAttached}
                          onClick={() => handleConfirmManual(s)}
                        >
                          {isAlreadyAttached ? (
                            <><CheckCircle2 className="h-4 w-4 mr-1" /> Allegato</>
                          ) : (
                            <>Allega</>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between border-t pt-3">
              <p className="text-[10px] text-muted-foreground">
                Policy: soglia auto {(linkerResult.policy.auto_execute_threshold * 100).toFixed(0)}%
                {linkerResult.policy.always_confirm && " · sempre conferma"}
                {linkerResult.ai_meta && ` · ${linkerResult.ai_meta.model_used} · €${linkerResult.ai_meta.cost_billed_eur.toFixed(4)}`}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(4)}>
                  ← Dati
                </Button>
                <Button onClick={handleClose}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Fatto
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
