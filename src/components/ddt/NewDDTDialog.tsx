// ============================================================================
// NewDDTDialog — Wizard procedurale per la registrazione di un nuovo DDT
// ----------------------------------------------------------------------------
// 3 step:
//   1) ODA & documento — seleziona ODA + upload foto/PDF del DDT cartaceo
//   2) Consegna & corriere — corriere, targa, autista, ore arrivo
//   3) Verifica & conferma — quantità, stato, magazzino, eventuali difformità
//
// Appena confermato lo step 3 crea il DDT nel DB. Gli upload file avvengono
// post-creazione (serve l'id DDT per il path storage {company_id}/{ddt_id}/).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileCheck, Truck, ClipboardCheck, Loader2, ChevronLeft, ChevronRight,
  Check, ShoppingCart, Package, Calendar, Clock, User, Phone, Hash,
  AlertTriangle, FileText, Warehouse as WarehouseIcon, Paperclip,
  Info, MapPin, Sparkles, Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  useDDTRicezioneMutations,
  useDDTAttachments,
  type DDTStato,
  type DDTAttachmentKind,
} from "@/hooks/useDDTRicezione";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { DDTAttachmentUploader } from "./DDTAttachmentUploader";

// ─── Step definition ────────────────────────────────────────────────────
const STEPS = [
  {
    key: "documento" as const,
    title: "Documento DDT",
    short: "Documento",
    icon: FileCheck,
    description: "Seleziona l'ODA e carica il DDT cartaceo come foto o PDF",
  },
  {
    key: "consegna" as const,
    title: "Consegna & corriere",
    short: "Consegna",
    icon: Truck,
    description: "Dati del corriere, mezzo, autista e orari",
  },
  {
    key: "verifica" as const,
    title: "Verifica & conferma",
    short: "Verifica",
    icon: ClipboardCheck,
    description: "Quantità ricevuta, stato e eventuali non conformità",
  },
];

interface NewDDTDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-seleziona un ODA (usato dal dettaglio PO per "Registra DDT") */
  prefillPurchaseOrderId?: string | null;
  /** Callback dopo la creazione (es. refetch) */
  onCreated?: (ddtId: string) => void;
}

type LocalFile = { file: File; kind: DDTAttachmentKind; id: string };

export function NewDDTDialog({
  open,
  onOpenChange,
  prefillPurchaseOrderId,
  onCreated,
}: NewDDTDialogProps) {
  const navigate = useNavigate();
  const { orders } = usePurchaseOrders();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = STEPS[stepIdx];

  // Callback applicato quando l'AI ha estratto i dati DDT
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyAIExtracted = (ext: Record<string, any>) => {
    if (!ext) return;
    if (ext.numero_ddt && !numero) setNumero(String(ext.numero_ddt));
    if (ext.data_ddt) {
      try {
        const d = new Date(String(ext.data_ddt));
        if (!isNaN(d.getTime())) setData(d.toISOString().slice(0, 10));
      } catch { /* ignore */ }
    }
    if (ext.corriere && !corriere) setCorriere(String(ext.corriere));
    if (ext.targa_mezzo && !targaMezzo) setTargaMezzo(String(ext.targa_mezzo));
    if (ext.autista_nome && !autistaNome) setAutistaNome(String(ext.autista_nome));
    if (ext.ora_inizio_trasporto && !oraArrivo) setOraArrivo(String(ext.ora_inizio_trasporto).slice(0, 5));
    // Quantità totale = somma articoli
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray(ext.articoli) && !qty) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totQty = ext.articoli.reduce((s: number, a: any) => s + Number(a.quantita ?? 0), 0);
      if (totQty > 0) setQty(String(totQty));
    }
    if (ext.note_documento && !note) setNote(String(ext.note_documento));
  };

  // ── Step 1: documento ─────────────────────────────
  const [poId, setPoId] = useState("");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [ddtFile, setDdtFile] = useState<LocalFile | null>(null);
  const [extraFiles, setExtraFiles] = useState<LocalFile[]>([]);

  // ── Step 2: consegna ─────────────────────────────
  const [corriere, setCorriere] = useState("");
  const [targaMezzo, setTargaMezzo] = useState("");
  const [autistaNome, setAutistaNome] = useState("");
  const [autistaTelefono, setAutistaTelefono] = useState("");
  const [oraArrivo, setOraArrivo] = useState("");
  const [oraPartenza, setOraPartenza] = useState("");

  // ── Step 3: verifica ─────────────────────────────
  const [qty, setQty] = useState("");
  const [stato, setStato] = useState<DDTStato>("ricevuto");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [ricevutoDaNome, setRicevutoDaNome] = useState("");
  const [hasDamages, setHasDamages] = useState(false);
  const [nonConformita, setNonConformita] = useState("");
  const [note, setNote] = useState("");

  const { createDDT } = useDDTRicezioneMutations(poId || null);
  const { uploadMainDDT, uploadAttachments } = useDDTAttachments();

  // Prefill ODA
  useEffect(() => {
    if (open && prefillPurchaseOrderId) {
      setPoId(prefillPurchaseOrderId);
    }
  }, [open, prefillPurchaseOrderId]);

  // Reset al chiudere
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStepIdx(0);
        setPoId(prefillPurchaseOrderId ?? "");
        setNumero("");
        setData(format(new Date(), "yyyy-MM-dd"));
        setDdtFile(null);
        setExtraFiles([]);
        setCorriere("");
        setTargaMezzo("");
        setAutistaNome("");
        setAutistaTelefono("");
        setOraArrivo("");
        setOraPartenza("");
        setQty("");
        setStato("ricevuto");
        setWarehouseId(null);
        setRicevutoDaNome("");
        setHasDamages(false);
        setNonConformita("");
        setNote("");
      }, 200);
    }
  }, [open, prefillPurchaseOrderId]);

  const availablePOs = useMemo(
    () => orders.filter((o) => o.status !== "annullato"),
    [orders]
  );

  const selectedPO = useMemo(
    () => availablePOs.find((o) => o.id === poId) ?? null,
    [availablePOs, poId]
  );

  // Auto-fill corriere con supplier name se vuoto
  useEffect(() => {
    if (selectedPO && !corriere) {
      setCorriere(selectedPO.suppliers?.name ?? "");
    }
  }, [selectedPO, corriere]);

  // ── Validation per step ───────────────────────────
  const canGoNext = useMemo(() => {
    if (currentStep.key === "documento") {
      return !!poId && numero.trim().length > 0;
    }
    if (currentStep.key === "consegna") {
      return true; // tutto opzionale
    }
    return true;
  }, [currentStep.key, poId, numero]);

  const isFinalStep = stepIdx === STEPS.length - 1;

  // ── Confirm submit (all'ultimo step) ───────────────
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!poId || !numero.trim()) return;
    setIsSubmitting(true);
    try {
      const created = await createDDT.mutateAsync({
        purchase_order_id: poId,
        numero_ddt: numero.trim(),
        data_ricezione: data,
        quantita_ricevuta: parseFloat(qty) || 0,
        stato: stato,
        note: note.trim() || null,
        warehouse_id: warehouseId,
        corriere: corriere.trim() || null,
        targa_mezzo: targaMezzo.trim() || null,
        autista_nome: autistaNome.trim() || null,
        autista_telefono: autistaTelefono.trim() || null,
        ora_arrivo: oraArrivo ? new Date(`${data}T${oraArrivo}`).toISOString() : null,
        ora_partenza: oraPartenza ? new Date(`${data}T${oraPartenza}`).toISOString() : null,
        ricevuto_da_nome: ricevutoDaNome.trim() || null,
        non_conformita: nonConformita.trim() || null,
        has_damages: hasDamages,
      });

      // Upload DDT principale
      if (ddtFile) {
        await uploadMainDDT.mutateAsync({ ddtId: created.id, file: ddtFile.file });
      }

      // Upload allegati extra
      if (extraFiles.length > 0) {
        await uploadAttachments.mutateAsync({
          ddtId: created.id,
          files: extraFiles.map((f) => ({ file: f.file, kind: f.kind })),
        });
      }

      onCreated?.(created.id);
      onOpenChange(false);
      navigate(`/azienda/ddt/${created.id}`);
    } catch {
      // Toast gestito dalle mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  const goNext = () => {
    if (isFinalStep) {
      void handleSubmit();
    } else {
      setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
    }
  };
  const goBack = () => setStepIdx((i) => Math.max(0, i - 1));

  // ── Render ───────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] p-0 overflow-hidden flex flex-col max-h-[95vh]">
        {/* ── Header with stepper ─── */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b bg-gradient-to-br from-primary/5 to-transparent">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileCheck className="h-5 w-5 text-primary" />
            Nuovo DDT fornitore
            <Badge variant="secondary" className="ml-auto text-[10px] font-normal">
              Step {stepIdx + 1} / {STEPS.length}
            </Badge>
          </DialogTitle>

          {/* Step progress */}
          <div className="flex items-center gap-1 sm:gap-2 mt-3 overflow-x-auto scrollbar-none">
            {STEPS.map((s, idx) => {
              const StepIcon = s.icon;
              const isActive = idx === stepIdx;
              const isDone = idx < stepIdx;
              return (
                <div key={s.key} className="flex items-center gap-1 sm:gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => idx < stepIdx && setStepIdx(idx)}
                    disabled={idx > stepIdx}
                    className={cn(
                      "flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                      isActive && "bg-primary text-primary-foreground shadow-sm",
                      isDone && "bg-primary/20 text-primary cursor-pointer hover:bg-primary/30",
                      !isActive && !isDone && "bg-muted/50 text-muted-foreground",
                    )}
                  >
                    {isDone ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <StepIcon className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden xs:inline">{s.short}</span>
                    <span className="xs:hidden">{idx + 1}</span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div className={cn(
                      "h-[2px] w-4 sm:w-8 rounded-full",
                      idx < stepIdx ? "bg-primary" : "bg-muted"
                    )} />
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            {currentStep.description}
          </p>
        </DialogHeader>

        {/* ── Step body ──────────────────────────────── */}
        <div className="px-5 py-4 flex-1 overflow-y-auto">
          {currentStep.key === "documento" && (
            <DocumentoStep
              poId={poId}
              onPoIdChange={setPoId}
              numero={numero}
              onNumeroChange={setNumero}
              data={data}
              onDataChange={setData}
              ddtFile={ddtFile}
              onDdtFileChange={setDdtFile}
              extraFiles={extraFiles}
              onExtraFilesChange={setExtraFiles}
              selectedPO={selectedPO}
              availablePOs={availablePOs}
              disabledPOSelect={!!prefillPurchaseOrderId}
              onAIExtractedData={applyAIExtracted}
              companyId={companyId}
            />
          )}

          {currentStep.key === "consegna" && (
            <ConsegnaStep
              corriere={corriere}
              onCorriereChange={setCorriere}
              targaMezzo={targaMezzo}
              onTargaMezzoChange={setTargaMezzo}
              autistaNome={autistaNome}
              onAutistaNomeChange={setAutistaNome}
              autistaTelefono={autistaTelefono}
              onAutistaTelefonoChange={setAutistaTelefono}
              oraArrivo={oraArrivo}
              onOraArrivoChange={setOraArrivo}
              oraPartenza={oraPartenza}
              onOraPartenzaChange={setOraPartenza}
            />
          )}

          {currentStep.key === "verifica" && (
            <VerificaStep
              qty={qty}
              onQtyChange={setQty}
              stato={stato}
              onStatoChange={setStato}
              warehouseId={warehouseId}
              onWarehouseIdChange={setWarehouseId}
              ricevutoDaNome={ricevutoDaNome}
              onRicevutoDaNomeChange={setRicevutoDaNome}
              hasDamages={hasDamages}
              onHasDamagesChange={setHasDamages}
              nonConformita={nonConformita}
              onNonConformitaChange={setNonConformita}
              note={note}
              onNoteChange={setNote}
              selectedPO={selectedPO}
            />
          )}
        </div>

        {/* ── Footer nav ─────────────────────────────── */}
        <DialogFooter className="flex-row justify-between sm:justify-between border-t px-4 py-3 bg-muted/30 gap-2">
          {stepIdx === 0 ? (
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-muted-foreground"
            >
              Annulla
            </Button>
          ) : (
            <Button variant="outline" onClick={goBack} disabled={isSubmitting}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Indietro
            </Button>
          )}
          <Button
            onClick={goNext}
            disabled={!canGoNext || isSubmitting}
            className="gap-1.5 min-w-[120px]"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isFinalStep ? (
              <>
                <Check className="h-4 w-4" />
                Registra DDT
              </>
            ) : (
              <>
                Avanti
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// STEP 1 — Documento DDT
// ============================================================================
interface DocumentoStepProps {
  poId: string;
  onPoIdChange: (v: string) => void;
  numero: string;
  onNumeroChange: (v: string) => void;
  data: string;
  onDataChange: (v: string) => void;
  ddtFile: LocalFile | null;
  onDdtFileChange: (f: LocalFile | null) => void;
  extraFiles: LocalFile[];
  onExtraFilesChange: (f: LocalFile[]) => void;
  selectedPO: { id: string; oda_number: string; suppliers?: { name: string } | null; orders?: { order_code: string } | null; status: string; expected_delivery_date?: string | null } | null;
  availablePOs: Array<{ id: string; oda_number: string; suppliers?: { name: string } | null; orders?: { order_code: string } | null; status: string; expected_delivery_date?: string | null }>;
  disabledPOSelect?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAIExtractedData?: (extracted: Record<string, any>) => void;
  companyId?: string | null;
}

function DocumentoStep({
  poId, onPoIdChange, numero, onNumeroChange, data, onDataChange,
  ddtFile, onDdtFileChange, extraFiles, onExtraFilesChange,
  selectedPO, availablePOs, disabledPOSelect,
  onAIExtractedData, companyId,
}: DocumentoStepProps) {
  const [isAIExtracting, setIsAIExtracting] = useState(false);

  const runAIExtract = async () => {
    if (!ddtFile || !companyId || !onAIExtractedData) return;
    setIsAIExtracting(true);
    try {
      const file = ddtFile.file;
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);

      // FIX 14 (A9): consolidato su ddt-ai-extract (Gemini Flash 2.5, schema più ricco)
      // con legacy_format=true per backward compat con applyAIExtracted (campi piatti)
      const { data: aiData, error } = await supabase.functions.invoke("ddt-ai-extract", {
        body: {
          image_base64: base64,
          mime_type: file.type || "image/jpeg",
          file_name: file.name,
          company_id: companyId,
          legacy_format: true,
        },
      });
      if (error) throw error;
      if (!aiData?.success) throw new Error(aiData?.error ?? "Estrazione fallita");
      onAIExtractedData(aiData.extracted ?? {});
      toast.success(
        `Dati estratti dall'AI · €${aiData.ai_meta?.cost_billed_eur?.toFixed(4) ?? "0"}`,
      );
    } catch (err) {
      toast.error(`AI: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAIExtracting(false);
    }
  };
  return (
    <div className="space-y-5">
      {/* ODA select */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
          Ordine di Acquisto *
        </Label>
        <Select value={poId} onValueChange={onPoIdChange} disabled={disabledPOSelect}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Seleziona l'ODA corrispondente al DDT ricevuto…" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {availablePOs.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                Nessun ODA disponibile. Crea prima un Ordine d'Acquisto.
              </div>
            ) : (
              availablePOs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  <div className="flex flex-col gap-0.5 text-left">
                    <span className="font-mono text-xs font-medium">{o.oda_number}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {o.suppliers?.name || "Fornitore ignoto"}
                      {o.orders?.order_code ? ` · ${o.orders.order_code}` : ""}
                    </span>
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {selectedPO && (
          <div className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <Info className="h-3 w-3 shrink-0" />
            Stato ODA: <strong className="text-foreground">{selectedPO.status}</strong>
            {selectedPO.expected_delivery_date && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  consegna prevista {format(new Date(selectedPO.expected_delivery_date), "dd/MM/yyyy", { locale: it })}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Numero DDT + data — grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            Numero DDT *
          </Label>
          <Input
            value={numero}
            onChange={(e) => onNumeroChange(e.target.value)}
            placeholder="es. DDT-2026-001"
            className="h-11 font-mono"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            Data ricezione
          </Label>
          <Input
            type="date"
            value={data}
            onChange={(e) => onDataChange(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      {/* Upload zone — DDT principale */}
      <div className="space-y-2">
        {!ddtFile ? (
          <DDTAttachmentUploader
            title="Carica DDT cartaceo"
            description="Fotografa il DDT ricevuto dal corriere o carica il PDF. È il documento ufficiale di riferimento."
            defaultKind="ddt"
            multiple={false}
            onFilesSelected={(files) => {
              const first = files[0];
              if (first) {
                onDdtFileChange({
                  file: first.file,
                  kind: "ddt",
                  id: crypto.randomUUID(),
                });
              }
            }}
          />
        ) : (
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <FileCheck className="h-3.5 w-3.5 text-primary" />
              DDT caricato (pronto per upload al salvataggio)
            </Label>
            <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
              <FileText className="h-8 w-8 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ddtFile.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(ddtFile.file.size / 1024 / 1024).toFixed(1)} MB · {ddtFile.file.type}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDdtFileChange(null)}
                className="text-muted-foreground hover:text-destructive"
              >
                Rimuovi
              </Button>
            </div>
            {onAIExtractedData && companyId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={runAIExtract}
                disabled={isAIExtracting}
                className="w-full gap-2 border-violet-300 text-violet-700 hover:bg-violet-50"
              >
                {isAIExtracting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                <Sparkles className="h-3.5 w-3.5" />
                Estrai dati dal DDT con AI
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Extra allegati (opzionale) */}
      <ExtraAllegatiField files={extraFiles} onChange={onExtraFilesChange} />
    </div>
  );
}

// ─── Extra allegati con tipologia ──────────────────────────────────────
function ExtraAllegatiField({
  files,
  onChange,
}: {
  files: LocalFile[];
  onChange: (f: LocalFile[]) => void;
}) {
  const [pickerKind, setPickerKind] = useState<DDTAttachmentKind>("bolla");
  return (
    <div className="space-y-2">
      <details className="rounded-md border bg-muted/10 group">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium flex items-center gap-2 select-none hover:bg-muted/30 transition-colors">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          Aggiungi altri allegati (opzionale)
          {files.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {files.length}
            </Badge>
          )}
          <ChevronRight className="h-3.5 w-3.5 ml-auto group-open:rotate-90 transition-transform" />
        </summary>
        <div className="p-3 space-y-3 border-t">
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">Tipologia:</Label>
            <Select
              value={pickerKind}
              onValueChange={(v) => setPickerKind(v as DDTAttachmentKind)}
            >
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bolla">Bolla di consegna</SelectItem>
                <SelectItem value="packing_list">Packing list</SelectItem>
                <SelectItem value="danni">Foto danni / non conformità</SelectItem>
                <SelectItem value="firma">Firma ricevente</SelectItem>
                <SelectItem value="altro">Altro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DDTAttachmentUploader
            compact
            defaultKind={pickerKind}
            multiple
            onFilesSelected={(added) => {
              onChange([
                ...files,
                ...added.map((a) => ({
                  file: a.file,
                  kind: a.kind,
                  id: crypto.randomUUID(),
                })),
              ]);
            }}
          />
          {files.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
              {files.map((f) => (
                <div key={f.id} className="flex flex-col gap-1 rounded-md border p-2">
                  <p className="text-[10px] font-medium truncate">{f.file.name}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {(f.file.size / 1024 / 1024).toFixed(1)} MB · {f.kind}
                  </p>
                  <button
                    type="button"
                    onClick={() => onChange(files.filter((x) => x.id !== f.id))}
                    className="text-[10px] text-rose-600 hover:underline text-left"
                  >
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

// ============================================================================
// STEP 2 — Consegna & corriere
// ============================================================================
interface ConsegnaStepProps {
  corriere: string;
  onCorriereChange: (v: string) => void;
  targaMezzo: string;
  onTargaMezzoChange: (v: string) => void;
  autistaNome: string;
  onAutistaNomeChange: (v: string) => void;
  autistaTelefono: string;
  onAutistaTelefonoChange: (v: string) => void;
  oraArrivo: string;
  onOraArrivoChange: (v: string) => void;
  oraPartenza: string;
  onOraPartenzaChange: (v: string) => void;
}

function ConsegnaStep(props: ConsegnaStepProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-md bg-sky-50 border border-sky-200 p-2.5 flex items-start gap-2 text-xs text-sky-900">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Tutti i dati sono opzionali</p>
          <p className="text-sky-700">
            Compila quelli rilevanti per la tracciabilità. Se sono già noti dall'ODA vengono precompilati.
          </p>
        </div>
      </div>

      {/* Corriere */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
            Corriere / trasportatore
          </Label>
          <Input
            value={props.corriere}
            onChange={(e) => props.onCorriereChange(e.target.value)}
            placeholder="es. GLS, DHL, SDA, oppure nome fornitore se trasporto proprio"
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            Targa mezzo
          </Label>
          <Input
            value={props.targaMezzo}
            onChange={(e) => props.onTargaMezzoChange(e.target.value.toUpperCase())}
            placeholder="es. AB123CD"
            className="h-11 font-mono uppercase"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            Nome autista
          </Label>
          <Input
            value={props.autistaNome}
            onChange={(e) => props.onAutistaNomeChange(e.target.value)}
            placeholder="es. Mario Rossi"
            className="h-11"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            Telefono autista (per contatti futuri)
          </Label>
          <Input
            type="tel"
            value={props.autistaTelefono}
            onChange={(e) => props.onAutistaTelefonoChange(e.target.value)}
            placeholder="+39 123 456 7890"
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Ora arrivo
          </Label>
          <Input
            type="time"
            value={props.oraArrivo}
            onChange={(e) => props.onOraArrivoChange(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            Ora partenza
          </Label>
          <Input
            type="time"
            value={props.oraPartenza}
            onChange={(e) => props.onOraPartenzaChange(e.target.value)}
            className="h-11"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 3 — Verifica & conferma
// ============================================================================
interface VerificaStepProps {
  qty: string;
  onQtyChange: (v: string) => void;
  stato: DDTStato;
  onStatoChange: (v: DDTStato) => void;
  warehouseId: string | null;
  onWarehouseIdChange: (v: string | null) => void;
  ricevutoDaNome: string;
  onRicevutoDaNomeChange: (v: string) => void;
  hasDamages: boolean;
  onHasDamagesChange: (v: boolean) => void;
  nonConformita: string;
  onNonConformitaChange: (v: string) => void;
  note: string;
  onNoteChange: (v: string) => void;
  selectedPO: { suppliers?: { name: string } | null } | null;
}

function VerificaStep(props: VerificaStepProps) {
  return (
    <div className="space-y-5">
      {/* Quantità + stato */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-muted-foreground" />
            Quantità ricevuta
          </Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={props.qty}
            onChange={(e) => props.onQtyChange(e.target.value)}
            placeholder="0"
            className="h-11 text-right font-semibold"
          />
          <p className="text-[10px] text-muted-foreground">
            Totale (aggregato). Potrai registrare ricezioni per articolo dopo la creazione.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Stato DDT</Label>
          <Select
            value={props.stato}
            onValueChange={(v) => props.onStatoChange(v as DDTStato)}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="atteso">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
                  Atteso (pre-avviso)
                </span>
              </SelectItem>
              <SelectItem value="ricevuto">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Ricevuto completo
                </span>
              </SelectItem>
              <SelectItem value="parziale">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Parziale
                </span>
              </SelectItem>
              <SelectItem value="verificato">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-600" />
                  Verificato (controllato)
                </span>
              </SelectItem>
              <SelectItem value="non_conforme">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                  Non conforme
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Magazzino destinazione
          </Label>
          <WarehouseSelect
            value={props.warehouseId}
            onChange={props.onWarehouseIdChange}
            placeholder="Default (dal fornitore o dall'ODA)"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            Ricevuto da (nome ricevente fisico)
          </Label>
          <Input
            value={props.ricevutoDaNome}
            onChange={(e) => props.onRicevutoDaNomeChange(e.target.value)}
            placeholder="es. Luca Bianchi (magazziniere)"
            className="h-11"
          />
        </div>
      </div>

      {/* Danni toggle */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className={cn(
              "h-4 w-4 shrink-0 mt-0.5",
              props.hasDamages ? "text-rose-500" : "text-muted-foreground"
            )} />
            <div>
              <p className="text-sm font-medium">Presenza di danni o non conformità</p>
              <p className="text-xs text-muted-foreground">
                Attiva se la merce presenta difformità rispetto all'ODA.
              </p>
            </div>
          </div>
          <Switch
            checked={props.hasDamages}
            onCheckedChange={props.onHasDamagesChange}
          />
        </div>

        {props.hasDamages && (
          <Textarea
            value={props.nonConformita}
            onChange={(e) => props.onNonConformitaChange(e.target.value)}
            rows={3}
            placeholder="Descrivi la non conformità: pezzi mancanti, articoli danneggiati, imballo rotto, errori di quantità…"
            className="text-sm"
          />
        )}
      </div>

      {/* Note */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Note aggiuntive (opzionale)</Label>
        <Textarea
          rows={2}
          value={props.note}
          onChange={(e) => props.onNoteChange(e.target.value)}
          placeholder="Eventuali osservazioni interne…"
        />
      </div>
    </div>
  );
}

