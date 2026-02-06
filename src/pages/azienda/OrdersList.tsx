import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Search, Package, Eye } from "lucide-react";
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

export default function OrdersList() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "paid">("all");

  // Fetch orders for the company
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          customer:profiles!orders_customer_id_fkey(first_name, last_name, email),
          status:order_statuses!orders_current_status_id_fkey(name, color)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as OrderWithDetails[];
    },
    enabled: !!user,
  });

  // Fetch statuses for filter dropdown
  const { data: statuses = [] } = useQuery({
    queryKey: ["order-statuses", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, color")
        .order("position");

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

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

    return matchesSearch && matchesStatus && matchesPayment;
  });


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
        <Button asChild>
          <Link to="/azienda/ordini/nuovo">
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Ordine
          </Link>
        </Button>
      </div>

      {/* Filters */}
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
      </div>

      {/* Orders Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Caricamento ordini...
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
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/azienda/ordini/${order.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
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
