/**
 * ScaricoCantiereSheet — flusso semplificato scarico cantiere → DDT auto.
 *
 * Wizard ULTRA-SNELLO (2 step):
 *   1. Context (minimo): ordine destinazione + magazzino sorgente + foto opzionali
 *   2. Scan: BatchBarcodeScanner mode='carico'
 *
 * Tutti i dettagli DDT (causale, vettore, conducente, targa, peso, colli,
 * destinazione, note) si compilano nel **DDT editor dedicato** dopo la
 * generazione — niente duplicazione, niente form pesante.
 *
 * Su Conferma: chiama RPC create_shipment_atomic che esegue in transazione:
 *   - movimenti scarico
 *   - decremento giacenza
 *   - per articoli serializzati: stock_units → status=shipped + delivered_to_order_id
 *   - genera DDT in BOZZA con righe pre-popolate
 *
 * Auto-navigazione al DDT editor dopo successo.
 */

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  ArrowUpFromLine,
  ArrowRight,
  ArrowLeft,
  Loader2,
  FileText,
  Camera,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateShipment } from "@/hooks/warehouse/useCreateShipment";
import { uploadWarehousePhotos } from "@/lib/warehousePhotoUpload";
import { supabase } from "@/integrations/supabase/client";
import type { BatchScanEntry } from "./BatchBarcodeScanner";

const BatchBarcodeScanner = lazy(() =>
  import("./BatchBarcodeScanner").then((m) => ({ default: m.BatchBarcodeScanner })),
);

interface ScaricoCantiereSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OrderRow {
  id: string;
  order_code: string;
  customer_name: string | null;
  default_warehouse_id: string | null;
}

interface WarehouseRow {
  id: string;
  name: string;
  is_default: boolean;
}

type Step = "context" | "scan";

export function ScaricoCantiereSheet({ open, onOpenChange }: ScaricoCantiereSheetProps) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const shipment = useCreateShipment();

  const [step, setStep] = useState<Step>("context");
  const [orderId, setOrderId] = useState<string | undefined>();
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [loadedGoodsPhotos, setLoadedGoodsPhotos] = useState<File[]>([]);
  const [entries, setEntries] = useState<BatchScanEntry[]>([]);
  const [insertedAt, setInsertedAt] = useState(() => new Date());
  const insertedBy = user?.email ?? "utente corrente";

  // ── Warehouses: query DIRETTA senza filtro warehouse_assignments ────
  // Il filtro per assignments serve in altri contesti (es. lista warehouse
  // operativi), ma per lo scarico verso ordine vogliamo SEMPRE mostrare
  // tutti i magazzini attivi della company. Bug pregresso: utenti senza
  // assignment vedevano dropdown vuoto e non potevano scaricare nulla.
  const { data: warehouses = [], isLoading: warehousesLoading } = useQuery<WarehouseRow[]>({
    queryKey: ["scarico-cantiere-warehouses", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, is_default")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WarehouseRow[];
    },
  });

  // Lista ordini "aperti" — quelli per cui ha senso fare scarico cantiere.
  const { data: orders = [], isLoading: ordersLoading } = useQuery<OrderRow[]>({
    queryKey: ["scarico-cantiere-orders", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, order_code, client_name,
          order_items ( destination_warehouse_id )
        `)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      type RawRow = {
        id: string;
        order_code: string | null;
        client_name: string | null;
        order_items?: Array<{ destination_warehouse_id: string | null }> | null;
      };
      return ((data ?? []) as unknown as RawRow[]).map((o) => {
        const defaultWh =
          o.order_items?.find((i) => i.destination_warehouse_id)?.destination_warehouse_id ??
          null;
        return {
          id: o.id,
          order_code: o.order_code ?? "—",
          customer_name: o.client_name,
          default_warehouse_id: defaultWh,
        };
      });
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  // Pre-selezione magazzino: prima default dell'ordine, poi default azienda
  useEffect(() => {
    if (!orderId || warehouseId) return;
    const order = orders.find((o) => o.id === orderId);
    if (order?.default_warehouse_id) setWarehouseId(order.default_warehouse_id);
  }, [orderId, orders, warehouseId]);

  useEffect(() => {
    if (warehouseId || warehouses.length === 0) return;
    const def = warehouses.find((w) => w.is_default) ?? warehouses[0];
    setWarehouseId(def.id);
  }, [warehouses, warehouseId]);

  // Reset on close
  useEffect(() => {
    if (open) {
      setInsertedAt(new Date());
    }
    if (!open) {
      setStep("context");
      setOrderId(undefined);
      setWarehouseId(undefined);
      setLoadedGoodsPhotos([]);
      setEntries([]);
      shipment.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const orderObj = useMemo(() => orders.find((o) => o.id === orderId), [orders, orderId]);
  const warehouseObj = useMemo(
    () => warehouses.find((w) => w.id === warehouseId),
    [warehouses, warehouseId],
  );

  const canProceedToScan = !!orderId && !!warehouseId;

  async function handleConfirm() {
    if (!orderId || !warehouseId) return;

    // Upload foto merce (best-effort, non blocca creazione DDT)
    let uploadedPhotoPaths: string[] = [];
    if (loadedGoodsPhotos.length > 0 && companyId && user?.id) {
      const uploadResult = await uploadWarehousePhotos({
        files: loadedGoodsPhotos,
        companyId,
        userId: user.id,
        orderId,
        context: "loaded_goods",
        description: `Foto merce caricata per ${orderObj?.order_code ?? "ordine"}${orderObj?.customer_name ? ` - ${orderObj.customer_name}` : ""}`,
      });
      uploadedPhotoPaths = uploadResult.uploaded;
      if (uploadResult.failed.length > 0) {
        toast.warning("Alcune foto non sono state salvate", {
          description: uploadResult.failed.join(", "),
        });
      }
    }

    // ddtExtra minimale: solo metadati foto. Tutto il resto si compila
    // nell'editor DDT dopo la generazione (causale, vettore, conducente,
    // targa, peso, colli, destinazione strutturata).
    const photoNote =
      loadedGoodsPhotos.length > 0
        ? `Foto merce caricata: ${loadedGoodsPhotos.length} immagini${uploadedPhotoPaths.length > 0 ? ` (${uploadedPhotoPaths.length} salvate)` : ""}`
        : "";
    const ddtExtra = photoNote ? { note_documento: photoNote } : undefined;

    try {
      const res = await shipment.mutateAsync({
        orderId,
        warehouseId,
        entries,
        ddtExtra,
      });
      onOpenChange(false);
      // Naviga all'editor DDT — qui l'utente completa causale, vettore,
      // conducente, targa, ecc. nel layout strutturato dedicato.
      if (res.documento_id) {
        navigate(`/azienda/documenti/${res.documento_id}`);
      }
    } catch {
      /* errore già toastato dal hook */
    }
  }

  // ─── Step 'scan' delega al BatchBarcodeScanner ─────────────
  if (step === "scan") {
    return (
      <Suspense fallback={null}>
        <BatchBarcodeScanner
          open={open}
          onOpenChange={(v) => {
            if (!v) onOpenChange(false);
          }}
          mode="carico"
          contextLabel={
            orderObj && warehouseObj
              ? `Ordine ${orderObj.order_code} · Da: ${warehouseObj.name}`
              : ""
          }
          initialEntries={entries}
          onEntriesChange={setEntries}
          onConfirm={handleConfirm}
          confirmLabel="Genera DDT"
          isConfirming={shipment.isPending}
        />
      </Suspense>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!fixed !left-3 !right-3 !top-3 !bottom-[calc(5.25rem+env(safe-area-inset-bottom))] !flex !flex-col !w-auto !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden p-0 sm:!left-[50%] sm:!right-auto sm:!top-[50%] sm:!bottom-auto sm:!w-full sm:!max-w-xl sm:!max-h-[90svh] sm:!translate-x-[-50%] sm:!translate-y-[-50%]">
        <DialogHeader className="shrink-0 px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowUpFromLine className="h-5 w-5 text-primary" />
            Uscita merce e DDT
          </DialogTitle>
          <DialogDescription className="text-xs">
            Scegli ordine + magazzino, scansiona la merce, e generiamo il DDT in bozza. I dettagli trasporto si completano nell'editor DDT.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Info preparazione */}
          <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-0.5">
            <p>
              <span className="text-muted-foreground">Preparazione:</span>{" "}
              <span className="font-medium">{insertedAt.toLocaleString("it-IT")}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Da:</span>{" "}
              <span className="font-medium">{insertedBy}</span>
            </p>
          </div>

          {/* Ordine destinazione */}
          <div className="space-y-2">
            <Label htmlFor="sc-order">Ordine destinazione *</Label>
            {ordersLoading ? (
              <div className="h-10 border rounded-md flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                Caricamento ordini...
              </div>
            ) : (
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger id="sc-order">
                  <SelectValue placeholder="Scegli un ordine..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {orders.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">
                      Nessun ordine recente.
                    </div>
                  ) : (
                    orders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        <span className="font-medium">{o.order_code}</span>
                        {o.customer_name && (
                          <span className="text-muted-foreground"> · {o.customer_name}</span>
                        )}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Magazzino sorgente */}
          <div className="space-y-2">
            <Label htmlFor="sc-warehouse">Magazzino sorgente *</Label>
            {warehousesLoading ? (
              <div className="h-10 border rounded-md flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                Caricamento...
              </div>
            ) : warehouses.length === 0 ? (
              <Alert>
                <AlertDescription className="text-xs">
                  Nessun magazzino attivo trovato. Crea un magazzino da{" "}
                  <strong>Magazzino → Impostazioni</strong>.
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="sc-warehouse">
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

          {/* Foto merce caricata (opzionale) */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Camera className="h-4 w-4 mt-0.5 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Foto merce caricata (opzionale)</p>
                <p className="text-xs text-muted-foreground">
                  Scatta foto del carico sul furgone o dei colli prima della scansione.
                </p>
              </div>
            </div>
            <Input
              id="sc-loaded-goods-photos"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length > 0) {
                  setLoadedGoodsPhotos((current) => [...current, ...files]);
                }
                event.currentTarget.value = "";
              }}
            />
            {loadedGoodsPhotos.length > 0 && (
              <div className="space-y-2">
                {loadedGoodsPhotos.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-xs">
                    <span className="truncate">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setLoadedGoodsPhotos((current) => current.filter((_, i) => i !== index))}
                      aria-label={`Rimuovi foto ${file.name}`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Dopo la scansione genereremo un DDT in <strong>bozza</strong> con le righe scansionate.
              Causale, vettore, conducente, targa, peso e colli si completano nell'<strong>editor DDT</strong>{" "}
              che si aprirà subito dopo.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="shrink-0 border-t p-3 flex-row gap-2 bg-card">
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
