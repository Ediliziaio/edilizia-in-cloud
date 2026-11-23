import { useMovementBalances } from "@/hooks/warehouse/useMovementBalances";
import { materialiPrenotatiDaPrelevare, rigaMovimentoIniziale } from "@/lib/magazzino/righeMovimento";
/**
 * UscitaMerceSheet — USCITA MERCE a 2 FASI (doppio controllo). FASE 1.
 *
 * Flusso:
 *   1. Compili l'uscita: destinatario (Cliente finale / Cantiere / Libero),
 *      magazzino sorgente, articoli (manuale + scanner), trasportatore.
 *   2. "Registra uscita" → RPC register_warehouse_uscita: scarico movimenti +
 *      giacenza + seriali shipped. **NESSUN DDT** in questa fase.
 *   3. Il DDT è un passo separato (RPC create_ddt_from_uscita) = doppio
 *      controllo: si propone subito dopo la registrazione, con causale e dati
 *      di trasporto (CreaDdtDaUscitaDialog), oppure più tardi dalla scheda
 *      "Uscite".
 *
 * Differenza vs il vecchio ScaricoCantiereSheet (scarico+DDT atomico, solo
 * cantiere): qui il destinatario è generalizzato e la creazione DDT è separata.
 */

import { lazy, Suspense, useCallback, useMemo, useState, useRef } from "react";
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
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";
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
import { usePermissions } from "@/hooks/usePermissions";
import { warehouseCapabilities } from "@/lib/magazzino/protocolloMovimenti";
import { movementAvailabilityError, useMovementAvailability } from "@/hooks/warehouse/useMovementAvailability";
import { MovementReviewDialog } from "./MovementReviewDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRegisterUscita, type UscitaScan, type UscitaDestinatario, type VettoreJson } from "@/hooks/warehouse/useWarehouseUscita";
import { supabase } from "@/integrations/supabase/client";
import type { ClienteSnapshot } from "@/types/fatturazione";
import type { BatchScanEntry } from "./BatchBarcodeScanner";
import { OrderSelectCombobox, type OrderOption } from "./OrderSelectCombobox";
import { ManualArticleAdder } from "./ManualArticleAdder";
import { AnagraficaSelectCombobox, type AnagraficaOption, anagraficaDisplayName } from "./AnagraficaSelectCombobox";
import { CreaDdtDaUscitaDialog } from "./CreaDdtDaUscitaDialog";
import { validaRigheUscita } from "@/lib/magazzino/validaRigheUscita";
import type { UscitaPerDdt } from "@/lib/magazzino/usciteDdt";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const BatchBarcodeScanner = lazy(() =>
  import("./BatchBarcodeScanner").then((m) => ({ default: m.BatchBarcodeScanner })),
);

interface UscitaMerceSheetProps {
  initialStockItem?: import("@/types/warehouse").StockItem;
  initialOrder?: OrderOption;
  initialWarehouseId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface WarehouseRow {
  id: string;
  name: string;
  is_default: boolean;
}

type Step = "context" | "scan" | "review";
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

export function UscitaMerceSheet({ open, onOpenChange, initialOrder, initialWarehouseId, initialStockItem }: UscitaMerceSheetProps) {
  const tr = useT();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const register = useRegisterUscita();
  const permissions = usePermissions();
  const canWrite = !permissions.isLoading && permissions.canEditWarehouse;
  const commitInFlight = useRef(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Lo scanner usa la fotocamera: ha senso solo su mobile/tablet, non su desktop.
  const isMobile = useIsMobile();

  const [step, setStep] = useState<Step>("context");
  // Registrata l'uscita, il DDT si propone subito: prima si rimandava alla
  // scheda «Uscite» e lì restava (53 uscite su 53 senza DDT, 29/10/2026).
  const [registrata, setRegistrata] = useState<UscitaPerDdt | null>(null);

  // ── Destinatario ──────────────────────────────────────────────
  const [destTipo, setDestTipo] = useState<DestTipo>("cantiere");
  // cliente
  const [anagraficaId, setAnagraficaId] = useState<string | undefined>();
  const [selectedAnagrafica, setSelectedAnagrafica] = useState<AnagraficaOption | null>(null);
  // cantiere
  const [orderId, setOrderId] = useState<string | undefined>(initialOrder?.id);
  const [selectedOrder, setSelectedOrder] = useState<OrderOption | null>(initialOrder ?? null);
  // libero
  const [liberoRagione, setLiberoRagione] = useState("");
  const [liberoIndirizzo, setLiberoIndirizzo] = useState("");
  const [liberoPiva, setLiberoPiva] = useState("");

  // ── Magazzino + articoli ──────────────────────────────────────
  const [warehouseChoice, setWarehouseId] = useState<string | undefined>(initialWarehouseId ?? initialOrder?.default_warehouse_id ?? undefined);
  const [entries, setEntries] = useState<BatchScanEntry[]>(() => initialStockItem ? [rigaMovimentoIniziale(initialStockItem, false)] : []);
  const balances = useMovementBalances(companyId, entries.flatMap((entry) => entry.stockItemId ? [entry.stockItemId] : []), step === "review");
  const [note, setNote] = useState("");
  // Sezione "Trasportatore e note" collassata di default (mobile pulito)
  const [detailsOpen, setDetailsOpen] = useState(false);

  // ── Trasportatore ─────────────────────────────────────────────
  const [vettoreChoice, setVettoreTipo] = useState<VettoreTipo>("mittente");
  const [vettoreSubChoice, setVettoreSubId] = useState<string | undefined>();
  const [vettoreTerzoNome, setVettoreTerzoNome] = useState("");
  const [vettoreTerzoPiva, setVettoreTerzoPiva] = useState("");
  const [vettoreTerzoIndirizzo, setVettoreTerzoIndirizzo] = useState("");
  const [vettoreManuallyChanged, setVettoreManuallyChanged] = useState(false);

  // Auto-fill trasportatore dal contratto subappalto della commessa
  const { data: orderContract } = useQuery<{ subappaltatore_id: string } | null>({
    queryKey: ["uscita-order-contract", companyId, orderId],
    enabled: destTipo === "cantiere" && !!orderId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratti_subappalto")
        .select("subappaltatore_id")
        .eq("order_id", orderId!).eq("company_id",companyId!)
        .in("stato", ["attivo", "bozza"])
        .limit(1)
        .maybeSingle();
      if(error)throw error;
      return data;
    },
  });
  const automaticSubcontractor = destTipo === "cantiere" && !vettoreManuallyChanged ? orderContract?.subappaltatore_id : undefined;
  const vettoreTipo = automaticSubcontractor ? "subappaltatore" : vettoreChoice;
  const vettoreSubId = automaticSubcontractor ?? vettoreSubChoice;

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
  const { data: warehouses = [], isLoading: warehousesLoading, isError: warehousesError, refetch: refetchWarehouses } = useQuery<WarehouseRow[]>({
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

  const warehouseId = warehouseChoice || warehouses.find(w=>w.is_default)?.id || warehouses[0]?.id;

  // ── Auto-fill articoli dall'ordine (solo cantiere) ────────────
  const { data: orderItemsPrefill = [], isError: prefillError } = useQuery({
    queryKey: ["uscita-order-items-prefill", companyId, orderId, warehouseId],
    enabled: destTipo === "cantiere" && !!orderId && !!warehouseId,
    staleTime: 60_000,
    queryFn: async () => {
      const protocol = await warehouseCapabilities(companyId!);
      const { data: raw, error } = await supabase
        .from("order_items")
        .select(protocol.version >= 2 ? "id,stock_item_id,name,product_code,quantity,fulfillment_status,status,warehouse_reserved_quantity,order:orders!inner(company_id)" : "id,stock_item_id,name,product_code,quantity,fulfillment_status,status,order:orders!inner(company_id)")
        .eq("order_id", orderId!).eq("order.company_id", companyId!);
      const data = raw as unknown as { id: string; stock_item_id: string | null; name: string; product_code: string | null; quantity: number; fulfillment_status: string | null; status: string | null; warehouse_reserved_quantity?: number | null }[] | null;
      if (error) throw error;
      const stockItemIds = (data ?? []).map((r) => r.stock_item_id).filter((v): v is string => !!v);
      const { data: stockData, error: stockError } = await supabase
        .from("warehouse_stock")
        .select("id, name, quantity, quantity_available, quantity_reserved, unita_misura, tracking_mode")
        .in("id", stockItemIds)
        .eq("warehouse_id", warehouseId!);
      if (stockError) throw stockError;
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
            quantity: r.quantity ?? 0,
            tracking_mode: stock.tracking_mode as "fungible" | "serialized",
            product_code: r.product_code ?? "",
            available_in_warehouse: Math.min(Number(stock.quantity), Number(stock.quantity_available ?? 0) + (r.fulfillment_status === "received" ? Math.min(Number(r.warehouse_reserved_quantity ?? r.quantity), Number(stock.quantity_reserved ?? 0)) : 0)),
            unit: stock.unita_misura,
            reserved_for_order: r.fulfillment_status === "received" ? Number(r.warehouse_reserved_quantity ?? r.quantity) : 0,
            physical: Number(stock.quantity),
            free: Number(stock.quantity_available ?? 0),
            total_reserved: Number(stock.quantity_reserved ?? 0),
          };
        });
    },
  });

  const ownReservations = useMemo(() => {
    const own = new Map<string, number>();
    for (const item of orderItemsPrefill) own.set(item.stock_item_id, (own.get(item.stock_item_id) ?? 0) + item.reserved_for_order);
    return own;
  }, [orderItemsPrefill]);

  const availableForOrder = useMemo(() => {
    const own = new Map<string, number>();
    for (const item of orderItemsPrefill) own.set(item.stock_item_id, (own.get(item.stock_item_id) ?? 0) + item.reserved_for_order);
    return new Map(orderItemsPrefill.map((item) => [item.stock_item_id, Math.min(item.physical, item.free + Math.min(item.total_reserved, own.get(item.stock_item_id) ?? 0))]));
  }, [orderItemsPrefill]);

  const proposedEntries = useMemo(() => materialiPrenotatiDaPrelevare(orderItemsPrefill), [orderItemsPrefill]);

  const handleApplyOrderPrefill = () => {
    if (entries.length > 0) return;
    setEntries(proposedEntries);
  };

  const handleOrderChange = useCallback((id: string, order: OrderOption) => {
    setOrderId(id);setSelectedOrder(order);setVettoreManuallyChanged(false);
    if(entries.length===0&&order.default_warehouse_id)setWarehouseId(order.default_warehouse_id);
  }, [entries.length]);

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
        ? !!orderId && selectedOrder?.id === orderId
        : liberoRagione.trim().length > 0;

  const erroreRighe = validaRigheUscita(entries);
  const canRegister = canWrite && !outcomeUnknown && !warehousesError && warehouses.some((warehouse) => warehouse.id === warehouseId) && destinatarioValid && !erroreRighe;
  const availability = useMovementAvailability(companyId, warehouseId, entries, destTipo === "cantiere" ? orderId : undefined, step === "review");
  const availabilityProblem = step !== "review" ? null : availability.isLoading || availability.isFetching ? tr("Verifica della disponibilità in corso…") : availability.isError ? tr("Disponibilità non verificabile. Torna alle righe e riprova; i dati inseriti sono conservati.") : movementAvailabilityError(entries, availability.data);
  const requestReview = () => { setSubmitError(null); setStep("review"); };

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

  async function handleRegister(replay = false) {
    if (!warehouseId || (!canRegister && !(replay && register.canReplay && canWrite)) || register.isPending || commitInFlight.current) return;
    if (erroreRighe) {
      toast.error(erroreRighe);
      return;
    }
    const scans = entriesToScans(entries);
    if (scans.length === 0) {
      toast.error(tr("Nessun articolo valido da scaricare"));
      return;
    }
    commitInFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    let requestSent = false;
    try {
      if (!replay) {
      const fresh = await availability.refetch();
      if (fresh.isError) throw new Error(tr("Impossibile verificare il disponibile. Le righe sono conservate."));
      const shortage = movementAvailabilityError(entries, fresh.data);
      if (shortage) throw new Error(shortage);
      }
      const destinatario = buildDestinatario();
      requestSent = true;
      const res = await register.mutateAsync({
        warehouseId,
        destinatario,
        scans,
        vettore: buildVettore(),
        note: note.trim() || null,
      });
      const errCount = Array.isArray(res.errors) ? res.errors.length : 0;
      (errCount ? toast.warning : toast.success)(tr("Uscita {numero} registrata", { numero: res.numero }), {
        description: [tr("{n} articoli scaricati", { n: res.created_movements }), res.updated_units ? tr("{n} seriali", { n: res.updated_units }) : "", errCount ? tr("{n} avvisi", { n: errCount }) : ""].filter(Boolean).join(" · ") + ".",
      });
      setRegistrata({
        id: res.uscita_id,
        numero: res.numero,
        destinatario_tipo: destinatario.tipo,
        destinatario: destinatario.cliente_snapshot?.ragione_sociale || "il destinatario",
        righe: res.created_movements,
      });
    } catch (e) {
      if (replay && (e as { code?: string }).code) setOutcomeUnknown(false);
      if (requestSent && /fetch|network|connessione|timeout|timed out|esito uscita non disponibile/i.test((e as Error).message)) setOutcomeUnknown(true);
      setSubmitError((e as Error).message);
      toast.error(tr("Prelievo non confermato"), { description: (e as Error).message });
    } finally { commitInFlight.current = false; setSubmitting(false); }
  }

  // Uscita registrata: resta solo la domanda sul DDT. Chiusa la finestra (DDT
  // creato o «più tardi»), si chiude anche l'uscita.
  if (registrata) {
    return (
      <CreaDdtDaUscitaDialog
        uscita={registrata}
        appenaRegistrata
        onOpenChange={(aperta) => {
          if (!aperta) onOpenChange(false);
        }}
      />
    );
  }

  if (step === "review") return <MovementReviewDialog open={open} operation="prelievo" balances={balances.data} balancesLoading={balances.isFetching} balancesUnavailable={balances.isError} ownReservations={ownReservations} warehouse={warehouseObj?.name ?? tr("Magazzino")} counterpart={destTipo === "cantiere" ? selectedOrder?.order_code : destTipo === "cliente" && selectedAnagrafica ? anagraficaDisplayName(selectedAnagrafica) : liberoRagione} entries={entries} onBack={() => setStep("context")} onConfirm={() => void handleRegister()} onOpenChange={onOpenChange} pending={submitting || register.isPending} onRecover={outcomeUnknown && register.canReplay ? () => void handleRegister(true) : undefined} blocked={outcomeUnknown ? tr("Esito da verificare: la richiesta potrebbe essere già stata elaborata. Usa la verifica esito se disponibile oppure controlla la scheda Uscite prima di registrare di nuovo.") : !canWrite ? tr("Non hai il permesso di registrare movimenti.") : erroreRighe || availabilityProblem} error={submitError} />;

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
        ? `${tr("Cantiere {codice}", { codice: selectedOrder.order_code })}${warehouseObj ? ` · ${tr("Da: {magazzino}", { magazzino: warehouseObj.name })}` : ""}`
        : destTipo === "cliente" && selectedAnagrafica
          ? `${tr("Cliente {nome}", { nome: anagraficaDisplayName(selectedAnagrafica) })}${warehouseObj ? ` · ${tr("Da: {magazzino}", { magazzino: warehouseObj.name })}` : ""}`
          : warehouseObj
            ? tr("Da: {magazzino}", { magazzino: warehouseObj.name })
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
          onConfirm={requestReview}
          confirmLabel={tr("Controlla prelievo")}
          isConfirming={register.isPending}
        />
      </Suspense>
    );
  }

  const DEST_TABS: { key: DestTipo; label: string; icon: typeof User }[] = [
    { key: "cliente", label: tr("Cliente"), icon: User },
    { key: "cantiere", label: tr("Cantiere"), icon: HardHat },
    { key: "libero", label: tr("Libero"), icon: PencilLine },
  ];

  // Riepilogo del trasportatore mostrato quando la sezione dettagli è chiusa.
  const vettoreSummary =
    vettoreTipo === "subappaltatore"
      ? subappaltatori.find((s) => s.id === vettoreSubId)?.ragione_sociale || tr("Subappaltatore")
      : vettoreTipo === "terzo"
        ? vettoreTerzoNome.trim() || tr("Vettore terzo")
        : tr("Mittente (azienda)");

  // Cosa manca per poter registrare (mostrato sopra il footer).
  const missingReason = !destinatarioValid
    ? tr("Scegli il destinatario")
    : !warehouseId
      ? tr("Scegli il magazzino di partenza")
      : erroreRighe;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!fixed !left-3 !right-3 !top-3 !bottom-[calc(5.25rem+env(safe-area-inset-bottom))] !flex !flex-col !w-auto !max-w-none !translate-x-0 !translate-y-0 gap-0 overflow-hidden p-0 sm:!left-[50%] sm:!right-auto sm:!top-[50%] sm:!bottom-auto sm:!w-full sm:!max-w-3xl sm:!max-h-[90svh] sm:!translate-x-[-50%] sm:!translate-y-[-50%]">
        <DialogHeader className="shrink-0 px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowUpFromLine className="h-5 w-5 text-primary" />
            {tr("Uscita merce")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {tr("Compili l'uscita e la registri. Il DDT lo crei dopo, come passo separato, dalla scheda Uscite (doppio controllo).")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4 space-y-3">
          {warehousesError && <Alert variant="destructive"><AlertDescription>{tr("Magazzini non disponibili.")} <Button variant="link" onClick={() => void refetchWarehouses()}>{tr("Riprova magazzini")}</Button></AlertDescription></Alert>}
          {/* 1 · Destinatario */}
          <section className="rounded-xl border bg-card p-3 sm:p-4 space-y-3">
            <StepHead n={1} label={tr("A chi esce la merce")} />
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
                  placeholder={tr("Cerca il cliente per nome o P.IVA…")}
                />
                <p className="text-[11px] text-muted-foreground">
                  {tr("I dati anagrafici del cliente vengono ripresi nel DDT (ragione sociale, P.IVA, indirizzo).")}
                </p>
              </div>
            )}

            {destTipo === "cantiere" && (
              <div className="space-y-1.5">
                <OrderSelectCombobox
                  companyId={companyId}
                  value={orderId}
                  onChange={handleOrderChange}
                  placeholder={tr("Cerca per codice, cliente o indirizzo cantiere…")}
                />
                {orderId && entries.length === 0 && proposedEntries.length > 0 && (
                  <p className="text-[11px] text-emerald-600">
                    {proposedEntries.length === 1 ? tr("{n} articolo prenotato disponibile. Aggiungili con il pulsante qui sotto.", { n: 1 }) : tr("{n} articoli prenotati disponibili. Aggiungili con il pulsante qui sotto.", { n: proposedEntries.length })}
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
                    placeholder={tr("Ragione sociale / nominativo destinatario *")}
                    maxLength={160}
                  />
                </div>
                <CampoIndirizzo
                  aria-label={tr("Indirizzo del destinatario")}
                  value={liberoIndirizzo}
                  onChange={setLiberoIndirizzo}
                  placeholder={tr("Indirizzo (via, città)")}
                  maxLength={200}
                />
                <Input
                  value={liberoPiva}
                  onChange={(e) => setLiberoPiva(e.target.value)}
                  placeholder={tr("P.IVA / CF (opzionale)")}
                  maxLength={20}
                />
              </div>
            )}
          </section>

          {/* 2 · Magazzino sorgente */}
          <section className="rounded-xl border bg-card p-3 sm:p-4 space-y-2">
            <StepHead n={2} label={tr("Da quale magazzino")} />
            {warehousesLoading ? (
              <div className="h-10 border rounded-md flex items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                {tr("Caricamento...")}
              </div>
            ) : warehouses.length === 0 ? (
              <Alert>
                <AlertDescription className="text-xs">
                  {tr("Nessun magazzino attivo. Crea un magazzino da Magazzino → Impostazioni.")}
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={warehouseId} onValueChange={setWarehouseId} disabled={entries.length > 0}>
                <SelectTrigger id="um-warehouse">
                  <SelectValue placeholder={tr("Scegli un magazzino...")} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <div className="flex items-center gap-2">
                        {w.name}
                        {w.is_default && (
                          <span className="text-[9px] uppercase bg-muted px-1.5 py-0.5 rounded">{tr("default")}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </section>

          {entries.length > 0 && <p className="text-xs text-muted-foreground">{tr("Per cambiare magazzino, rimuovi prima gli articoli selezionati: le giacenze e i seriali appartengono al magazzino di partenza.")}</p>}

          {/* 3 · Articoli */}
          <section className="rounded-xl border bg-card p-3 sm:p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <StepHead n={3} label={tr("Cosa esce")} />
              {entries.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {entries.length === 1 ? tr("{n} articolo", { n: 1 }) : tr("{n} articoli", { n: entries.length })}
                </span>
              )}
            </div>
            {destTipo === "cantiere" && entries.length === 0 && proposedEntries.length > 0 && <Button variant="outline" size="sm" onClick={handleApplyOrderPrefill}>{tr("Proponi materiali prenotati")}</Button>}
            {prefillError && <p role="alert" className="text-xs text-destructive">{tr("Non è stato possibile leggere i materiali della commessa. Puoi cercare gli articoli manualmente.")}</p>}
            <ManualArticleAdder
              key={`${companyId}:${warehouseId}`}
              mode="scarico"
              availabilityOverrides={availableForOrder}
              companyId={companyId}
              warehouseId={warehouseId}
              entries={entries}
              onEntriesChange={setEntries}
            />
            {isMobile ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("scan")}
                disabled={!warehouseId}
                className="w-full h-11 gap-2"
              >
                <Camera className="h-4 w-4" />
                {tr("Scansiona codici a barre")}
              </Button>
            ) : (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Camera className="h-3.5 w-3.5 shrink-0" />
                {tr("Scansione disponibile da telefono o tablet. Da computer aggiungi gli articoli a mano qui sopra.")}
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {isMobile ? tr("Articoli serializzati (codice univoco per pezzo, es. pannelli FV): aggiungi i seriali nella riga dell'articolo, oppure scansionali.") : tr("Articoli serializzati (codice univoco per pezzo, es. pannelli FV): aggiungi i seriali nella riga dell'articolo.")}
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
                <span className="block text-sm font-semibold">{tr("Trasportatore e note")}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {vettoreSummary}
                  {note.trim() ? ` ${tr("· nota presente")}` : ""}
                  {orderContract?.subappaltatore_id && vettoreTipo === "subappaltatore" && !vettoreManuallyChanged ? ` ${tr("· auto")}` : ""}
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
            </button>

            {detailsOpen && (
              <div className="space-y-3 border-t px-3 py-3 sm:px-4">
                {/* Trasportatore */}
                <div className="space-y-2">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tr("Trasportatore")}</Label>
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
                        {t === "mittente" && tr("Mittente")}
                        {t === "subappaltatore" && tr("Subappalto")}
                        {t === "terzo" && tr("Terzo")}
                      </button>
                    ))}
                  </div>
                  {vettoreTipo === "subappaltatore" && (
                    <Select value={vettoreSubId} onValueChange={(v) => { setVettoreSubId(v); setVettoreManuallyChanged(true); }}>
                      <SelectTrigger>
                        <SelectValue placeholder={subappaltatori.length ? tr("Scegli subappaltatore dal registro") : tr("Nessun subappaltatore attivo")} />
                      </SelectTrigger>
                      <SelectContent>
                        {subappaltatori.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="font-medium">{s.ragione_sociale}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {s.piva ? `P.IVA ${s.piva}` : <span className="text-amber-600">{tr("⚠ P.IVA mancante")}</span>}
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
                        <Input value={vettoreTerzoNome} onChange={(e) => setVettoreTerzoNome(e.target.value)} placeholder={tr("Ragione sociale vettore terzo")} maxLength={120} />
                      </div>
                      <Input value={vettoreTerzoPiva} onChange={(e) => setVettoreTerzoPiva(e.target.value)} placeholder="P.IVA" maxLength={20} />
                      <CampoIndirizzo aria-label={tr("Sede legale del vettore")} value={vettoreTerzoIndirizzo} onChange={setVettoreTerzoIndirizzo} placeholder={tr("Sede legale (via, città)")} maxLength={200} />
                    </div>
                  )}
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <Label htmlFor="um-note" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tr("Note interne")}</Label>
                  <Input id="um-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("Note interne sull'uscita…")} maxLength={300} />
                </div>
              </div>
            )}
          </section>

          {outcomeUnknown && <Alert variant="destructive"><AlertDescription>{tr("Esito da verificare: controlla la scheda Uscite prima di registrare nuovamente il prelievo.")}</AlertDescription></Alert>}
          <Alert>
            <PackageCheck className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {tr("Registri l'uscita (scarico merce + giacenza). Subito dopo ti proponiamo il DDT con causale e dati di trasporto: puoi crearlo lì o più tardi dalla scheda Uscite.")}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="shrink-0 border-t p-3 bg-card flex-col gap-2">
          {missingReason && (
            <p className="w-full text-center text-[11px] text-muted-foreground">
              {tr("Per registrare manca:")} <strong className="text-foreground">{missingReason}</strong>
            </p>
          )}
          <div className="flex w-full gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 h-11">
              {tr("Annulla")}
            </Button>
            <Button
              onClick={requestReview}
              disabled={!canRegister || register.isPending}
              className="flex-[2] h-11 gap-2"
            >
              {register.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tr("Registrazione…")}
                </>
              ) : (
                <>
                  {tr("Controlla prelievo")}{entries.length ? ` (${entries.length})` : ""}
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
