import { RICERCA_BARRA } from "@/components/orders/TestataScheda";
import { formattaQuantitaMovimento } from "@/lib/magazzino/quantitaMovimento";
import { useEffect, useRef, useState, useMemo, useCallback, memo, lazy, Suspense, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { queryKeys } from "@/lib/queryKeys";
import { readAllOrderRows } from "@/lib/orders/listScope";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useWarehouses } from "@/hooks/useWarehouses";
import { toast } from "sonner";
import { Plus, Pencil, ArrowUpCircle, ArrowDownCircle, Search, AlertTriangle, History, CheckSquare, Filter, MoveRight, X, GripVertical, ClipboardCheck, ChevronLeft, ChevronRight, ScanLine, Package, MoreVertical, MapPin, Barcode, Trash2, Loader2, Columns3, Upload, Download, CalendarClock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { exportToCSV } from "@/lib/csvExport";
import { formatCurrency } from "@/lib/formatters";
import { logger } from "@/utils/logger";
import { StockItemDialog } from "./StockItemDialog";
import { StockMovementDialog } from "./StockMovementDialog";
import { StockMovementHistoryDialog } from "./StockMovementHistoryDialog";
import { WarehouseSectionsManager } from "./WarehouseSectionsManager";
import { WarehouseMapView } from "./WarehouseMapView";
import { StockUnitsDrilldownSheet } from "./StockUnitsDrilldownSheet";

import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useScopedStorage } from "@/hooks/warehouse/useScopedStorage";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { useWarehouseSections } from "@/hooks/useWarehouseSections";
import InventoryAuditDialog from "./InventoryAuditDialog";
import { filtraInventario, INVENTORY_FILTER_LABELS, type InventoryFilter } from "@/lib/magazzino/filtriInventario";
import { isSottoScorta, type StockItem } from "@/types/warehouse";
import { useMagazzinoInArrivo, type InArrivoArticolo } from "@/hooks/useMagazzinoRiepilogo";
import { cn } from "@/lib/utils";
import { eArticoloAZero, separaArticoliAZero, CHIAVE_MOSTRA_A_ZERO } from "@/lib/magazzino/articoliAZero";
import { conteggioVerificato, valutaEliminazione } from "@/lib/magazzino/eliminazioneArticolo";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

// Scanner QR: lazy per non gonfiare il bundle iniziale (@zxing/library ~500KB).
const BatchBarcodeScanner = lazy(() =>
  import("./BatchBarcodeScanner").then((m) => ({ default: m.BatchBarcodeScanner })),
);
const CaricoRapidoSheet = lazy(() =>
  import("./CaricoRapidoSheet").then((m) => ({ default: m.CaricoRapidoSheet })),
);
const OdaReceiveSheet = lazy(() =>
  import("./OdaReceiveSheet").then((m) => ({ default: m.OdaReceiveSheet })),
);
// Uscita merce a 2 fasi (registra uscita → poi DDT separato). Sostituisce il
// vecchio ScaricoCantiereSheet (scarico+DDT atomico) come flusso "uscita merce".
const UscitaMerceSheet = lazy(() =>
  import("./UscitaMerceSheet").then((m) => ({ default: m.UscitaMerceSheet })),
);

const ArticoliCSVImportDialog = lazy(() => import("./ArticoliCSVImportDialog").then((m) => ({ default: m.ArticoliCSVImportDialog })));
const ReserveStockDialog = lazy(() => import("./ReserveStockDialog").then((m) => ({ default: m.ReserveStockDialog })));
const EMPTY_STOCK: StockItem[] = [];
const OPTIONAL_COLUMNS = [
  { key: "code", label: "Codice" },
  { key: "unit", label: "Unità" },
  { key: "zone", label: "Zona" },
  { key: "incoming", label: "In arrivo" },
  { key: "unit_cost", label: "Costo unitario", costs: true },
  { key: "total_value", label: "Valore totale", costs: true },
  { key: "supplier", label: "Fornitore" },
  { key: "threshold", label: "Scorta minima" },
] as const;
type OptionalColumn = typeof OPTIONAL_COLUMNS[number]["key"];
/** 26/11/2026: una riga per articolo con i riferimenti in colonna (prima nome, unità e descrizione
 *  andavano a capo nella stessa cella e le colonne utili partivano spente). */
const DEFAULT_COLUMNS: OptionalColumn[] = ["code", "zone", "incoming", "total_value", "supplier"];
const decodeColumns = (raw: string): OptionalColumn[] => {
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((key): key is OptionalColumn => OPTIONAL_COLUMNS.some((c) => c.key === key)) : [];
};

interface WarehouseStockTabProps {
  warehouseFilter?: string | null;
  warehouseSelect?: ReactNode;
  primaryActions?: ReactNode;
  additionalMenuItems?: ReactNode;
  onReorder?: () => void;
  onRegisterArrival?: (item?: StockItem) => void;
  actionRequest?: {
    type: "receive" | "ship";
    item?: StockItem;
    nonce: number;
  } | null;
  readOnly?: boolean;
  showMovementActions?: boolean;
  onActionHandled?: () => void;
  metricFilter?: InventoryFilter;
  onMetricFilterChange?: (filter: InventoryFilter) => void;
}

export default function WarehouseStockTab({ warehouseFilter = null, actionRequest = null, readOnly: readOnlyProp = false, showMovementActions = true, onActionHandled, metricFilter = "all", onMetricFilterChange, warehouseSelect, primaryActions, additionalMenuItems, onReorder, onRegisterArrival }: WarehouseStockTabProps) {
  const t = useT();
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();
  const readOnly = readOnlyProp || permissions.isLoading || !permissions.canEditWarehouse;
  const canViewCosts = !permissions.isLoading && permissions.canViewCosts;
  const assertWritable = () => { if (readOnly) throw new Error(t("Il magazzino è in sola lettura.")); };
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const { defaultWarehouse, warehouses: knownWarehouses = [] } = useWarehouses(true);
  const resolveWarehouseId = (item?: StockItem | null) =>
    item?.warehouse_id ?? warehouseFilter ?? defaultWarehouse?.id ?? null;

  const [tableContainer, setTableContainer] = useState<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Gli articoli a zero restano fuori finché non si chiedono; la scelta resta ricordata.
  const [mostraAZero, setMostraAZero] = useState(() => {
    try { return localStorage.getItem(CHIAVE_MOSTRA_A_ZERO) === "1"; } catch { return false; }
  });
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [lottoFilter, setLottoFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  // la giacenza già rettificata da un salvataggio andato a metà: riprovando si
  // confronta con lei, non con quella mostrata all'apertura (altrimenti «è
  // cambiata nel frattempo» — l'aveva cambiata lo stesso utente)
  const rettificata = useRef<{ id: string; quantita: number } | null>(null);
  useEffect(() => { rettificata.current = null; }, [editingItem?.id]);
  const [movementDialog, setMovementDialog] = useState<{
    open: boolean;
    type: "carico" | "scarico";
    item: StockItem | null;
  }>({ open: false, type: "carico", item: null });
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [taskItem, setTaskItem] = useState<StockItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchTargetSection, setBatchTargetSection] = useState<string>("");
  const [draggingItem, setDraggingItem] = useState<StockItem | null>(null);
  const [auditItem, setAuditItem] = useState<StockItem | null>(null);
  // Seriali (stock_units): drill-down per singolo articolo serializzato oppure
  // su tutto il magazzino. `null` = Sheet chiuso.
  const [serialsView, setSerialsView] = useState<
    { mode: "all" } | { mode: "item"; item: StockItem } | null
  >(null);
  // Quick scan integration: filter+toast invece di highlight visivo
  // (più semplice e già feedback chiaro tramite searchQuery + toast).
  const [quickScanOpen, setQuickScanOpen] = useState(false);
  /** Barcode pre-compilato quando l'utente arriva da Quick Scan no-match. */
  const [prefillBarcodeForDialog, setPrefillBarcodeForDialog] = useState<string | undefined>();
  // Carico rapido + ODA Reverse (MP2 P1a) + Uscita merce 2 fasi (MP3 P1b)
  const [caricoOpen, setCaricoOpen] = useState(false);
  const [caricoItem, setCaricoItem] = useState<StockItem | undefined>();
  const [reservation, setReservation] = useState<{ item?: StockItem } | null>(null);
  const [odaReceiveOpen, setOdaReceiveOpen] = useState(false);
  const [uscitaOpen, setUscitaOpen] = useState(false);
  const [uscitaItem, setUscitaItem] = useState<StockItem | undefined>();
  const [zonesDialogOpen, setZonesDialogOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const toolsTriggerRef = useRef<HTMLButtonElement>(null);
  const [optionalColumns, setOptionalColumns] = useScopedStorage<OptionalColumn[]>(
    companyId ? `warehouse-columns:v3:${companyId}:${user?.id ?? "current"}` : null,
    DEFAULT_COLUMNS,
    decodeColumns,
  );
  const activeFilterCount = Number(metricFilter !== "all") + Number(sectionFilter !== "all") + Number(lottoFilter !== "all");

  const requestKey = actionRequest ? `${actionRequest.type}:${actionRequest.nonce}` : null;
  const [handledRequestKey, setHandledRequestKey] = useState<string | null>(null);
  if (requestKey !== handledRequestKey) {
    setHandledRequestKey(requestKey);
    if (!readOnly && actionRequest?.type === "receive") { setCaricoItem(actionRequest.item); setCaricoOpen(true); }
    if (!readOnly && actionRequest?.type === "ship") setUscitaOpen(true);
  }

  useEffect(() => {
    if (requestKey && requestKey === handledRequestKey) onActionHandled?.();
  }, [requestKey, handledRequestKey, onActionHandled]);

  // DnD sensors — require 8px movement before activating to avoid interfering with clicks
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Fetch stock items
  const { data: stockItems = EMPTY_STOCK, isLoading, isError, refetch } = useQuery({
    queryKey: [...queryKeys.warehouse.stock(companyId), warehouseFilter],
    queryFn: async () => {
      if (!companyId) return [];
      // tutte le pagine: con un .select() solo l'elenco si fermava a mille articoli
      return readAllOrderRows<StockItem>((da, a) => {
        let q = supabase
          .from("warehouse_stock")
          .select("*")
          .eq("company_id", companyId)
          .order("name")
          .order("id");
        if (warehouseFilter) {
          q = q.eq("warehouse_id", warehouseFilter);
        }
        return q.range(da, a) as unknown as PromiseLike<{ data: StockItem[] | null; error: unknown }>;
      });
    },
    enabled: !!companyId,
  });

  // per ogni articolo, quanto è negli ordini fornitore aperti
  const { data: inArrivo, isError: arriviError, isLoading: arriviLoading, refetch: refetchArrivi } = useMagazzinoInArrivo();

  // ── Eliminazione articolo ──────────────────────────────────────────────
  // Non esisteva: un articolo censito per sbaglio restava in elenco per sempre.
  // Si elimina solo un articolo davvero vuoto e mai movimentato; in tutti gli
  // altri casi si dice il perché invece di far arrivare l'errore del vincolo.
  const [daEliminare, setDaEliminare] = useState<StockItem | null>(null);
  const [verificaEliminazione, setVerificaEliminazione] = useState<
    { eliminabile: boolean; motivo: string } | null
  >(null);
  const [verificaInCorso, setVerificaInCorso] = useState(false);
  const verificaRichiesta = useRef(0);

  const chiediEliminazione = useCallback(async (item: StockItem) => {
    if (readOnly) return;
    const richiesta = ++verificaRichiesta.current;
    setDaEliminare(item);
    setVerificaEliminazione(null);
    setVerificaInCorso(true);
    try {
      const [mov, unita, lotti, trasf] = await Promise.all([
        supabase.from("warehouse_movements").select("id", { count: "exact", head: true }).eq("stock_item_id", item.id),
        supabase.from("stock_units").select("id", { count: "exact", head: true }).eq("stock_item_id", item.id),
        supabase.from("stock_lotti").select("id", { count: "exact", head: true }).eq("stock_item_id", item.id),
        supabase.from("warehouse_transfer_items").select("id", { count: "exact", head: true }).eq("stock_item_id", item.id),
      ]);
      if (richiesta !== verificaRichiesta.current) return;
      setVerificaEliminazione(
        valutaEliminazione({
          quantity: Number(item.quantity ?? 0),
          quantity_reserved: Number(item.quantity_reserved ?? 0),
          movimenti: conteggioVerificato(mov),
          seriali: conteggioVerificato(unita),
          lotti: conteggioVerificato(lotti),
          trasferimenti: conteggioVerificato(trasf),
        }),
      );
    } catch (err) {
      if (richiesta !== verificaRichiesta.current) return;
      logger.error("Verifica eliminazione articolo fallita:", err);
      // Non si indovina: se il controllo non è andato a buon fine non si
      // elimina, perché non sappiamo cosa ci sia attaccato.
      setVerificaEliminazione({
        eliminabile: false,
        motivo: t("Non sono riuscito a controllare cosa è collegato a questo articolo. Riprova."),
      });
    } finally {
      if (richiesta === verificaRichiesta.current) setVerificaInCorso(false);
    }
  }, [readOnly, t]);

  const eliminaArticolo = useMutation({
    mutationFn: async (item: StockItem) => {
      assertWritable();
      if (daEliminare?.id !== item.id || !verificaEliminazione?.eliminabile || verificaInCorso) throw new Error(t("Verifica l’articolo prima di eliminarlo."));
      const { error } = await supabase
        .from("warehouse_stock")
        .delete()
        .eq("id", item.id)
        .eq("company_id", companyId!)
        .eq("quantity", item.quantity)
        .eq("quantity_reserved", item.quantity_reserved ?? 0)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Articolo eliminato"));
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.stock(companyId) });
      setDaEliminare(null);
      setVerificaEliminazione(null);
    },
    onError: (err: Error) => toast.error(t("Eliminazione non riuscita"), { description: err.message }),
  });

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: queryKeys.suppliers.list(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
  });

  // O(1) lookup map fornitori: evita una .find() lineare per ogni riga ad ogni
  // render (fino a 50 righe paginate × desktop+mobile). Comportamento identico.
  const supplierNameById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers]
  );
  const getSupplierName = (id: string | null) =>
    !id ? "—" : (supplierNameById.get(id) || "—");

  // Conteggio seriali (stock_units) della company — alimenta il bottone "Seriali".
  // Coerente con StockUnitsDrilldownSheet, che filtra per company (non per magazzino).
  const { data: serialCount = 0 } = useQuery({
    queryKey: ["warehouse-stock-serial-count", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("stock_units")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const hasSerialized = useMemo(
    () => serialCount > 0 || stockItems.some((i) => i.tracking_mode === "serialized"),
    [serialCount, stockItems],
  );

  // Lotti della company → filtro "per lotto" in Inventario (mostra la merce
  // collegata al lotto scelto). stock_lotti non è nei tipi generati.
  const { data: lotti = [] } = useQuery({
    queryKey: ["warehouse-stock-lotti-filter", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb
        .from("stock_lotti")
        .select("id, codice_lotto, articolo, stock_item_id")
        .eq("company_id", companyId!)
        .order("codice_lotto")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; codice_lotto: string; articolo: string | null; stock_item_id: string | null;
      }>;
    },
  });
  const lottoStockItemId = useMemo(
    () => (lottoFilter === "all" ? null : lotti.find((l) => l.id === lottoFilter)?.stock_item_id ?? null),
    [lotti, lottoFilter],
  );
  const hasLotti = lotti.length > 0;

  const { sections } = useWarehouseSections();
  // La colonna del magazzino serve solo se se ne guardano più d'uno insieme.
  const mostraMagazzino = !warehouseFilter && knownWarehouses.length > 1;
  const hasVisibleOptionalColumns = OPTIONAL_COLUMNS.some((c) => optionalColumns.includes(c.key) && (!("costs" in c) || canViewCosts) && (c.key !== "zone" || sections.length > 0));
  // O(1) lookup map sezioni (stesso motivo di supplierNameById). Restituisce
  // l'intero oggetto sezione come prima (consumato per name + color).
  const sectionById = useMemo(
    () => new Map(sections.map((s) => [s.id, s])),
    [sections]
  );
  const getSectionName = (id: string | null) => {
    if (!id) return null;
    return sectionById.get(id) || null;
  };

  // Helper to insert a company_cost record
  const insertCostRecord = async (itemName: string, unitCost: number, qty: number, vatRate: number, supplierId?: string, costPaidDate?: string, costCategory?: string) => {
    if (!companyId) return;
    const totalAmount = unitCost * qty;
    if (totalAmount <= 0) return;
    const { error } = await supabase.from("company_costs").insert({
      company_id: companyId,
      name: `${itemName} (acquisto magazzino)`,
      cost_type: "variable",
      amount: totalAmount,
      vat_rate: vatRate,
      supplier_id: supplierId || null,
      due_date: costPaidDate || new Date().toISOString().slice(0, 10),
      is_paid: true,
      paid_date: costPaidDate || new Date().toISOString().slice(0, 10),
      category: costCategory || "Magazzino",
      recurrence: "once",
    });
    if (error) logger.error("Error inserting cost:", error);
  };

  // Create/update stock item
  const saveMutation = useMutation({
    mutationFn: async (data: {
      id?: string;
      name: string;
      description?: string;
      quantity: number;
      unit_cost: number;
      unita_misura?: string;
      vat_rate: number;
      supplier_id?: string;
      section_id?: string;
      min_stock_level: number;
      // ── QR system (MP1 P0) ──────────────────────────────
      barcode?: string | null;
      internal_code?: string | null;
      tracking_mode?: "fungible" | "serialized";
      requires_warranty?: boolean;
      default_warranty_months?: number | null;
      // ── Cost registration ────────────────────────────────
      registerCost?: boolean;
      costPaidDate?: string;
      costCategory?: string;
    }) => {
      assertWritable();
      // Campi QR sono opzionali nello payload UPDATE: se undefined → non li tocca.
      // Se sono ESPLICITAMENTE presenti (anche null) → vanno scritti.
      const qrUpdate: Record<string, unknown> = {};
      if ("barcode" in data) qrUpdate.barcode = data.barcode ?? null;
      if ("internal_code" in data) qrUpdate.internal_code = data.internal_code ?? null;
      if ("tracking_mode" in data && data.tracking_mode) qrUpdate.tracking_mode = data.tracking_mode;
      if ("requires_warranty" in data) qrUpdate.requires_warranty = !!data.requires_warranty;
      if ("default_warranty_months" in data) {
        qrUpdate.default_warranty_months = data.default_warranty_months ?? null;
      }

      if (data.id) {
        const currentItem = stockItems.find((i) => i.id === data.id);
        // La giacenza NON si scrive qui: prima il modulo riscriveva la quantità
        // digitata (senza movimento), e un carico o uno scarico fatto mentre era
        // aperto spariva. Se è cambiata diventa una rettifica registrata.
        //
        // Il confronto è con la giacenza che il modulo MOSTRAVA all'apertura
        // (editingItem), non con l'elenco: l'elenco si aggiorna mentre il
        // modulo è aperto, e confrontando con lui lo scarico di un collega
        // sarebbe stato annullato in silenzio. E la rettifica va per prima: se
        // si ferma perché la giacenza è cambiata, non si salva niente a metà.
        const vista = rettificata.current?.id === data.id
          ? rettificata.current.quantita
          : Number(editingItem?.id === data.id ? editingItem.quantity : currentItem?.quantity ?? 0);
        let giacenzaRettificata = false;
        if (Number(data.quantity) !== vista) {
          const { error: errRettifica } = await supabase.rpc("warehouse_rettifica_giacenza" as never, {
            p_stock_item_id: data.id,
            p_quantita_contata: Number(data.quantity),
            p_quantita_vista: vista,
            p_note: "dalla scheda articolo",
          } as never);
          if (errRettifica) throw errRettifica;
          rettificata.current = { id: data.id, quantita: Number(data.quantity) };
          giacenzaRettificata = true;
        }

        const { error } = await supabase
          .from("warehouse_stock")
          .update({
            name: data.name,
            description: data.description || null,
            warehouse_id: resolveWarehouseId(currentItem),
            ...(canViewCosts ? { unit_cost: data.unit_cost, vat_rate: data.vat_rate } : {}),
            supplier_id: data.supplier_id || null,
            section_id: data.section_id || null,
            min_stock_level: data.min_stock_level,
            ...qrUpdate,
          })
          .eq("id", data.id)
          .eq("company_id", companyId!);
        if (error) {
          // la rettifica è già scritta (col suo movimento): dirlo, non «non salvato»
          if (giacenzaRettificata) throw new Error(t("La giacenza è salvata ({quantita}), il resto no: {errore}", { quantita: Number(data.quantity), errore: error.message }));
          throw error;
        }
      } else {
        // l'articolo nasce a zero e la giacenza iniziale entra come movimento:
        // una giacenza senza movimenti non torna mai con lo storico
        const { data: creato, error } = await supabase.from("warehouse_stock").insert({
          company_id: companyId!,
          warehouse_id: resolveWarehouseId(),
          name: data.name,
          description: data.description || null,
          quantity: 0,
          unita_misura: data.unita_misura || "pz",
          unit_cost: data.unit_cost,
          vat_rate: data.vat_rate,
          supplier_id: data.supplier_id || null,
          section_id: data.section_id || null,
          min_stock_level: data.min_stock_level,
          ...qrUpdate,
        }).select("id").single();
        if (error) throw error;

        if (Number(data.quantity) > 0) {
          const { error: errIniziale } = await supabase.rpc("warehouse_rettifica_giacenza" as never, {
            p_stock_item_id: (creato as { id: string }).id,
            p_quantita_contata: Number(data.quantity),
            p_quantita_vista: 0,
            p_note: "giacenza iniziale",
          } as never);
          if (errIniziale) {
            // un articolo a zero con la giacenza persa sarebbe peggio di nessun
            // articolo: si toglie, e riprovando non nasce un doppione
            await supabase.from("warehouse_stock").delete().eq("id", (creato as { id: string }).id).eq("company_id", companyId!);
            throw errIniziale;
          }
        }

        if (canViewCosts && data.registerCost) {
          await insertCostRecord(data.name, data.unit_cost, data.quantity, data.vat_rate, data.supplier_id, data.costPaidDate, data.costCategory);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.costs.list(companyId) });
      setDialogOpen(false);
      setEditingItem(null);
      toast.success(t("Salvato"), { description: t("Articolo di magazzino salvato.") });
    },
    onError: (e: unknown) => {
      // il motivo conta: «la giacenza è cambiata nel frattempo» va letto, non nascosto
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      const motivo = (e as { message?: string })?.message;
      toast.error(t("Articolo non salvato"), { description: motivo || t("Riprova.") });
    },
  });

  // Movement mutation
  const movementMutation = useMutation({
    mutationFn: async ({
      stockItemId, type, quantity, notes, registerCost, costPaidDate, costCategory, orderId,
    }: {
      stockItemId: string;
      type: "carico" | "scarico";
      quantity: number;
      notes?: string;
      registerCost?: boolean;
      costPaidDate?: string;
      costCategory?: string;
      orderId?: string | null;
    }) => {
      assertWritable();
      // Prima qui si leggeva la giacenza dalla cache di React Query, si faceva
      // la sottrazione in JavaScript e si riscriveva il valore assoluto. Due
      // magazzinieri che scaricavano insieme leggevano lo stesso numero di
      // partenza e scrivevano lo stesso risultato: una delle due uscite spariva
      // dalla giacenza pur restando nello storico, senza un errore a schermo.
      // E il `Math.max(0, …)` trasformava ogni sconfinamento in uno zero muto.
      //
      // La funzione sul database blocca la riga, rifiuta lo scarico che non ha
      // copertura dicendo quanto c'è davvero, aggiorna sommando invece di
      // riscrivere, e registra il movimento nella stessa transazione.
      const { error: movError } = await supabase.rpc("warehouse_movimento_rapido", {
        p_stock_item_id: stockItemId,
        p_tipo: type,
        p_quantita: quantity,
        p_note: notes || null,
        p_order_id: orderId ?? null,
      } as never);
      if (movError) throw movError;

      // Serve solo il nome, per la guardia sul doppio costo qui sotto: la
      // quantità non la calcoliamo più noi.
      const currentItem = stockItems.find((i) => i.id === stockItemId);
      if (!currentItem) throw new Error(t("Articolo non trovato"));

      if (canViewCosts && registerCost && type === "carico") {
        // Guardia anti doppio costo (2026-08-06). Se questa merce sta arrivando
        // da un ordine d'acquisto, il costo lo genera gia' l'OdA quando passa a
        // "ricevuto": registrarlo anche qui conterebbe due volte la stessa
        // spesa, in due punti del prodotto che non si parlano.
        // Non blocco — segnalo e lascio decidere: potrebbe essere un acquisto
        // davvero separato dallo stesso fornitore.
        const { data: odaAperti } = await supabase
          .from("purchase_order_items")
          .select("purchase_orders!inner(oda_number, status, supplier_id)")
          .eq("company_id", companyId!)
          .ilike("description", currentItem.name)
          .in("purchase_orders.status", ["inviato", "confermato", "parziale"])
          .limit(1);

        if (odaAperti && odaAperti.length > 0) {
          const oda = (odaAperti[0] as unknown as { purchase_orders?: { oda_number?: string } }).purchase_orders;
          toast.warning(t("Costo non registrato: c'è un ordine aperto"), {
            description: t("\"{nome}\" è su {oda} ancora aperto. Il costo verrà creato da quell'ordine quando lo segni ricevuto, così non viene contato due volte.", { nome: currentItem.name, oda: oda?.oda_number ?? t("un OdA") }),
            duration: 9000,
          });
        } else {
          await insertCostRecord(currentItem.name, currentItem.unit_cost, quantity, currentItem.vat_rate ?? 22, currentItem.supplier_id || undefined, costPaidDate, costCategory);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.costs.list(companyId) });
      setMovementDialog({ open: false, type: "carico", item: null });
      toast.success(t("Movimento registrato"));
    },
    onError: (e: unknown) => {
      // «Giacenza insufficiente…: disponibili N» va letto, non coperto da un messaggio generico
      const motivo = (e as { message?: string })?.message;
      toast.error(t("Movimento non registrato"), { description: motivo || t("Riprova.") });
    },
  });

  // Batch move mutation
  const batchMoveMutation = useMutation({
    mutationFn: async ({ ids, sectionId }: { ids: string[]; sectionId: string | null }) => {
      assertWritable();
      const { data, error } = await supabase
        .from("warehouse_stock")
        .update({ section_id: sectionId })
        .in("id", ids)
        .eq("company_id", companyId!)
        .select("id");
      if (error) throw error;
      if ((data?.length ?? 0) !== ids.length) throw new Error(t("Aggiornati {n} di {totale} articoli. Verifica i permessi e aggiorna l’elenco.", { n: data?.length ?? 0, totale: ids.length }));
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
      const count = variables.ids.length;
      setSelectedIds(new Set());
      setBatchTargetSection("");
      toast.success(t("Articoli spostati"), { description: `${count} articol${count === 1 ? "o" : "i"} aggiornat${count === 1 ? "o" : "i"}.` });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
      toast.error(t("Spostamento non completato"), { description: error.message });
    },
  });

  const tuttiFiltrati = useMemo(() => {
    let items = filtraInventario(stockItems, metricFilter, inArrivo);
    if (sectionFilter !== "all") {
      if (sectionFilter === "none") {
        items = items.filter((i) => !i.section_id);
      } else {
        items = items.filter((i) => i.section_id === sectionFilter);
      }
    }
    // Filtro lotto: mostra solo l'articolo collegato al lotto scelto.
    if (lottoFilter !== "all") {
      items = lottoStockItemId ? items.filter((i) => i.id === lottoStockItemId) : [];
    }
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.internal_code && item.internal_code.toLowerCase().includes(q)) ||
        (item.barcode && item.barcode.toLowerCase().includes(q))
    );
  }, [stockItems, searchQuery, sectionFilter, lottoFilter, lottoStockItemId, metricFilter, inArrivo]);

  // Chi cerca un nome o usa un filtro vuole vedere tutto ciò che corrisponde, zeri compresi
  // (anche per caricare un articolo finito).
  const nascondeAZero = !mostraAZero && !searchQuery && metricFilter === "all" && lottoFilter === "all";
  const { visibili: filtered, nascosti: aZeroNascosti } = useMemo(
    () => separaArticoliAZero(tuttiFiltrati, nascondeAZero, inArrivo),
    [tuttiFiltrati, nascondeAZero, inArrivo],
  );
  const cambiaMostraAZero = (valore: boolean) => {
    setMostraAZero(valore);
    setStockPage(0);
    try { localStorage.setItem(CHIAVE_MOSTRA_A_ZERO, valore ? "1" : "0"); } catch { /* resta per questa visita */ }
  };

  // Pagination for stock items
  const STOCK_PAGE_SIZE = 50;
  const [stockPage, setStockPage] = useState(0);
  const stockTotalPages = Math.max(1, Math.ceil(filtered.length / STOCK_PAGE_SIZE));
  const [previousMetricFilter, setPreviousMetricFilter] = useState(metricFilter);
  if (previousMetricFilter !== metricFilter) {
    setPreviousMetricFilter(metricFilter);
    setStockPage(0);
  }
  const paginatedItems = useMemo(
    () => filtered.slice(stockPage * STOCK_PAGE_SIZE, (stockPage + 1) * STOCK_PAGE_SIZE),
    [filtered, stockPage]
  );

  // Reset page when search/filter changes
  const setSearchQueryWithReset = useCallback((q: string) => { setSearchQuery(q); setStockPage(0); }, []);
  const setSectionFilterWithReset = useCallback((v: string) => { setSectionFilter(v); setStockPage(0); }, []);
  const setLottoFilterWithReset = useCallback((v: string) => { setLottoFilter(v); setStockPage(0); }, []);

  const clearInventoryFilters = () => {
    setSearchQueryWithReset(""); setSectionFilterWithReset("all"); setLottoFilterWithReset("all"); onMetricFilterChange?.("all");
  };

  const lowStockItems = useMemo(
    () => stockItems.filter(isSottoScorta),
    [stockItems]
  );

  const toggleSelect = useCallback((id: string) => {
    if (readOnly) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [readOnly]);

  // Il cambio di perimetro annulla la selezione prima che le righe siano utilizzabili.
  const selectionScope = useMemo(() => ({ companyId, warehouseFilter, searchQuery, sectionFilter, lottoFilter, stockPage, stockItems, readOnly, metricFilter }), [companyId, warehouseFilter, searchQuery, sectionFilter, lottoFilter, stockPage, stockItems, readOnly, metricFilter]);
  const [previousSelectionScope, setPreviousSelectionScope] = useState(selectionScope);
  if (previousSelectionScope !== selectionScope) {
    setPreviousSelectionScope(selectionScope);
    setSelectedIds(new Set());
    setBatchTargetSection("");
  }

  const visibleSelectedIds = paginatedItems.filter((item) => selectedIds.has(item.id)).map((item) => item.id);
  const allSelected = paginatedItems.length > 0 && paginatedItems.every((item) => selectedIds.has(item.id));

  const toggleSelectAll = useCallback(() => {
    if (readOnly) return;
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedItems.map((i) => i.id)));
    }
  }, [paginatedItems, allSelected, readOnly]);

  const exportRows = (onlySelected: boolean) => {
    if (isLoading || isError) return;
    const rows = onlySelected ? paginatedItems.filter((item) => selectedIds.has(item.id)) : filtered;
    exportToCSV(rows.map((item) => ({
      articolo: item.name, magazzino: knownWarehouses.find(w => w.id === item.warehouse_id)?.name ?? "", codice: item.internal_code ?? "", giacenza: String(item.quantity),
      impegnato: String(item.quantity_reserved ?? 0), disponibile: String(item.quantity_available ?? item.quantity),
      unita: item.unita_misura ?? "", zona: getSectionName(item.section_id)?.name ?? "",
      fornitore: getSupplierName(item.supplier_id), soglia: String(item.min_stock_level),
      ...(canViewCosts ? { costo: item.prezzo_da_definire ? "Da definire" : String(item.unit_cost) } : {}),
    })), [
      { key: "articolo", label: "Articolo" }, { key: "magazzino", label: "Magazzino" }, { key: "codice", label: "Codice" },
      { key: "giacenza", label: "Giacenza" }, { key: "impegnato", label: "Impegnato" },
      { key: "disponibile", label: "Disponibile" }, { key: "unita", label: "Unità" },
      { key: "zona", label: "Zona" }, { key: "fornitore", label: "Fornitore" }, { key: "soglia", label: "Scorta minima" },
      ...(canViewCosts ? [{ key: "costo", label: "Costo unitario" }] : []),
    ], "magazzino_elenco.csv");
  };

  const handleBatchMove = () => {
    if (readOnly || !batchTargetSection || visibleSelectedIds.length === 0) return;
    batchMoveMutation.mutate({
      ids: visibleSelectedIds,
      sectionId: batchTargetSection === "__none__" ? null : batchTargetSection,
    });
  };

  // --- DnD handlers ---
  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (readOnly) return;
    const itemId = event.active.data.current?.itemId as string | undefined;
    if (itemId) {
      const item = stockItems.find((i) => i.id === itemId) || null;
      setDraggingItem(item);
    }
  }, [readOnly, stockItems]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggingItem(null);
    if (readOnly) return;
    const { active, over } = event;
    if (!over) return;

    const sectionId = over.data.current?.sectionId as string | undefined;
    if (!sectionId) return;

    const itemId = active.data.current?.itemId as string | undefined;
    if (!itemId) return;

    // Determine which IDs to move: if the dragged item is part of selection, move all selected
    const idsToMove = selectedIds.has(itemId) && selectedIds.size > 1
      ? visibleSelectedIds
      : [itemId];

    const resolvedSectionId = sectionId === "__none__" ? null : sectionId;

    batchMoveMutation.mutate({ ids: idsToMove, sectionId: resolvedSectionId });
  }, [readOnly, selectedIds, visibleSelectedIds, batchMoveMutation]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        {arriviError && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>{t("Arrivi non disponibili")}</AlertTitle><AlertDescription>{t("Le giacenze sono separate dagli ordini in arrivo, che non è stato possibile verificare.")} <Button variant="outline" size="sm" onClick={() => void refetchArrivi()}>{t("Riprova arrivi")}</Button></AlertDescription></Alert>}
        <Dialog open={!readOnly && zonesDialogOpen} onOpenChange={setZonesDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto p-0">
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle>{t("Zone e planimetria magazzino")}</DialogTitle>
              <DialogDescription>
                {t("Disegna la piantina, gestisci le aree operative e sposta gli articoli nelle zone corrette.")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 p-4">
              <WarehouseSectionsManager
                warehouseId={warehouseFilter ?? defaultWarehouse?.id ?? null}
                warehouseName={defaultWarehouse?.name ?? null}
              />
              {sections.length > 0 && (
                <WarehouseMapView
                  stockItems={stockItems}
                  sections={sections}
                  activeSectionFilter={sectionFilter}
                  onFilterSection={setSectionFilterWithReset}
                  droppable
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Barra senza riquadro attorno (25/11/2026): 32px invece di 54, come le schede di Commesse. */}
        <div aria-label={t("Strumenti giacenze")} role="region">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap">
            <div className={cn(RICERCA_BARRA, "col-span-2 max-sm:w-full")}>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input aria-label={t("Cerca articoli per nome o codice")} placeholder={t("Cerca per nome o codice...")} value={searchQuery} onChange={(e) => setSearchQueryWithReset(e.target.value)} className="h-8 pl-8 text-xs max-sm:h-11" />
            </div>
            {warehouseSelect && <div className="min-w-0 sm:w-auto">{warehouseSelect}</div>}
            <Button variant="outline" className="h-8 gap-1.5 px-2.5 text-xs max-sm:h-11 [&_svg]:h-3.5 [&_svg]:w-3.5" onClick={() => setFiltersOpen(true)} aria-label={activeFilterCount ? t(activeFilterCount === 1 ? "Filtri giacenze ({n} attivo)" : "Filtri giacenze ({n} attivi)", { n: activeFilterCount }) : t("Filtri giacenze")}><Filter className="h-4 w-4" />{t("Filtri")}{activeFilterCount > 0 && <Badge variant="secondary" className="px-1.5">{activeFilterCount}</Badge>}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" className="hidden h-8 gap-1.5 px-2.5 text-xs md:inline-flex" title={t("Colonne")}><Columns3 className="h-3.5 w-3.5" /><span className="max-2xl:sr-only">{t("Colonne")}</span></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("Colonne aggiuntive")}</DropdownMenuLabel>
                {OPTIONAL_COLUMNS.filter((c) => (!("costs" in c) || canViewCosts) && (c.key !== "zone" || sections.length > 0)).map((c) => <DropdownMenuCheckboxItem key={c.key} checked={optionalColumns.includes(c.key)} onSelect={(e) => e.preventDefault()} onCheckedChange={(checked) => setOptionalColumns((current) => checked ? [...current.filter((key) => key !== c.key), c.key] : current.filter((key) => key !== c.key))}>{t(c.label)}</DropdownMenuCheckboxItem>)}
                <DropdownMenuSeparator /><DropdownMenuItem onClick={() => setOptionalColumns([])}>{t("Ripristina colonne essenziali")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Il conteggio sta nella barra (26/11/2026): prima aveva una riga tutta sua. */}
            <p className="col-span-2 whitespace-nowrap text-xs text-muted-foreground tabular-nums sm:col-span-1" aria-live="polite">{isLoading ? t("Caricamento articoli…") : isError ? t("Elenco non disponibile") : `${filtered.length} ${filtered.length === 1 ? "articolo" : "articoli"}${searchQuery || activeFilterCount ? " trovati" : ""}`}</p>
            <div className="col-span-2 grid grid-cols-3 gap-2 sm:ml-auto sm:flex sm:flex-wrap sm:items-center">
              {primaryActions}
              {/* «Prenota» sta in «Altro» sotto i 1536px: le azioni restano su una riga con la ricerca. */}
              {!readOnly && permissions.canEditOrders && <Button variant="outline" className="h-8 gap-1.5 px-2.5 text-xs max-2xl:hidden" onClick={() => setReservation({})}>{t("Prenota")}</Button>}
              {!primaryActions && !readOnly && showMovementActions && <>
                <Button className="h-8 px-3 text-xs" onClick={() => { if (onRegisterArrival) onRegisterArrival(); else { setCaricoItem(undefined); setCaricoOpen(true); } }}>{t("Carica")}</Button>
                <Button className="h-8 px-2.5 text-xs" variant="outline" onClick={() => setUscitaOpen(true)}>{t("Preleva")}</Button>
              </>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button ref={toolsTriggerRef} variant="outline" className="h-8 gap-1.5 px-2.5 text-xs max-sm:h-11 [&_svg]:h-3.5 [&_svg]:w-3.5" aria-label={t("Altre azioni del magazzino")}><MoreVertical className="h-4 w-4" />{t("Altro")}</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-[75vh] w-64 overflow-y-auto">
                  {!readOnly && permissions.canEditOrders && <DropdownMenuItem className="2xl:hidden" onClick={() => setReservation({})}><CalendarClock className="mr-2 h-4 w-4" />{t("Prenota per una commessa")}</DropdownMenuItem>}
                  <DropdownMenuLabel>{t("Articoli e inventario")}</DropdownMenuLabel>
                  {!readOnly && <DropdownMenuItem onClick={() => { setEditingItem(null); setDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" />{t("Aggiungi articolo")}</DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => setQuickScanOpen(true)}><ScanLine className="mr-2 h-4 w-4" />{t("Cerca con QR / barcode")}</DropdownMenuItem>
                  {hasSerialized && <DropdownMenuItem onClick={() => setSerialsView({ mode: "all" })}><Barcode className="mr-2 h-4 w-4" />{t("Seriali azienda")}{serialCount > 0 ? ` (${serialCount})` : ""}</DropdownMenuItem>}
                  {!readOnly && <DropdownMenuItem onClick={() => setZonesDialogOpen(true)}><MapPin className="mr-2 h-4 w-4" />{t("Zone e planimetria")}</DropdownMenuItem>}
                  {!readOnly && <DropdownMenuItem onClick={() => setImportOpen(true)}><Upload className="mr-2 h-4 w-4" />{t("Importa CSV/XLSX")}</DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => exportRows(false)} disabled={isLoading || isError || filtered.length === 0}><Download className="mr-2 h-4 w-4" />{t("Esporta elenco filtrato")}</DropdownMenuItem>
                  {!readOnly && showMovementActions && <DropdownMenuItem onClick={() => setOdaReceiveOpen(true)}><Package className="mr-2 h-4 w-4" />{t("Ricevi da ordine fornitore")}</DropdownMenuItem>}
                  {additionalMenuItems && <><DropdownMenuSeparator />{additionalMenuItems}</>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent className="flex flex-col overflow-y-auto">
            <SheetHeader><SheetTitle>{t("Filtra le giacenze")}</SheetTitle><SheetDescription>{t("Restringi l’elenco per disponibilità, zona o lotto.")}</SheetDescription></SheetHeader>
            <div className="flex-1 space-y-5 py-5">
              {onMetricFilterChange && <div className="space-y-2"><Label htmlFor="stock-availability-filter">{t("Disponibilità")}</Label><Select value={metricFilter} onValueChange={(v) => { onMetricFilterChange(v as InventoryFilter); setStockPage(0); }}><SelectTrigger id="stock-availability-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("Tutti gli articoli")}</SelectItem>{Object.entries(INVENTORY_FILTER_LABELS).filter(([key]) => key !== "all" && (canViewCosts || !["inventory_value", "missing_cost"].includes(key))).map(([key, label]) => <SelectItem key={key} value={key}>{t(label)}</SelectItem>)}</SelectContent></Select></div>}
              {sections.length > 0 && <div className="space-y-2"><Label htmlFor="stock-zone-filter">{t("Zona")}</Label><Select value={sectionFilter} onValueChange={setSectionFilterWithReset}><SelectTrigger id="stock-zone-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("Tutte le zone")}</SelectItem><SelectItem value="none">{t("Senza zona")}</SelectItem>{sections.map((zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}</SelectContent></Select></div>}
              {hasLotti && <div className="space-y-2"><Label htmlFor="stock-lot-filter">{t("Lotto")}</Label><Select value={lottoFilter} onValueChange={setLottoFilterWithReset}><SelectTrigger id="stock-lot-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("Tutti i lotti")}</SelectItem>{lotti.map((lot) => <SelectItem key={lot.id} value={lot.id}>{lot.codice_lotto}{lot.articolo ? ` · ${lot.articolo.slice(0, 26)}` : ""}</SelectItem>)}</SelectContent></Select></div>}
              {!onMetricFilterChange && sections.length === 0 && !hasLotti && <p className="text-sm text-muted-foreground">{t("Usa la ricerca per trovare un articolo per nome o codice.")}</p>}
            </div>
            <SheetFooter className="gap-2"><Button variant="outline" onClick={clearInventoryFilters}>{t("Azzera filtri")}</Button><Button onClick={() => setFiltersOpen(false)}>{t("Mostra risultati")}</Button></SheetFooter>
          </SheetContent>
        </Sheet>
        {importOpen && <Suspense fallback={<p role="status">{t("Apertura importazione…")}</p>}><ArticoliCSVImportDialog warehouseId={warehouseFilter} open={importOpen} onOpenChange={setImportOpen} onCloseAutoFocus={(event) => { event.preventDefault(); toolsTriggerRef.current?.focus(); }} hideTrigger /></Suspense>}
        {/* Resta solo per «Mostra anche quelli a zero» e «Riordina»: senza bottoni non occupa spazio. */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-1 empty:hidden">
          {aZeroNascosti > 0 ? (
            <Button size="sm" variant="ghost" className="h-8 px-2 text-sm" onClick={() => cambiaMostraAZero(true)}>{t("Mostra anche {aZeroNascosti} a zero", { aZeroNascosti: String(aZeroNascosti ?? "") })}</Button>
          ) : mostraAZero && !searchQuery && metricFilter === "all" && lottoFilter === "all" && tuttiFiltrati.some((i) => eArticoloAZero(i, inArrivo)) ? (
            <Button size="sm" variant="ghost" className="h-8 px-2 text-sm" onClick={() => cambiaMostraAZero(false)}>
              {t("Nascondi quelli a zero")}
            </Button>
          ) : null}
          {onReorder && !readOnly && metricFilter === "low_stock" && lowStockItems.length > 0 && <Button size="sm" variant="outline" onClick={onReorder}>{t("Riordina sotto scorta")}</Button>}
        </div>

        {metricFilter !== "all" && <div className="flex items-center gap-2 text-sm"><Badge variant="secondary">{t(INVENTORY_FILTER_LABELS[metricFilter])}</Badge><Button size="sm" variant="ghost" onClick={() => { onMetricFilterChange?.("all"); setStockPage(0); }}>{t("Mostra tutti gli articoli")}</Button></div>}

        {/* Batch action bar */}
        {!readOnly && !isError && visibleSelectedIds.length > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium">
                {visibleSelectedIds.length === 1 ? t("{n} selezionato in questa pagina", { n: 1 }) : t("{n} selezionati in questa pagina", { n: visibleSelectedIds.length })}
              </span>
              <Button variant="outline" size="sm" onClick={() => exportRows(true)}>{t("Esporta selezionati")}</Button>
              {sections.length > 0 && (
                <>
                  <Select value={batchTargetSection} onValueChange={setBatchTargetSection}>
                    <SelectTrigger className="w-[180px] h-8">
                      <SelectValue placeholder={t("Zona destinazione")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("Rimuovi zona")}</SelectItem>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={handleBatchMove}
                    disabled={!batchTargetSection || batchMoveMutation.isPending}
                  >
                    <MoveRight className="h-4 w-4 mr-1" />
                    {t("Sposta")}
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedIds(new Set()); setBatchTargetSection(""); }}
              >
                <X className="h-4 w-4 mr-1" />
                {t("Deseleziona")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        {isLoading || (metricFilter === "incoming_7d" && arriviLoading) ? (
          <div className="text-center py-8 text-muted-foreground">{t("Caricamento...")}</div>
        ) : isError ? (
          <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>{t("Impossibile caricare le giacenze")}</AlertTitle><AlertDescription>{t("I dati non sono disponibili.")} <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("Riprova giacenze")}</Button></AlertDescription></Alert>
        ) : metricFilter === "incoming_7d" && arriviError ? null : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {searchQuery || sectionFilter !== "all" || lottoFilter !== "all" || metricFilter !== "all" ? t("Nessun articolo corrisponde ai filtri.") : t("Nessun articolo in questo magazzino.")}
              {(searchQuery || sectionFilter !== "all" || lottoFilter !== "all" || metricFilter !== "all") && <Button variant="ghost" className="ml-2" onClick={() => { setSearchQueryWithReset(""); setSectionFilterWithReset("all"); setLottoFilterWithReset("all"); onMetricFilterChange?.("all"); }}>{t("Rimuovi filtri")}</Button>}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Desktop / tablet: Tabella completa */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <BarraScorrimentoOrizzontale contenitore={tableContainer} className="mx-4 mt-3" />
                <Table wrapperRef={setTableContainer} className="min-w-[860px]" wrapperClassName="max-h-[65vh]">
                  <TableHeader className="sticky top-0 z-10 bg-slate-50">
                    <TableRow className="[&>th]:h-9 [&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:text-xs">
                      <TableHead className="sticky left-0 z-20 w-8 bg-slate-50">
                        <Checkbox
                          checked={allSelected ? true : visibleSelectedIds.length > 0 ? "indeterminate" : false}
                          onCheckedChange={toggleSelectAll}
                          aria-label={t("Seleziona tutti gli articoli di questa pagina")}
                          disabled={readOnly}
                        />
                      </TableHead>
                      <TableHead className="sticky left-8 z-20 bg-slate-50 shadow-[1px_0_0_hsl(var(--border))]">{t("Articolo")}</TableHead>
                      {optionalColumns.includes("code") && <TableHead>{t("Codice")}</TableHead>}
                      {optionalColumns.includes("unit") && <TableHead>{t("Unità")}</TableHead>}
                      {mostraMagazzino && <TableHead>{t("Magazzino")}</TableHead>}
                      {sections.length > 0 && optionalColumns.includes("zone") && <TableHead>{t("Zona")}</TableHead>}
                      <TableHead className="text-right">{t("Giacenza")}</TableHead>
                      <TableHead className="text-right">{t("Impegnato")}</TableHead>
                      <TableHead className="text-right">{t("Disponibile")}</TableHead>
                      {optionalColumns.includes("incoming") && <TableHead className="text-right">{t("In arrivo")}</TableHead>}
                      {optionalColumns.includes("threshold") && <TableHead className="text-right">{t("Scorta minima")}</TableHead>}
                      {canViewCosts && optionalColumns.includes("unit_cost") && <TableHead className="text-right">{t("Costo unitario")}</TableHead>}
                      {canViewCosts && optionalColumns.includes("total_value") && <TableHead className="text-right">{t("Valore totale")}</TableHead>}
                      {optionalColumns.includes("supplier") && <TableHead>{t("Fornitore")}</TableHead>}
                      <TableHead>{t("Stato")}</TableHead>
                      <TableHead className="w-10"><span className="sr-only">{t("Azioni")}</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedItems.map((item) => (
                      <DraggableStockRow
                        key={item.id}
                        item={item}
                        warehouseName={knownWarehouses.find(w => w.id === item.warehouse_id)?.name ?? t("Non indicato")}
                        showWarehouse={mostraMagazzino}
                        isLow={isSottoScorta(item)}
                        inArrivo={arriviError || arriviLoading ? undefined : inArrivo?.get(item.id)}
                        section={getSectionName(item.section_id)}
                        isSelected={selectedIds.has(item.id)}
                        hasSections={sections.length > 0}
                        optionalColumns={optionalColumns}
                        supplierName={getSupplierName(item.supplier_id)}
                        onToggleSelect={() => toggleSelect(item.id)}
                        onEdit={() => { setEditingItem(item); setDialogOpen(true); }}
                        onDelete={() => chiediEliminazione(item)}
                        onCarico={() => { if (onRegisterArrival) onRegisterArrival(item); else { setCaricoItem(item); setCaricoOpen(true); } }}
                        onScarico={() => { setUscitaItem(item); setUscitaOpen(true); }}
                        onHistory={() => setHistoryItem(item)}
                        onTask={() => setTaskItem(item)}
                        onAudit={() => setAuditItem(item)}
                        onSerials={() => setSerialsView({ mode: "item", item })}
                        onReserve={permissions.canEditOrders && !readOnly ? () => setReservation({ item }) : undefined}
                        readOnly={readOnly}
                        canViewCosts={canViewCosts}
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Mobile: Lista a cards */}
            <ul className="md:hidden divide-y overflow-hidden rounded-lg border bg-card">
              {paginatedItems.map((item) => (
                <StockItemMobileCard
                  key={item.id}
                  item={item}
                  isLow={isSottoScorta(item)}
                        inArrivo={arriviError || arriviLoading ? undefined : inArrivo?.get(item.id)}
                  section={getSectionName(item.section_id)}
                  isSelected={selectedIds.has(item.id)}
                  supplierName={getSupplierName(item.supplier_id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onEdit={() => { setEditingItem(item); setDialogOpen(true); }}
                  onDelete={() => chiediEliminazione(item)}
                  onCarico={() => { if (onRegisterArrival) onRegisterArrival(item); else { setCaricoItem(item); setCaricoOpen(true); } }}
                  onScarico={() => { setUscitaItem(item); setUscitaOpen(true); }}
                  onHistory={() => setHistoryItem(item)}
                  onTask={() => setTaskItem(item)}
                  onAudit={() => setAuditItem(item)}
                  onSerials={() => setSerialsView({ mode: "item", item })}
                        onReserve={permissions.canEditOrders && !readOnly ? () => setReservation({ item }) : undefined}
                  readOnly={readOnly}
                        canViewCosts={canViewCosts}
                />
              ))}
            </ul>
          </>
        )}

        {/* Pagination */}
        {stockTotalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t(filtered.length === 1 ? "{n} articolo — Pagina {pagina} di {totale}" : "{n} articoli — Pagina {pagina} di {totale}", { n: filtered.length, pagina: stockPage + 1, totale: stockTotalPages })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStockPage(Math.max(0, stockPage - 1))}
                disabled={stockPage === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("Precedente")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStockPage(Math.min(stockTotalPages - 1, stockPage + 1))}
                disabled={stockPage >= stockTotalPages - 1}
              >
                {t("Successiva")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Drag Overlay */}
        <DragOverlay dropAnimation={null}>
          {draggingItem && (
            <div className="bg-background border rounded-md shadow-lg px-4 py-2 flex items-center gap-2 text-sm font-medium opacity-90">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              {draggingItem.name}
              {selectedIds.has(draggingItem.id) && selectedIds.size > 1 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  +{selectedIds.size - 1}
                </Badge>
              )}
            </div>
          )}
        </DragOverlay>

        {/* Dialogs */}
        <StockItemDialog
          open={!readOnly && dialogOpen}
          onOpenChange={(v) => {
            setDialogOpen(v);
            if (!v) {
              setEditingItem(null);
              setPrefillBarcodeForDialog(undefined);
            }
          }}
          editingItem={editingItem}
          canViewCosts={canViewCosts}
          isPending={saveMutation.isPending}
          prefillBarcode={prefillBarcodeForDialog}
          onSave={(data) => saveMutation.mutate({ ...data, id: editingItem?.id })}
        />
        <StockMovementDialog
          open={!readOnly && movementDialog.open}
          onOpenChange={(v) => { if (!v) setMovementDialog({ open: false, type: "carico", item: null }); }}
          type={movementDialog.type}
          serialized={movementDialog.item?.tracking_mode === "serialized"}
          canViewCosts={canViewCosts}
          itemName={movementDialog.item?.name || ""}
          maxQuantity={movementDialog.type === "scarico" ? movementDialog.item?.quantity_available ?? movementDialog.item?.quantity : undefined}
          isPending={movementMutation.isPending}
          onSave={(data) => {
            if (!movementDialog.item) return;
            movementMutation.mutate({ stockItemId: movementDialog.item.id, type: movementDialog.type, ...data });
          }}
        />
        <StockMovementHistoryDialog
          open={!!historyItem}
          onOpenChange={(v) => { if (!v) setHistoryItem(null); }}
          item={historyItem}
          supplierName={historyItem ? getSupplierName(historyItem.supplier_id) : undefined}
          sectionName={historyItem ? getSectionName(historyItem.section_id)?.name : undefined}
          warehouseName={historyItem ? knownWarehouses.find((w) => w.id === historyItem.warehouse_id)?.name : undefined}
          azioni={historyItem && !readOnly ? <>
            {<Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => { const it = historyItem; setHistoryItem(null); if (onRegisterArrival) onRegisterArrival(it); else { setCaricoItem(it); setCaricoOpen(true); } }}><ArrowUpCircle className="h-3.5 w-3.5" />{t("Carica articolo")}</Button>}
            {<Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" disabled={Number(historyItem.quantity) <= 0} onClick={() => { const it = historyItem; setHistoryItem(null); setUscitaItem(it); setUscitaOpen(true); }}><ArrowDownCircle className="h-3.5 w-3.5" />{t("Preleva articolo")}</Button>}
            {permissions.canEditOrders && <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => { const it = historyItem; setHistoryItem(null); setReservation({ item: it }); }}><Package className="h-3.5 w-3.5" />{t("Prenota per commessa")}</Button>}
            <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => { const it = historyItem; setHistoryItem(null); setEditingItem(it); setDialogOpen(true); }}><Pencil className="h-3.5 w-3.5" />{t("Modifica articolo")}</Button>
          </> : undefined}
          inArrivo={historyItem && !arriviError ? inArrivo?.get(historyItem.id) : undefined}
          arriviUnavailable={arriviError || arriviLoading}
        />

        {/* Eliminazione articolo: si controlla PRIMA cosa c'è attaccato, e se
            non si può si dice il motivo — invece di far arrivare l'errore del
            vincolo, o peggio di cancellare i seriali per cascata. */}
        <AlertDialog
          open={!readOnly && !!daEliminare}
          onOpenChange={(v) => { if (!v) { verificaRichiesta.current++; setDaEliminare(null); setVerificaEliminazione(null); } }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {verificaEliminazione && !verificaEliminazione.eliminabile
                  ? t("Questo articolo non si può eliminare")
                  : t("Eliminare l'articolo?")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {verificaInCorso ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("Controllo cosa è collegato a \"{name}\"...", { name: String(daEliminare?.name ?? "") })}
                  </span>
                ) : verificaEliminazione?.eliminabile ? (
                  <>{t("\"{name}\" non ha giacenza né movimenti registrati: si può eliminare. L'operazione non si annulla.", { name: String(daEliminare?.name ?? "") })}</>
                ) : (
                  verificaEliminazione?.motivo
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {verificaEliminazione && !verificaEliminazione.eliminabile ? t("Ho capito") : t("Annulla")}
              </AlertDialogCancel>
              {verificaEliminazione?.eliminabile && (
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={eliminaArticolo.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    if (daEliminare) eliminaArticolo.mutate(daEliminare);
                  }}
                >
                  {eliminaArticolo.isPending ? t("Eliminazione...") : t("Elimina")}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog open={!!taskItem} onOpenChange={(v) => { if (!v) setTaskItem(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("Task - {name}", { name: String(taskItem?.name ?? "") })}</DialogTitle>
              <DialogDescription>{t("Attività collegate a questo articolo")}</DialogDescription>
            </DialogHeader>
            {taskItem && <LinkedTasks stockItemId={taskItem.id} category="magazzino" />}
          </DialogContent>
        </Dialog>
        <InventoryAuditDialog
          open={!readOnly && !!auditItem}
          onOpenChange={(v) => { if (!v) setAuditItem(null); }}
          stockItem={auditItem}
          warehouseName={knownWarehouses.find(w => w.id === auditItem?.warehouse_id)?.name}
          companyId={companyId!}
        />

        {/* Drill-down seriali (stock_units): per articolo serializzato o intero magazzino. */}
        <StockUnitsDrilldownSheet
          open={serialsView !== null}
          onOpenChange={(o) => { if (!o) setSerialsView(null); }}
          stockItemId={serialsView && serialsView.mode === "item" ? serialsView.item.id : undefined}
          title={
            serialsView && serialsView.mode === "item"
              ? t("Seriali · {name}", { name: String(serialsView.item.name ?? "") })
              : t("Tutti i seriali in magazzino")
          }
        />

        {/* Quick Scan — lookup single-shot tramite BatchBarcodeScanner mode='lookup'. */}
        <Suspense fallback={null}>
          {quickScanOpen && (
            <BatchBarcodeScanner
              open={quickScanOpen}
              onOpenChange={setQuickScanOpen}
              mode="lookup"
              contextLabel={t("Cerca articolo in giacenza")}
              onLookupFilter={(id) => {
                // Filtra la tabella per nome articolo + toast con giacenza.
                // È sufficiente come feedback visivo: la riga matching diventa
                // l'unica visibile dopo il filter (no need di highlight extra).
                const item = stockItems.find((s) => s.id === id);
                if (item) {
                  setSearchQueryWithReset(item.name);
                  toast.success(t("Trovato: {name}", { name: String(item.name ?? "") }), {
                    description: t("Giacenza attuale: {quantity}", { quantity: String(item.quantity ?? "") }),
                  });
                } else {
                  toast.warning(t("Articolo non visibile in questa pagina"), {
                    description: t("Probabilmente filtrato o paginato fuori vista."),
                  });
                }
              }}
              onLookupEdit={(id) => {
                const item = stockItems.find((s) => s.id === id);
                if (item) {
                  setEditingItem(item);
                  setDialogOpen(true);
                }
              }}
              onLookupCreateNew={(barcode) => {
                // Apri StockItemDialog precompilato (prop prefillBarcode già supportata in MP1 TASK 8).
                setEditingItem(null);
                setPrefillBarcodeForDialog(barcode);
                setDialogOpen(true);
              }}
            />
          )}
        </Suspense>

        {reservation && !readOnly && <Suspense fallback={<p role="status">{t("Apertura prenotazione…")}</p>}><ReserveStockDialog items={stockItems} warehouseNames={Object.fromEntries(knownWarehouses.map((w) => [w.id, w.name]))} initialItem={reservation.item} onClose={() => setReservation(null)} /></Suspense>}
        {/* Carico rapido (MP2 P1a) */}
        <Suspense fallback={null}>
          {!readOnly && caricoOpen && (
            <CaricoRapidoSheet initialStockItem={caricoItem} initialWarehouseId={caricoItem?.warehouse_id ?? warehouseFilter} open={caricoOpen} onOpenChange={setCaricoOpen} />
          )}
        </Suspense>

        {/* Ricezione da ODA (MP2 P1a) */}
        <Suspense fallback={null}>
          {!readOnly && odaReceiveOpen && (
            <OdaReceiveSheet open={odaReceiveOpen} onOpenChange={setOdaReceiveOpen} />
          )}
        </Suspense>

        {/* Uscita merce a 2 fasi: registra l'uscita → poi DDT separato (MP3 P1b) */}
        <Suspense fallback={null}>
          {!readOnly && uscitaOpen && (
            <UscitaMerceSheet initialStockItem={uscitaItem} initialWarehouseId={uscitaItem?.warehouse_id ?? warehouseFilter} open={uscitaOpen} onOpenChange={(open) => { setUscitaOpen(open); if (!open) setUscitaItem(undefined); }} />
          )}
        </Suspense>
      </div>
    </DndContext>
  );
}

// --- Draggable row component ---

interface DraggableStockRowProps {
  item: StockItem;
  isLow: boolean;
  inArrivo?: InArrivoArticolo;
  section: { name: string; color: string } | null;
  isSelected: boolean;
  hasSections: boolean;
  optionalColumns: OptionalColumn[];
  supplierName: string;
  warehouseName?: string;
  onToggleSelect: () => void;
  onEdit: () => void;
  onCarico: () => void;
  onReserve?: () => void;
  onScarico: () => void;
  onHistory: () => void;
  onTask: () => void;
  onAudit: () => void;
  onSerials: () => void;
  onDelete: () => void;
  readOnly?: boolean;
  canViewCosts?: boolean;
  showWarehouse?: boolean;
}

/** «+12 in arrivo» con il link all'ordine fornitore: chi riordina vede che è già ordinato. */
function InArrivoNota({ inArrivo }: { inArrivo?: InArrivoArticolo }) {
  const t = useT();
  if (!inArrivo || inArrivo.quantita <= 0) return null;
  const primo = inArrivo.ordini[0];
  const elenco = inArrivo.ordini.map((o) => o.numero).join(", ");
  return (
    <Link
      to={primo ? `/azienda/ordini-acquisto/${primo.id}` : "/azienda/ordini?tab=acquisto"}
      onClick={(e) => e.stopPropagation()}
      title={t("In arrivo da {elenco}", { elenco: String(elenco ?? "") })}
      className="mt-0.5 block text-[10px] font-medium text-blue-700 hover:underline"
    >
      +{inArrivo.ordini.length > 1 ? t("{quantita} in arrivo ({n} ordini)", { quantita: Number(inArrivo.quantita.toFixed(2)), n: inArrivo.ordini.length }) : t("{quantita} in arrivo", { quantita: Number(inArrivo.quantita.toFixed(2)) })}
    </Link>
  );
}

const DraggableStockRow = memo(function DraggableStockRow({
  item, isLow, inArrivo, section, isSelected, hasSections, optionalColumns, supplierName, warehouseName, showWarehouse = true,
  onToggleSelect, onEdit, onCarico, onScarico, onHistory, onTask, onAudit, onSerials, onDelete, onReserve,
  readOnly = false,
  canViewCosts = false,
}: DraggableStockRowProps) {
  const t = useT();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `stock-${item.id}`,
    data: { itemId: item.id },
    disabled: readOnly,
  });

  // Clic sulla riga = dettaglio (26/11/2026). Casella, trascinamento, link e menu fanno la loro cosa.
  const apriDallaRiga = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, label, [role=checkbox], [role=menuitem], [data-no-row-click]")) return;
    onHistory();
  };
  const disponibile = Number(item.quantity_available ?? item.quantity);
  const um = item.unita_misura || "";
  return (
    <TableRow
      ref={setNodeRef}
      onClick={apriDallaRiga}
      className={cn("group cursor-pointer [&>td]:whitespace-nowrap [&>td]:px-2 [&>td]:py-1.5 [&>td]:text-sm", isLow && "bg-amber-50/50 dark:bg-amber-950/10", isDragging && "opacity-40")}
    >
      {/* Casella e nome fermi a sinistra: se la tabella scorre di lato, il nome resta in vista. */}
      <TableCell className={cn("sticky left-0 z-10 w-8 group-hover:bg-muted", isLow ? "bg-amber-50" : "bg-card")}>
        {!readOnly && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            aria-label={t("Seleziona {name}", { name: String(item.name ?? "") })}
          />
        )}
      </TableCell>
      <TableCell className={cn("sticky left-8 z-10 shadow-[1px_0_0_hsl(var(--border))] group-hover:bg-muted", isLow ? "bg-amber-50" : "bg-card")}>
        <div className="flex items-center gap-1.5">
          {!readOnly && hasSections && <button type="button" className="cursor-grab text-muted-foreground active:cursor-grabbing" aria-label={t("Trascina {name}", { name: String(item.name ?? "") })} {...listeners} {...attributes}><GripVertical className="h-3.5 w-3.5" /></button>}
          <button type="button" className="block max-w-[220px] truncate text-left font-medium text-primary hover:underline 2xl:max-w-[340px]" onClick={onHistory}
            title={item.description ? `${item.name} — ${item.description}` : item.name}
            aria-label={t("Apri dettaglio {name}", { name: String(item.name ?? "") })}>{item.name}</button>
          {item.tracking_mode === "serialized" && <Badge variant="outline" className="px-1 py-0 font-mono text-[9px]" title={t("· Con matricola")}>SER</Badge>}
        </div>
      </TableCell>
      {optionalColumns.includes("code") && <TableCell>
        {item.internal_code || item.barcode ? (
          <span className="block max-w-[110px] truncate font-mono text-xs text-muted-foreground" title={item.internal_code || item.barcode || ""}>{item.internal_code || item.barcode}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>}
      {optionalColumns.includes("unit") && <TableCell className="text-xs text-muted-foreground">{um || "—"}</TableCell>}
      {showWarehouse && <TableCell className="max-w-[120px] truncate text-muted-foreground" title={warehouseName}>{warehouseName ?? t("Non indicato")}</TableCell>}
      {hasSections && optionalColumns.includes("zone") && (
        <TableCell>
          {section ? (
            <span className="inline-flex items-center gap-1 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: section.color }} />
              {section.name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
      )}
      <TableCell className="text-right tabular-nums">
        {formattaQuantitaMovimento(Number(item.quantity))}
        {!optionalColumns.includes("incoming") && <InArrivoNota inArrivo={inArrivo} />}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{formattaQuantitaMovimento(Number(item.quantity_reserved ?? 0))}</TableCell>
      <TableCell className="text-right font-semibold tabular-nums">{formattaQuantitaMovimento(disponibile)}{!optionalColumns.includes("unit") && um ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">{um}</span> : null}</TableCell>
      {optionalColumns.includes("incoming") && <TableCell className="text-right tabular-nums">
        {inArrivo && inArrivo.quantita > 0 ? <InArrivoNota inArrivo={inArrivo} /> : <span className="text-xs text-muted-foreground">—</span>}
      </TableCell>}
      {optionalColumns.includes("threshold") && <TableCell className="text-right tabular-nums text-muted-foreground">{item.min_stock_level ? formattaQuantitaMovimento(item.min_stock_level) : "—"}</TableCell>}
      {canViewCosts && optionalColumns.includes("unit_cost") && <TableCell className="text-right tabular-nums">{item.prezzo_da_definire ? <span className="text-xs text-amber-700">{t("Da definire")}</span> : formatCurrency(item.unit_cost)}</TableCell>}
      {canViewCosts && optionalColumns.includes("total_value") && <TableCell className="text-right tabular-nums">{item.prezzo_da_definire ? <span className="text-xs text-muted-foreground">{t("Da valorizzare")}</span> : formatCurrency(item.unit_cost * item.quantity)}</TableCell>}
      {optionalColumns.includes("supplier") && <TableCell className="max-w-[140px] truncate" title={supplierName}>{supplierName || <span className="text-muted-foreground">—</span>}</TableCell>}
      <TableCell><Badge variant={isLow ? "outline" : "secondary"} className={cn("px-1.5 py-0 text-[11px] font-medium", isLow ? "border-amber-300 bg-amber-50 text-amber-800" : disponibile > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>{isLow ? t("Sotto scorta") : disponibile > 0 ? t("Disponibile") : t("Non disponibile")}</Badge></TableCell>
      <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={t("Azioni {name}", { name: String(item.name ?? "") })}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="max-w-52 truncate">{item.name}</DropdownMenuLabel>
              <DropdownMenuItem onClick={onHistory}><History className="mr-2 h-4 w-4" />{t("Dettaglio e storico")}</DropdownMenuItem>
              {item.tracking_mode === "serialized" && <DropdownMenuItem onClick={onSerials}><Barcode className="mr-2 h-4 w-4" />{t("Vedi seriali")}</DropdownMenuItem>}
              {!readOnly && <>
                <DropdownMenuSeparator />
                {onReserve && <DropdownMenuItem onClick={onReserve}><Package className="mr-2 h-4 w-4" />{t("Prenota per commessa")}</DropdownMenuItem>}
                <DropdownMenuItem onClick={onCarico}><ArrowUpCircle className="mr-2 h-4 w-4" />{t("Carica articolo")}</DropdownMenuItem>
                <DropdownMenuItem onClick={onScarico} disabled={Number(item.quantity) <= 0}><ArrowDownCircle className="mr-2 h-4 w-4" />{t("Preleva articolo")}</DropdownMenuItem>
                <DropdownMenuItem onClick={onAudit}><ClipboardCheck className="mr-2 h-4 w-4" />{t("Conta / rettifica inventario")}</DropdownMenuItem>
                <DropdownMenuItem onClick={onTask}><CheckSquare className="mr-2 h-4 w-4" />{t("Crea attività")}</DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />{t("Modifica articolo")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />{t("Elimina articolo")}</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
      </TableCell>
  </TableRow>
  );
});

// --- Mobile card row ---
// Layout dedicato a smartphone: una sola card per articolo, info essenziali
// (nome + qty + valore + zona) e actions raggruppate in un dropdown "..."
// per non saturare lo schermo. Layout drag-free: il drag&drop sezione non
// è il caso d'uso primario in mobile.

interface StockItemMobileCardProps {
  item: StockItem;
  isLow: boolean;
  inArrivo?: InArrivoArticolo;
  section: { name: string; color: string } | null;
  isSelected: boolean;
  supplierName: string;
  onToggleSelect: () => void;
  onEdit: () => void;
  onCarico: () => void;
  onReserve?: () => void;
  onScarico: () => void;
  onHistory: () => void;
  onTask: () => void;
  onAudit: () => void;
  onSerials: () => void;
  onDelete: () => void;
  readOnly?: boolean;
  canViewCosts?: boolean;
}

const StockItemMobileCard = memo(function StockItemMobileCard({
  item, isLow, inArrivo, isSelected,
  onToggleSelect, onEdit, onCarico, onScarico, onHistory, onTask, onAudit, onSerials, onDelete, onReserve,
  readOnly = false,
  canViewCosts = false,
}: StockItemMobileCardProps) {
  const t = useT();
  // Una riga per articolo (decisione del founder, 23/11/2026): nome, quanto ce n'è e quanto
  // vale. Codice, descrizione, fornitore, scaffale e prezzo unitario stanno nel dettaglio,
  // che si apre toccando il nome. Prima ogni articolo era una scheda alta il doppio.
  const unita = item.unita_misura || t("unità");
  const impegnato = Number(item.quantity_reserved ?? 0);
  const disponibile = Number(item.quantity_available ?? item.quantity);
  const dettagli = [
    impegnato > 0 ? t("{n} disponibili", { n: formattaQuantitaMovimento(disponibile) }) : null,
    impegnato > 0 ? t("{n} impegnati", { n: formattaQuantitaMovimento(impegnato) }) : null,
    isLow ? t("sotto il minimo ({n})", { n: formattaQuantitaMovimento(Number(item.min_stock_level)) }) : null,
    item.tracking_mode === "serialized" ? t("con seriali") : null,
  ].filter(Boolean).join(" · ");
  return (
    <li className={cn("flex items-center gap-2 py-2 pl-3 pr-1", isLow && "bg-amber-50/60 dark:bg-amber-950/10")}>
      {!readOnly && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          aria-label={t("Seleziona {name}", { name: String(item.name ?? "") })}
          className="shrink-0"
        />
      )}
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onHistory} aria-label={t("Dettaglio {name}", { name: String(item.name ?? "") })}>
        <span className="block truncate text-sm font-medium">{item.name}</span>
        {(dettagli || inArrivo) && (
          <span className={cn("block truncate text-xs", isLow ? "text-amber-700 dark:text-amber-500" : "text-muted-foreground")}>
            {dettagli}{dettagli && inArrivo ? " · " : ""}{inArrivo ? t("{valore} in arrivo", { valore: formattaQuantitaMovimento(Number(inArrivo.quantita)) }) : ""}
          </span>
        )}
      </button>
      <div className="shrink-0 text-right">
        <p className={cn("whitespace-nowrap text-sm font-semibold tabular-nums", isLow && "text-amber-700 dark:text-amber-500")}>
          {formattaQuantitaMovimento(Number(item.quantity))} <span className="text-xs font-normal text-muted-foreground">{unita}</span>
        </p>
        {canViewCosts && (
          <p className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {item.prezzo_da_definire ? t("da valorizzare") : formatCurrency(item.unit_cost * item.quantity)}
          </p>
        )}
      </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-8 shrink-0" aria-label={t("Altre azioni: {name}", { name: String(item.name ?? "") })}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {!readOnly && (
                <>
                  {onReserve && <DropdownMenuItem onClick={onReserve}><Package className="mr-2 h-4 w-4" />{t("Prenota per commessa")}</DropdownMenuItem>}
                <DropdownMenuItem onClick={onCarico}>
                    <ArrowUpCircle className="h-4 w-4 mr-2 text-emerald-600" />
                    {t("Carico")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onScarico} disabled={Number(item.quantity) <= 0}>
                    <ArrowDownCircle className="h-4 w-4 mr-2 text-red-500" />
                    {t("Scarico")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="h-4 w-4 mr-2" />
                    {t("Modifica")}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={onHistory}>
                <History className="h-4 w-4 mr-2 text-muted-foreground" />
                {t("Storico")}
              </DropdownMenuItem>
              {!readOnly && (
                <DropdownMenuItem onClick={onAudit}>
                  <ClipboardCheck className="h-4 w-4 mr-2 text-muted-foreground" />
                  {t("Inventario")}
                </DropdownMenuItem>
              )}
              {item.tracking_mode === "serialized" && (
                <DropdownMenuItem onClick={onSerials}>
                  <Barcode className="h-4 w-4 mr-2 text-orange-600" />
                  {t("Vedi seriali")}
                </DropdownMenuItem>
              )}
              {!readOnly && (
                <>
                  <DropdownMenuItem onClick={onTask}>
                    <CheckSquare className="h-4 w-4 mr-2 text-primary" />
                    {t("Task")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("Elimina")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
    </li>
  );
});
