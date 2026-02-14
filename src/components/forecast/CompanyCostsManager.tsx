import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isWithinInterval, startOfMonth, endOfMonth, addDays, addMonths, addQuarters, addYears, subMonths, startOfYear, endOfYear } from "date-fns";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import {
  Building2,
  Plus,
  Check,
  Clock,
  AlertCircle,
  CalendarPlus,
  Pencil,
  Trash2,
  Receipt,
  Repeat,
  Search,
  Download,
  Upload,
  TrendingUp,
  Package,
  ExternalLink,
  Undo2,
  CheckSquare,
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
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "@/hooks/use-toast";
import { CSVImportDialog, type ImportField } from "@/components/shared/CSVImportDialog";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";

const COST_IMPORT_FIELDS: ImportField[] = [
  { key: "name", label: "Nome", required: true },
  { key: "cost_type", label: "Tipo", required: false },
  { key: "amount", label: "Importo", required: true, type: "number" },
  { key: "category", label: "Categoria", required: false },
  { key: "recurrence", label: "Ricorrenza", required: false },
  { key: "due_date", label: "Data Scadenza", required: true, type: "date" },
  { key: "notes", label: "Note", required: false },
];

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
  "Materiali",
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

type PeriodFilter = "this_month" | "next_month" | "last_3_months" | "this_year" | "all";
type StatusFilter = "all" | "unpaid" | "paid" | "overdue";

// Unified cost item type used for rendering
interface UnifiedCost {
  id: string;
  realOrderItemId?: string;
  name: string;
  cost_type: string;
  amount: number;
  category: string | null;
  recurrence: string;
  due_date: string;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
  order_id: string | null;
  order?: { id: string; order_code: string | null } | null;
  isFromOrder?: boolean;
  orderItemStatus?: string;
  supplierName?: string | null;
}

export default function CompanyCostsManager() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<any>(null);
  const [formData, setFormData] = useState<CostFormData>(defaultFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payingCostId, setPayingCostId] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [duplicatePeriods, setDuplicatePeriods] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [taskCostId, setTaskCostId] = useState<string | null>(null);

  // Filters
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

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

  // Query order items with status da_ordinare or ordinato
  const { data: orderItemCosts = [], isLoading: isLoadingOrderItems } = useQuery({
    queryKey: ["order-item-costs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, name, quantity, purchase_price, status, is_paid, paid_date, supplier:suppliers(name), order:orders!inner(id, order_code, company_id)")
        .in("status", ["da_ordinare", "ordinato"]);
      if (error) throw error;
      return (data || []) as any[];
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

  // Transform order items into unified cost format
  const orderItemsAsVariableCosts: UnifiedCost[] = useMemo(() => {
    return orderItemCosts.map((item: any) => ({
      id: `order-item-${item.id}`,
      realOrderItemId: item.id,
      name: item.name,
      cost_type: "variable",
      amount: (Number(item.purchase_price) || 0) * (Number(item.quantity) || 1),
      category: "Materiali",
      recurrence: "once",
      due_date: new Date().toISOString().split("T")[0],
      is_paid: !!item.is_paid,
      paid_date: item.paid_date || null,
      notes: null,
      order_id: item.order?.id || null,
      order: item.order ? { id: item.order.id, order_code: item.order.order_code } : null,
      isFromOrder: true,
      orderItemStatus: item.status,
      supplierName: item.supplier?.name || null,
    }));
  }, [orderItemCosts]);

  // Filtering logic
  const filteredCosts = useMemo(() => {
    const now = new Date();
    let filtered = costs as any[];

    // Period filter
    if (periodFilter !== "all") {
      let start: Date, end: Date;
      if (periodFilter === "this_month") {
        start = startOfMonth(now);
        end = endOfMonth(now);
      } else if (periodFilter === "next_month") {
        start = startOfMonth(addMonths(now, 1));
        end = endOfMonth(addMonths(now, 1));
      } else if (periodFilter === "last_3_months") {
        start = startOfMonth(subMonths(now, 2));
        end = endOfMonth(now);
      } else {
        start = startOfYear(now);
        end = endOfYear(now);
      }
      filtered = filtered.filter((c: any) => {
        if (!c.due_date) return false;
        const d = new Date(c.due_date);
        return isWithinInterval(d, { start, end });
      });
    }

    // Status filter
    if (statusFilter === "paid") {
      filtered = filtered.filter((c: any) => c.is_paid);
    } else if (statusFilter === "unpaid") {
      filtered = filtered.filter((c: any) => !c.is_paid && new Date(c.due_date) >= now);
    } else if (statusFilter === "overdue") {
      filtered = filtered.filter((c: any) => !c.is_paid && new Date(c.due_date) < now);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c: any) => c.name.toLowerCase().includes(q));
    }

    return filtered;
  }, [costs, periodFilter, statusFilter, searchQuery]);

  // Filter order item costs by search only (they don't have due_date logic for period/status)
  const filteredOrderItemCosts = useMemo(() => {
    let filtered = orderItemsAsVariableCosts;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(q));
    }
    // Status filter for order items
    if (statusFilter === "paid") {
      filtered = filtered.filter((c) => c.is_paid);
    } else if (statusFilter === "unpaid") {
      filtered = filtered.filter((c) => !c.is_paid);
    }
    return filtered;
  }, [orderItemsAsVariableCosts, searchQuery, statusFilter]);

  const fixedCosts = filteredCosts.filter((c: any) => c.cost_type === "fixed");
  const manualVariableCosts = filteredCosts.filter((c: any) => c.cost_type === "variable");
  const variableCostsWithOrders = [...manualVariableCosts, ...filteredOrderItemCosts];
  const allCostsSorted = [...filteredCosts, ...filteredOrderItemCosts].sort((a: any, b: any) => {
    const dateA = a.due_date ? new Date(a.due_date).getTime() : 0;
    const dateB = b.due_date ? new Date(b.due_date).getTime() : 0;
    return dateA - dateB;
  });

  // Annual estimate (exclude order items - they are one-time from orders)
  const annualEstimate = useMemo(() => {
    let total = 0;
    const byCategory: Record<string, number> = {};
    costs.forEach((c: any) => {
      let projected = 0;
      if (c.recurrence === "monthly") projected = Number(c.amount) * 12;
      else if (c.recurrence === "quarterly") projected = Number(c.amount) * 4;
      else if (c.recurrence === "yearly") projected = Number(c.amount);
      else projected = Number(c.amount);
      total += projected;
      const cat = c.category || "Altro";
      byCategory[cat] = (byCategory[cat] || 0) + projected;
    });
    return { total, byCategory };
  }, [costs]);

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
        order_id: data.order_id && data.order_id !== "none" ? data.order_id : null,
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
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase
        .from("company_costs")
        .update({ is_paid: true, paid_date: date })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      setPayDialogOpen(false);
      setPayingCostId(null);
      toast({ title: "Costo segnato come pagato" });
    },
  });

  const markUnpaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("company_costs")
        .update({ is_paid: false, paid_date: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      toast({ title: "Costo riportato a non pagato" });
    },
  });

  // Order item payment mutations
  const markOrderItemPaidMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase
        .from("order_items")
        .update({ is_paid: true, paid_date: date } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-item-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      setPayDialogOpen(false);
      setPayingCostId(null);
      toast({ title: "Articolo segnato come pagato" });
    },
  });

  const markOrderItemUnpaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("order_items")
        .update({ is_paid: false, paid_date: null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-item-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      toast({ title: "Articolo riportato a non pagato" });
    },
  });

  // Duplicate recurring costs mutation
  const recurringCosts = useMemo(() => costs.filter((c: any) => c.recurrence !== "once"), [costs]);

  const duplicateRecurringMutation = useMutation({
    mutationFn: async (periods: number) => {
      let created = 0;
      for (const cost of recurringCosts) {
        for (let p = 1; p <= periods; p++) {
          const dueDate = new Date(cost.due_date);
          let nextDate: Date;
          if (cost.recurrence === "monthly") nextDate = addMonths(dueDate, p);
          else if (cost.recurrence === "quarterly") nextDate = addQuarters(dueDate, p);
          else nextDate = addYears(dueDate, p);

          const nextDateStr = format(nextDate, "yyyy-MM-dd");

          const { data: existing } = await supabase
            .from("company_costs")
            .select("id")
            .eq("company_id", companyId!)
            .eq("name", cost.name)
            .eq("due_date", nextDateStr)
            .limit(1);

          if (existing && existing.length > 0) continue;

          const { error } = await supabase.from("company_costs").insert({
            company_id: companyId!,
            name: cost.name,
            cost_type: cost.cost_type,
            amount: cost.amount,
            category: cost.category,
            recurrence: cost.recurrence,
            due_date: nextDateStr,
            notes: cost.notes,
            order_id: cost.order_id,
            is_paid: false,
          });
          if (error) throw error;
          created++;
        }
      }
      return created;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      setShowDuplicateConfirm(false);
      setDuplicatePeriods(1);
      toast({
        title: count > 0 ? `${count} costi generati` : "Nessun nuovo costo da generare (già esistenti)",
      });
    },
    onError: () => {
      toast({ title: "Errore nella generazione", variant: "destructive" });
    },
  });

  // Export CSV
  const exportCostsCSV = () => {
    const allForExport = [...filteredCosts, ...filteredOrderItemCosts];
    const rows = [["Nome", "Tipo", "Categoria", "Importo", "Ricorrenza", "Scadenza", "Stato", "Origine"]];
    allForExport.forEach((c: any) => {
      rows.push([
        c.name,
        c.cost_type === "fixed" ? "Fisso" : "Variabile",
        c.category || "",
        String(c.amount),
        RECURRENCE_LABELS[c.recurrence] || c.recurrence,
        c.due_date ? format(new Date(c.due_date), "dd/MM/yyyy") : "",
        c.is_paid ? "Pagato" : c.due_date && new Date(c.due_date) < new Date() ? "Scaduto" : "Da pagare",
        c.isFromOrder ? "Da Ordine" : "Manuale",
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `costi-aziendali-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV esportato" });
  };

  // Import handler
  const handleCostsImport = async (rows: Record<string, string>[]) => {
    if (!companyId) return { success: 0, errors: ["Azienda non trovata"] };
    let success = 0;
    const errors: string[] = [];
    const recurrenceMap: Record<string, string> = {
      "mensile": "monthly", "trimestrale": "quarterly", "annuale": "yearly",
      "una tantum": "once", "monthly": "monthly", "quarterly": "quarterly",
      "yearly": "yearly", "once": "once",
    };
    const typeMap: Record<string, string> = {
      "fisso": "fixed", "variabile": "variable", "fixed": "fixed", "variable": "variable",
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.name?.trim()) { errors.push(`Riga ${i + 1}: Nome mancante`); continue; }
        const amount = parseFloat(row.amount);
        if (isNaN(amount) || amount <= 0) { errors.push(`Riga ${i + 1}: Importo non valido`); continue; }
        if (!row.due_date?.trim()) { errors.push(`Riga ${i + 1}: Data scadenza mancante`); continue; }

        // Parse date (accept dd/MM/yyyy or yyyy-MM-dd)
        let dueDate = row.due_date.trim();
        if (dueDate.includes("/")) {
          const parts = dueDate.split("/");
          if (parts.length === 3) dueDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }

        const costType = typeMap[(row.cost_type || "").toLowerCase().trim()] || "fixed";
        const recurrence = recurrenceMap[(row.recurrence || "").toLowerCase().trim()] || "monthly";

        const { error } = await supabase.from("company_costs").insert({
          company_id: companyId,
          name: row.name.trim(),
          cost_type: costType,
          amount,
          category: row.category?.trim() || null,
          recurrence,
          due_date: dueDate,
          notes: row.notes?.trim() || null,
        });
        if (error) throw error;
        success++;
      } catch (err: any) {
        errors.push(`Riga ${i + 1}: ${err?.message || "Errore"}`);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["company-costs"] });
    queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
    return { success, errors };
  };

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
      order_id: cost.order_id || "none",
    });
    setDialogOpen(true);
  };

  const openCreate = (type: string) => {
    setEditingCost(null);
    setFormData({ ...defaultFormData, cost_type: type });
    setDialogOpen(true);
  };

  // Stats - include order item costs in "da pagare"
  const now = new Date();
  const thisMonthInterval = { start: startOfMonth(now), end: endOfMonth(now) };
  const soon = addDays(now, 7);

  const thisMonthUnpaid = costs.filter(
    (c: any) => !c.is_paid && c.due_date && isWithinInterval(new Date(c.due_date), thisMonthInterval)
  );
  const thisMonthPaid = costs.filter(
    (c: any) => c.is_paid && c.paid_date && isWithinInterval(new Date(c.paid_date), thisMonthInterval)
  );
  const overdueCosts = costs.filter((c: any) => !c.is_paid && new Date(c.due_date) < now);

  const orderItemsTotalUnpaid = orderItemsAsVariableCosts.filter(c => !c.is_paid).reduce((s, c) => s + c.amount, 0);
  const totalUnpaidThisMonth = thisMonthUnpaid.reduce((s: number, c: any) => s + Number(c.amount), 0) + orderItemsTotalUnpaid;
  const totalPaidThisMonth = thisMonthPaid.reduce((s: number, c: any) => s + Number(c.amount), 0);
  const totalOverdue = overdueCosts.reduce((s: number, c: any) => s + Number(c.amount), 0);

  const getStatusBadge = (cost: UnifiedCost) => {
    if (cost.isFromOrder) {
      if (cost.is_paid) {
        const paidLabel = cost.paid_date
          ? `Pagato il ${format(new Date(cost.paid_date), "dd/MM/yyyy", { locale: it })}`
          : "Pagato";
        return <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400">{paidLabel}</Badge>;
      }
      if (cost.orderItemStatus === "ordinato") {
        return <Badge className="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400">Ordinato</Badge>;
      }
      return <Badge className="bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400">Da pagare</Badge>;
    }
    if (cost.is_paid) {
      const paidLabel = cost.paid_date
        ? `Pagato il ${format(new Date(cost.paid_date), "dd/MM/yyyy", { locale: it })}`
        : "Pagato";
      return <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400">{paidLabel}</Badge>;
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

  const renderCostsTable = (items: UnifiedCost[], type: string) => (
    <div className="space-y-4">
      {type !== "all" && !items.some(i => i.isFromOrder && type === "variable") && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => openCreate(type)} className="gap-1">
            <Plus className="h-4 w-4" />
            Aggiungi {type === "fixed" ? "Costo Fisso" : "Costo Variabile"}
          </Button>
        </div>
      )}
      {type === "variable" && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => openCreate("variable")} className="gap-1">
            <Plus className="h-4 w-4" />
            Aggiungi Costo Variabile
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Nessun costo trovato</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                {type === "all" && <TableHead>Tipo</TableHead>}
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Ricorrenza</TableHead>
                <TableHead>Scadenza</TableHead>
                <TableHead>Stato</TableHead>
                {(type === "variable" || type === "all") && <TableHead>Ordine</TableHead>}
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((cost) => (
                <TableRow key={cost.id} className={cost.isFromOrder ? "bg-orange-50/50 dark:bg-orange-900/5" : ""}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {cost.name}
                      {cost.isFromOrder && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge className="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 gap-1 text-[10px] px-1.5">
                                <Package className="h-3 w-3" />
                                Da Ordine
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Questo costo viene dagli articoli dell'ordine.<br />Gestiscilo dalla pagina ordine.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {cost.isFromOrder && cost.supplierName && (
                      <span className="text-xs text-muted-foreground block mt-0.5">
                        Fornitore: {cost.supplierName}
                      </span>
                    )}
                  </TableCell>
                  {type === "all" && (
                    <TableCell>
                      <Badge variant="outline" className={cost.cost_type === "fixed" ? "border-red-400 text-red-600" : "border-amber-400 text-amber-600"}>
                        {cost.cost_type === "fixed" ? "Fisso" : "Variabile"}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell>{cost.category || "—"}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(cost.amount)}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1 text-sm">
                      <Repeat className="h-3 w-3" />
                      {RECURRENCE_LABELS[cost.recurrence] || cost.recurrence}
                    </span>
                  </TableCell>
                  <TableCell>
                    {cost.isFromOrder
                      ? "—"
                      : cost.due_date
                        ? format(new Date(cost.due_date), "dd/MM/yyyy", { locale: it })
                        : "—"}
                  </TableCell>
                  <TableCell>{getStatusBadge(cost)}</TableCell>
                  {(type === "variable" || type === "all") && (
                    <TableCell>
                      {cost.order?.order_code ? (
                        <Link
                          to={`/azienda/ordini/${cost.order.id}`}
                          className="text-primary hover:underline flex items-center gap-1 text-sm"
                        >
                          {cost.order.order_code}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    {cost.isFromOrder ? (
                      <div className="flex justify-end gap-1">
                        {!cost.is_paid ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-600 hover:text-green-700"
                            onClick={() => {
                              setPayingCostId(cost.id);
                              setPaymentDate(format(new Date(), "yyyy-MM-dd"));
                              setPayDialogOpen(true);
                            }}
                            title="Segna come pagato"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-orange-600 hover:text-orange-700"
                            onClick={() => markOrderItemUnpaidMutation.mutate((cost as any).realOrderItemId)}
                            title="Riporta a non pagato"
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Link to={`/azienda/ordini/${cost.order?.id}`}>
                          <Button size="sm" variant="ghost" className="gap-1 text-xs">
                            <ExternalLink className="h-3 w-3" />
                            Vai all'ordine
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        {!cost.is_paid ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-600 hover:text-green-700"
                            onClick={() => {
                              setPayingCostId(cost.id);
                              setPaymentDate(format(new Date(), "yyyy-MM-dd"));
                              setPayDialogOpen(true);
                            }}
                            title="Segna come pagato"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-orange-600 hover:text-orange-700"
                            onClick={() => markUnpaidMutation.mutate(cost.id)}
                            title="Riporta a non pagato"
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => setTaskCostId(cost.id)}
                          title="Task collegate"
                        >
                          <CheckSquare className="h-4 w-4 text-primary" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEdit(cost as any)}
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
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  if (isLoading || isLoadingOrderItems) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Gestione Costi Aziendali
              </CardTitle>
              <CardDescription>
                Gestisci costi fissi e variabili, tieni traccia dei pagamenti
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1">
                <Upload className="h-4 w-4" />
                Importa
              </Button>
              <Button variant="outline" size="sm" onClick={exportCostsCSV} className="gap-1">
                <Download className="h-4 w-4" />
                Esporta CSV
              </Button>
              {recurringCosts.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setShowDuplicateConfirm(true)} className="gap-1">
                  <CalendarPlus className="h-4 w-4" />
                  Genera prossimo periodo
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium">Da pagare (incl. ordini)</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalUnpaidThisMonth)}</p>
              <p className="text-xs text-muted-foreground">
                {thisMonthUnpaid.length} costi manuali + {orderItemsAsVariableCosts.length} da ordini
              </p>
            </div>
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-1">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Pagato questo mese</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaidThisMonth)}</p>
              <p className="text-xs text-muted-foreground">{thisMonthPaid.length} costi pagati</p>
            </div>
            <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium">Scaduti</span>
              </div>
              <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalOverdue)}</p>
              <p className="text-xs text-muted-foreground">{overdueCosts.length} costi scaduti</p>
            </div>
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">Stima Annuale</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(annualEstimate.total)}</p>
              <p className="text-xs text-muted-foreground">{Object.keys(annualEstimate.byCategory).length} categorie</p>
            </div>
          </div>

          {/* Annual breakdown */}
          {Object.keys(annualEstimate.byCategory).length > 0 && (
            <div className="p-4 rounded-lg border bg-muted/30">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Distribuzione Annuale per Categoria
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {Object.entries(annualEstimate.byCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, amount]) => (
                    <div key={cat} className="flex justify-between items-center text-sm p-2 rounded bg-background border">
                      <span className="text-muted-foreground truncate mr-2">{cat}</span>
                      <span className="font-medium whitespace-nowrap">{formatCurrency(amount)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca costo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i periodi</SelectItem>
                <SelectItem value="this_month">Questo mese</SelectItem>
                <SelectItem value="next_month">Prossimo mese</SelectItem>
                <SelectItem value="last_3_months">Ultimi 3 mesi</SelectItem>
                <SelectItem value="this_year">Quest'anno</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="unpaid">Da pagare</SelectItem>
                <SelectItem value="paid">Pagati</SelectItem>
                <SelectItem value="overdue">Scaduti</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">
                Tutti ({allCostsSorted.length})
              </TabsTrigger>
              <TabsTrigger value="fixed">
                Costi Fissi ({fixedCosts.length})
              </TabsTrigger>
              <TabsTrigger value="variable">
                Costi Variabili ({variableCostsWithOrders.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              {renderCostsTable(allCostsSorted, "all")}
            </TabsContent>
            <TabsContent value="fixed">
              {renderCostsTable(fixedCosts, "fixed")}
            </TabsContent>
            <TabsContent value="variable">
              {renderCostsTable(variableCostsWithOrders, "variable")}
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
                <Select
                  value={formData.category || undefined}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
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
                <Select
                  value={formData.order_id || "none"}
                  onValueChange={(v) => setFormData({ ...formData, order_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Nessun ordine" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuno</SelectItem>
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

      {/* Payment Dialog with Date */}
      <Dialog open={payDialogOpen} onOpenChange={(open) => { if (!open) { setPayDialogOpen(false); setPayingCostId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registra Pagamento</DialogTitle>
            <DialogDescription>Seleziona la data in cui è stato effettuato il pagamento.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Data pagamento</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayDialogOpen(false); setPayingCostId(null); }}>Annulla</Button>
            <Button
              onClick={() => {
                if (payingCostId && paymentDate) {
                  if (payingCostId.startsWith("order-item-")) {
                    const realId = payingCostId.replace("order-item-", "");
                    markOrderItemPaidMutation.mutate({ id: realId, date: paymentDate });
                  } else {
                    markPaidMutation.mutate({ id: payingCostId, date: paymentDate });
                  }
                }
              }}
              disabled={!paymentDate || markPaidMutation.isPending || markOrderItemPaidMutation.isPending}
            >
              {(markPaidMutation.isPending || markOrderItemPaidMutation.isPending) ? "Salvataggio..." : "Conferma Pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Recurring Confirm */}
      <AlertDialog open={showDuplicateConfirm} onOpenChange={setShowDuplicateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Genera costi ricorrenti</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno duplicati {recurringCosts.length} costi ricorrenti.
              I duplicati già esistenti verranno ignorati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>Quanti periodi in avanti generare?</Label>
            <div className="flex items-center gap-3 mt-2">
              <Input
                type="number"
                min={1}
                max={24}
                value={duplicatePeriods}
                onChange={(e) => setDuplicatePeriods(Math.max(1, Math.min(24, parseInt(e.target.value) || 1)))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                {duplicatePeriods === 1 ? "periodo" : "periodi"} (es. {duplicatePeriods} {duplicatePeriods === 1 ? "mese" : "mesi"} per i mensili)
              </span>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => duplicateRecurringMutation.mutate(duplicatePeriods)}
              disabled={duplicateRecurringMutation.isPending}
            >
              {duplicateRecurringMutation.isPending ? "Generazione..." : `Genera ${duplicatePeriods} ${duplicatePeriods === 1 ? "periodo" : "periodi"}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CSVImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importa Costi"
        fields={COST_IMPORT_FIELDS}
        onImport={handleCostsImport}
      />

      {/* Task dialog for cost */}
      <Dialog open={!!taskCostId} onOpenChange={(v) => { if (!v) setTaskCostId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Task collegate</DialogTitle>
            <DialogDescription>Attività collegate a questo costo</DialogDescription>
          </DialogHeader>
          {taskCostId && (
            <LinkedTasks costId={taskCostId} category="costi" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
