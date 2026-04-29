import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
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
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
} from "lucide-react";
import { BarcodeScanner } from "@/components/warehouse/BarcodeScanner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

import WarehouseStats from "@/components/warehouse/WarehouseStats";
import WarehouseInventoryStats from "@/components/warehouse/WarehouseInventoryStats";
import { MobileKpiStrip } from "@/components/warehouse/MobileKpiStrip";
import WarehouseKanbanView from "@/components/warehouse/WarehouseKanbanView";
import WarehouseCalendarView from "@/components/warehouse/WarehouseCalendarView";
import WarehouseListView from "@/components/warehouse/WarehouseListView";
import WarehouseStockTab from "@/components/warehouse/WarehouseStockTab";
import WarehouseLottiTab from "@/components/warehouse/WarehouseLottiTab";
import { WarehouseDDTTab } from "@/components/warehouse/WarehouseDDTTab";

import { STATUS_CONFIG } from "@/types/warehouse";
import type { WarehouseItem } from "@/types/warehouse";
import { useWarehouseData } from "@/hooks/useWarehouseData";
import { useWarehouseSections } from "@/hooks/useWarehouseSections";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { WarehouseTransferPanel } from "@/components/warehouse/WarehouseTransferPanel";
import type { ViewMode, GroupBy } from "@/hooks/useWarehouseData";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";

export default function Warehouse() {
  const navigate = useNavigate();
  const {
    items,
    filteredItems,
    filteredGroups,
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
  const { isScopriPlan } = useSubscriptionLimits();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);

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

  const STATUSES: OrderItemStatus[] = ["da_ordinare", "ordinato", "in_arrivo", "in_magazzino", "prenotato", "installato"];

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggingItem(null);
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
    if (STATUSES.includes(newStatus as OrderItemStatus)) {
      const item = filteredItems.find(i => i.id === itemId);
      if (item && item.status !== newStatus) {
        handleStatusChange(itemId, newStatus as OrderItemStatus);
      }
    }
  }, [selectedItemIds, handleBatchSectionChange, filteredItems, handleStatusChange]);

  // M9 — wrapper single-item per il dropdown sezione mobile
  const handleSingleSectionChange = useCallback((itemId: string, sectionId: string | null) => {
    handleBatchSectionChange([itemId], sectionId);
  }, [handleBatchSectionChange]);

  if (isScopriPlan) return <UpgradeScopriWall type="magazzino" inline />;

  if (!effectiveCompany) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Seleziona un'azienda per visualizzare il magazzino.
      </div>
    );
  }

  // ─── Modalità macro: separa concettualmente "Tracking ordini" da "Inventario" ───
  //   • workflow: Lista, Kanban, Calendario (cosa devo gestire per i cantieri)
  //   • inventario: Giacenze, Lotti, DDT (gestione magazzino fisico)
  // Toggle macro al top → l'utente sceglie il mental model PRIMA di scegliere la vista.
  const isInventario = viewMode === "stock" || viewMode === "lotti" || viewMode === "ddt";
  const macroMode: "workflow" | "inventario" = isInventario ? "inventario" : "workflow";
  const switchMacroMode = (next: "workflow" | "inventario") => {
    if (next === macroMode) return;
    setViewMode(next === "workflow" ? "list" : "stock");
  };

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
    if (isInventario) setViewMode("list");
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

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <WarehouseIcon className="h-6 w-6 sm:h-8 sm:w-8" />
            Magazzino
          </h1>
          <p className="text-muted-foreground">
            Gestione materiali e tracking articoli
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Selettore magazzino — visibile anche su mobile (full-width sm:w-48) */}
          <div className="w-full sm:w-48 order-1 sm:order-none">
            <WarehouseSelect
              value={warehouseFilter}
              onChange={setWarehouseFilter}
              allowAll
              allLabel="Tutti i magazzini"
              className="h-9 text-sm"
            />
          </div>

          {/* Gestione magazzino — dropdown unico (Trasferisci + Magazzini)
              accessibile anche da mobile (prima erano hidden sm:flex → bug). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="order-2 sm:order-none">
                <SettingsIcon className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Gestione</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Trasferisci merce
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/azienda/magazzino/gestione")}>
                <Boxes className="h-4 w-4 mr-2" />
                Gestione magazzini
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="order-3 sm:order-none">
                <Download className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Esporta</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Esporta CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" />
                Stampa lista
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

      {/* Banner avvisi RIMOSSI completamente — riducono il rumore visivo
          e duplicano informazioni già presenti nelle KPI cliccabili sotto. */}

      {/* KPI sempre visibili su 2 righe fisse — workflow (5) + inventario (4) = 9.
          Layout invariato al toggle macro: l'utente vede sempre tutte le metriche.
          Click su una KPI workflow da modalità inventario → switch automatico
          a workflow + applica filtro (vedi handleStatsCardClick). */}
      <div className="space-y-3">
        <MobileKpiStrip
          items={items}
          companyId={effectiveCompany.id}
          activeFilter={activeStatsFilter}
          onCardClick={handleStatsCardClick}
        />
        <div className="hidden md:block space-y-3">
          <WarehouseStats
            items={items}
            activeFilter={activeStatsFilter}
            onCardClick={handleStatsCardClick}
          />
          <WarehouseInventoryStats companyId={effectiveCompany.id} />
        </div>
      </div>

      {/* View Toggle & Filters */}
      {/* ─── Toggle macro: 2 mondi separati invece di 6 tab piatti ───
           Workflow = Tracking ordini per cantieri (Lista/Kanban/Calendario).
           Inventario = Gestione magazzino fisico (Giacenze/Lotti/DDT).
           Ogni modalità ha i suoi KPI, alert, filtri, tab — niente leak. */}
      <div className="flex justify-center print:hidden">
        <div className="inline-flex rounded-lg border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => switchMacroMode("workflow")}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              macroMode === "workflow"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-muted",
            )}
            aria-pressed={macroMode === "workflow"}
          >
            <ClipboardCheck className="h-4 w-4" />
            <span>Tracking ordini</span>
          </button>
          <button
            type="button"
            onClick={() => switchMacroMode("inventario")}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              macroMode === "inventario"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-muted",
            )}
            aria-pressed={macroMode === "inventario"}
          >
            <Boxes className="h-4 w-4" />
            <span>Inventario</span>
          </button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* View mode tabs — set diverso a seconda della modalità macro.
                Su workflow: Lista/Kanban/Calendario. Su inventario: Giacenze/Lotti/DDT. */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                {macroMode === "workflow" ? (
                  <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="list" className="gap-1.5">
                      <List className="h-4 w-4" />
                      <span className="hidden sm:inline">Lista</span>
                    </TabsTrigger>
                    <TabsTrigger value="kanban" className="gap-1.5">
                      <LayoutGrid className="h-4 w-4" />
                      <span className="hidden sm:inline">Kanban</span>
                    </TabsTrigger>
                    <TabsTrigger value="calendar" className="gap-1.5">
                      <CalendarIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">Calendario</span>
                    </TabsTrigger>
                  </TabsList>
                ) : (
                  <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="stock" className="gap-1.5">
                      <PackageOpen className="h-4 w-4" />
                      <span className="hidden sm:inline">Giacenze</span>
                    </TabsTrigger>
                    <TabsTrigger value="lotti" className="gap-1.5">
                      <Package className="h-4 w-4" />
                      <span className="hidden sm:inline">Lotti</span>
                    </TabsTrigger>
                    <TabsTrigger value="ddt" className="gap-1.5">
                      <FileText className="h-4 w-4" />
                      <span className="hidden sm:inline">DDT</span>
                    </TabsTrigger>
                  </TabsList>
                )}
              </Tabs>

              {viewMode === "list" && (
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Raggruppa per" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order">Per ordine</SelectItem>
                    <SelectItem value="date">Per data posa</SelectItem>
                    <SelectItem value="status">Per stato</SelectItem>
                    <SelectItem value="supplier">Per fornitore</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Quick filters — solo workflow ordini (sono filtri ordini-related:
                Da Lavorare, Urgenti, In Ritardo, Questa/Prox. sett. di posa). Su
                Inventario sono inerti e occupano spazio inutilmente. */}
            {macroMode === "workflow" && (
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
                title="Articoli con posa entro 7 giorni"
              >
                <Clock className="h-4 w-4" />
                Posa 7gg
              </Button>
              <Button
                variant={quickFilter === "nextWeek" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("nextWeek")}
                className="gap-1 shrink-0"
                title="Articoli con posa entro 14 giorni"
              >
                <Clock className="h-4 w-4" />
                Posa 14gg
              </Button>
            </div>
            )}

            {/* Filtri compatti — solo workflow ordini.
                In Inventario (Giacenze/Lotti/DDT) ogni sub-tab ha i suoi filtri
                propri (vedi WarehouseStockTab toolbar QR), evitiamo doppione confondente.
                I Select (Stato/Ordine/Fornitore/Zona) sono dentro lo Sheet sidebar. */}
            {macroMode === "workflow" && (
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
                    ].filter(Boolean).length}
                  </Badge>
                )}
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
      {viewMode === "ddt" ? (
        <WarehouseDDTTab warehouseFilter={warehouseFilter} />
      ) : viewMode === "lotti" ? (
        <WarehouseLottiTab />
      ) : viewMode === "stock" ? (
        <WarehouseStockTab />
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
            {!hasActiveFilters && (
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
          {selectedItemIds.size > 0 && (
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
              onStatusChange={handleStatusChange}
              onMarkAllInstalled={handleMarkAllInstalled}
              onBatchStatusChange={handleBatchStatusChange}
              getSupplierName={getSupplierName}
              isUpdating={isUpdating}
              stockItems={stockItems}
              onUpdateNotes={handleUpdateNotes}
              groupBy={groupBy}
              sections={sections}
              onSectionChange={handleSingleSectionChange}
            />
          )}

          {viewMode === "kanban" && (
            <WarehouseKanbanView
              items={filteredItems}
              onStatusChange={handleStatusChange}
              onUpdateNotes={handleUpdateNotes}
              getSupplierName={getSupplierName}
              isUpdating={isUpdating}
              selectedIds={selectedItemIds}
              onToggleSelection={toggleItemSelection}
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
      {viewMode !== "stock" && viewMode !== "lotti" && totalPages > 1 && (
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
    </div>
  );
}
