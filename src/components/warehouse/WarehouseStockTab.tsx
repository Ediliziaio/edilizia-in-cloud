import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Pencil, ArrowUpCircle, ArrowDownCircle, Search, AlertTriangle, History, CheckSquare, Filter, MoveRight, X } from "lucide-react";
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
import { StockItemDialog } from "./StockItemDialog";
import { StockMovementDialog } from "./StockMovementDialog";
import { StockMovementHistoryDialog } from "./StockMovementHistoryDialog";
import { WarehouseSectionsManager } from "./WarehouseSectionsManager";
import { WarehouseMapView } from "./WarehouseMapView";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWarehouseSections } from "@/hooks/useWarehouseSections";
import type { StockItem } from "@/types/warehouse";

export default function WarehouseStockTab() {
  const { effectiveCompany, user } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

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

  // Fetch stock items
  const { data: stockItems = [], isLoading } = useQuery({
    queryKey: ["warehouse-stock", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as StockItem[];
    },
    enabled: !!companyId,
  });

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", companyId],
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

  const getSupplierName = (id: string | null) =>
    !id ? "—" : (suppliers.find((s) => s.id === id)?.name || "—");

  const { sections } = useWarehouseSections();
  const getSectionName = (id: string | null) => {
    if (!id) return null;
    return sections.find((s) => s.id === id) || null;
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
    if (error) console.error("Error inserting cost:", error);
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
      registerCost?: boolean;
      costPaidDate?: string;
      costCategory?: string;
    }) => {
      if (data.id) {
        const { error } = await supabase
          .from("warehouse_stock")
          .update({
            name: data.name,
            description: data.description || null,
            quantity: data.quantity,
            unit_cost: data.unit_cost,
            vat_rate: data.vat_rate,
            supplier_id: data.supplier_id || null,
            section_id: data.section_id || null,
            min_stock_level: data.min_stock_level,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("warehouse_stock").insert({
          company_id: companyId!,
          name: data.name,
          description: data.description || null,
          quantity: data.quantity,
          unit_cost: data.unit_cost,
          vat_rate: data.vat_rate,
          supplier_id: data.supplier_id || null,
          section_id: data.section_id || null,
          min_stock_level: data.min_stock_level,
        });
        if (error) throw error;

        if (data.registerCost) {
          await insertCostRecord(data.name, data.unit_cost, data.quantity, data.vat_rate, data.supplier_id, data.costPaidDate, data.costCategory);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
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
      });
      if (movError) throw movError;

      const currentItem = stockItems.find((i) => i.id === stockItemId);
      if (!currentItem) throw new Error("Articolo non trovato");
      const newQty = type === "carico" ? currentItem.quantity + quantity : currentItem.quantity - quantity;

      const { error: updError } = await supabase
        .from("warehouse_stock")
        .update({ quantity: Math.max(0, newQty) })
        .eq("id", stockItemId);
      if (updError) throw updError;

      if (registerCost && type === "carico") {
        await insertCostRecord(currentItem.name, currentItem.unit_cost, quantity, currentItem.vat_rate ?? 22, currentItem.supplier_id || undefined, costPaidDate, costCategory);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
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
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      setSelectedIds(new Set());
      setBatchTargetSection("");
      toast.success("Articoli spostati", { description: `${selectedIds.size} articoli aggiornati.` });
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

  const lowStockItems = useMemo(
    () => stockItems.filter((i) => i.min_stock_level > 0 && i.quantity <= i.min_stock_level),
    [stockItems]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((i) => i.id)));
    }
  }, [filtered, selectedIds.size]);

  const handleBatchMove = () => {
    if (!batchTargetSection || selectedIds.size === 0) return;
    batchMoveMutation.mutate({
      ids: Array.from(selectedIds),
      sectionId: batchTargetSection === "__none__" ? null : batchTargetSection,
    });
  };

  return (
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

      {/* Sections Manager */}
      <WarehouseSectionsManager />

      {/* Warehouse Map */}
      <WarehouseMapView
        stockItems={stockItems}
        sections={sections}
        activeSectionFilter={sectionFilter}
        onFilterSection={setSectionFilter}
      />

      {/* Header with search, filter and add */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca articolo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {sections.length > 0 && (
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger className="w-[180px]">
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
        <Button onClick={() => { setEditingItem(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Aggiungi Articolo
        </Button>
      </div>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
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
              onClick={() => setSelectedIds(new Set())}
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
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
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
                {filtered.map((item) => {
                  const isLow = item.min_stock_level > 0 && item.quantity <= item.min_stock_level;
                  const section = getSectionName(item.section_id);
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <TableRow key={item.id} className={isLow ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(item.id)}
                          aria-label={`Seleziona ${item.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{item.name}</span>
                          {item.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>
                          )}
                        </div>
                      </TableCell>
                      {sections.length > 0 && (
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
                      <TableCell>{getSupplierName(item.supplier_id)}</TableCell>
                      <TableCell className="text-center">{item.min_stock_level || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Task" onClick={() => setTaskItem(item)}>
                            <CheckSquare className="h-4 w-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Storico" onClick={() => setHistoryItem(item)}>
                            <History className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Carico" onClick={() => setMovementDialog({ open: true, type: "carico", item })}>
                            <ArrowUpCircle className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Scarico" onClick={() => setMovementDialog({ open: true, type: "scarico", item })} disabled={item.quantity === 0}>
                            <ArrowDownCircle className="h-4 w-4 text-red-500" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Modifica" onClick={() => { setEditingItem(item); setDialogOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <StockItemDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingItem(null); }}
        editingItem={editingItem}
        isPending={saveMutation.isPending}
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
    </div>
  );
}
