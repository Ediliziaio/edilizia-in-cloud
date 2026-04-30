/**
 * ScaricoCantiereSheet — flusso scarico cantiere via scansione (MP3).
 *
 * Wizard 2-step (semplificato per UX più fluida possibile):
 *   1. Context: scegli ordine destinazione + magazzino sorgente
 *      (default = destination_warehouse_id più frequente nelle righe ordine,
 *       fallback al warehouse is_default)
 *   2. Scan: BatchBarcodeScanner mode='carico' libero (le quantità in
 *      eccesso sono comunque protette server-side da GREATEST(0,...))
 *
 * Su Conferma: chiama RPC create_shipment_atomic che esegue in transazione:
 *   - movimenti scarico
 *   - decremento giacenza
 *   - per articoli serializzati: stock_units → status=shipped + delivered_to_order_id
 *   - genera DDT in BOZZA con righe pre-popolate
 *
 * Toast di successo include link "Apri DDT" → naviga al detail per completare
 * cliente e dati trasporto dalla pagina fatturazione esistente.
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
  Truck,
  Camera,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouses } from "@/hooks/useWarehouses";
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

type Step = "context" | "scan";

export function ScaricoCantiereSheet({ open, onOpenChange }: ScaricoCantiereSheetProps) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const { data: warehouses = [], isLoading: warehousesLoading } = useWarehouses(true);
  const shipment = useCreateShipment();

  const [step, setStep] = useState<Step>("context");
  const [orderId, setOrderId] = useState<string | undefined>();
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [notes, setNotes] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [carrier, setCarrier] = useState("");
  const [transportVehicle, setTransportVehicle] = useState("");
  const [goodsAppearance, setGoodsAppearance] = useState("");
  const [packages, setPackages] = useState("");
  const [transportReason, setTransportReason] = useState("Trasferimento a cantiere");
  const [loadedGoodsPhotos, setLoadedGoodsPhotos] = useState<File[]>([]);
  const [entries, setEntries] = useState<BatchScanEntry[]>([]);
  const [insertedAt, setInsertedAt] = useState(() => new Date());
  const insertedBy = user?.email ?? "utente corrente";

  // Lista ordini "aperti" — quelli per cui ha senso fare scarico cantiere.
  // Filtro semplice: status NOT IN cancellati/completati. L'utente in fase
  // di context dropdown vede gli ordini ordinati per data desc.
  const { data: orders = [], isLoading: ordersLoading } = useQuery<OrderRow[]>({
    queryKey: ["scarico-cantiere-orders", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, order_code,
          customer:customer_id ( first_name, last_name ),
          order_items ( destination_warehouse_id )
        `)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      type RawRow = {
        id: string;
        order_code: string | null;
        customer?: { first_name?: string | null; last_name?: string | null } | null;
        order_items?: Array<{ destination_warehouse_id: string | null }> | null;
      };
      return ((data ?? []) as unknown as RawRow[]).map((o) => {
        // Default warehouse: il primo destination_warehouse_id valido tra le righe.
        const defaultWh =
          o.order_items?.find((i) => i.destination_warehouse_id)?.destination_warehouse_id ??
          null;
        const customer =
          o.customer?.first_name || o.customer?.last_name
            ? `${o.customer?.first_name ?? ""} ${o.customer?.last_name ?? ""}`.trim()
            : null;
        return {
          id: o.id,
          order_code: o.order_code ?? "—",
          customer_name: customer,
          default_warehouse_id: defaultWh,
        };
      });
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  // Quando l'utente sceglie un ordine, pre-seleziona il warehouse default dell'ordine
  // (se l'utente non ne ha già scelto uno).
  useEffect(() => {
    if (!orderId) return;
    const order = orders.find((o) => o.id === orderId);
    if (order?.default_warehouse_id && !warehouseId) {
      setWarehouseId(order.default_warehouse_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, orders]);

  // Fallback warehouse: is_default azienda se non già scelto.
  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      const def = warehouses.find((w) => w.is_default) ?? warehouses[0];
      setWarehouseId(def.id);
    }
  }, [warehouses, warehouseId]);

  // Reset on close.
  useEffect(() => {
    if (open) {
      setInsertedAt(new Date());
    }
    if (!open) {
      setStep("context");
      setOrderId(undefined);
      setWarehouseId(undefined);
      setNotes("");
      setDeliveryAddress("");
      setCarrier("");
      setTransportVehicle("");
      setGoodsAppearance("");
      setPackages("");
      setTransportReason("Trasferimento a cantiere");
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
    const packageCount = Number.parseInt(packages, 10);
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
        toast.warning("Alcune foto del carico non sono state salvate", {
          description: uploadResult.failed.join(", "),
        });
      }
    }
    const photoNote =
      loadedGoodsPhotos.length > 0
        ? `Foto merce caricata: ${loadedGoodsPhotos.map((file) => file.name).join(", ")}${uploadedPhotoPaths.length > 0 ? ` (${uploadedPhotoPaths.length} salvate)` : ""}`
        : "";
    const mergedNotes = [notes.trim(), photoNote].filter(Boolean).join("\n");
    const ddtExtra = {
      causale_trasporto: transportReason.trim() || undefined,
      aspetto_beni: goodsAppearance.trim() || undefined,
      numero_colli: Number.isFinite(packageCount) && packageCount > 0 ? packageCount : undefined,
      mezzo_trasporto: transportVehicle.trim() || undefined,
      vettore: carrier.trim() || undefined,
      indirizzo_consegna: deliveryAddress.trim() || undefined,
      note_documento: mergedNotes || undefined,
    };
    try {
      const res = await shipment.mutateAsync({
        orderId,
        warehouseId,
        entries,
        ddtExtra,
      });
      onOpenChange(false);
      // Naviga all'editor documento (sistema fatturazione esistente)
      // dove l'utente può completare cliente, dati trasporto, stampare.
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
      <DialogContent className="max-w-3xl max-h-[90svh] overflow-hidden p-0">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowUpFromLine className="h-5 w-5 text-primary" />
            Uscita merce e DDT
          </DialogTitle>
          <DialogDescription className="text-xs">
            Scarica merce verso un cantiere e genera automaticamente un DDT in bozza.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(90svh-150px)] overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Preparazione</p>
              <p className="text-sm font-semibold">{insertedAt.toLocaleString("it-IT")}</p>
              <p className="text-xs text-muted-foreground">Da: {insertedBy}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">Flusso</p>
              <p className="mt-1 text-sm font-semibold">Seleziona ordine → scansiona merce → genera DDT</p>
              <p className="text-xs text-muted-foreground">
                Le foto del carico restano collegate all'ordine selezionato.
              </p>
            </div>
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
            {orderObj?.default_warehouse_id && warehouseId === orderObj.default_warehouse_id && (
              <p className="text-[11px] text-muted-foreground">
                Pre-selezionato dalla destinazione di default delle righe ordine.
              </p>
            )}
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Truck className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-sm font-medium">Dati DDT uscita</p>
                <p className="text-xs text-muted-foreground">
                  Il documento prende intestazione azienda e cliente dall'ordine. Qui prepari destinazione,
                  trasportatore e colli prima della scansione.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sc-delivery-address" className="text-xs">
                  Destinazione merce
                </Label>
                <Input
                  id="sc-delivery-address"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Es. Cantiere cliente, via Roma 5, Milano"
                  maxLength={180}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sc-carrier" className="text-xs">
                  Chi trasporta
                </Label>
                <Input
                  id="sc-carrier"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  placeholder="Azienda, operaio o subappaltatore"
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sc-vehicle" className="text-xs">
                  Mezzo
                </Label>
                <Input
                  id="sc-vehicle"
                  value={transportVehicle}
                  onChange={(e) => setTransportVehicle(e.target.value)}
                  placeholder="Es. Furgone aziendale"
                  maxLength={80}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sc-reason" className="text-xs">
                  Causale trasporto
                </Label>
                <Select value={transportReason} onValueChange={setTransportReason}>
                  <SelectTrigger id="sc-reason">
                    <SelectValue placeholder="Causale" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Trasferimento a cantiere">Trasferimento a cantiere</SelectItem>
                    <SelectItem value="Vendita">Vendita</SelectItem>
                    <SelectItem value="Conto lavorazione">Conto lavorazione</SelectItem>
                    <SelectItem value="Reso">Reso</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-[1fr_96px] gap-3">
                <div className="space-y-2">
                  <Label htmlFor="sc-goods-appearance" className="text-xs">
                    Aspetto beni
                  </Label>
                  <Input
                    id="sc-goods-appearance"
                    value={goodsAppearance}
                    onChange={(e) => setGoodsAppearance(e.target.value)}
                    placeholder="Es. Bancali, colli, sfuso"
                    maxLength={80}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sc-packages" className="text-xs">
                    Colli
                  </Label>
                  <Input
                    id="sc-packages"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={packages}
                    onChange={(e) => setPackages(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Note opzionali → finiranno in note_documento del DDT */}
          <div className="space-y-2">
            <Label htmlFor="sc-notes" className="text-xs">
              Note DDT (opzionali)
            </Label>
            <Input
              id="sc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. Consegna in cantiere via Roma 5"
              maxLength={200}
            />
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Camera className="h-4 w-4 mt-0.5 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Foto merce caricata</p>
                <p className="text-xs text-muted-foreground">
                  Scatta foto del carico sul furgone, dei colli o del materiale pronto prima di generare il DDT.
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
              Alla conferma genereremo un DDT in <strong>bozza</strong> con le righe scansionate,
              pronto da controllare, completare e stampare nel sistema fatturazione.
            </AlertDescription>
          </Alert>
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
