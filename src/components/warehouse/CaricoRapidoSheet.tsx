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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { StockItemDialog } from "./StockItemDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  ClipboardList,
  FileText,
  Info,
  Loader2,
  ExternalLink,
  Camera,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useBatchCarico } from "@/hooks/warehouse/useBatchCarico";
import { uploadWarehouseDDTToOrders, uploadWarehousePhotos } from "@/lib/warehousePhotoUpload";
import type { BatchScanEntry } from "./BatchBarcodeScanner";

const BatchBarcodeScanner = lazy(() =>
  import("./BatchBarcodeScanner").then((m) => ({ default: m.BatchBarcodeScanner })),
);

interface CaricoRapidoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "context" | "scan";
type ReceiveMode = "scan" | "ddt";

interface SupplierOption {
  id: string;
  name: string;
  uses_gs1?: boolean | null;
}

interface RelatedOrderOption {
  id: string;
  order_code: string;
  customer_name: string | null;
}

export function CaricoRapidoSheet({ open, onOpenChange }: CaricoRapidoSheetProps) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const { data: warehouses = [], isLoading: warehousesLoading } = useWarehouses(true);
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery<SupplierOption[]>({
    queryKey: queryKeys.suppliers.list(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, uses_gs1")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as SupplierOption[];
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
  });
  const { data: relatedOrders = [], isLoading: relatedOrdersLoading } = useQuery<RelatedOrderOption[]>({
    queryKey: ["warehouse-arrival-related-orders", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, customer:customer_id(first_name, last_name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      type RawOrder = {
        id: string;
        order_code: string | null;
        customer?: { first_name?: string | null; last_name?: string | null } | null;
      };
      return ((data ?? []) as unknown as RawOrder[]).map((order) => ({
        id: order.id,
        order_code: order.order_code ?? "—",
        customer_name:
          order.customer?.first_name || order.customer?.last_name
            ? `${order.customer?.first_name ?? ""} ${order.customer?.last_name ?? ""}`.trim()
            : null,
      }));
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
  const batchCarico = useBatchCarico();

  const [step, setStep] = useState<Step>("context");
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>("scan");
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [relatedOrderIds, setRelatedOrderIds] = useState<string[]>([]);
  const [ddtFile, setDdtFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [productPhotos, setProductPhotos] = useState<File[]>([]);
  const [entries, setEntries] = useState<BatchScanEntry[]>([]);
  const [insertedAt, setInsertedAt] = useState(() => new Date());
  const insertedBy = user?.email ?? "utente corrente";

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
    if (open) {
      setInsertedAt(new Date());
    }
    if (!open) {
      setStep("context");
      setReceiveMode("scan");
      setSupplierId(undefined);
      setRelatedOrderIds([]);
      setDdtFile(null);
      setNotes("");
      setProductPhotos([]);
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
    return Boolean(supplierObj?.uses_gs1);
  }, [supplierObj]);

  const canProceedToScan = !!supplierId && !!warehouseId;
  const toggleRelatedOrder = (orderId: string) => {
    setRelatedOrderIds((current) =>
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId],
    );
  };

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
    let uploadedPhotoPaths: string[] = [];
    if (productPhotos.length > 0 && effectiveCompany?.id && user?.id) {
      const targets = relatedOrderIds.length > 0 ? relatedOrderIds : [null];
      for (const targetOrderId of targets) {
        const uploadResult = await uploadWarehousePhotos({
          files: productPhotos,
          companyId: effectiveCompany.id,
          userId: user.id,
          orderId: targetOrderId,
          context: "arrival_product",
          description: `Foto prodotti ricevuti da ${supplierObj?.name ?? "fornitore"} per ${warehouseObj?.name ?? "magazzino"}`,
        });
        uploadedPhotoPaths = [...uploadedPhotoPaths, ...uploadResult.uploaded];
        if (uploadResult.failed.length > 0) {
          toast.warning("Alcune foto prodotto non sono state salvate", {
            description: uploadResult.failed.join(", "),
          });
        }
      }
    }
    if (ddtFile && relatedOrderIds.length > 0 && user?.id) {
      const ddtUpload = await uploadWarehouseDDTToOrders({
        file: ddtFile,
        orderIds: relatedOrderIds,
        userId: user.id,
        supplierName: supplierObj?.name,
        insertedAt: insertedAt.toISOString(),
      });
      if (ddtUpload.failed.length > 0) {
        toast.warning("DDT non collegato a tutti gli ordini", {
          description: `${ddtUpload.failed.length} collegamenti falliti.`,
        });
      }
    }
    const linkedOrdersNote =
      relatedOrderIds.length > 0
        ? `Ordini collegati al DDT: ${relatedOrders
            .filter((order) => relatedOrderIds.includes(order.id))
            .map((order) => `${order.order_code}${order.customer_name ? ` ${order.customer_name}` : ""}`)
            .join(", ")}`
        : "";
    const ddtNote = ddtFile
      ? `DDT arrivo caricato: ${ddtFile.name} alle ${insertedAt.toLocaleString("it-IT")} da ${insertedBy}`
      : "";
    const photoNote =
      productPhotos.length > 0
        ? `Foto prodotti arrivo: ${productPhotos.map((file) => file.name).join(", ")}${uploadedPhotoPaths.length > 0 ? ` (${uploadedPhotoPaths.length} salvate)` : ""}`
        : "";
    const mergedNotes = [notes.trim(), ddtNote, linkedOrdersNote, photoNote].filter(Boolean).join("\n");
    try {
      await batchCarico.mutateAsync({
        warehouseId,
        supplierId,
        entries,
        notes: mergedNotes || undefined,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90svh] overflow-hidden p-0">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Registra arrivo merce
          </DialogTitle>
          <DialogDescription className="text-xs">
            Carica DDT, collega gli ordini interessati e poi scannerizza QR/lotti o inserisci prodotti.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(90svh-150px)] overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Inserimento</p>
              <p className="text-sm font-semibold">{insertedAt.toLocaleString("it-IT")}</p>
              <p className="text-xs text-muted-foreground">Da: {insertedBy}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Modalità</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={receiveMode === "scan" ? "default" : "outline"}
                  onClick={() => setReceiveMode("scan")}
                  className="justify-start"
                >
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Scannerizza
                </Button>
                <Button
                  type="button"
                  variant={receiveMode === "ddt" ? "default" : "outline"}
                  onClick={() => setReceiveMode("ddt")}
                  className="justify-start"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Carica DDT
                </Button>
              </div>
            </div>
          </div>

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

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 mt-0.5 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">DDT arrivo e ordini collegati</p>
                <p className="text-xs text-muted-foreground">
                  Se un camion consegna materiale per più clienti, seleziona tutti gli ordini coinvolti.
                </p>
              </div>
            </div>
            <Input
              id="cr-ddt-file"
              type="file"
              accept="image/*,.pdf"
              capture="environment"
              onChange={(event) => {
                setDdtFile(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
            {ddtFile && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-xs">
                <span className="truncate">{ddtFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setDdtFile(null)}
                  aria-label={`Rimuovi DDT ${ddtFile.name}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            )}
            <div className="rounded-md border bg-background">
              <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                Ordini da collegare {relatedOrderIds.length > 0 && `(${relatedOrderIds.length})`}
              </div>
              <div className="max-h-44 overflow-y-auto p-2 space-y-1">
                {relatedOrdersLoading ? (
                  <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Caricamento ordini...
                  </div>
                ) : relatedOrders.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">Nessun ordine disponibile.</p>
                ) : (
                  relatedOrders.map((order) => (
                    <label
                      key={order.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={relatedOrderIds.includes(order.id)}
                        onCheckedChange={() => toggleRelatedOrder(order.id)}
                      />
                      <span className="min-w-0">
                        <span className="font-medium">{order.order_code}</span>
                        {order.customer_name && (
                          <span className="text-muted-foreground"> · {order.customer_name}</span>
                        )}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
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

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Camera className="h-4 w-4 mt-0.5 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Foto prodotti ricevuti</p>
                <p className="text-xs text-muted-foreground">
                  Scatta foto a bancali, colli, prodotti danneggiati o etichette prima della scansione.
                </p>
              </div>
            </div>
            <Input
              id="cr-product-photos"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) {
                  setProductPhotos((current) => [...current, ...files]);
                }
                event.currentTarget.value = "";
              }}
            />
            {productPhotos.length > 0 && (
              <div className="space-y-2">
                {productPhotos.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-xs">
                    <span className="truncate">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setProductPhotos((current) => current.filter((_, i) => i !== index))}
                      aria-label={`Rimuovi foto ${file.name}`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
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

        <DialogFooter className="border-t p-3 flex-row gap-2 bg-card">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
