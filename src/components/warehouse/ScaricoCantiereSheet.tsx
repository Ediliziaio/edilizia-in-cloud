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
  ArrowUpFromLine,
  ArrowRight,
  ArrowLeft,
  Loader2,
  FileText,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useCreateShipment } from "@/hooks/warehouse/useCreateShipment";
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
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const navigate = useNavigate();
  const { data: warehouses = [], isLoading: warehousesLoading } = useWarehouses(true);
  const shipment = useCreateShipment();

  const [step, setStep] = useState<Step>("context");
  const [orderId, setOrderId] = useState<string | undefined>();
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<BatchScanEntry[]>([]);

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
    if (!open) {
      setStep("context");
      setOrderId(undefined);
      setWarehouseId(undefined);
      setNotes("");
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
    try {
      const res = await shipment.mutateAsync({
        orderId,
        warehouseId,
        entries,
        ddtExtra: notes.trim() ? { note_documento: notes.trim() } : undefined,
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[80svh] flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ArrowUpFromLine className="h-5 w-5 text-primary" />
            Scarico cantiere
          </SheetTitle>
          <SheetDescription className="text-xs">
            Scarica merce verso un cantiere e genera automaticamente un DDT in bozza.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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

          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Alla conferma genereremo un DDT in <strong>bozza</strong> nel sistema fatturazione,
              pronto per essere completato (cliente, dati trasporto, stampa).
            </AlertDescription>
          </Alert>
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
