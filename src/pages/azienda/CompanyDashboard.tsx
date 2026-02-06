import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Users, HeadphonesIcon, Plus, Loader2, Euro } from "lucide-react";
import { Link } from "react-router-dom";

interface DashboardStats {
  totalOrders: number;
  totalCustomers: number;
  openTickets: number;
  pendingRevenue: number;
}

interface RecentOrder {
  id: string;
  description: string;
  total_amount: number;
  created_at: string;
  customer: {
    first_name: string;
    last_name: string;
  };
  status: {
    name: string;
    color: string;
  } | null;
}

export default function CompanyDashboard() {
  const { company } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0,
    totalCustomers: 0,
    openTickets: 0,
    pendingRevenue: 0,
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!company) return;

    async function fetchData() {
      try {
        const [ordersRes, customersRes, ticketsRes, ordersDataRes] = await Promise.all([
          supabase.from("orders").select("id", { count: "exact", head: true }).eq("company_id", company.id),
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", company.id),
          supabase.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("status", "aperto"),
          supabase
            .from("orders")
            .select(`
              id,
              description,
              total_amount,
              balance_amount,
              created_at,
              customer:profiles!orders_customer_id_fkey(first_name, last_name),
              status:order_statuses(name, color)
            `)
            .eq("company_id", company.id)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        // Calculate pending revenue (sum of balance_amount)
        const { data: revenueData } = await supabase
          .from("orders")
          .select("balance_amount")
          .eq("company_id", company.id);

        const pendingRevenue = revenueData?.reduce((sum, order) => sum + (Number(order.balance_amount) || 0), 0) || 0;

        setStats({
          totalOrders: ordersRes.count || 0,
          totalCustomers: customersRes.count || 0,
          openTickets: ticketsRes.count || 0,
          pendingRevenue,
        });

        setRecentOrders(ordersDataRes.data as unknown as RecentOrder[] || []);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [company]);

  const statCards = [
    {
      title: "Ordini Totali",
      value: stats.totalOrders,
      icon: ClipboardList,
      color: "text-primary",
    },
    {
      title: "Clienti",
      value: stats.totalCustomers,
      icon: Users,
      color: "text-primary",
    },
    {
      title: "Ticket Aperti",
      value: stats.openTickets,
      icon: HeadphonesIcon,
      color: stats.openTickets > 0 ? "text-warning" : "text-success",
    },
    {
      title: "Saldi da Incassare",
      value: `€${stats.pendingRevenue.toLocaleString("it-IT")}`,
      icon: Euro,
      color: "text-primary",
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Benvenuto nel pannello di controllo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/azienda/clienti/nuovo">
              <Plus className="h-4 w-4 mr-2" />
              Nuovo Cliente
            </Link>
          </Button>
          <Button asChild>
            <Link to="/azienda/ordini/nuovo">
              <Plus className="h-4 w-4 mr-2" />
              Nuovo Ordine
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Ordini Recenti</CardTitle>
                <CardDescription>Gli ultimi ordini inseriti</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/azienda/ordini">Vedi tutti</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nessun ordine presente</p>
                <Button variant="link" asChild className="mt-2">
                  <Link to="/azienda/ordini/nuovo">Crea il primo ordine</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="space-y-1">
                      <p className="font-medium text-sm line-clamp-1">{order.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.customer?.first_name} {order.customer?.last_name}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="font-medium text-sm">€{Number(order.total_amount).toLocaleString("it-IT")}</p>
                      {order.status && (
                        <Badge 
                          variant="secondary" 
                          style={{ backgroundColor: order.status.color + "20", color: order.status.color }}
                          className="text-xs"
                        >
                          {order.status.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Azioni Rapide</CardTitle>
            <CardDescription>Accedi velocemente alle funzionalità principali</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button variant="outline" className="justify-start h-auto py-3" asChild>
              <Link to="/azienda/ordini/nuovo">
                <ClipboardList className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <p className="font-medium">Nuovo Ordine</p>
                  <p className="text-xs text-muted-foreground">Crea un ordine per un cliente</p>
                </div>
              </Link>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" asChild>
              <Link to="/azienda/clienti/nuovo">
                <Users className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <p className="font-medium">Nuovo Cliente</p>
                  <p className="text-xs text-muted-foreground">Registra un nuovo cliente</p>
                </div>
              </Link>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" asChild>
              <Link to="/azienda/impostazioni">
                <ClipboardList className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <p className="font-medium">Configura Stati Ordine</p>
                  <p className="text-xs text-muted-foreground">Personalizza il progress tracker</p>
                </div>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
