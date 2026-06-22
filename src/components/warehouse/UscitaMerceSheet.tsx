/**
 * UscitaMerceSheet — USCITA MERCE a 2 FASI (doppio controllo). FASE 1.
 *
 * Flusso:
 *   1. Compili l'uscita: destinatario (Cliente finale / Cantiere / Libero),
 *      magazzino sorgente, articoli (manuale + scanner), trasportatore.
 *   2. "Registra uscita" → RPC register_warehouse_uscita: scarico movimenti +
 *      giacenza + seriali shipped. **NESSUN DDT** in questa fase.
 *   3. Il DDT si genera DOPO, come step separato, dalla scheda "Uscite"
 *      (RPC create_ddt_from_uscita) = doppio controllo.
 *
 * Differenza vs il vecchio ScaricoCantiereSheet (scarico+DDT atomico, solo
 * cantiere): qui il destinatario è generalizzato e la creazione DDT è separata.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
  Loader2,
  Camera,
  ChevronDown,
  User,
  HardHat,
  PencilLine,
  PackageCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRegisterUscita, type UscitaScan, type UscitaDestinatario, type VettoreJson } from "@/hooks/warehouse/useWarehouseUscita";
import { supabase } from "@/integrations/supabase/client";
import type { ClienteSnapshot } from "@/types/fatturazione";
import type { BatchScanEntry } from "./BatchBarcodeScanner";
import { OrderSelectCombobox, type OrderOption } from "./OrderSelectCombobox";
import { ManualArticleAdder } from "./ManualArticleAdder";
import { AnagraficaSelectCombobox, type AnagraficaOption, anagraficaDisplayName } from "./AnagraficaSelectCombobox";

const BatchBarcodeScanner = lazy(() =>
  import("./BatchBarcodeScanner").then((m) => ({ default: m.BatchBarcodeScanner })),
);

interface UscitaMerceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface WarehouseRow {
  id: string;
  name: string;
  is_default: boolean;
}

type Step = "context" | "scan";
type DestTipo = "cliente" | "cantiere" | "libero";
type VettoreTipo = "mittente" | "subappaltatore" | "terzo";

/** entries(BatchScanEntry) → scans payload per l'RPC (come entriesToScansPayload di useCreateShipment). */
function entriesToScans(entries: BatchScanEntry[]): UscitaScan[] {
  return entries
    .filter((e) => e.stockItemId !== null)
    .map((e) => ({
      stock_item_id: e.stockItemId as string,
      quantity: e.quantity,
      serial_numbers: e.serialNumbers.length > 0 ? e.serialNumbers : undefined,
      raw_code: e.rawCode,
    }));
}

/** Costruisce il cliente_snapshot dall'anagrafica selezionata (stesso mapping di CreaDDTDialog). */
function snapshotFromAnagrafica(a: AnagraficaOption): Partial<ClienteSnapshot> {
  return {
    ragione_sociale: anagraficaDisplayName(a),
    nome: a.nome || undefined,
    cognome: a.cognome || undefined,
    partita_iva: a.partita_iva || undefined,
    codice_fiscale: a.codice_fiscale || undefined,
    codice_sdi: a.codice_sdi || undefined,
    pec: a.pec || undefined,
    indirizzo_via: a.indirizzo_via || undefined,
    indirizzo_cap: a.indirizzo_cap || undefined,
    indirizzo_comune: a.indirizzo_comune || undefined,
    indirizzo_provincia: a.indirizzo_provincia || undefined,
    indirizzo_nazione: a.indirizzo_nazione || "IT",
    tipo_cliente: (a.tipo_cliente as ClienteSnapshot["tipo_cliente"]) || "B2B",
  };
}

/** Intestazione di sezione numerata (1·2·3) per un flusso lineare. */
function StepHead({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
        {n}
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

export function UscitaMerceSheet({ open, onOpenChange }: UscitaMerceSheetProps) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const register = useRegisterUscita();

  const [step, setStep] = useState<Step>("context");

  // ── Destinatario ──────────────────────────────────────────────
  const [destTipo, setDestTipo] = useState<DestTipo>("cantiere");
  // cliente
  const [anagraficaId, setAnagraficaId] = useState<string | undefined>();
  const [selectedAnagrafica, setSelectedAnagrafica] = useState<AnagraficaOption | null>(null);
  // cantiere
  const [orderId, setOrderId] = useState<string | undefined>();
  const [selectedOrder, setSelectedOrder] = useState<OrderOption | null>(null);
  // libero
  const [liberoRagione, setLiberoRagione] = useState("");
  const [liberoIndirizzo, setLiberoIndirizzo] = useState("");
  const [liberoPiva, setLiberoPiva] = useState("");

  // ── Magazzino + articoli ──────────────────────────────────────
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [entries, setEntries] = useState<BatchScanEntry[]>([]);
  const [note, setNote] = useState("");
  // Sezione "Trasportatore e note" collassata di default (mobile pulito)
  const [detailsOpen, setDetailsOpen] = useState(false);

  // ── Trasportatore ─────────────────────────────────────────────
  const [vettoreTipo, setVettoreTipo] = useState<VettoreTipo>("mittente");
  const [vettoreSubId, setVettoreSubId] = useState<string | undefined>();
  const [vettoreTerzoNome, setVettoreTerzoNome] = useState("");
  const [vettoreTerzoPiva, setVettoreTerzoPiva] = useState("");
  const [vettoreTerzoIndirizzo, setVettoreTerzoIndirizzo] = useState("");
  const [vettoreManuallyChanged, setVettoreManuallyChanged] = useState(false);

  // ── Subappaltatori (registro condiviso) ───────────────────────
  const { data: subappaltatori = [] } = useQuery<{ id: string; ragione_sociale: string; piva: string | null; responsabile: string | null; telefono: string | null; indirizzo: string | null }[]>({
    queryKey: ["uscita-subappaltatori", companyId],
    enabled: !!companyId && vettoreTipo === "subappaltatore",
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        from: (n: string) => { select: (s: string) => { eq: (k: string, v: string) => Promise<{ data: Array<{ id: string; ragione_sociale: string; piva: string | null; responsabile: string | null; telefono: string | null; indirizzo: string | null }> | null; error: { message: string } | null }> } };
      }).from("v_subappaltatori_dashboard")
        .select("id, ragione_sociale, piva, responsabile, telefono, indirizzo")
        .eq("company_id", companyId!);
      if (error) throw error;
      const seen = new Set<string>();
      const unique = (data ?? []).filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
      unique.sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale));
      return unique;
    },
  });

  // ── Warehouses attivi della company ───────────────────────────
  const { data: warehouses = [], isLoading: warehousesLoading } = useQuery<WarehouseRow[]>({
    queryKey: ["uscita-warehouses", companyId],
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

  // Pre-selezione magazzino default
  useEffect(() => {
    if (warehouseId || warehouses.length === 0) return;
    const def = warehouses.find((w) => w.is_default) ?? warehouses[0];
    setWarehouseId(def.id);
  }, [warehouses, warehouseId]);

  // Magazzino default dell'ordine (cantiere)
  useEffect(() => {
    if (destTipo !== "cantiere" || !selectedOrder?.default_warehouse_id) return;
    setWarehouseId(selectedOrder.default_warehouse_id);
  }, [destTipo, selectedOrder]);

  // ── Auto-fill articoli dall'ordine (solo cantiere) ────────────
  const { data: orderItemsPrefill = [] } = useQuery({
    queryKey: ["uscita-order-items-prefill", orderId, warehouseId],
    enabled: destTipo === "cantiere" && !!orderId && !!warehouseId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, stock_item_id, name, product_code, quantity, fulfillment_status")
        .eq("order_id", orderId!);
      if (error) throw error;
      const stockItemIds = (data ?? []).map((r) => r.stock_item_id).filter((v): v is string => !!v);
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
  const prefillCount = orderItemsPrefill.length;
  useEffect(() => {
    if (destTipo !== "cantiere" || !orderId || !warehouseId) return;
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
  }, [destTipo, orderId, warehouseId, prefillCount, entries.length, orderPrefillApplied]);

  // Auto-fill trasportatore dal contratto subappalto della commessa
  const { data: orderContract } = useQuery<{ subappaltatore_id: string } | null>({
    queryKey: ["uscita-order-contract", orderId],
    enabled: destTipo === "cantiere" && !!orderId,
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
  useEffect(() => {
    if (destTipo !== "cantiere" || !orderId || vettoreManuallyChanged) return;
    if (!orderContract?.subappaltatore_id) return;
    setVettoreTipo("subappaltatore");
    setVettoreSubId(orderContract.subappaltatore_id);
  }, [destTipo, orderId, orderContract?.subappaltatore_id, vettoreManuallyChanged]);

  const handleOrderChange = useCallback((id: string, order: OrderOption) => {
    setOrderId(id);
    setSelectedOrder(order);
    setOrderPrefillApplied(null);
    setVettoreManuallyChanged(false);
  }, []);

  const handleAnagraficaChange = useCallback((id: string, a: AnagraficaOption) => {
    setAnagraficaId(id);
    setSelectedAnagrafica(a);
  }, []);

  const handleDestTipoChange = useCallback((t: DestTipo) => {
    setDestTipo(t);
    // reset trasportatore auto-fill quando cambia destinatario
    if (t !== "cantiere") {
      setVettoreManuallyChanged(false);
    }
  }, []);

  // Nota: NON serve un reset-on-close. Il componente è montato dal parent come
  // `{uscitaOpen && <UscitaMerceSheet/>}`, quindi alla chiusura si smonta e tutto
  // lo stato locale (più la mutation) riparte pulito alla riapertura.

  const warehouseObj = useMemo(() => warehouses.find((w) => w.id === warehouseId), [warehouses, warehouseId]);

  // Validazione destinatario
  const destinatarioValid =
    destTipo === "cliente"
      ? !!anagraficaId
      : destTipo === "cantiere"
        ? !!orderId
        : liberoRagione.trim().length > 0;

  const canRegister = !!warehouseId && destinatarioValid && entries.length > 0;

  function buildDestinatario(): UscitaDestinatario {
    if (destTipo === "cliente" && selectedAnagrafica) {
      return {
        tipo: "cliente",
        customer_id: anagraficaId,
        cliente_snapshot: snapshotFromAnagrafica(selectedAnagrafica),
      };
    }
    if (destTipo === "cantiere" && selectedOrder) {
      const ragione = selectedOrder.customer_name || `Commessa ${selectedOrder.order_code}`;
      return {
        tipo: "cantiere",
        order_id: orderId,
        cliente_snapshot: {
          ragione_sociale: ragione,
          indirizzo_via: selectedOrder.indirizzo_lavori || undefined,
          indirizzo_nazione: "IT",
          tipo_cliente: "B2B",
        },
      };
    }
    // libero
    return {
      tipo: "libero",
      libero: {
        ragione_sociale: liberoRagione.trim(),
        indirizzo: liberoIndirizzo.trim() || undefined,
        partita_iva: liberoPiva.trim() || undefined,
      },
      cliente_snapshot: {
        ragione_sociale: liberoRagione.trim(),
        partita_iva: liberoPiva.trim() || undefined,
        indirizzo_via: liberoIndirizzo.trim() || undefined,
        indirizzo_nazione: "IT",
        tipo_cliente: liberoPiva.trim() ? "B2B" : "B2C",
      },
    };
  }

  function buildVettore(): VettoreJson | null {
    if (vettoreTipo === "subappaltatore" && vettoreSubId) {
      const sub = subappaltatori.find((s) => s.id === vettoreSubId);
      if (sub) {
        return {
          tipo: "subappaltatore",
          subappaltatore_id: sub.id,
          ragione_sociale: sub.ragione_sociale,
          vat_number: sub.piva ?? undefined,
          conducente_nome: sub.responsabile ?? undefined,
          conducente_telefono: sub.telefono ?? undefined,
        };
      }
    }
    if (vettoreTipo === "terzo" && vettoreTerzoNome.trim()) {
      return {
        tipo: "terzo",
        ragione_sociale: vettoreTerzoNome.trim(),
        vat_number: vettoreTerzoPiva.trim() || null,
        address: vettoreTerzoIndirizzo.trim() || null,
      };
    }
    return { tipo: "mittente" };
  }

  async function handleRegister() {
    if (!warehouseId || !destinatarioValid || entries.length === 0) return;
    const scans = entriesToScans(entries);
    if (scans.length === 0) {
      toast.error("Nessun articolo valido da scaricare");
      return;
    }
    try {
      const res = await register.mutateAsync({
        warehouseId,
        destinatario: buildDestinatario(),
        scans,
        vettore: buildVettore(),
        note: note.trim() || null,
      });
      const errCount = Array.isArray(res.errors) ? res.errors.length : 0;
      toast.success(`Uscita ${res.numero} registrata`, {
        description: `${res.created_movements} articoli scaricati${res.updated_units ? ` · ${res.updated_units} seriali` : ""}${errCount ? ` · ${errCount} avvisi` : ""}. Crea il DDT dalla scheda "Uscite".`,
      });
      onOpenChange(false);
    } catch (e) {
      toast.error("Errore registrazione uscita", { description: (e as Error).message });
    }
  }

  // ── Step 'scan' ───────────────────────────────────────────────
  if (step === "scan") {
    const allowedOrderItems = orderItemsPrefill.map((it) => ({
      stockItemId: it.stock_item_id,
      orderItemId: it.order_item_id,
      itemName: it.name,
      qtyRequired: it.quantity,
    }));
    const contextLabel =
      destTipo === "cantiere" && selectedOrder
        ? `Cantiere ${selectedOrder.order_code}${warehouseObj ? ` · Da: ${warehouseObj.name}` : ""}`
        : destTipo === "cliente" && selectedAnagrafica
          ? `Cliente ${anagraficaDisplayName(selectedAnagrafica)}${warehouseObj ? ` · Da: ${warehouseObj.name}` : ""}`
          : warehouseObj
            ? `Da: ${warehouseObj.name}`
            : "";
    return (
      <Suspense fallback={null}>
        <BatchBarcodeScanner
          open={open}
          onOpenChange={(v) => {
            if (!v) setStep("context");
          }}
          mode="carico"
          contextLabel={contextLabel}
          allowedOrderItems={destTipo === "cantiere" && allowedOrderItems.length > 0 ? allowedOrderItems : undefined}
          initialEntries={entries}
          onEntriesChange={setEntries}
          onConfirm={handleRegister}
          confirmLabel="Registra uscita"
          isConfirming={register.isPending}
        />
      </Suspense>
    );
  }

  const DEST_TABS: { key: DestTipo; label: string; icon: typeof User }[] = [
    { key: "cliente", label: "Cliente", icon: User },
    { key: "cantiere", label: "Cantiere", icon: HardHat },
    { key: "libero", label: "Libero", icon: PencilLine },
  ];

  // Riepilogo del trasportatore mostrato quando la sezione dettagli è chiusa.
  const vettoreSummary =
    vettoreTipo === "subappaltatore"
      ? subappaltatori.find((s) => s.id === vettoreSubId)?.ragione_sociale || "Subappaltatore"
      : vettoreTipo === "terzo"
        ? vettoreTerzoNome.trim() || "Vettore terzo"
        : "Mittente (azienda)";

  // Cosa manca per poter registrare (mostrato sopra il footer).
  const missingReason = !destinatarioValid
    ? "Scegli il destinatario"
    : !warehouseId
      ? "Scegli il magazzino di partenza"
      : entries.length === 0
        ? "Aggiungi almeno un articolo"
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!fixed !left-3 !right-3 !top-3 !bottom-[calc(5.25rem+env(safe-area-inset-bottom))] !flex !flex-col !w-auto !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden p-0 sm:!left-[50%] sm:!right-auto sm:!top-[50%] sm:!bottom-auto sm:!w-full sm:!max-w-3xl sm:!max-h-[90svh] sm:!translate-x-[-50%] sm:!translate-y-[-50%]">
        <DialogHeader className="shrink-0 px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowUpFromLine className="h-5 w-5 text-primary" />
            Uscita merce
          </DialogTitle>
          <DialogDescription className="text-xs">
            Compili l'uscita e la <strong>registri</strong>. Il DDT lo crei dopo, come passo separato, dalla scheda <strong>Uscite</strong> (doppio controllo).
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4 space-y-3">
          {/* 1 · Destinatario */}
          <section className="rounded-xl border bg-card p-3 sm:p-4 space-y-3">
            <StepHead n={1} label="A chi esce la merce" />
            <div className="grid grid-cols-3 gap-1.5">
              {DEST_TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleDestTipoChange(key)}
                  aria-pressed={destTipo === key}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2.5 text-xs font-medium transition-colors ${
                    destTipo === key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              ))}
            </div>

            {destTipo === "cliente" && (
              <div className="space-y-1.5">
                <AnagraficaSelectCombobox
                  companyId={companyId}
                  value={anagraficaId}
                  onChange={handleAnagraficaChange}
                  placeholder="Cerca il cliente per nome o P.IVA…"
                />
                <p className="text-[11px] text-muted-foreground">
                  I dati anagrafici del cliente vengono ripresi nel DDT (ragione sociale, P.IVA, indirizzo).
                </p>
              </div>
            )}

            {destTipo === "cantiere" && (
              <div className="space-y-1.5">
                <OrderSelectCombobox
                  companyId={companyId}
                  value={orderId}
                  onChange={handleOrderChange}
                  placeholder="Cerca per codice, cliente o indirizzo cantiere…"
                />
                {orderId && orderItemsPrefill.length > 0 && (
                  <p className="text-[11px] text-emerald-600">
                    ✓ {orderItemsPrefill.length} articoli pre-caricati dalla commessa — controlla quantità.
                  </p>
                )}
              </div>
            )}

            {destTipo === "libero" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <Input
                    value={liberoRagione}
                    onChange={(e) => setLiberoRagione(e.target.value)}
                    placeholder="Ragione sociale / nominativo destinatario *"
                    maxLength={160}
                  />
                </div>
                <Input
                  value={liberoIndirizzo}
                  onChange={(e) => setLiberoIndirizzo(e.target.value)}
                  placeholder="Indirizzo (via, città)"
                  maxLength={200}
                />
                <Input
                  value={liberoPiva}
                  onChange={(e) => setLiberoPiva(e.target.value)}
                  placeholder="P.IVA / CF (opzionale)"
                  maxLength={20}
                />
              </div>
            )}
          </section>

          {/* 2 · Magazzino sorgente */}
          <section className="rounded-xl border bg-card p-3 sm:p-4 space-y-2">
            <StepHead n={2} label="Da quale magazzino" />
            {warehousesLoading ? (
              <div className="h-10 border rounded-md flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                Caricamento...
              </div>
            ) : warehouses.length === 0 ? (
              <Alert>
                <AlertDescription className="text-xs">
                  Nessun magazzino attivo. Crea un magazzino da <strong>Magazzino → Impostazioni</strong>.
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="um-warehouse">
                  <SelectValue placeholder="Scegli un magazzino..." />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <div className="flex items-center gap-2">
                        {w.name}
                        {w.is_default && (
                          <span className="text-[9px] uppercase bg-muted px-1.5 py-0.5 rounded">default</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </section>

          {/* 3 · Articoli */}
          <section className="rounded-xl border bg-card p-3 sm:p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <StepHead n={3} label="Cosa esce" />
              {entries.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {entries.length} {entries.length === 1 ? "articolo" : "articoli"}
                </span>
              )}
            </div>
            <ManualArticleAdder
              companyId={companyId}
              warehouseId={warehouseId}
              entries={entries}
              onEntriesChange={setEntries}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("scan")}
              disabled={!warehouseId}
              className="w-full h-11 gap-2"
            >
              <Camera className="h-4 w-4" />
              Scansiona codici a barre
            </Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Articoli serializzati (codice univoco per pezzo, es. pannelli FV): aggiungi i <strong>seriali</strong> nella riga dell'articolo, oppure scansionali.
            </p>
          </section>

          {/* Dettagli opzionali: trasportatore + note — collassati di default */}
          <section className="rounded-xl border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setDetailsOpen((o) => !o)}
              aria-expanded={detailsOpen}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 sm:px-4 text-left hover:bg-muted/40 transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Trasportatore e note</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {vettoreSummary}
                  {note.trim() ? " · nota presente" : ""}
                  {orderContract?.subappaltatore_id && vettoreTipo === "subappaltatore" && !vettoreManuallyChanged ? " · auto" : ""}
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
            </button>

            {detailsOpen && (
              <div className="space-y-3 border-t px-3 py-3 sm:px-4">
                {/* Trasportatore */}
                <div className="space-y-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Trasportatore</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["mittente", "subappaltatore", "terzo"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setVettoreTipo(t); setVettoreManuallyChanged(true); }}
                        aria-pressed={vettoreTipo === t}
                        className={`rounded-lg border px-1 py-2 text-xs font-medium transition-colors ${
                          vettoreTipo === t
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {t === "mittente" && "Mittente"}
                        {t === "subappaltatore" && "Subappalto"}
                        {t === "terzo" && "Terzo"}
                      </button>
                    ))}
                  </div>
                  {vettoreTipo === "subappaltatore" && (
                    <Select value={vettoreSubId} onValueChange={(v) => { setVettoreSubId(v); setVettoreManuallyChanged(true); }}>
                      <SelectTrigger>
                        <SelectValue placeholder={subappaltatori.length ? "Scegli subappaltatore dal registro" : "Nessun subappaltatore attivo"} />
                      </SelectTrigger>
                      <SelectContent>
                        {subappaltatori.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="font-medium">{s.ragione_sociale}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {s.piva ? `P.IVA ${s.piva}` : <span className="text-amber-600">⚠ P.IVA mancante</span>}
                                {s.indirizzo ? ` · ${s.indirizzo}` : ""}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {vettoreTipo === "terzo" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <Input value={vettoreTerzoNome} onChange={(e) => setVettoreTerzoNome(e.target.value)} placeholder="Ragione sociale vettore terzo" maxLength={120} />
                      </div>
                      <Input value={vettoreTerzoPiva} onChange={(e) => setVettoreTerzoPiva(e.target.value)} placeholder="P.IVA" maxLength={20} />
                      <Input value={vettoreTerzoIndirizzo} onChange={(e) => setVettoreTerzoIndirizzo(e.target.value)} placeholder="Sede legale (via, città)" maxLength={200} />
                    </div>
                  )}
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <Label htmlFor="um-note" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Note interne</Label>
                  <Input id="um-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note interne sull'uscita…" maxLength={300} />
                </div>
              </div>
            )}
          </section>

          <Alert>
            <PackageCheck className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Registri l'uscita</strong> (scarico merce + giacenza). Il <strong>DDT non viene creato ora</strong>:
              lo generi dopo, controllando i dati, dalla scheda <strong>Uscite</strong>.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="shrink-0 border-t p-3 bg-card flex-col gap-2">
          {missingReason && (
            <p className="w-full text-center text-[11px] text-muted-foreground">
              Per registrare manca: <strong className="text-foreground">{missingReason}</strong>
            </p>
          )}
          <div className="flex w-full gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 h-11">
              Annulla
            </Button>
            <Button
              onClick={handleRegister}
              disabled={!canRegister || register.isPending}
              className="flex-[2] h-11 gap-2"
            >
              {register.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registrazione…
                </>
              ) : (
                <>
                  Registra uscita{entries.length ? ` (${entries.length})` : ""}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
