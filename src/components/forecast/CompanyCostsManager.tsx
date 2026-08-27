import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, addMonths, endOfMonth, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import {
  AlertTriangle, ArrowRight, CalendarIcon, CheckCircle2, ChevronLeft, ChevronRight, Download, FilterX, Landmark, Link2, ListChecks, Plus, ReceiptText, Repeat, Search, Settings2, Upload, Users, WalletCards,
} from "lucide-react";

import { useQuery } from "@tanstack/react-query";
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";
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
import { NavyStatCard } from "@/components/costi/KpiCard";
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
  typeLock = "fixed",
}: {
  /**
   * "spese"          → gestione operativa (filtri, tabella, pagamenti, import)
   * "pianificazione" → regia integrazioni, statistiche, budget
   */
  view?: "spese" | "pianificazione";
  /**
   * La vista spese vive in DUE tab gemelle: "fixed" (la struttura: affitti,
   * leasing, utenze, ricorrenti) e "variable" (i cantieri: materiali,
   * subappalti, provvigioni). Ogni tab ha la sua testata KPI e la sua lista.
   */
  typeLock?: "fixed" | "variable";
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
  const goToSpese = (p: SpesePreset, target?: "spese-fisse" | "spese-variabili") => {
    // Senza target esplicito: i preset "strutturali" (moduli, fornitori,
    // categorie) vivono tra le variabili; per quelli di stato si atterra
    // dove ci sono piu' voci che combaciano.
    let tab = target;
    if (!tab) {
      if (["order", "unscheduled", "missing-suppliers", "missing-categories"].includes(p)) {
        tab = "spese-variabili";
      } else {
        const lists = data.statusTabLists as Record<string, { cost_type?: string }[]>;
        const key = p === "sostenuti" ? "sostenuti" : p === "previsti" ? "previsti" : p === "in_ritardo" ? "inRitardo" : p === "in_scadenza" ? "inScadenza" : "senzaScadenza";
        const list = lists[key] ?? [];
        const fissi = list.filter((c) => c.cost_type === "fixed").length;
        tab = fissi >= list.length - fissi ? "spese-fisse" : "spese-variabili";
      }
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab!);
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
  // Mese selezionato con le frecce o dal grafico: filtra tramite il canale
  // "custom" gia' esistente (query-side), cosi' fascia, chip e tabella
  // restano coerenti da soli.
  const [selectedMonth, setSelectedMonth] = useState<Date | null>(null);

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

  const vaiAlMese = (mese: Date) => {
    const inizio = startOfMonth(mese);
    setSelectedMonth(inizio);
    setPeriodFilter("custom");
    setCustomDateRange({ start: inizio, end: endOfMonth(inizio) });
  };
  const stepMese = (delta: number) => {
    vaiAlMese(addMonths(selectedMonth ?? startOfMonth(new Date()), selectedMonth ? delta : delta > 0 ? 0 : delta));
  };

  const resetFilters = () => {
    setSelectedMonth(null);
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

  // Sintesi ricorrenti per la testata della tab Spese fisse: quante voci
  // madri attive e quanto valgono al mese (annuali /12, trimestrali /3).
  const ricorrentiSintesi = useQuery({
    queryKey: ["costi-ricorrenti-sintesi", companyId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("company_costs")
        .select("amount, recurrence, recurrence_end_date")
        .eq("company_id", companyId!)
        .neq("recurrence", "once");
      if (error) throw error;
      const oggi = new Date();
      let mensile = 0;
      let attive = 0;
      (rows || []).forEach((r: { amount: number | string | null; recurrence: string; recurrence_end_date: string | null }) => {
        if (r.recurrence_end_date && new Date(r.recurrence_end_date) < oggi) return;
        attive += 1;
        const div = r.recurrence === "monthly" ? 1 : r.recurrence === "quarterly" ? 3 : 12;
        mensile += (Number(r.amount) || 0) / div;
      });
      return { attive, mensile };
    },
    enabled: !!companyId && view === "spese" && typeLock === "fixed",
    staleTime: 60 * 1000,
  });

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
          rateFinanziamenti={data.rateFinanziamenti}
          circolante={data.circolante}
          mediaUsciteMensili={(() => {
            // Media (fissi+variabili) sugli ultimi 6 mesi CON dati della serie
            // stabile: e' l'"uscite mensili" della formula del circolante.
            const ultimi = data.andamentoMensile.slice(-7, -1).map((m: { fixed: number; variable: number }) => m.fixed + m.variable).filter((v: number) => v > 0);
            return ultimi.length >= 3 ? ultimi.reduce((s: number, v: number) => s + v, 0) / ultimi.length : 0;
          })()}
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
  // Numeri della fascia in testata: pochi, nudi, cliccabili. Seguono i filtri.
  const eur0 = (v: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(v);
  const vociTipo = getItemsForTab(typeLock) as { amount?: number | string | null; isFromOrder?: boolean; supplier_id?: string | null; supplierName?: string | null }[];
  const sommaVoci = (list: { amount?: number | string | null }[]) => list.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const perTipo = (list: { cost_type?: string }[]) => list.filter((c) => c.cost_type === typeLock);
  const scadutiTipo = perTipo(data.statusTabLists.inRitardo) as { amount?: number | string | null }[];
  const daModuliTipo = vociTipo.filter((c) => c.isFromOrder);
  const senzaFornitoreTipo = vociTipo.filter((c) => !c.isFromOrder && !c.supplier_id && !c.supplierName);

  return (
    <>
      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        {/* Testata NAVY in stile "Riepilogo commesse": il blu scuro fa da
            contrasto e le card bordate portano i numeri che contano. Ogni
            card cliccabile filtra (anello arancio quando attiva). Le azioni
            vivono nella riga dei filtri, sotto. */}
        <div className="bg-[#173b67] p-4 text-white sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)] sm:h-11 sm:w-11">
              {typeLock === "fixed" ? <Landmark className="h-4 w-4 sm:h-5 sm:w-5" /> : <ReceiptText className="h-4 w-4 sm:h-5 sm:w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-100 sm:text-xs">
                {typeLock === "fixed" ? "Spese fisse" : "Spese variabili"}
              </p>
              <h2 className="mt-0.5 text-base font-semibold text-white sm:text-xl">
                {typeLock === "fixed" ? "La struttura: li paghi comunque" : "I cantieri: nascono col lavoro"}
              </h2>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4">
            <NavyStatCard
              label="Totale"
              value={eur0(sommaVoci(vociTipo))}
              sub={`${vociTipo.length} voci nel periodo`}
              icon={WalletCards}
              tone="text-orange-100"
            />
            <NavyStatCard
              label="Scaduti"
              value={scadutiTipo.length > 0 ? eur0(sommaVoci(scadutiTipo)) : "0"}
              sub={scadutiTipo.length > 0 ? `${scadutiTipo.length} da gestire` : "nessuno in ritardo"}
              icon={AlertTriangle}
              tone={scadutiTipo.length > 0 ? "text-orange-300" : "text-emerald-200"}
              onClick={showOverdueCosts}
              active={statusTabFilter === "in_ritardo"}
            />
            {typeLock === "fixed" ? (
              <NavyStatCard
                label="Ricorrenti"
                value={<>{eur0(ricorrentiSintesi.data?.mensile ?? 0)}<span className="text-sm font-normal text-blue-50/70">/mese</span></>}
                sub={`${ricorrentiSintesi.data?.attive ?? 0} voci · gestisci`}
                icon={Repeat}
                onClick={() => setRicorrentiOpen(true)}
              />
            ) : (
              <NavyStatCard
                label="Da moduli"
                value={String(daModuliTipo.length)}
                sub="ordini, team, provvigioni"
                icon={Link2}
                onClick={() => setOriginFilter(originFilter === "order" ? "all" : "order")}
                active={originFilter === "order"}
              />
            )}
            {typeLock === "fixed" ? (
              <NavyStatCard
                label="Pagato"
                value={eur0(sommaVoci(perTipo(data.statusTabLists.sostenuti) as { amount?: number | string | null }[]))}
                sub={`${perTipo(data.statusTabLists.sostenuti).length} voci sostenute`}
                icon={CheckCircle2}
                tone="text-emerald-200"
                onClick={() => setStatusTabFilter(statusTabFilter === "sostenuti" ? "all" : "sostenuti")}
                active={statusTabFilter === "sostenuti"}
              />
            ) : (
              <NavyStatCard
                label="Senza fornitore"
                value={String(senzaFornitoreTipo.length)}
                sub={senzaFornitoreTipo.length > 0 ? "da completare" : "tutti assegnati"}
                icon={Users}
                tone={senzaFornitoreTipo.length > 0 ? "text-amber-200" : "text-emerald-200"}
                onClick={() => { setSupplierFilter(supplierFilter === "none" ? "all" : "none"); setOriginFilter("manual"); }}
                active={supplierFilter === "none"}
              />
            )}
          </div>
        </div>
        <CardContent className="space-y-4 pt-4">
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

          {/* Filtri: una riga nuda — cerca, periodo, e il resto in un popover.
              Niente scatola dentro la scatola: la tabella deve iniziare subito. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cerca tra i costi..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-9 pl-9" />
            </div>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-9 w-7" aria-label="Mese precedente" onClick={() => stepMese(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select value={periodFilter} onValueChange={(v) => {
                setSelectedMonth(null);
                setPeriodFilter(v as PeriodFilter);
                if (v !== "custom") setCustomDateRange(null);
              }}>
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue placeholder="Periodo">
                    {selectedMonth
                      ? format(selectedMonth, "MMMM yyyy", { locale: it }).replace(/^./, (c) => c.toUpperCase())
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i periodi</SelectItem>
                <SelectItem value="this_month">Questo mese</SelectItem>
                <SelectItem value="next_month">Prossimo mese</SelectItem>
                <SelectItem value="last_3_months">Ultimi 3 mesi</SelectItem>
                <SelectItem value="this_year">Quest'anno</SelectItem>
                <SelectItem value="custom">Personalizzato</SelectItem>
              </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-9 w-7" aria-label="Mese successivo" onClick={() => stepMese(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {periodFilter === "custom" && !selectedMonth && (
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
            {/* Fornitore e categoria vivono nel popover: usati di rado,
                non meritano una riga fissa. Il badge dice se sono attivi. */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <FilterX className="h-3.5 w-3.5" />
                  Filtri
                  {(supplierFilter !== "all" || categoryFilter !== "all") && (
                    <Badge className="h-4 min-w-4 rounded-full bg-orange-500 px-1 text-[10px]">
                      {(supplierFilter !== "all" ? 1 : 0) + (categoryFilter !== "all" ? 1 : 0)}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 space-y-2 p-3">
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Fornitore" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i fornitori</SelectItem>
                <SelectItem value="none">Senza fornitore</SelectItem>
                {data.suppliers.map((s: { id: string; name: string }) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le categorie</SelectItem>
                <SelectItem value="none">Senza categoria</SelectItem>
                {data.dynamicCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
              </PopoverContent>
            </Popover>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 gap-1.5 text-muted-foreground">
                <FilterX className="h-3.5 w-3.5" /> Pulisci
              </Button>
            )}
            {/* Azioni a destra della stessa riga: la testata navy e' solo numeri. */}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {scadutiTipo.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBankReconcileOpen(true)}
                  className="h-9 gap-1 border-orange-300 text-orange-700 hover:bg-orange-50"
                >
                  <Landmark className="h-4 w-4" /> Riconcilia banca
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-9 gap-1">
                <Upload className="h-4 w-4" /> Importa
              </Button>
              <Button variant="outline" size="sm" onClick={() => { data.exportCostsCSV(); toast({ title: "CSV esportato" }); }} className="h-9 gap-1">
                <Download className="h-4 w-4" /> Esporta
              </Button>
              <Button size="sm" onClick={() => openCreate(typeLock)} className="h-9 gap-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600">
                <Plus className="h-4 w-4" /> {typeLock === "fixed" ? "Nuovo costo fisso" : "Nuovo costo variabile"}
              </Button>
            </div>
          </div>

          {/* Andamento mensile in stile Commesse: barre blu (spese del mese),
              barre arancio (gia' pagato), linea nera (numero voci, asse destro).
              Cliccare la barra di un mese lo filtra; ricliccarla toglie il
              filtro. La serie e' stabile, non si restringe coi filtri. */}
          {(() => {
            const serie = data.andamentoMensile.map((m: { ym: string; label: string; fixed: number; fixedPagato: number; fixedN: number; variable: number; variablePagato: number; variableN: number }) => ({
              ym: m.ym,
              label: m.label,
              totale: typeLock === "fixed" ? m.fixed : m.variable,
              pagato: typeLock === "fixed" ? m.fixedPagato : m.variablePagato,
              n: typeLock === "fixed" ? m.fixedN : m.variableN,
            }));
            if (serie.every((m) => m.totale === 0)) return null;
            const selYm = selectedMonth ? format(selectedMonth, "yyyy-MM") : null;
            const clickMese = (ym: string | undefined) => {
              if (!ym) return;
              if (selYm === ym) resetFilters();
              else vaiAlMese(new Date(`${ym}-01T00:00:00`));
            };
            return (
              <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-orange-50/40 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Andamento 12 mesi</p>
                    <h3 className="mt-0.5 text-base font-semibold text-slate-950">
                      {typeLock === "fixed" ? "Spese fisse e pagamenti" : "Spese variabili e pagamenti"}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
                    <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-blue-600" /> Spese</span>
                    <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-orange-500" /> Pagato</span>
                    <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-slate-900" /> N. voci</span>
                    <span className="text-muted-foreground">clicca un mese per filtrarlo</span>
                  </div>
                </div>
                <div className="mt-3 h-[220px] rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={serie} margin={{ top: 8, right: 2, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
                      <YAxis
                        yAxisId="money"
                        tickLine={false}
                        axisLine={false}
                        fontSize={10}
                        stroke="#94a3b8"
                        tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                      />
                      <YAxis
                        yAxisId="count"
                        orientation="right"
                        tickLine={false}
                        axisLine={false}
                        fontSize={10}
                        stroke="#94a3b8"
                        allowDecimals={false}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
                        }}
                        formatter={(value, name) => {
                          if (name === "n") return [Number(value).toLocaleString("it-IT"), "N. voci"];
                          return [
                            Number(value).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }),
                            name === "totale" ? "Spese" : "Pagato",
                          ];
                        }}
                        labelFormatter={(label) => `Mese: ${label}`}
                      />
                      <Bar
                        yAxisId="money"
                        dataKey="totale"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={22}
                        className="cursor-pointer"
                        onClick={(entry: { ym?: string; payload?: { ym?: string } }) => clickMese(entry?.ym ?? entry?.payload?.ym)}
                      >
                        {serie.map((m) => (
                          <Cell key={m.ym} fill={selYm === m.ym ? "#1e3a8a" : "#2563eb"} />
                        ))}
                      </Bar>
                      <Bar
                        yAxisId="money"
                        dataKey="pagato"
                        fill="#f97316"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={22}
                        className="cursor-pointer"
                        onClick={(entry: { ym?: string; payload?: { ym?: string } }) => clickMese(entry?.ym ?? entry?.payload?.ym)}
                      />
                      <Line
                        yAxisId="count"
                        type="monotone"
                        dataKey="n"
                        stroke="#0f172a"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#0f172a", strokeWidth: 0 }}
                        activeDot={{ r: 4 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}

          <CostsTable
                  leftSlot={<div className="flex gap-1 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0 [&>button]:shrink-0">
            {([
              // Conteggi del SOLO tipo di questa tab: la tab gemella ha i suoi.
              { value: "all" as StatusTabFilter, label: "Tutti", count: getItemsForTab(typeLock).length },
              { value: "sostenuti" as StatusTabFilter, label: "Sostenuti", count: data.statusTabLists.sostenuti.filter((c: { cost_type?: string }) => c.cost_type === typeLock).length },
              { value: "previsti" as StatusTabFilter, label: "Previsti", count: data.statusTabLists.previsti.filter((c: { cost_type?: string }) => c.cost_type === typeLock).length },
              { value: "in_ritardo" as StatusTabFilter, label: "In ritardo", count: data.statusTabLists.inRitardo.filter((c: { cost_type?: string }) => c.cost_type === typeLock).length },
              { value: "in_scadenza" as StatusTabFilter, label: "In scadenza", count: data.statusTabLists.inScadenza.filter((c: { cost_type?: string }) => c.cost_type === typeLock).length },
              { value: "senza_scadenza" as StatusTabFilter, label: "Senza scadenza", count: data.statusTabLists.senzaScadenza.filter((c: { cost_type?: string }) => c.cost_type === typeLock).length },
            ]).filter(tab => tab.count > 0 || tab.value === "all" || tab.value === statusTabFilter).map(tab => (
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
          </div>}
                  items={getItemsForTab(typeLock)}
                  type={typeLock}
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
        unpaidCosts={((data.allCostsUnfiltered || []) as UnifiedCost[]).filter(
          // Niente stipendi tra le proposte: non si riconciliano con la banca
          // (il pagamento e' presunto a fine mese) e la conferma li rifiuta —
          // proporli significava far esplodere il "Conferma tutti" a meta'.
          (c) => !c.is_paid && resolveCostOrigin(c.id, c.realOrderItemId).type !== "employee-salary",
        )}
        onPayCost={paySingleCostFromBank}
      />
    </>
  );
}
