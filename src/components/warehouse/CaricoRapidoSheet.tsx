/**
 * CaricoRapidoSheet — wizard 2-step per il carico merce rapido via scansione.
 *
 * Step 1 (Context): l'utente sceglie fornitore + magazzino destinazione +
 *                   eventuale DDT ricezione collegato.
 * Step 2 (Scan):    apre BatchBarcodeScanner che gestisce internamente la
 *                   coda di scansioni + review (auto-aggregation, qty edit,
 *                   remove, no-match). On confirm → invoca RPC
 *                   batch_carico_from_scans via useBatchCarico.
 *
 * Il wizard è collassato per ridurre i step "vuoti" e mantenere il flow
 * mobile fluido (un solo Sheet, scan continuo, niente passaggi inutili).
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { StockItemDialog } from "./StockItemDialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowLeft,
  Info,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { useBatchCarico } from "@/hooks/warehouse/useBatchCarico";
import type { BatchScanEntry } from "./BatchBarcodeScanner";

const BatchBarcodeScanner = lazy(() =>
  import("./BatchBarcodeScanner").then((m) => ({ default: m.BatchBarcodeScanner })),
);

interface CaricoRapidoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "context" | "scan";

export function CaricoRapidoSheet({ open, onOpenChange }: CaricoRapidoSheetProps) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const { data: warehouses = [], isLoading: warehousesLoading } = useWarehouses(true);
  const { data: suppliers = [], isLoading: suppliersLoading } = useOperationalSuppliers();
  const batchCarico = useBatchCarico();

  const [step, setStep] = useState<Step>("context");
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<BatchScanEntry[]>([]);

  // ── Inline create-from-no-match ─────────────────────────────────
  // Quando lo scanner trova un codice non riconosciuto, chiama
  // `onRequestCreateItem(rawCode)` → noi apriamo StockItemDialog precompilato
  // e tratteniamo la promessa qui finché l'utente non salva o annulla.
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createPrefillBarcode, setCreatePrefillBarcode] = useState<string | undefined>();
  const [createPending, setCreatePending] = useState(false);
  const createResolverRef = useRef<
    | ((value: { stockItemId: string; itemName: string; trackingMode: "fungible" | "serialized" } | null) => void)
    | null
  >(null);

  // Default warehouse: il primo `is_default` o il primo della lista.
  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      const def = warehouses.find((w) => w.is_default) ?? warehouses[0];
      setWarehouseId(def.id);
    }
  }, [warehouses, warehouseId]);

  // Reset state quando si chiude lo sheet.
  useEffect(() => {
    if (!open) {
      setStep("context");
      setSupplierId(undefined);
      setNotes("");
      setEntries([]);
      batchCarico.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const supplierObj = useMemo(
    () => suppliers.find((s) => s.id === supplierId),
    [suppliers, supplierId],
  );
  const warehouseObj = useMemo(
    () => warehouses.find((w) => w.id === warehouseId),
    [warehouses, warehouseId],
  );

  const supplierUsesGs1 = useMemo(() => {
    // Cast difensivo: useOperationalSuppliers potrebbe non includere uses_gs1
    // (dipende dalla rigenerazione dei types). Lo prendiamo via cast safe.
    return Boolean((supplierObj as { uses_gs1?: boolean } | undefined)?.uses_gs1);
  }, [supplierObj]);

  const canProceedToScan = !!supplierId && !!warehouseId;

  /**
   * Apre StockItemDialog precompilato con il barcode no-match e resta in
   * attesa che l'utente salvi (→ resolver con i dati del nuovo articolo)
   * oppure chiuda il dialog senza salvare (→ resolve null).
   */
  const handleRequestCreateItem = (rawCode: string) => {
    setCreatePrefillBarcode(rawCode);
    setCreateDialogOpen(true);
    return new Promise<{
      stockItemId: string;
      itemName: string;
      trackingMode: "fungible" | "serialized";
    } | null>((resolve) => {
      createResolverRef.current = resolve;
    });
  };

  async function handleSaveNewItem(data: {
    name: string;
    description?: string;
    quantity: number;
    unit_cost: number;
    vat_rate: number;
    supplier_id?: string;
    section_id?: string;
    min_stock_level: number;
    barcode?: string | null;
    internal_code?: string | null;
    tracking_mode?: "fungible" | "serialized";
    requires_warranty?: boolean;
    default_warranty_months?: number | null;
  }) {
    if (!effectiveCompany?.id) return;
    setCreatePending(true);
    try {
      const { data: inserted, error } = await supabase
        .from("warehouse_stock")
        .insert({
          company_id: effectiveCompany.id,
          name: data.name,
          description: data.description ?? null,
          // quantity iniziale: 0 — il carico aggiungerà la qty scansionata.
          quantity: 0,
          unit_cost: data.unit_cost,
          vat_rate: data.vat_rate,
          supplier_id: data.supplier_id ?? null,
          section_id: data.section_id ?? null,
          min_stock_level: data.min_stock_level,
          barcode: data.barcode ?? null,
          internal_code: data.internal_code ?? null,
          tracking_mode: data.tracking_mode ?? "fungible",
          requires_warranty: !!data.requires_warranty,
          default_warranty_months: data.default_warranty_months ?? null,
        })
        .select("id, name, tracking_mode")
        .single();
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
      const trackingMode = (inserted.tracking_mode ?? "fungible") as "fungible" | "serialized";
      createResolverRef.current?.({
        stockItemId: inserted.id,
        itemName: inserted.name,
        trackingMode,
      });
      createResolverRef.current = null;
      setCreateDialogOpen(false);
      setCreatePrefillBarcode(undefined);
    } catch (err) {
      toast.error("Errore creazione articolo", {
        description: (err as Error)?.message ?? "Riprova",
      });
    } finally {
      setCreatePending(false);
    }
  }

  function handleCloseCreateDialog(open: boolean) {
    setCreateDialogOpen(open);
    if (!open) {
      // Utente ha chiuso senza salvare → risolvi null per riportare il
      // controllo allo scanner.
      createResolverRef.current?.(null);
      createResolverRef.current = null;
      setCreatePrefillBarcode(undefined);
    }
  }

  async function handleConfirm() {
    if (!warehouseId || !supplierId) return;
    try {
      await batchCarico.mutateAsync({
        warehouseId,
        supplierId,
        entries,
        notes: notes.trim() || undefined,
      });
      // success → close sheet (tutto in sequenza già gestito dal hook con toast)
      onOpenChange(false);
    } catch {
      // error toast già emesso dal hook
    }
  }

  // Step "scan" è gestito dal BatchBarcodeScanner sheet, non dal nostro Sheet
  // (il BatchBarcodeScanner usa il proprio Sheet bottom h-90svh).
  if (step === "scan") {
    return (
      <>
        <Suspense fallback={null}>
          <BatchBarcodeScanner
            open={open}
            onOpenChange={(v) => {
              if (!v) {
                // Chiudi tutto se l'utente chiude lo scanner sheet
                onOpenChange(false);
              }
            }}
            mode="carico"
            contextLabel={
              supplierObj && warehouseObj
                ? `Fornitore: ${supplierObj.name} · Magazzino: ${warehouseObj.name}`
                : ""
            }
            supplierId={supplierId}
            supplierUsesGs1={supplierUsesGs1}
            initialEntries={entries}
            onEntriesChange={setEntries}
            onConfirm={handleConfirm}
            confirmLabel="Conferma carico"
            isConfirming={batchCarico.isPending}
            onRequestCreateItem={handleRequestCreateItem}
          />
        </Suspense>
        {/* Dialog inline per creare un articolo da scansione no-match. */}
        <StockItemDialog
          open={createDialogOpen}
          onOpenChange={handleCloseCreateDialog}
          onSave={handleSaveNewItem}
          isPending={createPending}
          prefillBarcode={createPrefillBarcode}
          prefillSupplierId={supplierId}
        />
      </>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[80svh] flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Carico rapido
          </SheetTitle>
          <SheetDescription className="text-xs">
            Scegli fornitore e magazzino, poi scansiona i QR per caricare la merce.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Fornitore */}
          <div className="space-y-2">
            <Label htmlFor="cr-supplier">Fornitore *</Label>
            {suppliersLoading ? (
              <div className="h-10 border rounded-md flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                Caricamento...
              </div>
            ) : (
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="cr-supplier">
                  <SelectValue placeholder="Scegli un fornitore..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">
                      Nessun fornitore configurato.
                    </div>
                  ) : (
                    suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
            {!suppliersLoading && suppliers.length === 0 && (
              <Link
                to="/azienda/impostazioni/fornitori"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={() => onOpenChange(false)}
              >
                <ExternalLink className="h-3 w-3" />
                Aggiungi un fornitore prima di continuare
              </Link>
            )}
          </div>

          {/* Magazzino */}
          <div className="space-y-2">
            <Label htmlFor="cr-warehouse">Magazzino destinazione *</Label>
            {warehousesLoading ? (
              <div className="h-10 border rounded-md flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                Caricamento...
              </div>
            ) : (
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="cr-warehouse">
                  <SelectValue placeholder="Scegli un magazzino..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <div className="flex items-center gap-2">
                        {w.name}
                        {w.is_default && (
                          <span className="text-[9px] uppercase bg-muted px-1.5 py-0.5 rounded">
                            default
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Note opzionali */}
          <div className="space-y-2">
            <Label htmlFor="cr-notes" className="text-xs">
              Note (opzionali)
            </Label>
            <Input
              id="cr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. DDT 1234, ricezione mattina"
              maxLength={200}
            />
          </div>

          {supplierUsesGs1 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Questo fornitore usa GS1: il parser estrarrà GTIN, lotto, seriale e scadenza
                automaticamente.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="border-t p-3 flex gap-2 shrink-0 bg-card">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Annulla
          </Button>
          <Button
            onClick={() => setStep("scan")}
            disabled={!canProceedToScan}
            className="flex-[2]"
          >
            Inizia scansione
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
