import { useState, useEffect } from "react";
import { format, addMonths } from "date-fns";
import { it } from "date-fns/locale";
import { Building2, Plus, Search, Download, Upload, CalendarIcon, AlertTriangle, Repeat } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { resolveCostOrigin } from "@/lib/forecastTypes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

const COST_IMPORT_FIELDS: ImportField[] = [
  { key: "name", label: "Nome", required: true },
  { key: "cost_type", label: "Tipo", required: false },
  { key: "amount", label: "Importo", required: true, type: "number" },
  { key: "category", label: "Categoria", required: false },
  { key: "recurrence", label: "Ricorrenza", required: false },
  { key: "due_date", label: "Data Scadenza", required: true, type: "date" },
  { key: "notes", label: "Note", required: false },
];

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
  const [importOpen, setImportOpen] = useState(false);
  const [taskCostId, setTaskCostId] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteGroupName, setDeleteGroupName] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Filters
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const statusFilter: StatusFilter = "all";
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
      end_date: "",
      recurrence_auto: false,
    });
    setDialogOpen(true);
  };

  const openDuplicate = (cost: UnifiedCost) => {
    setEditingCost(null);
    const nextMonth = addMonths(new Date(cost.due_date), 1);
    setFormData({
      name: cost.name,
      cost_type: cost.cost_type,
      amount: String(cost.amount),
      category: cost.category || "",
      recurrence: cost.recurrence,
      due_date: format(nextMonth, "yyyy-MM-dd"),
      notes: cost.notes || "",
      order_id: cost.order_id || "none",
      supplier_id: cost.supplier_id || "none",
      vat_rate: String(cost.vat_rate ?? 22),
      is_gross: false,
      end_date: "",
      recurrence_auto: false,
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
        mutations.markPaidMutation.mutate({ id: payingCostId, date: paymentDate });
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
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" /> Controllo Costi Aziendali
              </CardTitle>
              <CardDescription>Gestione costi con IVA, fornitori e analisi fiscale</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { data: result, error } = await supabase.functions.invoke("generate-recurring-costs", {
                      body: { company_id: companyId },
                    });
                    if (error) throw error;
                    toast({ title: `Generati ${result?.created || 0} costi ricorrenti` });
                  } catch {
                    toast({ title: "Errore nella generazione", variant: "destructive" });
                  }
                }}
                className="gap-1"
              >
                <Repeat className="h-4 w-4" /> Genera ricorrenti
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1">
                <Upload className="h-4 w-4" /> Importa
              </Button>
              <Button variant="outline" size="sm" onClick={() => { data.exportCostsCSV(); toast({ title: "CSV esportato" }); }} className="gap-1">
                <Download className="h-4 w-4" /> Esporta
              </Button>
              <Button size="sm" onClick={() => openCreate("fixed")} className="gap-1">
                <Plus className="h-4 w-4" /> Nuovo Costo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
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
                  onClick={() => setStatusTabFilter("in_ritardo")}
                >
                  Visualizza
                </Button>
              </AlertDescription>
            </Alert>
          )}

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
          />

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cerca costo o fornitore..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
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
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Fornitore" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i fornitori</SelectItem>
                <SelectItem value="none">Senza fornitore</SelectItem>
                {data.suppliers.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
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
                <SelectItem value="order">Da Ordine</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Tabs */}
          <div className="flex gap-1 flex-wrap">
            {([
              { value: "all" as StatusTabFilter, label: "Tutti", count: data.allCostsSorted.length },
              { value: "sostenuti" as StatusTabFilter, label: "Sostenuti", count: data.statusTabLists.sostenuti.length },
              { value: "previsti" as StatusTabFilter, label: "Previsti", count: data.statusTabLists.previsti.length },
              { value: "in_ritardo" as StatusTabFilter, label: "In ritardo", count: data.statusTabLists.inRitardo.length },
              { value: "in_scadenza" as StatusTabFilter, label: "In scadenza", count: data.statusTabLists.inScadenza.length },
            ]).map(tab => (
              <Button
                key={tab.value}
                variant={statusTabFilter === tab.value ? "default" : "outline"}
                size="sm"
                className={cn(
                  "text-xs gap-1",
                  tab.value === "in_ritardo" && tab.count > 0 && statusTabFilter !== tab.value && "border-red-300 text-red-700 dark:border-red-700 dark:text-red-400",
                  tab.value === "in_scadenza" && tab.count > 0 && statusTabFilter !== tab.value && "border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400",
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
      <CostBudgetManager dynamicCategories={data.dynamicCategories} allCostsSorted={data.allCostsSorted} />

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
        onPayDialogChange={(open) => { setPayDialogOpen(open); if (!open) { setPayingCostId(null); setPaymentDate(format(new Date(), "yyyy-MM-dd")); } }}
        payingCostId={payingCostId}
        paymentDate={paymentDate}
        onPaymentDateChange={setPaymentDate}
        onPaymentConfirm={handlePaymentConfirm}
        isPaymentPending={mutations.markPaidMutation.isPending || mutations.markOrderItemPaidMutation.isPending || mutations.markExtTeamPaidMutation.isPending || mutations.markCommissionPaidMutation.isPending}
        taskCostId={taskCostId}
        onTaskDialogChange={(open) => { if (!open) setTaskCostId(null); }}
      />

      <CSVImportDialog open={importOpen} onOpenChange={setImportOpen} title="Importa Costi" fields={COST_IMPORT_FIELDS} onImport={mutations.handleCostsImport} />
    </>
  );
}
