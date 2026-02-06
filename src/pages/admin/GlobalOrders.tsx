import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { ClipboardList, Search, LogIn, Building, Loader2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";

interface Order {
  id: string;
  description: string;
  total_amount: number;
  created_at: string;
  expected_date: string | null;
  company: {
    id: string;
    name: string;
  };
  customer: {
    first_name: string;
    last_name: string;
  };
  status: {
    name: string;
    color: string;
  } | null;
}

interface Company {
  id: string;
  name: string;
}

export default function GlobalOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const { impersonateCompany } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      const [ordersRes, companiesRes] = await Promise.all([
        supabase
          .from("orders")
          .select(`
            id,
            description,
            total_amount,
            created_at,
            expected_date,
            company:companies!orders_company_id_fkey(id, name),
            customer:profiles!orders_customer_id_fkey(first_name, last_name),
            status:order_statuses!orders_current_status_id_fkey(name, color)
          `)
          .order("created_at", { ascending: false }),
        supabase.from("companies").select("id, name").order("name"),
      ]);

      if (ordersRes.data) {
        setOrders(ordersRes.data as unknown as Order[]);
      }
      if (companiesRes.data) {
        setCompanies(companiesRes.data);
      }
      setIsLoading(false);
    }

    fetchData();
  }, []);

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${order.customer.first_name} ${order.customer.last_name}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
    const matchesCompany = selectedCompany === "all" || order.company.id === selectedCompany;
    return matchesSearch && matchesCompany;
  });

  const handleImpersonate = async (companyId: string, orderId: string) => {
    await impersonateCompany(companyId);
    navigate(`/azienda/ordini/${orderId}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ordini Globali</h1>
        <p className="text-muted-foreground">Visualizza tutti gli ordini della piattaforma</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca per descrizione o cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedCompany} onValueChange={setSelectedCompany}>
          <SelectTrigger className="w-full sm:w-[250px]">
            <Building className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filtra per azienda" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le aziende</SelectItem>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nessun ordine trovato</h3>
            <p className="text-muted-foreground text-center mt-2">
              {searchQuery || selectedCompany !== "all"
                ? "Prova a modificare i filtri di ricerca"
                : "Non ci sono ancora ordini nella piattaforma"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordine</TableHead>
                  <TableHead>Azienda</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Importo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <p className="font-medium truncate">{order.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.id.substring(0, 8)}...
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.company.name}</Badge>
                    </TableCell>
                    <TableCell>
                      {order.customer.first_name} {order.customer.last_name}
                    </TableCell>
                    <TableCell>
                      {order.status ? (
                        <Badge
                          style={{
                            backgroundColor: order.status.color,
                            color: "white",
                          }}
                        >
                          {order.status.name}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">N/D</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(order.total_amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(order.created_at), "dd MMM yyyy", { locale: it })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleImpersonate(order.company.id, order.id)}
                      >
                        <LogIn className="h-4 w-4 mr-1" />
                        Vedi
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {!isLoading && filteredOrders.length > 0 && (
        <div className="text-sm text-muted-foreground">
          Mostrando {filteredOrders.length} ordini
          {selectedCompany !== "all" && ` per l'azienda selezionata`}
          {" · "}
          Valore totale: {formatCurrency(filteredOrders.reduce((sum, o) => sum + o.total_amount, 0))}
        </div>
      )}
    </div>
  );
}
