import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
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
  LayoutGrid,
  Calendar as CalendarIcon,
  Download,
  Printer,
  AlertTriangle,
  Clock,
  PackageOpen,
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
  Star,
  Trash2,
  ShoppingCart,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
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

import WarehouseStats, { type WarehouseOrderMetricKey } from "@/components/warehouse/WarehouseStats";
import WarehouseInventoryStats, { type WarehouseInventoryMetricKey } from "@/components/warehouse/WarehouseInventoryStats";
import WarehouseKanbanView from "@/components/warehouse/WarehouseKanbanView";
import WarehouseCalendarView from "@/components/warehouse/WarehouseCalendarView";
import WarehouseListView from "@/components/warehouse/WarehouseListView";
import WarehouseStockTab from "@/components/warehouse/WarehouseStockTab";
import WarehouseLottiTab from "@/components/warehouse/WarehouseLottiTab";
import { WarehouseDDTTab } from "@/components/warehouse/WarehouseDDTTab";
import WarehousePurchaseListTab from "@/components/warehouse/WarehousePurchaseListTab";
import { WarehouseValorizzazionePanel } from "@/components/warehouse/WarehouseValorizzazionePanel";
import { LottiScadenzaAlert } from "@/components/warehouse/LottiScadenzaAlert";
import { ArticoliCSVImportDialog } from "@/components/warehouse/ArticoliCSVImportDialog";
import { Calculator } from "lucide-react";

import { STATUS_CONFIG } from "@/types/warehouse";
import type { WarehouseItem } from "@/types/warehouse";
import { useWarehouseData } from "@/hooks/useWarehouseData";
import { useWarehouseSections } from "@/hooks/useWarehouseSections";
import { useWarehouses } from "@/hooks/useWarehouses";
import { WarehouseTransferPanel } from "@/components/warehouse/WarehouseTransferPanel";
import type { ViewMode, GroupBy } from "@/hooks/useWarehouseData";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { formatCurrency } from "@/lib/formatters";
import { downloadFile, exportToCSV as exportCsvFile, type CsvColumn } from "@/lib/csvExport";

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
  "total_quantity",
  "low_stock",
];

const ALL_INVENTORY_METRICS: WarehouseInventoryMetricKey[] = [
  ...DEFAULT_INVENTORY_METRICS,
  "critical_materials",
  "near_low_stock",
  "incoming_7d",
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
  total_quantity: "Quantità totale",
  low_stock: "Sottoscorta",
  critical_materials: "Materiali critici",
  near_low_stock: "In esaurimento",
  incoming_7d: "In arrivo 7gg",
  missing_cost: "Senza costo",
};

export default function Warehouse() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isCommercialistaMode = searchParams.get("commercialistaMode") === "1";
  const {
    items,
    filteredItems,
    filteredGroups,
    purchaseItems,
    suppliers,
    stockItems,
    uniqueOrders,
    urgentItemsCount,
    activeItemsCount,
    page,
    setPage,
    totalPages,
    totalCount,
    viewMode,
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
    exportToCSV,
    refetch,
    effectiveCompany,
  } = useWarehouseData();

  const { sections } = useWarehouseSections();
  const {
    warehouses,
    isLoading: warehousesLoading,
  } = useWarehouses(true);
  const { isScopriPlan } = useSubscriptionLimits();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [serialsSheetOpen, setSerialsSheetOpen] = useState(false);
  const [stockActionRequest, setStockActionRequest] = useState<StockActionRequest>(null);
  const [metricsDialogOpen, setMetricsDialogOpen] = useState(false);
  const [metricPreferences, setMetricPreferences] = useState<MetricPreferences>(DEFAULT_METRIC_PREFERENCES);
  const [metricPreferencesLoaded, setMetricPreferencesLoaded] = useState(false);
  const [selectedMaterialMetricId, setSelectedMaterialMetricId] = useState<string>("");

  const metricStorageKey = effectiveCompany?.id
    ? `warehouse-metric-preferences:${effectiveCompany.id}`
    : null;

  useEffect(() => {
    setMetricPreferencesLoaded(false);
    if (!metricStorageKey) return;

    try {
      const stored = window.localStorage.getItem(metricStorageKey);
      if (!stored) {
        setMetricPreferences(DEFAULT_METRIC_PREFERENCES);
        setMetricPreferencesLoaded(true);
        return;
      }

      const parsed = JSON.parse(stored) as Partial<MetricPreferences>;
      setMetricPreferences({
        order: parsed.order?.filter((key): key is WarehouseOrderMetricKey =>
          DEFAULT_ORDER_METRICS.includes(key as WarehouseOrderMetricKey),
        ) ?? DEFAULT_ORDER_METRICS,
        inventory: parsed.inventory?.filter((key): key is WarehouseInventoryMetricKey =>
          ALL_INVENTORY_METRICS.includes(key as WarehouseInventoryMetricKey),
        ) ?? DEFAULT_INVENTORY_METRICS,
        materialCards: Array.isArray(parsed.materialCards) ? parsed.materialCards : [],
      });
      setMetricPreferencesLoaded(true);
    } catch {
      setMetricPreferences(DEFAULT_METRIC_PREFERENCES);
      setMetricPreferencesLoaded(true);
    }
  }, [metricStorageKey]);

  useEffect(() => {
    if (!metricStorageKey || !metricPreferencesLoaded) return;
    window.localStorage.setItem(metricStorageKey, JSON.stringify(metricPreferences));
  }, [metricPreferences, metricPreferencesLoaded, metricStorageKey]);

  const materialMetricCards = useMemo(
    () =>
      metricPreferences.materialCards
        .map((card) => {
          const item = stockItems.find((stockItem) => stockItem.id === card.stockItemId);
          return item ? { ...card, item } : null;
        })
        .filter((card): card is MaterialMetricCard & { item: NonNullable<typeof stockItems[number]> } => Boolean(card)),
    [metricPreferences.materialCards, stockItems],
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
    if (isCommercialistaMode) return;
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
  }, [isCommercialistaMode, selectedItemIds, handleBatchSectionChange, filteredItems, handleStatusChange]);

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
        Seleziona un'azienda per visualizzare il magazzino.
      </div>
    );
  }

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

  const openStockAction = (type: "receive" | "ship") => {
    setViewMode("stock");
    setStockActionRequest({ type, nonce: Date.now() });
  };

  const handleViewModeChange = (value: string) => {
    const nextViewMode = value as ViewMode;
    setViewMode(nextViewMode);
    if (nextViewMode === "stock") {
      setStockActionRequest(null);
    }
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
    { key: "costo", label: "Costo" },
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
    costo: item.purchase_price != null ? String(item.purchase_price) : "",
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
        { key: "costo_unitario", label: "Costo unitario" },
        { key: "iva", label: "IVA" },
        { key: "valore", label: "Valore" },
        { key: "fornitore", label: "Fornitore" },
        { key: "magazzino", label: "Magazzino" },
        { key: "zona", label: "Zona" },
        { key: "soglia", label: "Soglia minima" },
        { key: "barcode", label: "Barcode" },
        { key: "codice_interno", label: "Codice interno" },
      ],
      stockItems.map((item) => ({
        articolo: item.name,
        quantita: String(item.quantity ?? 0),
        costo_unitario: String(item.unit_cost ?? 0),
        iva: item.vat_rate != null ? `${item.vat_rate}%` : "",
        valore: String((item.quantity ?? 0) * (item.unit_cost ?? 0)),
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
      inventario: stockItems,
      magazzini: warehouses,
      zone: sections,
      documenti_manifest: {
        linked_orders: uniqueOrders,
        ddt_related_count: items.filter((item) => item.status === "in_arrivo" || item.status === "in_magazzino").length,
      },
    });
  };

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 sm:px-6 pt-5 pb-5 shadow-sm flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between print:hidden">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <WarehouseIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight">
              Magazzino
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Materiali, acquisti, DDT, lotti e inventario in un'unica vista operativa.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 xl:w-auto xl:items-end">
          <div className="flex w-full flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-end">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
              <span className="text-sm font-semibold text-muted-foreground sm:hidden">
                Magazzino
              </span>
              <Select
                value={warehouseFilter ?? "__all__"}
                onValueChange={(value) => setWarehouseFilter(value === "__all__" ? null : value)}
                disabled={warehousesLoading}
              >
                <SelectTrigger className="h-9 w-full sm:w-[300px] xl:w-[320px]">
                  <SelectValue placeholder="Scegli magazzino" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">
                    Tutti i magazzini · vista consolidata
                  </SelectItem>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                      {warehouse.is_default ? " · default" : ""}
                      {" · "}
                      {WAREHOUSE_TYPE_LABEL[warehouse.type] ?? warehouse.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeWarehouse?.is_default && (
                <Badge variant="outline" className="h-9 gap-1 bg-amber-50 px-3 text-amber-700 border-amber-200">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden="true" />
                  Predefinito
                </Badge>
              )}
              {!isCommercialistaMode && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
                    <ArrowLeftRight className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                    <span className="hidden sm:inline">Trasferisci</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("/azienda/magazzino/gestione")}>
                    <SettingsIcon className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                    <span className="hidden sm:inline">Gestisci magazzini</span>
                  </Button>
                </>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Apri menu esportazione magazzino"
                  >
                    <Download className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Esporta</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Esporta dati magazzino</DropdownMenuLabel>
                  <DropdownMenuItem onClick={exportToCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    Vista corrente CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportWorkflowCsv}>
                    <List className="h-4 w-4 mr-2" />
                    Lista commesse CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportPurchasesCsv}>
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Lista acquisti CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportInventoryCsv}>
                    <Package className="h-4 w-4 mr-2" />
                    Inventario CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportWarehousesCsv}>
                    <WarehouseIcon className="h-4 w-4 mr-2" />
                    Magazzini e zone CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportDocumentsManifest}>
                    <FileText className="h-4 w-4 mr-2" />
                    Documenti e DDT JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportCompletePackage}>
                    <Download className="h-4 w-4 mr-2" />
                    Pacchetto completo JSON
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-2" />
                    Stampa lista
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">Magazzino - {effectiveCompany.name}</h1>
        <p className="text-sm text-muted-foreground">
          Generato il {format(new Date(), "dd MMMM yyyy", { locale: it })}
        </p>
      </div>

      {/* Error state */}
      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Errore di caricamento</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Impossibile caricare i dati del magazzino.</span>
            <Button variant="outline" size="sm" onClick={refetch} className="ml-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 print:hidden" aria-label="Azioni rapide magazzino">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Operazioni magazzino</h2>
            <p className="text-sm text-muted-foreground">
              {isCommercialistaMode
                ? "Vista consulente: controlla materiali, DDT, scorte e fabbisogni senza eseguire movimenti."
                : "Registra arrivi, genera DDT di uscita e controlla inventario senza cambiare flusso mentale."}
            </p>
          </div>
          {isCommercialistaMode ? (
            <Badge variant="outline" className="w-fit border-blue-200 bg-blue-50 text-blue-700">
              Sola lettura
            </Badge>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:items-center">
              <Button
                onClick={() => openStockAction("receive")}
                className="justify-start gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
              >
                <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                Registra arrivo merce
              </Button>
              <Button variant="outline" onClick={() => openStockAction("ship")} className="justify-start gap-2">
                <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
                Uscita merce
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Banner avvisi RIMOSSI completamente — riducono il rumore visivo
          e duplicano informazioni già presenti nelle KPI cliccabili sotto. */}

      <div className="space-y-3 print:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Metriche magazzino</h2>
            <p className="text-xs text-muted-foreground">
              Scegli le card operative, inventario e materiali da tenere sott'occhio.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setMetricsDialogOpen(true)} className="shrink-0 gap-2">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Personalizza card</span>
          </Button>
        </div>
        <div className="space-y-3">
          <WarehouseStats
            items={items}
            activeFilter={activeStatsFilter}
            onCardClick={handleStatsCardClick}
            visibleCards={metricPreferences.order}
          />
          <WarehouseInventoryStats
            stockItems={stockItems}
            orderItems={items}
            visibleCards={metricPreferences.inventory}
          />
          {materialMetricCards.length > 0 && (
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
                            Giacenza materiale
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
                        {unitCost > 0 ? `${formatCurrency(quantity * unitCost)} valore` : "giacenza disponibile"}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={metricsDialogOpen} onOpenChange={setMetricsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Personalizza card magazzino</DialogTitle>
            <DialogDescription>
              Mostra solo le metriche utili e aggiungi card dedicate alla giacenza dei singoli materiali.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2 lg:grid-cols-2">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Workflow commesse</h3>
                <p className="text-xs text-muted-foreground">Card cliccabili che filtrano le commesse.</p>
              </div>
              <div className="space-y-2">
                {DEFAULT_ORDER_METRICS.map((metric) => (
                  <Label key={metric} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                    <Checkbox
                      checked={metricPreferences.order.includes(metric)}
                      onCheckedChange={() => toggleOrderMetric(metric)}
                    />
                    <span>{ORDER_METRIC_LABELS[metric]}</span>
                  </Label>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Inventario</h3>
                <p className="text-xs text-muted-foreground">Metriche sintetiche su giacenze e valore.</p>
              </div>
              <div className="space-y-2">
                {ALL_INVENTORY_METRICS.map((metric) => (
                  <Label key={metric} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                    <Checkbox
                      checked={metricPreferences.inventory.includes(metric)}
                      onCheckedChange={() => toggleInventoryMetric(metric)}
                    />
                    <span>{INVENTORY_METRIC_LABELS[metric]}</span>
                  </Label>
                ))}
              </div>
            </section>

            <section className="space-y-3 lg:col-span-2">
              <div>
                <h3 className="text-sm font-semibold">Card materiali</h3>
                <p className="text-xs text-muted-foreground">Aggiungi una card per controllare la giacenza di un materiale preciso.</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={selectedMaterialMetricId}
                  onValueChange={setSelectedMaterialMetricId}
                  disabled={stockItems.length === 0}
                >
                  <SelectTrigger className="min-w-0 flex-1">
                    <SelectValue placeholder="Scegli materiale" />
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
                  Aggiungi card
                </Button>
              </div>

              {materialMetricCards.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {materialMetricCards.map((card) => (
                    <div key={card.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{card.item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Giacenza: {Number(card.item.quantity ?? 0)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMaterialMetricCard(card.id)}
                        aria-label={`Rimuovi card ${card.item.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Nessuna card materiale aggiunta.
                </div>
              )}
            </section>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={resetMetricPreferences}>
              Ripristina 8 card base
            </Button>
            <Button type="button" onClick={() => setMetricsDialogOpen(false)}>
              Fine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Banner alert lotti scadenza (compatto, dismissible) */}
      <LottiScadenzaAlert compact />

      <Card className="print:hidden">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <Tabs value={viewMode} onValueChange={handleViewModeChange} className="min-w-0">
                <TabsList className="flex h-auto w-full max-w-full justify-start gap-1 overflow-x-auto rounded-xl p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <TabsTrigger value="list" className="shrink-0 gap-1.5 px-2.5" aria-label="Vista lista commesse">
                    <List className="h-4 w-4" />
                    <span className="text-[11px] sm:text-sm">Commesse</span>
                  </TabsTrigger>
                  <TabsTrigger value="purchase_list" className="shrink-0 gap-1.5 px-2.5" aria-label="Vista lista acquisti">
                    <ShoppingCart className="h-4 w-4" />
                    <span className="text-[11px] sm:text-sm">Acquisti</span>
                  </TabsTrigger>
                  <TabsTrigger value="stock" className="shrink-0 gap-1.5 px-2.5" aria-label="Vista inventario">
                    <PackageOpen className="h-4 w-4" />
                    <span className="text-[11px] sm:text-sm">Inventario</span>
                  </TabsTrigger>
                  <TabsTrigger value="kanban" className="shrink-0 gap-1.5 px-2.5" aria-label="Vista pipeline">
                    <LayoutGrid className="h-4 w-4" />
                    <span className="text-[11px] sm:text-sm">Pipeline</span>
                  </TabsTrigger>
                  <TabsTrigger value="calendar" className="shrink-0 gap-1.5 px-2.5" aria-label="Vista calendario">
                    <CalendarIcon className="h-4 w-4" />
                    <span className="text-[11px] sm:text-sm">Calendario</span>
                  </TabsTrigger>
                  <TabsTrigger value="lotti" className="shrink-0 gap-1.5 px-2.5" aria-label="Vista lotti">
                    <Package className="h-4 w-4" />
                    <span className="text-[11px] sm:text-sm">Lotti</span>
                  </TabsTrigger>
                  <TabsTrigger value="ddt" className="shrink-0 gap-1.5 px-2.5" aria-label="Vista DDT">
                    <FileText className="h-4 w-4" />
                    <span className="text-[11px] sm:text-sm">DDT</span>
                  </TabsTrigger>
                  <TabsTrigger value="valuation" className="shrink-0 gap-1.5 px-2.5" aria-label="Vista valorizzazione magazzino">
                    <Calculator className="h-4 w-4" />
                    <span className="text-[11px] sm:text-sm">Valore</span>
                  </TabsTrigger>
                  <TabsTrigger value="scadenze" className="shrink-0 gap-1.5 px-2.5" aria-label="Vista scadenze lotti">
                    <Clock className="h-4 w-4" />
                    <span className="text-[11px] sm:text-sm">Scadenze</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {viewMode === "list" && (
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Raggruppa per" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order">Per commessa</SelectItem>
                    <SelectItem value="date">Per data lavori</SelectItem>
                    <SelectItem value="status">Per stato</SelectItem>
                    <SelectItem value="supplier">Per fornitore</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Quick filters — solo workflow commesse (sono filtri commessa-related:
                Da Lavorare, Urgenti, In Ritardo, Questa/Prox. sett. di lavori). Su
                Inventario sono inerti e occupano spazio inutilmente. */}
            {isOrderView && (
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 sm:flex-wrap sm:pb-0">
              <Button
                variant={quickFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("all")}
                className="shrink-0"
              >
                Tutti
              </Button>
              <Button
                variant={quickFilter === "active" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("active")}
                className="gap-1 shrink-0"
              >
                <WarehouseIcon className="h-4 w-4" />
                Da Lavorare
                {activeItemsCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {activeItemsCount}
                  </Badge>
                )}
              </Button>
              <Button
                variant={quickFilter === "urgent" ? "destructive" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("urgent")}
                className="gap-1 shrink-0"
              >
                <AlertTriangle className="h-4 w-4" />
                Urgenti
                {urgentItemsCount > 0 && (
                  <span className="ml-1 bg-destructive-foreground text-destructive rounded-full px-1.5 py-0.5 text-xs font-bold">
                    {urgentItemsCount}
                  </span>
                )}
              </Button>
              {/* "In Ritardo" pill rimosso — duplicato della KPI card cliccabile sopra. */}
              <Button
                variant={quickFilter === "thisWeek" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("thisWeek")}
                className="gap-1 shrink-0"
                title="Articoli con lavori entro 7 giorni"
              >
                <Clock className="h-4 w-4" />
                Lavori 7gg
              </Button>
              <Button
                variant={quickFilter === "nextWeek" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("nextWeek")}
                className="gap-1 shrink-0"
                title="Articoli con lavori entro 14 giorni"
              >
                <Clock className="h-4 w-4" />
                Lavori 14gg
              </Button>
            </div>
            )}

            {/* Filtri compatti — solo workflow commesse.
                In Inventario (Giacenze/Lotti/DDT) ogni sub-tab ha i suoi filtri
                propri (vedi WarehouseStockTab toolbar QR), evitiamo doppione confondente.
                I Select (Stato/Ordine/Fornitore/Zona) sono dentro lo Sheet sidebar. */}
            {isOrderView && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca articolo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="sm:hidden shrink-0"
                onClick={() => setScannerOpen(true)}
                title="Scansiona barcode"
              >
                <ScanLine className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setFiltersSheetOpen(true)}
                className="shrink-0 gap-2"
                title="Apri filtri avanzati"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filtri</span>
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
                className="shrink-0 gap-2"
                title="Cerca tra tutti i seriali del magazzino"
              >
                <Package className="h-4 w-4" />
                <span className="hidden sm:inline">Seriali</span>
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
              Filtri avanzati
            </SheetTitle>
            <SheetDescription>
              Filtra gli articoli per stato, ordine, fornitore o zona del magazzino.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Stato
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                    <SelectItem key={status} value={status}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ordine
              </label>
              <Select value={orderFilter} onValueChange={setOrderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Ordine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli ordini</SelectItem>
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
                Fornitore
              </label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Fornitore" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i fornitori</SelectItem>
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
                  Zona magazzino
                </label>
                <Select value={sectionFilter} onValueChange={setSectionFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Zona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutte le zone</SelectItem>
                    <SelectItem value="__none__">Nessuna zona</SelectItem>
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
                  Lotto / Bancale
                </label>
                <Select value={lottoFilter} onValueChange={setLottoFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Lotto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i lotti</SelectItem>
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
              Pulisci tutto
            </Button>
            <Button onClick={() => setFiltersSheetOpen(false)} className="flex-1">
              Applica
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
          onStatusChange={isCommercialistaMode ? readonlyWarehouseAction : handleStatusChange}
          onRegisterArrival={isCommercialistaMode ? readonlyWarehouseAction : () => openStockAction("receive")}
          readOnly={isCommercialistaMode}
        />
      ) : viewMode === "ddt" ? (
        <WarehouseDDTTab warehouseFilter={warehouseFilter} onRegisterArrival={isCommercialistaMode ? undefined : () => openStockAction("receive")} />
      ) : viewMode === "lotti" ? (
        <WarehouseLottiTab readOnly={isCommercialistaMode} />
      ) : viewMode === "valuation" ? (
        <WarehouseValorizzazionePanel warehouseId={warehouseFilter ?? null} />
      ) : viewMode === "scadenze" ? (
        <LottiScadenzaAlert />
      ) : viewMode === "stock" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            {!isCommercialistaMode && <ArticoliCSVImportDialog warehouseId={warehouseFilter ?? null} />}
          </div>
          <WarehouseStockTab
            warehouseFilter={warehouseFilter}
            actionRequest={stockActionRequest}
            readOnly={isCommercialistaMode}
          />
        </div>
      ) : isLoading ? (
        <div
          className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          <span className="text-sm">Caricamento articoli…</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-14 flex flex-col items-center justify-center gap-3 text-center">
            <Package className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {hasActiveFilters ? "Nessun articolo trovato" : "Magazzino vuoto"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {hasActiveFilters
                  ? "Prova a modificare i filtri o la ricerca."
                  : "Aggiungi articoli dal catalogo per iniziare a gestire il magazzino."}
              </p>
            </div>
            {!hasActiveFilters && !isCommercialistaMode && (
              <a
                href="/azienda/impostazioni/catalogo"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Vai al catalogo articoli
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
          {!isCommercialistaMode && selectedItemIds.size > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="py-3 flex items-center gap-3">
                <span className="text-sm font-medium">
                  {selectedItemIds.size} articol{selectedItemIds.size === 1 ? "o" : "i"} selezionat{selectedItemIds.size === 1 ? "o" : "i"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Trascina sulla mappa per assegnare zona
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setSelectedItemIds(new Set())}
                >
                  <X className="h-4 w-4 mr-1" />
                  Deseleziona
                </Button>
              </CardContent>
            </Card>
          )}

          {viewMode === "list" && (
            <WarehouseListView
              orderGroups={filteredGroups}
              onStatusChange={isCommercialistaMode ? readonlyWarehouseAction : handleStatusChange}
              onMarkAllInstalled={isCommercialistaMode ? readonlyWarehouseAction : handleMarkAllInstalled}
              onBatchStatusChange={isCommercialistaMode ? readonlyWarehouseAction : handleBatchStatusChange}
              getSupplierName={getSupplierName}
              isUpdating={isUpdating}
              stockItems={stockItems}
              onUpdateNotes={isCommercialistaMode ? readonlyWarehouseAction : handleUpdateNotes}
              groupBy={groupBy}
              sections={sections}
              onSectionChange={isCommercialistaMode ? readonlyWarehouseAction : handleSingleSectionChange}
              readOnly={isCommercialistaMode}
            />
          )}

          {viewMode === "kanban" && (
            <WarehouseKanbanView
              items={filteredItems}
              onStatusChange={isCommercialistaMode ? readonlyWarehouseAction : handleStatusChange}
              onUpdateNotes={isCommercialistaMode ? readonlyWarehouseAction : handleUpdateNotes}
              getSupplierName={getSupplierName}
              isUpdating={isUpdating}
              selectedIds={selectedItemIds}
              onToggleSelection={isCommercialistaMode ? readonlyWarehouseAction : toggleItemSelection}
              readOnly={isCommercialistaMode}
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
            {totalCount} articol{totalCount === 1 ? "o" : "i"} totali — Pagina {page + 1} di {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
            >
              Successiva
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

      <WarehouseTransferPanel
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />

      <StockUnitsDrilldownSheet
        open={serialsSheetOpen}
        onOpenChange={setSerialsSheetOpen}
        lotti={lotti}
      />
    </div>
  );
}
