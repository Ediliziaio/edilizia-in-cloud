import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Eye,
  EyeOff,
  GripVertical,
} from "lucide-react";
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

import WarehouseAlerts from "@/components/warehouse/WarehouseAlerts";
import BlockedOrdersPanel from "@/components/warehouse/BlockedOrdersPanel";
import LowStockAlertsPanel from "@/components/warehouse/LowStockAlertsPanel";
import WarehouseStats from "@/components/warehouse/WarehouseStats";
import WarehouseKanbanView from "@/components/warehouse/WarehouseKanbanView";
import WarehouseCalendarView from "@/components/warehouse/WarehouseCalendarView";
import WarehouseListView from "@/components/warehouse/WarehouseListView";
import WarehouseStockTab from "@/components/warehouse/WarehouseStockTab";
import { WarehouseMapView } from "@/components/warehouse/WarehouseMapView";

import { STATUS_CONFIG } from "@/types/warehouse";
import type { StockItem, WarehouseItem } from "@/types/warehouse";
import { useWarehouseData } from "@/hooks/useWarehouseData";
import { useWarehouseSections } from "@/hooks/useWarehouseSections";
import { supabase } from "@/integrations/supabase/client";
import type { ViewMode, GroupBy } from "@/hooks/useWarehouseData";

export default function Warehouse() {
  const {
    items,
    filteredItems,
    filteredGroups,
    suppliers,
    stockItems,
    uniqueOrders,
    urgentItemsCount,
    overdueItemsCount,
    activeItemsCount,
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
  const [showMap, setShowMap] = useState(() => {
    const stored = localStorage.getItem("warehouse-show-map");
    return stored !== null ? stored === "true" : true;
  });
  const { data: fullStockItems = [] } = useQuery({
    queryKey: ["warehouse-stock", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("*")
        .eq("company_id", effectiveCompany.id)
        .order("name");
      if (error) throw error;
      return data as StockItem[];
    },
    enabled: !!effectiveCompany?.id,
  });

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

  if (!effectiveCompany) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Seleziona un'azienda per visualizzare il magazzino.
      </div>
    );
  }

  const isOrderItemView = viewMode !== "stock" && viewMode !== "calendar";
  const showDroppableMap = isOrderItemView && showMap && sections.length > 0;

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <WarehouseIcon className="h-8 w-8" />
            Magazzino
          </h1>
          <p className="text-muted-foreground">
            Gestione materiali e tracking articoli
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Esporta
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
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

      {/* Alerts */}
      <div className="print:hidden">
        <WarehouseAlerts items={items} />
      </div>

      {/* Live panels - minimal mode */}
      <div className="flex items-center gap-3 print:hidden">
        <BlockedOrdersPanel companyId={effectiveCompany.id} minimal />
        <LowStockAlertsPanel companyId={effectiveCompany.id} minimal />
      </div>

      {/* Stats */}
      <WarehouseStats items={items} />

      {/* Warehouse Map - toggleable */}
      {viewMode !== "stock" && (
        <div className="print:hidden">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              Mappa Magazzino
              {isOrderItemView && showMap && sections.length > 0 && (
                <span className="text-xs text-muted-foreground/70 ml-1">
                  — trascina articoli qui per assegnarli a una zona
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowMap((v) => {
                  localStorage.setItem("warehouse-show-map", String(!v));
                  return !v;
                });
              }}
              className="gap-1.5 text-xs text-muted-foreground"
            >
              {showMap ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showMap ? "Nascondi mappa" : "Mostra mappa"}
            </Button>
          </div>
          {showMap && (
            <WarehouseMapView
              stockItems={fullStockItems}
              sections={sections}
              activeSectionFilter="all"
              onFilterSection={() => {}}
              showTitle={false}
              droppable={isOrderItemView}
            />
          )}
        </div>
      )}

      {/* View Toggle & Filters */}
      <Card className="print:hidden">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* View mode tabs */}
            <div className="flex items-center justify-between">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <TabsList>
                  <TabsTrigger value="list" className="gap-2">
                    <List className="h-4 w-4" />
                    Lista
                  </TabsTrigger>
                  <TabsTrigger value="kanban" className="gap-2">
                    <LayoutGrid className="h-4 w-4" />
                    Kanban
                  </TabsTrigger>
                  <TabsTrigger value="calendar" className="gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Calendario
                  </TabsTrigger>
                  <TabsTrigger value="stock" className="gap-2">
                    <PackageOpen className="h-4 w-4" />
                    Giacenze
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {viewMode === "list" && (
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                  <SelectTrigger className="w-[180px]">
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

            {/* Quick filters */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={quickFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("all")}
              >
                Tutti
              </Button>
              <Button
                variant={quickFilter === "active" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("active")}
                className="gap-1"
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
                className="gap-1"
              >
                <AlertTriangle className="h-4 w-4" />
                Urgenti
                {urgentItemsCount > 0 && (
                  <span className="ml-1 bg-destructive-foreground text-destructive rounded-full px-1.5 py-0.5 text-xs font-bold">
                    {urgentItemsCount}
                  </span>
                )}
              </Button>
              <Button
                variant={quickFilter === "overdue" ? "destructive" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("overdue")}
                className="gap-1"
              >
                <Clock className="h-4 w-4" />
                In Ritardo
                {overdueItemsCount > 0 && (
                  <span className="ml-1 bg-destructive-foreground text-destructive rounded-full px-1.5 py-0.5 text-xs font-bold">
                    {overdueItemsCount}
                  </span>
                )}
              </Button>
              <Button
                variant={quickFilter === "thisWeek" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("thisWeek")}
                className="gap-1"
              >
                <Clock className="h-4 w-4" />
                Questa settimana
              </Button>
              <Button
                variant={quickFilter === "nextWeek" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("nextWeek")}
              >
                Prossima settimana
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca articolo..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
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

              <Select value={orderFilter} onValueChange={setOrderFilter}>
                <SelectTrigger className="w-[200px]">
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

              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-[180px]">
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

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Pulisci filtri
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content based on view mode */}
      {viewMode === "stock" ? (
        <WarehouseStockTab />
      ) : isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Caricamento articoli...
        </div>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {hasActiveFilters
              ? "Nessun articolo trovato con i filtri applicati."
              : "Nessun articolo presente nel magazzino."}
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
    </div>
  );
}
