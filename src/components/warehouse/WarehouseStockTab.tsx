import { useEffect, useState, useMemo, useCallback, memo, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouses } from "@/hooks/useWarehouses";
import { toast } from "sonner";
import { Plus, Pencil, ArrowUpCircle, ArrowDownCircle, Search, AlertTriangle, History, CheckSquare, Filter, MoveRight, X, GripVertical, ClipboardCheck, ChevronLeft, ChevronRight, ScanLine, Package, ChevronDown, MoreVertical, Truck, MapPin } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { formatCurrency } from "@/lib/formatters";
import { logger } from "@/utils/logger";
import { StockItemDialog } from "./StockItemDialog";
import { StockMovementDialog } from "./StockMovementDialog";
import { StockMovementHistoryDialog } from "./StockMovementHistoryDialog";
import { WarehouseSectionsManager } from "./WarehouseSectionsManager";
import { WarehouseMapView } from "./WarehouseMapView";

import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWarehouseSections } from "@/hooks/useWarehouseSections";
import InventoryAuditDialog from "./InventoryAuditDialog";
import type { StockItem } from "@/types/warehouse";

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
const ScaricoCantiereSheet = lazy(() =>
  import("./ScaricoCantiereSheet").then((m) => ({ default: m.ScaricoCantiereSheet })),
);

interface WarehouseStockTabProps {
  warehouseFilter?: string | null;
  actionRequest?: {
    type: "receive" | "ship";
    nonce: number;
  } | null;
  readOnly?: boolean;
}

export default function WarehouseStockTab({ warehouseFilter = null, actionRequest = null, readOnly = false }: WarehouseStockTabProps) {
  const { effectiveCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const { defaultWarehouse } = useWarehouses(true);
  const resolveWarehouseId = (item?: StockItem | null) =>
    item?.warehouse_id ?? warehouseFilter ?? defaultWarehouse?.id ?? null;

  const [searchQuery, setSearchQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
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
  // Quick scan integration: filter+toast invece di highlight visivo
  // (più semplice e già feedback chiaro tramite searchQuery + toast).
  const [quickScanOpen, setQuickScanOpen] = useState(false);
  /** Barcode pre-compilato quando l'utente arriva da Quick Scan no-match. */
  const [prefillBarcodeForDialog, setPrefillBarcodeForDialog] = useState<string | undefined>();
  // Carico rapido + ODA Reverse (MP2 P1a) + Scarico cantiere (MP3 P1b)
  const [caricoOpen, setCaricoOpen] = useState(false);
  const [odaReceiveOpen, setOdaReceiveOpen] = useState(false);
  const [scaricoOpen, setScaricoOpen] = useState(false);
  const [zonesDialogOpen, setZonesDialogOpen] = useState(false);

  useEffect(() => {
    if (!actionRequest || readOnly) return;
    if (actionRequest.type === "receive") setCaricoOpen(true);
    if (actionRequest.type === "ship") setScaricoOpen(true);
  }, [actionRequest, readOnly]);

  // DnD sensors — require 8px movement before activating to avoid interfering with clicks
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Fetch stock items
  const { data: stockItems = [], isLoading } = useQuery({
    queryKey: [...queryKeys.warehouse.stock(companyId), warehouseFilter],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("warehouse_stock")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (warehouseFilter) {
        q = q.eq("warehouse_id", warehouseFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as StockItem[];
    },
    enabled: !!companyId,
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

  const { sections } = useWarehouseSections();
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
        const { error } = await supabase
          .from("warehouse_stock")
          .update({
            name: data.name,
            description: data.description || null,
            quantity: data.quantity,
            warehouse_id: resolveWarehouseId(currentItem),
            unit_cost: data.unit_cost,
            vat_rate: data.vat_rate,
            supplier_id: data.supplier_id || null,
            section_id: data.section_id || null,
            min_stock_level: data.min_stock_level,
            ...qrUpdate,
          })
          .eq("id", data.id)
          .eq("company_id", companyId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("warehouse_stock").insert({
          company_id: companyId!,
          warehouse_id: resolveWarehouseId(),
          name: data.name,
          description: data.description || null,
          quantity: data.quantity,
          unit_cost: data.unit_cost,
          vat_rate: data.vat_rate,
          supplier_id: data.supplier_id || null,
          section_id: data.section_id || null,
          min_stock_level: data.min_stock_level,
          ...qrUpdate,
        });
        if (error) throw error;

        if (data.registerCost) {
          await insertCostRecord(data.name, data.unit_cost, data.quantity, data.vat_rate, data.supplier_id, data.costPaidDate, data.costCategory);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.costs.list(companyId) });
      setDialogOpen(false);
      setEditingItem(null);
      toast.success("Salvato", { description: "Articolo di magazzino salvato." });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile salvare l'articolo." });
    },
  });

  // Movement mutation
  const movementMutation = useMutation({
    mutationFn: async ({
      stockItemId, type, quantity, notes, registerCost, costPaidDate, costCategory,
    }: {
      stockItemId: string;
      type: "carico" | "scarico";
      quantity: number;
      notes?: string;
      registerCost?: boolean;
      costPaidDate?: string;
      costCategory?: string;
    }) => {
      const { error: movError } = await supabase.from("warehouse_movements").insert({
        stock_item_id: stockItemId,
        movement_type: type,
        quantity,
        notes: notes || null,
        performed_by: user!.id,
        warehouse_id: resolveWarehouseId(stockItems.find((i) => i.id === stockItemId)),
      });
      if (movError) throw movError;

      const currentItem = stockItems.find((i) => i.id === stockItemId);
      if (!currentItem) throw new Error("Articolo non trovato");
      const newQty = type === "carico" ? currentItem.quantity + quantity : currentItem.quantity - quantity;

      const { error: updError } = await supabase
        .from("warehouse_stock")
        .update({ quantity: Math.max(0, newQty) })
        .eq("id", stockItemId)
        .eq("company_id", companyId!);
      if (updError) throw updError;

      if (registerCost && type === "carico") {
        await insertCostRecord(currentItem.name, currentItem.unit_cost, quantity, currentItem.vat_rate ?? 22, currentItem.supplier_id || undefined, costPaidDate, costCategory);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.costs.list(companyId) });
      setMovementDialog({ open: false, type: "carico", item: null });
      toast.success("Movimento registrato");
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile registrare il movimento." });
    },
  });

  // Batch move mutation
  const batchMoveMutation = useMutation({
    mutationFn: async ({ ids, sectionId }: { ids: string[]; sectionId: string | null }) => {
      const { error } = await supabase
        .from("warehouse_stock")
        .update({ section_id: sectionId })
        .in("id", ids)
        .eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
      const count = variables.ids.length;
      setSelectedIds(new Set());
      setBatchTargetSection("");
      toast.success("Articoli spostati", { description: `${count} articol${count === 1 ? "o" : "i"} aggiornat${count === 1 ? "o" : "i"}.` });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile spostare gli articoli." });
    },
  });

  const filtered = useMemo(() => {
    let items = stockItems;
    if (sectionFilter !== "all") {
      if (sectionFilter === "none") {
        items = items.filter((i) => !i.section_id);
      } else {
        items = items.filter((i) => i.section_id === sectionFilter);
      }
    }
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
    );
  }, [stockItems, searchQuery, sectionFilter]);

  // Pagination for stock items
  const STOCK_PAGE_SIZE = 50;
  const [stockPage, setStockPage] = useState(0);
  const stockTotalPages = Math.max(1, Math.ceil(filtered.length / STOCK_PAGE_SIZE));
  const paginatedItems = useMemo(
    () => filtered.slice(stockPage * STOCK_PAGE_SIZE, (stockPage + 1) * STOCK_PAGE_SIZE),
    [filtered, stockPage]
  );

  // Reset page when search/filter changes
  const setSearchQueryWithReset = useCallback((q: string) => { setSearchQuery(q); setStockPage(0); }, []);
  const setSectionFilterWithReset = useCallback((v: string) => { setSectionFilter(v); setStockPage(0); }, []);

  const lowStockItems = useMemo(
    () => stockItems.filter((i) => i.min_stock_level > 0 && i.quantity <= i.min_stock_level),
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

  const allSelected = useMemo(
    () => filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id)),
    [filtered, selectedIds]
  );

  const toggleSelectAll = useCallback(() => {
    if (readOnly) return;
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((i) => i.id)));
    }
  }, [filtered, allSelected, readOnly]);

  const handleBatchMove = () => {
    if (readOnly || !batchTargetSection || selectedIds.size === 0) return;
    batchMoveMutation.mutate({
      ids: Array.from(selectedIds),
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
      ? Array.from(selectedIds)
      : [itemId];

    const resolvedSectionId = sectionId === "__none__" ? null : sectionId;

    batchMoveMutation.mutate({ ids: idsToMove, sectionId: resolvedSectionId });
  }, [readOnly, selectedIds, batchMoveMutation]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Low stock alert */}
        {lowStockItems.length > 0 && (
          <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="py-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <span className="text-sm font-medium">
                {lowStockItems.length} articol{lowStockItems.length === 1 ? "o" : "i"} sotto la soglia minima:{" "}
                {lowStockItems.map((i) => `${i.name} (${i.quantity}/${i.min_stock_level})`).join(", ")}
              </span>
            </CardContent>
          </Card>
        )}

        {/* Compact zones entry point */}
        <Card>
          <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-semibold">Zone e planimetria</p>
                <Badge variant="secondary" className="h-5">{sections.length} zone</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {readOnly
                  ? "Consulta piantina, aree operative e posizioni senza modificare l'inventario."
                  : "Gestisci piantina, aree operative e posizioni senza occupare la vista inventario."}
              </p>
            </div>
            {!readOnly && (
              <Button type="button" variant="outline" size="sm" className="w-full gap-2 sm:w-auto" onClick={() => setZonesDialogOpen(true)}>
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Apri zone
              </Button>
            )}
          </CardContent>
        </Card>

        <Dialog open={zonesDialogOpen} onOpenChange={setZonesDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto p-0">
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle>Zone e planimetria magazzino</DialogTitle>
              <DialogDescription>
                Disegna la piantina, gestisci le aree operative e sposta gli articoli nelle zone corrette.
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

        {/* Header with search, filter and add — responsive mobile-first */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sm:flex-wrap">
          <div className="relative flex-1 sm:max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca articolo..."
              value={searchQuery}
              onChange={(e) => setSearchQueryWithReset(e.target.value)}
              className="pl-9"
            />
          </div>
          {sections.length > 0 && (
            <Select value={sectionFilter} onValueChange={setSectionFilterWithReset}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Filtra zona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le zone</SelectItem>
                <SelectItem value="none">Senza zona</SelectItem>
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
          )}
          <div className="w-full sm:w-auto">
            {!readOnly && <div className="sm:hidden space-y-2">
              <Button
                onClick={() => setQuickScanOpen(true)}
                aria-label="Cerca articolo via scansione QR/barcode"
                size="lg"
                className="w-full h-12 text-base font-semibold"
              >
                <ScanLine className="h-5 w-5 mr-2" />
                Cerca articolo
              </Button>

              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCaricoOpen(true)}
                  aria-label="Registra arrivo merce — carico libero"
                  className="h-auto py-2.5 flex flex-col items-center justify-center gap-1 text-xs"
                >
                  <ArrowDownCircle className="h-5 w-5" />
                  <span className="leading-tight">Registra<br />arrivo</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setOdaReceiveOpen(true)}
                  aria-label="Ricevi merce contro ordine fornitore (ODA)"
                  className="h-auto py-2.5 flex flex-col items-center justify-center gap-1 text-xs"
                >
                  <Package className="h-5 w-5" />
                  <span className="leading-tight">Ricevi<br />da ODA</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setScaricoOpen(true)}
                  aria-label="Spedisci merce a cantiere — genera DDT"
                  className="h-auto py-2.5 flex flex-col items-center justify-center gap-1 text-xs"
                >
                  <Truck className="h-5 w-5" />
                  <span className="leading-tight">Spedisci<br />cantiere</span>
                </Button>
              </div>

              <div className="flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" aria-label="Altre azioni">
                      <MoreVertical className="h-4 w-4 mr-1" />
                      <span className="text-xs">Altre azioni</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => { setEditingItem(null); setDialogOpen(true); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Aggiungi articolo
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>}

            {!readOnly && <div className="hidden sm:flex items-center gap-2 flex-wrap">
              {/* Quick scan — bottone principale, sempre rapido */}
              <Button
                variant="outline"
                onClick={() => setQuickScanOpen(true)}
                aria-label="Cerca articolo via scansione QR/barcode"
                className="flex-1 sm:flex-initial"
              >
                <ScanLine className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Cerca articolo</span>
              </Button>

              {/* Operazioni di CARICO raggruppate */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" aria-label="Registra arrivo merce" className="flex-1 sm:flex-initial">
                    <ArrowDownCircle className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Registra arrivo</span>
                    <ChevronDown className="h-3.5 w-3.5 ml-1 sm:ml-1.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">
                    Registra arrivo merce
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setCaricoOpen(true)}>
                    <ArrowDownCircle className="h-4 w-4 mr-2" />
                    <div className="flex flex-col items-start">
                      <span>Senza ordine fornitore</span>
                      <span className="text-[11px] text-muted-foreground">
                        Scansione libera batch
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setOdaReceiveOpen(true)}>
                    <Package className="h-4 w-4 mr-2" />
                    <div className="flex flex-col items-start">
                      <span>Da ordine fornitore (ODA)</span>
                      <span className="text-[11px] text-muted-foreground">
                        Vincolato a ODA pending
                      </span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Operazioni di SCARICO */}
              <Button
                variant="outline"
                onClick={() => setScaricoOpen(true)}
                aria-label="Spedisci merce a cantiere — genera DDT"
                className="flex-1 sm:flex-initial"
              >
                <Truck className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Spedisci a cantiere</span>
              </Button>

              {/* Aggiunta manuale articolo */}
              <Button
                onClick={() => { setEditingItem(null); setDialogOpen(true); }}
                aria-label="Aggiungi articolo"
                className="flex-1 sm:flex-initial"
              >
                <Plus className="h-4 w-4 sm:mr-2" />
                <span>Aggiungi articolo</span>
              </Button>
            </div>}
          </div>
        </div>

        {/* Batch action bar */}
        {!readOnly && selectedIds.size > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium">
                {selectedIds.size} selezionat{selectedIds.size === 1 ? "o" : "i"}
              </span>
              {sections.length > 0 && (
                <>
                  <Select value={batchTargetSection} onValueChange={setBatchTargetSection}>
                    <SelectTrigger className="w-[180px] h-8">
                      <SelectValue placeholder="Zona destinazione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Rimuovi zona</SelectItem>
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
                    Sposta
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedIds(new Set()); setBatchTargetSection(""); }}
              >
                <X className="h-4 w-4 mr-1" />
                Deseleziona
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {searchQuery ? "Nessun articolo trovato." : "Nessun articolo in giacenza. Clicca 'Aggiungi Articolo' per iniziare."}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Desktop / tablet: Tabella completa */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Seleziona tutti"
                        />
                      </TableHead>
                      <TableHead>Articolo</TableHead>
                      {sections.length > 0 && <TableHead>Zona</TableHead>}
                      <TableHead className="text-center">Qtà</TableHead>
                      <TableHead className="text-right">Costo Unit.</TableHead>
                      <TableHead className="text-right">Valore Totale</TableHead>
                      <TableHead>Fornitore</TableHead>
                      <TableHead className="text-center">Soglia</TableHead>
                      <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedItems.map((item) => (
                      <DraggableStockRow
                        key={item.id}
                        item={item}
                        isLow={item.min_stock_level > 0 && item.quantity <= item.min_stock_level}
                        section={getSectionName(item.section_id)}
                        isSelected={selectedIds.has(item.id)}
                        hasSections={sections.length > 0}
                        supplierName={getSupplierName(item.supplier_id)}
                        onToggleSelect={() => toggleSelect(item.id)}
                        onEdit={() => { setEditingItem(item); setDialogOpen(true); }}
                        onCarico={() => setMovementDialog({ open: true, type: "carico", item })}
                        onScarico={() => setMovementDialog({ open: true, type: "scarico", item })}
                        onHistory={() => setHistoryItem(item)}
                        onTask={() => setTaskItem(item)}
                        onAudit={() => setAuditItem(item)}
                        readOnly={readOnly}
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Mobile: Lista a cards */}
            <div className="md:hidden space-y-2">
              {paginatedItems.map((item) => (
                <StockItemMobileCard
                  key={item.id}
                  item={item}
                  isLow={item.min_stock_level > 0 && item.quantity <= item.min_stock_level}
                  section={getSectionName(item.section_id)}
                  isSelected={selectedIds.has(item.id)}
                  supplierName={getSupplierName(item.supplier_id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onEdit={() => { setEditingItem(item); setDialogOpen(true); }}
                  onCarico={() => setMovementDialog({ open: true, type: "carico", item })}
                  onScarico={() => setMovementDialog({ open: true, type: "scarico", item })}
                  onHistory={() => setHistoryItem(item)}
                  onTask={() => setTaskItem(item)}
                  onAudit={() => setAuditItem(item)}
                  readOnly={readOnly}
                />
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {stockTotalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {filtered.length} articol{filtered.length === 1 ? "o" : "i"} — Pagina {stockPage + 1} di {stockTotalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStockPage(Math.max(0, stockPage - 1))}
                disabled={stockPage === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Precedente
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStockPage(Math.min(stockTotalPages - 1, stockPage + 1))}
                disabled={stockPage >= stockTotalPages - 1}
              >
                Successiva
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
          open={dialogOpen}
          onOpenChange={(v) => {
            setDialogOpen(v);
            if (!v) {
              setEditingItem(null);
              setPrefillBarcodeForDialog(undefined);
            }
          }}
          editingItem={editingItem}
          isPending={saveMutation.isPending}
          prefillBarcode={prefillBarcodeForDialog}
          onSave={(data) => saveMutation.mutate({ ...data, id: editingItem?.id })}
        />
        <StockMovementDialog
          open={movementDialog.open}
          onOpenChange={(v) => { if (!v) setMovementDialog({ open: false, type: "carico", item: null }); }}
          type={movementDialog.type}
          itemName={movementDialog.item?.name || ""}
          maxQuantity={movementDialog.type === "scarico" ? movementDialog.item?.quantity : undefined}
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
        />
        <Dialog open={!!taskItem} onOpenChange={(v) => { if (!v) setTaskItem(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Task - {taskItem?.name}</DialogTitle>
              <DialogDescription>Attività collegate a questo articolo</DialogDescription>
            </DialogHeader>
            {taskItem && <LinkedTasks stockItemId={taskItem.id} category="magazzino" />}
          </DialogContent>
        </Dialog>
        <InventoryAuditDialog
          open={!!auditItem}
          onOpenChange={(v) => { if (!v) setAuditItem(null); }}
          stockItem={auditItem}
          companyId={companyId!}
        />

        {/* Quick Scan — lookup single-shot tramite BatchBarcodeScanner mode='lookup'. */}
        <Suspense fallback={null}>
          {quickScanOpen && (
            <BatchBarcodeScanner
              open={quickScanOpen}
              onOpenChange={setQuickScanOpen}
              mode="lookup"
              contextLabel="Cerca articolo in giacenza"
              onLookupFilter={(id) => {
                // Filtra la tabella per nome articolo + toast con giacenza.
                // È sufficiente come feedback visivo: la riga matching diventa
                // l'unica visibile dopo il filter (no need di highlight extra).
                const item = stockItems.find((s) => s.id === id);
                if (item) {
                  setSearchQueryWithReset(item.name);
                  toast.success(`Trovato: ${item.name}`, {
                    description: `Giacenza attuale: ${item.quantity}`,
                  });
                } else {
                  toast.warning("Articolo non visibile in questa pagina", {
                    description: "Probabilmente filtrato o paginato fuori vista.",
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

        {/* Carico rapido (MP2 P1a) */}
        <Suspense fallback={null}>
          {caricoOpen && (
            <CaricoRapidoSheet open={caricoOpen} onOpenChange={setCaricoOpen} />
          )}
        </Suspense>

        {/* Ricezione da ODA (MP2 P1a) */}
        <Suspense fallback={null}>
          {odaReceiveOpen && (
            <OdaReceiveSheet open={odaReceiveOpen} onOpenChange={setOdaReceiveOpen} />
          )}
        </Suspense>

        {/* Scarico cantiere → DDT in bozza (MP3 P1b) */}
        <Suspense fallback={null}>
          {scaricoOpen && (
            <ScaricoCantiereSheet open={scaricoOpen} onOpenChange={setScaricoOpen} />
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
  section: { name: string; color: string } | null;
  isSelected: boolean;
  hasSections: boolean;
  supplierName: string;
  onToggleSelect: () => void;
  onEdit: () => void;
  onCarico: () => void;
  onScarico: () => void;
  onHistory: () => void;
  onTask: () => void;
  onAudit: () => void;
  readOnly?: boolean;
}

const DraggableStockRow = memo(function DraggableStockRow({
  item, isLow, section, isSelected, hasSections, supplierName,
  onToggleSelect, onEdit, onCarico, onScarico, onHistory, onTask, onAudit,
  readOnly = false,
}: DraggableStockRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `stock-${item.id}`,
    data: { itemId: item.id },
    disabled: readOnly,
  });

  return (
    <TableRow
      ref={setNodeRef}
      className={`${isLow ? "bg-amber-50/50 dark:bg-amber-950/10" : ""} ${isDragging ? "opacity-40" : ""}`}
    >
      <TableCell className="w-8 cursor-grab active:cursor-grabbing" {...(!readOnly ? listeners : {})} {...(!readOnly ? attributes : {})}>
        {!readOnly && <GripVertical className="h-4 w-4 text-muted-foreground" />}
      </TableCell>
      <TableCell>
        {!readOnly && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            aria-label={`Seleziona ${item.name}`}
          />
        )}
      </TableCell>
      <TableCell>
        <div>
          <span className="font-medium">{item.name}</span>
          {item.description && (
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>
          )}
        </div>
      </TableCell>
      {hasSections && (
        <TableCell>
          {section ? (
            <Badge variant="outline" className="text-xs gap-1">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: section.color }} />
              {section.name}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
      )}
      <TableCell className="text-center">
        <Badge variant={isLow ? "destructive" : "secondary"}>
          {item.quantity}
        </Badge>
      </TableCell>
      <TableCell className="text-right">{formatCurrency(item.unit_cost)}</TableCell>
      <TableCell className="text-right">{formatCurrency(item.unit_cost * item.quantity)}</TableCell>
      <TableCell>{supplierName}</TableCell>
      <TableCell className="text-center">{item.min_stock_level || "—"}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" title="Storico" onClick={onHistory}>
            <History className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" title="Inventario" onClick={onAudit}>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </Button>
          {!readOnly && (
            <>
              <Button variant="ghost" size="icon" title="Task" onClick={onTask}>
                <CheckSquare className="h-4 w-4 text-primary" />
              </Button>
              <Button variant="ghost" size="icon" title="Carico" onClick={onCarico}>
                <ArrowUpCircle className="h-4 w-4 text-emerald-600" />
              </Button>
              <Button variant="ghost" size="icon" title="Scarico" onClick={onScarico} disabled={item.quantity === 0}>
                <ArrowDownCircle className="h-4 w-4 text-red-500" />
              </Button>
              <Button variant="ghost" size="icon" title="Modifica" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
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
  section: { name: string; color: string } | null;
  isSelected: boolean;
  supplierName: string;
  onToggleSelect: () => void;
  onEdit: () => void;
  onCarico: () => void;
  onScarico: () => void;
  onHistory: () => void;
  onTask: () => void;
  onAudit: () => void;
  readOnly?: boolean;
}

const StockItemMobileCard = memo(function StockItemMobileCard({
  item, isLow, section, isSelected, supplierName,
  onToggleSelect, onEdit, onCarico, onScarico, onHistory, onTask, onAudit,
  readOnly = false,
}: StockItemMobileCardProps) {
  return (
    <Card
      className={`${isLow ? "border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/10" : ""}`}
    >
      <CardContent className="p-3 space-y-2.5">
        <div className="flex items-start gap-2.5">
          {!readOnly && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggleSelect}
              aria-label={`Seleziona ${item.name}`}
              className="mt-0.5 shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm leading-tight truncate">{item.name}</p>
            {item.description && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {item.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge variant={isLow ? "destructive" : "secondary"} className="text-[10px]">
                {item.quantity} pz
              </Badge>
              {item.min_stock_level > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  min {item.min_stock_level}
                </span>
              )}
              {section && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: section.color }} />
                  {section.name}
                </Badge>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Azioni">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {!readOnly && (
                <>
                  <DropdownMenuItem onClick={onCarico}>
                    <ArrowUpCircle className="h-4 w-4 mr-2 text-emerald-600" />
                    Carico
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onScarico} disabled={item.quantity === 0}>
                    <ArrowDownCircle className="h-4 w-4 mr-2 text-red-500" />
                    Scarico
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Modifica
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={onHistory}>
                <History className="h-4 w-4 mr-2 text-muted-foreground" />
                Storico
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAudit}>
                <ClipboardCheck className="h-4 w-4 mr-2 text-muted-foreground" />
                Inventario
              </DropdownMenuItem>
              {!readOnly && (
                <DropdownMenuItem onClick={onTask}>
                  <CheckSquare className="h-4 w-4 mr-2 text-primary" />
                  Task
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t pt-2">
          <span className="truncate flex-1">{supplierName}</span>
          <div className="flex items-center gap-3 shrink-0">
            <span>{formatCurrency(item.unit_cost)}/u</span>
            <span className="font-medium text-foreground">
              {formatCurrency(item.unit_cost * item.quantity)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
