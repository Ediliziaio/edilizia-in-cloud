import { RICERCA_BARRA } from "@/components/orders/TestataScheda";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedStorage } from "@/hooks/warehouse/useScopedStorage";
import { useState, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import type { OrderItemStatus } from "@/types/warehouse";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  Warehouse as WarehouseIcon,
  Search,
  X,
  List,
  Download,
  Printer,
  AlertTriangle,
  Clock,
  RefreshCw,
  GripVertical,
  ScanLine,
  Package,
  Plus,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Settings as SettingsIcon,
  Settings2,
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Trash2,
  ShoppingCart,
  MoreHorizontal,
  Undo2,
} from "lucide-react";
import { BarcodeScanner } from "@/components/warehouse/BarcodeScanner";
import { StockUnitsDrilldownSheet } from "@/components/warehouse/StockUnitsDrilldownSheet";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PrelieviCampoCard } from "@/components/warehouse/PrelieviCampoCard";
import { RitiriDalCantiere } from "@/components/warehouse/RitiriDalCantiere";
import { AcquistiCampoCard } from "@/components/warehouse/AcquistiCampoCard";
import { RigheDaAbbinareCard } from "@/components/warehouse/RigheDaAbbinareCard";
import { ImpostazionePrelievoCampo } from "@/components/warehouse/ImpostazionePrelievoCampo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SlidersHorizontal } from "lucide-react";

import type { InventoryFilter } from "@/lib/magazzino/filtriInventario";
import { OperationalSummary } from "@/components/shared/OperationalSummary";
import WarehouseStats, { type WarehouseOrderMetricKey } from "@/components/warehouse/WarehouseStats";
import { useMagazzinoRiepilogo } from "@/hooks/useMagazzinoRiepilogo";
import WarehouseInventoryStats, { type WarehouseInventoryMetricKey } from "@/components/warehouse/WarehouseInventoryStats";
import WarehouseKanbanView from "@/components/warehouse/WarehouseKanbanView";
import WarehouseCalendarView from "@/components/warehouse/WarehouseCalendarView";
import WarehouseListView from "@/components/warehouse/WarehouseListView";
import WarehouseStockTab from "@/components/warehouse/WarehouseStockTab";
import WarehouseLottiTab from "@/components/warehouse/WarehouseLottiTab";
import { WarehouseDDTTab } from "@/components/warehouse/WarehouseDDTTab";
import { WarehouseUsciteTab } from "@/components/warehouse/WarehouseUsciteTab";
import WarehousePurchaseListTab from "@/components/warehouse/WarehousePurchaseListTab";
import { ArrivoMerceEntryDialog } from "@/components/warehouse/ArrivoMerceEntryDialog";

import { WarehouseValorizzazionePanel } from "@/components/warehouse/WarehouseValorizzazionePanel";
import WarehouseMovementsTab from "@/components/warehouse/WarehouseMovementsTab";
import { LowStockReorderDialog } from "@/components/warehouse/LowStockReorderDialog";
import { LottiScadenzaAlert } from "@/components/warehouse/LottiScadenzaAlert";
import { MagazzinoVisteSwitch } from "@/components/warehouse/MagazzinoVisteSwitch";

import { STATUS_CONFIG } from "@/types/warehouse";
import { usePermissions } from "@/hooks/usePermissions";
import type { WarehouseItem, StockItem } from "@/types/warehouse";
import { useWarehouseData } from "@/hooks/useWarehouseData";
import { useLowStockAlerts } from "@/hooks/useMagazzinoLive";
import { useWarehouseSections } from "@/hooks/useWarehouseSections";
import { useWarehouses } from "@/hooks/useWarehouses";
import { WarehousePendingOperations } from "@/components/warehouse/WarehousePendingOperations";
import { WarehouseTransferPanel } from "@/components/warehouse/WarehouseTransferPanel";
import type { ViewMode, GroupBy } from "@/hooks/useWarehouseData";
import { useIsMobile } from "@/hooks/use-mobile";

import {
  gruppiVisibili,
  gruppoDi,
  vistaDelGruppo,
  VISTE_MOBILE,
  type GruppoMagazzino,
} from "@/lib/magazzino/vistaMagazzino";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { formatCurrency } from "@/lib/formatters";
import { downloadFile, exportToCSV as exportCsvFile, type CsvColumn } from "@/lib/csvExport";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

// Aperto solo quando l'arrivo è legato a un ordine: fuori dal bundle del magazzino.
const ResoCantiereDialog = lazy(() => import("@/components/warehouse/ResoCantiereDialog").then((module) => ({ default: module.ResoCantiereDialog })));
const OdaArrivoMerceSheet = lazy(() =>
  import("@/components/warehouse/OdaArrivoMerceSheet").then((m) => ({ default: m.OdaArrivoMerceSheet })),
);

const WAREHOUSE_ORDER_STATUSES: OrderItemStatus[] = [
  "da_ordinare",
  "ordinato",
  "in_arrivo",
  "in_magazzino",
  "prenotato",
  "installato",
];

const WAREHOUSE_TYPE_LABEL: Record<string, string> = {
  main: "Principale",
  secondary: "Secondario",
  site: "Cantiere",
  vehicle: "Veicolo",
};

type StockActionRequest = {
  type: "receive" | "ship";
  item?: StockItem;
  nonce: number;
} | null;

type MaterialMetricCard = {
  id: string;
  stockItemId: string;
  label?: string;
};

type MetricPreferences = {
  order: WarehouseOrderMetricKey[];
  inventory: WarehouseInventoryMetricKey[];
  materialCards: MaterialMetricCard[];
};

const DEFAULT_ORDER_METRICS: WarehouseOrderMetricKey[] = [
  "overdue",
  "in_magazzino",
  "ordinato",
  "da_ordinare",
];

const DEFAULT_INVENTORY_METRICS: WarehouseInventoryMetricKey[] = [
  "inventory_value",
  "stock_items",
  "low_stock",
  "incoming_7d",
];

// «Quantità totale», «Materiali critici» e «In esaurimento» tolti il 22/10:
// la prima sommava pezzi, metri e chili; le altre due ripetevano «sotto
// scorta» con altre soglie. Chi li aveva scelti torna ai riquadri di base.
const ALL_INVENTORY_METRICS: WarehouseInventoryMetricKey[] = [
  ...DEFAULT_INVENTORY_METRICS,
  "missing_cost",
];

const DEFAULT_METRIC_PREFERENCES: MetricPreferences = {
  order: DEFAULT_ORDER_METRICS,
  inventory: DEFAULT_INVENTORY_METRICS,
  materialCards: [],
};

const ORDER_METRIC_LABELS: Record<WarehouseOrderMetricKey, string> = {
  overdue: "In Ritardo",
  in_magazzino: "In Magazzino",
  ordinato: "In Transito",
  da_ordinare: "Da Ordinare",
};

const INVENTORY_METRIC_LABELS: Record<WarehouseInventoryMetricKey, string> = {
  inventory_value: "Valore inventario",
  stock_items: "Articoli a stock",
  low_stock: "Sotto scorta",
  incoming_7d: "In arrivo",
  missing_cost: "Senza costo",
};

const LocalWarehouseShell = import.meta.env.DEV ? lazy(() => import("../../../dev/magazzino-local/LocalWarehouseShell")) : null;
export default function Warehouse() {
  const t = useT();
  const { effectiveCompany, user } = useAuth();
  const scope = `${effectiveCompany?.id ?? "none"}:${user?.id ?? "none"}`;
  const local = import.meta.env.DEV && typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
    && (new URLSearchParams(window.location.search).get("warehouseLocal") === "1" || sessionStorage.getItem("eic-magazzino-local-preview") === "1");
  if (local && LocalWarehouseShell) return <Suspense fallback={<p className="p-6">{t("Collegamento al Magazzino locale…")}</p>}><LocalWarehouseShell><WarehousePage key={scope} /></LocalWarehouseShell></Suspense>;
  return <WarehousePage key={scope} />;
}

function WarehousePage() {
  const t = useT();
  const navigate = useNavigate();
  // «Gestisci magazzini» (creare, zone, magazzinieri assegnati) è
  // dell'amministratore, come la pagina: agli altri portava ad «Accesso riservato».
  const permissions = usePermissions();
  const gestisceMagazzini = permissions.isAdmin;
  const canViewCosts = permissions.canViewCosts && !permissions.isLoading;
  const [searchParams] = useSearchParams();
  const isReadOnly = searchParams.get("commercialistaMode") === "1" || permissions.isLoading || !permissions.canEditWarehouse;
  const workflowReadOnly = isReadOnly || !permissions.canEditOrders;
  const {
    items,
    filteredItems,
    filteredGroups,
    purchaseItems,
    suppliers,
    stockItems,
    isStockLoading,
    isStockError,
    refetchStock,
    uniqueOrders,
    urgentItemsCount,
    activeItemsCount,
    page,
    setPage,
    totalPages,
    totalCount,
    viewMode: viewModeScelto,
    setViewMode,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    orderFilter,
    setOrderFilter,
    supplierFilter,
    setSupplierFilter,
    sectionFilter,
    setSectionFilter,
    warehouseFilter,
    setWarehouseFilter,
    groupBy,
    setGroupBy,
    quickFilter,
    setQuickFilter,
    lottoFilter,
    setLottoFilter,
    lotti,
    isLoading,
    isError,
    isUpdating,
    hasActiveFilters,
    handleStatusChange,
    handleMarkAllInstalled,
    handleBatchStatusChange,
    handleBatchSectionChange,
    handleUpdateNotes,
    getSupplierName,
    clearFilters,
    refetch,
    effectiveCompany,
  } = useWarehouseData();
  // i riquadri si contano nel database su tutti i dati, non sulla pagina mostrata
  const { data: riepilogo, isLoading: riepilogoLoading, isError: riepilogoError, isFetching: riepilogoFetching, refetch: refetchRiepilogo } = useMagazzinoRiepilogo(warehouseFilter ?? null);
  // Mobile: lista, da comprare, inventario e movimenti.
  const isMobile = useIsMobile();
  // «Scadenze» non ha più una scheda: apre le giacenze. Stessa regola di
  // vistaEffettiva(), scritta qui perché il React Compiler non perda la
  // memoizzazione del resto del componente.
  const vistaScelta: ViewMode = viewModeScelto === "scadenze" ? "stock" : viewModeScelto;
  const viewMode: ViewMode = vistaScelta === "valuation" && !canViewCosts ? "stock" : isMobile && !VISTE_MOBILE.includes(vistaScelta) ? "list" : vistaScelta;
  // Tornando a un gruppo si ritrova la sotto-vista lasciata.
  const ultimePerGruppo = useRef<Partial<Record<GruppoMagazzino, ViewMode>>>({});

  const { sections } = useWarehouseSections();
  const {
    warehouses,
    isLoading: warehousesLoading,
  } = useWarehouses(true);
  const { isScopriPlan } = useSubscriptionLimits();
  const { data: tuttiSottoScorta = [] } = useLowStockAlerts(effectiveCompany?.id ?? null);
  // Con un magazzino scelto il riquadro «sotto scorta» conta solo i suoi
  // articoli: banner e riordino lo stesso (prima dicevano 7 contro 2).
  const articoliDelMagazzino = useMemo(
    () => (warehouseFilter ? new Set(stockItems.filter((i) => i.warehouse_id === warehouseFilter).map((i) => i.id)) : null),
    [stockItems, warehouseFilter],
  );
  const lowStockAlerts = useMemo(
    () => (articoliDelMagazzino ? tuttiSottoScorta.filter((a) => articoliDelMagazzino.has(a.stock_item_id)) : tuttiSottoScorta),
    [tuttiSottoScorta, articoliDelMagazzino],
  );
  const [reorderOpen, setReorderOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [serialsSheetOpen, setSerialsSheetOpen] = useState(false);
  const [stockMetricFilter, setStockMetricFilter] = useState<InventoryFilter>("all");
  const [stockActionRequest, setStockActionRequest] = useState<StockActionRequest>(null);
  // «Registra arrivo merce» passa sempre dalla domanda «di quale ordine è?»:
  // il carico libero resta, ma come seconda scelta dichiarata.
  const clearStockAction = useCallback(() => setStockActionRequest(null), []);
  const [arrivoChooserOpen, setArrivoChooserOpen] = useState(false);
  const [arrivalItem, setArrivalItem] = useState<StockItem | undefined>();
  const [arrivoOdaId, setArrivoOdaId] = useState<string | null>(null);
  const [metricsDialogOpen, setMetricsDialogOpen] = useState(false);
  const [prelievoSettingsOpen, setPrelievoSettingsOpen] = useState(false);
  const [selectedMaterialMetricId, setSelectedMaterialMetricId] = useState<string>("");
  const metricStorageKey = effectiveCompany?.id
    ? `warehouse-metric-preferences:${effectiveCompany.id}`
    : null;

  const [metricPreferences, setMetricPreferences] = useScopedStorage<MetricPreferences>(metricStorageKey, DEFAULT_METRIC_PREFERENCES, (raw) => {
      const parsed = JSON.parse(raw) as Partial<MetricPreferences>;
      return {
        order: parsed.order?.filter((key): key is WarehouseOrderMetricKey =>
          DEFAULT_ORDER_METRICS.includes(key as WarehouseOrderMetricKey),
        ) ?? DEFAULT_ORDER_METRICS,
        inventory: (() => {
          const scelti = parsed.inventory?.filter((key): key is WarehouseInventoryMetricKey =>
            ALL_INVENTORY_METRICS.includes(key as WarehouseInventoryMetricKey),
          );
          // chi aveva scelto solo riquadri tolti non deve ritrovarsi senza numeri
          return scelti && scelti.length > 0 ? scelti : DEFAULT_INVENTORY_METRICS;
        })(),
        materialCards: Array.isArray(parsed.materialCards) ? parsed.materialCards : [],
      };
  });

  const materialMetricCards = useMemo(
    () =>
      metricPreferences.materialCards
        .map((card) => {
          const item = stockItems.find((stockItem) => stockItem.id === card.stockItemId && (!warehouseFilter || stockItem.warehouse_id === warehouseFilter));
          return item ? { ...card, item } : null;
        })
        .filter((card): card is MaterialMetricCard & { item: NonNullable<typeof stockItems[number]> } => Boolean(card)),
    [metricPreferences.materialCards, stockItems, warehouseFilter],
  );

  // Multi-selection state for order items DnD
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [draggingItem, setDraggingItem] = useState<WarehouseItem | null>(null);

  const toggleItemSelection = useCallback((itemId: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  // Le query a freddo restituiscono array vuoti con identità diversa: il
  // perimetro dipende dalle righe visibili, non dall’identità dell’array.
  const selectionScope = JSON.stringify([effectiveCompany?.id, warehouseFilter, page, viewMode, workflowReadOnly, filteredItems.map((item) => item.id)]);
  const [previousSelectionScope, setPreviousSelectionScope] = useState(selectionScope);
  if (previousSelectionScope !== selectionScope) {
    setPreviousSelectionScope(selectionScope);
    setSelectedItemIds(new Set());
    setDraggingItem(null);
  }

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const item = filteredItems.find(i => i.id === event.active.id);
    if (item) setDraggingItem(item);
  }, [filteredItems]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggingItem(null);
    if (workflowReadOnly) return;
    const { active, over } = event;
    if (!over) return;

    const itemId = active.id as string;

    // Check if dropped on a map section
    const sectionId = over.data.current?.sectionId as string | undefined;
    if (sectionId) {
      const idsToMove = selectedItemIds.has(itemId) && selectedItemIds.size > 1
        ? Array.from(selectedItemIds)
        : [itemId];
      const resolvedSectionId = sectionId === "__none__" ? null : sectionId;
      handleBatchSectionChange(idsToMove, resolvedSectionId);
      setSelectedItemIds(new Set());
      return;
    }

    // Check if dropped on a kanban status column
    const newStatus = over.id as string;
    if (WAREHOUSE_ORDER_STATUSES.includes(newStatus as OrderItemStatus)) {
      const item = filteredItems.find(i => i.id === itemId);
      if (item && item.status !== newStatus) {
        handleStatusChange(itemId, newStatus as OrderItemStatus);
      }
    }
  }, [workflowReadOnly, selectedItemIds, handleBatchSectionChange, filteredItems, handleStatusChange]);

  // M9 — wrapper single-item per il dropdown sezione mobile
  const handleSingleSectionChange = useCallback((itemId: string, sectionId: string | null) => {
    handleBatchSectionChange([itemId], sectionId);
  }, [handleBatchSectionChange]);

  const readonlyWarehouseAction = useCallback(() => {
    // Modalita commercialista: il magazzino e' consultabile ma non modificabile.
  }, []);

  if (isScopriPlan) return <UpgradeScopriWall type="magazzino" inline />;

  if (!effectiveCompany) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {t("Seleziona un'azienda per visualizzare il magazzino.")}
      </div>
    );
  }

  const gruppoAttivo = gruppoDi(viewMode);
  const gruppi = gruppiVisibili(isMobile).map((g) => ({ ...g, viste: g.viste.filter((v) => canViewCosts || v.key !== "valuation") }));

  const isWorkflowView = viewMode === "list" || viewMode === "kanban" || viewMode === "calendar";
  const isOrderView = isWorkflowView;

  // ─── Filtro attivo per WarehouseStats cards cliccabili ───
  // Le KPI cards sono cliccabili e applicano filtro: status (in_magazzino/ordinato/da_ordinare)
  // o quick (overdue). Lo derivo dallo stato esistente per evitare duplicazione.
  const activeStatsFilter: import("@/components/warehouse/WarehouseStats").WarehouseStatsFilter =
    quickFilter === "overdue"
      ? { kind: "quick", value: "overdue" }
      : statusFilter === "in_magazzino" || statusFilter === "ordinato" || statusFilter === "da_ordinare"
        ? { kind: "status", value: statusFilter as OrderItemStatus }
        : { kind: "all" };

  const handleStatsCardClick = (next: import("@/components/warehouse/WarehouseStats").WarehouseStatsFilter) => {
    // Le KPI workflow sono sempre visibili anche in modalità inventario.
    // Se l'utente clicca da inventario → forziamo lo switch a workflow,
    // altrimenti il filtro non avrebbe nessun effetto visibile.
    if (!isWorkflowView) setViewMode("list");
    if (next.kind === "all") {
      setQuickFilter("all");
      setStatusFilter("all");
      return;
    }
    if (next.kind === "quick") {
      setStatusFilter("all");
      setQuickFilter(next.value);
      return;
    }
    if (next.kind === "status") {
      setQuickFilter("all");
      setStatusFilter(next.value);
    }
  };

  const activeWarehouse = warehouseFilter
    ? warehouses.find((warehouse) => warehouse.id === warehouseFilter) ?? null
    : null;

  const apriArrivoMerce = (item?: StockItem) => { if (!isReadOnly) { setArrivalItem(item); setArrivoChooserOpen(true); } };

  const openStockAction = (type: "receive" | "ship", item?: StockItem) => {
    if (isReadOnly) return;
    setViewMode("stock");
    setStockActionRequest({ type, item, nonce: Date.now() });
  };

  const handleViewModeChange = (value: string) => {
    const nextViewMode = value as ViewMode;
    setViewMode(nextViewMode);
    ultimePerGruppo.current = { ...ultimePerGruppo.current, [gruppoDi(nextViewMode)]: nextViewMode };
    if (nextViewMode === "stock") {
      setStockMetricFilter("all");
      setStockActionRequest(null);
    }
  };

  const handleGruppoChange = (value: string) => {
    handleViewModeChange(vistaDelGruppo(value as GruppoMagazzino, ultimePerGruppo.current, isMobile));
  };

  // Ogni numero apre l'elenco corrispondente; il riordino resta un'azione esplicita.
  const handleInventoryCardClick = (key: WarehouseInventoryMetricKey) => {
    setStockMetricFilter(viewMode === "stock" && stockMetricFilter === key ? "all" : key);
    setViewMode("stock");
  };

  const toggleOrderMetric = (key: WarehouseOrderMetricKey) => {
    setMetricPreferences((current) => {
      const next = current.order.includes(key)
        ? current.order.filter((item) => item !== key)
        : [...current.order, key];
      return { ...current, order: next };
    });
  };

  const toggleInventoryMetric = (key: WarehouseInventoryMetricKey) => {
    setMetricPreferences((current) => {
      const next = current.inventory.includes(key)
        ? current.inventory.filter((item) => item !== key)
        : [...current.inventory, key];
      return { ...current, inventory: next };
    });
  };

  const addMaterialMetricCard = () => {
    if (!selectedMaterialMetricId) return;
    setMetricPreferences((current) => {
      if (current.materialCards.some((card) => card.stockItemId === selectedMaterialMetricId)) return current;
      const id = globalThis.crypto?.randomUUID?.() ?? `${selectedMaterialMetricId}-${Date.now()}`;
      return {
        ...current,
        materialCards: [...current.materialCards, { id, stockItemId: selectedMaterialMetricId }],
      };
    });
    setSelectedMaterialMetricId("");
  };

  const removeMaterialMetricCard = (cardId: string) => {
    setMetricPreferences((current) => ({
      ...current,
      materialCards: current.materialCards.filter((card) => card.id !== cardId),
    }));
  };

  const resetMetricPreferences = () => {
    setMetricPreferences(DEFAULT_METRIC_PREFERENCES);
    setSelectedMaterialMetricId("");
  };

  const exportDate = format(new Date(), "yyyy-MM-dd");
  const exportCsv = (filename: string, columns: CsvColumn[], rows: Record<string, string>[]) => {
    exportCsvFile(rows, columns, filename);
  };
  const exportJson = (filename: string, payload: unknown) => {
    downloadFile(JSON.stringify(payload, null, 2), filename, "application/json");
  };
  const warehouseNameById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));
  const sectionNameById = new Map(sections.map((section) => [section.id, section.name]));
  const formatItemCustomer = (item: { order?: { customer?: { first_name?: string | null; last_name?: string | null } | null } }) =>
    `${item.order?.customer?.first_name ?? ""} ${item.order?.customer?.last_name ?? ""}`.trim();
  const orderItemColumns: CsvColumn[] = [
    { key: "articolo", label: "Articolo" },
    { key: "quantita", label: "Quantità" },
    { key: "stato", label: "Stato" },
    { key: "fornitore", label: "Fornitore" },
    { key: "commessa", label: "Commessa" },
    { key: "cliente", label: "Cliente" },
    { key: "magazzino_arrivo", label: "Magazzino arrivo" },
    { key: "zona", label: "Zona" },
    ...(canViewCosts ? [{ key: "costo", label: "Costo" }] : []),
    { key: "data_lavori", label: "Data lavori" },
    { key: "note", label: "Note" },
  ];
  const mapOrderItemForExport = (item: typeof items[number]) => ({
    articolo: item.name,
    quantita: String(item.quantity ?? 1),
    stato: STATUS_CONFIG[item.status]?.label ?? item.status,
    fornitore: getSupplierName(item.supplier_id) ?? "",
    commessa: item.order.order_code ?? "",
    cliente: formatItemCustomer(item),
    magazzino_arrivo: item.destination_warehouse_id ? warehouseNameById.get(item.destination_warehouse_id) ?? "" : "",
    zona: item.section_id ? sectionNameById.get(item.section_id) ?? "" : "",
    costo: canViewCosts && item.purchase_price != null ? String(item.purchase_price) : "",
    data_lavori: item.order.expected_date ?? item.order.work_start_date ?? "",
    note: item.notes ?? "",
  });
  const exportWorkflowCsv = () => {
    exportCsv(`magazzino_commesse_${exportDate}.csv`, orderItemColumns, filteredItems.map(mapOrderItemForExport));
  };
  const exportPurchasesCsv = () => {
    exportCsv(`magazzino_lista_acquisti_${exportDate}.csv`, orderItemColumns, purchaseItems.map(mapOrderItemForExport));
  };
  const exportInventoryCsv = () => {
    exportCsv(
      `magazzino_inventario_${exportDate}.csv`,
      [
        { key: "articolo", label: "Articolo" },
        { key: "quantita", label: "Quantità" },
        ...(canViewCosts ? [{ key: "costo_unitario", label: "Costo unitario" }, { key: "iva", label: "IVA" }, { key: "valore", label: "Valore" }] : []),
        { key: "fornitore", label: "Fornitore" },
        { key: "magazzino", label: "Magazzino" },
        { key: "zona", label: "Zona" },
        { key: "soglia", label: "Soglia minima" },
        { key: "barcode", label: "Barcode" },
        { key: "codice_interno", label: "Codice interno" },
      ],
      // il magazzino scelto in testata, come i riquadri: prima uscivano tutti
      stockItems.filter((item) => !warehouseFilter || item.warehouse_id === warehouseFilter).map((item) => ({
        articolo: item.name,
        quantita: String(item.quantity ?? 0),
        costo_unitario: canViewCosts ? String(item.unit_cost ?? 0) : "",
        iva: item.vat_rate != null ? `${item.vat_rate}%` : "",
        valore: canViewCosts ? String((item.quantity ?? 0) * (item.unit_cost ?? 0)) : "",
        fornitore: getSupplierName(item.supplier_id) ?? "",
        magazzino: item.warehouse_id ? warehouseNameById.get(item.warehouse_id) ?? "" : "",
        zona: item.section_id ? sectionNameById.get(item.section_id) ?? "" : "",
        soglia: String(item.min_stock_level ?? 0),
        barcode: item.barcode ?? "",
        codice_interno: item.internal_code ?? "",
      })),
    );
  };
  const exportWarehousesCsv = () => {
    exportCsv(
      `magazzino_depositi_zone_${exportDate}.csv`,
      [
        { key: "tipo", label: "Tipo record" },
        { key: "nome", label: "Nome" },
        { key: "categoria", label: "Categoria" },
        { key: "indirizzo", label: "Indirizzo" },
        { key: "descrizione", label: "Descrizione" },
        { key: "stato", label: "Stato" },
      ],
      [
        ...warehouses.map((warehouse) => ({
          tipo: "Magazzino",
          nome: warehouse.name,
          categoria: WAREHOUSE_TYPE_LABEL[warehouse.type] ?? warehouse.type,
          indirizzo: [warehouse.address, warehouse.city, warehouse.province].filter(Boolean).join(", "),
          descrizione: warehouse.notes ?? "",
          stato: warehouse.is_active ? "Attivo" : "Disattivato",
        })),
        ...sections.map((section) => ({
          tipo: "Zona",
          nome: section.name,
          categoria: "Zona operativa",
          indirizzo: "",
          descrizione: section.description ?? "",
          stato: "Attiva",
        })),
      ],
    );
  };
  const exportDocumentsManifest = () => {
    exportJson(`magazzino_documenti_ddt_manifest_${exportDate}.json`, {
      generated_at: new Date().toISOString(),
      scope: warehouseFilter ? warehouseNameById.get(warehouseFilter) : "Tutti i magazzini",
      note: "Manifest per documenti di magazzino: DDT, foto ricezione, allegati commessa e riferimenti ordine.",
      linked_orders: uniqueOrders,
      ddt_related_items: items
        .filter((item) => item.status === "in_arrivo" || item.status === "in_magazzino")
        .map(mapOrderItemForExport),
    });
  };
  const exportCompletePackage = () => {
    exportJson(`magazzino_export_completo_${exportDate}.json`, {
      generated_at: new Date().toISOString(),
      company: effectiveCompany?.name,
      filters: {
        warehouse: warehouseFilter ? warehouseNameById.get(warehouseFilter) : "Tutti",
        searchQuery,
        statusFilter,
        orderFilter,
        supplierFilter,
        sectionFilter,
        quickFilter,
      },
      commesse: filteredItems.map(mapOrderItemForExport),
      lista_acquisti: purchaseItems.map(mapOrderItemForExport),
      inventario: stockItems.filter((item) => !warehouseFilter || item.warehouse_id === warehouseFilter).map((item) => canViewCosts ? item : { ...item, unit_cost: undefined, vat_rate: undefined }),
      magazzini: warehouses,
      zone: sections,
      documenti_manifest: {
        linked_orders: uniqueOrders,
        ddt_related_count: items.filter((item) => item.status === "in_arrivo" || item.status === "in_magazzino").length,
      },
    });
  };

  const warehouseSelect = (
              <Select
                value={warehouseFilter ?? "__all__"}
                onValueChange={(value) => setWarehouseFilter(value === "__all__" ? null : value)}
                disabled={warehousesLoading}
              >
                <SelectTrigger aria-label={t("Filtra per magazzino")} className="h-8 w-full min-w-0 text-xs max-sm:h-11 max-sm:text-sm sm:w-[180px]">
                  <SelectValue placeholder={t("Scegli magazzino")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">
                    {t("Tutti i magazzini")}
                  </SelectItem>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                      {warehouse.is_default ? ` ${t("· default")}` : ""}
                      {" · "}
                      {t(WAREHOUSE_TYPE_LABEL[warehouse.type] ?? warehouse.type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
  );
  const warehouseActions = (
    <>
      {isReadOnly ? <Badge variant="outline" className="h-10 px-3">{t("Sola lettura")}</Badge> : <>
        <Button className="h-8 max-sm:h-11 gap-1.5 px-3 text-xs bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm hover:from-orange-600 hover:to-amber-500 [&_svg]:h-3.5 [&_svg]:w-3.5" onClick={() => apriArrivoMerce()} aria-label={t("Carica merce")}><ArrowDownToLine className="h-4 w-4" aria-hidden="true" />{t("Carica")}</Button>
        <Button className="h-8 max-sm:h-11 gap-1.5 px-2.5 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5" variant="outline" onClick={() => openStockAction("ship")} aria-label={t("Preleva merce")}><ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />{t("Preleva")}</Button>
        {/* «Reso» sta in «Altro» sotto i 1536px (26/11/2026: prima solo da telefono): così ricerca, filtri
            e comandi stanno su una riga anche a 1280. */}
        {permissions.canEditOrders && <Button className="h-8 max-2xl:hidden gap-1.5 px-2.5 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5" variant="outline" onClick={() => setReturnOpen(true)} aria-label={t("Reso da cantiere")}><Undo2 className="h-4 w-4" aria-hidden="true" />{t("Reso")}</Button>}
      </>}
    </>
  );
  const warehouseMenuItems = <>
                  {!isReadOnly && permissions.canEditOrders && (
                    <DropdownMenuItem className="2xl:hidden" onClick={() => setReturnOpen(true)}>
                      <Undo2 className="h-4 w-4 mr-2" />
                      {t("Reso da cantiere")}
                    </DropdownMenuItem>
                  )}
                  {!isReadOnly && (
                    <>
                      <DropdownMenuItem onClick={() => setTransferOpen(true)}>
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        {t("Trasferisci tra magazzini")}
                      </DropdownMenuItem>
                      {gestisceMagazzini && (
                        <DropdownMenuItem onClick={() => navigate("/azienda/magazzino/gestione")}>
                          <SettingsIcon className="h-4 w-4 mr-2" />
                          {t("Gestisci magazzini")}
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                  {!isReadOnly && <>
                    <DropdownMenuItem onClick={() => setReorderOpen(true)} disabled={lowStockAlerts.length === 0}>
                      <ShoppingCart className="mr-2 h-4 w-4" />{t("Riordina sotto scorta")}{lowStockAlerts.length > 0 ? ` (${lowStockAlerts.length})` : ""}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPrelievoSettingsOpen(true)}><Settings2 className="mr-2 h-4 w-4" />{t("Impostazioni prelievi dal cantiere")}</DropdownMenuItem>
                  </>}
                  <DropdownMenuItem onClick={() => setMetricsDialogOpen(true)}>
                    <Settings2 className="h-4 w-4 mr-2" />
                    {t("Personalizza i riquadri")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Download className="h-4 w-4 mr-2" />
                      {t("Esporta")}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-64">
                  <DropdownMenuItem onClick={exportWorkflowCsv}>
                    <List className="h-4 w-4 mr-2" />
                    {t("Lista commesse CSV")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportPurchasesCsv}>
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    {t("Lista acquisti CSV")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportInventoryCsv} disabled={isStockLoading || isStockError}>
                    <Package className="h-4 w-4 mr-2" />
                    {t("Inventario del magazzino CSV")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportWarehousesCsv}>
                    <WarehouseIcon className="h-4 w-4 mr-2" />
                    {t("Magazzini e zone CSV")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportDocumentsManifest}>
                    <FileText className="h-4 w-4 mr-2" />
                    {t("Documenti e DDT JSON")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportCompletePackage} disabled={isStockLoading || isStockError}>
                    <Download className="h-4 w-4 mr-2" />
                    {t("Pacchetto completo JSON")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-2" />
                    {t("Stampa lista")}
                  </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>;

  return (
    <div className="space-y-3 print:space-y-4">
      {/* Spazi da 12px anche da tablet in su (25/11/2026): la tabella partiva a 536px dalla testata. */}
      <WarehousePendingOperations />
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          {/* Come la testata delle schede di Commesse (25/11/2026): titolo a 20px, senza la frase sotto. */}
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{t("Magazzino")}</h1>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">{t("Magazzino - {name}", { name: String(effectiveCompany.name ?? "") })}</h1>
        <p className="text-sm text-muted-foreground">{t("Generato il {valore}", { valore: format(new Date(), "dd MMMM yyyy", { locale: dateFnsCampo() }) })}</p>
      </div>

      {/* Error state */}
      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("Errore di caricamento")}</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{t("Impossibile caricare i dati del magazzino.")}</span>
            <Button variant="outline" size="sm" onClick={refetch} className="ml-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t("Riprova")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isStockError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>{t("Inventario non disponibile")}</AlertTitle><AlertDescription>{t("Articoli ed esportazione dell’inventario non sono aggiornati.")} <Button variant="outline" size="sm" onClick={() => void refetchStock()}>{t("Riprova inventario")}</Button></AlertDescription></Alert>}

      {/* Banner avvisi RIMOSSI completamente — riducono il rumore visivo
          e duplicano informazioni già presenti nelle KPI cliccabili sotto. */}

      {/* Prelievi dal cantiere: impostazione (libero/conferma) + coda da confermare. */}
      <div className="space-y-3 print:hidden">
        {!isReadOnly && <PrelieviCampoCard />}
        <AcquistiCampoCard />
        <div className="max-md:hidden"><RigheDaAbbinareCard /></div>
      </div>

      <div className="space-y-3 print:hidden">
        {/* «Personalizza i riquadri» sta nel menu ⋯ della testata: qui era una
            riga intera sopra i numeri per un bottone. */}
        <OperationalSummary
          compatto
          inLinea
          label={t("Riepilogo magazzino")}
          title={activeWarehouse?.name ?? t("Tutti i magazzini")}
          icon={WarehouseIcon}
          error={riepilogoError}
          note={<>{riepilogoFetching ? t("Aggiornamento del riepilogo…") : t("Totali del magazzino selezionato, indipendenti dai filtri dell’elenco.")}{riepilogoError && <Button variant="ghost" size="sm" className="ml-2 text-white hover:bg-white/10 hover:text-white" onClick={() => void refetchRiepilogo()}>{t("Riprova riepilogo")}</Button>}</>}
        >
        <div className="col-span-full space-y-3">
          {gruppoAttivo === "preparare" ? (
            <WarehouseStats riepilogo={riepilogo?.righe} activeFilter={activeStatsFilter} onCardClick={handleStatsCardClick} isLoading={riepilogoLoading} canViewCosts={canViewCosts} visibleCards={metricPreferences.order} />
          ) : (
            <WarehouseInventoryStats riepilogo={riepilogo} visibleCards={metricPreferences.inventory} onCardClick={handleInventoryCardClick} activeKey={viewMode === "stock" && stockMetricFilter !== "all" ? stockMetricFilter : null} isLoading={riepilogoLoading} canViewCosts={canViewCosts} />
          )}
          {!isStockLoading && !isStockError && materialMetricCards.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {materialMetricCards.map((card) => {
                const quantity = Number(card.item.quantity ?? 0);
                const unitCost = Number(card.item.unit_cost ?? 0);
                return (
                  <Card key={card.id} className="relative overflow-hidden border-slate-200/80 bg-gradient-to-br from-white to-slate-50/80 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                    <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" />
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                            {t("Giacenza materiale")}
                          </p>
                          <p className="truncate text-sm font-medium" title={card.item.name}>
                            {card.label || card.item.name}
                          </p>
                        </div>
                        <Package className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-2xl font-bold leading-tight text-emerald-600">
                        {quantity}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {canViewCosts && unitCost > 0 ? t("{valore} valore", { valore: formatCurrency(quantity * unitCost) }) : t("giacenza fisica")}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        </OperationalSummary>
      </div>

      <Dialog open={prelievoSettingsOpen} onOpenChange={setPrelievoSettingsOpen}>
        <DialogContent><DialogHeader><DialogTitle>{t("Prelievi dal cantiere")}</DialogTitle><DialogDescription>{t("Scegli se le richieste di materiale devono essere approvate dall’ufficio.")}</DialogDescription></DialogHeader>{!isReadOnly && <ImpostazionePrelievoCampo />}</DialogContent>
      </Dialog>

      <Dialog open={metricsDialogOpen} onOpenChange={setMetricsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("Personalizza card magazzino")}</DialogTitle>
            <DialogDescription>
              {t("Mostra solo le metriche utili e aggiungi card dedicate alla giacenza dei singoli materiali.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2 lg:grid-cols-2">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">{t("Workflow commesse")}</h3>
                <p className="text-xs text-muted-foreground">{t("Card cliccabili che filtrano le commesse.")}</p>
              </div>
              <div className="space-y-2">
                {DEFAULT_ORDER_METRICS.map((metric) => (
                  <Label key={metric} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                    <Checkbox
                      checked={metricPreferences.order.includes(metric)}
                      onCheckedChange={() => toggleOrderMetric(metric)}
                    />
                    <span>{t(ORDER_METRIC_LABELS[metric])}</span>
                  </Label>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">{t("Inventario")}</h3>
                <p className="text-xs text-muted-foreground">{t("Metriche sintetiche su giacenze e valore.")}</p>
              </div>
              <div className="space-y-2">
                {ALL_INVENTORY_METRICS.map((metric) => (
                  <Label key={metric} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                    <Checkbox
                      checked={metricPreferences.inventory.includes(metric)}
                      onCheckedChange={() => toggleInventoryMetric(metric)}
                    />
                    <span>{t(INVENTORY_METRIC_LABELS[metric])}</span>
                  </Label>
                ))}
              </div>
            </section>

            <section className="space-y-3 lg:col-span-2">
              <div>
                <h3 className="text-sm font-semibold">{t("Card materiali")}</h3>
                <p className="text-xs text-muted-foreground">{t("Aggiungi una card per controllare la giacenza di un materiale preciso.")}</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={selectedMaterialMetricId}
                  onValueChange={setSelectedMaterialMetricId}
                  disabled={stockItems.length === 0}
                >
                  <SelectTrigger className="min-w-0 flex-1">
                    <SelectValue placeholder={t("Scegli materiale")} />
                  </SelectTrigger>
                  <SelectContent>
                    {stockItems.map((item) => (
                      <SelectItem
                        key={item.id}
                        value={item.id}
                        disabled={metricPreferences.materialCards.some((card) => card.stockItemId === item.id)}
                      >
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  onClick={addMaterialMetricCard}
                  disabled={!selectedMaterialMetricId}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("Aggiungi card")}
                </Button>
              </div>

              {materialMetricCards.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {materialMetricCards.map((card) => (
                    <div key={card.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{card.item.name}</p>
                        <p className="text-xs text-muted-foreground">{t("Giacenza: {valore}", { valore: Number(card.item.quantity ?? 0) })}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMaterialMetricCard(card.id)}
                        aria-label={t("Rimuovi card {name}", { name: String(card.item.name ?? "") })}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  {t("Nessuna card materiale aggiunta.")}
                </div>
              )}
            </section>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={resetMetricPreferences}>
              {t("Ripristina riquadri predefiniti")}
            </Button>
            <Button type="button" onClick={() => setMetricsDialogOpen(false)}>
              {t("Fine")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Banner alert lotti scadenza (compatto, dismissible) */}
      <LottiScadenzaAlert compact />

      <Card className="print:hidden max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none">
        {/* Riquadro dei filtri più stretto: erano 24px sopra e 16 tra le righe,
            e la lista cominciava sotto la piega. */}
        <CardContent className="p-2 max-sm:p-0">
          <div className="flex flex-col gap-3 max-sm:gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Quattro gruppi invece di undici schede in fila (29/10/2026). */}
              <MagazzinoVisteSwitch
                gruppi={gruppi}
                gruppoAttivo={gruppoAttivo}
                vista={viewMode}
                onGruppo={handleGruppoChange}
                onVista={handleViewModeChange}
              />

              {viewMode === "list" && (
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                  <SelectTrigger className="h-8 w-full text-xs sm:w-[170px] max-sm:hidden" aria-label={t("Raggruppa per")}>
                    <SelectValue placeholder={t("Raggruppa per")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order">{t("Per commessa")}</SelectItem>
                    <SelectItem value="date">{t("Per data lavori")}</SelectItem>
                    <SelectItem value="status">{t("Per stato")}</SelectItem>
                    <SelectItem value="supplier">{t("Per fornitore")}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* 26/11/2026: magazzino, ricerca, filtri e comandi su una riga (prima tre righe). */}
            {viewMode !== "stock" && <div className="flex flex-wrap items-center gap-2">
              {warehouseSelect}
              {isOrderView && (<>
              <div className={RICERCA_BARRA}>
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder={t("Cerca articolo...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs max-sm:h-9"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="tap-compact sm:hidden shrink-0 max-sm:h-9 max-sm:w-9"
                onClick={() => setScannerOpen(true)}
                title={t("Scansiona barcode")}
              >
                <ScanLine className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setFiltersSheetOpen(true)}
                className="tap-compact h-8 shrink-0 gap-1.5 px-2.5 text-xs max-sm:h-9 [&_svg]:h-3.5 [&_svg]:w-3.5"
                title={t("Apri filtri avanzati")}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">{t("Filtri")}</span>
                {hasActiveFilters && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    {[
                      statusFilter !== "all",
                      orderFilter !== "all",
                      supplierFilter !== "all",
                      sectionFilter !== "all",
                      lottoFilter !== "all",
                    ].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setSerialsSheetOpen(true)}
                className="h-8 shrink-0 gap-1.5 px-2.5 text-xs max-sm:hidden [&_svg]:h-3.5 [&_svg]:w-3.5"
                title={t("Cerca tra tutti i seriali del magazzino")}
              >
                <Package className="h-4 w-4" />
                <span className="hidden sm:inline">{t("Seriali")}</span>
              </Button>
              </>)}
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{warehouseActions}
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="h-8 max-sm:h-11 gap-1.5 px-2.5 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5" aria-label={t("Altre azioni del magazzino")}><MoreHorizontal className="h-4 w-4" />{t("Altro")}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-64">{warehouseMenuItems}</DropdownMenuContent></DropdownMenu>
              </div>
            </div>}

            {/* Quick filters — solo workflow commesse (sono filtri commessa-related:
                Da Lavorare, Urgenti, In Ritardo, Questa/Prox. sett. di lavori). Su
                Inventario sono inerti e occupano spazio inutilmente. */}
            {isOrderView && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:flex-wrap sm:pb-0 max-sm:pb-0 [&>button]:h-7 [&>button]:rounded-full [&>button]:px-3 [&>button]:text-xs [&>button]:font-medium [&_svg]:h-3.5 [&_svg]:w-3.5 [&>button[aria-pressed=true]]:border-orange-200 [&>button[aria-pressed=true]]:bg-orange-50 [&>button[aria-pressed=true]]:text-orange-700 [&>button[aria-pressed=true]]:shadow-none">
              <Button
                variant="outline"
                aria-pressed={quickFilter === "all"}
                size="sm"
                onClick={() => setQuickFilter("all")}
                className="tap-compact shrink-0"
              >
                {t("Tutti")}
              </Button>
              <Button
                variant="outline"
                aria-pressed={quickFilter === "active"}
                size="sm"
                onClick={() => setQuickFilter("active")}
                className="tap-compact gap-1 shrink-0"
              >
                <WarehouseIcon className="h-4 w-4" />
                {t("Da Lavorare")}
                {activeItemsCount > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                    {activeItemsCount}
                  </Badge>
                )}
              </Button>
              <Button
                variant="outline"
                aria-pressed={quickFilter === "urgent"}
                size="sm"
                onClick={() => setQuickFilter("urgent")}
                className="tap-compact gap-1 shrink-0"
              >
                <AlertTriangle className="h-4 w-4" />
                {t("Urgenti")}
                {urgentItemsCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-red-100 px-1.5 text-[10px] font-bold text-red-700">
                    {urgentItemsCount}
                  </span>
                )}
              </Button>
              {/* "In Ritardo" pill rimosso — duplicato della KPI card cliccabile sopra. */}
              <Button
                variant="outline"
                aria-pressed={quickFilter === "thisWeek"}
                size="sm"
                onClick={() => setQuickFilter("thisWeek")}
                className="tap-compact gap-1 shrink-0"
                title={t("Articoli con la posa in questa settimana (lunedì–domenica)")}
              >
                <Clock className="h-4 w-4" />
                {t("Questa settimana")}
              </Button>
              <Button
                variant="outline"
                aria-pressed={quickFilter === "nextWeek"}
                size="sm"
                onClick={() => setQuickFilter("nextWeek")}
                className="gap-1 shrink-0 max-sm:hidden"
                title={t("Articoli con la posa nella prossima settimana")}
              >
                <Clock className="h-4 w-4" />
                {t("Prossima settimana")}
              </Button>
            </div>
            )}

          </div>
        </CardContent>
      </Card>

      {/* Sheet filtri avanzati — sidebar destra, dismiss on outside click */}
      <Sheet open={filtersSheetOpen} onOpenChange={setFiltersSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5" />
              {t("Filtri avanzati")}
            </SheetTitle>
            <SheetDescription>
              {t("Filtra gli articoli per stato, ordine, fornitore o zona del magazzino.")}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("Stato")}
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Stato")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("Tutti gli stati")}</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                    <SelectItem key={status} value={status}>
                      {t(config.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("Ordine")}
              </label>
              <Select value={orderFilter} onValueChange={setOrderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Ordine")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("Tutti gli ordini")}</SelectItem>
                  {uniqueOrders.map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.code} - {order.customer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("Fornitore")}
              </label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Fornitore")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("Tutti i fornitori")}</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sections.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("Zona magazzino")}
                </label>
                <Select value={sectionFilter} onValueChange={setSectionFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("Zona")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("Tutte le zone")}</SelectItem>
                    <SelectItem value="__none__">{t("Nessuna zona")}</SelectItem>
                    {sections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Filtro lotto: mostrato solo se ci sono lotti registrati per la
                company. Utile per fotovoltaico/impiantistica → "mostrami solo
                gli articoli del bancale ricevuto a giugno (LOT-2026-0042)". */}
            {lotti.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("Lotto / Bancale")}
                </label>
                <Select value={lottoFilter} onValueChange={setLottoFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("Lotto")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("Tutti i lotti")}</SelectItem>
                    {lotti.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.codice_lotto}
                        {l.descrizione ? ` · ${l.descrizione}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <SheetFooter className="flex-row gap-2 sm:flex-row sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                clearFilters();
                setFiltersSheetOpen(false);
              }}
              disabled={!hasActiveFilters}
              className="flex-1"
            >
              <X className="h-4 w-4 mr-2" />
              {t("Pulisci tutto")}
            </Button>
            <Button onClick={() => setFiltersSheetOpen(false)} className="flex-1">
              {t("Applica")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Content based on view mode */}
      {viewMode === "purchase_list" ? (
        <WarehousePurchaseListTab
          companyId={effectiveCompany.id}
          items={purchaseItems}
          stockItems={stockItems}
          suppliers={suppliers}
          warehouseFilter={warehouseFilter}
          onStatusChange={workflowReadOnly ? readonlyWarehouseAction : handleStatusChange}
          onRegisterArrival={isReadOnly ? readonlyWarehouseAction : apriArrivoMerce}
          readOnly={isReadOnly}
        />
      ) : viewMode === "ddt" ? (
        <WarehouseDDTTab warehouseFilter={warehouseFilter} onRegisterArrival={isReadOnly ? undefined : apriArrivoMerce} />
      ) : viewMode === "uscite" ? (
        <WarehouseUsciteTab warehouseFilter={warehouseFilter} readOnly={isReadOnly} />
      ) : viewMode === "lotti" ? (
        <WarehouseLottiTab readOnly={isReadOnly} />
      ) : viewMode === "valuation" ? (
        <WarehouseValorizzazionePanel warehouseId={warehouseFilter ?? null} />
      ) : viewMode === "ritiri" ? (
        <RitiriDalCantiere />
      ) : viewMode === "movements" ? (
        <WarehouseMovementsTab companyId={effectiveCompany.id} warehouseFilter={warehouseFilter} />
      ) : viewMode === "stock" ? (
        <div className="space-y-3">
          <WarehouseStockTab
            key={`${effectiveCompany.id}:${warehouseFilter ?? "all"}`}
            warehouseFilter={warehouseFilter}
            warehouseSelect={warehouseSelect}
            primaryActions={warehouseActions}
            additionalMenuItems={warehouseMenuItems}
            onReorder={isReadOnly ? undefined : () => setReorderOpen(true)}
            actionRequest={stockActionRequest}
            onActionHandled={clearStockAction}
            onRegisterArrival={apriArrivoMerce}
            showMovementActions={false}
            metricFilter={stockMetricFilter}
            onMetricFilterChange={setStockMetricFilter}
            readOnly={isReadOnly}
          />
        </div>
      ) : isLoading ? (
        <div
          className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          <span className="text-sm">{t("Caricamento articoli…")}</span>
        </div>
      ) : isError ? null : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-14 flex flex-col items-center justify-center gap-3 text-center">
            <Package className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {hasActiveFilters ? t("Nessun articolo trovato") : t("Magazzino vuoto")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {hasActiveFilters
                  ? t("Prova a modificare i filtri o la ricerca.")
                  : t("Aggiungi articoli dal catalogo per iniziare a gestire il magazzino.")}
              </p>
            </div>
            {!hasActiveFilters && !isReadOnly && (
              <a
                href="/azienda/impostazioni/catalogo"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t("Vai al catalogo articoli")}
              </a>
            )}
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Selection bar */}
          {!workflowReadOnly && selectedItemIds.size > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-3 flex items-center gap-3">
                <span className="text-sm font-medium">
                  {selectedItemIds.size === 1 ? t("{n} articolo selezionato", { n: 1 }) : t("{n} articoli selezionati", { n: selectedItemIds.size })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("Trascina sulla mappa per assegnare zona")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setSelectedItemIds(new Set())}
                >
                  <X className="h-4 w-4 mr-1" />
                  {t("Deseleziona")}
                </Button>
              </CardContent>
            </Card>
          )}

          {viewMode === "list" && (
            <WarehouseListView
              orderGroups={filteredGroups}
              onStatusChange={workflowReadOnly ? readonlyWarehouseAction : handleStatusChange}
              onMarkAllInstalled={workflowReadOnly ? readonlyWarehouseAction : handleMarkAllInstalled}
              onBatchStatusChange={workflowReadOnly ? readonlyWarehouseAction : handleBatchStatusChange}
              getSupplierName={getSupplierName}
              isUpdating={isUpdating}
              stockItems={stockItems}
              onUpdateNotes={workflowReadOnly ? readonlyWarehouseAction : handleUpdateNotes}
              groupBy={groupBy}
              sections={sections}
              onSectionChange={workflowReadOnly ? readonlyWarehouseAction : handleSingleSectionChange}
              readOnly={workflowReadOnly}
            />
          )}

          {viewMode === "kanban" && (
            <WarehouseKanbanView
              items={filteredItems}
              onStatusChange={workflowReadOnly ? readonlyWarehouseAction : handleStatusChange}
              onUpdateNotes={workflowReadOnly ? readonlyWarehouseAction : handleUpdateNotes}
              getSupplierName={getSupplierName}
              isUpdating={isUpdating}
              selectedIds={selectedItemIds}
              onToggleSelection={workflowReadOnly ? readonlyWarehouseAction : toggleItemSelection}
              readOnly={workflowReadOnly}
            />
          )}

          {viewMode === "calendar" && (
            <WarehouseCalendarView items={filteredItems} />
          )}

          {/* Drag Overlay */}
          <DragOverlay dropAnimation={null}>
            {draggingItem && (
              <div className="bg-background border rounded-md shadow-lg px-4 py-2 flex items-center gap-2 text-sm font-medium opacity-90">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                {draggingItem.name}
                {selectedItemIds.has(draggingItem.id) && selectedItemIds.size > 1 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    +{selectedItemIds.size - 1}
                  </Badge>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Pagination */}
      {isWorkflowView && totalPages > 1 && (
        <div className="flex items-center justify-between print:hidden">
          <p className="text-sm text-muted-foreground">
            {t(totalCount === 1 ? "{n} articolo totali — Pagina {pagina} di {totale}" : "{n} articoli totali — Pagina {pagina} di {totale}", { n: totalCount, pagina: page + 1, totale: totalPages })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("Precedente")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
            >
              {t("Successiva")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* M7 — Barcode/QR scanner (mobile) */}
      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={(result) => setSearchQuery(result)}
      />

      {!isReadOnly && returnOpen && <Suspense fallback={null}><ResoCantiereDialog key={effectiveCompany.id} onOpenChange={setReturnOpen} warehouseId={warehouseFilter} /></Suspense>}

      <WarehouseTransferPanel
        open={!isReadOnly && transferOpen}
        onOpenChange={setTransferOpen}
      />

      <StockUnitsDrilldownSheet
        open={serialsSheetOpen}
        onOpenChange={setSerialsSheetOpen}
        lotti={lotti}
      />

      {/* Arrivo merce: prima l'ordine, poi il gesto. */}
      {!isReadOnly && (
        <ArrivoMerceEntryDialog
          open={arrivoChooserOpen}
          onOpenChange={setArrivoChooserOpen}
          companyId={effectiveCompany.id}
          onSelectOda={setArrivoOdaId}
          onCaricoLibero={() => openStockAction("receive", arrivalItem)}
        />
      )}

      {!isReadOnly && arrivoOdaId && (
        <Suspense fallback={null}>
          <OdaArrivoMerceSheet
            open={!!arrivoOdaId}
            onOpenChange={(v) => !v && setArrivoOdaId(null)}
            odaId={arrivoOdaId}
            companyId={effectiveCompany.id}
            warehouseId={arrivalItem?.warehouse_id ?? warehouseFilter ?? null}
          />
        </Suspense>
      )}

      {/* Riordino sottoscorta → genera ODA raggruppati per fornitore */}
      <LowStockReorderDialog
        open={reorderOpen}
        onOpenChange={setReorderOpen}
        companyId={effectiveCompany.id}
        readOnly={isReadOnly}
        warehouseId={warehouseFilter ?? null}
        articoliVisibili={articoliDelMagazzino}
      />
    </div>
  );
}
