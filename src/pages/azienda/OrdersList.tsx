import { useState, useMemo, useCallback, useEffect } from "react";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useURLFilters } from "@/hooks/useURLFilters";
import { usePermissions } from "@/hooks/usePermissions";
import { Plus, Package, LayoutList, Columns3, Download, Upload, MoreVertical, ChevronLeft, ChevronRight, ClipboardList, ShoppingCart, AlertTriangle, PieChart } from "lucide-react";
import PurchaseOrdersList from "@/pages/azienda/PurchaseOrdersList";
import GlobalErrors from "@/pages/azienda/GlobalErrors";
import MarginalitaCantieri from "@/pages/azienda/MarginalitaCantieri";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { calculateNetFromGross } from "@/lib/vatUtils";
import { exportToCSV } from "@/lib/csvExport";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { OrdersPipelineView } from "@/components/orders/OrdersPipelineView";
import { OrdersStatsCards } from "@/components/orders/OrdersStatsCards";
import { OrdersFilters } from "@/components/orders/OrdersFilters";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { CSVImportDialog, type ImportField } from "@/components/shared/CSVImportDialog";
import { useToast } from "@/hooks/use-toast";
import { type OrderWithDetails, getAmountDue, getAmountCollected, getPendingPayments, deleteOrderCascading } from "@/lib/orderUtils";
import { PlanLimitWarning } from "@/components/billing/PlanLimitWarning";

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

const ORDER_IMPORT_FIELDS: ImportField[] = [
  { key: "order_code", label: "Codice Ordine", required: false },
  { key: "customer_email", label: "Email Cliente", required: true, type: "email" },
  { key: "description", label: "Descrizione", required: true },
  { key: "total_amount", label: "Importo Totale", required: true, type: "number" },
  { key: "deposit_amount", label: "Acconto 1", required: false, type: "number" },
  { key: "deposit_2_amount", label: "Acconto 2", required: false, type: "number" },
  { key: "balance_amount", label: "Saldo", required: false, type: "number" },
  { key: "expected_date", label: "Data Prevista", required: false, type: "date" },
  { key: "warehouse_arrival_date", label: "Data Magazzino", required: false, type: "date" },
  { key: "work_start_date", label: "Data Inizio Lavori", required: false, type: "date" },
  { key: "internal_notes", label: "Note Interne", required: false },
  { key: "payment_type", label: "Tipo Pagamento", required: false },
];

function OrdersListInner() {
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { params: urlFilters, setParam: setURLParam, setParams: setURLParams } = useURLFilters({
    searchQuery: { key: "q", defaultValue: "" },
    statusFilter: { key: "status", defaultValue: "all" },
    paymentFilter: { key: "payment", defaultValue: "all" },
    viewMode: { key: "view", defaultValue: (localStorage.getItem("orders-view-mode") || "table") },
    customerFilter: { key: "cliente", defaultValue: "all" },
    monthFilter: { key: "mese", defaultValue: "all" },
    salespersonFilter: { key: "venditore", defaultValue: "all" },
    laborFilter: { key: "manodopera", defaultValue: "all" },
    supplierFilter: { key: "fornitore", defaultValue: "all" },
    hideCompleted: { key: "nascondi_completati", defaultValue: true, serialize: (v) => v ? "1" : "0", deserialize: (v) => v === "1" },
  });

  const searchQuery = urlFilters.searchQuery;
  const debouncedSearch = useDebounce(searchQuery, 400);
  const setSearchQuery = useCallback((v: string) => setURLParam("searchQuery", v), [setURLParam]);
  const statusFilter = urlFilters.statusFilter;
  const setStatusFilter = useCallback((v: string) => setURLParam("statusFilter", v), [setURLParam]);
  const paymentFilter = urlFilters.paymentFilter as "all" | "pending" | "paid";
  const setPaymentFilter = useCallback((v: "all" | "pending" | "paid") => setURLParam("paymentFilter", v), [setURLParam]);
  const viewMode = urlFilters.viewMode as "table" | "pipeline";
  const setViewMode = useCallback((v: "table" | "pipeline") => {
    localStorage.setItem("orders-view-mode", v);
    setURLParam("viewMode", v);
  }, [setURLParam]);
  const customerFilter = urlFilters.customerFilter;
  const setCustomerFilter = useCallback((v: string) => setURLParam("customerFilter", v), [setURLParam]);
  const monthFilter = urlFilters.monthFilter;
  const setMonthFilter = useCallback((v: string) => setURLParam("monthFilter", v), [setURLParam]);
  const salespersonFilter = urlFilters.salespersonFilter;
  const setSalespersonFilter = useCallback((v: string) => setURLParam("salespersonFilter", v), [setURLParam]);
  const laborFilter = urlFilters.laborFilter;
  const setLaborFilter = useCallback((v: string) => setURLParam("laborFilter", v), [setURLParam]);
  const supplierFilter = urlFilters.supplierFilter;
  const setSupplierFilter = useCallback((v: string) => setURLParam("supplierFilter", v), [setURLParam]);
  const hideCompleted = urlFilters.hideCompleted;
  const setHideCompleted = useCallback((v: boolean) => setURLParam("hideCompleted", v), [setURLParam]);
  const [contractDateRange, setContractDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [warehouseDateRange, setWarehouseDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [expectedDateRange, setExpectedDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [importOpen, setImportOpen] = useState(false);

  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Statuses must be fetched first so lastStatusId is available for the orders query
  const { data: statuses = [] } = useQuery({
    queryKey: ["order-statuses", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, color, position")
        .eq("company_id", effectiveCompany.id)
        .order("position");
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60 * 1000,
  });

  const lastStatusId = statuses.length > 0
    ? statuses.reduce((max, s) => s.position > max.position ? s : max, statuses[0]).id
    : null;

  const { data: ordersResult, isLoading } = useQuery({
    queryKey: ["orders", effectiveCompany?.id, page, pageSize, debouncedSearch, statusFilter, paymentFilter, customerFilter, amountMin, amountMax, salespersonFilter, laborFilter, supplierFilter, hideCompleted, contractDateRange, warehouseDateRange, expectedDateRange],
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
          financing_amount, deposit_2_amount, has_building_bonus,
          deposit_paid, deposit_2_paid, balance_paid, financing_paid,
          customer:profiles!orders_customer_id_fkey(first_name, last_name, email),
          status:order_statuses!orders_current_status_id_fkey(name, color)
        `, { count: "exact" })
        .eq("company_id", effectiveCompany.id);

      if (allowedOrderIds !== null) query = query.in("id", allowedOrderIds);
      // B1 — customerFilter e paymentFilter applicati server-side
      if (customerFilter !== "all") query = query.eq("customer_id", customerFilter);
      if (paymentFilter === "pending") {
        query = query.or("deposit_paid.eq.false,deposit_2_paid.eq.false,balance_paid.eq.false");
      } else if (paymentFilter === "paid") {
        query = query.eq("deposit_paid", true).eq("balance_paid", true);
      }
      if (debouncedSearch) {
        query = query.or(`description.ilike.%${debouncedSearch}%,order_code.ilike.%${debouncedSearch}%`);
      }
      if (statusFilter !== "all") {
        query = query.eq("current_status_id", statusFilter);
      }
      if (hideCompleted && lastStatusId) {
        query = query.neq("current_status_id", lastStatusId);
      }
      if (amountMin) query = query.gte("total_amount", parseFloat(amountMin));
      if (amountMax) query = query.lte("total_amount", parseFloat(amountMax));
      if (contractDateRange.from) query = query.gte("created_at", contractDateRange.from.toISOString());
      if (contractDateRange.to) query = query.lte("created_at", new Date(contractDateRange.to.getTime() + 86400000 - 1).toISOString());
      if (warehouseDateRange.from) query = query.gte("warehouse_arrival_date", warehouseDateRange.from.toISOString().split("T")[0]);
      if (warehouseDateRange.to) query = query.lte("warehouse_arrival_date", new Date(warehouseDateRange.to.getTime() + 86400000 - 1).toISOString().split("T")[0]);
      if (expectedDateRange.from) query = query.gte("expected_date", expectedDateRange.from.toISOString().split("T")[0]);
      if (expectedDateRange.to) query = query.lte("expected_date", new Date(expectedDateRange.to.getTime() + 86400000 - 1).toISOString().split("T")[0]);

      query = query
        .range((page - 1) * pageSize, page * pageSize - 1)
        .order("created_at", { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return { orders: data as OrderWithDetails[], totalCount: count ?? 0 };
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const orders = ordersResult?.orders ?? [];
  const totalCount = ordersResult?.totalCount ?? 0;

  // B2 — query aggregati separata: calcola totali su TUTTI gli ordini filtrati, non solo la pagina
  const { data: aggregates } = useQuery({
    queryKey: ["orders-aggregates", effectiveCompany?.id, debouncedSearch, statusFilter, paymentFilter,
      customerFilter, amountMin, amountMax, salespersonFilter, laborFilter, supplierFilter,
      hideCompleted, lastStatusId, contractDateRange, warehouseDateRange, expectedDateRange],
    queryFn: async () => {
      if (!effectiveCompany?.id) return { totalGross: 0, collected: 0, pending: 0 };

      let allowedIds: string[] | null = null;
      if (salespersonFilter !== "all") {
        const { data: r } = await supabase.from("order_salespeople").select("order_id").eq("salesperson_id", salespersonFilter);
        const ids = (r || []).map(x => x.order_id);
        if (!ids.length) return { totalGross: 0, collected: 0, pending: 0 };
        allowedIds = ids;
      }
      if (laborFilter !== "all") {
        const isTeam = laborFilter.startsWith("team-");
        const realId = laborFilter.replace(/^(emp-|team-)/, "");
        const { data: r } = await supabase
          .from(isTeam ? "order_external_teams" : "order_employees")
          .select("order_id")
          .eq(isTeam ? "external_team_id" : "employee_id", realId);
        const ids = (r || []).map(x => x.order_id);
        if (!ids.length) return { totalGross: 0, collected: 0, pending: 0 };
        allowedIds = allowedIds ? allowedIds.filter(id => ids.includes(id)) : ids;
      }
      if (supplierFilter !== "all") {
        const { data: r } = await supabase.from("order_items").select("order_id").eq("supplier_id", supplierFilter);
        const ids = [...new Set((r || []).map(x => x.order_id))];
        if (!ids.length) return { totalGross: 0, collected: 0, pending: 0 };
        allowedIds = allowedIds ? allowedIds.filter(id => ids.includes(id)) : ids;
      }
      if (allowedIds !== null && allowedIds.length === 0) return { totalGross: 0, collected: 0, pending: 0 };

      let q = supabase
        .from("orders")
        .select("id, total_amount, vat_rate, deposit_amount, deposit_2_amount, balance_amount, deposit_paid, deposit_2_paid, balance_paid, financing_amount, financing_paid, payment_type")
        .eq("company_id", effectiveCompany.id);
      if (allowedIds !== null) q = q.in("id", allowedIds);
      if (customerFilter !== "all") q = q.eq("customer_id", customerFilter);
      if (paymentFilter === "pending") q = q.or("deposit_paid.eq.false,deposit_2_paid.eq.false,balance_paid.eq.false");
      else if (paymentFilter === "paid") q = q.eq("deposit_paid", true).eq("balance_paid", true);
      if (debouncedSearch) q = q.or(`description.ilike.%${debouncedSearch}%,order_code.ilike.%${debouncedSearch}%`);
      if (statusFilter !== "all") q = q.eq("current_status_id", statusFilter);
      if (hideCompleted && lastStatusId) q = q.neq("current_status_id", lastStatusId);
      if (amountMin) q = q.gte("total_amount", parseFloat(amountMin));
      if (amountMax) q = q.lte("total_amount", parseFloat(amountMax));
      if (contractDateRange.from) q = q.gte("created_at", contractDateRange.from.toISOString());
      if (contractDateRange.to) q = q.lte("created_at", new Date(contractDateRange.to.getTime() + 86400000 - 1).toISOString());
      if (warehouseDateRange.from) q = q.gte("warehouse_arrival_date", warehouseDateRange.from.toISOString().split("T")[0]);
      if (warehouseDateRange.to) q = q.lte("warehouse_arrival_date", new Date(warehouseDateRange.to.getTime() + 86400000 - 1).toISOString().split("T")[0]);
      if (expectedDateRange.from) q = q.gte("expected_date", expectedDateRange.from.toISOString().split("T")[0]);
      if (expectedDateRange.to) q = q.lte("expected_date", new Date(expectedDateRange.to.getTime() + 86400000 - 1).toISOString().split("T")[0]);

      const { data, error } = await q;
      if (error) throw error;
      const totalGross = (data || []).reduce((sum, o) => sum + (o.total_amount || 0) * (1 + ((o.vat_rate ?? 22) / 100)), 0);
      const collected = (data || []).reduce((sum, o) => sum + getAmountCollected(o as any), 0);
      const pending = (data || []).reduce((sum, o) => sum + getAmountDue(o as any), 0);
      return { totalGross, collected, pending };
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  // B3 — query indipendente per la vista Pipeline (tutti gli ordini, nessuna paginazione)
  const { data: allOrdersForPipeline = [] } = useQuery({
    queryKey: ["orders-pipeline", effectiveCompany?.id, statusFilter, hideCompleted, lastStatusId, debouncedSearch, customerFilter],
    queryFn: async () => {
      if (!effectiveCompany?.id || viewMode !== "pipeline") return [] as OrderWithDetails[];
      let q = supabase
        .from("orders")
        .select(`
          id, order_code, description, total_amount, deposit_amount, balance_amount,
          vat_rate, created_at, expected_date, work_start_date, work_end_date,
          warehouse_arrival_date, customer_id, current_status_id, payment_type,
          financing_amount, deposit_2_amount, has_building_bonus,
          deposit_paid, deposit_2_paid, balance_paid, financing_paid,
          customer:profiles!orders_customer_id_fkey(first_name, last_name, email),
          status:order_statuses!orders_current_status_id_fkey(name, color)
        `)
        .eq("company_id", effectiveCompany.id)
        .order("created_at", { ascending: false });
      if (debouncedSearch) q = q.or(`description.ilike.%${debouncedSearch}%,order_code.ilike.%${debouncedSearch}%`);
      if (statusFilter !== "all") q = q.eq("current_status_id", statusFilter);
      if (hideCompleted && lastStatusId) q = q.neq("current_status_id", lastStatusId);
      if (customerFilter !== "all") q = q.eq("customer_id", customerFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as OrderWithDetails[];
    },
    enabled: !!effectiveCompany?.id && viewMode === "pipeline",
    staleTime: 3 * 60 * 1000,
  });

  // Batch queries for cost calculations — use IDs from current page only
  const orderIds = useMemo(() => orders.map(o => o.id), [orders]);

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
        .select("order_id, commission_type, commission_value, deduction_amount, salesperson_id, salesperson:salespeople(id, first_name, last_name)")
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

  // Reverse lookup Maps: name → id for O(1) filter matching
  const spNameToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const sp of salespeopleData) {
      const p = (sp as any).salesperson;
      if (p) map.set(`${p.first_name} ${p.last_name}`, p.id);
    }
    return map;
  }, [salespeopleData]);
  const empNameToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employeeCosts) {
      const emp = (e as any).employee;
      if (emp) map.set(`${emp.first_name} ${emp.last_name}`, emp.id);
    }
    return map;
  }, [employeeCosts]);
  const teamNameToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of externalTeamCosts) {
      const team = (t as any).external_team;
      if (team) map.set(team.name, team.id);
    }
    return map;
  }, [externalTeamCosts]);
  const supNameToIdMap = useMemo(() => new Map(supplierProfiles.map(s => [s.name, s.id])), [supplierProfiles]);

  // Column visibility state
  const OPTIONAL_COLUMNS = [
    { key: "date", label: "Data Ordine" },
    { key: "margin", label: "Margine" },
    { key: "salesperson", label: "Venditore" },
    { key: "labor", label: "Manodopera" },
  ] as const;

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("orders-visible-columns");
      if (saved) return new Set(JSON.parse(saved));
    } catch { /* storage non disponibile — silenzioso */ }
    return new Set(["date"]);
  });

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem("orders-visible-columns", JSON.stringify([...next]));
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

    // Aggregate commissions per order
    const commissionsByOrder = new Map<string, number>();
    for (const sp of salespeopleData) {
      const totalAmount = orderAmountMap.get(sp.order_id) || 0;
      let commission = 0;
      switch (sp.commission_type) {
        case "fixed":
          commission = sp.commission_value;
          break;
        case "percentage_sold":
        case "percentage_collected":
          commission = totalAmount * (sp.commission_value / 100);
          break;
      }
      commission -= sp.deduction_amount || 0;
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
      toast({ title: "Stato aggiornato", description: "L'ordine è stato spostato al nuovo stato" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare lo stato dell'ordine", variant: "destructive" });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: deleteOrderCascading,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      toast({ title: "Ordine eliminato", description: "L'ordine è stato eliminato con successo" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile eliminare l'ordine", variant: "destructive" });
    },
  });

  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const handleBulkStatusChange = async (orderIds: string[], statusId: string) => {
    setIsBulkUpdating(true);
    try {
      await Promise.all(
        orderIds.map((orderId) => updateOrderStatus({ orderId, statusId }))
      );
      toast({
        title: "Stato aggiornato",
        description: `${orderIds.length} ordin${orderIds.length === 1 ? "e aggiornato" : "i aggiornati"}`,
      });
    } catch {
      toast({ title: "Errore", description: "Impossibile aggiornare alcuni ordini", variant: "destructive" });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkDelete = async (orderIds: string[]) => {
    setIsBulkUpdating(true);
    try {
      await Promise.all(orderIds.map(deleteOrderCascading));
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      toast({
        title: "Ordini eliminati",
        description: `${orderIds.length} ordin${orderIds.length === 1 ? "e eliminato" : "i eliminati"} con successo`,
      });
    } catch {
      toast({ title: "Errore", description: "Impossibile eliminare alcuni ordini", variant: "destructive" });
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
    paymentFilter !== "all" || customerFilter !== "all" || amountMin || amountMax ||
    salespersonFilter !== "all" || laborFilter !== "all" || supplierFilter !== "all" ||
    !hideCompleted);

  // B4 — usa customer_id (UUID reale) invece della chiave composita nome+cognome+email
  const uniqueCustomers = useMemo(() => {
    const customerMap = new Map<string, { id: string; name: string }>();
    orders.forEach(order => {
      if (order.customer && order.customer_id) {
        customerMap.set(order.customer_id, {
          id: order.customer_id,
          name: `${order.customer.first_name} ${order.customer.last_name}`,
        });
      }
    });
    return Array.from(customerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  const clearAllFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setCustomerFilter("all");
    setAmountMin("");
    setAmountMax("");
    setMonthFilter("all");
    setSalespersonFilter("all");
    setLaborFilter("all");
    setSupplierFilter("all");
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
      const year = new Date().getFullYear();
      const month = parseInt(value);
      const from = new Date(year, month, 1);
      const to = new Date(year, month + 1, 0);
      setContractDateRange({ from, to });
    }
    setPage(1);
  };

  // Reset page to 1 when any filter changes
  const filterKey = `${searchQuery}|${statusFilter}|${paymentFilter}|${customerFilter}|${amountMin}|${amountMax}|${monthFilter}|${salespersonFilter}|${laborFilter}|${supplierFilter}|${hideCompleted}|${contractDateRange.from}|${contractDateRange.to}|${warehouseDateRange.from}|${warehouseDateRange.to}|${expectedDateRange.from}|${expectedDateRange.to}`;
  useEffect(() => { setPage(1); }, [filterKey]);

  // Server-side pagination
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const showingFrom = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, totalCount);

  // B2 — stats usa la query aggregati (tutti gli ordini filtrati, non solo la pagina)
  const stats = useMemo(() => ({
    totalOrders: totalCount,
    totalGross: aggregates?.totalGross ?? 0,
    collected: aggregates?.collected ?? 0,
    pending: aggregates?.pending ?? 0,
  }), [totalCount, aggregates]);

  // Export CSV
  // M2 — Export CSV con tutti i filtri attivi (non solo i 20 della pagina corrente)
  const exportOrdersCSV = useCallback(async () => {
    if (!effectiveCompany?.id) return;
    toast({ title: "Esportazione in corso..." });

    // Subquery join filters (stesso pattern di B1)
    let allowedExportIds: string[] | null = null;
    if (salespersonFilter !== "all") {
      const { data: r } = await supabase.from("order_salespeople").select("order_id").eq("salesperson_id", salespersonFilter);
      const ids = (r || []).map(x => x.order_id);
      if (!ids.length) { toast({ title: "CSV esportato — 0 ordini" }); return; }
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
      if (!ids.length) { toast({ title: "CSV esportato — 0 ordini" }); return; }
      allowedExportIds = allowedExportIds ? allowedExportIds.filter(id => ids.includes(id)) : ids;
    }
    if (supplierFilter !== "all") {
      const { data: r } = await supabase.from("order_items").select("order_id").eq("supplier_id", supplierFilter);
      const ids = [...new Set((r || []).map(x => x.order_id))];
      if (!ids.length) { toast({ title: "CSV esportato — 0 ordini" }); return; }
      allowedExportIds = allowedExportIds ? allowedExportIds.filter(id => ids.includes(id)) : ids;
    }

    let query = supabase
      .from("orders")
      .select(`
        id, order_code, description, total_amount, deposit_amount, balance_amount,
        deposit_2_amount, vat_rate, created_at, expected_date, warehouse_arrival_date,
        payment_type, deposit_paid, deposit_2_paid, balance_paid,
        customer:profiles!orders_customer_id_fkey(first_name, last_name, email),
        status:order_statuses!orders_current_status_id_fkey(name)
      `)
      .eq("company_id", effectiveCompany.id)
      .order("created_at", { ascending: false });

    if (allowedExportIds !== null) query = query.in("id", allowedExportIds);
    if (customerFilter !== "all") query = query.eq("customer_id", customerFilter);
    if (paymentFilter === "pending") query = query.or("deposit_paid.eq.false,deposit_2_paid.eq.false,balance_paid.eq.false");
    else if (paymentFilter === "paid") query = query.eq("deposit_paid", true).eq("balance_paid", true);
    if (debouncedSearch) query = query.or(`description.ilike.%${debouncedSearch}%,order_code.ilike.%${debouncedSearch}%`);
    if (statusFilter !== "all") query = query.eq("current_status_id", statusFilter);
    if (hideCompleted && lastStatusId) query = query.neq("current_status_id", lastStatusId);
    if (amountMin) query = query.gte("total_amount", parseFloat(amountMin));
    if (amountMax) query = query.lte("total_amount", parseFloat(amountMax));
    if (contractDateRange.from) query = query.gte("created_at", contractDateRange.from.toISOString());
    if (contractDateRange.to) query = query.lte("created_at", new Date(contractDateRange.to.getTime() + 86400000 - 1).toISOString());
    if (warehouseDateRange.from) query = query.gte("warehouse_arrival_date", warehouseDateRange.from.toISOString().split("T")[0]);
    if (warehouseDateRange.to) query = query.lte("warehouse_arrival_date", new Date(warehouseDateRange.to.getTime() + 86400000 - 1).toISOString().split("T")[0]);
    if (expectedDateRange.from) query = query.gte("expected_date", expectedDateRange.from.toISOString().split("T")[0]);
    if (expectedDateRange.to) query = query.lte("expected_date", new Date(expectedDateRange.to.getTime() + 86400000 - 1).toISOString().split("T")[0]);

    const { data: allOrders, error } = await query;
    if (error) { toast({ title: "Errore export", variant: "destructive" }); return; }

    const columns: { key: string; label: string }[] = [
      { key: "order_code", label: "Codice Ordine" },
      { key: "customer", label: "Cliente" },
      { key: "description", label: "Descrizione" },
      { key: "total_amount", label: "Importo Totale" },
      { key: "deposit_amount", label: "Acconto 1" },
      { key: "deposit_2_amount", label: "Acconto 2" },
      { key: "balance_amount", label: "Saldo" },
      { key: "status", label: "Stato" },
      { key: "created_at", label: "Data Contratto" },
      { key: "warehouse_arrival_date", label: "Data Magazzino" },
      { key: "expected_date", label: "Data Posa" },
      { key: "payment_status", label: "Stato Pagamenti" },
    ];
    const rows = (allOrders || []).map((o) => {
      const pending = getPendingPayments(o as any);
      return {
        order_code: o.order_code || "",
        customer: (o.customer as any) ? `${(o.customer as any).first_name} ${(o.customer as any).last_name}` : "",
        description: o.description,
        total_amount: String(o.total_amount),
        deposit_amount: String(o.deposit_amount || 0),
        deposit_2_amount: String(o.deposit_2_amount || 0),
        balance_amount: String(o.balance_amount || 0),
        status: (o.status as any)?.name || "",
        created_at: o.created_at ? format(new Date(o.created_at), "dd/MM/yyyy") : "",
        warehouse_arrival_date: o.warehouse_arrival_date ? format(new Date(o.warehouse_arrival_date), "dd/MM/yyyy") : "",
        expected_date: o.expected_date ? format(new Date(o.expected_date), "dd/MM/yyyy") : "",
        payment_status: pending.length > 0 ? pending.join(", ") : "Tutto pagato",
      };
    });
    exportToCSV(rows, columns, `ordini-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: `CSV esportato — ${allOrders?.length ?? 0} ordini` });
  }, [effectiveCompany?.id, salespersonFilter, laborFilter, supplierFilter, customerFilter,
      paymentFilter, debouncedSearch, statusFilter, hideCompleted, lastStatusId,
      amountMin, amountMax, contractDateRange, warehouseDateRange, expectedDateRange, toast]);

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
            errors.push(`Riga ${i + 1}: Codice ordine "${row.order_code}" già esistente`);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ordini</h1>
          <p className="text-muted-foreground">Gestisci gli ordini della tua azienda</p>
        </div>
        <div className="flex items-center gap-2">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={exportOrdersCSV}>
                <Download className="h-4 w-4 mr-2" /> Esporta CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" /> Importa da file
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Colonne visibili</DropdownMenuLabel>
              {OPTIONAL_COLUMNS.map(col => (
                <DropdownMenuItem key={col.key} onSelect={(e) => e.preventDefault()} onClick={() => toggleColumn(col.key)}>
                  <Checkbox checked={visibleColumns.has(col.key)} className="mr-2" />
                  {col.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild>
            <Link to="/azienda/ordini/nuovo">
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Nuovo Ordine</span>
              <span className="sm:hidden">Nuovo</span>
            </Link>
          </Button>
        </div>
      </div>

      <PlanLimitWarning resourceType="orders" />

      <OrdersStatsCards
        stats={stats}
        onPendingClick={() => setPaymentFilter(paymentFilter === "pending" ? "all" : "pending")}
        activePendingFilter={paymentFilter === "pending"}
      />

      <OrdersFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statuses={statuses}
        paymentFilter={paymentFilter}
        onPaymentFilterChange={setPaymentFilter}
        monthFilter={monthFilter}
        onMonthFilterChange={handleMonthChange}
        customerFilter={customerFilter}
        onCustomerFilterChange={setCustomerFilter}
        uniqueCustomers={uniqueCustomers}
        amountMin={amountMin}
        amountMax={amountMax}
        onAmountMinChange={setAmountMin}
        onAmountMaxChange={setAmountMax}
        contractDateRange={contractDateRange}
        onContractDateRangeChange={setContractDateRange}
        warehouseDateRange={warehouseDateRange}
        onWarehouseDateRangeChange={setWarehouseDateRange}
        expectedDateRange={expectedDateRange}
        onExpectedDateRangeChange={setExpectedDateRange}
        hasAnyFilter={hasAnyFilter}
        onClearAllFilters={clearAllFilters}
        salespersonFilter={salespersonFilter}
        onSalespersonFilterChange={setSalespersonFilter}
        uniqueSalespeople={uniqueSalespeople}
        laborFilter={laborFilter}
        onLaborFilterChange={setLaborFilter}
        uniqueLabor={uniqueLabor}
        supplierFilter={supplierFilter}
        onSupplierFilterChange={setSupplierFilter}
        uniqueSuppliers={uniqueSuppliers}
        hideCompleted={hideCompleted}
        onHideCompletedChange={setHideCompleted}
      />

      {/* Content */}
      {isLoading ? (
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
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nessun ordine trovato</h3>
            <p className="text-muted-foreground mb-4">
              {totalCount === 0
                ? "Non hai ancora creato nessun ordine."
                : "Nessun ordine corrisponde ai filtri selezionati."}
            </p>
            {totalCount === 0 && (
              <Button asChild>
                <Link to="/azienda/ordini/nuovo">
                  <Plus className="h-4 w-4 mr-2" />
                  Crea il primo ordine
                </Link>
              </Button>
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
          <OrdersTable
            orders={orders}
            onDelete={(id) => deleteOrderMutation.mutate(id)}
            isDeleting={deleteOrderMutation.isPending}
            orderCosts={orderCostsMap}
            statuses={statuses}
            onBulkStatusChange={handleBulkStatusChange}
            onBulkDelete={handleBulkDelete}
            isBulkUpdating={isBulkUpdating}
            visibleColumns={visibleColumns}
            salespeopleMap={salespeopleMap}
            laborMap={laborMap}
          />
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <p className="text-sm text-muted-foreground hidden sm:block">
                Mostrando {showingFrom}–{showingTo} di {totalCount} ordini
              </p>
              <p className="text-xs text-muted-foreground sm:hidden">
                {showingFrom}–{showingTo} / {totalCount}
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

      <CSVImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importa Ordini"
        fields={ORDER_IMPORT_FIELDS}
        onImport={handleOrdersImport}
      />
    </div>
  );
}

export default function OrdersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "ordini";
  const permissions = usePermissions();
  const handleTabChange = (tab: string) => {
    setSearchParams(tab === "ordini" ? {} : { tab });
  };

  const tabs = [
    { id: "ordini", label: "Ordini", icon: ClipboardList, show: true },
    { id: "acquisto", label: "Ordini d'Acquisto", icon: ShoppingCart, show: permissions.canViewForecast },
    { id: "anomalie", label: "Anomalie", icon: AlertTriangle, show: permissions.canViewOrders },
    { id: "marginalita", label: "Marginalità", icon: PieChart, show: permissions.canViewOrders },
  ].filter((t) => t.show);

  return (
    <div className="space-y-6">
      {/* ─── Tab navigation ─────────────────────────────────────────── */}
      <div className="border-b">
        <nav className="-mb-px flex gap-6 overflow-x-auto" role="tablist" aria-label="Sezioni ordini">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => handleTabChange(t.id)}
              className={`pb-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "ordini" && (
        <ErrorBoundary title="Errore nella lista ordini">
          <OrdersListInner />
        </ErrorBoundary>
      )}

      {activeTab === "acquisto" && (
        <div className="[&>div:first-child>div:first-child]:hidden">
          <PurchaseOrdersList />
        </div>
      )}

      {activeTab === "anomalie" && (
        <div className="[&>div:first-child>div:first-child]:hidden">
          <GlobalErrors />
        </div>
      )}

      {activeTab === "marginalita" && (
        <div className="[&>div:first-child>div:first-child]:hidden">
          <MarginalitaCantieri />
        </div>
      )}
    </div>
  );
}
