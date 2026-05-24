import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { format, addMonths } from "date-fns";
import { it } from "date-fns/locale";
import {
  AlertTriangle, ArrowRight, Building2, CalendarIcon, ClipboardList, Download,
  FilterX, Landmark, Link2, ListChecks, Plus, ReceiptText, Repeat, Search,
  Settings2, Tags, Upload, Users, WalletCards,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { resolveCostOrigin } from "@/lib/forecastTypes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Tooltip as UITooltip, TooltipContent as UITooltipContent,
  TooltipProvider as UITooltipProvider, TooltipTrigger as UITooltipTrigger,
} from "@/components/ui/tooltip";
import { CSVImportDialog, type ImportField } from "@/components/shared/CSVImportDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";

import { useCompanyCostsData, type PeriodFilter, type StatusFilter, type StatusTabFilter, type UnifiedCost } from "@/hooks/useCompanyCostsData";
import { useCompanyCostsMutations, type CostFormData, defaultFormData } from "@/hooks/useCompanyCostsMutations";
import { CostsStatsCards } from "./CostsStatsCards";
import { CostsTable } from "./CostsTable";
import { CostFormDialog } from "./CostFormDialog";
import { CostsDialogs } from "./CostsDialogs";
import { CostBudgetManager } from "./CostBudgetManager";
import { CashFlowAlert } from "./CashFlowAlert";

const COST_IMPORT_FIELDS: ImportField[] = [
  { key: "name", label: "Nome", required: true },
  { key: "cost_type", label: "Tipo", required: false },
  { key: "amount", label: "Importo", required: true, type: "number" },
  { key: "category", label: "Categoria", required: false },
  { key: "recurrence", label: "Ricorrenza", required: false },
  { key: "due_date", label: "Data Scadenza", required: true, type: "date" },
  { key: "notes", label: "Note", required: false },
];

type CostIntegrationSummary = {
  total: number;
  manual: number;
  linked: number;
  scheduled: number;
  paid: number;
  totalAmount: number;
  manualAmount: number;
  linkedAmount: number;
};

type CostWithRelations = UnifiedCost & {
  supplier?: { name?: string | null } | null;
  recurrence_end_date?: string | null;
  recurrence_auto?: boolean | null;
};

function getDuplicatedDueDate(dueDate?: string | null) {
  if (!dueDate || dueDate === "9999-12-31") return format(new Date(), "yyyy-MM-dd");
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return format(new Date(), "yyyy-MM-dd");
  return format(addMonths(parsed, 1), "yyyy-MM-dd");
}

function CostIntegrationPanel({
  summary,
  missingCategory,
  missingSupplier,
  unscheduled,
  onShowOrderCosts,
  onShowUnscheduled,
  onShowMissingCategories,
  onShowMissingSuppliers,
}: {
  summary: CostIntegrationSummary;
  missingCategory: number;
  missingSupplier: number;
  unscheduled: number;
  onShowOrderCosts: () => void;
  onShowUnscheduled: () => void;
  onShowMissingCategories: () => void;
  onShowMissingSuppliers: () => void;
}) {
  const qualityIssues = missingCategory + missingSupplier + unscheduled;
  const scheduledPct = summary.total > 0 ? Math.round((summary.scheduled / summary.total) * 100) : 100;
  const paidPct = summary.total > 0 ? Math.round((summary.paid / summary.total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-950">Regia integrazioni costi</h3>
            <Badge variant={qualityIssues > 0 ? "outline" : "secondary"} className={qualityIssues > 0 ? "border-orange-300 text-orange-700" : ""}>
              {qualityIssues > 0 ? `${qualityIssues} controlli aperti` : "Dati allineati"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Origine, qualità dati e impatto cassa in un unico punto operativo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link to="/azienda/ordini">
              <ClipboardList className="h-4 w-4" /> Ordini
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link to="/azienda/previsionale">
              <WalletCards className="h-4 w-4" /> Previsionale
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link to="/azienda/prima-nota">
              <ReceiptText className="h-4 w-4" /> Prima nota
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Origine costi</span>
            <Landmark className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-lg font-semibold">{formatCurrency(summary.totalAmount)}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.manual} manuali ({formatCurrency(summary.manualAmount)}) · {summary.linked} da moduli ({formatCurrency(summary.linkedAmount)})
          </p>
          <Button variant="link" size="sm" className="mt-1 h-auto px-0 text-xs" onClick={onShowOrderCosts}>
            Vedi costi collegati <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Qualità dati</span>
            <ListChecks className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-lg font-semibold">{scheduledPct}% pianificati</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {missingCategory} senza categoria · {missingSupplier} senza fornitore · {unscheduled} senza scadenza
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missingCategory > 0 && <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onShowMissingCategories}>Categorie</Button>}
            {missingSupplier > 0 && <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onShowMissingSuppliers}>Fornitori</Button>}
            {unscheduled > 0 && <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onShowUnscheduled}>Scadenze</Button>}
            {qualityIssues === 0 && <span className="text-xs text-emerald-700">Nessuna anomalia operativa.</span>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Impatto cassa</span>
            <WalletCards className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-lg font-semibold">{paidPct}% sostenuti</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Allineato a previsionale e prima nota tramite pagamenti registrati.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
              <Link to="/azienda/impostazioni/categorie-costi">
                <Settings2 className="h-3.5 w-3.5" /> Categorie
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
              <Link to="/azienda/impostazioni/fornitori">
                <Users className="h-3.5 w-3.5" /> Fornitori
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CompanyCostsManager() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<UnifiedCost | null>(null);
  const [formData, setFormData] = useState<CostFormData>(defaultFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payingCostId, setPayingCostId] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState<string>("bonifico");
  const [importOpen, setImportOpen] = useState(false);
  const [taskCostId, setTaskCostId] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteGroupName, setDeleteGroupName] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  // 🛠️ 2026-05-10: previene double-submit del bottone "Genera ora" (#7 audit fix).
  const [generatingRecurring, setGeneratingRecurring] = useState(false);

  // Filters
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<"all" | "manual" | "order">("all");
  const [customDateRange, setCustomDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [statusTabFilter, setStatusTabFilter] = useState<StatusTabFilter>("all");

  // Data hook
  const data = useCompanyCostsData(companyId, {
    periodFilter, statusFilter, searchQuery, supplierFilter, categoryFilter, originFilter, customDateRange, statusTabFilter,
  }, selectedYear);

  // Period label for stats
  const periodLabel = periodFilter === "this_month" ? "Questo mese"
    : periodFilter === "next_month" ? "Prossimo mese"
    : periodFilter === "last_3_months" ? "Ultimi 3 mesi"
    : periodFilter === "this_year" ? "Quest'anno"
    : periodFilter === "custom" && customDateRange
      ? `${format(customDateRange.start, "dd/MM/yy", { locale: it })} – ${format(customDateRange.end, "dd/MM/yy", { locale: it })}`
    : "Tutti i periodi";

  const hasActiveFilters = periodFilter !== "all" ||
    statusFilter !== "all" ||
    searchQuery.trim().length > 0 ||
    supplierFilter !== "all" ||
    categoryFilter !== "all" ||
    originFilter !== "all" ||
    statusTabFilter !== "all" ||
    !!customDateRange;

  const resetFilters = () => {
    setPeriodFilter("all");
    setStatusFilter("all");
    setSearchQuery("");
    setSupplierFilter("all");
    setCategoryFilter("all");
    setOriginFilter("all");
    setCustomDateRange(null);
    setStatusTabFilter("all");
  };

  const operationalControl = useMemo(() => {
    const allCosts = (data.allCostsUnfiltered || []) as CostWithRelations[];
    const manualCosts = allCosts.filter((cost) => !cost.isFromOrder);
    const missingCategory = manualCosts.filter((cost) => !cost.category).length;
    const missingSupplier = manualCosts.filter((cost) => cost.cost_type === "variable" && !cost.supplier_id && !cost.supplierName).length;
    const linkedToOrders = allCosts.filter((cost) => cost.order_id || cost.order).length;
    const unscheduled = allCosts.filter((cost) => !cost.is_paid && (!cost.due_date || cost.due_date === "9999-12-31")).length;

    return {
      missingCategory,
      missingSupplier,
      linkedToOrders,
      unscheduled,
      overdueCount: data.stats.overdueCount,
      overdueAmount: data.stats.totalOverdue,
    };
  }, [data.allCostsUnfiltered, data.stats.overdueCount, data.stats.totalOverdue]);

  const integrationSummary = useMemo<CostIntegrationSummary>(() => {
    const allCosts = data.allCostsUnfiltered || [];
    const manualCosts = allCosts.filter((cost: UnifiedCost) => !cost.isFromOrder);
    const orderCosts = allCosts.filter((cost: UnifiedCost) => cost.isFromOrder);
    const sum = (items: UnifiedCost[]) => items.reduce((total, cost) => total + Number(cost.amount || 0), 0);

    return {
      total: allCosts.length,
      manual: manualCosts.length,
      linked: orderCosts.length,
      scheduled: allCosts.filter((cost: UnifiedCost) => cost.due_date && cost.due_date !== "9999-12-31").length,
      paid: allCosts.filter((cost: UnifiedCost) => cost.is_paid).length,
      totalAmount: sum(allCosts),
      manualAmount: sum(manualCosts),
      linkedAmount: sum(orderCosts),
    };
  }, [data.allCostsUnfiltered]);

  const showOverdueCosts = () => {
    setPeriodFilter("all");
    setSearchQuery("");
    setCustomDateRange(null);
    setOriginFilter("all");
    setStatusFilter("all");
    setSupplierFilter("all");
    setCategoryFilter("all");
    setStatusTabFilter("in_ritardo");
  };

  const showMissingCategories = () => {
    setPeriodFilter("all");
    setSearchQuery("");
    setCustomDateRange(null);
    setOriginFilter("manual");
    setStatusFilter("all");
    setSupplierFilter("all");
    setStatusTabFilter("all");
    setCategoryFilter("none");
  };

  const showMissingSuppliers = () => {
    setPeriodFilter("all");
    setSearchQuery("");
    setCustomDateRange(null);
    setOriginFilter("manual");
    setStatusFilter("all");
    setCategoryFilter("all");
    setStatusTabFilter("all");
    setSupplierFilter("none");
  };

  const showOrderCosts = () => {
    setPeriodFilter("all");
    setSearchQuery("");
    setCustomDateRange(null);
    setOriginFilter("order");
    setStatusFilter("all");
    setSupplierFilter("all");
    setCategoryFilter("all");
    setStatusTabFilter("all");
  };

  const showUnscheduledCosts = () => {
    setPeriodFilter("all");
    setSearchQuery("");
    setCustomDateRange(null);
    setOriginFilter("all");
    setStatusFilter("all");
    setSupplierFilter("all");
    setCategoryFilter("all");
    setStatusTabFilter("senza_scadenza");
  };

  // Mutations hook
  const mutations = useCompanyCostsMutations({
    companyId,
    editingCostId: editingCost?.id || null,
    formRecurrence: formData.recurrence,
    onSaveSuccess: () => {
      setDialogOpen(false);
      setEditingCost(null);
      setFormData(defaultFormData);
    },
    onPaySuccess: () => {
      setPayDialogOpen(false);
      setPayingCostId(null);
      setPaymentDate(format(new Date(), "yyyy-MM-dd"));
      setPaymentMethod("bonifico");
    },
  });

  // Reset selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [periodFilter, statusFilter, searchQuery, supplierFilter, categoryFilter, originFilter, statusTabFilter]);

  // Handlers
  const openCreate = (type: string) => {
    setEditingCost(null);
    setFormData({ ...defaultFormData, cost_type: type });
    setDialogOpen(true);
  };

  const openEdit = (cost: UnifiedCost) => {
    const editableCost = cost as CostWithRelations;
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
      end_date: editableCost.recurrence_end_date || "",
      recurrence_auto: Boolean(editableCost.recurrence_auto),
    });
    setDialogOpen(true);
  };

  const openDuplicate = (cost: UnifiedCost) => {
    const duplicableCost = cost as CostWithRelations;
    setEditingCost(null);
    setFormData({
      name: cost.name,
      cost_type: cost.cost_type,
      amount: String(cost.amount),
      category: cost.category || "",
      recurrence: cost.recurrence,
      due_date: getDuplicatedDueDate(cost.due_date),
      notes: cost.notes || "",
      order_id: cost.order_id || "none",
      supplier_id: cost.supplier_id || "none",
      vat_rate: String(cost.vat_rate ?? 22),
      is_gross: false,
      end_date: duplicableCost.recurrence_end_date || "",
      recurrence_auto: Boolean(duplicableCost.recurrence_auto),
    });
    setDialogOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (selectableIds: string[]) => {
    const allSelected = selectableIds.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  };

  const handleMarkPaid = (id: string) => {
    setPayingCostId(id);
    setPayDialogOpen(true);
  };

  const handlePaymentConfirm = () => {
    if (!payingCostId || !paymentDate) return;
    const derivedCost = data.allOrderDerivedCosts.find(c => c.id === payingCostId);
    const origin = resolveCostOrigin(payingCostId, derivedCost?.realOrderItemId);

    switch (origin.type) {
      case "order-item":
        mutations.markOrderItemPaidMutation.mutate({ id: origin.realId, date: paymentDate, paymentType: origin.paymentType! });
        break;
      case "ext-team":
        mutations.markExtTeamPaidMutation.mutate({ id: origin.realId, date: paymentDate });
        break;
      case "commission":
        mutations.markCommissionPaidMutation.mutate({ id: origin.realId, date: paymentDate });
        break;
      default:
        mutations.markPaidMutation.mutate({ id: payingCostId, date: paymentDate, paymentMethod });
    }
  };

  const handleMarkOrderItemUnpaid = (cost: UnifiedCost) => {
    const origin = resolveCostOrigin(cost.id, cost.realOrderItemId);

    switch (origin.type) {
      case "order-item":
        mutations.markOrderItemUnpaidMutation.mutate({ id: origin.realId, paymentType: origin.paymentType! });
        break;
      case "ext-team":
        mutations.markExtTeamUnpaidMutation.mutate(origin.realId);
        break;
      case "commission":
        mutations.markCommissionUnpaidMutation.mutate(origin.realId);
        break;
    }
  };

  // Get items for current tab considering status tab filter
  const getItemsForTab = (tab: string) => {
    if (statusTabFilter !== "all") {
      // When a status tab is active, show filtered items split by cost type
      const items = data.statusTabFilteredCosts;
      if (tab === "fixed") return items.filter(c => c.cost_type === "fixed");
      if (tab === "variable") return items.filter(c => c.cost_type === "variable");
      return items;
    }
    if (tab === "fixed") return data.fixedCosts;
    if (tab === "variable") return data.variableCostsWithOrders;
    return data.allCostsSorted;
  };

  if (data.isLoading) {
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
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-gradient-to-br from-white to-orange-50/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" /> Controllo Costi Aziendali
              </CardTitle>
              <CardDescription>Gestione costi con IVA, fornitori e analisi fiscale</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <UITooltipProvider>
                <UITooltip>
                  <UITooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={generatingRecurring}
                      onClick={async () => {
                        if (generatingRecurring) return;
                        setGeneratingRecurring(true);
                        try {
                          const { data: result, error } = await supabase.functions.invoke("generate-recurring-costs", {
                            body: { company_id: companyId },
                          });
                          if (error) throw error;
                          data.refetchAll();
                          toast({ title: `Generati ${result?.created || 0} costi ricorrenti` });
                        } catch (err) {
                          toast({
                            title: "Errore nella generazione",
                            description: err instanceof Error ? err.message : "Riprova tra qualche istante.",
                            variant: "destructive",
                          });
                        } finally {
                          setGeneratingRecurring(false);
                        }
                      }}
                      className="gap-1"
                    >
                      <Repeat className="h-4 w-4" />
                      {generatingRecurring ? "Generazione..." : "Genera ora (auto: 1° del mese)"}
                    </Button>
                  </UITooltipTrigger>
                  <UITooltipContent side="bottom" className="max-w-[240px] text-xs">
                    I costi ricorrenti vengono generati automaticamente il 1° del mese. Clicca solo se hai bisogno di generarli manualmente ora.
                  </UITooltipContent>
                </UITooltip>
              </UITooltipProvider>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1">
                <Upload className="h-4 w-4" /> Importa
              </Button>
              <Button variant="outline" size="sm" onClick={() => { data.exportCostsCSV(); toast({ title: "CSV esportato" }); }} className="gap-1">
                <Download className="h-4 w-4" /> Esporta
              </Button>
              <Button size="sm" onClick={() => openCreate("fixed")} className="gap-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600">
                <Plus className="h-4 w-4" /> Nuovo Costo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {data.isError && (
            <Alert className="border-red-200 bg-red-50 text-red-900">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Alcuni dati dei costi non sono stati caricati: {data.errorMessage}
                </span>
                <Button variant="outline" size="sm" onClick={data.refetchAll}>
                  Riprova
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Alert Banner — Overdue payments */}
          {data.stats.overdueCount > 0 && (
            <Alert className="border-orange-300 bg-orange-50 dark:bg-orange-900/10 dark:border-orange-700">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-orange-800 dark:text-orange-300">
                  Hai <strong>{data.stats.overdueCount}</strong> pagament{data.stats.overdueCount === 1 ? "o scaduto" : "i scaduti"} per un totale di <strong>{formatCurrency(data.stats.totalOverdue)}</strong>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-orange-400 text-orange-700 hover:bg-orange-100 dark:border-orange-600 dark:text-orange-400 dark:hover:bg-orange-900/20"
                  onClick={showOverdueCosts}
                >
                  Visualizza
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 md:grid-cols-4">
            <button
              type="button"
              onClick={showOverdueCosts}
              className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-orange-500" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scaduti</span>
                <AlertTriangle className="h-4 w-4 text-orange-600" />
              </div>
              <div className="mt-2 text-xl font-semibold">{operationalControl.overdueCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(operationalControl.overdueAmount)} da gestire</p>
            </button>
            <button
              type="button"
              onClick={showMissingCategories}
              className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-blue-500" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Senza categoria</span>
                <Tags className="h-4 w-4 text-blue-600" />
              </div>
              <div className="mt-2 text-xl font-semibold">{operationalControl.missingCategory}</div>
              <p className="mt-1 text-xs text-muted-foreground">da classificare per report</p>
            </button>
            <button
              type="button"
              onClick={showMissingSuppliers}
              className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Senza fornitore</span>
                <Users className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-xl font-semibold">{operationalControl.missingSupplier}</div>
              <p className="mt-1 text-xs text-muted-foreground">costi variabili manuali</p>
            </button>
            <button
              type="button"
              onClick={showOrderCosts}
              className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-orange-500" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Da moduli collegati</span>
                <Link2 className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xl font-semibold">{operationalControl.linkedToOrders}</span>
                {operationalControl.unscheduled > 0 && <Badge variant="outline">{operationalControl.unscheduled} senza scadenza</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">ordini, team, personale e provvigioni</p>
            </button>
          </div>

          <CostIntegrationPanel
            summary={integrationSummary}
            missingCategory={operationalControl.missingCategory}
            missingSupplier={operationalControl.missingSupplier}
            unscheduled={operationalControl.unscheduled}
            onShowOrderCosts={showOrderCosts}
            onShowUnscheduled={showUnscheduledCosts}
            onShowMissingCategories={showMissingCategories}
            onShowMissingSuppliers={showMissingSuppliers}
          />

          <CostsStatsCards
            stats={data.stats}
            vatStats={data.vatStats}
            monthlyDistribution={data.monthlyDistribution}
            periodLabel={periodLabel}
            yearlyStats={data.yearlyStats}
            selectedYear={selectedYear}
            onYearChange={setSelectedYear}
            activeStatusTab={statusTabFilter}
            onStatusTabChange={setStatusTabFilter}
            categoryDistribution={data.categoryDistribution}
            availableYears={data.availableYears}
            fixedCostsTrend={data.fixedCostsTrend}
            breakEvenData={data.breakEvenData}
          />

          {/* Filters */}
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:flex-row flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cerca costo, fornitore, categoria, ordine o note..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <Select value={periodFilter} onValueChange={(v) => {
              setPeriodFilter(v as PeriodFilter);
              if (v !== "custom") setCustomDateRange(null);
            }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Periodo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i periodi</SelectItem>
                <SelectItem value="this_month">Questo mese</SelectItem>
                <SelectItem value="next_month">Prossimo mese</SelectItem>
                <SelectItem value="last_3_months">Ultimi 3 mesi</SelectItem>
                <SelectItem value="this_year">Quest'anno</SelectItem>
                <SelectItem value="custom">Personalizzato</SelectItem>
              </SelectContent>
            </Select>
            {periodFilter === "custom" && (
              <div className="flex items-center gap-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("gap-1 text-xs", !customDateRange?.start && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {customDateRange?.start ? format(customDateRange.start, "dd/MM/yy") : "Da"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customDateRange?.start}
                      onSelect={(d) => d && setCustomDateRange(prev => ({ start: d, end: prev?.end || d }))}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-xs text-muted-foreground">–</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("gap-1 text-xs", !customDateRange?.end && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {customDateRange?.end ? format(customDateRange.end, "dd/MM/yy") : "A"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customDateRange?.end}
                      onSelect={(d) => d && setCustomDateRange(prev => ({ start: prev?.start || d, end: d }))}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Stato pagamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="paid">Solo pagati</SelectItem>
                <SelectItem value="unpaid">Solo da pagare</SelectItem>
                <SelectItem value="overdue">Solo scaduti</SelectItem>
              </SelectContent>
            </Select>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Fornitore" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i fornitori</SelectItem>
                <SelectItem value="none">Senza fornitore</SelectItem>
                {data.suppliers.map((s: { id: string; name: string }) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                <SelectItem value="none">Senza categoria</SelectItem>
                {data.dynamicCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={originFilter} onValueChange={(v) => setOriginFilter(v as "all" | "manual" | "order")}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Origine" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le origini</SelectItem>
                <SelectItem value="manual">Manuale</SelectItem>
                <SelectItem value="order">Da moduli collegati</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={resetFilters} disabled={!hasActiveFilters} className="gap-2">
              <FilterX className="h-4 w-4" /> Pulisci filtri
            </Button>
          </div>

          {/* Status Tabs */}
          <div className="flex gap-1 flex-wrap">
            {([
              { value: "all" as StatusTabFilter, label: "Tutti", count: data.allCostsSorted.length },
              { value: "sostenuti" as StatusTabFilter, label: "Sostenuti", count: data.statusTabLists.sostenuti.length },
              { value: "previsti" as StatusTabFilter, label: "Previsti", count: data.statusTabLists.previsti.length },
              { value: "in_ritardo" as StatusTabFilter, label: "In ritardo", count: data.statusTabLists.inRitardo.length },
              { value: "in_scadenza" as StatusTabFilter, label: "In scadenza", count: data.statusTabLists.inScadenza.length },
              { value: "senza_scadenza" as StatusTabFilter, label: "Senza scadenza", count: data.statusTabLists.senzaScadenza.length },
            ]).map(tab => (
              <Button
                key={tab.value}
                variant={statusTabFilter === tab.value ? "default" : "outline"}
                size="sm"
                className={cn(
                  "text-xs gap-1",
                  tab.value === "in_ritardo" && tab.count > 0 && statusTabFilter !== tab.value && "border-red-300 text-red-700 dark:border-red-700 dark:text-red-400",
                  tab.value === "in_scadenza" && tab.count > 0 && statusTabFilter !== tab.value && "border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400",
                  tab.value === "senza_scadenza" && tab.count > 0 && statusTabFilter !== tab.value && "border-slate-300 text-slate-700",
                )}
                onClick={() => setStatusTabFilter(tab.value)}
              >
                {tab.label} ({tab.count})
              </Button>
            ))}
          </div>

          {/* Type Tabs */}
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">Tutti ({getItemsForTab("all").length})</TabsTrigger>
              <TabsTrigger value="fixed">Fissi ({getItemsForTab("fixed").length})</TabsTrigger>
              <TabsTrigger value="variable">Variabili ({getItemsForTab("variable").length})</TabsTrigger>
            </TabsList>
            {["all", "fixed", "variable"].map((tab) => (
              <TabsContent key={tab} value={tab}>
                <CostsTable
                  items={getItemsForTab(tab)}
                  type={tab}
                  selectedIds={selectedIds}
                  costNameCounts={data.costNameCounts}
                  onToggleSelect={toggleSelect}
                  onToggleSelectAll={toggleSelectAll}
                  onClearSelection={() => setSelectedIds(new Set())}
                  onOpenCreate={openCreate}
                  onOpenEdit={openEdit}
                  onOpenDuplicate={openDuplicate}
                  onDelete={setDeleteConfirmId}
                  onDeleteGroup={setDeleteGroupName}
                  onBulkDelete={() => setBulkDeleteConfirm(true)}
                  onBulkMarkPaid={(ids) => mutations.bulkMarkPaidMutation.mutate(ids)}
                  onBulkMarkUnpaid={(ids) => mutations.bulkMarkUnpaidMutation.mutate(ids)}
                  onMarkPaid={handleMarkPaid}
                  onMarkUnpaid={(id) => mutations.markUnpaidMutation.mutate(id)}
                  onMarkOrderItemUnpaid={handleMarkOrderItemUnpaid}
                  onOpenTasks={setTaskCostId}
                  bulkMarkPaidPending={mutations.bulkMarkPaidMutation.isPending}
                  bulkMarkUnpaidPending={mutations.bulkMarkUnpaidMutation.isPending}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <CostFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        formData={formData}
        setFormData={setFormData}
        editingCost={editingCost}
        suppliers={data.suppliers}
        orders={data.orders}
        dynamicCategories={data.dynamicCategories}
        onSave={(fd) => mutations.saveMutation.mutate(fd)}
        isSaving={mutations.saveMutation.isPending}
        onClose={() => { setEditingCost(null); setFormData(defaultFormData); }}
      />

      {/* Budget Section */}
      <CostBudgetManager dynamicCategories={data.dynamicCategories} allCostsSorted={data.allCostsUnfiltered} />

      {/* Cash Flow Semaforo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Semaforo Cassa — Proiezione 30/60/90 giorni
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CashFlowAlert upcomingCosts={data.allCostsSorted} />
        </CardContent>
      </Card>

      <CostsDialogs
        deleteConfirmId={deleteConfirmId}
        onDeleteConfirmChange={setDeleteConfirmId}
        onDeleteConfirm={(id) => mutations.deleteMutation.mutate(id)}
        deleteGroupName={deleteGroupName}
        onDeleteGroupChange={setDeleteGroupName}
        onDeleteGroupConfirm={(name) => { mutations.deleteGroupMutation.mutate(name); setDeleteGroupName(null); }}
        costNameCounts={data.costNameCounts}
        bulkDeleteConfirm={bulkDeleteConfirm}
        onBulkDeleteChange={setBulkDeleteConfirm}
        onBulkDeleteConfirm={() => { mutations.bulkDeleteMutation.mutate(Array.from(selectedIds)); setSelectedIds(new Set()); setBulkDeleteConfirm(false); }}
        selectedCount={selectedIds.size}
        payDialogOpen={payDialogOpen}
        onPayDialogChange={(open) => { setPayDialogOpen(open); if (!open) { setPayingCostId(null); setPaymentDate(format(new Date(), "yyyy-MM-dd")); setPaymentMethod("bonifico"); } }}
        payingCostId={payingCostId}
        paymentDate={paymentDate}
        onPaymentDateChange={setPaymentDate}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        onPaymentConfirm={handlePaymentConfirm}
        isPaymentPending={mutations.markPaidMutation.isPending || mutations.markOrderItemPaidMutation.isPending || mutations.markExtTeamPaidMutation.isPending || mutations.markCommissionPaidMutation.isPending}
        taskCostId={taskCostId}
        onTaskDialogChange={(open) => { if (!open) setTaskCostId(null); }}
      />

      <CSVImportDialog open={importOpen} onOpenChange={setImportOpen} title="Importa Costi" fields={COST_IMPORT_FIELDS} onImport={mutations.handleCostsImport} />
    </>
  );
}
