import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isWithinInterval, startOfMonth, endOfMonth, addDays, addMonths, addQuarters, addYears, subMonths, startOfYear, endOfYear } from "date-fns";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import {
  Building2,
  Truck,
  Plus,
  Check,
  Clock,
  AlertCircle,
  Pencil,
  Trash2,
  Receipt,
  Repeat,
  Search,
  Download,
  Upload,
  Package,
  ExternalLink,
  Undo2,
  CheckSquare,
  Calculator,
  Filter,
  Info,
  MoreHorizontal,
  X,
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
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatters";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { toast } from "@/hooks/use-toast";
import { CSVImportDialog, type ImportField } from "@/components/shared/CSVImportDialog";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { Progress } from "@/components/ui/progress";
import { VAT_RATES, calculateNetFromGross, calculateGrossFromNet } from "@/lib/vatUtils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const COST_IMPORT_FIELDS: ImportField[] = [
  { key: "name", label: "Nome", required: true },
  { key: "cost_type", label: "Tipo", required: false },
  { key: "amount", label: "Importo", required: true, type: "number" },
  { key: "category", label: "Categoria", required: false },
  { key: "recurrence", label: "Ricorrenza", required: false },
  { key: "due_date", label: "Data Scadenza", required: true, type: "date" },
  { key: "notes", label: "Note", required: false },
];

const RECURRENCE_LABELS: Record<string, string> = {
  once: "Una tantum",
  monthly: "Mensile",
  quarterly: "Trimestrale",
  yearly: "Annuale",
};

const DEFAULT_PERIODS: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  yearly: 1,
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
  supplier_id: string;
  vat_rate: string;
  is_gross: boolean;
  periods: string;
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
  supplier_id: "",
  vat_rate: "22",
  is_gross: false,
  periods: "12",
};

type PeriodFilter = "this_month" | "next_month" | "last_3_months" | "this_year" | "all";
type StatusFilter = "all" | "unpaid" | "paid" | "overdue";

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
  supplier_id?: string | null;
  vat_rate?: number | null;
}

function getNextDate(baseDate: Date, recurrence: string, offset: number): Date {
  if (recurrence === "monthly") return addMonths(baseDate, offset);
  if (recurrence === "quarterly") return addQuarters(baseDate, offset);
  if (recurrence === "yearly") return addYears(baseDate, offset);
  return baseDate;
}

export default function CompanyCostsManager() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<UnifiedCost | null>(null);
  const [formData, setFormData] = useState<CostFormData>(defaultFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payingCostId, setPayingCostId] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [importOpen, setImportOpen] = useState(false);
  const [taskCostId, setTaskCostId] = useState<string | null>(null);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  // Bulk selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteGroupName, setDeleteGroupName] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Filters
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Query costs with supplier join
  const { data: costs = [], isLoading } = useQuery({
    queryKey: ["company-costs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("*, order:orders(id, order_code), supplier:suppliers(id, name, product_category, vat_rate)")
        .eq("company_id", companyId!)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Query suppliers for the form
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-for-costs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, product_category, vat_rate")
        .eq("company_id", companyId!)
        .order("name");
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
        .in("status", ["da_ordinare", "ordinato"])
        .eq("order.company_id", companyId!);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!companyId,
  });

  // Query supplier installment payments
  const { data: supplierPaymentItems = [], isLoading: isLoadingSupplierPayments } = useQuery({
    queryKey: ["supplier-payment-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id, name, purchase_price, quantity,
          balance_amount, balance_expected_date, balance_paid, balance_paid_date,
          deposit_amount, deposit_paid, deposit_paid_date,
          is_paid, paid_date, payment_method,
          supplier:suppliers(name),
          order:orders!inner(id, order_code, company_id)
        `)
        .not("supplier_id", "is", null);
      if (error) throw error;
      return (data || []).filter((item: any) => item.order?.company_id === companyId) as any[];
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
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Dynamic categories from costs + suppliers
  const dynamicCategories = useMemo(() => {
    const cats = new Set<string>();
    costs.forEach((c: any) => { if (c.category) cats.add(c.category); });
    suppliers.forEach((s: any) => { if (s.product_category) cats.add(s.product_category); });
    if (cats.size === 0) {
      ["Affitto", "Utenze", "Assicurazioni", "Leasing", "Trasporti", "Consulenze", "Marketing", "Software", "Tasse", "Materiali", "Altro"].forEach(c => cats.add(c));
    }
    return Array.from(cats).sort();
  }, [costs, suppliers]);

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

    if (periodFilter !== "all") {
      let start: Date, end: Date;
      if (periodFilter === "this_month") { start = startOfMonth(now); end = endOfMonth(now); }
      else if (periodFilter === "next_month") { start = startOfMonth(addMonths(now, 1)); end = endOfMonth(addMonths(now, 1)); }
      else if (periodFilter === "last_3_months") { start = startOfMonth(subMonths(now, 2)); end = endOfMonth(now); }
      else { start = startOfYear(now); end = endOfYear(now); }
      filtered = filtered.filter((c: any) => {
        if (!c.due_date) return false;
        const d = new Date(c.due_date);
        return isWithinInterval(d, { start, end });
      });
    }

    if (statusFilter === "paid") filtered = filtered.filter((c: any) => c.is_paid);
    else if (statusFilter === "unpaid") filtered = filtered.filter((c: any) => !c.is_paid && new Date(c.due_date) >= now);
    else if (statusFilter === "overdue") filtered = filtered.filter((c: any) => !c.is_paid && new Date(c.due_date) < now);

    if (supplierFilter !== "all") {
      if (supplierFilter === "none") filtered = filtered.filter((c: any) => !c.supplier_id);
      else filtered = filtered.filter((c: any) => c.supplier_id === supplierFilter);
    }

    if (categoryFilter !== "all") {
      filtered = filtered.filter((c: any) => c.category === categoryFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c: any) =>
        c.name.toLowerCase().includes(q) ||
        (c.supplier?.name || "").toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [costs, periodFilter, statusFilter, searchQuery, supplierFilter, categoryFilter]);

  const filteredOrderItemCosts = useMemo(() => {
    let filtered = orderItemsAsVariableCosts;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (statusFilter === "paid") filtered = filtered.filter((c) => c.is_paid);
    else if (statusFilter === "unpaid") filtered = filtered.filter((c) => !c.is_paid);
    return filtered;
  }, [orderItemsAsVariableCosts, searchQuery, statusFilter]);

  // Supplier payments computed
  const supplierPaymentsData = useMemo(() => {
    const items: { id: string; supplierName: string; orderCode: string | null; orderId: string; type: string; amount: number; isPaid: boolean; date: Date | null; paidDate: string | null }[] = [];
    supplierPaymentItems.forEach((item: any) => {
      const supplierName = item.supplier?.name || "Fornitore sconosciuto";
      const totalCost = (Number(item.purchase_price) || 0) * (Number(item.quantity) || 1);
      const method = item.payment_method;

      if (method === "50_50" || method === "30_70") {
        const depositPct = method === "50_50" ? 0.5 : 0.3;
        const depositAmt = Number(item.deposit_amount) || totalCost * depositPct;
        const balanceAmt = Number(item.balance_amount) || totalCost - depositAmt;
        items.push({ id: `${item.id}-dep`, supplierName, orderCode: item.order?.order_code, orderId: item.order?.id, type: "Acconto", amount: depositAmt, isPaid: !!item.deposit_paid, date: item.deposit_paid_date ? new Date(item.deposit_paid_date) : null, paidDate: item.deposit_paid_date });
        items.push({ id: `${item.id}-bal`, supplierName, orderCode: item.order?.order_code, orderId: item.order?.id, type: "Saldo", amount: balanceAmt, isPaid: !!item.balance_paid, date: item.balance_expected_date ? new Date(item.balance_expected_date) : null, paidDate: item.balance_paid_date });
      } else if (totalCost > 0) {
        items.push({ id: item.id, supplierName, orderCode: item.order?.order_code, orderId: item.order?.id, type: "Pagamento", amount: totalCost, isPaid: !!item.is_paid, date: item.paid_date ? new Date(item.paid_date) : (item.balance_expected_date ? new Date(item.balance_expected_date) : null), paidDate: item.paid_date });
      }
    });
    const paid = items.filter(i => i.isPaid);
    const unpaid = items.filter(i => !i.isPaid);
    return { items, paid, unpaid, totalPaid: paid.reduce((s, i) => s + i.amount, 0), totalUnpaid: unpaid.reduce((s, i) => s + i.amount, 0) };
  }, [supplierPaymentItems]);

  // Supplier grouped data for progress bars
  const supplierGroupedData = useMemo(() => {
    const map = new Map<string, { paid: number; total: number }>();
    supplierPaymentsData.items.forEach(i => {
      const e = map.get(i.supplierName) || { paid: 0, total: 0 };
      e.total += i.amount;
      if (i.isPaid) e.paid += i.amount;
      map.set(i.supplierName, e);
    });
    return Array.from(map.entries());
  }, [supplierPaymentsData]);

  // Monthly distribution for mini-chart
  const monthlyDistribution = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 0; i < 6; i++) {
      const ms = startOfMonth(addMonths(now, i));
      const me = endOfMonth(addMonths(now, i));
      let fixed = 0, variable = 0;
      costs.forEach((c: any) => {
        if (c.is_paid) return;
        if (!c.due_date) return;
        const d = new Date(c.due_date);
        if (d >= ms && d <= me) {
          if (c.cost_type === "fixed") fixed += Number(c.amount);
          else variable += Number(c.amount);
        }
      });
      months.push({
        month: format(ms, "MMM yy", { locale: it }),
        Fissi: fixed,
        Variabili: variable,
      });
    }
    return months;
  }, [costs]);

  // Cost name counts for group delete
  const costNameCounts = useMemo(() => {
    const map = new Map<string, number>();
    costs.forEach((c: any) => map.set(c.name, (map.get(c.name) || 0) + 1));
    return map;
  }, [costs]);

  // Reset selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [periodFilter, statusFilter, searchQuery, supplierFilter, categoryFilter]);

  // Group delete mutation
  const deleteGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("company_costs")
        .delete()
        .eq("company_id", companyId!)
        .eq("name", name)
        .select("id");
      if (error) throw error;
      return { name, count: data?.length || 0 };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      setDeleteGroupName(null);
      toast({ title: `Eliminati ${result.count} costi "${result.name}"` });
    },
    onError: () => {
      toast({ title: "Errore nell'eliminazione", variant: "destructive" });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("company_costs")
        .delete()
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      toast({ title: `Eliminati ${count} costi` });
    },
    onError: () => {
      toast({ title: "Errore nell'eliminazione", variant: "destructive" });
    },
  });

  // Bulk mark paid mutation
  const bulkMarkPaidMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { error } = await supabase
        .from("company_costs")
        .update({ is_paid: true, paid_date: today })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      setSelectedIds(new Set());
      toast({ title: `${count} costi segnati come pagati` });
    },
    onError: () => {
      toast({ title: "Errore nell'aggiornamento", variant: "destructive" });
    },
  });

  // Bulk mark unpaid mutation
  const bulkMarkUnpaidMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("company_costs")
        .update({ is_paid: false, paid_date: null })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      setSelectedIds(new Set());
      toast({ title: `${count} costi riportati a non pagati` });
    },
    onError: () => {
      toast({ title: "Errore nell'aggiornamento", variant: "destructive" });
    },
  });

  const fixedCosts = filteredCosts.filter((c: any) => c.cost_type === "fixed");
  const manualVariableCosts = filteredCosts.filter((c: any) => c.cost_type === "variable");
  const variableCostsWithOrders = [...manualVariableCosts, ...filteredOrderItemCosts];
  const allCostsSorted = [...filteredCosts, ...filteredOrderItemCosts].sort((a: any, b: any) => {
    const dateA = a.due_date ? new Date(a.due_date).getTime() : 0;
    const dateB = b.due_date ? new Date(b.due_date).getTime() : 0;
    return dateA - dateB;
  });

  // VAT calculations for stats
  const vatStats = useMemo(() => {
    let vatDebit = 0;
    let supplierUnpaid = 0;
    costs.forEach((c: any) => {
      if (!c.is_paid) {
        const rate = Number(c.vat_rate) || 0;
        const vatAmount = Number(c.amount) * (rate / 100);
        vatDebit += vatAmount;
        if (c.supplier_id) {
          supplierUnpaid += Number(c.amount);
        }
      }
    });
    return { vatDebit, supplierUnpaid };
  }, [costs]);

  // Period preview for form
  const periodsPreview = useMemo(() => {
    if (formData.recurrence === "once" || !formData.due_date) return null;
    const periods = Math.max(1, Math.min(60, parseInt(formData.periods) || 1));
    if (periods <= 1) return null;
    const baseDate = new Date(formData.due_date);
    const lastDate = getNextDate(baseDate, formData.recurrence, periods - 1);
    return {
      count: periods,
      from: format(baseDate, "MMM yyyy", { locale: it }),
      to: format(lastDate, "MMM yyyy", { locale: it }),
    };
  }, [formData.recurrence, formData.due_date, formData.periods]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (data: CostFormData) => {
      const vatRate = parseFloat(data.vat_rate) || 0;
      let netAmount = parseFloat(data.amount) || 0;

      if (data.is_gross && vatRate > 0) {
        const { netAmount: net } = calculateNetFromGross(netAmount, vatRate);
        netAmount = net;
      }

      const basePayload = {
        company_id: companyId!,
        name: data.name,
        cost_type: data.cost_type,
        amount: netAmount,
        category: data.category || null,
        recurrence: data.recurrence,
        notes: data.notes || null,
        order_id: data.order_id && data.order_id !== "none" ? data.order_id : null,
        supplier_id: data.supplier_id && data.supplier_id !== "none" ? data.supplier_id : null,
        vat_rate: vatRate,
      };

      if (editingCost) {
        const { error } = await supabase.from("company_costs").update({ ...basePayload, due_date: data.due_date }).eq("id", editingCost.id);
        if (error) throw error;
        return { created: 1, isEdit: true };
      }

      // Auto-generate multiple periods for recurring costs
      const periods = data.recurrence !== "once" ? Math.max(1, Math.min(60, parseInt(data.periods) || 1)) : 1;
      const baseDate = new Date(data.due_date);
      let created = 0;

      for (let i = 0; i < periods; i++) {
        const date = getNextDate(baseDate, data.recurrence, i);
        const dateStr = format(date, "yyyy-MM-dd");

        // Check duplicates
        if (periods > 1) {
          const { data: existing } = await supabase
            .from("company_costs")
            .select("id")
            .eq("company_id", companyId!)
            .eq("name", data.name)
            .eq("due_date", dateStr)
            .limit(1);
          if (existing && existing.length > 0) continue;
        }

        const { error } = await supabase.from("company_costs").insert({
          ...basePayload,
          due_date: dateStr,
          is_paid: false,
        });
        if (error) throw error;
        created++;
      }

      return { created, isEdit: false, periods, baseDate };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      setDialogOpen(false);
      setEditingCost(null);
      setFormData(defaultFormData);

      if (result.isEdit) {
        toast({ title: "Costo aggiornato" });
      } else if (result.created > 1) {
        const baseDate = result.baseDate as Date;
        const lastDate = getNextDate(baseDate, formData.recurrence, result.created - 1);
        toast({
          title: `Creati ${result.created} costi`,
          description: `Da ${format(baseDate, "MMM yyyy", { locale: it })} a ${format(lastDate, "MMM yyyy", { locale: it })}`,
        });
      } else {
        toast({ title: result.created > 0 ? "Costo aggiunto" : "Costo già esistente (duplicato ignorato)" });
      }
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
      const { error } = await supabase.from("company_costs").update({ is_paid: true, paid_date: date }).eq("id", id);
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
      const { error } = await supabase.from("company_costs").update({ is_paid: false, paid_date: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      toast({ title: "Costo riportato a non pagato" });
    },
  });

  const markOrderItemPaidMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase.from("order_items").update({ is_paid: true, paid_date: date } as any).eq("id", id);
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
      const { error } = await supabase.from("order_items").update({ is_paid: false, paid_date: null } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-item-costs"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-company-costs"] });
      toast({ title: "Articolo riportato a non pagato" });
    },
  });

  const exportCostsCSV = () => {
    const allForExport = [...filteredCosts, ...filteredOrderItemCosts];
    const rows = [["Nome", "Tipo", "Categoria", "Imponibile", "IVA%", "Totale Lordo", "Fornitore", "Ricorrenza", "Scadenza", "Stato", "Origine"]];
    allForExport.forEach((c: any) => {
      const vatRate = Number(c.vat_rate) || 0;
      const gross = calculateGrossFromNet(Number(c.amount), vatRate);
      rows.push([
        c.name,
        c.cost_type === "fixed" ? "Fisso" : "Variabile",
        c.category || "",
        String(c.amount),
        String(vatRate),
        String(gross.grossAmount),
        c.supplier?.name || c.supplierName || "",
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
        let dueDate = row.due_date.trim();
        if (dueDate.includes("/")) {
          const parts = dueDate.split("/");
          if (parts.length === 3) dueDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
        const costType = typeMap[(row.cost_type || "").toLowerCase().trim()] || "fixed";
        const recurrence = recurrenceMap[(row.recurrence || "").toLowerCase().trim()] || "monthly";
        const { error } = await supabase.from("company_costs").insert({
          company_id: companyId, name: row.name.trim(), cost_type: costType, amount,
          category: row.category?.trim() || null, recurrence, due_date: dueDate,
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
      supplier_id: cost.supplier_id || "none",
      vat_rate: String(cost.vat_rate ?? 22),
      is_gross: false,
      periods: "1",
    });
    setDialogOpen(true);
  };

  const openCreate = (type: string) => {
    setEditingCost(null);
    setFormData({ ...defaultFormData, cost_type: type });
    setDialogOpen(true);
  };

  const handleSupplierChange = useCallback((supplierId: string) => {
    if (supplierId === "none") {
      setFormData(prev => ({ ...prev, supplier_id: "none" }));
      return;
    }
    const supplier = suppliers.find((s: any) => s.id === supplierId);
    if (supplier) {
      setFormData(prev => ({
        ...prev,
        supplier_id: supplierId,
        vat_rate: String(supplier.vat_rate ?? 22),
        category: supplier.product_category || prev.category,
      }));
    }
  }, [suppliers]);

  // VAT preview for form
  const formVatPreview = useMemo(() => {
    const inputAmount = parseFloat(formData.amount) || 0;
    const vatRate = parseFloat(formData.vat_rate) || 0;
    if (formData.is_gross) {
      const { netAmount, vatAmount } = calculateNetFromGross(inputAmount, vatRate);
      return { netAmount, vatAmount, grossAmount: inputAmount };
    } else {
      const { grossAmount, vatAmount } = calculateGrossFromNet(inputAmount, vatRate);
      return { netAmount: inputAmount, vatAmount, grossAmount };
    }
  }, [formData.amount, formData.vat_rate, formData.is_gross]);

  // Stats
  const now = new Date();
  const thisMonthInterval = { start: startOfMonth(now), end: endOfMonth(now) };
  const soon = addDays(now, 7);

  const thisMonthUnpaid = costs.filter((c: any) => !c.is_paid && c.due_date && isWithinInterval(new Date(c.due_date), thisMonthInterval));
  const thisMonthPaid = costs.filter((c: any) => c.is_paid && c.paid_date && isWithinInterval(new Date(c.paid_date), thisMonthInterval));
  const overdueCosts = costs.filter((c: any) => !c.is_paid && new Date(c.due_date) < now);

  const orderItemsTotalUnpaid = orderItemsAsVariableCosts.filter(c => !c.is_paid).reduce((s, c) => s + c.amount, 0);
  const totalUnpaidThisMonth = thisMonthUnpaid.reduce((s: number, c: any) => s + Number(c.amount), 0) + orderItemsTotalUnpaid;
  const totalPaidThisMonth = thisMonthPaid.reduce((s: number, c: any) => s + Number(c.amount), 0);
  const totalOverdue = overdueCosts.reduce((s: number, c: any) => s + Number(c.amount), 0);

  const getStatusBadge = (cost: UnifiedCost) => {
    if (cost.isFromOrder) {
      if (cost.is_paid) {
        const paidLabel = cost.paid_date ? `Pagato il ${format(new Date(cost.paid_date), "dd/MM/yyyy", { locale: it })}` : "Pagato";
        return <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400">{paidLabel}</Badge>;
      }
      if (cost.orderItemStatus === "ordinato") return <Badge className="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400">Ordinato</Badge>;
      return <Badge className="bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400">Da pagare</Badge>;
    }
    if (cost.is_paid) {
      const paidLabel = cost.paid_date ? `Pagato il ${format(new Date(cost.paid_date), "dd/MM/yyyy", { locale: it })}` : "Pagato";
      return <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400">{paidLabel}</Badge>;
    }
    const dueDate = new Date(cost.due_date);
    if (dueDate <= soon && dueDate >= now) return <Badge className="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400">In scadenza</Badge>;
    if (dueDate < now) return <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400">Scaduto</Badge>;
    return <Badge className="bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400">Da pagare</Badge>;
  };

  const renderCostsTable = (items: UnifiedCost[], type: string) => {
    const selectableItems = items.filter(c => !c.isFromOrder);
    const allSelectableIds = selectableItems.map(c => c.id);
    const allSelected = allSelectableIds.length > 0 && allSelectableIds.every(id => selectedIds.has(id));
    const someSelected = selectedIds.size > 0;

    const toggleSelectAll = () => {
      if (allSelected) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set(allSelectableIds));
      }
    };

    const toggleSelect = (id: string) => {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    return (
      <div className="space-y-4">
        {type !== "all" && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openCreate(type === "variable" ? "variable" : "fixed")} className="gap-1">
              <Plus className="h-4 w-4" />
              Aggiungi {type === "fixed" ? "Costo Fisso" : "Costo Variabile"}
            </Button>
          </div>
        )}

        {/* Bulk action bar */}
        {someSelected && (
          <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg bg-muted border">
            <span className="text-sm font-medium">{selectedIds.size} costi selezionati</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
                onClick={() => bulkMarkPaidMutation.mutate(Array.from(selectedIds))}
                disabled={bulkMarkPaidMutation.isPending}
              >
                <Check className="h-3.5 w-3.5" />
                Segna pagati
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
                onClick={() => bulkMarkUnpaidMutation.mutate(Array.from(selectedIds))}
                disabled={bulkMarkUnpaidMutation.isPending}
              >
                <Undo2 className="h-3.5 w-3.5" />
                Segna non pagati
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1"
                onClick={() => setBulkDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Elimina
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="h-3.5 w-3.5" />
                Deseleziona
              </Button>
            </div>
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Seleziona tutti"
                    />
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  {type === "all" && <TableHead>Tipo</TableHead>}
                  <TableHead>Fornitore</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Imponibile</TableHead>
                  <TableHead>IVA</TableHead>
                  <TableHead>Ricorrenza</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead>Stato</TableHead>
                  {(type === "variable" || type === "all") && <TableHead>Ordine</TableHead>}
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((cost) => {
                  const vatRate = Number((cost as any).vat_rate) || 0;
                  const vatAmount = cost.amount * (vatRate / 100);
                  const grossAmount = cost.amount + vatAmount;
                  const isSelected = selectedIds.has(cost.id);
                  return (
                    <TableRow key={cost.id} className={`${cost.isFromOrder ? "bg-orange-50/50 dark:bg-orange-900/5" : ""} ${isSelected ? "bg-muted/50" : ""}`}>
                      <TableCell>
                        {!cost.isFromOrder ? (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(cost.id)}
                            aria-label={`Seleziona ${cost.name}`}
                          />
                        ) : (
                          <span className="block w-4" />
                        )}
                      </TableCell>
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
                                  <p>Costo dagli articoli dell'ordine</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      {type === "all" && (
                        <TableCell>
                          <Badge variant="outline" className={cost.cost_type === "fixed" ? "border-red-400 text-red-600" : "border-amber-400 text-amber-600"}>
                            {cost.cost_type === "fixed" ? "Fisso" : "Variabile"}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        {(cost as any).supplier?.name || cost.supplierName || (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>{cost.category || "—"}</TableCell>
                      <TableCell className="text-right">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-medium cursor-help">{formatCurrency(cost.amount)}</span>
                            </TooltipTrigger>
                            {vatRate > 0 && (
                              <TooltipContent>
                                <div className="text-xs space-y-0.5">
                                  <p>Imponibile: {formatCurrency(cost.amount)}</p>
                                  <p>IVA ({vatRate}%): {formatCurrency(vatAmount)}</p>
                                  <Separator className="my-1" />
                                  <p className="font-semibold">Totale: {formatCurrency(grossAmount)}</p>
                                </div>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        {vatRate > 0 ? (
                          <Badge variant="outline" className="text-xs border-violet-300 text-violet-600 dark:text-violet-400">
                            {vatRate}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Esente</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          <Repeat className="h-3 w-3 mr-1" />
                          {RECURRENCE_LABELS[cost.recurrence] || cost.recurrence}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {cost.due_date ? format(new Date(cost.due_date), "dd/MM/yyyy", { locale: it }) : "—"}
                      </TableCell>
                      <TableCell>{getStatusBadge(cost)}</TableCell>
                      {(type === "variable" || type === "all") && (
                        <TableCell>
                          {cost.order ? (
                            <Link to={`/azienda/ordini/${cost.order.id}`} className="text-primary hover:underline text-sm flex items-center gap-1">
                              {cost.order.order_code || "Ordine"}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {!cost.isFromOrder && (
                            <>
                              {!cost.is_paid ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPayingCostId(cost.id); setPayDialogOpen(true); }}>
                                        <CheckSquare className="h-3.5 w-3.5 text-green-600" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Segna come pagato</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => markUnpaidMutation.mutate(cost.id)}>
                                        <Undo2 className="h-3.5 w-3.5 text-orange-600" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Riporta a non pagato</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTaskCostId(cost.id)}>
                                      <AlertCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Task collegate</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cost)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteConfirmId(cost.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Elimina
                                  </DropdownMenuItem>
                                  {(costNameCounts.get(cost.name) || 0) > 1 && (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setDeleteGroupName(cost.name)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Elimina tutti "{cost.name}" ({costNameCounts.get(cost.name)})
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          )}
                          {cost.isFromOrder && (
                            <>
                              {!cost.is_paid ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPayingCostId(cost.id); setPayDialogOpen(true); }}>
                                        <CheckSquare className="h-3.5 w-3.5 text-green-600" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Segna come pagato</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cost.realOrderItemId && markOrderItemUnpaidMutation.mutate(cost.realOrderItemId)}>
                                        <Undo2 className="h-3.5 w-3.5 text-orange-600" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Riporta a non pagato</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {cost.order && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                        <Link to={`/azienda/ordini/${cost.order.id}`}>
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </Link>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Vai all'ordine</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-8 w-48" /></CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
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
                Controllo Costi Aziendali
              </CardTitle>
              <CardDescription>
                Gestione costi con IVA, fornitori e analisi fiscale
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1">
                <Upload className="h-4 w-4" /> Importa
              </Button>
              <Button variant="outline" size="sm" onClick={exportCostsCSV} className="gap-1">
                <Download className="h-4 w-4" /> Esporta
              </Button>
              <Button size="sm" onClick={() => openCreate("fixed")} className="gap-1">
                <Plus className="h-4 w-4" /> Nuovo Costo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary Cards - 5 cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-xs font-medium">Da pagare (mese)</span>
              </div>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totalUnpaidThisMonth)}</p>
              <p className="text-[10px] text-muted-foreground">{thisMonthUnpaid.length} costi + {filteredOrderItemCosts.filter(c => !c.is_paid).length} da ordini</p>
            </div>
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-1">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-xs font-medium">Pagato (mese)</span>
              </div>
              <p className="text-xl font-bold text-green-600">{formatCurrency(totalPaidThisMonth)}</p>
              <p className="text-[10px] text-muted-foreground">{thisMonthPaid.length} pagati</p>
            </div>
            <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-orange-600" />
                <span className="text-xs font-medium">Scaduti</span>
              </div>
              <p className="text-xl font-bold text-orange-600">{formatCurrency(totalOverdue)}</p>
              <p className="text-[10px] text-muted-foreground">{overdueCosts.length} scaduti</p>
            </div>
            <div className="p-4 rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800">
              <div className="flex items-center gap-2 mb-1">
                <Calculator className="h-4 w-4 text-violet-600" />
                <span className="text-xs font-medium">IVA a debito</span>
              </div>
              <p className="text-xl font-bold text-violet-600">{formatCurrency(vatStats.vatDebit)}</p>
              <p className="text-[10px] text-muted-foreground">Su costi non pagati</p>
            </div>
            <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800">
              <div className="flex items-center gap-2 mb-1">
                <Truck className="h-4 w-4 text-indigo-600" />
                <span className="text-xs font-medium">Fornitori da pagare</span>
              </div>
              <p className="text-xl font-bold text-indigo-600">{formatCurrency(vatStats.supplierUnpaid)}</p>
              <p className="text-[10px] text-muted-foreground">Costi con fornitore</p>
            </div>
          </div>

          {/* Monthly Distribution Mini-Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Distribuzione Mensile Costi Futuri</CardTitle>
              <CardDescription>Costi non pagati per i prossimi 6 mesi</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyDistribution}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                    <RechartsTooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Legend />
                    <Bar dataKey="Fissi" stackId="costs" fill="hsl(0 84.2% 60.2%)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Variabili" stackId="costs" fill="hsl(45 93% 47%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cerca costo o fornitore..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Periodo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i periodi</SelectItem>
                <SelectItem value="this_month">Questo mese</SelectItem>
                <SelectItem value="next_month">Prossimo mese</SelectItem>
                <SelectItem value="last_3_months">Ultimi 3 mesi</SelectItem>
                <SelectItem value="this_year">Quest'anno</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Stato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="unpaid">Da pagare</SelectItem>
                <SelectItem value="paid">Pagati</SelectItem>
                <SelectItem value="overdue">Scaduti</SelectItem>
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Fornitore" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i fornitori</SelectItem>
                <SelectItem value="none">Senza fornitore</SelectItem>
                {suppliers.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                {dynamicCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">Tutti ({allCostsSorted.length})</TabsTrigger>
              <TabsTrigger value="fixed">Fissi ({fixedCosts.length})</TabsTrigger>
              <TabsTrigger value="variable">Variabili ({variableCostsWithOrders.length})</TabsTrigger>
              <TabsTrigger value="suppliers" className="gap-1">
                <Truck className="h-3.5 w-3.5" />
                Fornitori ({supplierPaymentsData.items.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="all">{renderCostsTable(allCostsSorted, "all")}</TabsContent>
            <TabsContent value="fixed">{renderCostsTable(fixedCosts, "fixed")}</TabsContent>
            <TabsContent value="variable">{renderCostsTable(variableCostsWithOrders, "variable")}</TabsContent>
            <TabsContent value="suppliers">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm font-medium">Da pagare ai fornitori</span>
                    </div>
                    <p className="text-2xl font-bold text-indigo-600">{formatCurrency(supplierPaymentsData.totalUnpaid)}</p>
                    <p className="text-xs text-muted-foreground">{supplierPaymentsData.unpaid.length} rate in sospeso</p>
                  </div>
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2 mb-1">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">Già pagato</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(supplierPaymentsData.totalPaid)}</p>
                    <p className="text-xs text-muted-foreground">{supplierPaymentsData.paid.length} pagamenti effettuati</p>
                  </div>
                </div>
                {supplierPaymentsData.items.length > 0 && (
                  <div className="space-y-3">
                    {supplierGroupedData.map(([name, d]) => (
                      <div key={name} className="p-3 rounded-lg border bg-background">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{name}</span>
                          <span className="text-xs text-muted-foreground">{formatCurrency(d.paid)} / {formatCurrency(d.total)}</span>
                        </div>
                        <Progress value={d.total > 0 ? (d.paid / d.total) * 100 : 0} className="h-2 [&>div]:bg-indigo-500" />
                      </div>
                    ))}
                  </div>
                )}
                {supplierPaymentsData.items.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fornitore</TableHead>
                          <TableHead>Ordine</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Importo</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Stato</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierPaymentsData.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.supplierName}</TableCell>
                            <TableCell>
                              {item.orderCode ? (
                                <Link to={`/azienda/ordini/${item.orderId}`} className="text-primary hover:underline text-sm">{item.orderCode}</Link>
                              ) : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="border-indigo-400 text-indigo-600 gap-1">
                                <Truck className="h-3 w-3" />{item.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(item.amount)}</TableCell>
                            <TableCell>{item.date ? format(item.date, "dd/MM/yyyy", { locale: it }) : "—"}</TableCell>
                            <TableCell>
                              {item.isPaid ? (
                                <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400">
                                  Pagato{item.paidDate ? ` il ${format(new Date(item.paidDate), "dd/MM/yyyy", { locale: it })}` : ""}
                                </Badge>
                              ) : (
                                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400">Da pagare</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p>Nessun pagamento fornitore trovato</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setEditingCost(null); setFormData(defaultFormData); } setDialogOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCost ? "Modifica Costo" : "Nuovo Costo"}</DialogTitle>
            <DialogDescription>
              {editingCost ? "Aggiorna i dettagli del costo" : "Inserisci i dettagli del nuovo costo aziendale"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {/* Basic Info */}
            <div className="space-y-3">
              <div>
                <Label>Nome *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="es. Affitto ufficio" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={formData.cost_type} onValueChange={(v) => setFormData({ ...formData, cost_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Costo Fisso</SelectItem>
                      <SelectItem value="variable">Costo Variabile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {formData.category || "Seleziona..."}
                        <Filter className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[250px] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Cerca o crea categoria..."
                          value={categorySearch}
                          onValueChange={setCategorySearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {categorySearch.trim() ? (
                              <button
                                className="w-full text-left px-4 py-2 text-sm hover:bg-accent cursor-pointer"
                                onClick={() => {
                                  setFormData({ ...formData, category: categorySearch.trim() });
                                  setCategorySearch("");
                                  setCategoryPopoverOpen(false);
                                }}
                              >
                                <Plus className="h-3 w-3 inline mr-1" />
                                Crea "{categorySearch.trim()}"
                              </button>
                            ) : (
                              <span className="text-muted-foreground text-xs">Nessuna categoria</span>
                            )}
                          </CommandEmpty>
                          <CommandGroup>
                            {dynamicCategories.map((cat) => (
                              <CommandItem
                                key={cat}
                                value={cat}
                                onSelect={() => {
                                  setFormData({ ...formData, category: cat });
                                  setCategorySearch("");
                                  setCategoryPopoverOpen(false);
                                }}
                              >
                                {cat}
                                {formData.category === cat && <Check className="ml-auto h-4 w-4" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <Separator />

            {/* Fiscal Section */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Calculator className="h-4 w-4" />
                Dati Fiscali
              </h4>
              <div>
                <Label>Fornitore (opzionale)</Label>
                <Select value={formData.supplier_id || "none"} onValueChange={handleSupplierChange}>
                  <SelectTrigger><SelectValue placeholder="Nessun fornitore" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessun fornitore</SelectItem>
                    {suppliers.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} {s.product_category ? `(${s.product_category})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Aliquota IVA</Label>
                  <Select value={formData.vat_rate} onValueChange={(v) => setFormData({ ...formData, vat_rate: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VAT_RATES.map((rate) => (
                        <SelectItem key={rate.value} value={String(rate.value)}>{rate.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Importo (€) *</Label>
                  <Input
                    type="number" step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={formData.is_gross}
                  onCheckedChange={(v) => setFormData({ ...formData, is_gross: v })}
                />
                <Label className="text-sm cursor-pointer" onClick={() => setFormData({ ...formData, is_gross: !formData.is_gross })}>
                  {formData.is_gross ? "Importo Ivato (lordo)" : "Importo Imponibile (netto)"}
                </Label>
              </div>
              {/* VAT Preview */}
              {formData.amount && parseFloat(formData.vat_rate) > 0 && (
                <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Imponibile</span>
                    <span className="font-medium">{formatCurrency(formVatPreview.netAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IVA ({formData.vat_rate}%)</span>
                    <span className="font-medium text-violet-600">{formatCurrency(formVatPreview.vatAmount)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Totale</span>
                    <span>{formatCurrency(formVatPreview.grossAmount)}</span>
                  </div>
                  {formData.is_gross && (
                     <TooltipProvider>
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1 cursor-help">
                             <Info className="h-3 w-3" />
                             Verrà salvato l'imponibile di {formatCurrency(formVatPreview.netAmount)}
                           </p>
                         </TooltipTrigger>
                         <TooltipContent>
                           L'importo lordo viene scorporato e salvato come imponibile netto
                         </TooltipContent>
                       </Tooltip>
                     </TooltipProvider>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Planning Section */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                Pianificazione
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ricorrenza</Label>
                  <Select
                    value={formData.recurrence}
                    onValueChange={(v) => {
                      const newPeriods = v === "once" ? "1" : String(DEFAULT_PERIODS[v] || 1);
                      setFormData({ ...formData, recurrence: v, periods: newPeriods });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">Una tantum</SelectItem>
                      <SelectItem value="monthly">Mensile</SelectItem>
                      <SelectItem value="quarterly">Trimestrale</SelectItem>
                      <SelectItem value="yearly">Annuale</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data scadenza *</Label>
                  <Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
                </div>
              </div>

              {/* Periods field - only for recurring, only in creation mode */}
              {formData.recurrence !== "once" && !editingCost && (
                <div className="space-y-2">
                  <Label>Periodi da generare</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={formData.periods}
                    onChange={(e) => setFormData({ ...formData, periods: e.target.value })}
                    className="w-32"
                  />
                  {periodsPreview && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Repeat className="h-3 w-3" />
                      Verranno creati {periodsPreview.count} costi da {periodsPreview.from} a {periodsPreview.to}
                    </p>
                  )}
                </div>
              )}

              {formData.cost_type === "variable" && (
                <div>
                  <Label>Collega a ordine (opzionale)</Label>
                  <Select value={formData.order_id || "none"} onValueChange={(v) => setFormData({ ...formData, order_id: v === "none" ? "" : v })}>
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
            </div>

            <div>
              <Label>Note</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Note aggiuntive..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => {
                const amt = parseFloat(formData.amount);
                if (isNaN(amt) || amt <= 0) {
                  toast({ title: "L'importo deve essere maggiore di zero", variant: "destructive" });
                  return;
                }
                saveMutation.mutate(formData);
              }}
              disabled={!formData.name || !formData.amount || !formData.due_date || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Salvataggio..." : editingCost ? "Aggiorna" : periodsPreview ? `Crea ${periodsPreview.count} costi` : "Aggiungi"}
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
            <AlertDialogAction onClick={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); setDeleteConfirmId(null); }}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Group Confirm */}
      <AlertDialog open={!!deleteGroupName} onOpenChange={() => setDeleteGroupName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare tutti i costi "{deleteGroupName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare {costNameCounts.get(deleteGroupName || "") || 0} costi con il nome "{deleteGroupName}". Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteGroupName) deleteGroupMutation.mutate(deleteGroupName); }}>
              Elimina tutti
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirm */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {selectedIds.size} costi selezionati?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}>
              Elimina selezionati
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <Dialog open={payDialogOpen} onOpenChange={(open) => { if (!open) { setPayDialogOpen(false); setPayingCostId(null); setPaymentDate(format(new Date(), "yyyy-MM-dd")); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registra Pagamento</DialogTitle>
            <DialogDescription>Seleziona la data del pagamento.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Data pagamento</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-2" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayDialogOpen(false); setPayingCostId(null); }}>Annulla</Button>
            <Button
              onClick={() => {
                if (payingCostId && paymentDate) {
                  if (payingCostId.startsWith("order-item-")) {
                    markOrderItemPaidMutation.mutate({ id: payingCostId.replace("order-item-", ""), date: paymentDate });
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

      <CSVImportDialog open={importOpen} onOpenChange={setImportOpen} title="Importa Costi" fields={COST_IMPORT_FIELDS} onImport={handleCostsImport} />

      {/* Task dialog for cost */}
      <Dialog open={!!taskCostId} onOpenChange={(v) => { if (!v) setTaskCostId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Task collegate</DialogTitle>
            <DialogDescription>Attività collegate a questo costo</DialogDescription>
          </DialogHeader>
          {taskCostId && <LinkedTasks costId={taskCostId} category="costi" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
