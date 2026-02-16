import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Users, HeadphonesIcon, Plus, Loader2, Euro, Package, TrendingUp, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/formatters";
import { LaborCostsStats } from "@/components/dashboard/LaborCostsStats";
import { SupplierPaymentsSummary } from "@/components/dashboard/SupplierPaymentsSummary";

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

interface UrgentItem {
  id: string;
  name: string;
  orderCode: string | null;
  customerName: string;
  daysLeft: number;
}

export default function CompanyDashboard() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Main dashboard data query with caching
  const { data: dashboardData, isLoading, isError } = useQuery({
    queryKey: ["dashboard-data", companyId],
    queryFn: async () => {
      const now = new Date();
      const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

      const [ordersRes, customersRes, ticketsRes, ordersDataRes, pendingRevenueRes, urgentItemsRes, costsRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("company_id", companyId!),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId!),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", companyId!).eq("status", "aperto"),
        supabase
          .from("orders")
          .select(`
            id, description, total_amount, created_at,
            customer:profiles!orders_customer_id_fkey(first_name, last_name),
            status:order_statuses(name, color)
          `)
          .eq("company_id", companyId!)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("orders")
          .select("deposit_amount, deposit_paid, deposit_expected_date, deposit_2_amount, deposit_2_paid, deposit_2_expected_date, balance_amount, balance_paid, balance_expected_date")
          .eq("company_id", companyId!),
        supabase
          .from("order_items")
          .select(`
            id, name, status,
            order:orders!inner(
              id, order_code, work_start_date, expected_date, company_id,
              customer:profiles!orders_customer_id_fkey(first_name, last_name)
            )
          `)
          .eq("order.company_id", companyId!)
          .neq("status", "installato")
          .neq("status", "in_magazzino"),
        // Fetch unpaid costs for this month
        supabase
          .from("company_costs")
          .select("amount, due_date, is_paid")
          .eq("company_id", companyId!)
          .eq("is_paid", false),
      ]);

      // Calculate pending revenue
      let pendingRevenue = 0;
      let pendingOrdersCount = 0;
      let overduePayments = 0;
      let overdueCount = 0;

      const todayStr = now.toISOString().split("T")[0];

      pendingRevenueRes.data?.forEach(order => {
        let orderPending = 0;
        if (!order.deposit_paid && Number(order.deposit_amount) > 0) {
          orderPending += Number(order.deposit_amount);
          if (order.deposit_expected_date && order.deposit_expected_date < todayStr) {
            overduePayments += Number(order.deposit_amount);
            overdueCount++;
          }
        }
        if (!order.deposit_2_paid && Number(order.deposit_2_amount) > 0) {
          orderPending += Number(order.deposit_2_amount);
          if (order.deposit_2_expected_date && order.deposit_2_expected_date < todayStr) {
            overduePayments += Number(order.deposit_2_amount);
            overdueCount++;
          }
        }
        if (!order.balance_paid && Number(order.balance_amount) > 0) {
          orderPending += Number(order.balance_amount);
          if (order.balance_expected_date && order.balance_expected_date < todayStr) {
            overduePayments += Number(order.balance_amount);
            overdueCount++;
          }
        }
        if (orderPending > 0) {
          pendingRevenue += orderPending;
          pendingOrdersCount++;
        }
      });

      // Calculate unpaid costs due this month
      let unpaidCostsThisMonth = 0;
      costsRes.data?.forEach(cost => {
        if (cost.due_date && cost.due_date <= thisMonthEnd.toISOString().split("T")[0]) {
          unpaidCostsThisMonth += Number(cost.amount) || 0;
        }
      });

      // Calculate cash flow preview (reuse pendingRevenueRes data)
      let thisMonthTotal = 0;
      let nextMonthTotal = 0;

      pendingRevenueRes.data?.forEach((order) => {
        if (!order.deposit_paid && order.deposit_expected_date) {
          const depositDate = new Date(order.deposit_expected_date);
          if (depositDate <= thisMonthEnd) {
            thisMonthTotal += Number(order.deposit_amount) || 0;
          } else if (depositDate <= nextMonthEnd) {
            nextMonthTotal += Number(order.deposit_amount) || 0;
          }
        }
        if (!order.deposit_2_paid && order.deposit_2_expected_date) {
          const deposit2Date = new Date(order.deposit_2_expected_date);
          if (deposit2Date <= thisMonthEnd) {
            thisMonthTotal += Number(order.deposit_2_amount) || 0;
          } else if (deposit2Date <= nextMonthEnd) {
            nextMonthTotal += Number(order.deposit_2_amount) || 0;
          }
        }
        if (!order.balance_paid && order.balance_expected_date) {
          const balanceDate = new Date(order.balance_expected_date);
          if (balanceDate <= thisMonthEnd) {
            thisMonthTotal += Number(order.balance_amount) || 0;
          } else if (balanceDate <= nextMonthEnd) {
            nextMonthTotal += Number(order.balance_amount) || 0;
          }
        }
      });

      // Process urgent items
      const processedUrgentItems: UrgentItem[] = [];
      urgentItemsRes.data?.forEach((item: unknown) => {
        const typedItem = item as {
          id: string;
          name: string;
          order: {
            order_code: string | null;
            work_start_date: string | null;
            expected_date: string | null;
            customer: { first_name: string; last_name: string };
          };
        };
        
        const expectedDate = typedItem.order?.expected_date || typedItem.order?.work_start_date;
        
        if (expectedDate) {
          const date = new Date(expectedDate);
          const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysLeft >= 0 && daysLeft <= 7) {
            processedUrgentItems.push({
              id: typedItem.id,
              name: typedItem.name,
              orderCode: typedItem.order.order_code,
              customerName: `${typedItem.order.customer.first_name} ${typedItem.order.customer.last_name}`,
              daysLeft,
            });
          }
        }
      });

      // Financial alerts
      const financialAlerts: { type: "warning" | "error"; message: string }[] = [];
      if (overdueCount > 0) {
        financialAlerts.push({
          type: "error",
          message: `${overdueCount} pagamenti scaduti per ${formatCurrency(overduePayments)}`,
        });
      }
      if (unpaidCostsThisMonth > thisMonthTotal && unpaidCostsThisMonth > 0) {
        financialAlerts.push({
          type: "warning",
          message: `Uscite previste (${formatCurrency(unpaidCostsThisMonth)}) superiori agli incassi (${formatCurrency(thisMonthTotal)}) questo mese`,
        });
      }

      return {
        stats: {
          totalOrders: ordersRes.count || 0,
          totalCustomers: customersRes.count || 0,
          openTickets: ticketsRes.count || 0,
          pendingRevenue,
          pendingOrdersCount,
        },
        recentOrders: (ordersDataRes.data as unknown as RecentOrder[]) || [],
        cashFlow: { thisMonth: thisMonthTotal, nextMonth: nextMonthTotal },
        urgentItems: processedUrgentItems.slice(0, 5),
        financialAlerts,
      };
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const stats = dashboardData?.stats ?? { totalOrders: 0, totalCustomers: 0, openTickets: 0, pendingRevenue: 0, pendingOrdersCount: 0 };
  const recentOrders = dashboardData?.recentOrders ?? [];
  const cashFlow = dashboardData?.cashFlow ?? { thisMonth: 0, nextMonth: 0 };
  const urgentItems = dashboardData?.urgentItems ?? [];
  const financialAlerts = dashboardData?.financialAlerts ?? [];

  const statCards = [
    {
      title: "Ordini Totali",
      value: stats.totalOrders,
      icon: ClipboardList,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      description: "Gestiti dalla tua azienda",
    },
    {
      title: "Clienti",
      value: stats.totalCustomers,
      icon: Users,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      description: "Registrati in piattaforma",
    },
    {
      title: "Ticket Aperti",
      value: stats.openTickets,
      icon: HeadphonesIcon,
      color: stats.openTickets > 0 ? "text-orange-600" : "text-green-600",
      bgColor: stats.openTickets > 0 ? "bg-orange-100" : "bg-green-100",
      description: stats.openTickets > 0 ? "In attesa di risposta" : "Tutto risolto!",
    },
    {
      title: "Da Incassare",
      value: formatCurrency(stats.pendingRevenue),
      icon: Euro,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
      description: `Da ${stats.pendingOrdersCount} ordini`,
    },
  ];

  if (!companyId) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Seleziona un'azienda per visualizzare la dashboard</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive opacity-70" />
        <p className="font-medium text-foreground">Errore nel caricamento della dashboard</p>
        <p className="text-sm mt-1">Riprova aggiornando la pagina</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Financial Alerts */}
      {financialAlerts.length > 0 && (
        <div className="space-y-2">
          {financialAlerts.map((alert, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                alert.type === "error"
                  ? "bg-destructive/10 border-destructive/30 text-destructive"
                  : "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-400"
              }`}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats Grid - 4 colonne con icone colorate */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid - 3 colonne bilanciate */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Recent Orders - Cliccabili */}
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
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    to={`/azienda/ordini/${order.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="font-medium text-sm line-clamp-1">{order.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.customer?.first_name} {order.customer?.last_name}
                      </p>
                    </div>
                    <div className="text-right space-y-1 ml-3 shrink-0">
                      <p className="font-medium text-sm">{formatCurrency(Number(order.total_amount))}</p>
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
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cash Flow Preview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Previsionale Incassi
                </CardTitle>
                <CardDescription>Prossimi incassi attesi</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/azienda/previsionale">Dettaglio</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/10">
              <div>
                <p className="text-sm text-muted-foreground">Questo mese</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(cashFlow.thisMonth)}</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10">
                <Euro className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div>
                <p className="text-sm text-muted-foreground">Prossimo mese</p>
                <p className="text-xl font-semibold">{formatCurrency(cashFlow.nextMonth)}</p>
              </div>
              <Euro className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        {/* Labor Costs Stats */}
        <LaborCostsStats />
      </div>

      {/* Bottom Row - 3 colonne */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Warehouse Alerts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {urgentItems.length > 0 && <AlertTriangle className="h-5 w-5 text-destructive" />}
                  <Package className="h-5 w-5 text-primary" />
                  Alert Magazzino
                </CardTitle>
                <CardDescription>Articoli con posa imminente</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/azienda/magazzino">Vai al magazzino</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {urgentItems.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nessun articolo urgente</p>
                <p className="text-xs mt-1">Tutti gli articoli sono pronti per le prossime installazioni</p>
              </div>
            ) : (
              <div className="space-y-3">
                {urgentItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.orderCode ? `#${item.orderCode} - ` : ""}{item.customerName}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-destructive border-destructive/30">
                      {item.daysLeft === 0 ? "Oggi" : item.daysLeft === 1 ? "Domani" : `${item.daysLeft} giorni`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Supplier Payments Summary */}
        <SupplierPaymentsSummary />

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Azioni Rapide</CardTitle>
            <CardDescription>Accedi velocemente alle funzionalità principali</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button variant="outline" className="justify-start h-auto py-3" asChild>
              <Link to="/azienda/ordini/nuovo">
                <div className="p-2 rounded-lg bg-blue-100 mr-3">
                  <ClipboardList className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Nuovo Ordine</p>
                  <p className="text-xs text-muted-foreground">Crea un ordine per un cliente</p>
                </div>
              </Link>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" asChild>
              <Link to="/azienda/clienti/nuovo">
                <div className="p-2 rounded-lg bg-purple-100 mr-3">
                  <Users className="h-4 w-4 text-purple-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Nuovo Cliente</p>
                  <p className="text-xs text-muted-foreground">Registra un nuovo cliente</p>
                </div>
              </Link>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" asChild>
              <Link to="/azienda/magazzino">
                <div className="p-2 rounded-lg bg-amber-100 mr-3">
                  <Package className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Magazzino</p>
                  <p className="text-xs text-muted-foreground">Gestisci articoli e materiali</p>
                </div>
              </Link>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" asChild>
              <Link to="/azienda/previsionale">
                <div className="p-2 rounded-lg bg-emerald-100 mr-3">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Previsionale</p>
                  <p className="text-xs text-muted-foreground">Visualizza il cash flow</p>
                </div>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
