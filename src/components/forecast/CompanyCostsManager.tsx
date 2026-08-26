import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, addMonths } from "date-fns";
import {
  AlertTriangle, ArrowRight, CalendarIcon, Download,
  FilterX, Landmark, Link2, ListChecks, Plus, Repeat, Search,
  Settings2, Tags, Upload, Users, WalletCards,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { resolveCostOrigin } from "@/lib/forecastTypes";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { CostiBankReconcileDialog } from "@/components/costi/CostiBankReconcileDialog";
import { RicorrentiDialog } from "@/components/costi/RicorrentiDialog";
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

type CostIntegrationSummary = {
  total: number;
  manual: number;
  linked: number;
  scheduled: number;
  paid: number;
  totalAmount: number;
  manualAmount: number;
  linkedAmount: number;
  /** Euro pianificati (con scadenza) ed euro sostenuti: le percentuali della
   *  Regia si calcolano su QUESTI, non sul conteggio righe — 100 stipendi da
   *  2.500 € e 1 fattura da 250.000 € non pesano uguale. */
  scheduledAmount: number;
  paidAmount: number;
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
  // In EURO, non in righe: prima 100 stipendi contavano quanto 100 fatture.
  const paidPct = summary.totalAmount > 0 ? Math.round((summary.paidAmount / summary.totalAmount) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-950">I costi, in ordine</h3>
            <Badge variant={qualityIssues > 0 ? "outline" : "secondary"} className={qualityIssues > 0 ? "border-orange-300 text-orange-700" : ""}>
              {qualityIssues > 0 ? `${qualityIssues} da sistemare` : "Tutto in ordine"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Da dove arrivano, cosa manca, quanto è già pagato.
          </p>
        </div>

      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Da dove arrivano</span>
            <Landmark className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-lg font-semibold">{summary.manual + summary.linked} costi registrati</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.manual} inseriti a mano · {summary.linked} arrivati da ordini, personale e provvigioni
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatCurrency(summary.totalAmount)} in tutto lo storico, stipendi prossimi 12 mesi inclusi
          </p>
          <Button variant="link" size="sm" className="mt-1 h-auto px-0 text-xs" onClick={onShowOrderCosts}>
            Vedi costi collegati <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Da sistemare</span>
            <ListChecks className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-lg font-semibold">{qualityIssues > 0 ? `${qualityIssues} costi incompleti` : "Niente da sistemare"}</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {missingCategory} senza categoria · {missingSupplier} senza fornitore · {unscheduled} senza scadenza
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missingCategory > 0 && <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onShowMissingCategories}>Categorie</Button>}
            {missingSupplier > 0 && <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onShowMissingSuppliers}>Fornitori</Button>}
            {unscheduled > 0 && <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onShowUnscheduled}>Scadenze</Button>}
            {qualityIssues === 0 && <span className="text-xs text-emerald-700">Tutti i costi hanno categoria, fornitore e scadenza.</span>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Già pagato</span>
            <WalletCards className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-lg font-semibold">{paidPct}% del totale</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Dai pagamenti registrati; il resto è ancora da pagare.
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

// Preset di filtro applicabili via URL (?preset=...) quando si arriva alla
// tab Spese da un drill-down della tab Pianificazione.
type SpesePreset =
  | "order"
  | "unscheduled"
  | "missing-categories"
  | "missing-suppliers"
  | "sostenuti"
  | "previsti"
  | "in_ritardo"
  | "in_scadenza"
  | "senza_scadenza";

const STATUS_TAB_PRESETS: StatusTabFilter[] = ["sostenuti", "previsti", "in_ritardo", "in_scadenza", "senza_scadenza"];

export default function CompanyCostsManager({
  view = "spese",
}: {
  /**
   * "spese"          → gestione operativa (filtri, tabella, pagamenti, import)
   * "pianificazione" → regia integrazioni, statistiche, budget e semaforo cassa
   */
  view?: "spese" | "pianificazione";
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [searchParams, setSearchParams] = useSearchParams();

  // Preset letto UNA volta al mount (inizializza i filtri sotto), poi ripulito
  // dalla URL per non ri-applicarlo alla prossima visita della tab.
  const [preset] = useState<SpesePreset | null>(() =>
    view === "spese" ? (searchParams.get("preset") as SpesePreset | null) : null,
  );

  /** Naviga alla tab Spese applicando un preset di filtro. */
  const goToSpese = (p: SpesePreset) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "spese");
        next.set("preset", p);
        return next;
      },
      { replace: false },
    );
  };

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<UnifiedCost | null>(null);
  const [formData, setFormData] = useState<CostFormData>(defaultFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payingCostId, setPayingCostId] = useState<string | null>(null);
  const [bankReconcileOpen, setBankReconcileOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState<string>("bonifico");
  const [importOpen, setImportOpen] = useState(false);
  const [taskCostId, setTaskCostId] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteGroupName, setDeleteGroupName] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  // 🛠️ 2026-05-10: previene double-submit del bottone "Genera ora" (#7 audit fix).
  const [ricorrentiOpen, setRicorrentiOpen] = useState(false);
  const [typeTab, setTypeTab] = useState<"all" | "fixed" | "variable">("all");

  // Filters (inizializzati dall'eventuale preset in URL)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>(preset === "missing-suppliers" ? "none" : "all");
  const [categoryFilter, setCategoryFilter] = useState<string>(preset === "missing-categories" ? "none" : "all");
  const [originFilter, setOriginFilter] = useState<"all" | "manual" | "order">(
    preset === "order" ? "order" : preset === "missing-categories" || preset === "missing-suppliers" ? "manual" : "all",
  );
  const [customDateRange, setCustomDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [statusTabFilter, setStatusTabFilter] = useState<StatusTabFilter>(
    preset === "unscheduled"
      ? "senza_scadenza"
      : preset && STATUS_TAB_PRESETS.includes(preset as StatusTabFilter)
        ? (preset as StatusTabFilter)
        : "all",
  );

  // Ripulisci il preset dalla URL dopo averlo applicato (evita ri-applicazioni
  // al prossimo mount della tab).
  useEffect(() => {
    if (view !== "spese" || !searchParams.get("preset")) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("preset");
        return next;
      },
      { replace: true },
    );
  }, [view, searchParams, setSearchParams]);

  // Data hook
  const data = useCompanyCostsData(companyId, {
    periodFilter, statusFilter, searchQuery, supplierFilter, categoryFilter, originFilter, customDateRange, statusTabFilter,
  }, selectedYear);

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

    const scheduledCosts = allCosts.filter((cost: UnifiedCost) => cost.due_date && cost.due_date !== "9999-12-31");
    const paidCosts = allCosts.filter((cost: UnifiedCost) => cost.is_paid);
    return {
      total: allCosts.length,
      manual: manualCosts.length,
      linked: orderCosts.length,
      scheduled: scheduledCosts.length,
      paid: paidCosts.length,
      totalAmount: sum(allCosts),
      manualAmount: sum(manualCosts),
      linkedAmount: sum(orderCosts),
      scheduledAmount: sum(scheduledCosts),
      paidAmount: sum(paidCosts),
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
      case "employee-salary":
        // Riga sintetica calcolata dal contratto: non c'è nulla da aggiornare
        // nel DB (prima finiva in UPDATE company_costs con id non-uuid → 22P02).
        toast({
          title: "Gli stipendi non si registrano da qui",
          description: "Sono calcolati dal contratto in anagrafica e risultano pagati automaticamente a mese chiuso.",
        });
        break;
      default:
        mutations.markPaidMutation.mutate({ id: payingCostId, date: paymentDate, paymentMethod });
    }
  };

  // Riconciliazione bancaria: segna pagato un costo alla data del movimento,
  // instradando sulla mutation giusta per origine (stesso dispatch del dialog
  // di pagamento manuale). async per permettere la conferma sequenziale.
  const paySingleCostFromBank = async (cost: UnifiedCost, date: string, txId: string) => {
    const origin = resolveCostOrigin(cost.id, cost.realOrderItemId);
    switch (origin.type) {
      case "order-item":
        await mutations.markOrderItemPaidMutation.mutateAsync({ id: origin.realId, date, paymentType: origin.paymentType! });
        break;
      case "ext-team":
        await mutations.markExtTeamPaidMutation.mutateAsync({ id: origin.realId, date });
        break;
      case "commission":
        await mutations.markCommissionPaidMutation.mutateAsync({ id: origin.realId, date });
        break;
      case "employee-salary":
        // Non dovrebbe mai arrivare qui (gli stipendi non entrano nel dialog),
        // ma se succede meglio fermarsi che corrompere un uuid.
        throw new Error("Gli stipendi non si riconciliano con la banca");
      default:
        await mutations.markPaidMutation.mutateAsync({ id: cost.id, date, paymentMethod: "bonifico" });
    }

    // La correzione vera della riconciliazione: il MOVIMENTO BANCARIO viene
    // marcato, non solo il costo. Senza, il Controllo di Gestione contava lo
    // stesso euro due volte (costo in company_costs + uscita bancaria "libera").
    // linked_cost_id solo per i costi manuali (i derivati non hanno una riga
    // in company_costs); lo stato vale per tutti.
    const { error: txError } = await supabase
      .from("bank_transactions")
      .update({
        ...(origin.type === "manual" ? { linked_cost_id: cost.id } : {}),
        reconciliation_status: "reconciled",
        reconciled_at: new Date().toISOString(),
      } as never)
      .eq("id", txId)
      .eq("company_id", companyId!);
    if (txError) {
      // Il costo è già segnato pagato: avvisare senza far fallire l'operazione.
      toast({
        title: "Costo pagato, ma il movimento bancario non è stato marcato",
        description: txError.message,
        variant: "destructive",
      });
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

  // ── Vista PIANIFICAZIONE: regia, statistiche, budget e semaforo cassa ──────
  if (view === "pianificazione") {
    return (
      <div className="space-y-6">
        <CostIntegrationPanel
          summary={integrationSummary}
          missingCategory={operationalControl.missingCategory}
          missingSupplier={operationalControl.missingSupplier}
          unscheduled={operationalControl.unscheduled}
          onShowOrderCosts={() => goToSpese("order")}
          onShowUnscheduled={() => goToSpese("unscheduled")}
          onShowMissingCategories={() => goToSpese("missing-categories")}
          onShowMissingSuppliers={() => goToSpese("missing-suppliers")}
        />

        <CostsStatsCards
          monthlyDistribution={data.monthlyDistribution}
          yearlyStats={data.yearlyStats}
          senzaScadenza={data.senzaScadenzaStats}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          activeStatusTab="all"
          onStatusTabChange={(tab) => {
            if (tab !== "all" && STATUS_TAB_PRESETS.includes(tab)) goToSpese(tab as SpesePreset);
          }}
          categoryDistribution={data.categoryDistribution}
          availableYears={data.availableYears}
          fixedCostsTrend={data.fixedCostsTrend}
          breakEvenData={data.breakEvenData}
        />

        <CostBudgetManager dynamicCategories={data.dynamicCategories} allCostsSorted={data.allCostsUnfiltered} />

        {/* Il "Semaforo Cassa 30/60/90" rifaceva qui il lavoro del Previsionale
            (che ha anche le 13 settimane): un rimando basta. */}
        <p className="text-sm text-muted-foreground">
          La proiezione di cassa (30/60/90 giorni e 13 settimane) vive nel{" "}
          <Link to="/azienda/previsionale" className="font-medium text-primary underline-offset-2 hover:underline">Previsionale</Link>.
        </p>
      </div>
    );
  }

  // ── Vista SPESE: gestione operativa (filtri, tabella, pagamenti) ───────────
  return (
    <>
      <Card className="rounded-2xl border-slate-200 shadow-sm">
        {/* Titolo interno "Controllo Costi Aziendali" rimosso: ripeteva
            l'intestazione di pagina "Costi Aziendali". La CardHeader resta come
            barra azioni pulita (Genera, Importa, Esporta, Nuovo Costo). */}
        <CardHeader className="border-b border-slate-100 bg-gradient-to-br from-white to-orange-50/30 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setRicorrentiOpen(true)} className="gap-1">
                <Repeat className="h-4 w-4" /> Ricorrenti
              </Button>
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

          {/* Avviso troncamento: con 1000+ costi nel periodo i totali sono parziali */}
          {data.costsTruncated && (
            <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-300">
                Stai visualizzando i primi 1.000 costi del periodo: i totali potrebbero essere parziali.
                Restringi il periodo (es. mese o trimestre) per avere numeri completi.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 md:grid-cols-4">
            {/* Unica voce "scaduti" della vista: click filtra, il bottone riconcilia
                (il vecchio banner arancione diceva le stesse cose una seconda volta) */}
            <div
              role="button"
              tabIndex={0}
              onClick={showOverdueCosts}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") showOverdueCosts(); }}
              className={`relative cursor-pointer overflow-hidden rounded-xl border p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${operationalControl.overdueCount > 0 ? "border-orange-300 bg-orange-50/60 hover:border-orange-400" : "border-slate-200 bg-slate-50/40 opacity-80 hover:border-slate-300"}`}
            >
              <div className={`absolute inset-y-0 left-0 w-1 ${operationalControl.overdueCount > 0 ? "bg-orange-500" : "bg-emerald-500"}`} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scaduti</span>
                <AlertTriangle className={`h-4 w-4 ${operationalControl.overdueCount > 0 ? "text-orange-600" : "text-emerald-600"}`} />
              </div>
              <div className="mt-2 text-xl font-semibold">{operationalControl.overdueCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">{operationalControl.overdueCount === 0 ? "nessun pagamento in ritardo" : `${formatCurrency(operationalControl.overdueAmount)} da gestire`}</p>
              {operationalControl.overdueCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 border-orange-400 px-2 text-xs text-orange-700 hover:bg-orange-100"
                  onClick={(e) => { e.stopPropagation(); setBankReconcileOpen(true); }}
                >
                  Riconcilia con banca
                </Button>
              )}
            </div>
            <button
              type="button"
              onClick={showMissingCategories}
              disabled={operationalControl.missingCategory === 0}
              className={`relative overflow-hidden rounded-xl border p-3 text-left shadow-sm transition-all ${operationalControl.missingCategory === 0 ? "border-slate-200 bg-slate-50/40 opacity-70" : "border-slate-200 bg-gradient-to-br from-white to-slate-50/80 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"}`}
            >
              <div className={`absolute inset-y-0 left-0 w-1 ${operationalControl.missingCategory === 0 ? "bg-emerald-500" : "bg-blue-500"}`} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Senza categoria</span>
                <Tags className={`h-4 w-4 ${operationalControl.missingCategory === 0 ? "text-emerald-600" : "text-blue-600"}`} />
              </div>
              <div className="mt-2 text-xl font-semibold">{operationalControl.missingCategory}</div>
              <p className="mt-1 text-xs text-muted-foreground">{operationalControl.missingCategory === 0 ? "tutti classificati" : "da classificare per report"}</p>
            </button>
            <button
              type="button"
              onClick={showMissingSuppliers}
              disabled={operationalControl.missingSupplier === 0}
              className={`relative overflow-hidden rounded-xl border p-3 text-left shadow-sm transition-all ${operationalControl.missingSupplier === 0 ? "border-slate-200 bg-slate-50/40 opacity-70" : "border-slate-200 bg-gradient-to-br from-white to-slate-50/80 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"}`}
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Senza fornitore</span>
                <Users className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-xl font-semibold">{operationalControl.missingSupplier}</div>
              <p className="mt-1 text-xs text-muted-foreground">{operationalControl.missingSupplier === 0 ? "tutti assegnati" : "costi variabili manuali"}</p>
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
              <div className="mt-2 text-xl font-semibold">{operationalControl.linkedToOrders}</div>
              <p className="mt-1 text-xs text-muted-foreground">ordini, team, personale e provvigioni</p>
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:flex-row flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cerca tra i costi..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
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
            {/* Dropdown "Stato pagamento" rimosso: era ridondante con la barra
                tab di stato qui sotto (Tutti/Sostenuti/Previsti/In ritardo/…),
                più chiara e con i conteggi. statusFilter resta "all" (non filtra):
                tutto lo status filtering passa dalle tab. */}
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
              <SelectTrigger className="w-[175px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le categorie</SelectItem>
                <SelectItem value="none">Senza categoria</SelectItem>
                {data.dynamicCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Select "Origine" rimosso: faceva la stessa cosa della card
                "Da moduli collegati" qui sopra. Lo stato resta per i preset. */}
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

          {/* Una sola tabella: il selettore del tipo porta direttamente i
              TOTALI in euro del set filtrato — la divisione fissi/variabili
              si legge nei soldi, senza barre ne' spiegazioni. */}
          {(() => {
            const eurFissi = getItemsForTab("fixed").reduce((sum: number, c: { amount?: number | string | null }) => sum + (Number(c.amount) || 0), 0);
            const eurVariabili = getItemsForTab("variable").reduce((sum: number, c: { amount?: number | string | null }) => sum + (Number(c.amount) || 0), 0);
            const eur0 = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
            return (
              <div className="flex w-fit items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                {([
                  ["all", "Tutti", eurFissi + eurVariabili],
                  ["fixed", "Fissi", eurFissi],
                  ["variable", "Variabili", eurVariabili],
                ] as const).map(([val, label, eur]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTypeTab(val)}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm transition-colors",
                      typeTab === val ? "bg-white font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label} <span className="tabular-nums font-semibold">{eur0(eur)}</span>
                  </button>
                ))}
              </div>
            );
          })()}
          <CostsTable
                  items={getItemsForTab(typeTab)}
                  type={typeTab}
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

      <RicorrentiDialog
        open={ricorrentiOpen}
        onOpenChange={setRicorrentiOpen}
        companyId={companyId}
        onGenerated={() => data.refetchAll()}
      />
      <CostiBankReconcileDialog
        open={bankReconcileOpen}
        onOpenChange={setBankReconcileOpen}
        companyId={companyId}
        unpaidCosts={((data.allCostsUnfiltered || []) as UnifiedCost[]).filter((c) => !c.is_paid)}
        onPayCost={paySingleCostFromBank}
      />
    </>
  );
}
