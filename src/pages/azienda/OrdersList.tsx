import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useURLFilters } from "@/hooks/useURLFilters";
import { usePermissions } from "@/hooks/usePermissions";
import { Plus, Package, LayoutList, Columns3, Download, Upload, MoreVertical, ChevronLeft, ChevronRight, ClipboardList, ShoppingCart, AlertTriangle, PieChart, SlidersHorizontal, Columns, FileCheck, FileText, FileSpreadsheet, ChevronDown, CalendarDays, Users as UsersIcon, Target, LifeBuoy, Hammer, CheckCircle2, ShieldCheck, ShoppingBag, Euro, TrendingUp, AlertCircle, Map as MapIcon } from "lucide-react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

// 🆕 Sprint S3: Sopralluoghi come tab dentro Commesse
const SopralluoghiList = lazy(() => import("@/pages/azienda/sopralluoghi/SopralluoghiList"));
const OrderCommissionsOverview = lazy(() =>
  import("@/components/orders/OrderCommissionsOverview").then((module) => ({
    default: module.OrderCommissionsOverview,
  }))
);
import { OrdersFilterSidebar, INITIAL_FILTER_STATE, countActiveFilters, type OrdersFilterState } from "@/components/orders/OrdersFilterSidebar";
import PurchaseOrdersList from "@/pages/azienda/PurchaseOrdersList";
import DDTRicezioneList from "@/pages/azienda/DDTRicezioneList";
import GlobalErrors from "@/pages/azienda/GlobalErrors";
import MarginalitaCantieri from "@/pages/azienda/MarginalitaCantieri";
import { format } from "date-fns";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { calculateNetFromGross } from "@/lib/vatUtils";
import { calculateStoredCommissionNet } from "@/lib/commissions";
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
import { type OrderWithDetails, getAmountDue, getAmountCollected, getPendingPayments, deleteOrderCascading, getGrossOrderAmount, getOrderMargin } from "@/lib/orderUtils";
import { PlanLimitWarning } from "@/components/billing/PlanLimitWarning";
import { ScopriProgressBanner } from "@/components/subscription/UpgradeScopriBanner";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useAppaltatoreModuleEnabled } from "@/hooks/useAppaltatoreModule";
import { OrderTypeChoiceDialog } from "@/components/orders/OrderTypeChoiceDialog";

// MP-CAN-001 — types/constants estratti in ./OrdersList/constants.ts
import {
  type DateRange,
  ORDER_IMPORT_FIELDS,
  PENDING_PAYMENTS_FILTER,
  EMPTY_ORDERS,
} from "./OrdersList/constants";

function OrdersListInner() {
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const { remainingOrders, currentPlan } = useSubscriptionLimits();
  const [searchParams] = useSearchParams();
  const isCommercialistaMode = searchParams.get("commercialistaMode") === "1";
  const appaltatoreEnabled = useAppaltatoreModuleEnabled();
  const [showOrderTypeDialog, setShowOrderTypeDialog] = useState(false);
  const queryClient = useQueryClient();
  const { params: urlFilters, setParam: setURLParam } = useURLFilters({
    searchQuery: { key: "q", defaultValue: "" },
    statusFilter: { key: "status", defaultValue: "all" },
    paymentFilter: { key: "payment", defaultValue: "all" },
    viewMode: { key: "view", defaultValue: (() => { try { return localStorage.getItem("orders-view-mode") || "table"; } catch { return "table"; } })() },
    customerFilter: { key: "cliente", defaultValue: "all" },
    yearFilter: { key: "anno", defaultValue: "all" },
    monthFilter: { key: "mese", defaultValue: "all" },
    salespersonFilter: { key: "venditore", defaultValue: "all" },
    laborFilter: { key: "manodopera", defaultValue: "all" },
    supplierFilter: { key: "fornitore", defaultValue: "all" },
    controlFocus: { key: "focus", defaultValue: "all" },
    hideCompleted: { key: "nascondi_completati", defaultValue: true, serialize: (v) => v ? "1" : "0", deserialize: (v) => v === "1" },
  });

  const searchQuery = urlFilters.searchQuery;
  const debouncedSearch = useDebounce(searchQuery, 400);
  const setSearchQuery = useCallback((v: string) => setURLParam("searchQuery", v), [setURLParam]);
  const statusFilter = urlFilters.statusFilter;
  const setStatusFilter = useCallback((v: string) => setURLParam("statusFilter", v), [setURLParam]);
  const paymentFilter = urlFilters.paymentFilter as "all" | "pending" | "paid";
  const setPaymentFilter = useCallback((v: "all" | "pending" | "paid") => setURLParam("paymentFilter", v), [setURLParam]);
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
  const controlFocus = urlFilters.controlFocus as "all" | "low_margin" | "missing_data";
  const setControlFocus = useCallback((v: "all" | "low_margin" | "missing_data") => setURLParam("controlFocus", v), [setURLParam]);
  const hideCompleted = urlFilters.hideCompleted;
  const setHideCompleted = useCallback((v: boolean) => setURLParam("hideCompleted", v), [setURLParam]);
  const [contractDateRange, setContractDateRange] = useState<DateRange>(() => {
    // Deep-link (drill-down dai grafici trend): con ?mese=N[&anno=YYYY] il
    // range date deve valere anche al primo load — prima lo impostavano solo
    // gli handler interattivi, quindi il link diretto non filtrava nulla.
    const month = parseInt(urlFilters.monthFilter);
    if (urlFilters.monthFilter !== "all" && Number.isInteger(month) && month >= 0 && month <= 11) {
      const annoNum = Number(urlFilters.yearFilter);
      const year = urlFilters.yearFilter !== "all" && Number.isInteger(annoNum) ? annoNum : new Date().getFullYear();
      return { from: new Date(year, month, 1), to: new Date(year, month + 1, 0) };
    }
    return { from: undefined, to: undefined };
  });
  const [warehouseDateRange, setWarehouseDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [expectedDateRange, setExpectedDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [importOpen, setImportOpen] = useState(false);
  const [customerSheetsOpen, setCustomerSheetsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarFilters, setSidebarFilters] = useState<OrdersFilterState>(INITIAL_FILTER_STATE);

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
  const selectedYear = yearFilter !== "all" ? Number(yearFilter) : null;
  const hasSelectedYear = Number.isInteger(selectedYear);

  // Gli stati servono per i filtri workflow, ma non devono bloccare i KPI economici.
  const { data: statuses = [], isLoading: isLoadingStatuses } = useQuery({
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

  const { data: ordersResult, isLoading: isLoadingOrders, isError: isOrdersError, error: ordersError, refetch: refetchOrders } = useQuery({
    queryKey: ["orders", effectiveCompany?.id, page, pageSize, debouncedSearch, statusFilter, paymentFilter, customerFilter, yearFilter, amountMin, amountMax, salespersonFilter, laborFilter, supplierFilter, hideCompleted, lastStatusId, supportStatusId, contractDateRange, warehouseDateRange, expectedDateRange, sortField, sortDir],
    queryFn: async () => {
      if (!effectiveCompany?.id) return { orders: [] as OrderWithDetails[], totalCount: 0 };

      // B1 — subquery per filtri che richiedono join
      let allowedOrderIds: string[] | null = null;

      if (salespersonFilter !== "all") {
        const { data: spOrders } = await supabase
          .from("order_salespeople")
          .select("order_id")
          .eq("salesperson_id", salespersonFilter);
        const ids = (spOrders || []).map(r => r.order_id);
        if (ids.length === 0) return { orders: [] as OrderWithDetails[], totalCount: 0 };
        allowedOrderIds = ids;
      }

      if (laborFilter !== "all") {
        const isTeam = laborFilter.startsWith("team-");
        const realId = laborFilter.replace(/^(emp-|team-)/, "");
        const { data: laborOrders } = await supabase
          .from(isTeam ? "order_external_teams" : "order_employees")
          .select("order_id")
          .eq(isTeam ? "external_team_id" : "employee_id", realId);
        const ids = (laborOrders || []).map(r => r.order_id);
        if (ids.length === 0) return { orders: [] as OrderWithDetails[], totalCount: 0 };
        allowedOrderIds = allowedOrderIds
          ? allowedOrderIds.filter(id => ids.includes(id))
          : ids;
      }

      if (supplierFilter !== "all") {
        const { data: suppOrders } = await supabase
          .from("order_items")
          .select("order_id")
          .eq("supplier_id", supplierFilter);
        const ids = [...new Set((suppOrders || []).map(r => r.order_id))];
        if (ids.length === 0) return { orders: [] as OrderWithDetails[], totalCount: 0 };
        allowedOrderIds = allowedOrderIds
          ? allowedOrderIds.filter(id => ids.includes(id))
          : ids;
      }

      if (allowedOrderIds !== null && allowedOrderIds.length === 0) {
        return { orders: [] as OrderWithDetails[], totalCount: 0 };
      }

      let query = supabase
        .from("orders")
        .select(`
          id, order_code, description, total_amount, deposit_amount, balance_amount,
          vat_rate, created_at, expected_date, work_start_date, work_end_date,
          warehouse_arrival_date, customer_id, current_status_id, payment_type,
          financing_amount, financing_cost, deposit_2_amount, has_building_bonus,
          deposit_paid, deposit_2_paid, balance_paid, financing_paid,
          order_type,
          customer:profiles!orders_customer_id_fkey(first_name, last_name, email),
          status:order_statuses!orders_current_status_id_fkey(name, color)
        `, { count: "exact" })
        .eq("company_id", effectiveCompany.id);

      if (allowedOrderIds !== null) query = query.in("id", allowedOrderIds);
      // B1 — customerFilter e paymentFilter applicati server-side
      if (customerFilter !== "all") query = query.eq("customer_id", customerFilter);
      if (paymentFilter === "pending") {
        query = query.or(PENDING_PAYMENTS_FILTER);
      } else if (paymentFilter === "paid") {
        query = query
          .eq("deposit_paid", true)
          .eq("balance_paid", true)
          .or("deposit_2_amount.is.null,deposit_2_amount.eq.0,deposit_2_paid.eq.true")
          .or("financing_amount.is.null,financing_amount.eq.0,financing_paid.eq.true");
      }
      if (debouncedSearch) {
        // Sanitize: PostgREST `.or()` interpreta virgole/parentesi come separatori → safer escape
        const safe = debouncedSearch.replace(/[(),]/g, " ").trim();
        if (safe) {
          query = query.or(
            `description.ilike.%${safe}%,order_code.ilike.%${safe}%,client_name.ilike.%${safe}%`
          );
        }
      }
      if (statusFilter === "__da_completare__") {
        // Sentinel "Da completare": esclude ordini in Assistenza e Completati
        const excl = [supportStatusId, lastStatusId].filter(Boolean) as string[];
        if (excl.length) query = query.not("current_status_id", "in", `(${excl.join(",")})`);
      } else if (statusFilter === "__assistenza__") {
        // Sentinel "Assistenza": solo ordini in fase Assistenza
        if (supportStatusId) query = query.eq("current_status_id", supportStatusId);
      } else if (statusFilter === "__completati__") {
        if (lastStatusId) query = query.eq("current_status_id", lastStatusId);
      } else if (statusFilter !== "all") {
        query = query.eq("current_status_id", statusFilter);
      }
      if (hideCompleted && statusFilter === "all" && lastStatusId) {
        query = query.or(`current_status_id.neq.${lastStatusId},current_status_id.is.null`);
      }
      if (amountMin) query = query.gte("total_amount", parseFloat(amountMin));
      if (amountMax) query = query.lte("total_amount", parseFloat(amountMax));
      if (hasSelectedYear && selectedYear && monthFilter === "all") {
        query = query
          .gte("created_at", new Date(selectedYear, 0, 1).toISOString())
          .lte("created_at", new Date(selectedYear, 11, 31, 23, 59, 59, 999).toISOString());
      }
      if (contractDateRange.from) query = query.gte("created_at", contractDateRange.from.toISOString());
      if (contractDateRange.to) query = query.lte("created_at", new Date(contractDateRange.to.getTime() + 86400000 - 1).toISOString());
      if (warehouseDateRange.from) query = query.gte("warehouse_arrival_date", warehouseDateRange.from.toISOString().split("T")[0]);
      if (warehouseDateRange.to) query = query.lte("warehouse_arrival_date", new Date(warehouseDateRange.to.getTime() + 86400000 - 1).toISOString().split("T")[0]);
      if (expectedDateRange.from) query = query.gte("expected_date", expectedDateRange.from.toISOString().split("T")[0]);
      if (expectedDateRange.to) query = query.lte("expected_date", new Date(expectedDateRange.to.getTime() + 86400000 - 1).toISOString().split("T")[0]);

      // 🛠️ Server-side sort: usa sortField/sortDir dal state (default
      // created_at desc). NULL last per scadenze/date così le commesse
      // senza data programmata finiscono in fondo (UX più chiara).
      const isDateSort = ["expected_date", "warehouse_arrival_date", "work_start_date", "work_end_date"].includes(sortField);
      query = query
        .range((page - 1) * pageSize, page * pageSize - 1)
        .order(sortField, {
          ascending: sortDir === "asc",
          nullsFirst: isDateSort ? false : (sortDir === "asc"),
        });

      const { data, error, count } = await query;
      if (error) throw error;
      return { orders: data as OrderWithDetails[], totalCount: count ?? 0 };
    },
    enabled: !!effectiveCompany?.id,
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const rawOrders = ordersResult?.orders ?? EMPTY_ORDERS;
  const totalCount = ordersResult?.totalCount ?? 0;
  const isOrdersLoading = !!effectiveCompany?.id && !isOrdersError && (isLoadingOrders || !ordersResult);

  // KPI stats principali: reagiscono solo all'annualità, non ai filtri operativi
  // come stato, ricerca, pagamento o vista. Così restano numeri di controllo,
  // ma possono essere letti per anno quando serve.
  const { data: globalStats, isLoading: isLoadingGlobalStats, isError: isGlobalStatsError } = useQuery({
    queryKey: ["orders-global-stats", effectiveCompany?.id, yearFilter, lastStatusId, supportStatusId],
    queryFn: async () => {
      const EMPTY = { totalOrders: 0, totalGross: 0, collected: 0, pending: 0, countAssistenza: 0, countCompletati: 0, countDaCompletare: 0 };
      if (!effectiveCompany?.id) return EMPTY;
      let query = supabase
        .from("orders")
        .select("id, total_amount, vat_rate, deposit_amount, deposit_2_amount, balance_amount, deposit_paid, deposit_2_paid, balance_paid, financing_amount, financing_paid, payment_type, current_status_id")
        .eq("company_id", effectiveCompany.id);
      if (hasSelectedYear && selectedYear) {
        query = query
          .gte("created_at", new Date(selectedYear, 0, 1).toISOString())
          .lte("created_at", new Date(selectedYear, 11, 31, 23, 59, 59, 999).toISOString());
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = data || [];
      const totalGross = rows.reduce((sum, o) => sum + (o.total_amount || 0) * (1 + ((o.vat_rate ?? 22) / 100)), 0);
      const collected = rows.reduce((sum, o) => sum + getAmountCollected(o as any), 0);
      const pending = rows.reduce((sum, o) => sum + getAmountDue(o as any), 0);
      let countAssistenza = 0;
      let countCompletati = 0;
      for (const o of rows) {
        if (o.current_status_id && supportStatusId && o.current_status_id === supportStatusId) countAssistenza++;
        else if (o.current_status_id && lastStatusId && o.current_status_id === lastStatusId) countCompletati++;
      }
      const countDaCompletare = rows.length - countAssistenza - countCompletati;
      return { totalOrders: rows.length, totalGross, collected, pending, countAssistenza, countCompletati, countDaCompletare };
    },
    enabled: !!effectiveCompany?.id,
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000,
  });

  const { data: availableYears = [] } = useQuery({
    queryKey: ["orders-available-years", effectiveCompany?.id],
    queryFn: async () => {
      const currentYear = new Date().getFullYear();
      if (!effectiveCompany?.id) return [currentYear];
      const { data, error } = await supabase
        .from("orders")
        .select("created_at")
        .eq("company_id", effectiveCompany.id)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const years = new Set<number>([currentYear - 1, currentYear, currentYear + 1]);
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

  const { data: monthlyOrders = [], isLoading: isLoadingMonthlyOrders, isError: isMonthlyOrdersError } = useQuery({
    queryKey: ["orders-monthly-sales-chart", effectiveCompany?.id, yearFilter],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const from = new Date();
      let to: Date | null = null;
      if (hasSelectedYear && selectedYear) {
        from.setFullYear(selectedYear, 0, 1);
        from.setHours(0, 0, 0, 0);
        to = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
      } else {
        from.setMonth(from.getMonth() - 11);
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
      }

      let query = supabase
        .from("orders")
        .select(`
          id, created_at, total_amount, vat_rate,
          deposit_amount, deposit_paid,
          deposit_2_amount, deposit_2_paid,
          balance_amount, balance_paid,
          financing_amount, financing_paid
        `)
        .eq("company_id", effectiveCompany.id)
        .gte("created_at", from.toISOString());
      if (to) query = query.lte("created_at", to.toISOString());
      const { data, error } = await query
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    // Grafico 12 mesi non mostrato su mobile → non scaricare i dati lì.
    enabled: !!effectiveCompany?.id && !isMobile,
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000,
  });

  // (Rimossa la query "aggregates" filtrata: le KPI cards ora usano globalStats
  // che NON reagisce ai filtri. Se in futuro serviranno statistiche della vista
  // corrente, vanno derivate da `rawOrders` o da una nuova query dedicata.)

  // B3 — query indipendente per la vista Pipeline (tutti gli ordini, nessuna paginazione)
  const { data: allOrdersForPipeline = [] } = useQuery({
    queryKey: ["orders-pipeline", effectiveCompany?.id, statusFilter, yearFilter, hideCompleted, lastStatusId, supportStatusId, debouncedSearch, customerFilter],
    queryFn: async () => {
      if (!effectiveCompany?.id || viewMode !== "pipeline") return [] as OrderWithDetails[];
      let q = supabase
        .from("orders")
        .select(`
          id, order_code, description, total_amount, deposit_amount, balance_amount,
          vat_rate, created_at, expected_date, work_start_date, work_end_date,
          warehouse_arrival_date, indirizzo_lavori, customer_id, current_status_id, payment_type,
          financing_amount, deposit_2_amount, has_building_bonus,
          deposit_paid, deposit_2_paid, balance_paid, financing_paid,
          order_type,
          customer:profiles!orders_customer_id_fkey(first_name, last_name, email),
          status:order_statuses!orders_current_status_id_fkey(name, color),
          order_items(id, status, quantity),
          order_employees(employee:employees(id, first_name, last_name)),
          order_external_teams(external_team:external_teams(id, name))
        `)
        .eq("company_id", effectiveCompany.id)
        .order("created_at", { ascending: false });
      if (debouncedSearch) q = q.or(`description.ilike.%${debouncedSearch}%,order_code.ilike.%${debouncedSearch}%`);
      if (statusFilter === "__da_completare__") {
        const excl = [supportStatusId, lastStatusId].filter(Boolean) as string[];
        if (excl.length) q = q.not("current_status_id", "in", `(${excl.join(",")})`);
      } else if (statusFilter === "__assistenza__") {
        if (supportStatusId) q = q.eq("current_status_id", supportStatusId);
      } else if (statusFilter === "__completati__") {
        if (lastStatusId) q = q.eq("current_status_id", lastStatusId);
      } else if (statusFilter !== "all") q = q.eq("current_status_id", statusFilter);
      if (hideCompleted && statusFilter === "all" && lastStatusId) q = q.or(`current_status_id.neq.${lastStatusId},current_status_id.is.null`);
      if (customerFilter !== "all") q = q.eq("customer_id", customerFilter);
      if (hasSelectedYear && selectedYear) {
        q = q
          .gte("created_at", new Date(selectedYear, 0, 1).toISOString())
          .lte("created_at", new Date(selectedYear, 11, 31, 23, 59, 59, 999).toISOString());
      }
      // Cap pipeline to 200 most recent orders to prevent performance issues with large datasets
      q = q.limit(200);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as OrderWithDetails[];
    },
    enabled: !!effectiveCompany?.id && viewMode === "pipeline",
    staleTime: 3 * 60 * 1000,
  });

  // Batch queries for cost calculations — use rawOrders IDs to avoid circular dep with salespeopleMap
  const orderIds = useMemo(() => rawOrders.map(o => o.id), [rawOrders]);

  const { data: itemCosts = [] } = useQuery({
    queryKey: ["order-items-costs", effectiveCompany?.id, orderIds],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, purchase_price, quantity, vat_rate, supplier_id")
        .in("order_id", orderIds);
      if (error) throw error;
      return data;
    },
    enabled: orderIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const { data: employeeCosts = [] } = useQuery({
    queryKey: ["order-employees-costs", effectiveCompany?.id, orderIds],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_employees")
        .select("order_id, total_cost, employee_id, employee:employees(id, first_name, last_name)")
        .in("order_id", orderIds);
      if (error) throw error;
      return data;
    },
    enabled: orderIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const { data: externalTeamCosts = [] } = useQuery({
    queryKey: ["order-external-teams-costs", effectiveCompany?.id, orderIds],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_external_teams")
        .select("order_id, total_cost, vat_rate, external_team_id, external_team:external_teams(id, name)")
        .in("order_id", orderIds);
      if (error) throw error;
      return data;
    },
    enabled: orderIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const { data: salespeopleData = [] } = useQuery({
    queryKey: ["order-salespeople-costs", effectiveCompany?.id, orderIds],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_salespeople")
        .select("order_id, commission_amount, deduction_amount, salesperson_id, salesperson:salespeople(id, first_name, last_name)")
        .in("order_id", orderIds);
      if (error) throw error;
      return data;
    },
    enabled: orderIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

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

  // Build supplier map from order_items
  const supplierIds = useMemo(() => [...new Set(itemCosts.map(i => i.supplier_id).filter(Boolean) as string[])], [itemCosts]);

  const { data: supplierProfiles = [] } = useQuery({
    queryKey: ["supplier-profiles", supplierIds],
    queryFn: async () => {
      if (supplierIds.length === 0) return [];
      const { data, error } = await supabase.from("suppliers").select("id, name").in("id", supplierIds);
      if (error) throw error;
      return data;
    },
    enabled: supplierIds.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

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

  // Unique lists for filter dropdowns
  const uniqueSalespeople = useMemo(() => {
    const map = new Map<string, string>();
    for (const sp of salespeopleData) {
      const p = (sp as any).salesperson;
      if (p) map.set(p.id, `${p.first_name} ${p.last_name}`);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [salespeopleData]);

  const uniqueLabor = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employeeCosts) {
      const emp = (e as any).employee;
      if (emp) map.set(`emp-${emp.id}`, `${emp.first_name} ${emp.last_name}`);
    }
    for (const t of externalTeamCosts) {
      const team = (t as any).external_team;
      if (team) map.set(`team-${team.id}`, team.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [employeeCosts, externalTeamCosts]);

  const uniqueSuppliers = useMemo(() => {
    return supplierProfiles.map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [supplierProfiles]);

  // Apply sidebar client-side filters — placed here so salespeopleMap/laborMap/unique* are available
  const orders = useMemo(() => {
    let result = rawOrders;
    const sf = sidebarFilters;

    if (sf.dateFrom) {
      const from = new Date(sf.dateFrom);
      result = result.filter(o => o.created_at && new Date(o.created_at) >= from);
    }
    if (sf.dateTo) {
      const to = new Date(sf.dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(o => o.created_at && new Date(o.created_at) <= to);
    }
    if (sf.orderSearch) {
      const q = sf.orderSearch.toLowerCase();
      result = result.filter(o =>
        (o.order_code || "").toLowerCase().includes(q) ||
        (o.description || "").toLowerCase().includes(q)
      );
    }
    if (sf.includeStatuses.length > 0) {
      result = result.filter(o => sf.includeStatuses.includes(o.current_status_id || ""));
    }
    if (sf.excludeStatuses.length > 0) {
      result = result.filter(o => !sf.excludeStatuses.includes(o.current_status_id || ""));
    }
    if (sf.paymentStatus === "paid") {
      result = result.filter(o => o.deposit_paid && o.balance_paid);
    } else if (sf.paymentStatus === "unpaid" || sf.paymentStatus === "overdue") {
      result = result.filter(o => !o.deposit_paid || !o.balance_paid);
    }
    if (sf.amountMin) {
      result = result.filter(o => (o.total_amount || 0) >= parseFloat(sf.amountMin));
    }
    if (sf.amountMax) {
      result = result.filter(o => (o.total_amount || 0) <= parseFloat(sf.amountMax));
    }
    if (sf.createdFrom) {
      const from = new Date(sf.createdFrom);
      result = result.filter(o => o.created_at && new Date(o.created_at) >= from);
    }
    if (sf.createdTo) {
      const to = new Date(sf.createdTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(o => o.created_at && new Date(o.created_at) <= to);
    }
    if (sf.salespersonId) {
      const orderIdsWithSp = new Set(
        salespeopleData
          .filter((sp: any) => sp.salesperson_id === sf.salespersonId)
          .map((sp: any) => sp.order_id)
      );
      result = result.filter(o => orderIdsWithSp.has(o.id));
    }
    if (sf.laborIds.length > 0) {
      const empIds = sf.laborIds.filter(id => id.startsWith("emp-")).map(id => id.slice(4));
      const teamIds = sf.laborIds.filter(id => id.startsWith("team-")).map(id => id.slice(5));
      const orderIdsWithLabor = new Set([
        ...employeeCosts.filter((e: any) => empIds.includes(e.employee_id)).map((e: any) => e.order_id),
        ...externalTeamCosts.filter((t: any) => teamIds.includes(t.external_team_id)).map((t: any) => t.order_id),
      ]);
      result = result.filter(o => orderIdsWithLabor.has(o.id));
    }
    return result;
  }, [rawOrders, sidebarFilters, salespeopleData, employeeCosts, externalTeamCosts]);

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
  const orderPerms = usePermissions();
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

  // Build orderCosts map
  const orderCostsMap = useMemo(() => {
    const map = new Map<string, { variableCosts: number; grossMargin: number }>();
    const orderAmountMap = new Map(orders.map(o => [o.id, o.total_amount]));

    // Aggregate item costs per order (purchase_price is gross, needs VAT scorporo)
    const itemCostsByOrder = new Map<string, number>();
    for (const item of itemCosts) {
      const gross = (item.purchase_price || 0) * (item.quantity || 1);
      const { netAmount } = calculateNetFromGross(gross, item.vat_rate ?? 22);
      itemCostsByOrder.set(item.order_id, (itemCostsByOrder.get(item.order_id) || 0) + netAmount);
    }

    // Aggregate employee costs per order (already net)
    const empCostsByOrder = new Map<string, number>();
    for (const e of employeeCosts) {
      empCostsByOrder.set(e.order_id, (empCostsByOrder.get(e.order_id) || 0) + e.total_cost);
    }

    // Aggregate external team costs per order (gross, needs scorporo)
    const teamCostsByOrder = new Map<string, number>();
    for (const t of externalTeamCosts) {
      const { netAmount } = calculateNetFromGross(t.total_cost, t.vat_rate ?? 22);
      teamCostsByOrder.set(t.order_id, (teamCostsByOrder.get(t.order_id) || 0) + netAmount);
    }

    // Aggregate commissions per order. Stored values are the authoritative output of the commission engine.
    const commissionsByOrder = new Map<string, number>();
    for (const sp of salespeopleData) {
      const commission = calculateStoredCommissionNet(sp.commission_amount, sp.deduction_amount);
      commissionsByOrder.set(sp.order_id, (commissionsByOrder.get(sp.order_id) || 0) + commission);
    }

    for (const orderId of orderIds) {
      const totalAmount = orderAmountMap.get(orderId) || 0;
      const variableCosts =
        (itemCostsByOrder.get(orderId) || 0) +
        (empCostsByOrder.get(orderId) || 0) +
        (teamCostsByOrder.get(orderId) || 0) +
        (commissionsByOrder.get(orderId) || 0);
      const grossMargin = totalAmount - variableCosts;
      map.set(orderId, { variableCosts, grossMargin });
    }

    return map;
  }, [orders, orderIds, itemCosts, employeeCosts, externalTeamCosts, salespeopleData]);

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
      queryClient.invalidateQueries({ queryKey: ["orders"] });
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

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const companyId = effectiveCompany?.id;
      if (!companyId) throw new Error("Nessuna azienda selezionata.");
      if (!canDeleteOrders) throw new Error("Non hai il permesso di eliminare le commesse (chiedi all'amministratore).");
      return deleteOrderCascading(orderId, companyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      toast({ title: "Commessa eliminata", description: "La commessa è stata eliminata con successo" });
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
      queryClient.invalidateQueries({ queryKey: ["orders"] });
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
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      if (failed === 0) {
        toast({
          title: "Commesse eliminate",
          description: `${ok} ordin${ok === 1 ? "e eliminato" : "i eliminati"} con successo`,
        });
      } else if (ok === 0) {
        toast({
          title: "Eliminazione fallita",
          description: `Nessuna commessa eliminata. Verifica permessi o riprova.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Eliminazione parziale",
          description: `${ok} eliminati · ${failed} falliti. Le righe fallite sono ancora presenti.`,
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
    paymentFilter !== "all" || customerFilter !== "all" || yearFilter !== "all" || amountMin || amountMax ||
    salespersonFilter !== "all" || laborFilter !== "all" || supplierFilter !== "all" ||
    controlFocus !== "all" || !hideCompleted);

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
    setSearchQuery("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setCustomerFilter("all");
    setYearFilter("all");
    setAmountMin("");
    setAmountMax("");
    setMonthFilter("all");
    setSalespersonFilter("all");
    setLaborFilter("all");
    setSupplierFilter("all");
    setControlFocus("all");
    setHideCompleted(true);
    setContractDateRange({ from: undefined, to: undefined });
    setWarehouseDateRange({ from: undefined, to: undefined });
    setExpectedDateRange({ from: undefined, to: undefined });
    setPage(1);
  };

  const handleMonthChange = (value: string) => {
    setMonthFilter(value);
    if (value === "all") {
      setContractDateRange({ from: undefined, to: undefined });
    } else {
      const year = hasSelectedYear && selectedYear ? selectedYear : new Date().getFullYear();
      const month = parseInt(value);
      const from = new Date(year, month, 1);
      const to = new Date(year, month + 1, 0);
      setContractDateRange({ from, to });
    }
    setPage(1);
  };

  const handleYearChange = (value: string) => {
    setYearFilter(value);
    const parsedYear = value !== "all" ? Number(value) : null;
    if (monthFilter !== "all" && Number.isInteger(parsedYear)) {
      const month = parseInt(monthFilter);
      const from = new Date(parsedYear as number, month, 1);
      const to = new Date(parsedYear as number, month + 1, 0);
      setContractDateRange({ from, to });
    } else if (monthFilter !== "all") {
      const month = parseInt(monthFilter);
      const year = new Date().getFullYear();
      setContractDateRange({ from: new Date(year, month, 1), to: new Date(year, month + 1, 0) });
    }
    setPage(1);
  };

  // Reset page to 1 when any filter changes
  const filterKey = `${searchQuery}|${statusFilter}|${paymentFilter}|${customerFilter}|${yearFilter}|${amountMin}|${amountMax}|${monthFilter}|${salespersonFilter}|${laborFilter}|${supplierFilter}|${controlFocus}|${hideCompleted}|${contractDateRange.from}|${contractDateRange.to}|${warehouseDateRange.from}|${warehouseDateRange.to}|${expectedDateRange.from}|${expectedDateRange.to}`;
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
    averageGross: (globalStats?.totalOrders ?? 0) > 0
      ? (globalStats?.totalGross ?? 0) / (globalStats?.totalOrders ?? 1)
      : 0,
    grossMargin: orders.reduce((sum, order) => sum + (orderCostsMap.get(order.id)?.grossMargin ?? order.total_amount), 0),
    lowMarginCount: orders.reduce((count, order) => {
      const costs = orderCostsMap.get(order.id);
      if (!costs) return count;
      const margin = getOrderMargin(order.total_amount, costs.variableCosts);
      return margin.level !== "good" ? count + 1 : count;
    }, 0),
  }), [globalStats, orders, orderCostsMap]);

  const controlRoom = useMemo(() => {
    const orderSignals = orders.map((order) => {
      const amountDue = getAmountDue(order);
      const costs = orderCostsMap.get(order.id);
      const margin = getOrderMargin(order.total_amount || 0, costs?.variableCosts || 0);
      const isSupport = Boolean(supportStatusId && order.current_status_id === supportStatusId);
      const isCompleted = Boolean(lastStatusId && order.current_status_id === lastStatusId);
      const isUnplanned = !order.expected_date && !order.work_start_date;
      let score = 0;
      let reason = "Da monitorare";
      let tone: "red" | "orange" | "blue" | "emerald" = "blue";
      let amount = amountDue;

      if (costs && margin.level === "negative") {
        score += 90;
        reason = "Margine negativo";
        tone = "red";
        amount = Math.abs(margin.grossMargin);
      } else if (costs && margin.level === "low") {
        score += 62;
        reason = "Margine basso";
        tone = "orange";
        amount = Math.max(0, (order.total_amount || 0) * 0.2 - margin.grossMargin);
      }

      if (amountDue > 0) {
        score += Math.min(42, amountDue / 10000);
        if (reason === "Da monitorare") {
          reason = "Da incassare";
          tone = "orange";
          amount = amountDue;
        }
      }

      if (isSupport) {
        score += 24;
        if (reason === "Da monitorare") {
          reason = "In assistenza";
          tone = "orange";
        }
      }

      if (isUnplanned && !isCompleted) {
        score += 14;
        if (reason === "Da monitorare") {
          reason = "Da pianificare";
          tone = "blue";
        }
      }

      return { order, amountDue, costs, margin, isSupport, isCompleted, isUnplanned, score, reason, tone, amount };
    });

    const lowMargin = orderSignals.filter((item) => item.costs && item.margin.level !== "good");
    const support = orderSignals.filter((item) => item.isSupport);
    const toComplete = orderSignals.filter((item) => !item.isCompleted && !item.isSupport);
    const unplanned = orderSignals.filter((item) => item.isUnplanned && !item.isCompleted);
    const missingCustomer = orderSignals.filter((item) => !item.order.customer);
    const missingStatus = orderSignals.filter((item) => !item.order.current_status_id);
    const missingDataCount = new Set([
      ...unplanned.map((item) => item.order.id),
      ...missingCustomer.map((item) => item.order.id),
      ...missingStatus.map((item) => item.order.id),
    ]).size;
    const priorities = orderSignals
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const insight = priorities[0]
      ? `${priorities[0].reason}: ${priorities[0].order.order_code || priorities[0].order.description || "commessa"} e altre ${Math.max(0, priorities.length - 1)} priorità.`
      : "Nessuna priorità critica nella vista corrente.";

    return {
      lowMarginCount: stats.lowMarginCount || lowMargin.length,
      supportCount: stats.countAssistenza || support.length,
      toCompleteCount: stats.countDaCompletare || toComplete.length,
      unplannedCount: unplanned.length,
      missingCustomerCount: missingCustomer.length,
      missingStatusCount: missingStatus.length,
      missingDataCount,
      priorities,
      insight,
    };
  }, [orders, orderCostsMap, supportStatusId, lastStatusId, stats.lowMarginCount, stats.countAssistenza, stats.countDaCompletare]);

  const visibleOrders = useMemo(() => {
    if (controlFocus === "low_margin") {
      return orders.filter((order) => {
        const costs = orderCostsMap.get(order.id);
        if (!costs) return false;
        return getOrderMargin(order.total_amount || 0, costs.variableCosts).level !== "good";
      });
    }
    if (controlFocus === "missing_data") {
      return orders.filter((order) => !order.customer || !order.current_status_id || (!order.expected_date && !order.work_start_date));
    }
    return orders;
  }, [orders, orderCostsMap, controlFocus]);

  const visibleTotalCount = controlFocus === "all" ? totalCount : visibleOrders.length;
  const visibleShowingFrom = controlFocus === "all" ? showingFrom : (visibleOrders.length > 0 ? 1 : 0);
  const visibleShowingTo = controlFocus === "all" ? showingTo : visibleOrders.length;

  const monthlySalesChart = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = hasSelectedYear && selectedYear
        ? new Date(selectedYear, index, 1)
        : new Date();
      if (!(hasSelectedYear && selectedYear)) {
        date.setMonth(date.getMonth() - (11 - index));
      }
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
    });

    return months;
  }, [monthlyOrders, hasSelectedYear, selectedYear]);

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
      ordersPerMonth: monthlySalesTotals.commesse / months,
      soldPerOrder: monthlySalesTotals.commesse > 0 ? monthlySalesTotals.venduto / monthlySalesTotals.commesse : 0,
      collectedPerMonth: monthlySalesTotals.incassato / months,
      pendingRatio: stats.totalGross > 0 ? (stats.pending / stats.totalGross) * 100 : 0,
    };
  }, [monthlySalesChart.length, monthlySalesTotals, stats.pending, stats.totalGross]);

  // Export CSV
  // M2 — Export CSV con tutti i filtri attivi (non solo i 20 della pagina corrente)
  const prepareExportData = useCallback(async () => {
    if (!effectiveCompany?.id) return null;
    toast({ title: "Esportazione in corso..." });

    // Subquery join filters (stesso pattern di B1)
    let allowedExportIds: string[] | null = null;
    if (salespersonFilter !== "all") {
      const { data: r } = await supabase.from("order_salespeople").select("order_id").eq("salesperson_id", salespersonFilter);
      const ids = (r || []).map(x => x.order_id);
      if (!ids.length) { toast({ title: "Nessuna commessa da esportare" }); return null; }
      allowedExportIds = ids;
    }
    if (laborFilter !== "all") {
      const isTeam = laborFilter.startsWith("team-");
      const realId = laborFilter.replace(/^(emp-|team-)/, "");
      const { data: r } = await supabase
        .from(isTeam ? "order_external_teams" : "order_employees")
        .select("order_id")
        .eq(isTeam ? "external_team_id" : "employee_id", realId);
      const ids = (r || []).map(x => x.order_id);
      if (!ids.length) { toast({ title: "Nessuna commessa da esportare" }); return null; }
      allowedExportIds = allowedExportIds ? allowedExportIds.filter(id => ids.includes(id)) : ids;
    }
    if (supplierFilter !== "all") {
      const { data: r } = await supabase.from("order_items").select("order_id").eq("supplier_id", supplierFilter);
      const ids = [...new Set((r || []).map(x => x.order_id))];
      if (!ids.length) { toast({ title: "Nessuna commessa da esportare" }); return null; }
      allowedExportIds = allowedExportIds ? allowedExportIds.filter(id => ids.includes(id)) : ids;
    }

    let query = supabase
      .from("orders")
      .select(`
        id, order_code, description, total_amount, deposit_amount, balance_amount,
        deposit_2_amount, vat_rate, created_at, expected_date, warehouse_arrival_date,
        payment_type, financing_amount, financing_cost, financing_paid, deposit_paid, deposit_2_paid, balance_paid,
        customer:profiles!orders_customer_id_fkey(first_name, last_name, email),
        status:order_statuses!orders_current_status_id_fkey(name)
      `)
      .eq("company_id", effectiveCompany.id)
      .order("created_at", { ascending: false });

    if (allowedExportIds !== null) query = query.in("id", allowedExportIds);
    if (customerFilter !== "all") query = query.eq("customer_id", customerFilter);
    if (paymentFilter === "pending") query = query.or(PENDING_PAYMENTS_FILTER);
    else if (paymentFilter === "paid") {
      query = query
        .eq("deposit_paid", true)
        .eq("balance_paid", true)
        .or("deposit_2_amount.is.null,deposit_2_amount.eq.0,deposit_2_paid.eq.true")
        .or("financing_amount.is.null,financing_amount.eq.0,financing_paid.eq.true");
    }
    if (debouncedSearch) query = query.or(`description.ilike.%${debouncedSearch}%,order_code.ilike.%${debouncedSearch}%`);
    if (statusFilter === "__da_completare__") {
      const excl = [supportStatusId, lastStatusId].filter(Boolean) as string[];
      if (excl.length) query = query.not("current_status_id", "in", `(${excl.join(",")})`);
    } else if (statusFilter === "__assistenza__") {
      if (supportStatusId) query = query.eq("current_status_id", supportStatusId);
    } else if (statusFilter === "__completati__") {
      if (lastStatusId) query = query.eq("current_status_id", lastStatusId);
    } else if (statusFilter !== "all") query = query.eq("current_status_id", statusFilter);
    if (hideCompleted && statusFilter === "all" && lastStatusId) query = query.or(`current_status_id.neq.${lastStatusId},current_status_id.is.null`);
    if (amountMin) query = query.gte("total_amount", parseFloat(amountMin));
    if (amountMax) query = query.lte("total_amount", parseFloat(amountMax));
    if (hasSelectedYear && selectedYear && monthFilter === "all") {
      query = query
        .gte("created_at", new Date(selectedYear, 0, 1).toISOString())
        .lte("created_at", new Date(selectedYear, 11, 31, 23, 59, 59, 999).toISOString());
    }
    if (contractDateRange.from) query = query.gte("created_at", contractDateRange.from.toISOString());
    if (contractDateRange.to) query = query.lte("created_at", new Date(contractDateRange.to.getTime() + 86400000 - 1).toISOString());
    if (warehouseDateRange.from) query = query.gte("warehouse_arrival_date", warehouseDateRange.from.toISOString().split("T")[0]);
    if (warehouseDateRange.to) query = query.lte("warehouse_arrival_date", new Date(warehouseDateRange.to.getTime() + 86400000 - 1).toISOString().split("T")[0]);
    if (expectedDateRange.from) query = query.gte("expected_date", expectedDateRange.from.toISOString().split("T")[0]);
    if (expectedDateRange.to) query = query.lte("expected_date", new Date(expectedDateRange.to.getTime() + 86400000 - 1).toISOString().split("T")[0]);

    const { data: allOrders, error } = await query;
    if (error) { toast({ title: "Errore export", variant: "destructive" }); return null; }
    const exportOrderIds = (allOrders || []).map((o) => o.id);
    const exportCostsMap = new Map<string, { variableCosts: number; grossMargin: number; marginPercent: number }>();
    if (exportOrderIds.length > 0) {
      const [itemsRes, employeesRes, teamsRes, salespeopleRes] = await Promise.all([
        supabase.from("order_items").select("order_id, purchase_price, quantity, vat_rate").in("order_id", exportOrderIds),
        supabase.from("order_employees").select("order_id, total_cost").in("order_id", exportOrderIds),
        supabase.from("order_external_teams").select("order_id, total_cost, vat_rate").in("order_id", exportOrderIds),
        supabase.from("order_salespeople").select("order_id, commission_amount, deduction_amount").in("order_id", exportOrderIds),
      ]);
      if (itemsRes.error || employeesRes.error || teamsRes.error || salespeopleRes.error) {
        toast({ title: "Export parziale", description: "Non riesco a calcolare tutti i margini, riprova tra poco.", variant: "destructive" });
        return null;
      }
      const costAccumulator = new Map<string, number>();
      for (const item of itemsRes.data || []) {
        const gross = (item.purchase_price || 0) * (item.quantity || 1);
        const { netAmount } = calculateNetFromGross(gross, item.vat_rate ?? 22);
        costAccumulator.set(item.order_id, (costAccumulator.get(item.order_id) || 0) + netAmount);
      }
      for (const employee of employeesRes.data || []) {
        costAccumulator.set(employee.order_id, (costAccumulator.get(employee.order_id) || 0) + (employee.total_cost || 0));
      }
      for (const team of teamsRes.data || []) {
        const { netAmount } = calculateNetFromGross(team.total_cost || 0, team.vat_rate ?? 22);
        costAccumulator.set(team.order_id, (costAccumulator.get(team.order_id) || 0) + netAmount);
      }
      for (const sp of salespeopleRes.data || []) {
        const commission = calculateStoredCommissionNet(sp.commission_amount, sp.deduction_amount);
        costAccumulator.set(sp.order_id, (costAccumulator.get(sp.order_id) || 0) + commission);
      }
      for (const order of allOrders || []) {
        const variableCosts = costAccumulator.get(order.id) || 0;
        const margin = getOrderMargin(order.total_amount || 0, variableCosts);
        exportCostsMap.set(order.id, {
          variableCosts,
          grossMargin: margin.grossMargin,
          marginPercent: margin.marginPercent,
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
      { key: "variable_costs", label: "Costi Variabili" },
      { key: "gross_margin", label: "Margine Lordo" },
      { key: "margin_percent", label: "Margine %" },
      { key: "status", label: "Stato" },
      { key: "created_at", label: "Data Contratto" },
      { key: "warehouse_arrival_date", label: "Data Magazzino" },
      { key: "expected_date", label: "Data Posa" },
      { key: "payment_status", label: "Stato Pagamenti" },
    ];
    const rows = (allOrders || []).map((o) => {
      const pending = getPendingPayments(o as any);
      const vatRate = o.vat_rate ?? 22;
      const vatAmount = (o.total_amount || 0) * (vatRate / 100);
      const totalGross = getGrossOrderAmount(o as any);
      const collected = getAmountCollected(o as any);
      const due = getAmountDue(o as any);
      const costs = exportCostsMap.get(o.id);
      return {
        order_code: o.order_code || "",
        customer: (o.customer as any) ? `${(o.customer as any).first_name} ${(o.customer as any).last_name}` : "",
        description: o.description,
        total_amount: String(o.total_amount || 0),
        vat_amount: String(vatAmount),
        total_gross: String(totalGross),
        collected: String(collected),
        due: String(due),
        deposit_amount: String(o.deposit_amount || 0),
        deposit_2_amount: String(o.deposit_2_amount || 0),
        financing_amount: String(o.financing_amount || 0),
        balance_amount: String(o.balance_amount || 0),
        variable_costs: String(costs?.variableCosts ?? 0),
        gross_margin: String(costs?.grossMargin ?? o.total_amount ?? 0),
        margin_percent: costs ? `${costs.marginPercent.toFixed(1)}%` : "",
        status: (o.status as any)?.name || "",
        created_at: o.created_at ? format(new Date(o.created_at), "dd/MM/yyyy") : "",
        warehouse_arrival_date: o.warehouse_arrival_date ? format(new Date(o.warehouse_arrival_date), "dd/MM/yyyy") : "",
        expected_date: o.expected_date ? format(new Date(o.expected_date), "dd/MM/yyyy") : "",
        payment_status: pending.length > 0 ? pending.join(", ") : "Tutto pagato",
      };
    });
    return { rows, columns, count: allOrders?.length ?? 0 };
  }, [effectiveCompany?.id, salespersonFilter, laborFilter, supplierFilter, customerFilter,
      paymentFilter, debouncedSearch, statusFilter, yearFilter, hasSelectedYear, selectedYear, monthFilter, hideCompleted, lastStatusId,
      supportStatusId, amountMin, amountMax, contractDateRange, warehouseDateRange, expectedDateRange, toast]);

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
        { key: "total_amount", label: "Totale", w: 70, align: "right" as const },
        { key: "status", label: "Stato", w: 80 },
        { key: "created_at", label: "Contratto", w: 70 },
        { key: "expected_date", label: "Posa", w: 70 },
        { key: "payment_status", label: "Pagamenti", w: 110 },
      ];
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
              ? `€ ${Number(row[c.key as keyof typeof row]).toLocaleString("it-IT", { minimumFractionDigits: 2 })}`
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
  }, [prepareExportData, effectiveCompany?.name, toast]);

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

    queryClient.invalidateQueries({ queryKey: ["orders"] });
    return { success, errors };
  }, [effectiveCompany?.id, queryClient]);

  const hasStatsError = (isGlobalStatsError && !globalStats) || (isMonthlyOrdersError && monthlyOrders.length === 0);
  const isEconomicStatsLoading = !!effectiveCompany?.id && !hasStatsError && (
    isLoadingGlobalStats ||
    isLoadingMonthlyOrders ||
    !globalStats
  );
  const isWorkflowStatsLoading = isEconomicStatsLoading || (!!effectiveCompany?.id && isLoadingStatuses);

  return (
    // pb-20 rimosso: la bottom nav mobile non è più overlay (è sotto il main) — erano 160px di vuoto
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-3 sm:px-6 py-3 sm:py-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <Package className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight">Commesse</h1>
            <p className="hidden sm:block text-sm text-slate-500 mt-0.5">
              Cantieri, ODA, DDT, anomalie e marginalità in un'unica vista.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Selettore anno commesse — in alto, sempre visibile (filtra le commesse
              dell'anno scelto; "Tutti" per la vista completa). */}
          {/* Duplicato: l'anno è già nel pannello Filtri → su mobile toglilo
              dalla toolbar per non affollarla. */}
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="hidden sm:flex h-9 w-auto min-w-[6.5rem] gap-1" aria-label="Filtra commesse per anno">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Anno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli anni</SelectItem>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Filtri avanzati */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            aria-label="Apri filtri avanzati"
          >
            <SlidersHorizontal className="h-4 w-4 sm:mr-1" />
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
            <ToggleGroupItem value="table" aria-label="Vista tabella" className="px-3">
              <LayoutList className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="pipeline" aria-label="Vista pipeline" className="px-3">
              <Columns3 className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          {/* Colonne visibili */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="hidden sm:flex">
                <Columns className="h-4 w-4 mr-1" />
                Colonne
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
                      localStorage.setItem("orders-visible-columns-v2", JSON.stringify([...DEFAULT_COLUMNS]));
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Esporta</span>
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-[11px]">Commesse filtrate</DropdownMenuLabel>
              <DropdownMenuItem onClick={exportOrdersCSV}>
                <FileText className="h-4 w-4 mr-2" /> Esporta CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportOrdersXLSX}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Esporta Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportOrdersPDF}>
                <FileText className="h-4 w-4 mr-2" /> Esporta PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px]">Schede clienti</DropdownMenuLabel>
              <DropdownMenuItem onClick={openCustomerSheetsDialog}>
                <UsersIcon className="h-4 w-4 mr-2" /> PDF schede clienti
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Altre azioni">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {!isCommercialistaMode && (
                <>
                  <DropdownMenuItem onClick={() => setImportOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" /> Importa commesse
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={openCustomerSheetsDialog}>
                <UsersIcon className="h-4 w-4 mr-2" /> Scarica schede clienti
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isCommercialistaMode ? (
            <Button variant="outline" disabled className="border-blue-200 bg-blue-50 text-blue-700 disabled:opacity-100">
              <ShieldCheck className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Sola lettura</span>
              <span className="sm:hidden">Lettura</span>
            </Button>
          ) : appaltatoreEnabled ? (
            <Button
              onClick={() => setShowOrderTypeDialog(true)}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/20 hover:from-orange-600 hover:to-amber-500 hover:shadow-md hover:shadow-orange-500/25"
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Nuova Commessa</span>
              <span className="sm:hidden">Nuovo</span>
            </Button>
          ) : (
            <Button
              asChild
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/20 hover:from-orange-600 hover:to-amber-500 hover:shadow-md hover:shadow-orange-500/25"
            >
              <Link to="/azienda/ordini/nuovo">
                <Plus className="h-4 w-4 mr-1" />
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
        <div className="grid gap-0 xl:grid-cols-[minmax(320px,0.58fr)_minmax(520px,1fr)]">
          <div className="bg-[#173b67] p-3 sm:p-5 md:p-6 text-white">
            <div className="flex items-start gap-3">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)]">
                  <Target className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-orange-100">Riepilogo commesse</p>
                  <h2 className="mt-0.5 sm:mt-1 text-base sm:text-xl font-semibold text-white">Vista economica e operativa</h2>
                  <p className="hidden sm:block mt-1 max-w-xl text-sm leading-6 text-blue-50/85">
                    Numeri principali sempre visibili, senza azioni automatiche sui filtri.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 sm:mt-6 grid gap-2 sm:gap-3 grid-cols-2">
              <div className="rounded-xl border border-white/12 bg-white/9 p-2.5 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-orange-100">
                    <ShoppingBag className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100">Commesse totali</span>
                    {isEconomicStatsLoading ? (
                      <>
                        <Skeleton className="mt-1 h-7 w-14 bg-white/20" />
                        <Skeleton className="mt-1 h-3 w-24 bg-white/15" />
                      </>
                    ) : (
                      <>
                        <span className="block truncate text-xl font-bold text-white">{stats.totalOrders}</span>
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
              <div className="hidden sm:block rounded-xl border border-white/12 bg-white/9 p-2.5 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-blue-100">
                    <Euro className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100">Totale venduto</span>
                    {isEconomicStatsLoading ? (
                      <>
                        <Skeleton className="mt-1 h-7 w-28 bg-white/20" />
                        <Skeleton className="mt-1 h-3 w-32 bg-white/15" />
                      </>
                    ) : (
                      <>
                        <span className="block truncate text-xl font-bold text-white">
                          {stats.totalGross.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                        </span>
                        <span className="mt-0.5 block text-xs text-blue-50/70">
                          media commessa {monthlySalesAverages.soldPerOrder.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="hidden sm:block rounded-xl border border-white/12 bg-white/9 p-2.5 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-emerald-100">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100">Incassato</span>
                    {isEconomicStatsLoading ? (
                      <>
                        <Skeleton className="mt-1 h-7 w-28 bg-white/20" />
                        <Skeleton className="mt-1 h-3 w-28 bg-white/15" />
                      </>
                    ) : (
                      <>
                        <span className="block truncate text-xl font-bold text-white">
                          {stats.collected.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                        </span>
                        <span className="mt-0.5 block text-xs text-blue-50/70">
                          media mese {monthlySalesAverages.collectedPerMonth.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-white/12 bg-white/9 p-2.5 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-orange-100">
                    <AlertCircle className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100">Da incassare</span>
                    {isEconomicStatsLoading ? (
                      <>
                        <Skeleton className="mt-1 h-7 w-28 bg-white/20" />
                        <Skeleton className="mt-1 h-3 w-24 bg-white/15" />
                      </>
                    ) : (
                      <>
                        <span className="block truncate text-xl font-bold text-white">
                          {stats.pending.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
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
            </div>
          </div>

          {orderPerms.canViewOrderAmounts && !isMobile && (
          <aside className="border-t border-slate-200 bg-gradient-to-br from-white to-orange-50/50 p-3 sm:p-5 xl:border-l xl:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">
                  Andamento 12 mesi{yearFilter !== "all" ? ` · ${yearFilter}` : ""}
                </p>
                <h3 className="mt-1 text-base font-semibold text-slate-950">Venduto, incassato e commesse</h3>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-blue-500" /> Venduto</span>
                <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-orange-500" /> Incassato</span>
                <span className="inline-flex items-center gap-1 text-slate-600"><span className="h-2 w-2 rounded-full bg-slate-900" /> N. commesse</span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-blue-100 bg-white px-3 py-2 shadow-sm">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Venduto periodo</p>
                {isEconomicStatsLoading ? (
                  <Skeleton className="mt-1 h-5 w-20" />
                ) : (
                  <p className="mt-0.5 text-base font-bold text-slate-950">
                    {monthlySalesTotals.venduto.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-orange-100 bg-white px-3 py-2 shadow-sm">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Incassato periodo</p>
                {isEconomicStatsLoading ? (
                  <Skeleton className="mt-1 h-5 w-20" />
                ) : (
                  <p className="mt-0.5 text-base font-bold text-orange-600">
                    {monthlySalesTotals.incassato.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Commesse periodo</p>
                {isEconomicStatsLoading ? (
                  <Skeleton className="mt-1 h-5 w-12" />
                ) : (
                  <p className="mt-0.5 text-base font-bold text-slate-950">
                    {monthlySalesTotals.commesse.toLocaleString("it-IT")}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 h-[240px] rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              {isEconomicStatsLoading ? (
                <div className="flex h-full items-end gap-2 px-2 pb-4">
                  {[60, 92, 48, 130, 78, 155, 105, 184].map((height, index) => (
                    <Skeleton key={index} className="flex-1 rounded-t-md" style={{ height }} />
                  ))}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlySalesChart} margin={{ top: 8, right: 2, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf2f7" />
                    <XAxis dataKey="mese" tickLine={false} axisLine={false} fontSize={11} stroke="#64748b" />
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
                        if (name === "commesse") {
                          return [Number(value).toLocaleString("it-IT"), "N. commesse"];
                        }
                        return [
                          Number(value).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
                          name === "venduto" ? "Venduto" : "Incassato",
                        ];
                      }}
                      labelFormatter={(label) => `Mese: ${label}`}
                    />
                    <Bar yAxisId="money" dataKey="venduto" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={22} />
                    <Bar yAxisId="money" dataKey="incassato" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={22} />
                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="commesse"
                      stroke="#0f172a"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#0f172a", strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </aside>
          )}
        </div>
      </section>

      <section className="order-2 grid gap-3 md:grid-cols-2 xl:grid-cols-4 sm:order-none">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md hover:shadow-slate-950/10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
              <Hammer className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Da completare</span>
              {isWorkflowStatsLoading ? (
                <Skeleton className="mt-1 h-8 w-12" />
              ) : (
                <span className="block text-2xl font-bold text-slate-950">{stats.countDaCompletare ?? 0}</span>
              )}
              <span className="text-sm text-slate-500">commesse operative</span>
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md hover:shadow-slate-950/10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Completati</span>
              {isWorkflowStatsLoading ? (
                <Skeleton className="mt-1 h-8 w-12" />
              ) : (
                <span className="block text-2xl font-bold text-slate-950">{stats.countCompletati ?? 0}</span>
              )}
              <span className="text-sm text-slate-500">chiusi operativamente</span>
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md hover:shadow-slate-950/10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
              <LifeBuoy className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">In assistenza</span>
              {isWorkflowStatsLoading ? (
                <Skeleton className="mt-1 h-8 w-12" />
              ) : (
                <span className="block text-2xl font-bold text-slate-950">{stats.countAssistenza ?? 0}</span>
              )}
              <span className="text-sm text-slate-500">clienti da seguire</span>
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md hover:shadow-slate-950/10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Margine basso</span>
              {isOrdersLoading ? (
                <Skeleton className="mt-1 h-8 w-12" />
              ) : (
                <span className="block text-2xl font-bold text-orange-700">{controlRoom.lowMarginCount}</span>
              )}
              <span className="text-sm text-slate-500">da controllare</span>
            </span>
          </div>
        </div>
      </section>

      <OrdersFilterSidebar
        filters={sidebarFilters}
        onFiltersChange={setSidebarFilters}
        statuses={statuses}
        ordersCount={visibleOrders.length}
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

      <div className="order-3 space-y-4 sm:order-none">
          <OrdersFilters
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

          {controlFocus !== "all" && (
            <div className="flex flex-col gap-2 rounded-xl border border-orange-200 bg-orange-50/70 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="text-orange-900">
                <span className="font-semibold">
                  {controlFocus === "low_margin" ? "Filtro Margine basso attivo" : "Filtro Campi mancanti attivo"}
                </span>
                <span className="ml-1 text-orange-800/80">
                  Stai vedendo {visibleOrders.length} commess{visibleOrders.length === 1 ? "a" : "e"} nella pagina corrente.
                </span>
              </div>
              <Button variant="outline" size="sm" className="border-orange-200 bg-white" onClick={() => setControlFocus("all")}>
                Mostra tutte
              </Button>
            </div>
          )}

          {/* Content */}
          {isOrdersError ? (
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
                ) : stats.totalOrders === 0 && !isCommercialistaMode && (
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
          ) : viewMode === "pipeline" ? (
            <OrdersPipelineView
              orders={allOrdersForPipeline}
              statuses={statuses}
              onStatusChange={handleStatusChange}
            />
          ) : (
            <div className="space-y-4">
              {/* 🆕 Sort selector — server-side sort dell'intero dataset
                  (non solo della pagina visibile). Persisted in localStorage. */}
              <div className="grid grid-cols-2 items-center gap-2 px-1 sm:flex sm:flex-wrap">
                <span className="col-span-2 text-xs font-medium text-muted-foreground sm:col-span-1">Ordina:</span>
                <Select value={sortField} onValueChange={(v) => { setSortField(v as typeof sortField); setPage(1); }}>
                  <SelectTrigger className="h-9 w-full text-xs sm:h-8 sm:w-auto sm:min-w-[180px]">
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
                  <SelectTrigger className="h-9 w-full text-xs sm:h-8 sm:w-auto sm:min-w-[140px]">
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
                <span className="ml-auto text-[11px] text-muted-foreground hidden sm:block">
                  Click sulle colonne per ordinare la pagina corrente
                </span>
              </div>

              <OrdersTable
                orders={visibleOrders}
                onDelete={(id) => deleteOrderMutation.mutate(id)}
                isDeleting={deleteOrderMutation.isPending}
                orderCosts={orderCostsMap}
                statuses={statuses}
                onBulkStatusChange={handleBulkStatusChange}
                onBulkDelete={handleBulkDelete}
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
  const requestedTab = searchParams.get("tab") || "ordini";
  const permissions = usePermissions();
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
    { id: "ordini", label: "Commesse", icon: ClipboardList, show: true },
    { id: "sopralluoghi", label: "Sopralluoghi", icon: MapIcon, show: surveysEnabled },
    { id: "acquisto", label: "Ordini d'Acquisto", icon: ShoppingCart, show: permissions.canViewOrders },
    { id: "ddt", label: "DDT", icon: FileCheck, show: permissions.canViewOrders },
    { id: "anomalie", label: "Anomalie", icon: AlertTriangle, show: permissions.canViewCosts },
    { id: "marginalita", label: "Marginalità", icon: PieChart, show: permissions.canViewCosts },
    { id: "provvigioni", label: "Provvigioni", icon: Euro, show: permissions.canViewCosts },
  ].filter((t) => t.show);
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : "ordini";

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
    <div className="space-y-4 sm:space-y-6 overflow-x-hidden">
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
