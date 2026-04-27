/**
 * OdaReceiveSheet — flusso "ODA Reverse" per ricezione merce.
 *
 * Step semplificati (mobile-first):
 *   1. First scan        → BarcodeScanner singolo: identifica il primo articolo
 *   2. ODA suggestion    → useOdaMatcher mostra le ODA pending compatibili
 *                          con quell'articolo (sorting: stesso supplier prima)
 *   3. Batch scan        → BatchBarcodeScanner mode='oda_receive' vincolato
 *                          alle righe della ODA scelta (l'utente continua a
 *                          scansionare; articoli non in ODA aggiunti come extra
 *                          con warning toast)
 *   4. Confirm           → useReceiveFromOda invoca RPC + redirect a ODA detail
 *
 * Prop opzionale `lockedOdaId`: se passata, salta gli step 1-2 e parte da step 3
 * (usata dalla pagina ODA detail con bottone "Ricevi via scansione").
 */

import { lazy, Suspense, useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Package,
  ArrowLeft,
  ArrowRight,
  ScanLine,
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  TrendingDown,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useBarcodeLookup } from "@/hooks/warehouse/useBarcodeLookup";
import { useOdaMatcher, type OdaMatch } from "@/hooks/warehouse/useOdaMatcher";
import { useReceiveFromOda } from "@/hooks/warehouse/useReceiveFromOda";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import type { BatchScanEntry } from "./BatchBarcodeScanner";

const BarcodeScanner = lazy(() =>
  import("./BarcodeScanner").then((m) => ({ default: m.BarcodeScanner })),
);
const BatchBarcodeScanner = lazy(() =>
  import("./BatchBarcodeScanner").then((m) => ({ default: m.BatchBarcodeScanner })),
);

interface OdaReceiveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se passata, parte direttamente da step "scan" sull'ODA bloccata. */
  lockedOdaId?: string;
}

type Step = "first-scan" | "oda-suggestion" | "batch-scan" | "warehouse-pick";

export function OdaReceiveSheet({ open, onOpenChange, lockedOdaId }: OdaReceiveSheetProps) {
  const { effectiveCompany: _ } = useAuth();
  const { data: warehouses = [] } = useWarehouses(true);

  const [step, setStep] = useState<Step>(lockedOdaId ? "warehouse-pick" : "first-scan");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [firstStockItemId, setFirstStockItemId] = useState<string | null>(null);
  const [firstItemName, setFirstItemName] = useState<string | null>(null);
  const [selectedOdaId, setSelectedOdaId] = useState<string | undefined>(lockedOdaId);
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [entries, setEntries] = useState<BatchScanEntry[]>([]);

  const lookup = useBarcodeLookup();
  const matcher = useOdaMatcher();
  const receive = useReceiveFromOda();

  // Recupera dettaglio ODA per validare e mostrare contesto.
  const { data: odaDetail } = useQuery({
    queryKey: queryKeys.purchaseOrders.detail(selectedOdaId ?? null),
    queryFn: async () => {
      if (!selectedOdaId) return null;
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, oda_number, supplier_id, status, expected_delivery_date, suppliers:supplier_id(name)")
        .eq("id", selectedOdaId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOdaId,
  });

  // Recupera righe ODA pending per validare scansioni.
  const { data: odaItems = [] } = useQuery({
    queryKey: queryKeys.purchaseOrders.items(selectedOdaId ?? null),
    queryFn: async () => {
      if (!selectedOdaId) return [];
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("id, description, quantity, quantity_received, stock_item_id")
        .eq("purchase_order_id", selectedOdaId);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        description: string;
        quantity: number;
        quantity_received: number;
        stock_item_id: string | null;
      }>;
    },
    enabled: !!selectedOdaId,
  });

  const allowedOdaItems = useMemo(
    () =>
      odaItems
        .filter((i) => i.quantity_received < i.quantity)
        .map((i) => ({
          stockItemId: i.stock_item_id,
          odaItemId: i.id,
          qtyPending: i.quantity - i.quantity_received,
        })),
    [odaItems],
  );

  // Default warehouse
  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      const def = warehouses.find((w) => w.is_default) ?? warehouses[0];
      setWarehouseId(def.id);
    }
  }, [warehouses, warehouseId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep(lockedOdaId ? "warehouse-pick" : "first-scan");
      setFirstStockItemId(null);
      setFirstItemName(null);
      setSelectedOdaId(lockedOdaId);
      setEntries([]);
      lookup.reset();
      matcher.reset();
      receive.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedOdaId]);

  const handleFirstScan = useCallback(
    async (rawCode: string) => {
      setScannerOpen(false);
      try {
        const result = await lookup.mutateAsync({ rawScan: rawCode });
        const action = result.action;
        if (action.kind === "offer_create_new") {
          // Articolo non in anagrafica → non possiamo fare match ODA. Fall through:
          // l'utente può comunque andare a "Carico libero" cambiando flow.
          return;
        }
        const itemId =
          action.kind === "accept_unit"
            ? action.itemId
            : action.kind === "accept_item"
              ? action.itemId
              : action.kind === "confirm_ambiguous"
                ? action.rows[0]?.stock_item_id ?? null
                : null;
        if (!itemId) return;
        setFirstStockItemId(itemId);
        const row = result.rows.find((r) => r.stock_item_id === itemId);
        setFirstItemName(row?.item_name ?? null);
        // Trigger ODA matcher
        await matcher.mutateAsync({ stockItemId: itemId });
        setStep("oda-suggestion");
      } catch {
        /* errore già toastato dal hook */
      }
    },
    [lookup, matcher],
  );

  const handlePickOda = (odaId: string) => {
    setSelectedOdaId(odaId);
    setStep("warehouse-pick");
  };

  const handleStartBatchScan = () => {
    if (!selectedOdaId || !warehouseId) return;
    setStep("batch-scan");
  };

  async function handleConfirm() {
    if (!selectedOdaId || !warehouseId) return;
    try {
      await receive.mutateAsync({
        odaId: selectedOdaId,
        warehouseId,
        entries,
      });
      onOpenChange(false);
    } catch {
      /* errore già toastato */
    }
  }

  // ─── Step "batch-scan" delega al BatchBarcodeScanner sheet ─────
  if (step === "batch-scan") {
    return (
      <Suspense fallback={null}>
        <BatchBarcodeScanner
          open={open}
          onOpenChange={(v) => {
            if (!v) onOpenChange(false);
          }}
          mode="oda_receive"
          contextLabel={
            odaDetail
              ? `ODA ${odaDetail.oda_number} · ${(odaDetail as { suppliers?: { name?: string } }).suppliers?.name ?? ""}`
              : ""
          }
          supplierId={odaDetail?.supplier_id ?? undefined}
          allowedOdaItems={allowedOdaItems}
          initialEntries={entries}
          onEntriesChange={setEntries}
          onConfirm={handleConfirm}
          confirmLabel="Conferma ricezione"
          isConfirming={receive.isPending}
        />
      </Suspense>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85svh] flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Package className="h-5 w-5 text-primary" />
            Ricevi da ODA
          </SheetTitle>
          <SheetDescription className="text-xs">
            {step === "first-scan" && "Scansiona il primo articolo: ti suggerisco l'ODA pending."}
            {step === "oda-suggestion" && "Scegli l'ODA su cui registrare la ricezione."}
            {step === "warehouse-pick" && "Seleziona il magazzino di destinazione."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {step === "first-scan" && (
            <div className="space-y-3">
              <div className="rounded-lg border-2 border-dashed p-6 text-center">
                <ScanLine className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm font-medium mb-1">Inquadra il primo QR / barcode</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Cercheremo un'ODA pending compatibile con questo articolo.
                </p>
                <Button onClick={() => setScannerOpen(true)} disabled={lookup.isPending || matcher.isPending}>
                  {(lookup.isPending || matcher.isPending) ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4 mr-2" />
                  )}
                  Scansiona primo articolo
                </Button>
              </div>
              <Suspense fallback={null}>
                {scannerOpen && (
                  <BarcodeScanner
                    open={scannerOpen}
                    onOpenChange={setScannerOpen}
                    onScan={handleFirstScan}
                  />
                )}
              </Suspense>
            </div>
          )}

          {step === "oda-suggestion" && (
            <div className="space-y-3">
              {firstItemName && (
                <Alert>
                  <Package className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Articolo identificato: <strong>{firstItemName}</strong>
                  </AlertDescription>
                </Alert>
              )}
              {matcher.data && matcher.data.length === 0 ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Nessuna ODA pending contiene questo articolo. Usa "Carico rapido" per
                    registrare comunque la ricezione.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {matcher.data?.length ?? 0}{" "}
                    {matcher.data?.length === 1 ? "ODA candidata" : "ODA candidate"}. Tocca per
                    scegliere.
                  </p>
                  <ScrollArea className="max-h-[40vh]">
                    <ul className="space-y-2">
                      {(matcher.data ?? []).map((oda) => (
                        <li key={`${oda.oda_id}-${oda.item_line_id}`}>
                          <button
                            type="button"
                            onClick={() => handlePickOda(oda.oda_id)}
                            className="w-full text-left rounded-lg border p-3 hover:border-primary hover:bg-primary/5 transition-colors"
                          >
                            <OdaCandidateCard oda={oda} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </>
              )}
            </div>
          )}

          {step === "warehouse-pick" && (
            <div className="space-y-4">
              {odaDetail && (
                <Alert>
                  <Package className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    ODA <strong>{odaDetail.oda_number}</strong> · stato {odaDetail.status} ·{" "}
                    {allowedOdaItems.length} righe pending
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="ord-warehouse">Magazzino destinazione *</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger id="ord-warehouse">
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
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-3 flex gap-2 shrink-0 bg-card">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Annulla
          </Button>
          {step === "warehouse-pick" && (
            <Button
              onClick={handleStartBatchScan}
              disabled={!selectedOdaId || !warehouseId || allowedOdaItems.length === 0}
              className="flex-[2]"
            >
              Inizia scansione
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function OdaCandidateCard({ oda }: { oda: OdaMatch }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">ODA {oda.oda_number}</span>
        <Badge variant="outline" className="text-[10px]">
          {oda.status}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground truncate">{oda.supplier_name}</p>
      <div className="flex items-center gap-3 text-xs">
        {oda.expected_delivery_date && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {format(new Date(oda.expected_delivery_date), "dd MMM", { locale: itLocale })}
          </span>
        )}
        <span className="flex items-center gap-1 text-amber-700">
          <TrendingDown className="h-3 w-3" />
          {oda.quantity_pending} pending / {oda.quantity_ordered}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground italic truncate">{oda.item_description}</p>
    </div>
  );
}
