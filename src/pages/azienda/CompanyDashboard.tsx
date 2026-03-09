import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ClipboardList, Users, HeadphonesIcon, Plus, Euro, Package, TrendingUp, TrendingDown, AlertTriangle, ChevronDown, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { useQueryClient } from "@tanstack/react-query";
import { LaborCostsStats } from "@/components/dashboard/LaborCostsStats";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { SupplierPaymentsSummary } from "@/components/dashboard/SupplierPaymentsSummary";
import { DashboardCeoStrip } from "@/components/dashboard/DashboardCeoStrip";
import { WeeklyDeadlines } from "@/components/dashboard/WeeklyDeadlines";
import { CompanyDashboardFilters } from "@/components/dashboard/CompanyDashboardFilters";
import { useCompanyDashboardData } from "@/hooks/useCompanyDashboardData";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";

function WarehouseAlerts({ urgentItems }: { urgentItems: any[] }) {
  const [open, setOpen] = useState(urgentItems.length > 0);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {urgentItems.length > 0 && <AlertTriangle className="h-5 w-5 text-destructive" />}
                  <Package className="h-5 w-5 text-primary" />
                  Alert Magazzino
                  {urgentItems.length > 0 ? (
                    <Badge variant="destructive" className="ml-1">{urgentItems.length}</Badge>
                  ) : (
                    <Badge variant="secondary" className="ml-1">0</Badge>
                  )}
                </CardTitle>
                <CardDescription>Articoli con posa imminente</CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <Link to="/azienda/magazzino">Vai al magazzino</Link>
                </Button>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
              </div>
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {urgentItems.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nessun articolo urgente</p>
                <p className="text-xs mt-1">Tutti gli articoli sono pronti per le prossime installazioni</p>
              </div>
            ) : (
              <div className="space-y-3">
                {urgentItems.map((item: any) => (
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
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

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
  const queryClient = useQueryClient();
  const {
    companyId, filters, updateFilters,
    isLoading, isError,
    stats, prevStats, recentOrders, cashFlow, ceoStrip,
    urgentItems, financialAlerts, weeklyDeadlines,
    monthlyBalance, revenueYTD, agingReceivables,
  } = useCompanyDashboardData();

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setLastRefresh(new Date());
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const dateRange = useMemo(() => ({
    from: filters.dateFrom,
    to: filters.dateTo,
  }), [filters.dateFrom, filters.dateTo]);

  const totalYTDRevenue = useMemo(() => revenueYTD.reduce((s, r) => s + r.revenue, 0), [revenueYTD]);

  const upcomingWorksCount = weeklyDeadlines.upcomingWorks?.length ?? 0;

  const statCards = [
    {
      title: "Ordini Totali",
      value: stats.totalOrders,
      prevValue: prevStats.totalOrders,
      icon: ClipboardList,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      description: "Gestiti dalla tua azienda",
      link: "/azienda/ordini",
    },
    {
      title: "Clienti",
      value: stats.totalCustomers,
      prevValue: prevStats.totalCustomers,
      icon: Users,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      description: "Registrati in piattaforma",
      link: "/azienda/clienti",
    },
    {
      title: "Ticket Aperti",
      value: stats.openTickets,
      prevValue: null as number | null,
      icon: HeadphonesIcon,
      color: stats.openTickets > 0 ? "text-orange-600" : "text-green-600",
      bgColor: stats.openTickets > 0 ? "bg-orange-100" : "bg-green-100",
      description: stats.openTickets > 0 ? "In attesa di risposta" : "Tutto risolto!",
      link: "/azienda/ticket",
    },
    {
      title: "Prossimi Lavori",
      value: upcomingWorksCount,
      prevValue: null as number | null,
      icon: Package,
      color: upcomingWorksCount > 0 ? "text-blue-600" : "text-muted-foreground",
      bgColor: upcomingWorksCount > 0 ? "bg-blue-100" : "bg-muted",
      description: upcomingWorksCount > 0 ? "In programma questa settimana" : "Nessun lavoro in programma",
      link: "/azienda/ordini",
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="gap-1.5"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              Aggiorna
            </Button>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {lastRefresh.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
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

      {/* Onboarding Checklist */}
      <OnboardingChecklist />

      {/* Filters */}
      <CompanyDashboardFilters filters={filters} onUpdate={updateFilters} />

      {/* YTD Revenue Sparkline */}
      {revenueYTD.length > 0 && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 pb-2">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Fatturato Anno Corrente</p>
                <p className="text-xl font-bold text-foreground tabular-nums">{formatCurrency(totalYTDRevenue)}</p>
              </div>
              <TrendingUp className="h-5 w-5 text-primary opacity-60" />
            </div>
            <div className="h-[80px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueYTD} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ytdGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#ytdGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Link to Cruscotto */}
      <div className="flex justify-end">
        <Button variant="link" asChild className="text-sm gap-1">
          <Link to="/azienda/cruscotto">
            Vai al Cruscotto Aziendale →
          </Link>
        </Button>
      </div>

      {/* Financial Alerts */}
      {cashFlow.netCashFlow < 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-destructive/10 border-destructive/30 text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">
            ⚠️ Cash flow negativo previsto: {formatCurrency(cashFlow.netCashFlow)}.{" "}
            <Link to="/azienda/previsionale" className="underline">Vai al previsionale →</Link>
          </span>
        </div>
      )}
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
          <Link key={stat.title} to={stat.link}>
            <Card className="relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow">
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
          </Link>
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

        {/* Bilancio Mese — BarChart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Bilancio Mese
                </CardTitle>
                <CardDescription>Entrate vs uscite (ultimi 6 mesi)</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/azienda/previsionale">Dettaglio</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyBalance} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                  />
                  <Legend />
                  <Bar dataKey="entrate" name="Entrate" fill="hsl(142 76% 36%)" radius={[3, 3, 0, 0]} barSize={14} />
                  <Bar dataKey="uscite" name="Uscite" fill="hsl(0 84% 60%)" radius={[3, 3, 0, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
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
        <LaborCostsStats dateRange={dateRange} />
      </div>

      {/* Aging Receivables */}
      {(agingReceivables.overdue > 0 || agingReceivables.thisWeek > 0 || agingReceivables.thisMonth > 0 || agingReceivables.future > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Aging Crediti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[60px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={[{
                    name: "Crediti",
                    Scaduto: agingReceivables.overdue,
                    "Questa settimana": agingReceivables.thisWeek,
                    "Questo mese": agingReceivables.thisMonth,
                    Futuro: agingReceivables.future,
                  }]}
                  margin={{ top: 0, right: 4, left: 0, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" hide />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                  />
                  <Bar dataKey="Scaduto" stackId="a" fill="hsl(0 84% 60%)" radius={[4, 0, 0, 4]} />
                  <Bar dataKey="Questa settimana" stackId="a" fill="hsl(25 95% 53%)" />
                  <Bar dataKey="Questo mese" stackId="a" fill="hsl(45 93% 47%)" />
                  <Bar dataKey="Futuro" stackId="a" fill="hsl(142 76% 36%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 mt-2 text-xs">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[hsl(0,84%,60%)]" />Scaduto: {formatCurrency(agingReceivables.overdue)}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[hsl(25,95%,53%)]" />Questa sett.: {formatCurrency(agingReceivables.thisWeek)}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[hsl(45,93%,47%)]" />Questo mese: {formatCurrency(agingReceivables.thisMonth)}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[hsl(142,76%,36%)]" />Futuro: {formatCurrency(agingReceivables.future)}</span>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <WarehouseAlerts urgentItems={urgentItems} />

        <SupplierPaymentsSummary dateRange={dateRange} />

        <WeeklyDeadlines
          receivables={weeklyDeadlines.receivables}
          companyCosts={weeklyDeadlines.companyCosts}
          upcomingWorks={weeklyDeadlines.upcomingWorks}
        />
      </div>
    </div>
  );
}
