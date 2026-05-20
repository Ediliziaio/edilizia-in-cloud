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

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
// Note: Select imports are still used for the Magazzino sorgente dropdown.
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
import { OrderSelectCombobox, type OrderOption } from "./OrderSelectCombobox";
import { ManualArticleAdder } from "./ManualArticleAdder";

const BatchBarcodeScanner = lazy(() =>
  import("./BatchBarcodeScanner").then((m) => ({ default: m.BatchBarcodeScanner })),
);

interface ScaricoCantiereSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const [selectedOrder, setSelectedOrder] = useState<OrderOption | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [loadedGoodsPhotos, setLoadedGoodsPhotos] = useState<File[]>([]);
  const [entries, setEntries] = useState<BatchScanEntry[]>([]);
  const [insertedAt, setInsertedAt] = useState(() => new Date());
  const insertedBy = user?.email ?? "utente corrente";

  // Trasportatore: mittente (default) / subappaltatore / vettore terzo
  type VettoreTipo = "mittente" | "subappaltatore" | "terzo";
  const [vettoreTipo, setVettoreTipo] = useState<VettoreTipo>("mittente");
  const [vettoreSubId, setVettoreSubId] = useState<string | undefined>();
  const [vettoreTerzoNome, setVettoreTerzoNome] = useState("");
  const [vettoreTerzoPiva, setVettoreTerzoPiva] = useState("");
  const [vettoreTerzoIndirizzo, setVettoreTerzoIndirizzo] = useState("");
  // Flag per non sovrascrivere scelta manuale dell'utente
  const [vettoreManuallyChanged, setVettoreManuallyChanged] = useState(false);

  // Query subappaltatori — caricato solo se serve
  const { data: subappaltatori = [] } = useQuery<{ id: string; ragione_sociale: string; piva: string | null; responsabile: string | null; telefono: string | null }[]>({
    queryKey: ["scarico-subappaltatori", companyId],
    enabled: !!companyId && vettoreTipo === "subappaltatore",
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subappaltatori")
        .select("id, ragione_sociale, piva, responsabile, telefono")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("ragione_sociale", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Contratto subappalto attivo per l'ordine selezionato (se esiste).
  // Permette auto-fill del trasportatore se la commessa è già associata
  // a un subappaltatore tramite contratto.
  const { data: orderContract } = useQuery<{ subappaltatore_id: string } | null>({
    queryKey: ["scarico-order-contract", orderId],
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("contratti_subappalto")
        .select("subappaltatore_id")
        .eq("order_id", orderId!)
        .in("stato", ["attivo", "bozza"])
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Auto-fill trasportatore dal contratto subappalto della commessa.
  // Only fires once per orderId, e SOLO se l'utente non ha cambiato manualmente.
  useEffect(() => {
    if (!orderId || vettoreManuallyChanged) return;
    if (!orderContract?.subappaltatore_id) return;
    setVettoreTipo("subappaltatore");
    setVettoreSubId(orderContract.subappaltatore_id);
  }, [orderId, orderContract?.subappaltatore_id, vettoreManuallyChanged]);

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

  // Pre-selezione magazzino: prima default dell'ordine, poi default azienda
  useEffect(() => {
    if (!orderId || warehouseId || !selectedOrder) return;
    if (selectedOrder.default_warehouse_id) setWarehouseId(selectedOrder.default_warehouse_id);
  }, [orderId, selectedOrder, warehouseId]);

  // Auto-popola entries dagli order_items dell'ordine selezionato.
  // Carica solo gli articoli con stock_item_id valido (collegati a magazzino).
  const { data: orderItemsPrefill = [] } = useQuery({
    queryKey: ["scarico-order-items-prefill", orderId, warehouseId],
    enabled: !!orderId && !!warehouseId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, stock_item_id, name, product_code, quantity, fulfillment_status")
        .eq("order_id", orderId!)
        .not("stock_item_id", "is", null);
      if (error) throw error;

      const stockItemIds = (data ?? [])
        .map((r) => r.stock_item_id)
        .filter((v): v is string => !!v);
      if (stockItemIds.length === 0) return [];

      const { data: stockData } = await supabase
        .from("warehouse_stock")
        .select("id, name, quantity, tracking_mode")
        .in("id", stockItemIds)
        .eq("warehouse_id", warehouseId!);

      const stockMap = new Map((stockData ?? []).map((s) => [s.id, s]));

      return (data ?? [])
        .filter((r) => r.stock_item_id && stockMap.has(r.stock_item_id))
        .filter((r) => r.fulfillment_status !== "delivered")
        .map((r) => {
          const stock = stockMap.get(r.stock_item_id!)!;
          return {
            order_item_id: r.id,
            stock_item_id: r.stock_item_id!,
            name: stock.name ?? r.name ?? "—",
            quantity: r.quantity || 1,
            tracking_mode: stock.tracking_mode as "fungible" | "serialized",
            product_code: r.product_code ?? "",
            available_in_warehouse: stock.quantity || 0,
          };
        });
    },
  });

  const [orderPrefillApplied, setOrderPrefillApplied] = useState<string | null>(null);
  // Quando ordine + warehouse pronti + item prefill ricevuti → applica una sola
  // volta per ordineId. Se l'utente ha già entries manuali, NON sovrascrivo.
  // Deps: usiamo orderItemsPrefill.length (number stabile) invece dell'array
  // intero per evitare re-fire dell'effect ad ogni refetch react-query
  // (es. su window focus quando i dati sono identici).
  const prefillCount = orderItemsPrefill.length;
  useEffect(() => {
    if (!orderId || !warehouseId) return;
    if (orderPrefillApplied === orderId) return;
    if (prefillCount === 0) return;
    if (entries.length > 0) {
      setOrderPrefillApplied(orderId);
      return;
    }
    const prefillEntries: BatchScanEntry[] = orderItemsPrefill.map((it) => ({
      id: crypto.randomUUID(),
      stockItemId: it.stock_item_id,
      itemName: it.name,
      quantity: Math.min(it.quantity, it.available_in_warehouse || it.quantity),
      serialNumbers: [],
      rawCode: it.product_code,
      trackingMode: it.tracking_mode,
      resolutionStatus: "matched",
    } as BatchScanEntry));
    setEntries(prefillEntries);
    setOrderPrefillApplied(orderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, warehouseId, prefillCount, entries.length, orderPrefillApplied]);

  const handleOrderChange = useCallback((id: string, order: OrderOption) => {
    setOrderId(id);
    setSelectedOrder(order);
    setOrderPrefillApplied(null); // reset così il nuovo ordine può prefillarsi
    setVettoreManuallyChanged(false); // permette auto-fill da contratto nuovo
  }, []);

  const handleClearOrder = useCallback(() => {
    setOrderId(undefined);
    setSelectedOrder(null);
    setOrderPrefillApplied(null);
    setVettoreTipo("mittente");
    setVettoreSubId(undefined);
    setVettoreManuallyChanged(false);
  }, []);

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
      setSelectedOrder(null);
      setWarehouseId(undefined);
      setLoadedGoodsPhotos([]);
      setEntries([]);
      setVettoreTipo("mittente");
      setVettoreSubId(undefined);
      setVettoreTerzoNome("");
      setVettoreTerzoPiva("");
      setVettoreTerzoIndirizzo("");
      setVettoreManuallyChanged(false);
      shipment.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const orderObj = selectedOrder;
  const warehouseObj = useMemo(
    () => warehouses.find((w) => w.id === warehouseId),
    [warehouses, warehouseId],
  );

  // Solo il magazzino è obbligatorio. Il DDT può essere generato anche
  // senza ordine collegato (resi, spostamenti, consegne spot).
  const canProceedToScan = !!warehouseId;

  async function handleConfirm() {
    if (!warehouseId) return; // ordine ora opzionale, solo magazzino obbligatorio

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

    // Costruisci ddt_vettore JSONB se il trasportatore è stato specificato
    let vettoreJson: string | undefined;
    if (vettoreTipo === "subappaltatore" && vettoreSubId) {
      const sub = subappaltatori.find((s) => s.id === vettoreSubId);
      if (sub) {
        vettoreJson = JSON.stringify({
          tipo: "subappaltatore",
          subappaltatore_id: sub.id,
          ragione_sociale: sub.ragione_sociale,
          vat_number: sub.piva,
          conducente_nome: sub.responsabile,
          conducente_telefono: sub.telefono,
        });
      }
    } else if (vettoreTipo === "terzo" && vettoreTerzoNome.trim()) {
      vettoreJson = JSON.stringify({
        tipo: "terzo",
        ragione_sociale: vettoreTerzoNome.trim(),
        vat_number: vettoreTerzoPiva.trim() || null,
        address: vettoreTerzoIndirizzo.trim() || null,
      });
    } else if (vettoreTipo === "mittente") {
      vettoreJson = JSON.stringify({ tipo: "mittente" });
    }

    const photoNote =
      loadedGoodsPhotos.length > 0
        ? `Foto merce caricata: ${loadedGoodsPhotos.length} immagini${uploadedPhotoPaths.length > 0 ? ` (${uploadedPhotoPaths.length} salvate)` : ""}`
        : "";
    const ddtExtra: { note_documento?: string; vettore?: string } = {};
    if (photoNote) ddtExtra.note_documento = photoNote;
    if (vettoreJson) ddtExtra.vettore = vettoreJson;

    try {
      const res = await shipment.mutateAsync({
        orderId,
        warehouseId,
        entries,
        ddtExtra: Object.keys(ddtExtra).length > 0 ? ddtExtra : undefined,
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
  // Quando l'utente chiude lo scanner torniamo allo step "context" così può
  // continuare a modificare la lista articoli manuale (non perdiamo le entries).
  if (step === "scan") {
    return (
      <Suspense fallback={null}>
        <BatchBarcodeScanner
          open={open}
          onOpenChange={(v) => {
            if (!v) setStep("context");
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
      <DialogContent className="!fixed !left-3 !right-3 !top-3 !bottom-[calc(5.25rem+env(safe-area-inset-bottom))] !flex !flex-col !w-auto !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden p-0 sm:!left-[50%] sm:!right-auto sm:!top-[50%] sm:!bottom-auto sm:!w-full sm:!max-w-3xl sm:!max-h-[90svh] sm:!translate-x-[-50%] sm:!translate-y-[-50%]">
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

          {/* Ordine destinazione — OPZIONALE. Se presente, gli articoli ordinati
              vengono auto-caricati e cliente_snapshot popolato. Se assente, è
              un DDT spot (reso, spostamento, consegna libera). */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Ordine destinazione <span className="text-muted-foreground font-normal">(opzionale)</span></Label>
              {orderId && (
                <button
                  type="button"
                  onClick={handleClearOrder}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  Rimuovi ordine
                </button>
              )}
            </div>
            <OrderSelectCombobox
              companyId={companyId}
              value={orderId}
              onChange={handleOrderChange}
              placeholder="Cerca per codice, cliente o indirizzo... oppure lascia vuoto"
            />
            {orderId && orderItemsPrefill.length > 0 && (
              <p className="text-[11px] text-emerald-600">
                ✓ {orderItemsPrefill.length} articoli pre-caricati dall'ordine — controlla quantità e aggiungi/rimuovi se serve.
              </p>
            )}
            {!orderId && (
              <p className="text-[11px] text-muted-foreground">
                Senza ordine: il DDT esce in bozza e completi cliente, causale e dettagli nell'editor.
              </p>
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

          {/* Articoli — modalità manuale (alternativa allo scanner) */}
          <div className="space-y-2">
            <Label>Articoli da scaricare</Label>
            <ManualArticleAdder
              companyId={companyId}
              warehouseId={warehouseId}
              entries={entries}
              onEntriesChange={setEntries}
            />
            <p className="text-[11px] text-muted-foreground">
              Aggiungi articoli cercandoli per nome qui sopra, oppure clicca <strong>"Scansiona articoli"</strong> per
              usare la fotocamera/scanner barcode.
            </p>
          </div>

          {/* Trasportatore — chi porta la merce. Opzionale (default: mittente azienda).
              Auto-fill da contratto subappalto della commessa, se presente. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Trasportatore <span className="text-muted-foreground font-normal">(opzionale)</span></Label>
              {orderContract?.subappaltatore_id && vettoreTipo === "subappaltatore" && !vettoreManuallyChanged && (
                <span className="text-[10px] text-emerald-600">✓ Auto-fill dalla commessa</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["mittente", "subappaltatore", "terzo"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setVettoreTipo(t); setVettoreManuallyChanged(true); }}
                  className={`text-xs px-3 py-2 rounded-md border transition-colors ${
                    vettoreTipo === t
                      ? "bg-primary text-primary-foreground border-primary font-medium"
                      : "bg-card hover:bg-muted text-foreground"
                  }`}
                >
                  {t === "mittente" && "Mittente (azienda)"}
                  {t === "subappaltatore" && "Subappaltatore"}
                  {t === "terzo" && "Vettore terzo"}
                </button>
              ))}
            </div>
            {vettoreTipo === "subappaltatore" && (
              <Select value={vettoreSubId} onValueChange={(v) => { setVettoreSubId(v); setVettoreManuallyChanged(true); }}>
                <SelectTrigger>
                  <SelectValue placeholder={subappaltatori.length ? "Scegli subappaltatore" : "Nessun subappaltatore attivo"} />
                </SelectTrigger>
                <SelectContent>
                  {subappaltatori.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.ragione_sociale}
                      {s.piva ? ` — ${s.piva}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {vettoreTipo === "terzo" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Input
                    value={vettoreTerzoNome}
                    onChange={(e) => setVettoreTerzoNome(e.target.value)}
                    placeholder="Ragione sociale vettore terzo"
                    maxLength={120}
                  />
                </div>
                <Input
                  value={vettoreTerzoPiva}
                  onChange={(e) => setVettoreTerzoPiva(e.target.value)}
                  placeholder="P.IVA"
                  maxLength={20}
                />
                <Input
                  value={vettoreTerzoIndirizzo}
                  onChange={(e) => setVettoreTerzoIndirizzo(e.target.value)}
                  placeholder="Sede legale (via, città)"
                  maxLength={200}
                />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Conducente, targa e altri dettagli si completano nell'editor DDT dopo la generazione.
            </p>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Annulla
          </Button>
          <Button
            variant="outline"
            onClick={() => setStep("scan")}
            disabled={!canProceedToScan}
            className="flex-1"
          >
            <Camera className="h-4 w-4 mr-2" />
            Scansiona
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canProceedToScan || entries.length === 0 || shipment.isPending}
            className="flex-[2]"
          >
            {shipment.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generazione...
              </>
            ) : (
              <>
                Genera DDT ({entries.length})
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
