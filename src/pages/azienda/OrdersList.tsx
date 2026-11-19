import {AvvisoAttesaCommesse} from "@/components/orders/AvvisoAttesaCommesse";
import {withAbortableClientTimeout} from "@/lib/query-timeout";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useDashboardBillingKPI } from "@/hooks/billing/useDashboardBillingKPI";
import { leggiModalitaCommesse } from "@/lib/finanziamenti/leggiModalitaCommesse";
import {OrdersCarryoverSummary} from "@/components/orders/OrdersAnnualScope";
import { OrdersTrashDialog } from '@/components/orders/OrdersTrashDialog';
import {currentManagementScope, orderEconomics, orderYear, previousOrderReasons, orderScopeGroupIds, type OrderScopeGroup} from "@/lib/orders/annualScope";
import {TICKET_STATI_CHIUSI} from "@/types/tickets";
import {readOrdersPage, soloQuesteCommesse, type OrdersReaderFilters} from "@/lib/orders/listQuery";
import { parseOrderAdvancedFilters } from "@/lib/orders/advancedFilters";
import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { matchesOrderPayment } from "@/lib/orders/listPayments";
import { readAllOrderRows, orderMarginKind, orderMarginGroups, ORDER_FOCUS_LABELS, type OrderFocus, type OrderMarginRow } from "@/lib/orders/listScope";
import "./OrdersList/orders-list.css";
import { useIsMobile } from "@/hooks/use-mobile";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useURLFilters } from "@/hooks/useURLFilters";
import { usePermissions } from "@/hooks/usePermissions";
import { useRiepilogoCommesse } from "@/hooks/useRiepilogoCommesse";
import { RiepilogoCommesseScelta } from "@/components/orders/RiepilogoCommesseScelta";
import { CATALOGO_RIQUADRI, commesseInRitardo, margineDelPeriodo, riquadriVisibili, serieVisibili, usaGenerali, type RiquadroRiepilogo } from "@/lib/orders/riepilogoCommesse";
import { useCruscottoGenerali } from "@/hooks/useCruscottoGenerali";
import { Plus, Package, LayoutList, Columns3, Upload, MoreVertical, ChevronLeft, ChevronRight, ClipboardList, ShoppingCart, AlertTriangle, PieChart, SlidersHorizontal, Columns, FileCheck, FileText, FileSpreadsheet, ChevronDown, Users as UsersIcon, Target, ShieldCheck, ShoppingBag, Euro, TrendingUp, AlertCircle, Settings2, Clock, Wrench, CheckCircle2, FolderOpen, Coins, Percent, Wallet, History, Receipt, Landmark, Hammer, Building2, Map as MapIcon, FileQuestion, NotebookPen } from "lucide-react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

// 🆕 Sprint S3: Sopralluoghi come tab dentro Commesse
const SopralluoghiList = lazy(() => import("@/pages/azienda/sopralluoghi/SopralluoghiList"));
const RapportiniCommesse = lazy(() => import("@/pages/azienda/RapportiniCommesse"));
const OrderCommissionsOverview = lazy(() =>
  import("@/components/orders/OrderCommissionsOverview").then((module) => ({
    default: module.OrderCommissionsOverview,
  }))
);
import { OrdersFilterSidebar, INITIAL_FILTER_STATE, countActiveFilters, type OrdersFilterState } from "@/components/orders/OrdersFilterSidebar";
const PurchaseOrdersList = lazy(() => import("@/pages/azienda/PurchaseOrdersList"));
const SupplierRfqsList = lazy(() => import("@/pages/azienda/SupplierRfqsList"));
const DDTRicezioneList = lazy(() => import("@/pages/azienda/DDTRicezioneList"));
const GlobalErrors = lazy(() => import("@/pages/azienda/GlobalErrors"));
const MarginalitaCantieri = lazy(() => import("@/pages/azienda/MarginalitaCantieri"));
import { format } from "date-fns";
import { annualComparisonPeriod, comparableOrderMonths, orderChartMonthFilter } from "@/lib/orders/monthlyChart";
import { OrdersMarginSummary } from "@/components/orders/OrdersMarginSummary";
import { OrdersSummaryCard } from "@/components/orders/OrdersSummaryCard";
import { directMarginSummary, groupedSummaryCards, netOrderTotals } from "@/lib/orders/summaryIndicators";
import { useOrdersPayables } from "@/hooks/useOrdersPayables";
const OrdersMonthlyChart = lazy(() => import("@/components/orders/OrdersMonthlyChart").then(module => ({default: module.OrdersMonthlyChart})));

import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { exportToCSV, exportToXLSX } from "@/lib/csvExport";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePipelineLocali } from "@/lib/orders/pipelineLocali";
import { mostraPipelinePrincipale, pipelineOperativa } from "@/lib/orders/pipelinePrincipale";
import { PipelineCommesseBoard } from "@/components/orders/PipelineCommesseBoard";
import { OrdersFilters, OrderSearch } from "@/components/orders/OrdersFilters";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { CSVImportDialog } from "@/components/shared/CSVImportDialog";
import { commessaDaRiga } from "@/lib/orders/importaCommesse";
import { messaggioErrore } from "@/lib/orders/sottofasi";
import { CustomerSheetsExportDialog } from "@/components/orders/CustomerSheetsExportDialog";
import { useToast } from "@/hooks/use-toast";
import { type OrderPaymentDetails, type OrderWithDetails, getAmountDue, getAmountCollected, getPendingPayments, deleteOrderCascading, getGrossOrderAmount, contrattoPattuito } from "@/lib/orderUtils";
import { PlanLimitWarning } from "@/components/billing/PlanLimitWarning";
import { ScopriProgressBanner } from "@/components/subscription/UpgradeScopriBanner";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useAppaltatoreModuleEnabled } from "@/hooks/useAppaltatoreModule";
import { OrderTypeChoiceDialog } from "@/components/orders/OrderTypeChoiceDialog";
import { RaggruppaDialog } from "@/components/orders/generali/RaggruppaDialog";
import { NuovaGeneraleDialog } from "@/components/orders/generali/NuovaGeneraleDialog";
import { leggiIdGenerali, leggiMovimentiUnita, unitaInVendita, useImpostazioniCommesseGenerali, useMappaGenerali } from "@/hooks/useCommesseGenerali";
import type { ModelloGenerale } from "@/lib/orders/commesseGenerali";

// MP-CAN-001 — types/constants estratti in ./OrdersList/constants.ts
import {
  type DateRange,
  ORDER_IMPORT_FIELDS,
  EMPTY_ORDERS,
} from "./OrdersList/constants";

/** Commessa cliente spenta e, da telefono, nessuna generale creabile. */
const NIENTE_DA_CREARE = "Da telefono una commessa generale si legge soltanto: creala dal computer";

function OrdersListInner() {
  const { user, effectiveCompany } = useAuth();
  const orderPerms = usePermissions();
  const { isNative } = useBillingMode();
  const { toast } = useToast();
  const { remainingOrders, currentPlan } = useSubscriptionLimits();
  const [searchParams] = useSearchParams();
  const isCommercialistaMode = searchParams.get("commercialistaMode") === "1";
  const appaltatoreEnabled = useAppaltatoreModuleEnabled();
  const [showOrderTypeDialog, setShowOrderTypeDialog] = useState(false);
  // Commesse generali accese da Impostazioni: il bivio «Nuova Commessa» le offre accanto alla commessa normale.
  const { modelli: modelliGenerali, configurata: generaliConfigurate, commessaCliente } = useImpostazioniCommesseGenerali();
  const { scelta: sceltaRiepilogo } = useRiepilogoCommesse(effectiveCompany?.id);
  const [nuovaGenerale, setNuovaGenerale] = useState<ModelloGenerale | null>(null);
  const mappaGenerali = useMappaGenerali();
  const queryClient = useQueryClient();
  const refreshOrderScope = useCallback(() => {
    for (const key of ["orders", "orders-global-stats", "orders-pipeline", "orders-monthly-sales-chart"])
      void queryClient.invalidateQueries({queryKey:[key]});
    for (const queryKey of [queryKeys.calendarOrders.all, queryKeys.dashboard.all, queryKeys.cruscotto.all, queryKeys.cashflow.all])
      void queryClient.invalidateQueries({queryKey});
  }, [queryClient]);
  const { params: urlFilters, setParam: setURLParam, setParams: setURLParams } = useURLFilters({
    searchQuery: { key: "q", defaultValue: "" },
    statusFilter: { key: "status", defaultValue: "all" },
    paymentFilter: { key: "payment", defaultValue: "all" },
    generaliFilter: { key: "generali", defaultValue: "all" },
    viewMode: { key: "view", defaultValue: (() => { try { return localStorage.getItem("orders-view-mode") || "table"; } catch { return "table"; } })() },
    customerFilter: { key: "cliente", defaultValue: "all" },
    // Annualità corrente completa + pregresso con lavori, assistenza o saldo aperti.
    yearFilter: { key: "anno", defaultValue: "corrente" },
    monthFilter: { key: "mese", defaultValue: "all" },
    salespersonFilter: { key: "venditore", defaultValue: "all" },
    laborFilter: { key: "manodopera", defaultValue: "all" },
    supplierFilter: { key: "fornitore", defaultValue: "all" },
    controlFocus: { key: "focus", defaultValue: "all" },
    scopeGroup: {key:"gruppo",defaultValue:"all"},
    advancedFilters: { key: "avanzati", defaultValue: "" },
    contractFrom: {key:"contratto_dal", defaultValue:""}, contractTo: {key:"contratto_al", defaultValue:""},
    warehouseFrom: {key:"merce_dal", defaultValue:""}, warehouseTo: {key:"merce_al", defaultValue:""},
    expectedFrom: {key:"posa_dal", defaultValue:""}, expectedTo: {key:"posa_al", defaultValue:""},
    hideCompleted: { key: "nascondi_completati", defaultValue: false, serialize: (v) => v ? "1" : "0", deserialize: (v) => v === "1" },
  });

  const searchQuery = urlFilters.searchQuery;
  const debouncedSearch = useDebounce(searchQuery, 400);
  const setSearchQuery = useCallback((v: string) => setURLParam("searchQuery", v), [setURLParam]);
  const statusFilter = urlFilters.statusFilter;
  const setStatusFilter = useCallback((v: string) => setURLParam("statusFilter", v), [setURLParam]);
  const paymentFilter = urlFilters.paymentFilter as "all" | "pending" | "paid" | "overdue";
  const setPaymentFilter = useCallback((v: "all" | "pending" | "paid" | "overdue") => setURLParam("paymentFilter", v), [setURLParam]);
  const generaliFilter = urlFilters.generaliFilter as "all" | "solo" | "senza";
  const setGeneraliFilter = useCallback((v: "all" | "solo" | "senza") => setURLParam("generaliFilter", v), [setURLParam]);
  // Su mobile la pipeline (kanban drag) non è usabile e il toggle è hidden sm:flex:
  // un link condiviso ?view=pipeline (o il localStorage del desktop) lasciava il
  // telefono inchiodato sulla pipeline senza via d'uscita → forziamo la tabella.
  const isMobile = useIsMobile();
  // Da telefono una generale si legge soltanto (piano §3.4): la scelta non si offre.
  const modelliCreabili = isMobile ? [] : modelliGenerali;
  const conBivio = appaltatoreEnabled || modelliCreabili.length > 0;
  // Commessa cliente spenta e niente da scegliere (da telefono le generali si
  // leggono soltanto): il pulsante non deve portare al flusso cliente.
  const nienteDaCreare = !commessaCliente && !conBivio;
  const [daRaggruppare, setDaRaggruppare] = useState<string[] | null>(null);
  const rawViewMode = urlFilters.viewMode as "table" | "pipeline";
  const viewMode: "table" | "pipeline" = isMobile ? "table" : rawViewMode;
  const archivioTabella = usePipelineLocali(effectiveCompany?.id ?? "");
  const pipelineSelezionata = pipelineOperativa(effectiveCompany?.id, archivioTabella.pipeline, searchParams.get("pipeline"));
  const idsPipeline = useMemo(() => {
    if (!pipelineSelezionata) return null;
    const fasi = new Set(pipelineSelezionata.fasi.map(fase => fase.id));
    return Object.entries(archivioTabella.fasiPerCommessa)
      .filter(([, fase]) => fasi.has(fase)).map(([id]) => id).sort();
  }, [pipelineSelezionata, archivioTabella.fasiPerCommessa]);
  const riferimentiPipeline = useMemo(() => {
    const fasi = new Map(archivioTabella.pipeline.flatMap(p => p.fasi.map(f => [f.id, p.nome + " · " + f.name] as const)));
    return new Map(Object.entries(archivioTabella.fasiPerCommessa).map(([ordine, fase]) => [ordine, fasi.get(fase) ?? "—"]));
  }, [archivioTabella.pipeline, archivioTabella.fasiPerCommessa]);

  const setViewMode = useCallback((v: "table" | "pipeline") => {
    try { localStorage.setItem("orders-view-mode", v); } catch { /* Safari Private Browsing */ }
    setURLParam("viewMode", v);
  }, [setURLParam]);
  const customerFilter = urlFilters.customerFilter;
  const setCustomerFilter = useCallback((v: string) => setURLParam("customerFilter", v), [setURLParam]);
  const yearFilter = urlFilters.yearFilter;
  const setYearFilter = useCallback((v: string) => setURLParam("yearFilter", v), [setURLParam]);
  const monthFilter = urlFilters.monthFilter;
  const setMonthFilter = useCallback((v: string) => setURLParam("monthFilter", v), [setURLParam]);
  const salespersonFilter = urlFilters.salespersonFilter;
  const setSalespersonFilter = useCallback((v: string) => setURLParam("salespersonFilter", v), [setURLParam]);
  const laborFilter = urlFilters.laborFilter;
  const setLaborFilter = useCallback((v: string) => setURLParam("laborFilter", v), [setURLParam]);
  const supplierFilter = urlFilters.supplierFilter;
  const setSupplierFilter = useCallback((v: string) => setURLParam("supplierFilter", v), [setURLParam]);
  const controlFocus = (urlFilters.controlFocus in ORDER_FOCUS_LABELS ? urlFilters.controlFocus : "all") as OrderFocus;
  const setControlFocus = useCallback((v: OrderFocus) => setURLParam("controlFocus", v), [setURLParam]);
  const scopeGroup: OrderScopeGroup = urlFilters.scopeGroup === "annual" || urlFilters.scopeGroup === "previous" ? urlFilters.scopeGroup : "all";
  const setScopeGroup = (group: OrderScopeGroup) => setURLParam("scopeGroup",group);
  const hideCompleted = urlFilters.hideCompleted;
  const setHideCompleted = useCallback((v: boolean) => setURLParam("hideCompleted", v), [setURLParam]);
  const dateFromURL = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? new Date(`${value}T00:00:00`) : undefined;
  const month = Number(monthFilter);
  const monthYear = /^\d{4}$/.test(yearFilter) ? Number(yearFilter) : new Date().getFullYear();
  const hasMonth = monthFilter !== "all" && Number.isInteger(month) && month >= 0 && month <= 11;
  const contractDateRange: DateRange = {
    from: dateFromURL(urlFilters.contractFrom) ?? (hasMonth ? new Date(monthYear,month,1) : undefined),
    to: dateFromURL(urlFilters.contractTo) ?? (hasMonth ? new Date(monthYear,month+1,0) : undefined),
  };
  const warehouseDateRange: DateRange = {from:dateFromURL(urlFilters.warehouseFrom),to:dateFromURL(urlFilters.warehouseTo)};
  const expectedDateRange: DateRange = {from:dateFromURL(urlFilters.expectedFrom),to:dateFromURL(urlFilters.expectedTo)};
  const encodeDate = (value: Date | undefined) => value ? format(value,"yyyy-MM-dd") : "";
  const setContractDateRange = (range: DateRange) => setURLParams({monthFilter:"all",contractFrom:encodeDate(range.from),contractTo:encodeDate(range.to)});
  const setWarehouseDateRange = (range: DateRange) => setURLParams({warehouseFrom:encodeDate(range.from),warehouseTo:encodeDate(range.to)});
  const setExpectedDateRange = (range: DateRange) => setURLParams({expectedFrom:encodeDate(range.from),expectedTo:encodeDate(range.to)});
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [importOpen, setImportOpen] = useState(false);
  const [customerSheetsOpen, setCustomerSheetsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Visibile al primo accesso; conserva la scelta esplicita di nasconderlo.
  const [analisiAperta, setAnalisiAperta] = useState(() => {
    try { return localStorage.getItem("orders-analisi-aperta") !== "0"; } catch { return true; }
  });
  const toggleAnalisi = useCallback(() => {
    setAnalisiAperta((v) => {
      const next = !v;
      try { localStorage.setItem("orders-analisi-aperta", next ? "1" : "0"); } catch { /* private mode */ }
      return next;
    });
  }, []);
  const sidebarFilters = useMemo(() => parseOrderAdvancedFilters(urlFilters.advancedFilters, INITIAL_FILTER_STATE), [urlFilters.advancedFilters]);
  const setSidebarFilters = (value: OrdersFilterState) => setURLParam("advancedFilters", countActiveFilters(value) ? JSON.stringify(value) : "");

  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 🛠️ 2026-05-10 — Server-side sorting per commesse.
  //
  // Bug originale: il sort nella tabella era solo client-side (useTableSort)
  // → sortava solo le 20 righe della pagina corrente. Per aziende con 100+
  // commesse l'utente non riusciva a vedere "le più care", "le più vecchie"
  // o ordinarle per cliente in modo affidabile.
  //
  // Fix: aggiungiamo sortField/sortDir lato URL+state, mappiamo alle colonne
  // DB sortabili e riordiniamo via Postgres. Le colonne "computed"
  // (totalIvato, margine, costi variabili) restano client-side perché non
  // esistono in DB — limitazione accettabile, l'utente ha tutti i casi
  // pratici (data, importo, codice, cliente, scadenza) coperti server-side.
  type SortableField = "created_at" | "total_amount" | "expected_date"
    | "warehouse_arrival_date" | "work_start_date" | "work_end_date"
    | "order_code" | "description";
  const [sortField, setSortField] = useState<SortableField>(() => {
    try {
      const v = localStorage.getItem("orders-sort-field");
      if (v && ["created_at","total_amount","expected_date","warehouse_arrival_date",
        "work_start_date","work_end_date","order_code","description"].includes(v)) {
        return v as SortableField;
      }
    } catch { /* private browsing */ }
    return "created_at";
  });
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => {
    try {
      const v = localStorage.getItem("orders-sort-dir");
      return v === "asc" ? "asc" : "desc";
    } catch { return "desc"; }
  });
  // Persist su LocalStorage
  useEffect(() => {
    try { localStorage.setItem("orders-sort-field", sortField); } catch { /* noop */ }
  }, [sortField]);
  useEffect(() => {
    try { localStorage.setItem("orders-sort-dir", sortDir); } catch { /* noop */ }
  }, [sortDir]);
  const isYearCorrente = yearFilter === "corrente";
  const currentYear = Number(new Date().getFullYear());
  const selectedYear = !isYearCorrente && yearFilter !== "all" ? Number(yearFilter) : null;
  const hasSelectedYear = Number.isInteger(selectedYear);

  // Gli stati definiscono anche il perimetro anno corrente + commesse aperte.
  const { data: statuses = [], isLoading: isLoadingStatuses, isError: isStatusesError, refetch: retryStatuses } = useQuery({
    queryKey: ["order-statuses", effectiveCompany?.id],
    queryFn: ({signal}) => withAbortableClientTimeout(async(readSignal) => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, color, position, is_support_phase")
        .eq("company_id", effectiveCompany.id)
        .order("position").abortSignal(readSignal);
      if (error) throw error;
      return data;
    }, "Stati commesse", 20_000, signal),
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60 * 1000,
  });

  // La fase Assistenza è lo stato con is_support_phase=true (max 1 per azienda).
  const supportStatusId = statuses.find(s => (s as { is_support_phase?: boolean }).is_support_phase)?.id ?? null;
  // "Completato" = ultimo stato di workflow (massima position) che NON è fase Assistenza.
  // Questo evita il bug: con Assistenza in coda (position > Posa Completata), il reduce
  // precedente restituiva Assistenza come "ultimo", invertendo la semantica di "In Corso".
  const workflowStatuses = statuses.filter(s => !(s as { is_support_phase?: boolean }).is_support_phase);
  const lastStatusId = workflowStatuses.length > 0
    ? workflowStatuses.reduce((max, s) => s.position > max.position ? s : max, workflowStatuses[0]).id
    : null;

  // Il perimetro del pregresso alimenta i filtri prima dei totali aziendali.
  const { data: gestione, dataUpdatedAt: gestioneResultAt, isError: errorePerimetro, refetch: ricaricaPerimetro } = useQuery({
    queryKey: ["orders-global-stats", "perimetro-gestione-v1", effectiveCompany?.id, yearFilter, currentYear, lastStatusId, supportStatusId, orderPerms.canViewTickets],
    queryFn: ({signal}) => withAbortableClientTimeout(async(readSignal) => {
      const companyId = effectiveCompany?.id;
      if (!companyId) throw new Error("Azienda non disponibile.");
      let query = supabase
        .from("orders")
        .select("id, created_at, customer_id, expected_date, work_start_date, total_amount, vat_rate, vat_breakdown, deposit_amount, deposit_2_amount, balance_amount, deposit_paid, deposit_2_paid, balance_paid, financing_amount, financing_cost, financing_paid, payment_type, current_status_id, deposit_expected_date, deposit_2_expected_date, balance_expected_date, financing_expected_date, installments:order_installments(position, type, amount, is_paid, paid_date, expected_date, fattura:documenti_fiscali(id, importo_pagato)), variazioni:ordini_variazione(status, impatto_economico, offline_signed_on, firmato_il, approval_recorded_at, richiesto_il, created_at)")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (isYearCorrente) query = query.lt("created_at",new Date(currentYear + 1,0,1).toISOString());
      if (!isYearCorrente && hasSelectedYear && selectedYear) {
        query = query
          .gte("created_at", new Date(selectedYear, 0, 1).toISOString())
          .lte("created_at", new Date(selectedYear, 11, 31, 23, 59, 59, 999).toISOString());
      }
      query = query.order("id").abortSignal(readSignal);
      const [allRows, tickets] = await Promise.all([
        readAllOrderRows((from, to) => query.range(from, to))
          .then(rows => leggiModalitaCommesse(companyId, rows as unknown as OrderWithDetails[], readSignal)),
        orderPerms.canViewTickets ? readAllOrderRows((from, to) => supabase.from("tickets")
          .select("order_id").eq("company_id", companyId).not("order_id", "is", null)
          .not("status", "in", `(${TICKET_STATI_CHIUSI.join(",")})`).order("id").range(from, to).abortSignal(readSignal)) : [],
      ]);
      readSignal.throwIfAborted();
      const ticketIds = new Set(tickets.flatMap(ticket => ticket.order_id ? [ticket.order_id] : []));
      const rows = isYearCorrente ? currentManagementScope(allRows,currentYear,lastStatusId,supportStatusId,ticketIds) : allRows;
      const supportOrderIds = rows.filter(order => (!!supportStatusId && order.current_status_id === supportStatusId) || ticketIds.has(order.id)).map(order => order.id);
      return { rows, ticketIds: [...ticketIds], supportOrderIds };
    }, "Perimetro commesse", 20_000, signal),
    enabled: !!effectiveCompany?.id && !isLoadingStatuses && !isStatusesError && !orderPerms.isLoading,
    staleTime: 5 * 60 * 1000,
  });

  const scopeOrders = gestione?.rows ?? EMPTY_ORDERS;
  const paymentIds = useMemo(() => paymentFilter === "all" && sidebarFilters.paymentStatus === "all" ? null :
    scopeOrders.filter(order => matchesOrderPayment(order, paymentFilter) && matchesOrderPayment(order, sidebarFilters.paymentStatus)).map(order => order.id),
    [scopeOrders, paymentFilter, sidebarFilters.paymentStatus]);
  const scopeOrderIds = useMemo(() => scopeOrders.map(order => order.id), [scopeOrders]);
  const listScopeIds = useMemo(() => (
    scopeGroup === "all" ? scopeOrderIds : orderScopeGroupIds(scopeOrders, scopeGroup, currentYear)
  ), [scopeGroup, scopeOrderIds, scopeOrders, currentYear]);
  const {data: scopeMargins, isPending: scopeMarginsPending, isError: scopeMarginsError, refetch: retryScopeMargins} = useQuery({
    queryKey: ["orders-margin-scope", effectiveCompany?.id, scopeOrderIds],
    enabled: !!effectiveCompany?.id && !!gestione && (orderPerms.canViewMargins || orderPerms.canViewCosts),
    queryFn: ({signal}) => withAbortableClientTimeout(async(readSignal) => {
      const rows: OrderMarginRow[] = [];
      for (let from = 0; from < scopeOrderIds.length; from += 100) {
        const {data, error} = await supabase.from("v_ordine_marginalita")
          .select("id, preventivo_totale, consuntivo, margine, margine_perc")
          .eq("company_id", effectiveCompany!.id).in("id", scopeOrderIds.slice(from, from + 100)).abortSignal(readSignal);
        if (error) throw error;
        rows.push(...(data ?? []));
      }
      return rows;
    }, "Margini commesse", 20_000, signal),
    staleTime: 2 * 60 * 1000,
  });
  const marginGroups = useMemo(() => orderMarginGroups(isYearCorrente ? listScopeIds : scopeOrderIds, scopeMargins ?? []), [scopeOrderIds, listScopeIds, isYearCorrente, scopeMargins]);
  const focusIds = useMemo(() => {
    if (controlFocus === "all") return null;
    if (!orderPerms.canViewMargins) return [];
    if (controlFocus === "missing_data") {
      const missingCosts = new Set(marginGroups.missing_costs);
      return scopeOrders.filter(order => !order.customer_id || !order.current_status_id ||
        (!order.expected_date && !order.work_start_date) || missingCosts.has(order.id)).map(order => order.id);
    }
    return marginGroups[controlFocus];
  }, [controlFocus, marginGroups, scopeOrders, orderPerms.canViewMargins]);
  const needsScope = isYearCorrente || statusFilter === "__assistenza__" || controlFocus !== "all" || paymentIds !== null;
  const richiedeMargini = controlFocus !== "all" && orderPerms.canViewMargins;
  const focusReady = (!needsScope || !!gestione) && (!richiedeMargini || !scopeMarginsPending);
  const scopeError = (needsScope && errorePerimetro) || (richiedeMargini && scopeMarginsError);

  function filterReaderKey() {
    return JSON.stringify([debouncedSearch, statusFilter, paymentFilter, generaliFilter, customerFilter, yearFilter, monthFilter,
      amountMin, amountMax, salespersonFilter, laborFilter, supplierFilter, hideCompleted, lastStatusId, supportStatusId,
      contractDateRange, warehouseDateRange, expectedDateRange, sidebarFilters, focusIds, paymentIds, listScopeIds, gestione?.supportOrderIds]);
  }

  // Senza ricerca né filtri sulle righe, le pagine contano solo generali e commesse normali: le
  // commesse dentro una generale stanno sotto di lei (figlieFuoriPagina), mai sciolte in un'altra
  // pagina. Con un filtro sulle righe si cercano anche quelle dentro, con la loro etichetta «in O-…».
  const soloPrimoLivello = mappaGenerali.figliePerGenerale.size > 0 && generaliFilter !== "senza"
    && !debouncedSearch && statusFilter === "all" && paymentFilter === "all" && customerFilter === "all"
    && !amountMin && !amountMax && salespersonFilter === "all" && laborFilter === "all" && supplierFilter === "all"
    && focusIds === null && countActiveFilters(sidebarFilters) === 0
    && !contractDateRange.from && !contractDateRange.to && !warehouseDateRange.from && !warehouseDateRange.to
    && !expectedDateRange.from && !expectedDateRange.to && monthFilter === "all";
  const filtriLettura: OrdersReaderFilters = {
    soloPrimoLivello, generaliFilter, companyId:effectiveCompany?.id, periodIds:isYearCorrente ? listScopeIds : null, supportOrderIds:gestione?.supportOrderIds, focusIds, paymentIds, salespersonFilter, laborFilter, supplierFilter, sidebarFilters, customerFilter, debouncedSearch, statusFilter, supportStatusId, lastStatusId, hideCompleted, amountMin, amountMax, isYearCorrente, monthFilter, currentYear, hasSelectedYear, selectedYear, contractDateRange, warehouseDateRange, expectedDateRange, sortField, sortDir
  };
  const fetchOrderRows = (from: number, to: number, filtroFocus = focusIds, signal?: AbortSignal) =>
    readOrdersPage({ ...filtriLettura, focusIds: filtroFocus }, from, to, signal);

  const { data: ordersResult, isLoading: isLoadingOrders, isError: isOrdersError, isFetching: isOrdersFetching, error: ordersError, refetch: refetchOrders } = useQuery({
    queryKey: ["orders", effectiveCompany?.id, page, pageSize, soloPrimoLivello, debouncedSearch, statusFilter, paymentFilter, generaliFilter, customerFilter, yearFilter, monthFilter, amountMin, amountMax, salespersonFilter, laborFilter, supplierFilter, hideCompleted, lastStatusId, supportStatusId, contractDateRange, warehouseDateRange, expectedDateRange, sortField, sortDir, sidebarFilters, focusIds, paymentIds, listScopeIds, gestione?.supportOrderIds],
    queryFn: ({ signal }) => withAbortableClientTimeout((readSignal) =>
      fetchOrderRows((page - 1) * pageSize, page * pageSize - 1, focusIds, readSignal), "Elenco commesse", 20_000, signal),
    enabled: !!effectiveCompany?.id && viewMode === "table" && focusReady && !isLoadingStatuses && !isStatusesError,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Con ordinamento dal più recente, una pagina piena dell'anno corrente
  // è anche la prima pagina del perimetro con il pregresso.
  const puoAnticipareElenco = viewMode === "table" && isYearCorrente && scopeGroup === "all" && page === 1
    && sortField === "created_at" && sortDir === "desc" && controlFocus === "all"
    && statusFilter === "all" && paymentIds === null && generaliFilter === "all" && customerFilter === "all"
    && !searchQuery && !debouncedSearch && !hideCompleted && !amountMin && !amountMax
    && salespersonFilter === "all" && laborFilter === "all" && supplierFilter === "all"
    && countActiveFilters(sidebarFilters) === 0 && monthFilter === "all"
    && !contractDateRange.from && !contractDateRange.to && !warehouseDateRange.from && !warehouseDateRange.to
    && !expectedDateRange.from && !expectedDateRange.to;
  const {data: primaPagina} = useQuery({
    queryKey: ["orders", effectiveCompany?.id, "prima-pagina", currentYear, pageSize, soloPrimoLivello],
    enabled: !!effectiveCompany?.id && puoAnticipareElenco && !ordersResult,
    queryFn: ({ signal }) => withAbortableClientTimeout((readSignal) => readOrdersPage({
      ...filtriLettura, isYearCorrente: false, hasSelectedYear: true, selectedYear: currentYear, periodIds: null,
    }, 0, pageSize - 1, readSignal), "Prima pagina commesse", 12_000, signal),
    staleTime: 60_000,
    retry: false,
  });
  const mostraPrimaPagina = puoAnticipareElenco && !ordersResult && primaPagina?.orders.length === pageSize;
  const rawOrders = ordersResult?.orders ?? (mostraPrimaPagina ? primaPagina!.orders : EMPTY_ORDERS);
  const conteggioInAttesa = !isStatusesError && !scopeError && !isOrdersError && (mostraPrimaPagina || isOrdersFetching || !ordersResult);
  const elencoInizializzato = !!ordersResult || mostraPrimaPagina || isOrdersError || viewMode === "pipeline";
  // La pagina taglia l'elenco: una generale può stare qui e le sue commesse in un'altra pagina.
  // I totali della sua riga vogliono tutte le sue commesse, quindi quelle mancanti si leggono a parte.
  const idFiglieFuoriPagina = useMemo(() => {
    const qui = new Set(rawOrders.map((o) => o.id));
    return [...mappaGenerali.generaleDellaFiglia.entries()]
      .filter(([figlia, g]) => qui.has(g.id) && !qui.has(figlia))
      .map(([figlia]) => figlia)
      .sort();
  }, [rawOrders, mappaGenerali]);
  // Le commesse scelte possono stare in altre pagine: si leggono tutte, non solo quelle che si vedono ora.
  const { data: righeDaRaggruppare } = useQuery({
    queryKey: ["orders", "da-raggruppare", effectiveCompany?.id, daRaggruppare],
    enabled: !!effectiveCompany?.id && !!daRaggruppare,
    queryFn: async () => (await readOrdersPage(soloQuesteCommesse(effectiveCompany!.id, daRaggruppare!), 0, Infinity)).orders,
  });
  const { data: marginiFuoriPagina = [] } = useQuery({
    queryKey: ["orders-margin-fuori-pagina", effectiveCompany?.id, idFiglieFuoriPagina],
    enabled: !!effectiveCompany?.id && idFiglieFuoriPagina.length > 0 && (orderPerms.canViewMargins || orderPerms.canViewCosts),
    staleTime: 2 * 60 * 1000,
    meta: { silent: true },
    queryFn: async () => {
      const righe: OrderMarginRow[] = [];
      for (let from = 0; from < idFiglieFuoriPagina.length; from += 100) {
        const { data, error } = await supabase.from("v_ordine_marginalita")
          .select("id, preventivo_totale, consuntivo, margine, margine_perc")
          .eq("company_id", effectiveCompany!.id).in("id", idFiglieFuoriPagina.slice(from, from + 100));
        if (error) throw error;
        righe.push(...(data ?? []));
      }
      return righe;
    },
  });
  const { data: figlieFuoriPagina = EMPTY_ORDERS } = useQuery({
    queryKey: ["orders", "figlie-fuori-pagina", effectiveCompany?.id, idFiglieFuoriPagina],
    enabled: !!effectiveCompany?.id && idFiglieFuoriPagina.length > 0,
    staleTime: 60_000,
    meta: { silent: true },
    queryFn: async () => (await readOrdersPage(soloQuesteCommesse(effectiveCompany!.id, idFiglieFuoriPagina), 0, Infinity)).orders,
  });
  const totalCount = ordersResult?.totalCount ?? 0;
  const isOrdersLoading = !!effectiveCompany?.id && !isOrdersError && !mostraPrimaPagina && (isLoadingOrders || !ordersResult || !focusReady);

  const { data: availableYears = [] } = useQuery({
    queryKey: ["orders-available-years", effectiveCompany?.id],
    queryFn: async () => {
      const currentYear = new Date().getFullYear();
      if (!effectiveCompany?.id) return [currentYear];
      const { data, error } = await supabase
        .from("orders")
        .select("created_at")
        .eq("company_id", effectiveCompany.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      // Solo anni con commesse VERE (+ il corrente come paracadute a DB vuoto).
      // Prima il set veniva seminato con anno-1 e anno+1 a prescindere: nel
      // menu compariva un "2027" che aprendo mostrava una lista vuota.
      const years = new Set<number>([currentYear]);
      (data || []).forEach((row) => {
        if (!row.created_at) return;
        const year = new Date(row.created_at).getFullYear();
        if (!Number.isNaN(year)) years.add(year);
      });
      return Array.from(years).sort((a, b) => b - a);
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60 * 1000,
  });

  const [compareChart, setCompareChart] = useState(false);
  // Il periodo del confronto resta stabile fino al cambio di giorno locale.
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const comparisonYear = isYearCorrente ? currentYear : hasSelectedYear ? selectedYear! : NaN;
  const comparisonPeriod = useMemo(
    () => annualComparisonPeriod(comparisonYear, new Date(todayStart)),
    [comparisonYear, todayStart],
  );
  const comparisonEnabled = compareChart && !!comparisonPeriod;
  const {data: previousChartOrders = [], isPending: comparisonPending, isError: comparisonError, refetch: retryComparison} = useQuery({
    queryKey: ["orders-monthly-sales-chart", "comparison-v1", effectiveCompany?.id, comparisonPeriod?.previousFrom.toISOString(), comparisonPeriod?.previousTo.toISOString()],
    enabled: !!effectiveCompany?.id && elencoInizializzato && !isMobile && analisiAperta && orderPerms.canViewOrderAmounts && comparisonEnabled,
    queryFn: ({signal}) => withAbortableClientTimeout(async(readSignal) => {
      if (!effectiveCompany?.id || !comparisonPeriod) return [];
      const query = supabase.from("orders").select(`
        id, created_at, total_amount, vat_rate, vat_breakdown, payment_type, financing_cost,
        deposit_amount, deposit_paid, deposit_2_amount, deposit_2_paid,
        balance_amount, balance_paid, financing_amount, financing_paid,
        installments:order_installments(position, type, amount, is_paid, paid_date, expected_date, fattura:documenti_fiscali(id, importo_pagato)),
        variazioni:ordini_variazione(status, impatto_economico, offline_signed_on, firmato_il, approval_recorded_at, richiesto_il, created_at)
      `).eq("company_id", effectiveCompany.id).is("deleted_at", null)
        .gte("created_at", comparisonPeriod.previousFrom.toISOString())
        .lt("created_at", comparisonPeriod.previousTo.toISOString());
      return leggiModalitaCommesse(effectiveCompany.id, await readAllOrderRows((from,to) => query.order("created_at", {ascending:true}).order("id").range(from,to).abortSignal(readSignal)), readSignal);
    }, "Andamento commesse", 20_000, signal),
    staleTime: 5 * 60 * 1000,
  });

  // Il grafico e il riepilogo condividono le righe finanziarie già lette.
  // La serie limita i mesi in fase di aggregazione.
  const monthlyOrders = scopeOrders;
  const isLoadingMonthlyOrders = !elencoInizializzato || !gestione;
  const isMonthlyOrdersError = isStatusesError || errorePerimetro;

  const {data: allOrdersForPipeline = [], isPending: pipelinePending, isFetching: pipelineFetching, isError: pipelineError, refetch: retryPipeline} = useQuery({
    queryKey: ["orders-pipeline", effectiveCompany?.id, filterReaderKey(), soloPrimoLivello, idsPipeline, sortField, sortDir],
    enabled: !!effectiveCompany?.id && viewMode === "pipeline" && focusReady && !archivioTabella.caricamento && !archivioTabella.errore && !isLoadingStatuses && !isStatusesError,
    queryFn: ({ signal }) => withAbortableClientTimeout(async (readSignal) => {
      const ids = idsPipeline && focusIds ? idsPipeline.filter(id => focusIds.includes(id)) : idsPipeline ?? focusIds;
      if (ids?.length === 0) return [];
      return (await fetchOrderRows(0, Infinity, ids, readSignal)).orders;
    }, "Pipeline commesse", 20_000, signal),
    staleTime: 3 * 60 * 1000,
  });
  const conteggioNonDisponibile = isStatusesError || scopeError || (viewMode === "pipeline" ? pipelineError || !!archivioTabella.errore : isOrdersError);
  const conteggioFiltri = conteggioNonDisponibile ? null : viewMode === "pipeline"
    ? (pipelinePending || pipelineFetching ? null : allOrdersForPipeline.length)
    : (conteggioInAttesa ? null : totalCount);

  const { data: globalStats, isLoading: isLoadingGlobalStats, isError: erroreRiepilogo } = useQuery({
    queryKey: ["orders-global-stats", "riepilogo-v1", effectiveCompany?.id, yearFilter, currentYear, lastStatusId, supportStatusId, gestioneResultAt, generaliConfigurate],
    queryFn: ({signal}) => withAbortableClientTimeout(async (readSignal) => {
      if (!effectiveCompany?.id || !gestione) throw new Error("Perimetro commesse non disponibile.");
      const { rows } = gestione;
      const ticketIds = new Set(gestione.ticketIds);
      const [generaliIds, { incassi: incassiUnita, permute: permuteUnita, statoVendita }] = await Promise.all([
        generaliConfigurate ? leggiIdGenerali(effectiveCompany.id) : [],
        generaliConfigurate ? leggiMovimentiUnita(effectiveCompany.id) : { incassi: undefined, permute: undefined, statoVendita: undefined },
      ]);
      readSignal.throwIfAborted();
      const generali = new Set(generaliIds);
      // Nemmeno le unità ancora in vendita: sono appartamenti da vendere, non lavori né crediti
      // (44 unità di URBAN VISION contavano come 44 contratti firmati da incassare, 14/11).
      const righeCheContano = generali.size
        ? rows.filter(order => !generali.has(order.id) && !unitaInVendita(statoVendita?.get(order.id)))
        : rows;
      const annualRows = isYearCorrente ? righeCheContano.filter(order => orderYear(order) === currentYear) : righeCheContano;
      const previousRows = isYearCorrente ? righeCheContano.filter(order => orderYear(order) < currentYear) : [];
      const annual = orderEconomics(annualRows, incassiUnita, permuteUnita);
      const annualVat = netOrderTotals(annualRows.map(order => ({ ...orderEconomics([order], incassiUnita, permuteUnita), vatRate: order.vat_rate })));
      const previous = orderEconomics(previousRows, incassiUnita, permuteUnita);
      const previousReasons = Object.fromEntries(previousRows.map(order => [order.id,previousOrderReasons(order,currentYear,lastStatusId,supportStatusId,ticketIds)]));
      const reasons = {work:0,support:0,payment:0};
      Object.values(previousReasons).forEach(values => {
        if (values.includes("Lavori aperti")) reasons.work++;
        if (values.includes("Assistenza aperta")) reasons.support++;
        if (values.includes("Saldo da incassare")) reasons.payment++;
      });
      const totalGross = annual.sold;
      const collected = annual.collected;
      const pending = annual.pending;
      let countAssistenza = 0;
      let countCompletati = 0;
      for (const o of righeCheContano) {
        if (o.current_status_id && supportStatusId && o.current_status_id === supportStatusId) countAssistenza++;
        else if (o.current_status_id && lastStatusId && o.current_status_id === lastStatusId) countCompletati++;
      }
      const countDaCompletare = righeCheContano.length - countAssistenza - countCompletati;
      const unitaInVenditaIds = [...(statoVendita?.entries() ?? [])].filter(([, v]) => unitaInVendita(v)).map(([id]) => id);
      return { annualVat, annualIds: annualRows.map((order) => order.id), totalOrders: righeCheContano.length, totalGross, collected, pending, countAssistenza, countCompletati, countDaCompletare, scopeRows: rows, annual, previous, reasons, previousReasons, generaliIds, unitaInVenditaIds };
    }, "Riepilogo commesse", 20_000, signal),
    enabled: !!gestione && elencoInizializzato,
    staleTime: 5 * 60 * 1000,
  });

  const isGlobalStatsError = errorePerimetro || erroreRiepilogo;

  // Batch queries for cost calculations — use rawOrders IDs to avoid circular dep with salespeopleMap
  const orderIds = useMemo(() => rawOrders.map(o => o.id), [rawOrders]);

  // Materiali, personale, squadre e venditori delle commesse della pagina, e i
  // fornitori dei materiali, in una lettura sola (23/10/2026): erano cinque
  // richieste, ognuna a ripreparare le regole di accesso della sua tabella.
  // Stesse colonne di prima: il resto della pagina non cambia.
  const { data: dettagli } = useQuery({
    queryKey: ["elenco-commesse-dettagli", effectiveCompany?.id, orderIds],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("elenco_commesse_dettagli", { p_order_ids: orderIds });
      if (error) throw error;
      return data as {
        materiali: Array<{ order_id: string; purchase_price: number | null; quantity: number | null; vat_rate: number | null; supplier_id: string | null }>;
        personale: Array<{ order_id: string; total_cost: number | null; employee_id: string | null; employee: { id: string; first_name: string; last_name: string } | null }>;
        squadre: Array<{ order_id: string; total_cost: number | null; vat_rate: number | null; external_team_id: string | null; external_team: { id: string; name: string } | null }>;
        venditori: Array<{ order_id: string; commission_amount: number | null; deduction_amount: number | null; salesperson_id: string | null; salesperson: { id: string; first_name: string; last_name: string } | null }>;
        fornitori: Array<{ id: string; name: string }>;
      };
    },
    enabled: orderIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
  const itemCosts = useMemo(() => dettagli?.materiali ?? [], [dettagli]);
  const employeeCosts = useMemo(() => dettagli?.personale ?? [], [dettagli]);
  const externalTeamCosts = useMemo(() => dettagli?.squadre ?? [], [dettagli]);
  const salespeopleData = useMemo(() => dettagli?.venditori ?? [], [dettagli]);

  // Build name maps
  const salespeopleMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const sp of salespeopleData) {
      const p = sp.salesperson;
      if (p) {
        const name = `${p.first_name} ${p.last_name}`;
        const existing = map.get(sp.order_id) || [];
        if (!existing.includes(name)) existing.push(name);
        map.set(sp.order_id, existing);
      }
    }
    return map;
  }, [salespeopleData]);

  const laborMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of employeeCosts) {
      const emp = e.employee;
      if (emp) {
        const name = `${emp.first_name} ${emp.last_name}`;
        const existing = map.get(e.order_id) || [];
        if (!existing.includes(name)) existing.push(name);
        map.set(e.order_id, existing);
      }
    }
    for (const t of externalTeamCosts) {
      const team = t.external_team;
      if (team) {
        const existing = map.get(t.order_id) || [];
        if (!existing.includes(team.name)) existing.push(team.name);
        map.set(t.order_id, existing);
      }
    }
    return map;
  }, [employeeCosts, externalTeamCosts]);

  const supplierProfiles = useMemo(() => dettagli?.fornitori ?? [], [dettagli]);

  const supplierMap = useMemo(() => {
    const nameMap = new Map(supplierProfiles.map(s => [s.id, s.name]));
    const map = new Map<string, string[]>();
    for (const item of itemCosts) {
      if (!item.supplier_id) continue;
      const name = nameMap.get(item.supplier_id);
      if (name) {
        const existing = map.get(item.order_id) || [];
        if (!existing.includes(name)) existing.push(name);
        map.set(item.order_id, existing);
      }
    }
    return map;
  }, [itemCosts, supplierProfiles]);

  // Options are company-wide; a person on page 3 must be selectable on page 1.
  const {data: filterOptions, isError: filterOptionsError, refetch: retryFilterOptions} = useQuery({
    queryKey:["orders-filter-options",effectiveCompany?.id],
    enabled:!!effectiveCompany?.id && sidebarOpen,
    staleTime:5 * 60 * 1000,
    queryFn:async () => {
      const [salespeople,employees,teams,suppliers] = await Promise.all([
        readAllOrderRows((from,to) => supabase.from("salespeople").select("id, first_name, last_name").eq("company_id",effectiveCompany!.id).order("id").range(from,to)),
        readAllOrderRows((from,to) => supabase.from("employees").select("id, first_name, last_name").eq("company_id",effectiveCompany!.id).order("id").range(from,to)),
        readAllOrderRows((from,to) => supabase.from("external_teams").select("id, name").eq("company_id",effectiveCompany!.id).order("id").range(from,to)),
        readAllOrderRows((from,to) => supabase.from("suppliers").select("id, name").eq("company_id",effectiveCompany!.id).order("id").range(from,to)),
      ]);
      const byName = (a:{name:string},b:{name:string}) => a.name.localeCompare(b.name,"it");
      return {
        salespeople:salespeople.map(person=>({id:person.id,name:`${person.first_name} ${person.last_name}`})).sort(byName),
        labor:[...employees.map(person=>({id:`emp-${person.id}`,name:`${person.first_name} ${person.last_name}`})),...teams.map(team=>({id:`team-${team.id}`,name:team.name}))].sort(byName),
        suppliers:suppliers.map(supplier=>({id:supplier.id,name:supplier.name})).sort(byName),
      };
    },
  });
  const uniqueSalespeople = filterOptions?.salespeople ?? [];
  const uniqueLabor = filterOptions?.labor ?? [];
  const uniqueSuppliers = filterOptions?.suppliers ?? [];

  const orders = rawOrders;

  // Column visibility state
  const OPTIONAL_COLUMNS = [
    { key: "date", label: "Data Commessa" },
    { key: "pipeline", label: "Pipeline" },
    { key: "customer", label: "Cliente" },
    { key: "totalIvato", label: "Tot. Ivato" },
    { key: "imponibile", label: "Imponibile" },
    { key: "collected", label: "Incassato" },
    { key: "due", label: "Da Ricevere" },
    { key: "variableCosts", label: "Costi Variabili" },
    { key: "margin", label: "Margine" },
    { key: "deposit", label: "Acconti" },
    { key: "balance", label: "Saldo" },
    { key: "payments", label: "Pagamenti" },
    { key: "salesperson", label: "Venditore" },
    { key: "labor", label: "Manodopera" },
    { key: "supplier", label: "Fornitore" },
    { key: "expected_date", label: "Data Posa" },
    { key: "warehouse_date", label: "Arrivo Merce" },
    { key: "work_start", label: "Inizio Lavori" },
    { key: "work_end", label: "Fine Lavori" },
    { key: "payment_type", label: "Tipo Pagamento" },
  ] as const;

  const DEFAULT_COLUMNS = new Set(["pipeline", "date", "customer", "totalIvato", "imponibile", "collected", "due", "variableCosts", "payments"]);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("orders-visible-columns-v3");
      if (!saved) {
        const precedenti = localStorage.getItem("orders-visible-columns-v2");
        if (precedenti) return new Set(["pipeline", ...JSON.parse(precedenti)]);
      }
      if (saved) return new Set(JSON.parse(saved));
    } catch { /* storage non disponibile — silenzioso */ }
    return new Set(DEFAULT_COLUMNS);
  });

  // ── Visibilità finanziaria: nasconde colonne/KPI monetari per chi non è
  // autorizzato. Importi→canViewOrderAmounts, costi→canViewCosts, margine→canViewMargins.
  const AMOUNT_COL_KEYS = new Set(["totalIvato", "imponibile", "collected", "due", "deposit", "balance", "payments"]);
  const COST_COL_KEYS = new Set(["variableCosts", "labor"]);
  const isColumnAllowed = (key: string) =>
    (!AMOUNT_COL_KEYS.has(key) || orderPerms.canViewOrderAmounts) &&
    (!COST_COL_KEYS.has(key) || orderPerms.canViewCosts) &&
    (key !== "margin" || orderPerms.canViewMargins);

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem("orders-visible-columns-v3", JSON.stringify([...next])); } catch { /* Safari Private Browsing */ }
      return next;
    });
  };

  // Snapshot economico canonico per la pagina corrente. "marginReliable"
  // descrive la completezza minima del dato, non se il margine e' positivo.
  const orderCostsMap = useMemo(() => {
    const map = new Map<string, {
      variableCosts: number;
      grossMargin: number;
      marginPercent: number;
      marginReliable: boolean;
    }>();

    for (const row of [...(scopeMargins ?? []), ...marginiFuoriPagina]) {
      if (!row.id) continue;
      const variableCosts = Number(row.consuntivo || 0);
      map.set(row.id, {
        variableCosts,
        grossMargin: Number(row.margine || 0),
        marginPercent: Number(row.margine_perc || 0),
        marginReliable: orderMarginKind(row) !== "missing_costs",
      });
    }

    return map;
  }, [scopeMargins, marginiFuoriPagina]);

  const { mutateAsync: updateOrderStatus } = useMutation({
    mutationFn: async ({ orderId, statusId }: { orderId: string; statusId: string }) => {
      const { error } = await supabase.rpc("change_order_status", {
        p_order_id: orderId,
        p_new_status_id: statusId,
        p_changed_by: user?.id || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refreshOrderScope();
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      toast({ title: "Stato aggiornato", description: "La commessa è stata spostata al nuovo stato" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare lo stato della commessa", variant: "destructive" });
    },
  });

  // Eliminazione commesse: richiede il permesso dedicato "Elimina Ordini"
  // (can_delete_orders) — prima il toggle esisteva nella dialog ma non era
  // applicato da nessuna parte.
  const canDeleteOrders = orderPerms.isAdmin || orderPerms.canDeleteOrders;
  const [trashOpen,setTrashOpen]=useState(false);
  // Creare una commessa scrive su orders: la RLS chiede can_edit_orders, che
  // in DB segue la visibilità salvo «Sola lettura». Il bottone legge lo stesso.
  const canCreateOrders = orderPerms.canEditOrders;
  const createOrdersBlockedTitle = orderPerms.solaLettura ? "Sei in sola lettura" : "Non hai il permesso di modifica";

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const companyId = effectiveCompany?.id;
      if (!companyId) throw new Error("Nessuna azienda selezionata.");
      if (!canDeleteOrders) throw new Error("Non hai il permesso di eliminare le commesse (chiedi all'amministratore).");
      return deleteOrderCascading(orderId, companyId);
    },
    onSuccess: () => {
      refreshOrderScope();
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      toast({ title: "Commessa nel cestino", description: "Puoi ripristinarla dal cestino dell’elenco commesse" });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: error instanceof Error ? error.message : "Impossibile eliminare la commessa",
        variant: "destructive",
      });
    },
  });

  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // 2026-05-27 (perfezione iter 12): Promise.allSettled invece di Promise.all.
  // PRIMA: se una sola commessa falliva (RLS, FK, network) → Promise.all
  // rigettava tutto il batch e l'utente vedeva un toast "Impossibile aggiornare
  // alcune commesse" senza sapere quali erano OK e quali no. Le commesse OK
  // erano state effettivamente aggiornate ma l'UI non lo riflette finché non
  // re-fetcha. Pessimo per bulk da 20+ righe.
  // ORA: tutte le operazioni vengono attese, poi mostro un riepilogo
  // accurato ("18 ok, 2 falliti"). Le query vengono comunque invalidate
  // così l'UI riflette esattamente lo stato server.
  const handleBulkStatusChange = async (orderIds: string[], statusId: string) => {
    setIsBulkUpdating(true);
    try {
      const results = await Promise.allSettled(
        orderIds.map((orderId) => updateOrderStatus({ orderId, statusId }))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const ok = results.length - failed;
      refreshOrderScope();
      if (failed === 0) {
        toast({
          title: "Stato aggiornato",
          description: `${ok} ordin${ok === 1 ? "e aggiornato" : "i aggiornati"}`,
        });
      } else if (ok === 0) {
        toast({
          title: "Aggiornamento fallito",
          description: `Nessuna commessa aggiornata (${failed} errori). Riprova o contatta l'assistenza.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Aggiornamento parziale",
          description: `${ok} aggiornati · ${failed} falliti. Le righe fallite restano col vecchio stato.`,
          variant: "destructive",
        });
      }
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkDelete = async (orderIds: string[]) => {
    if (!canDeleteOrders) {
      toast({ title: "Permesso mancante", description: "Non hai il permesso di eliminare le commesse (chiedi all'amministratore).", variant: "destructive" });
      return;
    }
    setIsBulkUpdating(true);
    try {
      const companyId = effectiveCompany?.id;
      if (!companyId) {
        toast({ title: "Errore", description: "Nessuna azienda selezionata.", variant: "destructive" });
        return;
      }
      const results = await Promise.allSettled(
        orderIds.map((orderId) => deleteOrderCascading(orderId, companyId))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const ok = results.length - failed;
      refreshOrderScope();
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      if (failed === 0) {
        toast({
          title: "Commesse nel cestino",
          description: `${ok} commess${ok === 1 ? "a spostata" : "e spostate"} nel cestino`,
        });
      } else if (ok === 0) {
        toast({
          title: "Eliminazione fallita",
          description: `Nessuna commessa spostata nel cestino. ${(results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined)?.reason?.message ?? "Verifica permessi o riprova."}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Eliminazione parziale",
          description: `${ok} nel cestino · ${failed} non spostati (es. ${(results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined)?.reason?.message ?? "permessi"}). Le righe non spostate sono ancora presenti.`,
          variant: "destructive",
        });
      }
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleStatusChange = async (orderId: string, newStatusId: string) => {
    await updateOrderStatus({ orderId, statusId: newStatusId });
  };

  const hasDateFilters = contractDateRange.from || contractDateRange.to ||
    warehouseDateRange.from || warehouseDateRange.to ||
    expectedDateRange.from || expectedDateRange.to;

  const hasAnyFilter = !!(hasDateFilters || searchQuery || statusFilter !== "all" ||
    paymentFilter !== "all" || generaliFilter !== "all" || customerFilter !== "all" || yearFilter !== "corrente" || amountMin || amountMax ||
    salespersonFilter !== "all" || laborFilter !== "all" || supplierFilter !== "all" ||
    controlFocus !== "all" || (isYearCorrente && scopeGroup !== "all") || hideCompleted || countActiveFilters(sidebarFilters) > 0);

  // 2026-05-27 (perfezione iter 11): dropdown clienti server-side.
  // PRIMA: uniqueCustomers derivato da `orders` (= 20 righe pagina corrente).
  // Se l'utente era a pagina 1 e cercava un cliente con commessa a pagina 5,
  // il dropdown non lo elencava → impossibile filtrare per quel cliente.
  // ORA: query separata che restituisce TUTTI i clienti con almeno una
  // commessa per questa company. Limitato a 500 (limite ragionevole per
  // un dropdown — oltre serve search server-side, da fare se serve).
  // Cache 5 min: i clienti cambiano raramente, non vale invalidare ad ogni
  // create/delete commessa.
  const { data: allCustomersWithOrders = [] } = useQuery({
    queryKey: ["orders-customer-options", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("customer_id, customer:profiles!orders_customer_id_fkey(first_name, last_name)")
        .eq("company_id", effectiveCompany!.id)
        .is("deleted_at", null)
        .not("customer_id", "is", null)
        .limit(2000);
      if (error) throw error;
      const map = new Map<string, { id: string; name: string }>();
      (data ?? []).forEach((row) => {
        if (row.customer_id && row.customer && !map.has(row.customer_id)) {
          map.set(row.customer_id, {
            id: row.customer_id,
            name: `${row.customer.first_name ?? ""} ${row.customer.last_name ?? ""}`.trim() || "Senza nome",
          });
        }
      });
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  // Mantieni in dropdown il cliente attualmente selezionato anche se la
  // query non l'ha (ancora) caricato — evita "Seleziona cliente" che
  // svuota il filtro mentre l'utente sta navigando.
  const uniqueCustomers = useMemo(() => {
    if (allCustomersWithOrders.length > 0) return allCustomersWithOrders;
    // Fallback (mentre carica o se 0 commesse): deriva dalla pagina corrente.
    const map = new Map<string, { id: string; name: string }>();
    orders.forEach((order) => {
      if (order.customer && order.customer_id) {
        map.set(order.customer_id, {
          id: order.customer_id,
          name: `${order.customer.first_name} ${order.customer.last_name}`,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allCustomersWithOrders, orders]);

  const clearAllFilters = () => {
    setSidebarFilters({...INITIAL_FILTER_STATE});
    setSearchQuery("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setGeneraliFilter("all");
    setCustomerFilter("all");
    setYearFilter("corrente");
    setAmountMin("");
    setAmountMax("");
    setMonthFilter("all");
    setSalespersonFilter("all");
    setLaborFilter("all");
    setSupplierFilter("all");
    setControlFocus("all");
    setScopeGroup("all");
    setHideCompleted(false);
    setContractDateRange({ from: undefined, to: undefined });
    setWarehouseDateRange({ from: undefined, to: undefined });
    setExpectedDateRange({ from: undefined, to: undefined });
    setPage(1);
  };

  const handleMonthChange = (value: string) => {
    setURLParams({monthFilter:value,contractFrom:"",contractTo:""});
    setPage(1);
  };
  const handleYearChange = (value: string) => {
    setYearFilter(value);
    setScopeGroup("all");
    setPage(1);
  };

  // Reset page to 1 when any filter changes
  const filterKey = `${searchQuery}|${statusFilter}|${paymentFilter}|${generaliFilter}|${customerFilter}|${yearFilter}|${amountMin}|${amountMax}|${monthFilter}|${salespersonFilter}|${laborFilter}|${supplierFilter}|${controlFocus}|${scopeGroup}|${hideCompleted}|${contractDateRange.from}|${contractDateRange.to}|${warehouseDateRange.from}|${warehouseDateRange.to}|${expectedDateRange.from}|${expectedDateRange.to}|${JSON.stringify(sidebarFilters)}`;
  // Il reset e' intenzionale: evita di lasciare l'utente su una pagina vuota
  // quando un filtro server-side riduce il numero totale di risultati.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1); }, [filterKey]);

  // Server-side pagination
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const showingFrom = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, totalCount);

  // KPI card usa globalStats (ignora filtri) per mostrare SEMPRE i totali reali.
  // Le card sono solo informative: i filtri restano nei controlli dedicati.
  const stats = useMemo(() => ({
    totalOrders: globalStats?.totalOrders ?? 0,
    totalGross: globalStats?.totalGross ?? 0,
    collected: globalStats?.collected ?? 0,
    pending: globalStats?.pending ?? 0,
    countAssistenza: globalStats?.countAssistenza ?? 0,
    countCompletati: globalStats?.countCompletati ?? 0,
    countDaCompletare: globalStats?.countDaCompletare ?? 0,
    averageGross: (globalStats?.annual.count ?? 0) > 0
      ? (globalStats?.totalGross ?? 0) / (globalStats?.annual.count ?? 1)
      : 0,
  }), [globalStats]);

  // Da telefono la parte blu è il riassunto dei soldi. Fatturato: il registro vendite, come nel cruscotto.
  const { data: kpiFatturazione, isLoading: billingLoading } = useDashboardBillingKPI(
    effectiveCompany?.id ?? null, elencoInizializzato && isNative && orderPerms.canViewBilling && sceltaRiepilogo.riquadri.includes("fatturato"));
  const costiSostenuti = useMemo(() => {
    if (!scopeMargins || !globalStats) return null;
    const delPeriodo = new Set(globalStats.annualIds);
    return scopeMargins.reduce((somma, riga) => (riga.id && delPeriodo.has(riga.id) ? somma + Number(riga.consuntivo ?? 0) : somma), 0);
  }, [scopeMargins, globalStats]);

  const visibleOrders = orders;
  const visibleTotalCount = totalCount;
  const visibleShowingFrom = showingFrom;
  const visibleShowingTo = showingTo;

  const monthlySalesChart = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = isYearCorrente || (hasSelectedYear && selectedYear)
        ? new Date(isYearCorrente ? currentYear : selectedYear!, index, 1)
        // dal primo del mese: a fine mese (29-31) setMonth saltava un mese e ne ripeteva un altro
        : new Date(new Date().getFullYear(), new Date().getMonth() - (11 - index), 1);
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = date.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
      return {
        key,
        mese: hasSelectedYear ? monthLabel : `${monthLabel} '${String(date.getFullYear()).slice(-2)}`,
        venduto: 0,
        incassato: 0,
        commesse: 0,
        daIncassare: 0,
      };
    });
    const byKey = new Map(months.map((month) => [month.key, month]));

    monthlyOrders.forEach((order) => {
      if (!order.created_at) return;
      // Un'unità ancora in vendita non è venduto: il suo listino resta fuori dal grafico.
      if (unitaInVendita(mappaGenerali.statoVenditaUnita?.get(order.id))) return;
      const date = new Date(order.created_at);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const month = byKey.get(key);
      if (!month) return;
      month.commesse += 1;
      month.venduto += getGrossOrderAmount(order);
      month.incassato += getAmountCollected(order);
      month.daIncassare += getAmountDue(order);
    });

    return months;
  }, [monthlyOrders, hasSelectedYear, selectedYear, isYearCorrente, currentYear, mappaGenerali]);

  const chartWithComparison = useMemo(() => {
    if (!comparisonEnabled || !comparisonPeriod || comparisonPending || comparisonError) return monthlySalesChart;
    const values = (rows: ReadonlyArray<OrderPaymentDetails & Pick<OrderWithDetails, "id" | "created_at">>) =>
      rows.filter(order => !unitaInVendita(mappaGenerali.statoVenditaUnita?.get(order.id))).map(order => ({
        created_at: order.created_at,
        venduto: getGrossOrderAmount(order),
        incassato: getAmountCollected(order),
        daIncassare: getAmountDue(order),
      }));
    return comparableOrderMonths(monthlySalesChart, values(monthlyOrders), values(previousChartOrders), comparisonPeriod);
  }, [comparisonEnabled, comparisonPeriod, comparisonPending, comparisonError, monthlySalesChart, monthlyOrders, previousChartOrders, mappaGenerali]);

  const monthlySalesTotals = useMemo(() => {
    return monthlySalesChart.reduce(
      (acc, month) => ({
        venduto: acc.venduto + month.venduto,
        incassato: acc.incassato + month.incassato,
        commesse: acc.commesse + month.commesse,
      }),
      { venduto: 0, incassato: 0, commesse: 0 }
    );
  }, [monthlySalesChart]);

  const monthlySalesAverages = useMemo(() => {
    const months = Math.max(1, monthlySalesChart.length);
    return {
      ordersPerMonth: (isYearCorrente || hasSelectedYear ? globalStats?.annual.count ?? 0 : monthlySalesTotals.commesse) / months,
      soldPerOrder: monthlySalesTotals.commesse > 0 ? monthlySalesTotals.venduto / monthlySalesTotals.commesse : 0,
      collectedPerMonth: (isYearCorrente || hasSelectedYear ? stats.collected : monthlySalesTotals.incassato) / months,
      pendingRatio: stats.totalGross > 0 ? (stats.pending / stats.totalGross) * 100 : 0,
    };
  }, [monthlySalesChart.length, monthlySalesTotals, stats.pending, stats.totalGross, stats.collected, isYearCorrente, hasSelectedYear, globalStats?.annual.count]);

  // Export CSV
  // M2 — Export CSV con tutti i filtri attivi (non solo i 20 della pagina corrente)
  const prepareExportData = async () => {
    if (!effectiveCompany?.id) return null;
    toast({ title: "Esportazione in corso..." });

    try {
    const allOrders = (await fetchOrderRows(0, Infinity)).orders;
    if (!allOrders.length) { toast({title:"Nessuna commessa da esportare"}); return null; }

    const exportCostsMap = new Map<string, {variableCosts:number;grossMargin:number;marginPercent:number;marginReliable:boolean}>();
    if (orderPerms.canViewMargins || orderPerms.canViewCosts) {
      const marginRows: OrderMarginRow[] = [];
      for (let from=0;from<allOrders.length;from+=100) {
        const {data,error} = await supabase.from("v_ordine_marginalita").select("id, preventivo_totale, consuntivo, margine, margine_perc")
          .eq("company_id",effectiveCompany.id).in("id",allOrders.slice(from,from+100).map(order=>order.id));
        if (error) throw error;
        marginRows.push(...(data??[]));
      }
      for (const row of marginRows || []) {
        if (!row.id) continue;
        const variableCosts = Number(row.consuntivo || 0);
        exportCostsMap.set(row.id, {
          variableCosts,
          grossMargin: Number(row.margine || 0),
          marginPercent: Number(row.margine_perc || 0),
          marginReliable: orderMarginKind(row) !== "missing_costs",
        });
      }
    }

    const columns: { key: string; label: string }[] = [
      { key: "order_code", label: "Codice Commessa" },
      { key: "customer", label: "Cliente" },
      { key: "description", label: "Descrizione" },
      { key: "total_amount", label: "Imponibile" },
      { key: "vat_amount", label: "IVA" },
      { key: "total_gross", label: "Totale Ivato" },
      { key: "collected", label: "Incassato" },
      { key: "due", label: "Da Incassare" },
      { key: "deposit_amount", label: "Acconto 1" },
      { key: "deposit_2_amount", label: "Acconto 2" },
      { key: "financing_amount", label: "Finanziamento" },
      { key: "balance_amount", label: "Saldo" },
      { key: "variable_costs", label: "Costi Diretti" },
      { key: "gross_margin", label: "Margine Diretto" },
      { key: "margin_percent", label: "Margine Diretto %" },
      { key: "economic_quality", label: "Qualita Dati Economici" },
      { key: "status", label: "Stato" },
      { key: "created_at", label: "Data Contratto" },
      { key: "warehouse_arrival_date", label: "Data Magazzino" },
      { key: "expected_date", label: "Data Posa" },
      { key: "payment_status", label: "Stato Pagamenti" },
    ];
    const financialColumns = new Set(["total_amount","vat_amount","total_gross","collected","due","deposit_amount","deposit_2_amount","financing_amount","balance_amount","payment_status"]);
    const costColumns = new Set(["variable_costs"]);
    const marginColumns = new Set(["gross_margin","margin_percent","economic_quality"]);
    const permittedColumns = columns.filter(column => (!financialColumns.has(column.key) || orderPerms.canViewOrderAmounts) &&
      (!costColumns.has(column.key) || orderPerms.canViewCosts) && (!marginColumns.has(column.key) || orderPerms.canViewMargins));
    const rows = allOrders.map((o) => {
      const pending = getPendingPayments(o);
      // Imponibile e IVA del valore pattuito (contratto più varianti), come il Totale Ivato.
      const imponibile = contrattoPattuito(o);
      const totalGross = getGrossOrderAmount(o);
      const vatAmount = Math.round((totalGross - imponibile) * 100) / 100;
      const collected = getAmountCollected(o);
      const due = getAmountDue(o);
      const costs = exportCostsMap.get(o.id);
      return {
        order_code: o.order_code || "",
        customer: o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : "",
        description: o.description,
        total_amount: String(imponibile),
        vat_amount: String(vatAmount),
        total_gross: String(totalGross),
        collected: String(collected),
        due: String(due),
        deposit_amount: String(o.deposit_amount || 0),
        deposit_2_amount: String(o.deposit_2_amount || 0),
        financing_amount: String(o.financing_amount || 0),
        balance_amount: String(o.balance_amount || 0),
        variable_costs: String(costs?.variableCosts ?? 0),
        gross_margin: costs?.marginReliable ? String(costs.grossMargin) : "",
        margin_percent: costs?.marginReliable ? `${costs.marginPercent.toFixed(1)}%` : "",
        economic_quality: costs?.marginReliable ? "Dati attendibili" : "Costi da completare",
        status: o.status?.name || "",
        created_at: o.created_at ? format(new Date(o.created_at), "dd/MM/yyyy") : "",
        warehouse_arrival_date: o.warehouse_arrival_date ? format(new Date(o.warehouse_arrival_date), "dd/MM/yyyy") : "",
        expected_date: o.expected_date ? format(new Date(o.expected_date), "dd/MM/yyyy") : "",
        payment_status: pending.length > 0 ? pending.join(", ") : "Tutto pagato",
      };
    });
    return { rows, columns:permittedColumns, count: allOrders.length };
    } catch {
      toast({title:"Esportazione non riuscita",description:"Non è stato possibile leggere tutte le commesse. Riprova.",variant:"destructive"});
      return null;
    }
  };

  const exportOrdersCSV = async () => {
    const result = await prepareExportData();
    if (!result) return;
    exportToCSV(result.rows, result.columns, `commesse-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: `CSV esportato — ${result.count} commesse` });
  };

  const exportOrdersXLSX = async () => {
    const result = await prepareExportData();
    if (!result) return;
    await exportToXLSX(result.rows, result.columns, `commesse-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: `Excel esportato — ${result.count} commesse` });
  };

  // Export PDF: tabella ordini landscape
  const exportOrdersPDF = async () => {
    const result = await prepareExportData();
    if (!result || result.count === 0) {
      toast({ title: "Nessuna commessa", description: "Non ci sono commesse da esportare.", variant: "destructive" });
      return;
    }
    try {
      const jsPDFModule = await import("jspdf");
      const jsPDF = jsPDFModule.default ?? jsPDFModule.jsPDF;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text(`${effectiveCompany?.name ?? "Azienda"} — Commesse`, 40, 40);
      doc.setFontSize(9);
      doc.text(`Esportato il ${format(new Date(), "dd/MM/yyyy HH:mm")} — ${result.count} commesse`, 40, 56);

      const cols = [
        { key: "order_code", label: "Codice", w: 60 },
        { key: "customer", label: "Cliente", w: 150 },
        { key: "description", label: "Descrizione", w: 180 },
        { key: "total_gross", label: "Tot. IVA incl.", w: 70, align: "right" as const },
        { key: "status", label: "Stato", w: 80 },
        { key: "created_at", label: "Contratto", w: 70 },
        { key: "expected_date", label: "Posa", w: 70 },
        { key: "payment_status", label: "Pagamenti", w: 110 },
      ].filter(column => result.columns.some(permitted => permitted.key === column.key));
      let y = 80;
      let x = 40;

      // Header
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(40, y - 12, cols.reduce((a, c) => a + c.w, 0), 18, "F");
      cols.forEach((c) => {
        doc.text(c.label, x + 4, y);
        x += c.w;
      });
      y += 14;
      doc.setFont("helvetica", "normal");

      result.rows.forEach((row, i) => {
        if (y > 550) {
          doc.addPage();
          y = 40;
        }
        x = 40;
        if (i % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(40, y - 10, cols.reduce((a, c) => a + c.w, 0), 14, "F");
        }
        cols.forEach((c) => {
          const val = String(row[c.key as keyof typeof row] ?? "");
          const maxLen = Math.floor(c.w / 5);
          const trimmed = val.length > maxLen ? val.slice(0, maxLen - 1) + "…" : val;
          if (c.align === "right" && val) {
            const formatted = String(row[c.key as keyof typeof row] ?? "").includes(".")
              ? `€ ${Number(row[c.key as keyof typeof row]).toLocaleString("it-IT", { minimumFractionDigits: 2, useGrouping: true })}`
              : trimmed;
            doc.text(formatted, x + c.w - 4, y, { align: "right" });
          } else {
            doc.text(trimmed, x + 4, y);
          }
          x += c.w;
        });
        y += 13;
      });

      doc.save(`commesse-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: `PDF esportato — ${result.count} commesse` });
    } catch (e) {
      toast({
        title: "Errore export PDF",
        description: e instanceof Error ? e.message : "Generazione PDF fallita",
        variant: "destructive",
      });
    }
  };

  // Export PDF: una scheda completa per ogni cliente con i suoi ordini
  // Export schede clienti PDF: apre dialog con quantity selector + progress bar
  // (vedi CustomerSheetsExportDialog per il fix del bug "1000 schede").
  const openCustomerSheetsDialog = () => setCustomerSheetsOpen(true);

  // Import handler
  const importUserId = user?.id ?? null;
  const handleOrdersImport = useCallback(async (rows: Record<string, string>[]) => {
    if (!effectiveCompany?.id) return { success: 0, errors: ["Azienda non trovata"] };

    // Solo i clienti: un'email di un dipendente non può intestare la commessa.
    const { data: clienti, error: clientiErr } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Array<{ id: string; email?: string | null }> | null; error: { message: string } | null }>;
    }).rpc("get_company_customers", { p_company_id: effectiveCompany.id });
    if (clientiErr) return { success: 0, errors: [`Clienti non leggibili: ${clientiErr.message}`] };
    const clientePerEmail = new Map((clienti || []).filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id]));

    // Get default status
    const { data: defaultStatus } = await supabase
      .from("order_statuses")
      .select("id")
      .eq("company_id", effectiveCompany.id)
      .eq("is_default", true)
      .limit(1);
    const defaultStatusId = defaultStatus?.[0]?.id || null;

    // B5 — fetch codici ordine esistenti per evitare duplicati
    const { data: existingCodes } = await supabase
      .from("orders")
      .select("order_code")
      .eq("company_id", effectiveCompany.id)
      .not("order_code", "is", null);
    const existingCodeSet = new Set<string>((existingCodes || []).flatMap(r => r.order_code ? [r.order_code.trim().toLowerCase()] : []));

    let success = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const esito = commessaDaRiga(rows[i], {
          aziendaId: effectiveCompany.id,
          clientePerEmail,
          codiciEsistenti: existingCodeSet,
          statoPredefinito: defaultStatusId,
        });
        if ("errore" in esito) { errors.push(`Riga ${i + 1}: ${esito.errore}`); continue; }

        // Stessa creazione del modulo Nuova Commessa: stato, storico, rate e autore.
        const { error } = await (supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
        }).rpc("create_order_atomic", {
          p_order_data: esito.ordine,
          p_items: [],
          p_salesperson: null,
          p_user_id: importUserId,
          p_installments: esito.rate.map((r) => ({ position: r.position, label: r.label, type: r.type, amount: r.amount, is_paid: false })),
        });
        if (error) throw error;
        if (esito.codice) existingCodeSet.add(esito.codice.toLowerCase());
        success++;
      } catch (err) {
        errors.push(`Riga ${i + 1}: ${messaggioErrore(err, "Errore")}`);
      }
    }

    refreshOrderScope();
    return { success, errors };
  }, [effectiveCompany, importUserId, refreshOrderScope]);

  const hasStatsError = isStatusesError || (isGlobalStatsError && !globalStats);
  const isEconomicStatsLoading = !!effectiveCompany?.id && !hasStatsError && (
    isLoadingGlobalStats ||
    !globalStats
  );

  // Riepilogo commesse: i riquadri e il grafico li sceglie l'azienda; chi guarda vede solo quelli che i suoi permessi consentono.
  const [sceltaRiepilogoAperta, setSceltaRiepilogoAperta] = useState(false);
  const permessiRiepilogo = {
    importi: orderPerms.canViewOrderAmounts, costi: orderPerms.canViewCosts, margini: orderPerms.canViewMargins,
    fatturazione: orderPerms.canViewBilling && isNative,
    appalti: modelliGenerali.includes("appalto"), operazioni: modelliGenerali.includes("sviluppo") || modelliGenerali.includes("compravendita"),
  };
  const margineMedio = useMemo(() => directMarginSummary(scopeMargins ?? [], new Set(globalStats?.annualIds ?? [])), [scopeMargins, globalStats]);
  const annualIds = globalStats?.annualIds;
  const scopeRows = globalStats?.scopeRows;
  const margineConseguito = useMemo(() => {
    const ids = new Set(annualIds ?? []);
    const completate = new Set((scopeRows ?? []).filter(order => ids.has(order.id) && !!lastStatusId && order.current_status_id === lastStatusId).map(order => order.id));
    return directMarginSummary(scopeMargins ?? [], completate);
  }, [scopeMargins, annualIds, scopeRows, lastStatusId]);
  const costiDaPagare = useOrdersPayables(effectiveCompany?.id, globalStats?.annualIds ?? [], orderPerms.canViewCosts && !!globalStats && !isGlobalStatsError && !isStatusesError);
  const riquadriRiepilogo = groupedSummaryCards(riquadriVisibili(sceltaRiepilogo.riquadri, permessiRiepilogo));
  // I numeri delle generali li dà il server, già filtrati per permesso: si chiedono solo se un riquadro li usa.
  const { data: numeriGenerali, isPending: numeriGeneraliPending } = useCruscottoGenerali(elencoInizializzato && usaGenerali(riquadriRiepilogo));
  const nettoIncassato = globalStats?.annualVat?.collected;
  const nettoResiduo = globalStats?.annualVat?.pending;
  const quotaIncassata = nettoIncassato != null && nettoResiduo != null && nettoIncassato + nettoResiduo > 0 ? Math.max(0, nettoIncassato) / (Math.max(0, nettoIncassato) + Math.max(0, nettoResiduo)) * 100 : null;
  const incidenzaCosti = isYearCorrente && permessiRiepilogo.fatturazione && costiSostenuti != null && kpiFatturazione?.fatturato_ytd && kpiFatturazione.fatturato_ytd > 0 ? costiSostenuti / kpiFatturazione.fatturato_ytd * 100 : null;
  const valoriRiepilogo = useMemo(() => {
    const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });
    const periodo = isYearCorrente ? String(currentYear) : "del periodo";
    const generali = new Set(globalStats?.generaliIds ?? []);
    const righe = (globalStats?.scopeRows ?? []).filter((o) => !generali.has(o.id));
    const ritardo = commesseInRitardo(righe, new Set([lastStatusId, supportStatusId].filter(Boolean)), new Date().toLocaleDateString("en-CA"));
    const margine = scopeMargins && globalStats ? margineDelPeriodo(scopeMargins, new Set(globalStats.annualIds)) : null;
    const soldi = (n: number | null | undefined) => (n == null ? "—" : euro(n));
    const ta = numeriGenerali?.totaleAppalti;
    const to = numeriGenerali?.totaleOperazioni;
    const quanteCommesse = isYearCorrente ? globalStats?.annual.count ?? 0 : stats.totalOrders;
    const valori: Record<RiquadroRiepilogo, { titolo: string; valore: string; nota: string; icona: typeof Euro }> = {
      commesse: { titolo: isYearCorrente ? `Commesse ${currentYear}` : "Commesse del periodo", valore: String(quanteCommesse), icona: ShoppingBag,
        nota: `media mese ${monthlySalesAverages.ordersPerMonth.toLocaleString("it-IT", { maximumFractionDigits: 1 })}` },
      venduto: { titolo: `Venduto · contratti ${periodo}`, valore: soldi(globalStats?.annualVat?.sold), icona: Euro, nota: `Imponibile · ${quanteCommesse} commesse` },
      incassato: { titolo: `Incassi commesse ${periodo}`, valore: soldi(globalStats?.annualVat?.collected), icona: TrendingUp, nota: "Già incassato · imponibile" },
      da_incassare: { titolo: `Da incassare ${isYearCorrente ? currentYear : "periodo"}`, valore: euro(stats.pending), icona: AlertCircle,
        nota: "residuo sulle commesse" },
      ticket_medio: { titolo: "Valore medio commessa", valore: euro(stats.averageGross), icona: Coins, nota: `su ${quanteCommesse} commesse · IVA inclusa` },
      costi: { titolo: `Costi commesse ${periodo}`, valore: costiSostenuti == null ? "—" : euro(costiSostenuti), icona: Wallet, nota: "Registrati sulle commesse · imponibile" },
      margine: { titolo: `Margine ${periodo}`, valore: margine ? euro(margine.margine) : "—", icona: Percent,
        nota: !margine ? "" : `${margine.percentuale == null ? "—" : `${margine.percentuale.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`} su ${margine.conCosti} con costi${margine.senzaCosti ? ` · ${margine.senzaCosti} senza` : ""}` },
      aperte: { titolo: "Commesse aperte", valore: String(stats.countDaCompletare), icona: FolderOpen, nota: "anche degli anni prima" },
      in_ritardo: { titolo: "In ritardo", valore: String(ritardo), icona: Clock, nota: "posa prevista già passata" },
      assistenza: { titolo: "In assistenza", valore: String(stats.countAssistenza), icona: Wrench, nota: "nella fase di assistenza" },
      completate: { titolo: "Completate", valore: String(stats.countCompletati), icona: CheckCircle2, nota: "arrivate all'ultima fase" },
      pregresso: { titolo: "Pregresso da gestire", valore: String(globalStats?.previous.count ?? 0), icona: History,
        nota: `${globalStats?.reasons.work ?? 0} lavori · ${globalStats?.reasons.support ?? 0} assistenze · ${globalStats?.reasons.payment ?? 0} saldi` },
      fatturato: { titolo: `Fatturato · fatture ${currentYear}`, valore: kpiFatturazione?.fatturato_ytd == null ? "—" : euro(kpiFatturazione.fatturato_ytd), icona: Receipt, nota: "Fatture emesse · IVA esclusa · tutta l’azienda" },
      appalti_valore: { titolo: "Valore appalti in corso", valore: soldi(ta?.valore), icona: Landmark,
        nota: `${ta?.appalti ?? 0} ${ta?.appalti === 1 ? "appalto" : "appalti"} · eseguito ${soldi(ta?.eseguito)}` },
      appalti_da_eseguire: { titolo: "Lavori da eseguire", valore: soldi(ta?.daEseguire), icona: Hammer, nota: `su ${soldi(ta?.valore)} di appalti` },
      appalti_da_incassare: { titolo: "Da incassare sugli appalti", valore: soldi(ta?.daIncassare), icona: AlertCircle, nota: `fatturato ${soldi(ta?.fatturato)}` },
      appalti_margine: { titolo: "Margine a finire appalti", valore: soldi(ta?.margineAFinire), icona: Percent, nota: `stima su ${ta?.conPiano ?? 0} appalti con il piano` },
      unita_vendute: { titolo: "Unità vendute", valore: to ? `${to.vendute} su ${to.unita}` : "—", icona: Building2, nota: `${to?.operazioni ?? 0} ${to?.operazioni === 1 ? "operazione" : "operazioni"} in corso` },
      unita_libere: { titolo: "Unità libere", valore: String(to?.libere ?? 0), icona: Building2, nota: `su ${to?.unita ?? 0} unità` },
      operazioni_venduto: { titolo: "Venduto unità", valore: soldi(to?.venduto), icona: Euro, nota: `incassato ${soldi(to?.incassato)}` },
      operazioni_incassato: { titolo: "Incassato unità", valore: soldi(to?.incassato), icona: TrendingUp,
        nota: to?.venduto && to.incassato != null ? `${Math.round((to.incassato / to.venduto) * 100)}% del venduto` : "caparre, acconti e saldi" },
      capitale_impegnato: { titolo: "Capitale impegnato", valore: soldi(to?.capitaleImpegnato), icona: Wallet, nota: `costi meno incassi · ${to?.conPiano ?? 0} con il piano` },
      operazioni_margine: { titolo: "Margine a finire operazioni", valore: soldi(to?.margineAFinire), icona: Percent, nota: `stima su ${to?.conPiano ?? 0} operazioni con il piano` },
    };
    return valori;
  }, [globalStats, stats, isYearCorrente, currentYear, lastStatusId, supportStatusId, scopeMargins, costiSostenuti, monthlySalesAverages, numeriGenerali, kpiFatturazione]);

  const barraBacheca = viewMode === "pipeline" && focusReady && !isStatusesError && !pipelinePending && !pipelineError && !scopeError;
  const filtriCommesse = (<OrdersFilters panel={barraBacheca}
            trailingControls={viewMode === "table" ? (
              <div role="group" aria-label="Opzioni tabella commesse" className="hidden items-center shrink-0 gap-1.5 sm:flex">
                <Select value={sortField} onValueChange={(v) => { setSortField(v as typeof sortField); setPage(1); }}>
                  <SelectTrigger aria-label="Ordina commesse per" title="Ordina per" className="h-8 w-[124px] px-2 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Data creazione</SelectItem>
                    <SelectItem value="order_code">Codice commessa</SelectItem>
                    <SelectItem value="description">Descrizione</SelectItem>
                    <SelectItem value="total_amount">Importo imponibile</SelectItem>
                    <SelectItem value="expected_date">Data posa prevista</SelectItem>
                    <SelectItem value="warehouse_arrival_date">Arrivo merce</SelectItem>
                    <SelectItem value="work_start_date">Inizio lavori</SelectItem>
                    <SelectItem value="work_end_date">Fine lavori</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortDir} onValueChange={(v) => { setSortDir(v as "asc" | "desc"); setPage(1); }}>
                  <SelectTrigger aria-label="Direzione ordinamento" className="h-8 w-[98px] px-2 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">{
                      ["created_at","total_amount","expected_date","warehouse_arrival_date","work_start_date","work_end_date"].includes(sortField)
                        ? "↓ Recenti"
                        : "↓ Z → A"
                    }</SelectItem>
                    <SelectItem value="asc">{
                      ["created_at","total_amount","expected_date","warehouse_arrival_date","work_start_date","work_end_date"].includes(sortField)
                        ? "↑ Vecchi"
                        : "↑ A → Z"
                    }</SelectItem>
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-8 px-0 text-xs" title="Colonne visibili" aria-label="Colonne visibili">
                      <Columns className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[280px] p-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Colonne visibili</p>
                        <button
                          type="button"
                          onClick={() => {
                            setVisibleColumns(new Set(DEFAULT_COLUMNS));
                            try { localStorage.setItem("orders-visible-columns-v3", JSON.stringify([...DEFAULT_COLUMNS])); } catch { /* Storage non disponibile: ripristino comunque la vista. */ }
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground underline"
                        >
                          Ripristina
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1 max-h-[320px] overflow-y-auto">
                        {OPTIONAL_COLUMNS.filter(col => isColumnAllowed(col.key)).map(col => (
                          <label
                            key={col.key}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer transition-colors"
                          >
                            <Checkbox
                              checked={visibleColumns.has(col.key)}
                              onCheckedChange={() => toggleColumn(col.key)}
                              className="shrink-0"
                            />
                            <span className="text-xs truncate">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                {(sortField !== "created_at" || sortDir !== "desc") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="col-span-2 h-8 text-xs sm:col-span-1"
                    onClick={() => { setSortField("created_at"); setSortDir("desc"); setPage(1); }}
                  >
                    Ripristina
                  </Button>
                )}
              </div>
            ) : undefined}
            summary={
              <span role="status" aria-live="polite" title="Risultati con i filtri attuali">
                <strong className="tabular-nums text-slate-900">{conteggioFiltri ?? (conteggioNonDisponibile ? "—" : "…")}</strong> risultati
              </span>
            }
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            statuses={statuses}
            yearFilter={yearFilter}
            onYearFilterChange={handleYearChange}
            availableYears={availableYears}
            paymentFilter={paymentFilter}
            onPaymentFilterChange={setPaymentFilter}
            generaliFilter={mappaGenerali.figliePerGenerale.size > 0 ? generaliFilter : undefined}
            onGeneraliFilterChange={setGeneraliFilter}
            monthFilter={monthFilter}
            onMonthFilterChange={handleMonthChange}
            hasAnyFilter={hasAnyFilter}
            onClearAllFilters={clearAllFilters}
            hideCompleted={hideCompleted && statusFilter === "all"}
            onHideCompletedChange={(value) => {
              setHideCompleted(value);
              if (value) setStatusFilter("all");
            }}
          />);
  return (
    // pb-20 rimosso: la bottom nav mobile non è più overlay (è sotto il main) — erano 160px di vuoto
    <div className="orders-workspace flex flex-col gap-3">
      {orderPerms.canEditSettingsOrders && effectiveCompany?.id && <RiepilogoCommesseScelta open={sceltaRiepilogoAperta}
        onOpenChange={setSceltaRiepilogoAperta} companyId={effectiveCompany.id} scelta={sceltaRiepilogo}
        gruppi={{ appalti: modelliGenerali.includes("appalto"), operazioni: modelliGenerali.includes("sviluppo") || modelliGenerali.includes("compravendita") }} />}
      {canDeleteOrders && effectiveCompany?.id && <OrdersTrashDialog open={trashOpen} onOpenChange={setTrashOpen} companyId={effectiveCompany.id} onChanged={refreshOrderScope} />}
      {/* Header — titolo a sinistra e comandi a destra sulla stessa riga, tutti
          alti 32 px e col testo piccolo (23/09/2026, Florin: prima «Nuova
          Commessa» andava a capo e la testata occupava due righe). Si va a capo
          solo quando lo spazio non basta: conta la larghezza della pagina, non
          dello schermo, perché la barra laterale aperta se ne prende un pezzo. */}
      {/* Mobile: senza riquadro né icona, titolo e «Nuovo» su una riga. I
          filtri stanno accanto alla ricerca; il menu ⋮ offriva solo
          «Importa», che da telefono non serve. */}
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 max-sm:rounded-none max-sm:border-0 max-sm:bg-none max-sm:p-0 max-sm:shadow-none">
        <div className="flex items-center gap-2.5 min-w-[8rem] flex-1">
          <div className="hidden h-8 w-8 sm:flex sm:h-9 sm:w-9 rounded-lg bg-gradient-to-br from-orange-500 to-eic-amber text-white items-center justify-center shrink-0 shadow-[0_3px_10px_rgba(249,115,22,0.28)]">
            <Package className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-tight">Commesse</h1>
            <p className="hidden sm:block text-xs text-slate-500 truncate">
              Cantieri, ODA, DDT, anomalie e marginalità in un'unica vista.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-start sm:justify-end">
          {canDeleteOrders && <Button variant="outline" size="sm" className="max-md:hidden" onClick={()=>setTrashOpen(true)}>Cestino</Button>}
          {/* Qui c'era anche il selettore dell'anno: lo stesso della riga dei
              filtri sotto (dove ora ha anche «{anno} + precedenti da gestire»). */}
          {/* Filtri avanzati */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            aria-label="Apri filtri avanzati"
            className="h-8 px-2.5 text-xs max-sm:hidden"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Filtri</span>
            {countActiveFilters(sidebarFilters) > 0 && (
              <span className="ml-1 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {countActiveFilters(sidebarFilters)}
              </span>
            )}
          </Button>
          {/* Vista tabella/pipeline — solo desktop */}
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => value && setViewMode(value as "table" | "pipeline")}
            className="hidden sm:flex border rounded-md"
          >
            <ToggleGroupItem value="table" aria-label="Vista tabella" className="h-8 px-2.5">
              <LayoutList className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="pipeline" aria-label="Vista pipeline" className="h-8 px-2.5">
              <Columns3 className="h-3.5 w-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
          {/* Esportazioni: nascoste su mobile (download file poco pratici da telefono/app). */}
          {!isMobile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Altre azioni">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            {/* Esporta sta qui dentro: era un bottone a sé, e «schede clienti»
                c'era in tutti e due i menu. */}
            <DropdownMenuContent align="end" className="w-60">
              {!isCommercialistaMode && (
                <>
                  <DropdownMenuItem onClick={() => setImportOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" /> Importa commesse
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel className="text-[11px]">Esporta le commesse filtrate</DropdownMenuLabel>
              <DropdownMenuItem onClick={exportOrdersCSV}>
                <FileText className="h-4 w-4 mr-2" /> CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportOrdersXLSX}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportOrdersPDF}>
                <FileText className="h-4 w-4 mr-2" /> PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={openCustomerSheetsDialog}>
                <UsersIcon className="h-4 w-4 mr-2" /> PDF schede clienti
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
          {isCommercialistaMode ? (
            <Button variant="outline" size="sm" disabled className="h-8 px-2.5 text-xs border-blue-200 bg-blue-50 text-blue-700 disabled:opacity-100">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">Sola lettura</span>
              <span className="sm:hidden">Lettura</span>
            </Button>
          ) : !canCreateOrders || nienteDaCreare ? (
            /* Il motivo detto per primo è quello vero: il permesso che manca conta più del telefono. */
            <Button
              size="sm"
              disabled
              title={!canCreateOrders ? createOrdersBlockedTitle : NIENTE_DA_CREARE}
              aria-label={`Nuova Commessa — ${!canCreateOrders ? createOrdersBlockedTitle : NIENTE_DA_CREARE}`}
              className="h-8 px-3 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">Nuova Commessa</span>
              <span className="sm:hidden">Nuovo</span>
            </Button>
          ) : conBivio ? (
            <Button
              onClick={() => setShowOrderTypeDialog(true)}
              size="sm"
              className="tap-compact h-8 px-3 text-xs font-semibold bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm shadow-orange-500/20 hover:from-orange-600 hover:to-amber-500 hover:shadow-md hover:shadow-orange-500/25 max-sm:h-9"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">Nuova Commessa</span>
              <span className="sm:hidden">Nuovo</span>
            </Button>
          ) : (
            <Button
              asChild
              size="sm"
              className="tap-compact h-8 px-3 text-xs font-semibold bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm shadow-orange-500/20 hover:from-orange-600 hover:to-amber-500 hover:shadow-md hover:shadow-orange-500/25 max-sm:h-9"
            >
              <Link to="/azienda/ordini/nuovo">
                <Plus className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Nuova Commessa</span>
                <span className="sm:hidden">Nuovo</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      <PlanLimitWarning resourceType="orders" />

      {/* v8.6.84 — Progress banner esteso a TUTTI i piani con max_orders > 0 */}
      {currentPlan?.max_orders != null && currentPlan.max_orders > 0 && (
        <ScopriProgressBanner
          usedOrders={currentPlan.max_orders - remainingOrders}
          maxOrders={currentPlan.max_orders}
          planName={currentPlan?.name ?? "corrente"}
        />
      )}

      <section className="order-1 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden sm:order-none">
        <div className={`grid gap-0 ${analisiAperta && orderPerms.canViewOrderAmounts && !isMobile ? "xl:grid-cols-2" : ""}`}>
          <div className="flex flex-col bg-eic-navy-deep px-3 py-2 text-white">
            <div className="flex flex-wrap items-start justify-between gap-3 max-md:hidden">
              <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]">
                  <Target className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">Riepilogo commesse · {isYearCorrente ? currentYear : "Periodo selezionato"}</h2>

                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
              {orderPerms.canEditSettingsOrders && !isMobile && effectiveCompany?.id && <button type="button" onClick={() => setSceltaRiepilogoAperta(true)}
                title="Scegli i riquadri e il grafico per tutta l'azienda"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/20 px-3 py-2 text-xs text-blue-50 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
                <Settings2 className="h-3.5 w-3.5" /><span className={analisiAperta ? "xl:sr-only" : ""}>Personalizza</span>
              </button>}
              {orderPerms.canViewOrderAmounts && !isMobile && <button type="button" onClick={toggleAnalisi}
                title={analisiAperta ? "Nascondi andamento" : "Mostra andamento"} aria-expanded={analisiAperta} aria-controls="orders-annual-chart"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/20 px-3 py-2 text-xs text-blue-50 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
                <PieChart className="h-3.5 w-3.5" /><span className={analisiAperta ? "xl:sr-only" : ""}>{analisiAperta ? "Nascondi andamento" : "Mostra andamento"}</span>
                <ChevronDown className={`h-3.5 w-3.5 ${analisiAperta ? "rotate-180" : ""}`} />
              </button>}
              </div>
            </div>
            {orderPerms.canViewMargins && <OrdersMarginSummary average={margineMedio} completed={margineConseguito}
              loading={isEconomicStatsLoading || scopeMarginsPending} error={scopeMarginsError || isGlobalStatsError || isStatusesError} />}
            {(isGlobalStatsError || isStatusesError) && <div role="alert" className="mt-3 rounded-lg border border-amber-300/40 p-3 text-sm text-amber-100">Riepilogo non disponibile. <button type="button" className="underline" onClick={()=>{void retryStatuses();void queryClient.invalidateQueries({queryKey:["orders-global-stats"]});}}>Riprova</button></div>}
            {!isGlobalStatsError && !isStatusesError && <div className={`mt-1.5 grid grid-cols-1 gap-1.5 min-[380px]:grid-cols-2 ${analisiAperta ? "" : "xl:grid-cols-4"}`}>
              {riquadriRiepilogo.map((id) => {
                const v = valoriRiepilogo[id];
                const voce = CATALOGO_RIQUADRI.find(c => c.id === id);
                const inAttesa = voce?.gruppo !== "commesse" ? numeriGeneraliPending : id === "fatturato" ? !elencoInizializzato || billingLoading
                  : isEconomicStatsLoading || ((voce?.permesso === "costi" || voce?.permesso === "margini") && scopeMarginsPending);
                const ring = id === "incassato" && quotaIncassata != null ? { value: quotaIncassata, label: "Quota incassata", color: "green" as const }
                  : id === "costi" && incidenzaCosti != null ? { value: incidenzaCosti, label: "Costi commesse sul fatturato aziendale", color: "amber" as const } : undefined;
                return <OrdersSummaryCard key={id} id={id} title={v.titolo} value={v.valore} note={(id === "venduto" || id === "incassato") && globalStats?.annualVat?.missing ? `Imponibile da verificare · ${globalStats.annualVat.missing} aliquote mancanti` : v.nota} alternateValue={id === "venduto" ? stats.totalGross.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : id === "incassato" ? stats.collected.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : id === "fatturato" && kpiFatturazione?.fatturato_ytd_ivato != null ? kpiFatturazione.fatturato_ytd_ivato.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : undefined} icon={v.icona} loading={inAttesa} ring={ring} info={id === "costi" ? `Il totale costi è imponibile. Il totale IVA inclusa non è disponibile nella fonte aggregata: non viene stimato con un’aliquota fissa. I costi registrati sono attribuiti alle commesse: non comprendono i costi fissi aziendali non imputati. I debiti ancora da pagare includono l’IVA se dovuta e non sono costi aggiuntivi da sommare.${incidenzaCosti != null ? " Il cerchio confronta i costi delle commesse con il fatturato aziendale, entrambi senza IVA." : ""}` : id === "incassato" || id === "venduto" ? "Imponibile ricavato scorporando l’IVA registrata su ciascuna commessa, senza usare un’aliquota unica. Il cerchio degli incassi usa imponibile incassato e residuo imponibile. Le aliquote mancanti richiedono verifica." : undefined}>
                  {id === "incassato" && <div className="text-xs text-blue-100"><div className="flex flex-wrap justify-between gap-x-2 gap-y-1"><span>Da incassare · imponibile</span><strong className="font-semibold tabular-nums text-white">{isEconomicStatsLoading ? "…" : nettoResiduo == null ? "—" : nettoResiduo.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}</strong></div><div className="mt-1 flex flex-wrap justify-between gap-1 text-[10px] text-blue-100/80"><span>IVA inclusa</span><span className="tabular-nums">{isEconomicStatsLoading ? "…" : valoriRiepilogo.da_incassare.valore}</span></div></div>}
                  {id === "costi" && <>
                    <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs text-blue-100"><span>Da pagare · IVA se dovuta</span><strong className="font-semibold tabular-nums text-white">{costiDaPagare.isError ? "—" : costiDaPagare.isPending ? "…" : (costiDaPagare.data ?? 0).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}</strong></div>
                    {costiDaPagare.isError && <button type="button" onClick={() => void costiDaPagare.refetch()} className="mt-1 text-xs text-amber-200 underline">Costi da pagare non disponibili · Riprova</button>}
                  </>}
                </OrdersSummaryCard>;
              })}
            </div>}
            {/* Da telefono restano i numeri: il pregresso è da scrivania. */}
            {isYearCorrente && globalStats && !isGlobalStatsError && !isStatusesError && !isMobile && <OrdersCarryoverSummary
              previous={globalStats.previous} reasons={globalStats.reasons} showAmounts={orderPerms.canViewOrderAmounts} />}
          </div>

          {analisiAperta && orderPerms.canViewOrderAmounts && !isMobile && (
          <aside id="orders-annual-chart" className="flex min-w-0 border-t border-slate-200 bg-white px-3 py-2 xl:border-l xl:border-t-0">
            {isMonthlyOrdersError ? <div role="alert" className="p-4 text-sm text-amber-800">Andamento non disponibile. <Button variant="outline" size="sm" onClick={()=>{ if (isStatusesError) void retryStatuses(); else void ricaricaPerimetro(); }}>Riprova grafico</Button></div> : isLoadingMonthlyOrders ? (
              <div aria-label="Caricamento andamento" className="flex h-[160px] items-end gap-3 px-4 pb-4">
                {[60,92,48,130,78,155,105,184].map((height,index)=><Skeleton key={index} className="flex-1 rounded-t-md" style={{height}}/>)}
              </div>
            ) : <Suspense fallback={<p className="p-4 text-sm text-muted-foreground" role="status">Caricamento grafico…</p>}><OrdersMonthlyChart months={chartWithComparison}
              serie={serieVisibili(sceltaRiepilogo.graficoSerie, permessiRiepilogo)}
              vistaIniziale={sceltaRiepilogo.graficoVista === "numero" ? "count" : "money"}
              formaIniziale={sceltaRiepilogo.graficoForma === "barre" ? "bars" : "lines"}
              comparison={comparisonPeriod ? {year:comparisonPeriod.previousYear, enabled:comparisonEnabled, onToggle:()=>setCompareChart(value=>!value), loading:comparisonPending, error:comparisonError, onRetry:()=>void retryComparison(), label:comparisonPeriod.label} : undefined} period={isYearCorrente ? String(currentYear) : hasSelectedYear ? String(selectedYear) : "Ultimi 12 mesi"}
              selectedMonth={hasMonth ? `${monthYear}-${String(month+1).padStart(2,"0")}` : null}
              onSelectMonth={(key) => {const patch=orderChartMonthFilter(key,yearFilter,currentYear,scopeGroup);if(patch){setURLParams(patch);setPage(1);}}} /></Suspense>}
          </aside>
          )}
        </div>

      </section>

      <OrdersFilterSidebar
        filters={sidebarFilters}
        onFiltersChange={setSidebarFilters}
        statuses={statuses}
        ordersCount={conteggioFiltri}
        optionsError={filterOptionsError}
        onRetryOptions={() => void retryFilterOptions()}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        salespeople={uniqueSalespeople}
        laborList={uniqueLabor}
        customerFilter={customerFilter}
        onCustomerFilterChange={setCustomerFilter}
        uniqueCustomers={uniqueCustomers}
        supplierFilter={supplierFilter}
        onSupplierFilterChange={setSupplierFilter}
        uniqueSuppliers={uniqueSuppliers}
        contractDateRange={contractDateRange}
        onContractDateRangeChange={setContractDateRange}
        warehouseDateRange={warehouseDateRange}
        onWarehouseDateRangeChange={setWarehouseDateRange}
        expectedDateRange={expectedDateRange}
        onExpectedDateRangeChange={setExpectedDateRange}
      />

      <div className="order-3 space-y-2 sm:order-none">
          {barraBacheca ? null : filtriCommesse}


          {viewMode === "table" && isOrdersLoading && !scopeError && <AvvisoAttesaCommesse key={effectiveCompany?.id} onRetry={() => {
            if (isLoadingStatuses || isStatusesError) void retryStatuses();
            else if (focusReady) void refetchOrders();
            else if (gestione && richiedeMargini) void retryScopeMargins();
            else void ricaricaPerimetro();
          }}/>}
          {mostraPrimaPagina && (scopeError || isOrdersError
            ? <div role="alert" className="text-sm text-amber-800">Elenco completo non disponibile. <Button size="sm" variant="link" onClick={() => { if (scopeError) void ricaricaPerimetro(); else void refetchOrders(); }}>Riprova</Button></div>
            : <p role="status" className="text-sm text-muted-foreground">Calcolo del conteggio e del pregresso…</p>)}
          {/* Content */}
          {isStatusesError ? (<div role="alert" className="rounded-xl border border-amber-200 p-4">Impossibile caricare gli stati delle commesse. <Button onClick={() => void retryStatuses()}>Riprova</Button></div>) : scopeError && !mostraPrimaPagina ? (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4">Impossibile verificare i dati necessari per questi filtri. <Button variant="outline" onClick={() => {if (controlFocus !== "all") void retryScopeMargins(); void ricaricaPerimetro();}}>Riprova</Button></div>
          ) : viewMode === "table" && isOrdersError && !mostraPrimaPagina ? (
            <Card className="border-red-200 bg-red-50/70">
              <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  <div>
                    <h3 className="font-semibold text-red-950">Errore nel caricamento commesse</h3>
                    <p className="mt-1 text-sm text-red-800">
                      La pagina non resta più bloccata in caricamento: puoi riprovare senza ricaricare tutto.
                      {ordersError instanceof Error && ordersError.message ? ` Dettaglio: ${ordersError.message}` : ""}
                    </p>
                  </div>
                </div>
                <Button variant="outline" className="border-red-200 bg-white text-red-700 hover:bg-red-100" onClick={() => refetchOrders()}>
                  Riprova
                </Button>
              </CardContent>
            </Card>
          ) : viewMode === "table" && isOrdersLoading ? (
            <Card>
              <CardContent className="p-6 space-y-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-5 w-[80px]" />
                    <Skeleton className="h-5 w-[150px] flex-1" />
                    <Skeleton className="h-5 w-[120px]" />
                    <Skeleton className="h-5 w-[80px]" />
                    <Skeleton className="h-5 w-[70px]" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : visibleOrders.length === 0 && viewMode !== "pipeline" ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nessuna commessa trovata</h3>
                <p className="text-muted-foreground mb-4">
                  {globalStats && stats.totalOrders === 0
                    ? "Non hai ancora creato nessuna commessa."
                    : controlFocus !== "all"
                      ? "Nessuna commessa corrisponde al focus operativo selezionato in questa pagina."
                      : "Nessuna commessa corrisponde ai filtri selezionati."}
                </p>
                {/* 2026-05-26 (audit fix P1): aggiunto bottone "Pulisci filtri"
                    quando ci sono commesse in DB ma i filtri attivi le nascondono.
                    Prima l'utente vedeva solo "Mostra tutte" se controlFocus≠"all",
                    ma non aveva escape per altri filtri (status/cliente/anno/etc). */}
                {controlFocus !== "all" ? (
                  <Button variant="outline" onClick={() => setControlFocus("all")}>
                    Mostra tutte le commesse
                  </Button>
                ) : hasAnyFilter ? (
                  <Button variant="outline" onClick={clearAllFilters} className="gap-2">
                    Pulisci tutti i filtri
                  </Button>
                ) : globalStats && stats.totalOrders === 0 && !isCommercialistaMode && canCreateOrders && !nienteDaCreare && (
                  conBivio ? (
                    <Button onClick={() => setShowOrderTypeDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Crea la prima commessa
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link to="/azienda/ordini/nuovo">
                        <Plus className="h-4 w-4 mr-2" />
                        Crea la prima commessa
                      </Link>
                    </Button>
                  )
                )}
              </CardContent>
            </Card>
          ) : viewMode === "pipeline" && archivioTabella.errore ? (<div role="alert">{archivioTabella.errore} <Button variant="outline" onClick={() => void archivioTabella.riprova()}>Riprova</Button></div>) : viewMode === "pipeline" && pipelineError ? (<div role="alert" className="rounded-xl border border-amber-200 p-4">Impossibile caricare la pipeline. <Button onClick={() => void retryPipeline()}>Riprova</Button></div>) : viewMode === "pipeline" && pipelinePending ? (<p role="status">Caricamento pipeline…</p>) : viewMode === "pipeline" ? (
            <PipelineCommesseBoard azienda={effectiveCompany?.id ?? ""} key={effectiveCompany?.id}
              filtri={<><OrderSearch expand value={searchQuery} onChange={setSearchQuery} /><Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-8 gap-1.5"><SlidersHorizontal className="size-3.5" />Filtri{hasAnyFilter ? " attivi" : ""}</Button></PopoverTrigger>
                <PopoverContent align="start" className="w-[min(380px,90vw)] rounded-xl p-4"><h3 className="mb-3 text-sm font-semibold">Filtri commesse</h3>{filtriCommesse}</PopoverContent></Popover></>}
              orders={allOrdersForPipeline}
              statuses={statuses}
              onStatusChange={orderPerms.canEditOrders && !orderPerms.solaLettura ? handleStatusChange : undefined}
            />
          ) : (
            <div className="space-y-4 max-sm:space-y-0">
              <OrdersTable
                riferimentiPipeline={riferimentiPipeline}
                pipelineFallback={archivioTabella.errore ? "Non disponibile" : archivioTabella.caricamento ? "…" : mostraPipelinePrincipale(effectiveCompany?.id) ? "Principale" : "Senza pipeline"}
                canDelete={canDeleteOrders}
                previousReasons={isYearCorrente ? globalStats?.previousReasons : undefined}
                orders={visibleOrders}
                onDelete={(id) => deleteOrderMutation.mutateAsync(id)}
                isDeleting={deleteOrderMutation.isPending}
                orderCosts={orderCostsMap}
                costsState={scopeMarginsError || errorePerimetro ? "error" : scopeMarginsPending ? "loading" : "ready"}
                statuses={statuses}
                onBulkStatusChange={handleBulkStatusChange}
                onBulkDelete={canDeleteOrders ? handleBulkDelete : undefined}
                isBulkUpdating={isBulkUpdating}
                visibleColumns={new Set([...visibleColumns].filter(isColumnAllowed))}
                salespeopleMap={salespeopleMap}
                laborMap={laborMap}
                supplierMap={supplierMap}
                mappaGenerali={mappaGenerali}
                figlieFuoriPagina={figlieFuoriPagina}
                onRaggruppa={modelliCreabili.length > 0 && orderPerms.canEditOrders ? setDaRaggruppare : undefined}
              />
              {controlFocus === "all" && totalPages > 1 && (
                <div className="flex items-center justify-between px-2">
                  <p className="text-sm text-muted-foreground hidden sm:block">
                    Mostrando {visibleShowingFrom}–{visibleShowingTo} di {visibleTotalCount} commesse
                  </p>
                  <p className="text-xs text-muted-foreground sm:hidden">
                    {visibleShowingFrom}–{visibleShowingTo} / {visibleTotalCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>
                      <ChevronLeft className="h-4 w-4" />
                      <span className="hidden sm:inline ml-1">Precedente</span>
                    </Button>
                    <span className="text-sm font-medium px-1">
                      {page} / {totalPages}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
                      <span className="hidden sm:inline mr-1">Successivo</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
      </div>

      <CSVImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importa Commesse"
        fields={ORDER_IMPORT_FIELDS}
        nota="Importo totale senza IVA; acconti e saldo con l'IVA. Numeri all'italiana (12.000,50), date come 31/12/2026."
        onImport={handleOrdersImport}
      />

      <CustomerSheetsExportDialog
        open={customerSheetsOpen}
        onOpenChange={setCustomerSheetsOpen}
      />

      {/* Bivio iniziale "Nuova Commessa" — solo se c'è da scegliere (Modulo Appaltatori o commesse generali). */}
      <OrderTypeChoiceDialog
        open={showOrderTypeDialog}
        onOpenChange={setShowOrderTypeDialog}
        appaltatore={appaltatoreEnabled}
        commessaCliente={commessaCliente}
        modelliGenerali={modelliCreabili}
        onScegliGenerale={setNuovaGenerale}
      />
      <NuovaGeneraleDialog
        open={nuovaGenerale !== null}
        onOpenChange={(aperta) => { if (!aperta) setNuovaGenerale(null); }}
        modelli={modelliGenerali}
        iniziale={nuovaGenerale}
      />
      {daRaggruppare && righeDaRaggruppare && (
        <RaggruppaDialog
          righe={righeDaRaggruppare}
          modelli={modelliGenerali}
          mappa={mappaGenerali}
          mostraImporti={orderPerms.canViewOrderAmounts}
          onClose={() => setDaRaggruppare(null)}
        />
      )}
    </div>
  );
}

export default function OrdersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Le analisi di marginalità hanno una vista a schede anche sul telefono.
  const isMobile = useIsMobile();
  const permissions = usePermissions();
  // Chi ha solo il permesso «Ufficio acquisti» (senza vedere le commesse) entra
  // direttamente negli acquisti: è l'unica scheda che gli serve e che può leggere.
  const soloAcquisti = !permissions.canViewOrders && permissions.canManagePurchasing;
  const requestedTab = searchParams.get("tab") || (soloAcquisti ? "acquisto" : "ordini");
  const { isFeatureEnabled } = useFeatureFlags();
  const surveysEnabled = isFeatureEnabled("surveys_module");
  const navigate = useNavigate();
  const handleTabChange = (tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "ordini") next.delete("tab");
      else next.set("tab", tab);
      return next;
    }, { replace: true });
  };

  const tabs = [
    { id: "ordini", label: "Commesse", icon: ClipboardList, show: !soloAcquisti },
    // Giorno per giorno cosa si è lavorato: l'elenco di tutti i cantieri, con le statistiche del mese.
    { id: "rapportini", label: "Rapportini", icon: NotebookPen, show: permissions.canViewOrders },
    { id: "sopralluoghi", label: "Sopralluoghi", icon: MapIcon, show: surveysEnabled },
    // Prima degli ordini perche' e' il passo prima: si chiede il prezzo, poi si ordina.
    { id: "offerte", label: "Richieste d'offerta", icon: FileQuestion, show: permissions.canViewOrders && !isMobile },
    // Il centro degli acquisti (23/10/2026): materiali da ordinare, offerte,
    // ordini e consegne in una pipeline. Ha preso il posto di «Acquisti da fare».
    { id: "acquisto", label: "Ordini e Acquisti", icon: ShoppingCart, show: permissions.canViewOrders || permissions.canManagePurchasing },
    { id: "ddt", label: "DDT", icon: FileCheck, show: permissions.canViewOrders },
    { id: "anomalie", label: "Anomalie", icon: AlertTriangle, show: permissions.canViewCosts && !isMobile },
    { id: "marginalita", label: "Marginalità", icon: PieChart, show: permissions.canViewCosts },
    { id: "provvigioni", label: "Provvigioni", icon: Euro, show: permissions.canViewCosts && !isMobile },
  ].filter((t) => t.show);
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : (soloAcquisti ? "acquisto" : "ordini");

  useEffect(() => {
    // La vecchia scheda «Quanto lavora Silvio»: i link salvati arrivano dove sta adesso.
    if (requestedTab === "silvio_lavora") {
      navigate("/azienda/impostazioni/silvio-commesse", { replace: true });
      return;
    }
    if (requestedTab !== activeTab) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("tab");
        if (requestedTab === "oggi") {
          for (const key of Array.from(next.keys())) {
            if (key.endsWith("_oggi")) next.delete(key);
          }
        }
        return next;
      }, { replace: true });
    }
  }, [activeTab, navigate, requestedTab, setSearchParams]);

  return (
    <div className="space-y-3 overflow-x-hidden">
      {/* ─── Tab navigation ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <nav
          className="flex min-h-0 items-center gap-1 overflow-x-auto scroll-smooth px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Sezioni commesse"
        >
          {tabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(t.id)}
                className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-all sm:px-3.5 ${
                  isActive
                    ? "bg-orange-50 text-slate-950 font-semibold shadow-sm ring-1 ring-orange-100"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <t.icon
                  className={`h-4 w-4 shrink-0 ${isActive ? "text-orange-500" : "text-slate-400"}`}
                  aria-hidden="true"
                />
                {t.label}
                {("beta" in t && t.beta) ? (
                  <span className="ml-1 inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-700 ring-1 ring-orange-200">
                    Beta
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "ordini" && (
        <ErrorBoundary title="Errore nella lista commesse">
          <OrdersListInner />
        </ErrorBoundary>
      )}

      {activeTab === "rapportini" && (
        <ErrorBoundary title="Errore in Rapportini">
          <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Caricamento rapportini…</div>}>
            <RapportiniCommesse />
          </Suspense>
        </ErrorBoundary>
      )}

      {activeTab === "sopralluoghi" && surveysEnabled && (
        <ErrorBoundary title="Errore nel modulo Sopralluoghi">
          <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Caricamento sopralluoghi…</div>}>
            <SopralluoghiList />
          </Suspense>
        </ErrorBoundary>
      )}

      {activeTab === "provvigioni" && (
        <ErrorBoundary title="Errore nel tab Provvigioni">
          <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Caricamento provvigioni…</div>}>
            <OrderCommissionsOverview />
          </Suspense>
        </ErrorBoundary>
      )}

      <Suspense fallback={<p className="p-8 text-center text-sm text-muted-foreground" role="status">Caricamento sezione…</p>}>
      {activeTab === "offerte" && (
        <ErrorBoundary title="Errore nel caricamento richieste d'offerta">
          <SupplierRfqsList />
        </ErrorBoundary>
      )}

      {activeTab === "acquisto" && (
        /* Bug fix: rimosso wrapper [&>div:first-child>div:first-child]:hidden
           che nascondeva il nuovo header h-10 w-10 + Esporta/Filtri/Nuovo OdA
           che abbiamo aggiunto a PurchaseOrdersList. Era un hack per nascondere
           il vecchio header ridondante, non più necessario. */
        <PurchaseOrdersList />
      )}

      {activeTab === "ddt" && (
        <ErrorBoundary title="Errore nel caricamento DDT">
          <DDTRicezioneList />
        </ErrorBoundary>
      )}

      {activeTab === "anomalie" && (
        <GlobalErrors />
      )}

      {activeTab === "marginalita" && (
        <MarginalitaCantieri />
      )}
      </Suspense>

    </div>
  );
}
