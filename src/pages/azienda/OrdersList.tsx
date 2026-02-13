import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Search, Package, Eye, LayoutList, Columns3, X, Euro, ShoppingBag, TrendingUp, AlertCircle, CalendarDays, Pencil, Trash2 } from "lucide-react";

import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DateRangeFilter } from "@/components/orders/DateRangeFilter";
import { OrdersPipelineView } from "@/components/orders/OrdersPipelineView";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface OrderWithDetails {
  id: string;
  order_code: string | null;
  description: string;
  total_amount: number;
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

// Helper per calcolare pagamenti in sospeso
function getPendingPayments(order: OrderWithDetails): string[] {
  const pending: string[] = [];
  
  if (order.deposit_amount > 0 && !order.deposit_paid) {
    pending.push("Acc. 1");
  }
  
  if (order.deposit_2_amount && order.deposit_2_amount > 0 && !order.deposit_2_paid) {
    pending.push("Acc. 2");
  }
  
  if (order.balance_amount > 0 && !order.balance_paid) {
    pending.push("Saldo");
  }
  
  return pending;
}

// Helper per calcolare importo da ricevere
function getAmountDue(order: OrderWithDetails): number {
  let due = 0;
  if (!order.deposit_paid) due += order.deposit_amount || 0;
  if (!order.deposit_2_paid) due += (order.deposit_2_amount || 0);
  if (!order.balance_paid) due += order.balance_amount || 0;
  return due;
}

// Helper per calcolare importo incassato
function getAmountCollected(order: OrderWithDetails): number {
  let collected = 0;
  if (order.deposit_paid) collected += order.deposit_amount || 0;
  if (order.deposit_2_paid) collected += (order.deposit_2_amount || 0);
  if (order.balance_paid) collected += order.balance_amount || 0;
  return collected;
}

// Mesi per filtro rapido
const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

export default function OrdersList() {
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "paid">("all");
  const [viewMode, setViewMode] = useState<"table" | "pipeline">("table");
  
  // Date range filters
  const [contractDateRange, setContractDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [warehouseDateRange, setWarehouseDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [expectedDateRange, setExpectedDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  
  // Customer and amount filters
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  // Fetch orders for the company (filtered by company_id)
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
    staleTime: 5 * 60 * 1000, // 5 minuti
  });

  // Fetch statuses for filter dropdown (filtered by company_id)
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
    staleTime: 10 * 60 * 1000, // 10 minuti - statuses cambiano raramente
  });

  // Mutation for updating order status
  const { mutateAsync: updateOrderStatus } = useMutation({
    mutationFn: async ({ orderId, statusId }: { orderId: string; statusId: string }) => {
      // 1. Update order status
      const { error: updateError } = await supabase
        .from("orders")
        .update({ current_status_id: statusId })
        .eq("id", orderId);
      
      if (updateError) throw updateError;

      // 2. Record in status history
      const { error: historyError } = await supabase
        .from("order_status_history")
        .insert({
          order_id: orderId,
          status_id: statusId,
          changed_by: user?.id || "",
        });
      
      if (historyError) throw historyError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: "Stato aggiornato",
        description: "L'ordine è stato spostato al nuovo stato",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare lo stato dell'ordine",
        variant: "destructive",
      });
    },
  });

  // Delete order mutation with manual cascade
  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      // 1. Get order_items to delete their attachments
      const { data: items } = await supabase
        .from("order_items")
        .select("id")
        .eq("order_id", orderId);

      // 2. Delete order_item_attachments
      if (items && items.length > 0) {
        const itemIds = items.map(i => i.id);
        await supabase.from("order_item_attachments").delete().in("order_item_id", itemIds);
      }

      // 3. Delete related tables in parallel
      await Promise.all([
        supabase.from("order_items").delete().eq("order_id", orderId),
        supabase.from("order_status_history").delete().eq("order_id", orderId),
        supabase.from("order_employees").delete().eq("order_id", orderId),
        supabase.from("order_external_teams").delete().eq("order_id", orderId),
        supabase.from("order_salespeople").delete().eq("order_id", orderId),
        supabase.from("order_attachments").delete().eq("order_id", orderId),
      ]);

      // 4. Delete the order itself
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: "Ordine eliminato",
        description: "L'ordine è stato eliminato con successo",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile eliminare l'ordine",
        variant: "destructive",
      });
    },
  });

  // Handler for pipeline status change
  const handleStatusChange = async (orderId: string, newStatusId: string) => {
    await updateOrderStatus({ orderId, statusId: newStatusId });
  };

  // Check if any date filter is active
  const hasDateFilters = contractDateRange.from || contractDateRange.to || 
                         warehouseDateRange.from || warehouseDateRange.to ||
                         expectedDateRange.from || expectedDateRange.to;

  // Check if any filter is active
  const hasAnyFilter = hasDateFilters || searchQuery || statusFilter !== "all" || 
                       paymentFilter !== "all" || customerFilter !== "all" || 
                       amountMin || amountMax;

  // Extract unique customers from orders
  const uniqueCustomers = useMemo(() => {
    const customerMap = new Map<string, { id: string; name: string }>();
    orders.forEach(order => {
      if (order.customer) {
        const customerId = `${order.customer.first_name}-${order.customer.last_name}-${order.customer.email}`;
        customerMap.set(customerId, {
          id: customerId,
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
    setContractDateRange({ from: undefined, to: undefined });
    setWarehouseDateRange({ from: undefined, to: undefined });
    setExpectedDateRange({ from: undefined, to: undefined });
  };

  // Month filter handler
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


  // Filter orders
  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.order_code?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      `${order.customer?.first_name} ${order.customer?.last_name}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || order.current_status_id === statusFilter;

    const pendingPayments = getPendingPayments(order);
    const matchesPayment =
      paymentFilter === "all" ||
      (paymentFilter === "pending" && pendingPayments.length > 0) ||
      (paymentFilter === "paid" && pendingPayments.length === 0);

    // Filtro Cliente
    const customerKey = order.customer 
      ? `${order.customer.first_name}-${order.customer.last_name}-${order.customer.email}`
      : "";
    const matchesCustomer = customerFilter === "all" || customerKey === customerFilter;

    // Filtro Importo
    const minAmount = amountMin ? parseFloat(amountMin) : null;
    const maxAmount = amountMax ? parseFloat(amountMax) : null;
    const matchesAmount = 
      (minAmount === null || order.total_amount >= minAmount) &&
      (maxAmount === null || order.total_amount <= maxAmount);

    // Filtro Data Contratto (created_at)
    const orderCreatedAt = new Date(order.created_at);
    const matchesContractDate = 
      (!contractDateRange.from || orderCreatedAt >= contractDateRange.from) &&
      (!contractDateRange.to || orderCreatedAt <= new Date(contractDateRange.to.getTime() + 86400000 - 1));

    // Filtro Arrivo Merce
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

    // Filtro Data Posa
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

  // Stats calcolate sugli ordini filtrati
  const stats = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const totalAmount = filteredOrders.reduce((sum, o) => sum + o.total_amount, 0);
    const collected = filteredOrders.reduce((sum, o) => sum + getAmountCollected(o), 0);
    const pending = filteredOrders.reduce((sum, o) => sum + getAmountDue(o), 0);
    return { totalOrders, totalAmount, collected, pending };
  }, [filteredOrders]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ordini</h1>
          <p className="text-muted-foreground">
            Gestisci gli ordini della tua azienda
          </p>
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
          <Button asChild>
            <Link to="/azienda/ordini/nuovo">
              <Plus className="h-4 w-4 mr-2" />
              Nuovo Ordine
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ShoppingBag className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalOrders}</p>
              <p className="text-xs text-muted-foreground">N° Ordini</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950">
              <Euro className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</p>
              <p className="text-xs text-muted-foreground">Importo Totale</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(stats.collected)}</p>
              <p className="text-xs text-muted-foreground">Incassato</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-950">
              <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(stats.pending)}</p>
              <p className="text-xs text-muted-foreground">Da Incassare</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Row 1: Search + Status + Payment + Month */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per codice, descrizione o cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filtra per stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: status.color }}
                  />
                  {status.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={(val) => setPaymentFilter(val as "all" | "pending" | "paid")}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filtra pagamenti" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i pagamenti</SelectItem>
            <SelectItem value="pending">In Sospeso</SelectItem>
            <SelectItem value="paid">Tutto Pagato</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={handleMonthChange}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <CalendarDays className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Mese" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i mesi</SelectItem>
            {MONTHS.map((name, i) => (
              <SelectItem key={i} value={i.toString()}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filters Row 2: Customer, Amount, Date Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Customer Filter */}
        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filtra cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i clienti</SelectItem>
            {uniqueCustomers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Amount Range Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={`w-full sm:w-[180px] justify-start text-left font-normal ${
                (amountMin || amountMax) ? "border-primary" : ""
              }`}
            >
              <Euro className="mr-2 h-4 w-4" />
              {amountMin || amountMax ? (
                <span className="truncate">
                  {amountMin ? `€${amountMin}` : "..."} - {amountMax ? `€${amountMax}` : "..."}
                </span>
              ) : (
                <span>Importo</span>
              )}
              {(amountMin || amountMax) && (
                <X 
                  className="ml-auto h-4 w-4 opacity-50 hover:opacity-100" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setAmountMin("");
                    setAmountMax("");
                  }}
                />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-4" align="start">
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Range Importo</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Minimo (€)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={amountMin}
                    onChange={(e) => setAmountMin(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Massimo (€)</Label>
                  <Input
                    type="number"
                    placeholder="∞"
                    value={amountMax}
                    onChange={(e) => setAmountMax(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              {(amountMin || amountMax) && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => {
                    setAmountMin("");
                    setAmountMax("");
                  }}
                >
                  Cancella
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <DateRangeFilter
          label="Data Contratto"
          range={contractDateRange}
          onRangeChange={setContractDateRange}
        />
        <DateRangeFilter
          label="Arrivo Merce"
          range={warehouseDateRange}
          onRangeChange={setWarehouseDateRange}
        />
        <DateRangeFilter
          label="Data Posa"
          range={expectedDateRange}
          onRangeChange={setExpectedDateRange}
        />
        
        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground">
            <X className="h-4 w-4 mr-1" />
            Pulisci filtri
          </Button>
        )}
      </div>

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
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codice</TableHead>
                  <TableHead>Descrizione</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Totale</TableHead>
                  <TableHead className="text-right">Da Ricevere</TableHead>
                  <TableHead className="hidden md:table-cell">Data Contratto</TableHead>
                  <TableHead className="hidden lg:table-cell">Arrivo Merce</TableHead>
                  <TableHead className="hidden lg:table-cell">Data Posa</TableHead>
                  <TableHead>Pagamenti</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.order_code || "—"}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {order.description}
                    </TableCell>
                    <TableCell>
                      {order.customer
                        ? `${order.customer.first_name} ${order.customer.last_name}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(order.total_amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const due = getAmountDue(order);
                        return (
                          <span className={due > 0 ? "text-orange-600 dark:text-orange-400 font-medium" : "text-emerald-600 dark:text-emerald-400"}>
                            {formatCurrency(due)}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDateShort(order.created_at)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {order.warehouse_arrival_date ? formatDateShort(order.warehouse_arrival_date) : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {order.expected_date ? formatDateShort(order.expected_date) : "—"}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const pending = getPendingPayments(order);
                        if (pending.length === 0) {
                          return (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
                              OK
                            </Badge>
                          );
                        }
                        return (
                          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-0">
                            {pending.join(", ")}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {order.status ? (
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: order.status.color,
                            color: order.status.color,
                          }}
                        >
                          {order.status.name}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/azienda/ordini/${order.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/azienda/ordini/${order.id}/modifica`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" disabled={deleteOrderMutation.isPending}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Elimina Ordine</AlertDialogTitle>
                              <AlertDialogDescription>
                                Sei sicuro di voler eliminare l'ordine{" "}
                                <strong>{order.order_code || order.description}</strong>?
                                <br />
                                Verranno eliminati anche tutti i dati collegati (articoli, allegati, storico stati, ecc.).
                                <br />
                                Questa azione non può essere annullata.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteOrderMutation.mutate(order.id)}
                              >
                                Elimina
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
