import {OrdersAnnualScope, OrdersCarryoverSummary} from "@/components/orders/OrdersAnnualScope";
import { OrdersTrashDialog } from '@/components/orders/OrdersTrashDialog';
import {currentManagementScope, orderEconomics, orderYear, previousOrderReasons, orderScopeGroupIds, orderWorkflowCounts, type OrderScopeGroup} from "@/lib/orders/annualScope";
import {TICKET_STATI_CHIUSI} from "@/types/tickets";
import {OrdersPeriodSummary} from "@/components/orders/OrdersPeriodSummary";
import {readOrdersPage} from "@/lib/orders/listQuery";
import { parseOrderAdvancedFilters } from "@/lib/orders/advancedFilters";
import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from "react";
import { matchesOrderPayment } from "@/lib/orders/listPayments";
import { readAllOrderRows, orderMarginKind, orderMarginGroups, ORDER_FOCUS_LABELS, type OrderFocus, type OrderMarginRow } from "@/lib/orders/listScope";
import "./OrdersList/orders-list.css";
import { useIsMobile } from "@/hooks/use-mobile";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useURLFilters } from "@/hooks/useURLFilters";
import { usePermissions } from "@/hooks/usePermissions";
import { Plus, Package, LayoutList, Columns3, Upload, MoreVertical, ChevronLeft, ChevronRight, ClipboardList, ShoppingCart, AlertTriangle, PieChart, SlidersHorizontal, Columns, FileCheck, FileText, FileSpreadsheet, ChevronDown, Users as UsersIcon, Target, LifeBuoy, Hammer, CheckCircle2, ShieldCheck, ShoppingBag, Euro, TrendingUp, AlertCircle, Map as MapIcon, FileQuestion, HardHat } from "lucide-react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

// 🆕 Sprint S3: Sopralluoghi come tab dentro Commesse
const SopralluoghiList = lazy(() => import("@/pages/azienda/sopralluoghi/SopralluoghiList"));
const CantieriOggi = lazy(() => import("@/pages/azienda/CantieriOggi"));
const OrderCommissionsOverview = lazy(() =>
  import("@/components/orders/OrderCommissionsOverview").then((module) => ({
    default: module.OrderCommissionsOverview,
  }))
);
import { OrdersFilterSidebar, INITIAL_FILTER_STATE, countActiveFilters, type OrdersFilterState } from "@/components/orders/OrdersFilterSidebar";
import PurchaseOrdersList from "@/pages/azienda/PurchaseOrdersList";
import SupplierRfqsList from "@/pages/azienda/SupplierRfqsList";
import DDTRicezioneList from "@/pages/azienda/DDTRicezioneList";
import GlobalErrors from "@/pages/azienda/GlobalErrors";
import MarginalitaCantieri from "@/pages/azienda/MarginalitaCantieri";
import { format } from "date-fns";
import { annualComparisonPeriod, comparableOrderMonths, orderChartMonthFilter } from "@/lib/orders/monthlyChart";
import { OrdersMonthlyChart } from "@/components/orders/OrdersMonthlyChart";

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
import { OrdersPipelineView } from "@/components/orders/OrdersPipelineView";
import { OrdersFilters } from "@/components/orders/OrdersFilters";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { CSVImportDialog } from "@/components/shared/CSVImportDialog";
import { CustomerSheetsExportDialog } from "@/components/orders/CustomerSheetsExportDialog";
import { useToast } from "@/hooks/use-toast";
import { type OrderWithDetails, getAmountDue, getAmountCollected, getPendingPayments, deleteOrderCascading, getGrossOrderAmount, contrattoPattuito } from "@/lib/orderUtils";
import { PlanLimitWarning } from "@/components/billing/PlanLimitWarning";
import { ScopriProgressBanner } from "@/components/subscription/UpgradeScopriBanner";
import { EsposizioneFlotta } from "@/components/orders/EsposizioneFlotta";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useAppaltatoreModuleEnabled } from "@/hooks/useAppaltatoreModule";
import { OrderTypeChoiceDialog } from "@/components/orders/OrderTypeChoiceDialog";

// MP-CAN-001 — types/constants estratti in ./OrdersList/constants.ts
import {
  type DateRange,
  ORDER_IMPORT_FIELDS,
  EMPTY_ORDERS,
} from "./OrdersList/constants";

function OrdersListInner() {
  const { user, effectiveCompany } = useAuth();
  const orderPerms = usePermissions();
  const { toast } = useToast();
  const { remainingOrders, currentPlan } = useSubscriptionLimits();
  const [searchParams] = useSearchParams();
  const isCommercialistaMode = searchParams.get("commercialistaMode") === "1";
  const appaltatoreEnabled = useAppaltatoreModuleEnabled();
  const [showOrderTypeDialog, setShowOrderTypeDialog] = useState(false);
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
  // Su mobile la pipeline (kanban drag) non è usabile e il toggle è hidden sm:flex:
  // un link condiviso ?view=pipeline (o il localStorage del desktop) lasciava il
  // telefono inchiodato sulla pipeline senza via d'uscita → forziamo la tabella.
  const isMobile = useIsMobile();
  const rawViewMode = urlFilters.viewMode as "table" | "pipeline";
  const viewMode: "table" | "pipeline" = isMobile ? "table" : rawViewMode;
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
  const periodLabel = yearFilter === "corrente" ? `${new Date().getFullYear()} + precedenti da gestire` : yearFilter === "all" ? "Tutti gli anni" : yearFilter;
  const currentYear = new Date().getFullYear();
  const selectedYear = !isYearCorrente && yearFilter !== "all" ? Number(yearFilter) : null;
  const hasSelectedYear = Number.isInteger(selectedYear);

  // Gli stati definiscono anche il perimetro anno corrente + commesse aperte.
  const { data: statuses = [], isLoading: isLoadingStatuses, isError: isStatusesError, refetch: retryStatuses } = useQuery({
    queryKey: ["order-statuses", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, color, position, is_support_phase")
        .eq("company_id", effectiveCompany.id)
        .order("position");
      if (error) throw error;
      return data;
    },
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

  // KPI stats principali: reagiscono solo all'annualità, non ai filtri operativi
  // come stato, ricerca, pagamento o vista. Così restano numeri di controllo,
  // ma possono essere letti per anno quando serve.
  const { data: globalStats, isLoading: isLoadingGlobalStats, isError: isGlobalStatsError } = useQuery({
    queryKey: ["orders-global-stats", "annual-management-v3", effectiveCompany?.id, yearFilter, currentYear, lastStatusId, supportStatusId, orderPerms.canViewTickets],
    queryFn: async () => {
      const EMPTY = { totalOrders: 0, totalGross: 0, collected: 0, pending: 0, countAssistenza: 0, countCompletati: 0, countDaCompletare: 0, scopeRows: [] as OrderWithDetails[], annual: orderEconomics([]), previous: orderEconomics([]), reasons: {work:0,support:0,payment:0}, previousReasons: {} as Record<string,string[]>, supportOrderIds: [] as string[] };
      if (!effectiveCompany?.id) return EMPTY;
      let query = supabase
        .from("orders")
        .select("id, created_at, customer_id, expected_date, work_start_date, total_amount, vat_rate, deposit_amount, deposit_2_amount, balance_amount, deposit_paid, deposit_2_paid, balance_paid, financing_amount, financing_cost, financing_paid, payment_type, current_status_id, deposit_expected_date, deposit_2_expected_date, balance_expected_date, financing_expected_date, installments:order_installments(position, type, amount, is_paid, paid_date, expected_date, fattura:documenti_fiscali(id, importo_pagato)), variazioni:ordini_variazione(status, impatto_economico, offline_signed_on, firmato_il, approval_recorded_at, richiesto_il, created_at)")
        .eq("company_id", effectiveCompany.id)
        .is("deleted_at", null);
      if (isYearCorrente) query = query.lt("created_at",new Date(currentYear + 1,0,1).toISOString());
      if (!isYearCorrente && hasSelectedYear && selectedYear) {
        query = query
          .gte("created_at", new Date(selectedYear, 0, 1).toISOString())
          .lte("created_at", new Date(selectedYear, 11, 31, 23, 59, 59, 999).toISOString());
      }
      query = query.order("id");
      const allRows = await readAllOrderRows((from, to) => query.range(from, to)) as unknown as OrderWithDetails[];
      const tickets = orderPerms.canViewTickets ? await readAllOrderRows((from,to) => supabase.from("tickets")
        .select("id, order_id, status").eq("company_id",effectiveCompany.id).not("order_id","is",null)
        .not("status","in",`(${TICKET_STATI_CHIUSI.join(",")})`).order("id").range(from,to)) : [];
      const ticketIds = new Set(tickets.flatMap(ticket => ticket.order_id ? [ticket.order_id] : []));
      const rows = isYearCorrente ? currentManagementScope(allRows,currentYear,lastStatusId,supportStatusId,ticketIds) : allRows;
      const annualRows = isYearCorrente ? rows.filter(order => orderYear(order) === currentYear) : rows;
      const previousRows = isYearCorrente ? rows.filter(order => orderYear(order) < currentYear) : [];
      const annual = orderEconomics(annualRows);
      const previous = orderEconomics(previousRows);
      const previousReasons = Object.fromEntries(previousRows.map(order => [order.id,previousOrderReasons(order,currentYear,lastStatusId,supportStatusId,ticketIds)]));
      const reasons = {work:0,support:0,payment:0};
      Object.values(previousReasons).forEach(values => {
        if (values.includes("Lavori aperti")) reasons.work++;
        if (values.includes("Assistenza aperta")) reasons.support++;
        if (values.includes("Saldo da incassare")) reasons.payment++;
      });
      const supportOrderIds = rows.filter(order => (!!supportStatusId && order.current_status_id === supportStatusId) || ticketIds.has(order.id)).map(order => order.id);
      const totalGross = annual.sold;
      const collected = annual.collected;
      const pending = annual.pending;
      let countAssistenza = 0;
      let countCompletati = 0;
      for (const o of rows) {
        if (o.current_status_id && supportStatusId && o.current_status_id === supportStatusId) countAssistenza++;
        else if (o.current_status_id && lastStatusId && o.current_status_id === lastStatusId) countCompletati++;
      }
      const countDaCompletare = rows.length - countAssistenza - countCompletati;
      return { totalOrders: rows.length, totalGross, collected, pending, countAssistenza, countCompletati, countDaCompletare, scopeRows: rows, annual, previous, reasons, previousReasons, supportOrderIds };
    },
    enabled: !!effectiveCompany?.id && !isLoadingStatuses && !isStatusesError && !orderPerms.isLoading,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    staleTime: 5 * 60 * 1000,
  });

  const scopeOrders = globalStats?.scopeRows ?? EMPTY_ORDERS;
  const paymentIds = useMemo(() => paymentFilter === "all" && sidebarFilters.paymentStatus === "all" ? null :
    scopeOrders.filter(order => matchesOrderPayment(order, paymentFilter) && matchesOrderPayment(order, sidebarFilters.paymentStatus)).map(order => order.id),
    [scopeOrders, paymentFilter, sidebarFilters.paymentStatus]);
  const scopeOrderIds = useMemo(() => scopeOrders.map(order => order.id), [scopeOrders]);
  const listScopeIds = useMemo(() => orderScopeGroupIds(scopeOrders,scopeGroup,currentYear), [scopeOrders,scopeGroup,currentYear]);
  const listScopeCounts = useMemo(() => {
    const ids = new Set(isYearCorrente ? listScopeIds : scopeOrderIds);
    return orderWorkflowCounts(scopeOrders.filter(order=>ids.has(order.id)),lastStatusId,supportStatusId,new Set(globalStats?.supportOrderIds ?? []));
  },[scopeOrders,listScopeIds,scopeOrderIds,isYearCorrente,lastStatusId,supportStatusId,globalStats?.supportOrderIds]);
  const {data: scopeMargins, isPending: scopeMarginsPending, isError: scopeMarginsError, refetch: retryScopeMargins} = useQuery({
    queryKey: ["orders-margin-scope", effectiveCompany?.id, scopeOrderIds],
    enabled: !!effectiveCompany?.id && !!globalStats && (orderPerms.canViewMargins || orderPerms.canViewCosts),
    queryFn: async () => {
      const rows: OrderMarginRow[] = [];
      for (let from = 0; from < scopeOrderIds.length; from += 100) {
        const {data, error} = await supabase.from("v_ordine_marginalita")
          .select("id, preventivo_totale, consuntivo, margine, margine_perc")
          .eq("company_id", effectiveCompany!.id).in("id", scopeOrderIds.slice(from, from + 100));
        if (error) throw error;
        rows.push(...(data ?? []));
      }
      return rows;
    },
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
  const needsScope = isYearCorrente || statusFilter === "__assistenza__" || controlFocus !== "all" || paymentFilter !== "all" || sidebarFilters.paymentStatus !== "all";
  const focusReady = (!(isYearCorrente || statusFilter === "__assistenza__") || !!globalStats) && (controlFocus === "all" || (!isLoadingGlobalStats && !scopeMarginsPending)) && (paymentIds === null || !!globalStats);

  function filterReaderKey() {
    return JSON.stringify([debouncedSearch, statusFilter, paymentFilter, customerFilter, yearFilter, monthFilter,
      amountMin, amountMax, salespersonFilter, laborFilter, supplierFilter, hideCompleted, lastStatusId, supportStatusId,
      contractDateRange, warehouseDateRange, expectedDateRange, sidebarFilters, focusIds, paymentIds, listScopeIds, globalStats?.supportOrderIds]);
  }

  const fetchOrderRows = (from: number, to: number) => readOrdersPage({
    companyId:effectiveCompany?.id, periodIds:isYearCorrente ? listScopeIds : null, supportOrderIds:globalStats?.supportOrderIds, focusIds, paymentIds, salespersonFilter, laborFilter, supplierFilter, sidebarFilters, customerFilter, debouncedSearch, statusFilter, supportStatusId, lastStatusId, hideCompleted, amountMin, amountMax, isYearCorrente, monthFilter, currentYear, hasSelectedYear, selectedYear, contractDateRange, warehouseDateRange, expectedDateRange, sortField, sortDir
  },from,to);

  const { data: ordersResult, isLoading: isLoadingOrders, isError: isOrdersError, isFetching: isOrdersFetching, error: ordersError, refetch: refetchOrders } = useQuery({
    queryKey: ["orders", effectiveCompany?.id, page, pageSize, debouncedSearch, statusFilter, paymentFilter, customerFilter, yearFilter, amountMin, amountMax, salespersonFilter, laborFilter, supplierFilter, hideCompleted, lastStatusId, supportStatusId, contractDateRange, warehouseDateRange, expectedDateRange, sortField, sortDir, sidebarFilters, focusIds, paymentIds, listScopeIds, globalStats?.supportOrderIds],
    queryFn: () => fetchOrderRows((page - 1) * pageSize, page * pageSize - 1),
    enabled: !!effectiveCompany?.id && focusReady && !isLoadingStatuses && !isStatusesError,
    placeholderData: (previousData, previousQuery) => previousQuery?.queryKey[1] === effectiveCompany?.id ? previousData : undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const rawOrders = ordersResult?.orders ?? EMPTY_ORDERS;
  const totalCount = ordersResult?.totalCount ?? 0;
  const isOrdersLoading = !!effectiveCompany?.id && !isOrdersError && (isLoadingOrders || !ordersResult || !focusReady);

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
  const comparisonPeriod = annualComparisonPeriod(isYearCorrente ? currentYear : hasSelectedYear ? selectedYear! : NaN);
  const comparisonEnabled = compareChart && !!comparisonPeriod;
  const {data: previousChartOrders = [], isPending: comparisonPending, isError: comparisonError, refetch: retryComparison} = useQuery({
    queryKey: ["orders-monthly-sales-chart", "comparison-v1", effectiveCompany?.id, comparisonPeriod?.previousFrom.toISOString(), comparisonPeriod?.previousTo.toISOString()],
    enabled: !!effectiveCompany?.id && !isMobile && analisiAperta && orderPerms.canViewOrderAmounts && comparisonEnabled,
    queryFn: async () => {
      if (!effectiveCompany?.id || !comparisonPeriod) return [];
      const query = supabase.from("orders").select(`
        id, created_at, total_amount, vat_rate, payment_type, financing_cost,
        deposit_amount, deposit_paid, deposit_2_amount, deposit_2_paid,
        balance_amount, balance_paid, financing_amount, financing_paid,
        installments:order_installments(position, type, amount, is_paid, paid_date, expected_date, fattura:documenti_fiscali(id, importo_pagato)),
        variazioni:ordini_variazione(status, impatto_economico, offline_signed_on, firmato_il, approval_recorded_at, richiesto_il, created_at)
      `).eq("company_id", effectiveCompany.id).is("deleted_at", null)
        .gte("created_at", comparisonPeriod.previousFrom.toISOString())
        .lt("created_at", comparisonPeriod.previousTo.toISOString());
      return readAllOrderRows((from,to) => query.order("created_at", {ascending:true}).order("id").range(from,to));
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: monthlyOrders = [], isLoading: isLoadingMonthlyOrders, isError: isMonthlyOrdersError } = useQuery({
    queryKey: ["orders-monthly-sales-chart", "annual-v3", effectiveCompany?.id, yearFilter, currentYear],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const from = new Date();
      let to: Date | null = null;
      if (isYearCorrente || (hasSelectedYear && selectedYear)) {
        const chartYear = isYearCorrente ? currentYear : selectedYear!;
        from.setFullYear(chartYear, 0, 1);
        from.setHours(0, 0, 0, 0);
        to = new Date(chartYear, 11, 31, 23, 59, 59, 999);
      } else {
        from.setMonth(from.getMonth() - 11);
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
      }

      let query = supabase
        .from("orders")
        .select(`
          id, created_at, total_amount, vat_rate, payment_type, financing_cost,
          deposit_amount, deposit_paid,
          deposit_2_amount, deposit_2_paid,
          balance_amount, balance_paid,
          financing_amount, financing_paid,
          installments:order_installments(position, type, amount, is_paid, paid_date, expected_date, fattura:documenti_fiscali(id, importo_pagato)),
          variazioni:ordini_variazione(status, impatto_economico, offline_signed_on, firmato_il, approval_recorded_at, richiesto_il, created_at)
        `)
        .eq("company_id", effectiveCompany.id)
        .gte("created_at", from.toISOString());
      query = query.is("deleted_at", null);
      if (to) query = query.lte("created_at", to.toISOString());
      return readAllOrderRows((from,to) => query.order("created_at", {ascending:true}).order("id").range(from,to));
    },
    // Si scarica solo col grafico aperto (23/10/2026): prima leggeva tutte le
    // commesse dell'anno con rate e varianti anche a grafico chiuso. Su mobile
    // il grafico non c'è.
    enabled: !!effectiveCompany?.id && !isMobile && analisiAperta && orderPerms.canViewOrderAmounts,

    staleTime: 5 * 60 * 1000,
  });

  // (Rimossa la query "aggregates" filtrata: le KPI cards ora usano globalStats
  // che NON reagisce ai filtri. Se in futuro serviranno statistiche della vista
  // corrente, vanno derivate da `rawOrders` o da una nuova query dedicata.)

  const {data: allOrdersForPipeline = [], isPending: pipelinePending, isError: pipelineError, refetch: retryPipeline} = useQuery({
    queryKey: ["orders-pipeline", effectiveCompany?.id, filterReaderKey(), sortField, sortDir],
    enabled: !!effectiveCompany?.id && viewMode === "pipeline" && focusReady,
    queryFn: async () => (await fetchOrderRows(0, Infinity)).orders,
    staleTime: 3 * 60 * 1000,
  });

  // Batch queries for cost calculations — use rawOrders IDs to avoid circular dep with salespeopleMap
  const orderIds = useMemo(() => rawOrders.map(o => o.id), [rawOrders]);

  const canonicalMargins = scopeMargins ?? [];

  // Materiali, personale, squadre e venditori delle commesse della pagina, e i
  // fornitori dei materiali, in una lettura sola (23/10/2026): erano cinque
  // richieste, ognuna a ripreparare le regole di accesso della sua tabella.
  // Stesse colonne di prima: il resto della pagina non cambia.
  const { data: dettagli } = useQuery({
    queryKey: ["elenco-commesse-dettagli", effectiveCompany?.id, orderIds],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("elenco_commesse_dettagli", { p_order_ids: orderIds });
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
      const p = (sp as any).salesperson;
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
      const emp = (e as any).employee;
      if (emp) {
        const name = `${emp.first_name} ${emp.last_name}`;
        const existing = map.get(e.order_id) || [];
        if (!existing.includes(name)) existing.push(name);
        map.set(e.order_id, existing);
      }
    }
    for (const t of externalTeamCosts) {
      const team = (t as any).external_team;
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

  const DEFAULT_COLUMNS = new Set(["date", "customer", "totalIvato", "imponibile", "collected", "due", "variableCosts", "payments"]);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("orders-visible-columns-v2");
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
      try { localStorage.setItem("orders-visible-columns-v2", JSON.stringify([...next])); } catch { /* Safari Private Browsing */ }
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

    for (const row of canonicalMargins) {
      if (!row.id) continue;
      const revenue = Number(row.preventivo_totale || 0);
      const variableCosts = Number(row.consuntivo || 0);
      map.set(row.id, {
        variableCosts,
        grossMargin: Number(row.margine || 0),
        marginPercent: Number(row.margine_perc || 0),
        marginReliable: orderMarginKind(row) !== "missing_costs",
      });
    }

    return map;
  }, [canonicalMargins]);

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
          description: `Nessuna commessa spostata nel cestino. Verifica permessi o riprova.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Eliminazione parziale",
          description: `${ok} nel cestino · ${failed} non spostati. Le righe non spostate sono ancora presenti.`,
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
    paymentFilter !== "all" || customerFilter !== "all" || yearFilter !== "corrente" || amountMin || amountMax ||
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any[]).forEach((row) => {
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
  const filterKey = `${searchQuery}|${statusFilter}|${paymentFilter}|${customerFilter}|${yearFilter}|${amountMin}|${amountMax}|${monthFilter}|${salespersonFilter}|${laborFilter}|${supplierFilter}|${controlFocus}|${scopeGroup}|${hideCompleted}|${contractDateRange.from}|${contractDateRange.to}|${warehouseDateRange.from}|${warehouseDateRange.to}|${expectedDateRange.from}|${expectedDateRange.to}|${JSON.stringify(sidebarFilters)}`;
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

    monthlyOrders.forEach((order: any) => {
      if (!order.created_at) return;
      const date = new Date(order.created_at);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const month = byKey.get(key);
      if (!month) return;
      month.commesse += 1;
      month.venduto += getGrossOrderAmount(order as any);
      month.incassato += getAmountCollected(order as any);
      month.daIncassare += getAmountDue(order as any);
    });

    return months;
  }, [monthlyOrders, hasSelectedYear, selectedYear, isYearCorrente, currentYear]);

  const chartWithComparison = useMemo(() => {
    if (!comparisonEnabled || !comparisonPeriod || comparisonPending || comparisonError) return monthlySalesChart;
    const values = (rows: typeof monthlyOrders) => rows.map(order => ({
      created_at: order.created_at!, venduto: getGrossOrderAmount(order as any),
      incassato: getAmountCollected(order as any), daIncassare: getAmountDue(order as any),
    }));
    return comparableOrderMonths(monthlySalesChart, values(monthlyOrders), values(previousChartOrders), comparisonPeriod);
  }, [comparisonEnabled, comparisonPeriod?.to.getTime(), comparisonPending, comparisonError, monthlySalesChart, monthlyOrders, previousChartOrders]);

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
        const revenue = Number(row.preventivo_totale || 0);
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
    const rows = (allOrders || []).map((o) => {
      const pending = getPendingPayments(o as any);
      // Imponibile e IVA del valore pattuito (contratto più varianti), come il Totale Ivato.
      const imponibile = contrattoPattuito(o as any);
      const totalGross = getGrossOrderAmount(o as any);
      const vatAmount = Math.round((totalGross - imponibile) * 100) / 100;
      const collected = getAmountCollected(o as any);
      const due = getAmountDue(o as any);
      const costs = exportCostsMap.get(o.id);
      return {
        order_code: o.order_code || "",
        customer: (o.customer as any) ? `${(o.customer as any).first_name} ${(o.customer as any).last_name}` : "",
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
        status: (o.status as any)?.name || "",
        created_at: o.created_at ? format(new Date(o.created_at), "dd/MM/yyyy") : "",
        warehouse_arrival_date: o.warehouse_arrival_date ? format(new Date(o.warehouse_arrival_date), "dd/MM/yyyy") : "",
        expected_date: o.expected_date ? format(new Date(o.expected_date), "dd/MM/yyyy") : "",
        payment_status: pending.length > 0 ? pending.join(", ") : "Tutto pagato",
      };
    });
    return { rows, columns:permittedColumns, count: allOrders?.length ?? 0 };
    } catch {
      toast({title:"Esportazione non riuscita",description:"Non è stato possibile leggere tutte le commesse. Riprova.",variant:"destructive"});
      return null;
    }
  };

  const exportOrdersCSV = useCallback(async () => {
    const result = await prepareExportData();
    if (!result) return;
    exportToCSV(result.rows, result.columns, `commesse-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: `CSV esportato — ${result.count} commesse` });
  }, [prepareExportData, toast]);

  const exportOrdersXLSX = useCallback(async () => {
    const result = await prepareExportData();
    if (!result) return;
    await exportToXLSX(result.rows, result.columns, `commesse-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: `Excel esportato — ${result.count} commesse` });
  }, [prepareExportData, toast]);

  // Export PDF: tabella ordini landscape
  const exportOrdersPDF = useCallback(async () => {
    const result = await prepareExportData();
    if (!result || result.count === 0) {
      toast({ title: "Nessuna commessa", description: "Non ci sono commesse da esportare.", variant: "destructive" });
      return;
    }
    try {
      const jsPDFModule = await import("jspdf");
      const jsPDF = jsPDFModule.default ?? (jsPDFModule as any).jsPDF;
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
  }, [prepareExportData, effectiveCompany, toast]);

  // Export PDF: una scheda completa per ogni cliente con i suoi ordini
  // Export schede clienti PDF: apre dialog con quantity selector + progress bar
  // (vedi CustomerSheetsExportDialog per il fix del bug "1000 schede").
  const openCustomerSheetsDialog = useCallback(() => setCustomerSheetsOpen(true), []);

  // Import handler
  const handleOrdersImport = useCallback(async (rows: Record<string, string>[]) => {
    if (!effectiveCompany?.id) return { success: 0, errors: ["Azienda non trovata"] };

    // Fetch customers to match by email
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("company_id", effectiveCompany.id);
    const emailToId = new Map((profiles || []).map((p) => [p.email.toLowerCase(), p.id]));

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
    const existingCodeSet = new Set((existingCodes || []).map(r => r.order_code?.trim().toLowerCase()));

    let success = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const email = row.customer_email?.trim().toLowerCase();
        if (!email) { errors.push(`Riga ${i + 1}: Email cliente mancante`); continue; }
        const customerId = emailToId.get(email);
        if (!customerId) { errors.push(`Riga ${i + 1}: Cliente con email "${email}" non trovato`); continue; }
        if (!row.description?.trim()) { errors.push(`Riga ${i + 1}: Descrizione mancante`); continue; }

        // B5 — verifica duplicato order_code
        if (row.order_code?.trim()) {
          const normalizedCode = row.order_code.trim().toLowerCase();
          if (existingCodeSet.has(normalizedCode)) {
            errors.push(`Riga ${i + 1}: Codice commessa "${row.order_code}" già esistente`);
            continue;
          }
        }

        const totalAmount = parseFloat(row.total_amount) || 0;
        if (totalAmount <= 0) { errors.push(`Riga ${i + 1}: Importo totale non valido`); continue; }

        const depositAmount = parseFloat(row.deposit_amount) || 0;
        const deposit2Amount = parseFloat(row.deposit_2_amount) || 0;
        const balanceAmount = row.balance_amount ? parseFloat(row.balance_amount) : totalAmount - depositAmount - deposit2Amount;

        const { error } = await supabase.from("orders").insert({
          company_id: effectiveCompany.id,
          customer_id: customerId,
          description: row.description.trim(),
          total_amount: totalAmount,
          deposit_amount: depositAmount,
          deposit_2_amount: deposit2Amount,
          balance_amount: Math.max(0, balanceAmount),
          order_code: row.order_code?.trim() || null,
          expected_date: row.expected_date || null,
          warehouse_arrival_date: row.warehouse_arrival_date || null,
          work_start_date: row.work_start_date || null,
          internal_notes: row.internal_notes || null,
          payment_type: row.payment_type || "standard",
          current_status_id: defaultStatusId,
        });
        if (error) throw error;
        success++;
      } catch (err: any) {
        errors.push(`Riga ${i + 1}: ${err?.message || "Errore"}`);
      }
    }

    refreshOrderScope();
    return { success, errors };
  }, [effectiveCompany, queryClient, refreshOrderScope]);

  const hasStatsError = isStatusesError || (isGlobalStatsError && !globalStats);
  const isEconomicStatsLoading = !!effectiveCompany?.id && !hasStatsError && (
    isLoadingGlobalStats ||
    !globalStats
  );
  const isWorkflowStatsLoading = isEconomicStatsLoading || (!!effectiveCompany?.id && isLoadingStatuses);

  return (
    // pb-20 rimosso: la bottom nav mobile non è più overlay (è sotto il main) — erano 160px di vuoto
    <div className="orders-workspace flex flex-col gap-3">
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
          {canDeleteOrders && <Button variant="outline" size="sm" onClick={()=>setTrashOpen(true)}>Cestino</Button>}
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
          ) : !canCreateOrders ? (
            <Button size="sm" disabled title={createOrdersBlockedTitle} aria-label={`Nuova Commessa — ${createOrdersBlockedTitle}`} className="h-8 px-3 text-xs font-semibold">
              <Plus className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">Nuova Commessa</span>
              <span className="sm:hidden">Nuovo</span>
            </Button>
          ) : appaltatoreEnabled ? (
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
          <div className="bg-eic-navy-deep p-3 text-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                <div className="flex h-9 w-9 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]">
                  <Target className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-orange-100">Riepilogo commesse</p>
                  <h2 className="mt-0.5 sm:mt-1 text-base sm:text-lg font-semibold text-white">Vista economica e operativa</h2>
                  <p className="hidden sm:block mt-0.5 max-w-xl text-xs leading-4 text-blue-50/85">
                    {isYearCorrente ? `Valori delle commesse ${currentYear} · IVA inclusa. Pregresso separato qui sotto.` : "Valori delle commesse nel periodo selezionato, indipendenti dai filtri sotto."}
                  </p>
                </div>
              </div>
              {orderPerms.canViewOrderAmounts && !isMobile && <button type="button" onClick={toggleAnalisi}
                title={analisiAperta ? "Nascondi andamento" : "Mostra andamento"} aria-expanded={analisiAperta} aria-controls="orders-annual-chart"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/20 px-3 py-2 text-xs text-blue-50 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
                <PieChart className="h-3.5 w-3.5" /><span className={analisiAperta ? "xl:sr-only" : ""}>{analisiAperta ? "Nascondi andamento" : "Mostra andamento"}</span>
                <ChevronDown className={`h-3.5 w-3.5 ${analisiAperta ? "rotate-180" : ""}`} />
              </button>}
            </div>
            {(isGlobalStatsError || isStatusesError) && <div role="alert" className="mt-3 rounded-lg border border-amber-300/40 p-3 text-sm text-amber-100">Riepilogo non disponibile. <button type="button" className="underline" onClick={()=>{void retryStatuses();void queryClient.invalidateQueries({queryKey:["orders-global-stats"]});}}>Riprova</button></div>}
            {!isGlobalStatsError && !isStatusesError && <div className={`mt-2 grid grid-cols-2 gap-2 ${analisiAperta ? "" : "xl:grid-cols-4"}`}>
              <div className="rounded-xl border border-white/12 bg-white/9 p-2 sm:p-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-orange-100">
                    <ShoppingBag className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100">{isYearCorrente ? `Commesse ${currentYear}` : "Commesse del periodo"}</span>
                    {isEconomicStatsLoading ? (
                      <>
                        <Skeleton className="mt-1 h-7 w-14 bg-white/20" />
                        <Skeleton className="mt-1 h-3 w-24 bg-white/15" />
                      </>
                    ) : (
                      <>
                        <span className="block truncate text-lg font-bold text-white">{isYearCorrente ? globalStats?.annual.count ?? 0 : stats.totalOrders}</span>
                        <span className="mt-0.5 block text-xs text-blue-50/70">
                          media mese {monthlySalesAverages.ordersPerMonth.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              {orderPerms.canViewOrderAmounts && (<>
              {/* "Totale venduto" e "Incassato" sono metriche da scrivania:
                  su mobile confondono e allungano l'header → visibili da sm in su.
                  Restano "Commesse totali" e "Da incassare" (operativi). */}
              <div className="hidden sm:block rounded-xl border border-white/12 bg-white/9 p-2 sm:p-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-blue-100">
                    <Euro className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100">Venduto sulle commesse {isYearCorrente ? currentYear : "del periodo"}</span>
                    {isEconomicStatsLoading ? (
                      <>
                        <Skeleton className="mt-1 h-7 w-28 bg-white/20" />
                        <Skeleton className="mt-1 h-3 w-32 bg-white/15" />
                      </>
                    ) : (
                      <>
                        <span className="block truncate text-lg font-bold text-white">
                          {stats.totalGross.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" })}
                        </span>
                        <span className="mt-0.5 block text-xs text-blue-50/70">
                          media commessa {stats.averageGross.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" })}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="hidden sm:block rounded-xl border border-white/12 bg-white/9 p-2 sm:p-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-emerald-100">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100">Incassato sulle commesse {isYearCorrente ? currentYear : "del periodo"}</span>
                    {isEconomicStatsLoading ? (
                      <>
                        <Skeleton className="mt-1 h-7 w-28 bg-white/20" />
                        <Skeleton className="mt-1 h-3 w-28 bg-white/15" />
                      </>
                    ) : (
                      <>
                        <span className="block truncate text-lg font-bold text-white">
                          {stats.collected.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" })}
                        </span>
                        <span className="mt-0.5 block text-xs text-blue-50/70">
                          media mese {monthlySalesAverages.collectedPerMonth.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" })}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-white/12 bg-white/9 p-2 sm:p-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-orange-100">
                    <AlertCircle className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100">Da incassare {isYearCorrente ? currentYear : "periodo"}</span>
                    {isEconomicStatsLoading ? (
                      <>
                        <Skeleton className="mt-1 h-7 w-28 bg-white/20" />
                        <Skeleton className="mt-1 h-3 w-24 bg-white/15" />
                      </>
                    ) : (
                      <>
                        <span className="block truncate text-lg font-bold text-white">
                          {stats.pending.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" })}
                        </span>
                        <span className="mt-0.5 block text-xs text-blue-50/70">
                          {monthlySalesAverages.pendingRatio.toLocaleString("it-IT", { maximumFractionDigits: 1 })}% del venduto
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </div>
              </>)}
            </div>}
            {isYearCorrente && globalStats && !isGlobalStatsError && !isStatusesError && <OrdersCarryoverSummary
              previous={globalStats.previous} reasons={globalStats.reasons} showAmounts={orderPerms.canViewOrderAmounts} />}
            <details className="mt-2 text-xs text-blue-100">
              <summary className="cursor-pointer rounded py-1 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">Come vengono calcolati?</summary>
              <p className="mt-2 max-w-3xl leading-relaxed">L’anno della commessa è quello di creazione. Il riepilogo annuale include anche le completate e rimane indipendente dai filtri dell’elenco. Gli importi sono IVA inclusa. “Incassato” indica quanto riscosso su quelle commesse, non i movimenti di cassa avvenuti nell’anno. I motivi del pregresso possono sovrapporsi senza duplicare le commesse.</p>
            </details>
            {/* Cantieri finanziati dall'azienda: appare solo quando esiste il
                problema (saldo cassa negativo su commesse aperte). */}
            {orderPerms.canViewOrderAmounts && orderPerms.canViewCosts && (
              <EsposizioneFlotta
                companyId={effectiveCompany?.id}
                excludeStatusIds={[lastStatusId]}
              />
            )}
          </div>

          {analisiAperta && orderPerms.canViewOrderAmounts && !isMobile && (
          <aside id="orders-annual-chart" className="min-w-0 border-t border-slate-200 bg-white p-3 xl:border-l xl:border-t-0">
            {isMonthlyOrdersError ? <div role="alert" className="p-4 text-sm text-amber-800">Andamento non disponibile. <Button variant="outline" size="sm" onClick={()=>void queryClient.invalidateQueries({queryKey:["orders-monthly-sales-chart"]})}>Riprova grafico</Button></div> : isLoadingMonthlyOrders ? (
              <div aria-label="Caricamento andamento" className="flex h-[220px] items-end gap-3 px-4 pb-4">
                {[60,92,48,130,78,155,105,184].map((height,index)=><Skeleton key={index} className="flex-1 rounded-t-md" style={{height}}/>)}
              </div>
            ) : <OrdersMonthlyChart months={chartWithComparison}
              comparison={comparisonPeriod ? {year:comparisonPeriod.previousYear, enabled:comparisonEnabled, onToggle:()=>setCompareChart(value=>!value), loading:comparisonPending, error:comparisonError, onRetry:()=>void retryComparison(), label:comparisonPeriod.label} : undefined} period={isYearCorrente ? String(currentYear) : hasSelectedYear ? String(selectedYear) : "Ultimi 12 mesi"}
              selectedMonth={hasMonth ? `${monthYear}-${String(month+1).padStart(2,"0")}` : null}
              onSelectMonth={(key) => {const patch=orderChartMonthFilter(key,yearFilter,currentYear,scopeGroup);if(patch){setURLParams(patch);setPage(1);}}} />}
          </aside>
          )}
        </div>
      </section>

      <OrdersFilterSidebar
        filters={sidebarFilters}
        onFiltersChange={setSidebarFilters}
        statuses={statuses}
        ordersCount={isOrdersFetching || isOrdersLoading ? null : visibleTotalCount}
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
          <div className="flex flex-wrap items-start gap-2">
          {isYearCorrente && <OrdersAnnualScope year={currentYear} annualCount={globalStats?.annual.count ?? 0} previousCount={globalStats?.previous.count ?? 0}
            selected={scopeGroup} onChange={setScopeGroup} loading={isLoadingGlobalStats || isLoadingStatuses || !globalStats}
            failed={isGlobalStatsError || isStatusesError} />}
          <details className="shrink-0 rounded-xl border border-slate-200 bg-white text-sm open:basis-full">
            <summary className="cursor-pointer rounded-xl px-3 py-2 font-medium text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400">
              Stati e margini {controlFocus !== "all" || statusFilter !== "all" ? "· filtro attivo" : ""}
            </summary>
      <OrdersPeriodSummary counts={listScopeCounts}
        loading={isWorkflowStatsLoading} failed={isGlobalStatsError || isStatusesError} status={statusFilter} onStatus={setStatusFilter}
        showMargins={orderPerms.canViewMargins} margins={marginGroups} marginLoading={scopeMarginsPending} marginFailed={scopeMarginsError}
        focus={controlFocus} onFocus={setControlFocus} onRetry={() => {void retryStatuses();void retryScopeMargins();void queryClient.invalidateQueries({queryKey:["orders-global-stats"]});}} />
          </details>
          </div>
          <OrdersFilters
            trailingControls={viewMode === "table" ? (
              <div role="group" aria-label="Opzioni tabella commesse" className="hidden items-center shrink-0 gap-1.5 sm:flex">
                <span className="col-span-2 text-xs font-medium text-muted-foreground sm:col-span-1">Ordina:</span>
                <Select value={sortField} onValueChange={(v) => { setSortField(v as typeof sortField); setPage(1); }}>
                  <SelectTrigger aria-label="Ordina commesse per" className="h-8 w-[126px] px-2 text-xs">
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
                  <SelectTrigger aria-label="Direzione ordinamento" className="h-8 w-[172px] px-2 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">{
                      ["created_at","total_amount","expected_date","warehouse_arrival_date","work_start_date","work_end_date"].includes(sortField)
                        ? "↓ Più recente / grande"
                        : "↓ Z → A"
                    }</SelectItem>
                    <SelectItem value="asc">{
                      ["created_at","total_amount","expected_date","warehouse_arrival_date","work_start_date","work_end_date"].includes(sortField)
                        ? "↑ Più vecchio / piccolo"
                        : "↑ A → Z"
                    }</SelectItem>
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs" title="Colonne visibili" aria-label="Colonne visibili">
                      <Columns className="h-3.5 w-3.5" /><span>Colonne</span>
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
                            try { localStorage.setItem("orders-visible-columns-v2", JSON.stringify([...DEFAULT_COLUMNS])); } catch { /* Storage non disponibile: ripristino comunque la vista. */ }
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
            monthFilter={monthFilter}
            onMonthFilterChange={handleMonthChange}
            hasAnyFilter={hasAnyFilter}
            onClearAllFilters={clearAllFilters}
            hideCompleted={hideCompleted && statusFilter === "all"}
            onHideCompletedChange={(value) => {
              setHideCompleted(value);
              if (value) setStatusFilter("all");
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-slate-600">
            <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2">
              <span><strong className="tabular-nums text-slate-900">{isOrdersFetching || isOrdersLoading ? "…" : isOrdersError || isStatusesError ? "—" : visibleTotalCount}</strong> risultati con i filtri attuali</span>
              {(isOrdersFetching || isOrdersLoading) && <span className="text-xs">Aggiornamento elenco…</span>}
            </div>
          </div>

          {/* Content */}
          {isStatusesError ? (<div role="alert" className="rounded-xl border border-amber-200 p-4">Impossibile caricare gli stati delle commesse. <Button onClick={() => void retryStatuses()}>Riprova</Button></div>) : needsScope && ((controlFocus !== "all" && scopeMarginsError) || isGlobalStatsError) ? (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4">Impossibile verificare i dati necessari per questi filtri. <Button variant="outline" onClick={() => {void retryScopeMargins(); void queryClient.invalidateQueries({queryKey:["orders-global-stats"]});}}>Riprova</Button></div>
          ) : isOrdersError ? (
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
          ) : isOrdersLoading ? (
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
          ) : visibleOrders.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nessuna commessa trovata</h3>
                <p className="text-muted-foreground mb-4">
                  {stats.totalOrders === 0
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
                ) : stats.totalOrders > 0 && hasAnyFilter ? (
                  <Button variant="outline" onClick={clearAllFilters} className="gap-2">
                    Pulisci tutti i filtri
                  </Button>
                ) : stats.totalOrders === 0 && !isCommercialistaMode && canCreateOrders && (
                  appaltatoreEnabled ? (
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
          ) : viewMode === "pipeline" && pipelineError ? (<div role="alert" className="rounded-xl border border-amber-200 p-4">Impossibile caricare la pipeline. <Button onClick={() => void retryPipeline()}>Riprova</Button></div>) : viewMode === "pipeline" && pipelinePending ? (<p role="status">Caricamento pipeline…</p>) : viewMode === "pipeline" ? (
            <OrdersPipelineView
              orders={allOrdersForPipeline}
              statuses={statuses}
              onStatusChange={handleStatusChange}
            />
          ) : (
            <div className="space-y-4 max-sm:space-y-0">
              <OrdersTable
                canDelete={canDeleteOrders}
                previousReasons={isYearCorrente ? globalStats?.previousReasons : undefined}
                orders={visibleOrders}
                onDelete={(id) => deleteOrderMutation.mutateAsync(id)}
                isDeleting={deleteOrderMutation.isPending}
                orderCosts={orderCostsMap}
                costsState={scopeMarginsError || isGlobalStatsError ? "error" : scopeMarginsPending ? "loading" : "ready"}
                statuses={statuses}
                onBulkStatusChange={handleBulkStatusChange}
                onBulkDelete={canDeleteOrders ? handleBulkDelete : undefined}
                isBulkUpdating={isBulkUpdating}
                visibleColumns={new Set([...visibleColumns].filter(isColumnAllowed))}
                salespeopleMap={salespeopleMap}
                laborMap={laborMap}
                supplierMap={supplierMap}
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
        onImport={handleOrdersImport}
      />

      <CustomerSheetsExportDialog
        open={customerSheetsOpen}
        onOpenChange={setCustomerSheetsOpen}
      />

      {/* Bivio iniziale "Nuova Commessa" — solo se Modulo Appaltatori attivo. */}
      <OrderTypeChoiceDialog
        open={showOrderTypeDialog}
        onOpenChange={setShowOrderTypeDialog}
      />
    </div>
  );
}

export default function OrdersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Tab da scrivania (offerte, anomalie, marginalità, provvigioni) fuori dal telefono.
  const isMobile = useIsMobile();
  const permissions = usePermissions();
  // Chi ha solo il permesso «Ufficio acquisti» (senza vedere le commesse) entra
  // direttamente negli acquisti: è l'unica scheda che gli serve e che può leggere.
  const soloAcquisti = !permissions.canViewOrders && permissions.canManagePurchasing;
  const requestedTab = searchParams.get("tab") || (soloAcquisti ? "acquisto" : "ordini");
  const { isFeatureEnabled } = useFeatureFlags();
  const surveysEnabled = isFeatureEnabled("surveys_module");
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
    // I cantieri aperti oggi: chi c'è, rapportino arrivato, chi tace (prima era una voce di menu).
    { id: "oggi", label: "Cantieri oggi", icon: HardHat, show: permissions.canViewOrders },
    { id: "sopralluoghi", label: "Sopralluoghi", icon: MapIcon, show: surveysEnabled },
    // Prima degli ordini perche' e' il passo prima: si chiede il prezzo, poi si ordina.
    { id: "offerte", label: "Richieste d'offerta", icon: FileQuestion, show: permissions.canViewOrders && !isMobile },
    // Il centro degli acquisti (23/10/2026): materiali da ordinare, offerte,
    // ordini e consegne in una pipeline. Ha preso il posto di «Acquisti da fare».
    { id: "acquisto", label: "Acquisti", icon: ShoppingCart, show: permissions.canViewOrders || permissions.canManagePurchasing },
    { id: "ddt", label: "DDT", icon: FileCheck, show: permissions.canViewOrders },
    { id: "anomalie", label: "Anomalie", icon: AlertTriangle, show: permissions.canViewCosts && !isMobile },
    { id: "marginalita", label: "Marginalità", icon: PieChart, show: permissions.canViewCosts && !isMobile },
    { id: "provvigioni", label: "Provvigioni", icon: Euro, show: permissions.canViewCosts && !isMobile },
  ].filter((t) => t.show);
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : (soloAcquisti ? "acquisto" : "ordini");

  useEffect(() => {
    if (requestedTab !== activeTab) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("tab");
        return next;
      }, { replace: true });
    }
  }, [activeTab, requestedTab, setSearchParams]);

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

      {activeTab === "oggi" && (
        <ErrorBoundary title="Errore in Cantieri oggi">
          <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Caricamento cantieri…</div>}>
            <CantieriOggi />
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

    </div>
  );
}
