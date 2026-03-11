import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useURLFilters } from "@/hooks/useURLFilters";
import { Plus, Package, LayoutList, Columns3, Download, Upload, MoreVertical, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
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

export default function OrdersList() {
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { params: urlFilters, setParam: setURLParam, setParams: setURLParams } = useURLFilters({
    searchQuery: { key: "q", defaultValue: "" },
    statusFilter: { key: "status", defaultValue: "all" },
    paymentFilter: { key: "payment", defaultValue: "all" },
    viewMode: { key: "view", defaultValue: "table" },
    customerFilter: { key: "cliente", defaultValue: "all" },
    monthFilter: { key: "mese", defaultValue: "all" },
    salespersonFilter: { key: "venditore", defaultValue: "all" },
    laborFilter: { key: "manodopera", defaultValue: "all" },
    supplierFilter: { key: "fornitore", defaultValue: "all" },
    hideCompleted: { key: "nascondi_completati", defaultValue: true, serialize: (v) => v ? "1" : "0", deserialize: (v) => v === "1" },
    currentPage: { key: "pagina", defaultValue: 1, serialize: String, deserialize: Number },
  });

  const searchQuery = urlFilters.searchQuery;
  const setSearchQuery = useCallback((v: string) => setURLParam("searchQuery", v), [setURLParam]);
  const statusFilter = urlFilters.statusFilter;
  const setStatusFilter = useCallback((v: string) => setURLParam("statusFilter", v), [setURLParam]);
  const paymentFilter = urlFilters.paymentFilter as "all" | "pending" | "paid";
  const setPaymentFilter = useCallback((v: "all" | "pending" | "paid") => setURLParam("paymentFilter", v), [setURLParam]);
  const viewMode = urlFilters.viewMode as "table" | "pipeline";
  const setViewMode = useCallback((v: "table" | "pipeline") => setURLParam("viewMode", v), [setURLParam]);
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
  const currentPage = urlFilters.currentPage;
  const setCurrentPage = useCallback((v: number) => setURLParam("currentPage", v), [setURLParam]);

  const [contractDateRange, setContractDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [warehouseDateRange, setWarehouseDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [expectedDateRange, setExpectedDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [importOpen, setImportOpen] = useState(false);
  const ORDERS_PER_PAGE = 20;

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          customer:profiles!orders_customer_id_fkey(first_name, last_name, email),
          status:order_statuses!orders_current_status_id_fkey(name, color)
        `)
        .eq("company_id", effectiveCompany.id)
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return data as OrderWithDetails[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Batch queries for cost calculations
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
        .select("order_id, total_cost, employee_id")
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
        .select("order_id, total_cost, vat_rate, external_team_id")
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
        .select("order_id, commission_type, commission_value, deduction_amount, salesperson_id")
        .in("order_id", orderIds);
      if (error) throw error;
      return data;
    },
    enabled: orderIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Fetch names for salespeople, employees, external teams
  const salespersonIds = useMemo(() => [...new Set(salespeopleData.map(s => s.salesperson_id).filter(Boolean))], [salespeopleData]);
  const employeeIds = useMemo(() => [...new Set(employeeCosts.map(e => e.employee_id).filter(Boolean))], [employeeCosts]);
  const externalTeamIds = useMemo(() => [...new Set(externalTeamCosts.map(t => t.external_team_id).filter(Boolean))], [externalTeamCosts]);

  const { data: salespersonProfiles = [] } = useQuery({
    queryKey: ["salesperson-profiles", salespersonIds],
    queryFn: async () => {
      if (salespersonIds.length === 0) return [];
      const { data, error } = await supabase.from("salespeople").select("id, first_name, last_name").in("id", salespersonIds);
      if (error) throw error;
      return data;
    },
    enabled: salespersonIds.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { data: employeeProfiles = [] } = useQuery({
    queryKey: ["employee-profiles", employeeIds],
    queryFn: async () => {
      if (employeeIds.length === 0) return [];
      const { data, error } = await supabase.from("employees").select("id, first_name, last_name").in("id", employeeIds);
      if (error) throw error;
      return data;
    },
    enabled: employeeIds.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { data: externalTeamProfiles = [] } = useQuery({
    queryKey: ["external-team-profiles", externalTeamIds],
    queryFn: async () => {
      if (externalTeamIds.length === 0) return [];
      const { data, error } = await supabase.from("external_teams").select("id, name").in("id", externalTeamIds);
      if (error) throw error;
      return data;
    },
    enabled: externalTeamIds.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Build name maps
  const salespeopleMap = useMemo(() => {
    const profileMap = new Map(salespersonProfiles.map(p => [p.id, `${p.first_name} ${p.last_name}`]));
    const map = new Map<string, string[]>();
    for (const sp of salespeopleData) {
      const name = profileMap.get(sp.salesperson_id);
      if (name) {
        const existing = map.get(sp.order_id) || [];
        if (!existing.includes(name)) existing.push(name);
        map.set(sp.order_id, existing);
      }
    }
    return map;
  }, [salespeopleData, salespersonProfiles]);

  const laborMap = useMemo(() => {
    const empMap = new Map(employeeProfiles.map(e => [e.id, `${e.first_name} ${e.last_name}`]));
    const teamMap = new Map(externalTeamProfiles.map(t => [t.id, t.name]));
    const map = new Map<string, string[]>();
    for (const e of employeeCosts) {
      const name = empMap.get(e.employee_id);
      if (name) {
        const existing = map.get(e.order_id) || [];
        if (!existing.includes(name)) existing.push(name);
        map.set(e.order_id, existing);
      }
    }
    for (const t of externalTeamCosts) {
      const name = teamMap.get(t.external_team_id);
      if (name) {
        const existing = map.get(t.order_id) || [];
        if (!existing.includes(name)) existing.push(name);
        map.set(t.order_id, existing);
      }
    }
    return map;
  }, [employeeCosts, externalTeamCosts, employeeProfiles, externalTeamProfiles]);

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
    for (const sp of salespersonProfiles) map.set(sp.id, `${sp.first_name} ${sp.last_name}`);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [salespersonProfiles]);

  const uniqueLabor = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employeeProfiles) map.set(`emp-${e.id}`, `${e.first_name} ${e.last_name}`);
    for (const t of externalTeamProfiles) map.set(`team-${t.id}`, t.name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [employeeProfiles, externalTeamProfiles]);

  const uniqueSuppliers = useMemo(() => {
    return supplierProfiles.map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [supplierProfiles]);

  // Reverse lookup Maps: name → id for O(1) filter matching
  const spNameToIdMap = useMemo(() => new Map(salespersonProfiles.map(p => [`${p.first_name} ${p.last_name}`, p.id])), [salespersonProfiles]);
  const empNameToIdMap = useMemo(() => new Map(employeeProfiles.map(e => [`${e.first_name} ${e.last_name}`, e.id])), [employeeProfiles]);
  const teamNameToIdMap = useMemo(() => new Map(externalTeamProfiles.map(t => [t.name, t.id])), [externalTeamProfiles]);
  const supNameToIdMap = useMemo(() => new Map(supplierProfiles.map(s => [s.name, s.id])), [supplierProfiles]);

  // Column visibility state
  const OPTIONAL_COLUMNS = [
    { key: "date", label: "Data Ordine" },
    { key: "salesperson", label: "Venditore" },
    { key: "labor", label: "Manodopera" },
  ] as const;

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("orders-visible-columns");
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
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
      queryClient.invalidateQueries({ queryKey: ["calendar-orders"] });
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
      queryClient.invalidateQueries({ queryKey: ["calendar-orders"] });
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

  const lastStatusId = statuses.length > 0
    ? statuses.reduce((max, s) => s.position > max.position ? s : max, statuses[0]).id
    : null;

  const hasAnyFilter = !!(hasDateFilters || searchQuery || statusFilter !== "all" ||
    paymentFilter !== "all" || customerFilter !== "all" || amountMin || amountMax ||
    salespersonFilter !== "all" || laborFilter !== "all" || supplierFilter !== "all" ||
    !hideCompleted);

  const uniqueCustomers = useMemo(() => {
    const customerMap = new Map<string, { id: string; name: string }>();
    orders.forEach(order => {
      if (order.customer) {
        const customerId = `${order.customer.first_name}-${order.customer.last_name}-${order.customer.email}`;
        customerMap.set(customerId, { id: customerId, name: `${order.customer.first_name} ${order.customer.last_name}` });
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
    setCurrentPage(1);
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
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.order_code?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      `${order.customer?.first_name} ${order.customer?.last_name}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || order.current_status_id === statusFilter;
    const pendingPayments = getPendingPayments(order);
    const matchesPayment =
      paymentFilter === "all" ||
      (paymentFilter === "pending" && pendingPayments.length > 0) ||
      (paymentFilter === "paid" && pendingPayments.length === 0);

    const customerKey = order.customer
      ? `${order.customer.first_name}-${order.customer.last_name}-${order.customer.email}`
      : "";
    const matchesCustomer = customerFilter === "all" || customerKey === customerFilter;

    const minAmount = amountMin ? parseFloat(amountMin) : null;
    const maxAmount = amountMax ? parseFloat(amountMax) : null;
    const matchesAmount =
      (minAmount === null || order.total_amount >= minAmount) &&
      (maxAmount === null || order.total_amount <= maxAmount);

    const orderCreatedAt = new Date(order.created_at);
    const matchesContractDate =
      (!contractDateRange.from || orderCreatedAt >= contractDateRange.from) &&
      (!contractDateRange.to || orderCreatedAt <= new Date(contractDateRange.to.getTime() + 86400000 - 1));

    let matchesWarehouseDate = true;
    if (warehouseDateRange.from || warehouseDateRange.to) {
      if (!order.warehouse_arrival_date) {
        matchesWarehouseDate = false;
      } else {
        const warehouseDate = new Date(order.warehouse_arrival_date);
        matchesWarehouseDate =
          (!warehouseDateRange.from || warehouseDate >= warehouseDateRange.from) &&
          (!warehouseDateRange.to || warehouseDate <= new Date(warehouseDateRange.to.getTime() + 86400000 - 1));
      }
    }

    let matchesExpectedDate = true;
    if (expectedDateRange.from || expectedDateRange.to) {
      if (!order.expected_date) {
        matchesExpectedDate = false;
      } else {
        const expectedDate = new Date(order.expected_date);
        matchesExpectedDate =
          (!expectedDateRange.from || expectedDate >= expectedDateRange.from) &&
          (!expectedDateRange.to || expectedDate <= new Date(expectedDateRange.to.getTime() + 86400000 - 1));
      }
    }

    // Reverse lookup maps for O(1) filter matching
    const matchesSalesperson = salespersonFilter === "all" || 
      (salespeopleMap.get(order.id) || []).some(name => {
        return spNameToIdMap.get(name) === salespersonFilter;
      });

    const matchesLabor = laborFilter === "all" ||
      (laborMap.get(order.id) || []).some(name => {
        const empId = empNameToIdMap.get(name);
        if (empId && `emp-${empId}` === laborFilter) return true;
        const teamId = teamNameToIdMap.get(name);
        if (teamId && `team-${teamId}` === laborFilter) return true;
        return false;
      });

    const matchesSupplier = supplierFilter === "all" ||
      (supplierMap.get(order.id) || []).some(name => {
        return supNameToIdMap.get(name) === supplierFilter;
      });

    const matchesCompleted = !(hideCompleted && lastStatusId && order.current_status_id === lastStatusId);

    return matchesSearch && matchesStatus && matchesPayment && matchesCustomer && matchesAmount &&
      matchesContractDate && matchesWarehouseDate && matchesExpectedDate &&
      matchesSalesperson && matchesLabor && matchesSupplier && matchesCompleted;
  });

  // Reset page when filters change
  const filterKey = `${searchQuery}|${statusFilter}|${paymentFilter}|${customerFilter}|${amountMin}|${amountMax}|${monthFilter}|${salespersonFilter}|${laborFilter}|${supplierFilter}|${hideCompleted}|${contractDateRange.from}|${contractDateRange.to}|${warehouseDateRange.from}|${warehouseDateRange.to}|${expectedDateRange.from}|${expectedDateRange.to}`;
  useEffect(() => { setCurrentPage(1); }, [filterKey]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedOrders = filteredOrders.slice((safePage - 1) * ORDERS_PER_PAGE, safePage * ORDERS_PER_PAGE);
  const showingFrom = filteredOrders.length === 0 ? 0 : (safePage - 1) * ORDERS_PER_PAGE + 1;
  const showingTo = Math.min(safePage * ORDERS_PER_PAGE, filteredOrders.length);

  const stats = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const totalGross = filteredOrders.reduce((sum, o) => sum + o.total_amount * (1 + (o.vat_rate ?? 22) / 100), 0);
    const collected = filteredOrders.reduce((sum, o) => sum + getAmountCollected(o), 0);
    const pending = filteredOrders.reduce((sum, o) => sum + getAmountDue(o), 0);
    return { totalOrders, totalGross, collected, pending };
  }, [filteredOrders]);

  // Export CSV
  const exportOrdersCSV = useCallback(() => {
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
    const rows = filteredOrders.map((o) => {
      const pending = getPendingPayments(o);
      return {
        order_code: o.order_code || "",
        customer: o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : "",
        description: o.description,
        total_amount: String(o.total_amount),
        deposit_amount: String(o.deposit_amount || 0),
        deposit_2_amount: String(o.deposit_2_amount || 0),
        balance_amount: String(o.balance_amount || 0),
        status: o.status?.name || "",
        created_at: o.created_at ? format(new Date(o.created_at), "dd/MM/yyyy") : "",
        warehouse_arrival_date: o.warehouse_arrival_date ? format(new Date(o.warehouse_arrival_date), "dd/MM/yyyy") : "",
        expected_date: o.expected_date ? format(new Date(o.expected_date), "dd/MM/yyyy") : "",
        payment_status: pending.length > 0 ? pending.join(", ") : "Tutto pagato",
      };
    });
    exportToCSV(rows, columns, `ordini-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast({ title: "CSV esportato" });
  }, [filteredOrders, toast]);

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
        <div className="flex items-center gap-3">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => value && setViewMode(value as "table" | "pipeline")}
            className="border rounded-md"
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
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportOrdersCSV}>
                <Download className="h-4 w-4 mr-2" />
                Esporta CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Importa da file
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="h-4 w-4 mr-2" />
                Colonne
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
              <DropdownMenuSeparator />
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
              <Plus className="h-4 w-4 mr-2" />
              Nuovo Ordine
            </Link>
          </Button>
        </div>
      </div>

      <OrdersStatsCards stats={stats} />

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
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nessun ordine trovato</h3>
            <p className="text-muted-foreground mb-4">
              {orders.length === 0
                ? "Non hai ancora creato nessun ordine."
                : "Nessun ordine corrisponde ai filtri selezionati."}
            </p>
            {orders.length === 0 && (
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
          orders={filteredOrders}
          statuses={statuses}
          onStatusChange={handleStatusChange}
        />
      ) : (
        <div className="space-y-4">
          <OrdersTable
            orders={paginatedOrders}
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
              <p className="text-sm text-muted-foreground">
                Mostrando {showingFrom}–{showingTo} di {filteredOrders.length} ordini
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Precedente
                </Button>
                <span className="text-sm font-medium px-2">
                  Pagina {safePage} di {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={safePage >= totalPages}
                >
                  Successivo
                  <ChevronRight className="h-4 w-4 ml-1" />
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
