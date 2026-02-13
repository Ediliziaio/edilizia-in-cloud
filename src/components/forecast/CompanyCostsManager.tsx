import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isWithinInterval, startOfMonth, endOfMonth, addDays } from "date-fns";
import { it } from "date-fns/locale";
import {
  Building2,
  Plus,
  Check,
  Clock,
  AlertCircle,
  Pencil,
  Trash2,
  Receipt,
  Repeat,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "@/hooks/use-toast";

const CATEGORIES = [
  "Affitto",
  "Utenze",
  "Assicurazioni",
  "Leasing",
  "Trasporti",
  "Carburante",
  "Manutenzione",
  "Consulenze",
  "Marketing",
  "Software",
  "Tasse",
  "Altro",
];

const RECURRENCE_LABELS: Record<string, string> = {
  once: "Una tantum",
  monthly: "Mensile",
  quarterly: "Trimestrale",
  yearly: "Annuale",
};

interface CostFormData {
  name: string;
  cost_type: string;
  amount: string;
  category: string;
  recurrence: string;
  due_date: string;
  notes: string;
  order_id: string;
}

const defaultFormData: CostFormData = {
  name: "",
  cost_type: "fixed",
  amount: "",
  category: "",
  recurrence: "monthly",
  due_date: "",
  notes: "",
  order_id: "",
};

export default function CompanyCostsManager() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<any>(null);
  const [formData, setFormData] = useState<CostFormData>(defaultFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [payConfirmId, setPayConfirmId] = useState<string | null>(null);

  // Query costs
  const { data: costs = [], isLoading } = useQuery({
    queryKey: ["company-costs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("*, order:orders(id, order_code)")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Query orders for linking
  const { data: orders = [] } = useQuery({
    queryKey: ["orders-for-costs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (data: CostFormData) => {
      const payload = {
        company_id: companyId!,
        name: data.name,
        cost_type: data.cost_type,
        amount: parseFloat(data.amount) || 0,
        category: data.category || null,
        recurrence: data.recurrence,
        due_date: data.due_date,
        notes: data.notes || null,
        order_id: data.order_id || null,
      };

      if (editingCost) {
        const { error } = await supabase
          .from("company_costs")
          .update(payload)
          .eq("id", editingCost.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_costs")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      setDialogOpen(false);
      setEditingCost(null);
      setFormData(defaultFormData);
      toast({ title: editingCost ? "Costo aggiornato" : "Costo aggiunto" });
    },
    onError: () => {
      toast({ title: "Errore nel salvataggio", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_costs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      toast({ title: "Costo eliminato" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("company_costs")
        .update({ is_paid: true, paid_date: new Date().toISOString().split("T")[0] })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      toast({ title: "Costo segnato come pagato" });
    },
  });

  const openEdit = (cost: any) => {
    setEditingCost(cost);
    setFormData({
      name: cost.name,
      cost_type: cost.cost_type,
      amount: String(cost.amount),
      category: cost.category || "",
      recurrence: cost.recurrence,
      due_date: cost.due_date,
      notes: cost.notes || "",
      order_id: cost.order_id || "",
    });
    setDialogOpen(true);
  };

  const openCreate = (type: string) => {
    setEditingCost(null);
    setFormData({ ...defaultFormData, cost_type: type });
    setDialogOpen(true);
  };

  // Stats
  const now = new Date();
  const thisMonthInterval = { start: startOfMonth(now), end: endOfMonth(now) };
  const soon = addDays(now, 7);

  const fixedCosts = costs.filter((c: any) => c.cost_type === "fixed");
  const variableCosts = costs.filter((c: any) => c.cost_type === "variable");

  const thisMonthUnpaid = costs.filter(
    (c: any) => !c.is_paid && c.due_date && isWithinInterval(new Date(c.due_date), thisMonthInterval)
  );
  const thisMonthPaid = costs.filter(
    (c: any) => c.is_paid && c.paid_date && isWithinInterval(new Date(c.paid_date), thisMonthInterval)
  );

  const totalUnpaidThisMonth = thisMonthUnpaid.reduce((s: number, c: any) => s + Number(c.amount), 0);
  const totalPaidThisMonth = thisMonthPaid.reduce((s: number, c: any) => s + Number(c.amount), 0);

  const getStatusBadge = (cost: any) => {
    if (cost.is_paid) {
      return <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400">Pagato</Badge>;
    }
    const dueDate = new Date(cost.due_date);
    if (dueDate <= soon && dueDate >= now) {
      return <Badge className="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400">In scadenza</Badge>;
    }
    if (dueDate < now) {
      return <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400">Scaduto</Badge>;
    }
    return <Badge className="bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400">Da pagare</Badge>;
  };

  const renderCostsTable = (items: any[], type: string) => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => openCreate(type)} className="gap-1">
          <Plus className="h-4 w-4" />
          Aggiungi {type === "fixed" ? "Costo Fisso" : "Costo Variabile"}
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Nessun costo {type === "fixed" ? "fisso" : "variabile"} registrato</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Ricorrenza</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead>Stato</TableHead>
                {type === "variable" && <TableHead>Ordine</TableHead>}
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((cost: any) => (
                <TableRow key={cost.id}>
                  <TableCell className="font-medium">{cost.name}</TableCell>
                  <TableCell>{cost.category || "—"}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(cost.amount)}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1 text-sm">
                      <Repeat className="h-3 w-3" />
                      {RECURRENCE_LABELS[cost.recurrence] || cost.recurrence}
                    </span>
                  </TableCell>
                  <TableCell>
                    {cost.due_date
                      ? format(new Date(cost.due_date), "dd/MM/yyyy", { locale: it })
                      : "—"}
                  </TableCell>
                  <TableCell>{getStatusBadge(cost)}</TableCell>
                  {type === "variable" && (
                    <TableCell>
                      {cost.order?.order_code || "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {!cost.is_paid && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-green-600 hover:text-green-700"
                          onClick={() => setPayConfirmId(cost.id)}
                          title="Segna come pagato"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => openEdit(cost)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteConfirmId(cost.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-32 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Gestione Costi Aziendali
          </CardTitle>
          <CardDescription>
            Gestisci costi fissi e variabili, tieni traccia dei pagamenti
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium">Da pagare questo mese</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalUnpaidThisMonth)}</p>
              <p className="text-xs text-muted-foreground">{thisMonthUnpaid.length} costi in scadenza</p>
            </div>
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-1">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Pagato questo mese</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaidThisMonth)}</p>
              <p className="text-xs text-muted-foreground">{thisMonthPaid.length} costi pagati</p>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="fixed">
            <TabsList>
              <TabsTrigger value="fixed">
                Costi Fissi ({fixedCosts.length})
              </TabsTrigger>
              <TabsTrigger value="variable">
                Costi Variabili ({variableCosts.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="fixed">
              {renderCostsTable(fixedCosts, "fixed")}
            </TabsContent>
            <TabsContent value="variable">
              {renderCostsTable(variableCosts, "variable")}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCost ? "Modifica Costo" : "Nuovo Costo"}</DialogTitle>
            <DialogDescription>
              {editingCost ? "Aggiorna i dettagli del costo" : "Inserisci i dettagli del nuovo costo"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="es. Affitto ufficio"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={formData.cost_type} onValueChange={(v) => setFormData({ ...formData, cost_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fisso</SelectItem>
                    <SelectItem value="variable">Variabile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Importo (€) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ricorrenza</Label>
                <Select value={formData.recurrence} onValueChange={(v) => setFormData({ ...formData, recurrence: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Una tantum</SelectItem>
                    <SelectItem value="monthly">Mensile</SelectItem>
                    <SelectItem value="quarterly">Trimestrale</SelectItem>
                    <SelectItem value="yearly">Annuale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Data scadenza *</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
            {formData.cost_type === "variable" && (
              <div>
                <Label>Collega a ordine (opzionale)</Label>
                <Select value={formData.order_id} onValueChange={(v) => setFormData({ ...formData, order_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Nessun ordine" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nessuno</SelectItem>
                    {orders.map((order: any) => (
                      <SelectItem key={order.id} value={order.id}>
                        {order.order_code || order.description?.substring(0, 30) || order.id.substring(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Note</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Note aggiuntive..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => saveMutation.mutate(formData)}
              disabled={!formData.name || !formData.amount || !formData.due_date || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Salvataggio..." : editingCost ? "Aggiorna" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo costo?</AlertDialogTitle>
            <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); setDeleteConfirmId(null); }}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pay Confirm */}
      <AlertDialog open={!!payConfirmId} onOpenChange={() => setPayConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Segnare come pagato?</AlertDialogTitle>
            <AlertDialogDescription>Il costo verrà contrassegnato come pagato con la data odierna.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (payConfirmId) markPaidMutation.mutate(payConfirmId); setPayConfirmId(null); }}>
              Conferma Pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
