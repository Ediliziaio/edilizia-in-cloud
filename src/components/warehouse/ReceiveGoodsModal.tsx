// ============================================================================
// ReceiveGoodsModal — Modale procedurale di ricezione merce in magazzino
// ----------------------------------------------------------------------------
// Flusso ottimizzato:
//   1) Utente compila quantità / qualità / foto DDT (tutte le sorgenti: camera,
//      galleria, PDF, drag&drop) via DDTAttachmentUploader
//   2) Submit → `insert_goods_receipt_atomic` (RPC) con upload foto a goods_receipts
//   3) Post-success → PostReceiptDDTPrompt chiede se creare un DDT formale
//      (wizard NewDDTDialog) o allegare la foto a un DDT esistente sull'ODA
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGoodsReceipt } from "@/hooks/warehouse/useGoodsReceipt";
import { useWarehouses } from "@/hooks/useWarehouses";
import {
  PackageOpen,
  X,
  FileText,
  Hash,
  Warehouse as WarehouseIcon,
  ClipboardCheck,
  StickyNote,
  ShieldCheck,
  Camera,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { DDTAttachmentUploader } from "@/components/ddt/DDTAttachmentUploader";
import { PostReceiptDDTPrompt } from "./PostReceiptDDTPrompt";

interface ReceiveGoodsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItemId: string;
  orderItemName?: string;
  /**
   * Magazzino di destinazione della ricezione.
   * Se omesso viene pre-selezionato:
   *  - il magazzino predefinito della company (admin)
   *  - l'unico magazzino assegnato (magazziniere single-warehouse)
   * Se l'utente ha più magazzini, li sceglie dalla dropdown.
   */
  warehouseId?: string;
}

export function ReceiveGoodsModal({
  open,
  onOpenChange,
  orderItemId,
  orderItemName = "Articolo",
  warehouseId: warehouseIdProp,
}: ReceiveGoodsModalProps) {
  const { createGoodsReceipt, isCreating, uploadProgress } = useGoodsReceipt();
  const { warehouses, defaultWarehouse } = useWarehouses(true);

  // ── Form state ────────────────────────────────────────────────────
  const [quantityReceived, setQuantityReceived] = useState("");
  const [ddtNumber, setDdtNumber] = useState("");
  const [qualityStatus, setQualityStatus] = useState<
    "ok" | "pending" | "damaged" | "partial"
  >("ok");
  const [qualityNotes, setQualityNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [ddtFile, setDdtFile] = useState<File | null>(null);

  // ── Post-receipt prompt state ────────────────────────────────────
  const [showDDTPrompt, setShowDDTPrompt] = useState(false);
  // Snapshot della foto DDT usata per il post-prompt (mantenuto anche dopo il
  // reset del form in modo da poterla allegare ad un DDT esistente)
  const [lastSubmittedPhoto, setLastSubmittedPhoto] = useState<File | null>(
    null,
  );

  // ── Warehouse select default ──────────────────────────────────────
  const initialWarehouseId = useMemo(
    () => warehouseIdProp ?? defaultWarehouse?.id ?? warehouses[0]?.id ?? "",
    [warehouseIdProp, defaultWarehouse?.id, warehouses],
  );
  const [selectedWarehouseId, setSelectedWarehouseId] =
    useState<string>(initialWarehouseId);

  useEffect(() => {
    if (!selectedWarehouseId && initialWarehouseId) {
      setSelectedWarehouseId(initialWarehouseId);
    }
  }, [initialWarehouseId, selectedWarehouseId]);

  // Reset al chiudere
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setQuantityReceived("");
        setDdtNumber("");
        setQualityStatus("ok");
        setQualityNotes("");
        setNotes("");
        setDdtFile(null);
        setShowDDTPrompt(false);
        setLastSubmittedPhoto(null);
      }, 200);
    }
  }, [open]);

  // ── Submit ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!quantityReceived) {
      toast.error("Inserire la quantità ricevuta");
      return;
    }
    const qty = parseFloat(quantityReceived.replace(",", "."));
    if (isNaN(qty) || qty <= 0) {
      toast.error("Quantità non valida — deve essere maggiore di zero");
      return;
    }
    if (!selectedWarehouseId) {
      toast.error("Seleziona il magazzino di destinazione");
      return;
    }

    try {
      await createGoodsReceipt({
        order_item_id: orderItemId,
        warehouse_id: selectedWarehouseId,
        quantity_received: qty,
        ddt_number: ddtNumber || undefined,
        ddt_photo: ddtFile || undefined,
        quality_check_status: qualityStatus,
        quality_notes: qualityNotes || undefined,
        notes: notes || undefined,
      });

      // Conserva la foto per il prompt post-success (prima del reset)
      setLastSubmittedPhoto(ddtFile);

      // Reset form ma NON chiudere: apri il prompt DDT
      setQuantityReceived("");
      setDdtNumber("");
      setQualityStatus("ok");
      setQualityNotes("");
      setNotes("");
      setDdtFile(null);
      setShowDDTPrompt(true);
    } catch (error) {
      // 2026-05-27 (audit error handling): prima il fail era totalmente
      // muto → l'utente credeva che la merce fosse stata registrata in
      // magazzino, ma in realtà RLS/rete/edge function aveva fallito.
      // Disallineamento cantiere/magazzino.
      console.error("Submit error:", error);
      toast.error("Ricezione non registrata", {
        description: error instanceof Error ? error.message : "Riprova o controlla la connessione",
      });
    }
  };

  // ── Chiude tutto dopo il prompt DDT ──────────────────────────────
  const handlePromptDone = () => {
    setShowDDTPrompt(false);
    setLastSubmittedPhoto(null);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog
        open={open && !showDDTPrompt}
        onOpenChange={(o) => {
          if (!o) onOpenChange(false);
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
          {/* ── Header ───────────────────────────────── */}
          <DialogHeader className="px-5 pt-5 pb-3 border-b bg-gradient-to-br from-primary/5 to-transparent shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <div className="rounded-full bg-primary/10 p-1.5">
                <PackageOpen className="h-4 w-4 text-primary" />
              </div>
              Ricevi merce — <span className="truncate">{orderItemName}</span>
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Registra la ricezione fisica in magazzino. Al termine potrai
              formalizzare il DDT.
            </p>
          </DialogHeader>

          {/* ── Body scrollable ───────────────────────── */}
          <form
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-5"
          >
            {/* Magazzino (se l'utente ne ha più di 1) */}
            {warehouses.length > 1 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <WarehouseIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  Magazzino destinazione *
                </label>
                <Select
                  value={selectedWarehouseId}
                  onValueChange={setSelectedWarehouseId}
                >
                  <SelectTrigger disabled={isCreating} className="h-10">
                    <SelectValue placeholder="Scegli magazzino…" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quantità + numero DDT (in griglia) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  Quantità ricevuta *
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={quantityReceived}
                  onChange={(e) => setQuantityReceived(e.target.value)}
                  placeholder="Es. 10"
                  disabled={isCreating}
                  className="h-10 text-right font-semibold tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Numero DDT (opzionale)
                </label>
                <Input
                  type="text"
                  value={ddtNumber}
                  onChange={(e) => setDdtNumber(e.target.value)}
                  placeholder="Es. DT-2026-0123"
                  disabled={isCreating}
                  className="h-10 font-mono text-sm"
                />
              </div>
            </div>

            {/* Foto / PDF DDT — DDTAttachmentUploader unificato */}
            <div className="space-y-2">
              <label className="text-xs font-medium flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                Foto o PDF DDT (opzionale)
              </label>
              {ddtFile ? (
                <DDTFilePreviewInline
                  file={ddtFile}
                  disabled={isCreating}
                  onRemove={() => setDdtFile(null)}
                />
              ) : (
                <DDTAttachmentUploader
                  compact
                  defaultKind="ddt"
                  multiple={false}
                  maxSizeMB={15}
                  isUploading={isCreating}
                  onFilesSelected={(items) => {
                    const first = items[0];
                    if (first) setDdtFile(first.file);
                  }}
                />
              )}
            </div>

            {/* Stato qualità */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                Stato qualità *
              </label>
              <Select
                value={qualityStatus}
                onValueChange={(
                  v: "ok" | "pending" | "damaged" | "partial",
                ) => setQualityStatus(v)}
              >
                <SelectTrigger disabled={isCreating} className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ok">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                      OK — conforme
                    </span>
                  </SelectItem>
                  <SelectItem value="pending">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
                      In verifica
                    </span>
                  </SelectItem>
                  <SelectItem value="damaged">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                      Danneggiato
                    </span>
                  </SelectItem>
                  <SelectItem value="partial">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                      Consegna parziale
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Note qualità — mostrate solo se non OK */}
            {qualityStatus !== "ok" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5">
                  <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  Note qualità
                </label>
                <Input
                  type="text"
                  value={qualityNotes}
                  onChange={(e) => setQualityNotes(e.target.value)}
                  placeholder="Es. 2 scatole ammaccate, 1 pezzo mancante…"
                  disabled={isCreating}
                  className="h-10"
                />
              </div>
            )}

            {/* Note generali */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                Note generali (opzionale)
              </label>
              <Input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Es. Stoccato in sezione A2"
                disabled={isCreating}
                className="h-10"
              />
            </div>

            {/* Upload progress */}
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5">
                <div className="text-xs text-muted-foreground">
                  Upload foto DDT… {uploadProgress}%
                </div>
                <Progress value={uploadProgress} className="h-1.5" />
              </div>
            )}
          </form>

          {/* ── Footer sticky ─────────────────────────── */}
          <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-5 py-3 flex items-center justify-end gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
              className="text-muted-foreground"
            >
              Annulla
            </Button>
            <Button
              type="button"
              onClick={(e) => void handleSubmit(e)}
              disabled={
                isCreating || !quantityReceived || !selectedWarehouseId
              }
              className="gap-1.5 min-w-[140px]"
            >
              {isCreating ? (
                <>
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  Registrando…
                </>
              ) : (
                <>
                  <PackageOpen className="h-4 w-4" />
                  Registra ricezione
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-receipt prompt (sostituisce la chiusura automatica) */}
      <PostReceiptDDTPrompt
        open={showDDTPrompt}
        onDone={handlePromptDone}
        orderItemId={orderItemId}
        orderItemName={orderItemName}
        capturedPhoto={lastSubmittedPhoto}
      />
    </>
  );
}

// ============================================================================
// Preview inline del file DDT catturato (image/pdf)
// ============================================================================
function DDTFilePreviewInline({
  file,
  onRemove,
  disabled,
}: {
  file: File;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const isImage = file.type.startsWith("image/");
  const objectUrl = useMemo(
    () => (isImage ? URL.createObjectURL(file) : null),
    [file, isImage],
  );

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  return (
    <div className="flex items-center gap-3 rounded-md border-2 border-primary/30 bg-primary/5 p-2.5">
      {isImage && objectUrl ? (
        <img width={56} height={56} loading="lazy"
          src={objectUrl}
          alt={file.name}
          className="h-14 w-14 rounded object-cover shrink-0 border"
        />
      ) : (
        <div className="h-14 w-14 rounded bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
          <FileText className="h-7 w-7 text-primary" />
        </div>
      )}
      <div className="flex-1 min-w-0 text-xs">
        <p className="font-medium truncate">{file.name}</p>
        <p className="text-muted-foreground">
          {(file.size / 1024 / 1024).toFixed(1)} MB · {file.type || "file"}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
        aria-label="Rimuovi file DDT"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
