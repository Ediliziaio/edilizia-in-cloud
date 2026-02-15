import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Package, LayoutList, Columns3, Download, Upload, MoreVertical } from "lucide-react";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calculateNetFromGross } from "@/lib/vatUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OrdersPipelineView } from "@/components/orders/OrdersPipelineView";
import { OrdersStatsCards } from "@/components/orders/OrdersStatsCards";
import { OrdersFilters } from "@/components/orders/OrdersFilters";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { CSVImportDialog, type ImportField } from "@/components/shared/CSVImportDialog";
import { useToast } from "@/hooks/use-toast";

interface OrderWithDetails {
  id: string;
  order_code: string | null;
  description: string;
  total_amount: number;
  vat_rate: number | null;
  deposit_amount: number;
  deposit_paid: boolean | null;
  deposit_2_amount: number | null;
  deposit_2_paid: boolean | null;
  balance_amount: number;
  balance_paid: boolean | null;
  expected_date: string | null;
  warehouse_arrival_date: string | null;
  created_at: string;
  current_status_id: string | null;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  status: {
    name: string;
    color: string;
  } | null;
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

function getAmountDue(order: OrderWithDetails): number {
  let due = 0;
  if (!order.deposit_paid) due += order.deposit_amount || 0;
  if (!order.deposit_2_paid) due += (order.deposit_2_amount || 0);
  if (!order.balance_paid) due += order.balance_amount || 0;
  return due;
}

function getAmountCollected(order: OrderWithDetails): number {
  let collected = 0;
  if (order.deposit_paid) collected += order.deposit_amount || 0;
  if (order.deposit_2_paid) collected += (order.deposit_2_amount || 0);
  if (order.balance_paid) collected += order.balance_amount || 0;
  return collected;
}

function getPendingPayments(order: OrderWithDetails): string[] {
  const pending: string[] = [];
  if (order.deposit_amount > 0 && !order.deposit_paid) pending.push("Acc. 1");
  if (order.deposit_2_amount && order.deposit_2_amount > 0 && !order.deposit_2_paid) pending.push("Acc. 2");
  if (order.balance_amount > 0 && !order.balance_paid) pending.push("Saldo");
  return pending;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "paid">("all");
  const [viewMode, setViewMode] = useState<"table" | "pipeline">("table");
  const [contractDateRange, setContractDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [warehouseDateRange, setWarehouseDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [expectedDateRange, setExpectedDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [importOpen, setImportOpen] = useState(false);

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
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as OrderWithDetails[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Batch queries for cost calculations
  const orderIds = orders.map(o => o.id);

  const { data: itemCosts = [] } = useQuery({
    queryKey: ["order-items-costs", effectiveCompany?.id, orderIds],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, purchase_price, quantity, vat_rate")
        .in("order_id", orderIds);
      if (error) throw error;
      return data;
    },
    enabled: orderIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: employeeCosts = [] } = useQuery({
    queryKey: ["order-employees-costs", effectiveCompany?.id, orderIds],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_employees")
        .select("order_id, total_cost")
        .in("order_id", orderIds);
      if (error) throw error;
      return data;
    },
    enabled: orderIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: externalTeamCosts = [] } = useQuery({
    queryKey: ["order-external-teams-costs", effectiveCompany?.id, orderIds],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_external_teams")
        .select("order_id, total_cost, vat_rate")
        .in("order_id", orderIds);
      if (error) throw error;
      return data;
    },
    enabled: orderIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: salespeopleData = [] } = useQuery({
    queryKey: ["order-salespeople-costs", effectiveCompany?.id, orderIds],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_salespeople")
        .select("order_id, commission_type, commission_value, deduction_amount")
        .in("order_id", orderIds);
      if (error) throw error;
      return data;
    },
    enabled: orderIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

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
      const { error: updateError } = await supabase
        .from("orders")
        .update({ current_status_id: statusId })
        .eq("id", orderId);
      if (updateError) throw updateError;
      const { error: historyError } = await supabase
        .from("order_status_history")
        .insert({ order_id: orderId, status_id: statusId, changed_by: user?.id || "" });
      if (historyError) throw historyError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({ title: "Stato aggiornato", description: "L'ordine è stato spostato al nuovo stato" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare lo stato dell'ordine", variant: "destructive" });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data: items } = await supabase.from("order_items").select("id").eq("order_id", orderId);
      if (items && items.length > 0) {
        const itemIds = items.map(i => i.id);
        await supabase.from("order_item_attachments").delete().in("order_item_id", itemIds);
      }
      await Promise.all([
        supabase.from("order_items").delete().eq("order_id", orderId),
        supabase.from("order_status_history").delete().eq("order_id", orderId),
        supabase.from("order_employees").delete().eq("order_id", orderId),
        supabase.from("order_external_teams").delete().eq("order_id", orderId),
        supabase.from("order_salespeople").delete().eq("order_id", orderId),
        supabase.from("order_attachments").delete().eq("order_id", orderId),
      ]);
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({ title: "Ordine eliminato", description: "L'ordine è stato eliminato con successo" });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile eliminare l'ordine", variant: "destructive" });
    },
  });

  const handleStatusChange = async (orderId: string, newStatusId: string) => {
    await updateOrderStatus({ orderId, statusId: newStatusId });
  };

  const hasDateFilters = contractDateRange.from || contractDateRange.to ||
    warehouseDateRange.from || warehouseDateRange.to ||
    expectedDateRange.from || expectedDateRange.to;

  const hasAnyFilter = !!(hasDateFilters || searchQuery || statusFilter !== "all" ||
    paymentFilter !== "all" || customerFilter !== "all" || amountMin || amountMax);

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
    setContractDateRange({ from: undefined, to: undefined });
    setWarehouseDateRange({ from: undefined, to: undefined });
    setExpectedDateRange({ from: undefined, to: undefined });
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

    return matchesSearch && matchesStatus && matchesPayment && matchesCustomer && matchesAmount &&
      matchesContractDate && matchesWarehouseDate && matchesExpectedDate;
  });

  const stats = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const totalGross = filteredOrders.reduce((sum, o) => sum + o.total_amount * (1 + (o.vat_rate ?? 22) / 100), 0);
    const collected = filteredOrders.reduce((sum, o) => sum + getAmountCollected(o), 0);
    const pending = filteredOrders.reduce((sum, o) => sum + getAmountDue(o), 0);
    return { totalOrders, totalGross, collected, pending };
  }, [filteredOrders]);

  // Export CSV
  const exportOrdersCSV = useCallback(() => {
    const rows = [["Codice Ordine", "Cliente", "Descrizione", "Importo Totale", "Acconto 1", "Acconto 2", "Saldo", "Stato", "Data Contratto", "Data Magazzino", "Data Posa", "Stato Pagamenti"]];
    filteredOrders.forEach((o) => {
      const pending = getPendingPayments(o);
      rows.push([
        o.order_code || "",
        o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : "",
        o.description,
        String(o.total_amount),
        String(o.deposit_amount || 0),
        String(o.deposit_2_amount || 0),
        String(o.balance_amount || 0),
        o.status?.name || "",
        o.created_at ? format(new Date(o.created_at), "dd/MM/yyyy") : "",
        o.warehouse_arrival_date ? format(new Date(o.warehouse_arrival_date), "dd/MM/yyyy") : "",
        o.expected_date ? format(new Date(o.expected_date), "dd/MM/yyyy") : "",
        pending.length > 0 ? pending.join(", ") : "Tutto pagato",
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ordini-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        <OrdersTable
          orders={filteredOrders}
          onDelete={(id) => deleteOrderMutation.mutate(id)}
          isDeleting={deleteOrderMutation.isPending}
          orderCosts={orderCostsMap}
        />
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
