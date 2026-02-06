import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Warehouse as WarehouseIcon,
  Search,
  Calendar,
  Package,
  ShoppingCart,
  Truck,
  CheckCircle2,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type OrderItemStatus = "da_ordinare" | "ordinato" | "in_magazzino" | "installato";

const STATUS_CONFIG: Record<OrderItemStatus, { label: string; color: string; bgColor: string; borderColor: string; icon: typeof Package }> = {
  da_ordinare: {
    label: "Da Ordinare",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-l-4 border-amber-500",
    icon: ShoppingCart,
  },
  ordinato: {
    label: "Ordinato",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-l-4 border-blue-500",
    icon: Truck,
  },
  in_magazzino: {
    label: "In Magazzino",
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-l-4 border-green-500",
    icon: Package,
  },
  installato: {
    label: "Installato",
    color: "text-slate-700",
    bgColor: "bg-slate-50",
    borderColor: "border-l-4 border-slate-500",
    icon: CheckCircle2,
  },
};

interface WarehouseItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  status: OrderItemStatus;
  supplier_id: string | null;
  purchase_price: number | null;
  order: {
    id: string;
    order_code: string | null;
    expected_date: string | null;
    work_start_date: string | null;
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

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [orderFilter, setOrderFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");

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
          order:orders!inner(
            id,
            order_code,
            expected_date,
            work_start_date,
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

  // Calculate statistics
  const stats = useMemo(() => {
    const inMagazzino = items.filter((i) => i.status === "in_magazzino");
    const daOrdinare = items.filter((i) => i.status === "da_ordinare");
    const ordinati = items.filter((i) => i.status === "ordinato");

    const uniqueOrders = (arr: WarehouseItem[]) =>
      new Set(arr.map((i) => i.order.id)).size;

    return {
      inMagazzino: { count: inMagazzino.length, orders: uniqueOrders(inMagazzino) },
      daOrdinare: { count: daOrdinare.length, orders: uniqueOrders(daOrdinare) },
      ordinati: { count: ordinati.length, orders: uniqueOrders(ordinati) },
    };
  }, [items]);

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

  // Filter and group items
  const filteredGroups = useMemo(() => {
    let filtered = [...items];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query))
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((item) => item.status === statusFilter);
    }

    // Apply order filter
    if (orderFilter !== "all") {
      filtered = filtered.filter((item) => item.order.id === orderFilter);
    }

    // Apply supplier filter
    if (supplierFilter !== "all") {
      filtered = filtered.filter((item) => item.supplier_id === supplierFilter);
    }

    // Group by order
    const grouped = new Map<string, OrderWithItems>();
    filtered.forEach((item) => {
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

    return Array.from(grouped.values());
  }, [items, searchQuery, statusFilter, orderFilter, supplierFilter]);

  // Update item status mutation
  const updateItemStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: OrderItemStatus }) => {
      const { error } = await supabase
        .from("order_items")
        .update({ status })
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

  // Mark all items as installed mutation
  const markAllInstalledMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const { error } = await supabase
        .from("order_items")
        .update({ status: "installato" })
        .in("id", itemIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-items"] });
      toast({
        title: "Articoli aggiornati",
        description: "Tutti gli articoli sono stati segnati come installati.",
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
    markAllInstalledMutation.mutate(itemIds);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setOrderFilter("all");
    setSupplierFilter("all");
  };

  const hasActiveFilters =
    searchQuery || statusFilter !== "all" || orderFilter !== "all" || supplierFilter !== "all";

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd MMM yyyy", { locale: it });
  };

  const getSupplierName = (supplierId: string | null) => {
    if (!supplierId) return null;
    const supplier = suppliers.find((s) => s.id === supplierId);
    return supplier?.name || null;
  };

  if (!effectiveCompany) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Seleziona un'azienda per visualizzare il magazzino.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <WarehouseIcon className="h-8 w-8" />
          Magazzino
        </h1>
        <p className="text-muted-foreground">
          Panoramica articoli e gestione stato materiali
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">In Magazzino</CardTitle>
            <Package className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.inMagazzino.count}
            </div>
            <p className="text-xs text-muted-foreground">
              in {stats.inMagazzino.orders} ordini
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Da Ordinare</CardTitle>
            <ShoppingCart className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {stats.daOrdinare.count}
            </div>
            <p className="text-xs text-muted-foreground">
              in {stats.daOrdinare.orders} ordini
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ordinati</CardTitle>
            <Truck className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats.ordinati.count}
            </div>
            <p className="text-xs text-muted-foreground">
              in {stats.ordinati.orders} ordini
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
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
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Caricamento articoli...
        </div>
      ) : filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {hasActiveFilters
              ? "Nessun articolo trovato con i filtri applicati."
              : "Nessun articolo presente nel magazzino."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((orderGroup) => (
            <Card key={orderGroup.orderId}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Link to={`/azienda/ordini/${orderGroup.orderId}`}>
                      <CardTitle className="text-lg hover:underline cursor-pointer">
                        {orderGroup.orderCode || "Ordine"} - {orderGroup.customerName}
                      </CardTitle>
                    </Link>
                    {orderGroup.expectedDate && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="h-3 w-3" />
                        Posa prevista: {formatDate(orderGroup.expectedDate)}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMarkAllInstalled(orderGroup.items)}
                    disabled={markAllInstalledMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Segna tutti Installati
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {orderGroup.items.map((item) => {
                    const statusConfig = STATUS_CONFIG[item.status];
                    const supplierName = getSupplierName(item.supplier_id);

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "p-3 rounded-lg flex items-center justify-between",
                          statusConfig.bgColor,
                          statusConfig.borderColor
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="secondary"
                            className={cn("font-mono", statusConfig.color)}
                          >
                            {item.quantity || 1}x
                          </Badge>
                          <div>
                            <p className="font-medium">{item.name}</p>
                            {supplierName && (
                              <p className="text-sm text-muted-foreground">
                                Fornitore: {supplierName}
                              </p>
                            )}
                          </div>
                        </div>

                        <Select
                          value={item.status}
                          onValueChange={(value) =>
                            handleStatusChange(item.id, value as OrderItemStatus)
                          }
                          disabled={updateItemStatusMutation.isPending}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                              <SelectItem key={status} value={status}>
                                {config.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
