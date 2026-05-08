/**
 * Modal a 4 step per upload computo metrico e generazione preventivo AI.
 * Step 1: Upload file (drag & drop)
 * Step 2: Configurazione (cliente, ricarico)
 * Step 3: Processing AI (progress bar)
 * Step 4: Preview & Review (ComputoPreviewEditor)
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  FileUp,
  FileText,
  FileSpreadsheet,
  FileCode,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Upload,
  Image as ImageIcon,
  AlertTriangle,
} from "lucide-react";
import { useComputoExtract } from "@/hooks/useComputoExtract";
import { ComputoPreviewEditor } from "./ComputoPreviewEditor";
import { AIProcessingStage } from "./AIProcessingStage";
import { MatchProductPickerDialog } from "@/components/quotes/MatchProductPickerDialog";
import type { ComputoVoceLocal } from "@/types/computo";
import type { CatalogItem } from "@/types/catalogItem";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (quoteId: string) => void;
  /**
   * Modalità del modale:
   * - "computo" (default): caricamento computi metrici (PDF/Excel/XPWE)
   * - "foto": scatto/foto di un preventivo scritto a mano o PDF informale,
   *   l'AI estrae righe e fa matching col listino prodotti.
   */
  intent?: "computo" | "foto";
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/xml",
  "application/xml",
  "image/jpeg",
  "image/png",
];
const ACCEPTED_EXT = [".pdf", ".xlsx", ".xls", ".xpwe", ".dcf", ".jpg", ".jpeg", ".png"];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="h-8 w-8 text-red-500" />;
  if (ext === "xlsx" || ext === "xls") return <FileSpreadsheet className="h-8 w-8 text-green-600" />;
  if (ext === "xpwe" || ext === "dcf") return <FileCode className="h-8 w-8 text-blue-500" />;
  if (["jpg", "jpeg", "png"].includes(ext || "")) return <ImageIcon className="h-8 w-8 text-purple-500" />;
  return <FileUp className="h-8 w-8 text-slate-400" />;
}

export function ComputoUploadModal({ open, onOpenChange, onComplete, intent = "computo" }: Props) {
  const isFotoMode = intent === "foto";
  const navigate = useNavigate();
  const {
    status,
    progress,
    error,
    voci,
    vociLoading,
    computoUpload,
    upload,
    isUploading,
    generatePreventivo,
    isGenerating,
    reset,
  } = useComputoExtract();

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [ricarico, setRicarico] = useState(15);
  const [applyRicarico, setApplyRicarico] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voci locali per il preview editor
  const [vociLocali, setVociLocali] = useState<ComputoVoceLocal[]>([]);

  // Stato del picker articoli del listino (per abbinamento manuale)
  const [pickerVoceId, setPickerVoceId] = useState<string | null>(null);
  const [pickerInitialQuery, setPickerInitialQuery] = useState("");

  const handleClose = () => {
    reset();
    setStep(1);
    setFile(null);
    setVociLocali([]);
    setPickerVoceId(null);
    hasInitializedRef.current = false;
    onOpenChange(false);
  };

  // Apre il picker per la voce selezionata
  const handleMatchClick = useCallback((voceId: string, query: string) => {
    setPickerVoceId(voceId);
    setPickerInitialQuery(query);
  }, []);

  // Quando l'utente seleziona un articolo dal picker
  const handleManualMatch = useCallback(
    (item: CatalogItem) => {
      if (!pickerVoceId) return;
      const isFamily = item.source === "family";
      const ric = applyRicarico ? ricarico : 0;
      setVociLocali((prev) =>
        prev.map((v) => {
          if (v.id !== pickerVoceId) return v;
          // Applica il prezzo dal listino (con eventuale ricarico) se disponibile,
          // altrimenti mantieni il prezzo computo già calcolato.
          const newPrezzo =
            item.prezzo_base_vendita != null
              ? item.prezzo_base_vendita * (1 + ric / 100)
              : v._prezzoImpresa;
          return {
            ...v,
            _matched_template_id: isFamily ? undefined : item.id,
            _matched_family_id: isFamily ? item.id : undefined,
            _matched_name: item.nome,
            _match_type: "manual",
            _matched_unit_price: item.prezzo_base_vendita ?? undefined,
            // Fix: aggiorna anche prezzo/importo impresa con il valore dal listino
            _prezzoImpresa: newPrezzo,
            _importoImpresa: v.quantita * newPrezzo,
          };
        }),
      );
      toast.success(`Abbinato: ${item.nome}`);
      setPickerVoceId(null);
    },
    [pickerVoceId, ricarico, applyRicarico],
  );

  // ── Step 1: File selection ─────────────────────────────────────────────────
  const handleFileSelect = useCallback((f: File) => {
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXT.includes(ext) && !ACCEPTED_TYPES.includes(f.type)) {
      toast.error("Formato file non supportato. Usa PDF, Excel, XPWE o DCF.");
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error("File troppo grande. Massimo 50MB.");
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

  // ── Step 2 → 3: Start processing ──────────────────────────────────────────
  const handleStartProcessing = () => {
    if (!file) return;
    setStep(3);
    upload(file);
  };

  // When extraction reaches "review", jump to step 4
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (status === "review" && step === 3 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      if (voci.length === 0) {
        // Fix 12: 0 voci — mostra errore con 3 azioni chiare invece di toast generico
        toast.error("Nessuna voce trovata nel documento", {
          description: "L'AI non ha rilevato voci di lavorazione. Prova a usare 'Da Foto' se il file non è un computo strutturato.",
          action: {
            label: "Ricomincia",
            onClick: () => { reset(); setStep(1); setFile(null); },
          },
          duration: 8000,
        });
        return;
      }
      const ric = applyRicarico ? ricarico : 0;
      setVociLocali(
        voci.map((v) => ({
          ...v,
          _prezzoImpresa: v.prezzo_unitario_computo * (1 + ric / 100),
          _ricarico: ric,
          _importoImpresa: v.quantita * v.prezzo_unitario_computo * (1 + ric / 100),
          _isIncluded: v.is_included,
          // Pre-popola da auto-match server-side (alias/vector)
          _matched_template_id: v.matched_template_id ?? undefined,
          _matched_family_id: v.matched_family_id ?? undefined,
          _matched_name: v.matched_name ?? undefined,
          _match_type: (v.match_type as ComputoVoceLocal["_match_type"]) ?? undefined,
        }))
      );
      setStep(4);
    }
  }, [status, step, voci, applyRicarico, ricarico]);

  // ── Step 4 → Generate ──────────────────────────────────────────────────────
  const handleGenerate = () => {
    const incluse = vociLocali
      .filter((v) => v._isIncluded)
      .map((v) => ({
        id: v.id,
        is_included: true,
        descrizione_breve: v.descrizione_breve,
        descrizione_estesa: v.descrizione_estesa,
        capitolo_nome: v.capitolo_nome,
        codice_voce: v.codice_voce,
        codice_prezzario: v.codice_prezzario,
        unita_misura: v.unita_misura,
        quantita: v.quantita,
        prezzo_unitario: v._prezzoImpresa,
        importo: v._importoImpresa,
        sconto_percentuale: v.sconto_percentuale || 0,
        // Match listino — propaga a quote_items.article_template_id/family_id
        matched_template_id: v._matched_template_id,
        matched_family_id: v._matched_family_id,
        matched_name: v._matched_name,
      }));

    generatePreventivo(
      {
        vociIncluse: incluse,
        config: {
          oggetto: computoUpload?.oggetto_lavori || undefined,
        },
      },
      {
        onSuccess: (quoteId: string) => {
          handleClose();
          if (onComplete) {
            onComplete(quoteId);
          } else {
            navigate(`/azienda/marketing/preventivi/${quoteId}`);
          }
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={step === 4 ? "max-w-6xl max-h-[90vh] overflow-hidden flex flex-col" : "sm:max-w-lg"}
        onInteractOutside={(e) => {
          // Evita chiusura quando l'utente apre il Sheet del picker abbinamento
          if (pickerVoceId !== null) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-500" />
            {step === 1 && (isFotoMode ? "Da Foto o PDF — estrai preventivo con AI" : "Importa Computo Metrico")}
            {step === 2 && "Configurazione"}
            {step === 3 && "Estrazione AI in corso..."}
            {step === 4 && "Revisione Voci Estratte"}
          </DialogTitle>
          {/* Fix 6: Indicatore step */}
          <div className="flex items-center gap-1 pt-1">
            {[
              { n: 1, label: "File" },
              { n: 2, label: "Config" },
              { n: 3, label: "AI" },
              { n: 4, label: "Revisione" },
            ].map(({ n, label }, idx, arr) => (
              <div key={n} className="flex items-center gap-1">
                <div
                  className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                    step === n
                      ? "bg-orange-500 text-white"
                      : step > n
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span>{step > n ? "✓" : n}</span>
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {idx < arr.length - 1 && (
                  <div className={`h-px w-4 ${step > n ? "bg-emerald-300" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>
          {step === 1 && isFotoMode && (
            <p className="text-sm text-muted-foreground">
              Scatta o carica la foto di un preventivo scritto a mano / stampato.
              L'AI leggerà prodotti, misure, quantità e prezzi, poi farà match col tuo listino.
              Potrai rivedere e modificare tutto prima di salvare.
            </p>
          )}
        </DialogHeader>

        {/* ── Step 1: Upload ────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
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
                  <Upload className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                  <p className="text-sm font-medium">Trascina qui il computo metrico</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, Excel (.xlsx), XPWE, DCF — Max 50MB
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!file}>
                Avanti <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Config ────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              {file && getFileIcon(file.name)}
              <div>
                <p className="text-sm font-medium">{file?.name}</p>
                <p className="text-xs text-muted-foreground">{file && formatBytes(file.size)}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="applyRicarico"
                  checked={applyRicarico}
                  onChange={(e) => setApplyRicarico(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="applyRicarico" className="text-sm">
                  Applica ricarico automatico ai prezzi
                </Label>
              </div>
              {applyRicarico && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm min-w-fit">Ricarico %</Label>
                  <Input
                    type="number"
                    value={ricarico}
                    onChange={(e) => setRicarico(Number(e.target.value))}
                    min={0}
                    max={100}
                    className="w-24"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Indietro
              </Button>
              <Button onClick={handleStartProcessing} disabled={isUploading}>
                {isUploading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                Avvia Estrazione AI
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Processing (AI animated stage) ───────────────────── */}
        {step === 3 && (
          <AIProcessingStage
            status={status}
            progress={progress}
            error={error}
            onRetry={() => { reset(); setStep(1); setFile(null); }}
            /* Fix 8: wrap cancel in AlertDialog per evitare perdita accidentale */
            onCancel={undefined}
            cancelButton={
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    Annulla
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Interrompere l'estrazione?</AlertDialogTitle>
                    <AlertDialogDescription>
                      L'analisi AI è in corso. Annullando ora, i file caricati verranno
                      eliminati e dovrai ricominciare dall'inizio.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Continua l'estrazione</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Sì, annulla
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            }
          />
        )}

        {/* ── Step 4: Preview Editor ────────────────────────────────────── */}
        {step === 4 && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Metadata header */}
            {computoUpload && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground pb-3 border-b mb-3 flex-wrap">
                {computoUpload.oggetto_lavori && (
                  <span><strong>Oggetto:</strong> {computoUpload.oggetto_lavori}</span>
                )}
                {computoUpload.committente && (
                  <span><strong>Committente:</strong> {computoUpload.committente}</span>
                )}
                {computoUpload.extraction_method && (
                  <Badge variant="outline" className="text-[10px]">
                    {computoUpload.extraction_method.replace("_", " ")}
                  </Badge>
                )}
                {computoUpload.extraction_confidence != null && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      computoUpload.extraction_confidence > 0.85
                        ? "border-green-400 text-green-600"
                        : computoUpload.extraction_confidence > 0.7
                        ? "border-amber-400 text-amber-600"
                        : "border-red-400 text-red-600"
                    }`}
                  >
                    Confidence: {(computoUpload.extraction_confidence * 100).toFixed(0)}%
                  </Badge>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="flex gap-4 text-xs mb-3">
              <span>
                <strong>{vociLocali.filter((v) => v._isIncluded).length}</strong> /{" "}
                {vociLocali.length} voci incluse
              </span>
              <span>
                <strong>
                  {new Set(vociLocali.map((v) => v.capitolo_nome)).size}
                </strong>{" "}
                capitoli
              </span>
            </div>

            {/* Editor table */}
            <div className="flex-1 overflow-auto">
              <ComputoPreviewEditor
                voci={vociLocali}
                onChange={setVociLocali}
                onMatchClick={handleMatchClick}
              />
            </div>

            {/* Footer */}
            <div className="space-y-2 pt-3 border-t mt-3">
              {/* Warning: voci incluse con quantità = 0 */}
              {vociLocali.some((v) => v._isIncluded && (v.quantita ?? 0) <= 0) && (
                <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/20 rounded-md p-2 text-xs flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span className="text-amber-800 dark:text-amber-300">
                    {vociLocali.filter((v) => v._isIncluded && (v.quantita ?? 0) <= 0).length}{" "}
                    {vociLocali.filter((v) => v._isIncluded && (v.quantita ?? 0) <= 0).length === 1
                      ? "voce inclusa ha quantità 0"
                      : "voci incluse hanno quantità 0"}
                    . Correggi o escludile prima di generare il preventivo.
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-muted-foreground">Totale impresa: </span>
                  <strong className="text-orange-600">
                    {new Intl.NumberFormat("it-IT", {
                      style: "currency",
                      currency: "EUR",
                    }).format(
                      vociLocali
                        .filter((v) => v._isIncluded)
                        .reduce((s, v) => s + v._importoImpresa, 0)
                    )}
                  </strong>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClose}>
                    Annulla
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    disabled={
                      isGenerating ||
                      vociLocali.filter((v) => v._isIncluded).length === 0 ||
                      vociLocali.some((v) => v._isIncluded && (v.quantita ?? 0) <= 0)
                    }
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                    )}
                    Genera Preventivo
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Sheet picker articoli del listino — apertura laterale, non chiude il
          dialog parent grazie a onInteractOutside={preventDefault} sul Sheet
          + onInteractOutside conditional sul Dialog parent */}
      <MatchProductPickerDialog
        open={pickerVoceId !== null}
        onOpenChange={(o) => {
          if (!o) setPickerVoceId(null);
        }}
        initialQuery={pickerInitialQuery}
        onSelect={handleManualMatch}
      />
    </Dialog>
  );
}
