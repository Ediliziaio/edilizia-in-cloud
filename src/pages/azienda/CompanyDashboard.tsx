import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ClipboardList, Users, HeadphonesIcon, Plus, Loader2, Euro, Package, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/formatters";
import { LaborCostsStats } from "@/components/dashboard/LaborCostsStats";
import { SupplierPaymentsSummary } from "@/components/dashboard/SupplierPaymentsSummary";
import { DashboardCeoStrip } from "@/components/dashboard/DashboardCeoStrip";
import { WeeklyDeadlines } from "@/components/dashboard/WeeklyDeadlines";
import { CompanyDashboardFilters } from "@/components/dashboard/CompanyDashboardFilters";
import { useCompanyDashboardData } from "@/hooks/useCompanyDashboardData";

function DeltaIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const delta = previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100;
  if (delta === 0) return null;
  const isPositive = delta > 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
      isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
    }`}>
      <Icon className="h-3 w-3" />
      {Math.abs(delta).toFixed(0)}%
    </span>
  );
}

export default function CompanyDashboard() {
  const {
    companyId, filters, updateFilters,
    isLoading, isError,
    stats, prevStats, recentOrders, cashFlow, ceoStrip,
    urgentItems, financialAlerts, weeklyDeadlines,
  } = useCompanyDashboardData();

  const statCards = [
    {
      title: "Ordini Totali",
      value: stats.totalOrders,
      prevValue: prevStats.totalOrders,
      icon: ClipboardList,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      description: "Gestiti dalla tua azienda",
    },
    {
      title: "Clienti",
      value: stats.totalCustomers,
      prevValue: prevStats.totalCustomers,
      icon: Users,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      description: "Registrati in piattaforma",
    },
    {
      title: "Ticket Aperti",
      value: stats.openTickets,
      prevValue: null as number | null,
      icon: HeadphonesIcon,
      color: stats.openTickets > 0 ? "text-orange-600" : "text-green-600",
      bgColor: stats.openTickets > 0 ? "bg-orange-100" : "bg-green-100",
      description: stats.openTickets > 0 ? "In attesa di risposta" : "Tutto risolto!",
    },
    {
      title: "Da Incassare",
      value: formatCurrency(stats.pendingRevenue),
      prevValue: null as number | null,
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

  const maxCashFlow = Math.max(cashFlow.thisMonthIncome, cashFlow.thisMonthOutflow, 1);
  const incomePercent = (cashFlow.thisMonthIncome / maxCashFlow) * 100;
  const outflowPercent = (cashFlow.thisMonthOutflow / maxCashFlow) * 100;

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

      {/* Filters */}
      <CompanyDashboardFilters filters={filters} onUpdate={updateFilters} />

      {/* CEO KPI Strip */}
      <DashboardCeoStrip
        revenueThisMonth={ceoStrip.revenueThisMonth}
        revenuePrevMonth={ceoStrip.revenuePrevMonth}
        marginThisMonth={ceoStrip.marginThisMonth}
        marginPrevMonth={ceoStrip.marginPrevMonth}
        netCashFlow={cashFlow.netCashFlow}
        ordersThisMonth={ceoStrip.ordersThisMonth}
        ordersPrevMonth={ceoStrip.ordersPrevMonth}
      />

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

      {/* Stats Grid with delta % */}
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
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold">{stat.value}</div>
                {stat.prevValue !== null && typeof stat.value === "number" && (
                  <DeltaIndicator current={stat.value} previous={stat.prevValue} />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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

        {/* Bilancio Mese */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Bilancio Mese
                </CardTitle>
                <CardDescription>Entrate vs uscite previste</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/azienda/previsionale">Dettaglio</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Entrate attese</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(cashFlow.thisMonthIncome)}</span>
              </div>
              <Progress value={incomePercent} className="h-2 [&>div]:bg-emerald-500" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Uscite attese</span>
                <span className="font-medium text-destructive">{formatCurrency(cashFlow.thisMonthOutflow)}</span>
              </div>
              <Progress value={outflowPercent} className="h-2 [&>div]:bg-destructive" />
            </div>
            <div className={`flex items-center justify-between p-4 rounded-lg border ${
              cashFlow.netCashFlow >= 0
                ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
                : "bg-destructive/10 border-destructive/30"
            }`}>
              <div>
                <p className="text-sm text-muted-foreground">Saldo Netto</p>
                <p className={`text-2xl font-bold ${cashFlow.netCashFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                  {formatCurrency(cashFlow.netCashFlow)}
                </p>
              </div>
              <Euro className={`h-6 w-6 ${cashFlow.netCashFlow >= 0 ? "text-emerald-500" : "text-destructive"}`} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground">Prossimo mese (entrate)</p>
                <p className="text-lg font-semibold">{formatCurrency(cashFlow.nextMonth)}</p>
              </div>
              <Euro className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        {/* Labor Costs Stats */}
        <LaborCostsStats />
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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

        <SupplierPaymentsSummary />

        <WeeklyDeadlines
          receivables={weeklyDeadlines.receivables}
          companyCosts={weeklyDeadlines.companyCosts}
          upcomingWorks={weeklyDeadlines.upcomingWorks}
        />
      </div>
    </div>
  );
}
