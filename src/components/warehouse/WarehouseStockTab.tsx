import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, ArrowUpCircle, ArrowDownCircle, Search, AlertTriangle, History, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { StockItemDialog } from "./StockItemDialog";
import { StockMovementDialog } from "./StockMovementDialog";
import { StockMovementHistoryDialog } from "./StockMovementHistoryDialog";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { StockItem } from "@/types/warehouse";

export default function WarehouseStockTab() {
  const { effectiveCompany, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [movementDialog, setMovementDialog] = useState<{
    open: boolean;
    type: "carico" | "scarico";
    item: StockItem | null;
  }>({ open: false, type: "carico", item: null });
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [taskItem, setTaskItem] = useState<StockItem | null>(null);

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

  // Fetch suppliers for display (shared queryKey with useWarehouseData)
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

  const getSupplierName = (id: string | null) => {
    if (!id) return "—";
    return suppliers.find((s) => s.id === id)?.name || "—";
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
          min_stock_level: data.min_stock_level,
        });
        if (error) throw error;

        // Register cost if requested (only for new items)
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
      toast({ title: "Salvato", description: "Articolo di magazzino salvato." });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile salvare l'articolo.", variant: "destructive" });
    },
  });

  // Movement mutation
  const movementMutation = useMutation({
    mutationFn: async ({
      stockItemId,
      type,
      quantity,
      notes,
      registerCost,
      costPaidDate,
      costCategory,
    }: {
      stockItemId: string;
      type: "carico" | "scarico";
      quantity: number;
      notes?: string;
      registerCost?: boolean;
      costPaidDate?: string;
      costCategory?: string;
    }) => {
      // Insert movement
      const { error: movError } = await supabase.from("warehouse_movements").insert({
        stock_item_id: stockItemId,
        movement_type: type,
        quantity,
        notes: notes || null,
        performed_by: user!.id,
      });
      if (movError) throw movError;

      // Update stock quantity
      const currentItem = stockItems.find((i) => i.id === stockItemId);
      if (!currentItem) throw new Error("Articolo non trovato");
      const newQty = type === "carico" ? currentItem.quantity + quantity : currentItem.quantity - quantity;
      
      const { error: updError } = await supabase
        .from("warehouse_stock")
        .update({ quantity: Math.max(0, newQty) })
        .eq("id", stockItemId);
      if (updError) throw updError;

      // Register cost if requested (only for carico)
      if (registerCost && type === "carico") {
        await insertCostRecord(currentItem.name, currentItem.unit_cost, quantity, currentItem.vat_rate ?? 22, currentItem.supplier_id || undefined, costPaidDate, costCategory);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      setMovementDialog({ open: false, type: "carico", item: null });
      toast({ title: "Movimento registrato" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile registrare il movimento.", variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!searchQuery) return stockItems;
    const q = searchQuery.toLowerCase();
    return stockItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
    );
  }, [stockItems, searchQuery]);

  const lowStockItems = useMemo(
    () => stockItems.filter((i) => i.min_stock_level > 0 && i.quantity <= i.min_stock_level),
    [stockItems]
  );

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

      {/* Header with search and add */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca articolo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => { setEditingItem(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Aggiungi Articolo
        </Button>
      </div>

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
                  <TableHead>Articolo</TableHead>
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
                  return (
                    <TableRow key={item.id} className={isLow ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{item.name}</span>
                          {item.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>
                          )}
                        </div>
                      </TableCell>
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
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Task"
                            onClick={() => setTaskItem(item)}
                          >
                            <CheckSquare className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Storico"
                            onClick={() => setHistoryItem(item)}
                          >
                            <History className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Carico"
                            onClick={() => setMovementDialog({ open: true, type: "carico", item })}
                          >
                            <ArrowUpCircle className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Scarico"
                            onClick={() => setMovementDialog({ open: true, type: "scarico", item })}
                            disabled={item.quantity === 0}
                          >
                            <ArrowDownCircle className="h-4 w-4 text-red-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Modifica"
                            onClick={() => { setEditingItem(item); setDialogOpen(true); }}
                          >
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
        onSave={(data) =>
          saveMutation.mutate({ ...data, id: editingItem?.id })
        }
      />

      <StockMovementDialog
        open={movementDialog.open}
        onOpenChange={(v) => {
          if (!v) setMovementDialog({ open: false, type: "carico", item: null });
        }}
        type={movementDialog.type}
        itemName={movementDialog.item?.name || ""}
        maxQuantity={movementDialog.type === "scarico" ? movementDialog.item?.quantity : undefined}
        isPending={movementMutation.isPending}
        onSave={(data) => {
          if (!movementDialog.item) return;
          movementMutation.mutate({
            stockItemId: movementDialog.item.id,
            type: movementDialog.type,
            ...data,
          });
        }}
      />
      <StockMovementHistoryDialog
        open={!!historyItem}
        onOpenChange={(v) => { if (!v) setHistoryItem(null); }}
        item={historyItem}
      />

      {/* Task Dialog for stock item */}
      <Dialog open={!!taskItem} onOpenChange={(v) => { if (!v) setTaskItem(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Task - {taskItem?.name}</DialogTitle>
            <DialogDescription>Attività collegate a questo articolo</DialogDescription>
          </DialogHeader>
          {taskItem && (
            <LinkedTasks stockItemId={taskItem.id} category="magazzino" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
