import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { it } from "date-fns/locale";
import {
  Warehouse as WarehouseIcon,
  Search,
  X,
  List,
  LayoutGrid,
  Calendar as CalendarIcon,
  Download,
  Printer,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Import warehouse components
import WarehouseAlerts from "@/components/warehouse/WarehouseAlerts";
import WarehouseStats from "@/components/warehouse/WarehouseStats";
import WarehouseKanbanView from "@/components/warehouse/WarehouseKanbanView";
import WarehouseCalendarView from "@/components/warehouse/WarehouseCalendarView";
import WarehouseListView from "@/components/warehouse/WarehouseListView";

type OrderItemStatus = "da_ordinare" | "ordinato" | "in_magazzino" | "installato";
type ViewMode = "list" | "kanban" | "calendar";
type GroupBy = "order" | "supplier" | "date" | "status";

const STATUS_CONFIG: Record<OrderItemStatus, { label: string }> = {
  da_ordinare: { label: "Da Ordinare" },
  ordinato: { label: "Ordinato" },
  in_magazzino: { label: "In Magazzino" },
  installato: { label: "Installato" },
};

interface WarehouseItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  status: OrderItemStatus;
  supplier_id: string | null;
  purchase_price: number | null;
  updated_at?: string | null;
  order: {
    id: string;
    order_code: string | null;
    expected_date: string | null;
    work_start_date: string | null;
    warehouse_arrival_date?: string | null;
    company_id: string;
    customer: {
      first_name: string;
      last_name: string;
    };
  };
}

interface OrderWithItems {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  expectedDate: string | null;
  items: WarehouseItem[];
}

export default function Warehouse() {
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // View and filter states
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [orderFilter, setOrderFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("order");
  const [quickFilter, setQuickFilter] = useState<"all" | "urgent" | "thisWeek" | "nextWeek">("all");

  // Fetch all order items with order details
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["warehouse-items", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];

      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id,
          name,
          description,
          quantity,
          status,
          supplier_id,
          purchase_price,
          updated_at,
          order:orders!inner(
            id,
            order_code,
            expected_date,
            work_start_date,
            warehouse_arrival_date,
            company_id,
            customer:profiles!orders_customer_id_fkey(first_name, last_name)
          )
        `)
        .eq("order.company_id", effectiveCompany.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as WarehouseItem[];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Fetch suppliers for filter
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", effectiveCompany.id)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Get unique orders for filter dropdown
  const uniqueOrders = useMemo(() => {
    const ordersMap = new Map<string, { id: string; code: string; customer: string }>();
    items.forEach((item) => {
      if (!ordersMap.has(item.order.id)) {
        ordersMap.set(item.order.id, {
          id: item.order.id,
          code: item.order.order_code || "N/A",
          customer: `${item.order.customer.first_name} ${item.order.customer.last_name}`,
        });
      }
    });
    return Array.from(ordersMap.values());
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    let filtered = [...items];
    const today = new Date();

    // Quick filter
    if (quickFilter === "urgent") {
      filtered = filtered.filter((item) => {
        if (item.status === "in_magazzino" || item.status === "installato") return false;
        const expectedDate = item.order.expected_date || item.order.work_start_date;
        if (!expectedDate) return false;
        const daysUntil = differenceInDays(new Date(expectedDate), today);
        return daysUntil <= 7 && daysUntil >= 0;
      });
    } else if (quickFilter === "thisWeek") {
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
      filtered = filtered.filter((item) => {
        const expectedDate = item.order.expected_date || item.order.work_start_date;
        if (!expectedDate) return false;
        const date = new Date(expectedDate);
        return date >= weekStart && date <= weekEnd;
      });
    } else if (quickFilter === "nextWeek") {
      const nextWeekStart = startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
      const nextWeekEnd = endOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
      filtered = filtered.filter((item) => {
        const expectedDate = item.order.expected_date || item.order.work_start_date;
        if (!expectedDate) return false;
        const date = new Date(expectedDate);
        return date >= nextWeekStart && date <= nextWeekEnd;
      });
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query))
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((item) => item.status === statusFilter);
    }

    if (orderFilter !== "all") {
      filtered = filtered.filter((item) => item.order.id === orderFilter);
    }

    if (supplierFilter !== "all") {
      filtered = filtered.filter((item) => item.supplier_id === supplierFilter);
    }

    return filtered;
  }, [items, searchQuery, statusFilter, orderFilter, supplierFilter, quickFilter]);

  // Group items by order (for list view)
  const filteredGroups = useMemo(() => {
    const grouped = new Map<string, OrderWithItems>();
    
    // Sort items based on groupBy
    let sortedItems = [...filteredItems];
    
    if (groupBy === "date") {
      sortedItems.sort((a, b) => {
        const dateA = a.order.expected_date || a.order.work_start_date || "";
        const dateB = b.order.expected_date || b.order.work_start_date || "";
        return dateA.localeCompare(dateB);
      });
    } else if (groupBy === "status") {
      const statusOrder: OrderItemStatus[] = ["da_ordinare", "ordinato", "in_magazzino", "installato"];
      sortedItems.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
    }

    sortedItems.forEach((item) => {
      const orderId = item.order.id;
      if (!grouped.has(orderId)) {
        grouped.set(orderId, {
          orderId,
          orderCode: item.order.order_code,
          customerName: `${item.order.customer.first_name} ${item.order.customer.last_name}`,
          expectedDate: item.order.expected_date || item.order.work_start_date,
          items: [],
        });
      }
      grouped.get(orderId)!.items.push(item);
    });

    // Sort groups if grouping by date
    let result = Array.from(grouped.values());
    if (groupBy === "date") {
      result.sort((a, b) => {
        const dateA = a.expectedDate || "";
        const dateB = b.expectedDate || "";
        return dateA.localeCompare(dateB);
      });
    }

    return result;
  }, [filteredItems, groupBy]);

  // Update item status mutation
  const updateItemStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: OrderItemStatus }) => {
      const { error } = await supabase
        .from("order_items")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-items"] });
      toast({
        title: "Stato aggiornato",
        description: "Lo stato dell'articolo è stato aggiornato.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare lo stato dell'articolo.",
        variant: "destructive",
      });
    },
  });

  // Batch update mutation
  const batchUpdateMutation = useMutation({
    mutationFn: async ({ itemIds, status }: { itemIds: string[]; status: OrderItemStatus }) => {
      const { error } = await supabase
        .from("order_items")
        .update({ status, updated_at: new Date().toISOString() })
        .in("id", itemIds);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-items"] });
      toast({
        title: "Articoli aggiornati",
        description: `${variables.itemIds.length} articoli sono stati aggiornati.`,
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare gli articoli.",
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (itemId: string, status: OrderItemStatus) => {
    updateItemStatusMutation.mutate({ itemId, status });
  };

  const handleMarkAllInstalled = (orderItems: WarehouseItem[]) => {
    const itemIds = orderItems.map((item) => item.id);
    batchUpdateMutation.mutate({ itemIds, status: "installato" });
  };

  const handleBatchStatusChange = (itemIds: string[], status: OrderItemStatus) => {
    batchUpdateMutation.mutate({ itemIds, status });
  };

  const getSupplierName = (supplierId: string | null) => {
    if (!supplierId) return null;
    const supplier = suppliers.find((s) => s.id === supplierId);
    return supplier?.name || null;
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setOrderFilter("all");
    setSupplierFilter("all");
    setQuickFilter("all");
  };

  const hasActiveFilters =
    searchQuery || statusFilter !== "all" || orderFilter !== "all" || supplierFilter !== "all" || quickFilter !== "all";

  // Count urgent items
  const urgentItemsCount = useMemo(() => {
    const today = new Date();
    return items.filter((item) => {
      if (item.status === "in_magazzino" || item.status === "installato") return false;
      const expectedDate = item.order.expected_date || item.order.work_start_date;
      if (!expectedDate) return false;
      const daysUntil = differenceInDays(new Date(expectedDate), today);
      return daysUntil <= 7 && daysUntil >= 0;
    }).length;
  }, [items]);

  // Export to CSV
  const exportToCSV = () => {
    const headers = ["Articolo", "Quantità", "Stato", "Fornitore", "Ordine", "Cliente", "Data Posa"];
    const rows = filteredItems.map((item) => [
      item.name,
      item.quantity || 1,
      STATUS_CONFIG[item.status].label,
      getSupplierName(item.supplier_id) || "",
      item.order.order_code || "",
      `${item.order.customer.first_name} ${item.order.customer.last_name}`,
      item.order.expected_date || item.order.work_start_date || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `magazzino_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();

    toast({
      title: "Esportazione completata",
      description: `${filteredItems.length} articoli esportati.`,
    });
  };

  // Print list
  const printList = () => {
    window.print();
  };

  const isUpdating = updateItemStatusMutation.isPending || batchUpdateMutation.isPending;

  if (!effectiveCompany) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Seleziona un'azienda per visualizzare il magazzino.
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <WarehouseIcon className="h-8 w-8" />
            Magazzino
          </h1>
          <p className="text-muted-foreground">
            Gestione materiali e tracking articoli
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Esporta
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Esporta CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={printList}>
                <Printer className="h-4 w-4 mr-2" />
                Stampa lista
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">Magazzino - {effectiveCompany.name}</h1>
        <p className="text-sm text-muted-foreground">
          Generato il {format(new Date(), "dd MMMM yyyy", { locale: it })}
        </p>
      </div>

      {/* Alerts */}
      <div className="print:hidden">
        <WarehouseAlerts items={items} />
      </div>

      {/* Stats */}
      <WarehouseStats items={items} />

      {/* View Toggle & Filters */}
      <Card className="print:hidden">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* View mode tabs */}
            <div className="flex items-center justify-between">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <TabsList>
                  <TabsTrigger value="list" className="gap-2">
                    <List className="h-4 w-4" />
                    Lista
                  </TabsTrigger>
                  <TabsTrigger value="kanban" className="gap-2">
                    <LayoutGrid className="h-4 w-4" />
                    Kanban
                  </TabsTrigger>
                  <TabsTrigger value="calendar" className="gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Calendario
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {viewMode === "list" && (
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Raggruppa per" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order">Per ordine</SelectItem>
                    <SelectItem value="date">Per data posa</SelectItem>
                    <SelectItem value="status">Per stato</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Quick filters */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={quickFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("all")}
              >
                Tutti
              </Button>
              <Button
                variant={quickFilter === "urgent" ? "destructive" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("urgent")}
                className="gap-1"
              >
                <AlertTriangle className="h-4 w-4" />
                Urgenti
                {urgentItemsCount > 0 && (
                  <span className="ml-1 bg-destructive-foreground text-destructive rounded-full px-1.5 py-0.5 text-xs font-bold">
                    {urgentItemsCount}
                  </span>
                )}
              </Button>
              <Button
                variant={quickFilter === "thisWeek" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("thisWeek")}
                className="gap-1"
              >
                <Clock className="h-4 w-4" />
                Questa settimana
              </Button>
              <Button
                variant={quickFilter === "nextWeek" ? "secondary" : "outline"}
                size="sm"
                onClick={() => setQuickFilter("nextWeek")}
              >
                Prossima settimana
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca articolo..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                    <SelectItem key={status} value={status}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={orderFilter} onValueChange={setOrderFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Ordine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli ordini</SelectItem>
                  {uniqueOrders.map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.code} - {order.customer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Fornitore" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i fornitori</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Pulisci filtri
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content based on view mode */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Caricamento articoli...
        </div>
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {hasActiveFilters
              ? "Nessun articolo trovato con i filtri applicati."
              : "Nessun articolo presente nel magazzino."}
          </CardContent>
        </Card>
      ) : (
        <>
          {viewMode === "list" && (
            <WarehouseListView
              orderGroups={filteredGroups}
              onStatusChange={handleStatusChange}
              onMarkAllInstalled={handleMarkAllInstalled}
              onBatchStatusChange={handleBatchStatusChange}
              getSupplierName={getSupplierName}
              isUpdating={isUpdating}
            />
          )}

          {viewMode === "kanban" && (
            <WarehouseKanbanView
              items={filteredItems}
              onStatusChange={handleStatusChange}
              getSupplierName={getSupplierName}
            />
          )}

          {viewMode === "calendar" && (
            <WarehouseCalendarView items={filteredItems} />
          )}
        </>
      )}
    </div>
  );
}
