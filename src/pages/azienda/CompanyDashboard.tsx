/**
 * CompanyDashboard — La "War Room" operativa dell'azienda.
 *
 * Layout:
 *  1. Header sticky (titolo + azioni rapide + refresh)
 *  2. Tab bar navigazione dashboard (cruscotto / marketing / gestione)
 *  3. WarRoom: 3 colonne (Cassa / Salute operativa / Azioni 7gg)
 *  4. Semaforo operativo + Bilancio mese + CEO strip (KPI)
 *  5. Sezione "Dettagli operativi" collapsibile (ordini, magazzino, crediti, ecc.)
 *
 * Principi UX:
 *  - Risponde in 5 secondi a: "come sto a cassa / cosa è a rischio / cosa devo fare"
 *  - Mobile-first: tutto impila, FAB per azioni rapide
 *  - Tastiera: Cmd+K per comandi globali
 *  - Vista personalizzabile via DashboardWidgetCustomizer
 */
import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ClipboardList, Users, Plus, Euro, Package, TrendingUp, AlertTriangle,
  ChevronDown, RefreshCw, Settings2, X, LayoutDashboard,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import { LaborCostsStats } from "@/components/dashboard/LaborCostsStats";
import { SupplierPaymentsSummary } from "@/components/dashboard/SupplierPaymentsSummary";
import { SemaforoOperazioni } from "@/components/dashboard/SemaforoOperazioni";
import { DashboardTabBar } from "@/components/dashboard/DashboardTabBar";
import { DashboardCeoStrip } from "@/components/dashboard/DashboardCeoStrip";
import { YTDRevenueWidget } from "@/components/dashboard/YTDRevenueWidget";
import { TopCustomersWidget } from "@/components/dashboard/TopCustomersWidget";
import { WeeklyDeadlines } from "@/components/dashboard/WeeklyDeadlines";
import { WarRoom } from "@/components/dashboard/WarRoom";
import { DashboardQuickActions, DashboardKeyboardHint } from "@/components/dashboard/DashboardQuickActions";
import { useDashboardWidgets } from "@/hooks/useDashboardWidgets";
import { DashboardWidgetCustomizer } from "@/components/dashboard/DashboardWidgetCustomizer";
import { CompanyDashboardFilters } from "@/components/dashboard/CompanyDashboardFilters";
import { useCompanyDashboardData } from "@/hooks/useCompanyDashboardData";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from "recharts";

interface UrgentWarehouseItem {
  id: string;
  name: string;
  orderCode?: string;
  customerName?: string;
  daysLeft: number;
}

function WarehouseAlerts({ urgentItems }: { urgentItems: UrgentWarehouseItem[] }) {
  const [open, setOpen] = useState(urgentItems.length > 0);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between gap-2 cursor-pointer">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-1.5 flex-wrap text-base">
                  {urgentItems.length > 0 && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                  <Package className="h-4 w-4 text-primary shrink-0" />
                  <span>Alert Magazzino</span>
                  {urgentItems.length > 0 ? (
                    <Badge variant="destructive" className="shrink-0">{urgentItems.length}</Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">0</Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">Articoli con posa imminente</CardDescription>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <Link to="/azienda/magazzino"><span className="hidden sm:inline">Vai al magazzino</span><span className="sm:hidden">Magazzino</span></Link>
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
              <div className="space-y-2">
                {urgentItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.orderCode ? `#${item.orderCode} · ` : ""}{item.customerName}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-destructive border-destructive/30 shrink-0 ml-2">
                      {item.daysLeft === 0 ? "Oggi" : item.daysLeft === 1 ? "Domani" : `${item.daysLeft}gg`}
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

export default function CompanyDashboard() {
  const queryClient = useQueryClient();

  const {
    companyId, filters, updateFilters,
    isLoading, isError,
    stats, recentOrders, cashFlow, ceoStrip,
    urgentItems, financialAlerts, weeklyDeadlines,
    monthlyBalance, revenueYTD, agingReceivables,
  } = useCompanyDashboardData();

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(() => {
    try { return localStorage.getItem("dashboard-details-open") !== "false"; } catch { return true; }
  });
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("dismissed-dashboard-alerts");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const dismissAlert = (alertKey: string) => {
    setDismissedAlerts(prev => {
      const next = new Set(prev);
      next.add(alertKey);
      try { localStorage.setItem("dismissed-dashboard-alerts", JSON.stringify([...next])); } catch { /* Safari Private Browsing */ }
      return next;
    });
  };

  const toggleDetails = (open: boolean) => {
    setDetailsOpen(open);
    try { localStorage.setItem("dashboard-details-open", String(open)); } catch { /* noop */ }
  };

  const { widgets, isCustomizing, setIsCustomizing, toggleWidget, moveWidget, resetToDefault, isWidgetVisible } = useDashboardWidgets();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    setLastRefresh(new Date());
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const dateRange = useMemo(() => ({
    from: filters.dateFrom,
    to: filters.dateTo,
  }), [filters.dateFrom, filters.dateTo]);

  const totalYTDRevenue = useMemo(() => revenueYTD.reduce((s, r) => s + r.revenue, 0), [revenueYTD]);

  const upcomingWorksCount = weeklyDeadlines.upcomingWorks?.length ?? 0;

  // ─────────────────────────────────────────────
  // Guards
  // ─────────────────────────────────────────────
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-muted-foreground">
        <Users className="h-12 w-12 mb-4 opacity-50" />
        <p className="font-medium text-foreground">Nessuna azienda selezionata</p>
        <p className="text-sm mt-1">Scegli un'azienda dal menu in alto per visualizzare la dashboard</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Skeleton className="h-9 w-24 sm:w-36" />
            <Skeleton className="h-9 w-24 sm:w-36" />
          </div>
        </div>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
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
      <div className="flex flex-col items-center justify-center text-center py-16 text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mb-4 text-destructive opacity-70" />
        <p className="font-medium text-foreground">Errore nel caricamento della dashboard</p>
        <p className="text-sm mt-1 mb-4">Si è verificato un problema durante il recupero dei dati</p>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" /> Riprova
        </Button>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      <DashboardTabBar />

      {/* ─── HEADER STICKY ─── */}
      <div className="sticky top-0 z-20 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5 text-primary hidden sm:inline" />
                Dashboard Gestione
              </h1>
              <DashboardKeyboardHint />
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              La tua sala operativa · aggiornata {lastRefresh.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <DashboardQuickActions />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCustomizing(true)}
              className="h-8 w-8"
              aria-label="Personalizza widget"
              title="Personalizza widget"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8 w-8"
              aria-label="Aggiorna dati"
              title="Aggiorna dati"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </div>
      </div>

      {/* Filtri */}
      <CompanyDashboardFilters filters={filters} onUpdate={updateFilters} />

      {/* ─── WAR ROOM (la novità): 3 colonne risposta veloce ─── */}
      <WarRoom
        cashFlow={cashFlow}
        weeklyDeadlines={weeklyDeadlines}
        financialAlerts={financialAlerts}
        urgentItems={urgentItems}
        agingReceivables={agingReceivables}
        openTickets={stats.openTickets}
        recentOrders={recentOrders}
      />

      {/* Alert persistenti (cashflow negativo + alert finanziari) */}
      {cashFlow.netCashFlow < 0 && !dismissedAlerts.has("cashflow-negative") && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-destructive/10 border-destructive/30 text-destructive animate-in slide-in-from-top-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium flex-1">
            Cash flow negativo previsto: {formatCurrency(cashFlow.netCashFlow)}.{" "}
            <Link to="/azienda/previsionale" className="underline font-semibold">Vai al previsionale →</Link>
          </span>
          <button onClick={() => dismissAlert("cashflow-negative")} className="shrink-0 p-1 rounded hover:bg-destructive/20 transition-colors" aria-label="Chiudi alert">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── SEMAFORO OPERATIVO (esistente, mantenuto) ─── */}
      <SemaforoOperazioni
        totalOrders={stats.totalOrders}
        openTickets={stats.openTickets}
        netCashFlow={cashFlow.netCashFlow}
        upcomingWorks={upcomingWorksCount}
        urgentItemsCount={urgentItems.length}
        financialAlertsCount={financialAlerts.length}
      />

      {/* ─── CEO Strip (compatto) ─── */}
      {isWidgetVisible("ceo-strip") && (
        <DashboardCeoStrip
          revenueThisMonth={ceoStrip.revenueThisMonth}
          revenuePrevMonth={ceoStrip.revenuePrevMonth}
          marginThisMonth={ceoStrip.marginThisMonth}
          marginPrevMonth={ceoStrip.marginPrevMonth}
          netCashFlow={cashFlow.netCashFlow}
          ordersThisMonth={ceoStrip.ordersThisMonth}
          ordersPrevMonth={ceoStrip.ordersPrevMonth}
        />
      )}

      {/* ─── YTD ─── */}
      {isWidgetVisible("ytd-revenue") && (
        <YTDRevenueWidget data={revenueYTD} totalYTD={totalYTDRevenue} />
      )}

      {/* ─── DETTAGLI OPERATIVI (collapsibile) ─── */}
      <Collapsible open={detailsOpen} onOpenChange={toggleDetails}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group w-full flex items-center justify-between gap-2 rounded-lg border bg-muted/30 hover:bg-muted/60 px-4 py-2.5 text-sm font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-primary" />
              Dettagli operativi
              <Badge variant="secondary" className="text-[10px]">
                ordini · crediti · magazzino · costo lavoro
              </Badge>
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", detailsOpen && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 sm:space-y-6 mt-4">

          {/* Ordini recenti · Bilancio mese · Costo lavoro */}
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Ordini Recenti */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Ordini Recenti</CardTitle>
                    <CardDescription className="text-xs">Gli ultimi ordini inseriti</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/azienda/ordini">Tutti</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {recentOrders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Nessun ordine presente</p>
                    <Button variant="link" asChild className="mt-1">
                      <Link to="/azienda/ordini/nuovo">
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Crea il primo ordine
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentOrders.slice(0, 5).map((order) => (
                      <Link
                        key={order.id}
                        to={`/azienda/ordini/${order.id}`}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                      >
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <p className="font-medium text-sm line-clamp-1">{order.description}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {order.customer?.first_name} {order.customer?.last_name}
                          </p>
                        </div>
                        <div className="text-right space-y-1 ml-2 shrink-0">
                          <p className="font-medium text-sm tabular-nums">{formatCurrencyCompact(Number(order.total_amount))}</p>
                          {order.status && (
                            <Badge
                              variant="secondary"
                              style={{ backgroundColor: order.status.color + "20", color: order.status.color }}
                              className="text-[10px] h-4 px-1.5"
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
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Bilancio Mese
                    </CardTitle>
                    <CardDescription className="text-xs">Entrate vs uscite (ultimi 6 mesi)</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/azienda/previsionale">Dettaglio</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyBalance} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={formatCurrencyCompact} />
                      <RechartsTooltip
                        formatter={(value: number, name: string) => [formatCurrency(value), name]}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="entrate" name="Entrate" fill="hsl(142 76% 36%)" radius={[3, 3, 0, 0]} barSize={14} />
                      <Bar dataKey="uscite" name="Uscite" fill="hsl(0 84% 60%)" radius={[3, 3, 0, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground font-medium">Prossimo mese</p>
                    <p className="text-base font-semibold tabular-nums">{formatCurrency(cashFlow.nextMonth)}</p>
                  </div>
                  <Euro className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            {/* Costo Lavoro */}
            <LaborCostsStats dateRange={dateRange} />
          </div>

          {/* Magazzino · Fornitori · Scadenze settimanali */}
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            <WarehouseAlerts urgentItems={urgentItems} />
            <SupplierPaymentsSummary dateRange={dateRange} />
            <WeeklyDeadlines
              receivables={weeklyDeadlines.receivables}
              companyCosts={weeklyDeadlines.companyCosts}
              upcomingWorks={weeklyDeadlines.upcomingWorks}
            />
          </div>

          {/* Aging crediti (se presenti) */}
          {isWidgetVisible("aging-receivables") && (agingReceivables.overdue > 0 || agingReceivables.thisWeek > 0 || agingReceivables.thisMonth > 0 || agingReceivables.future > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Euro className="h-4 w-4 text-primary" />
                  Aging Crediti
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[50px]">
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
                <div className="flex flex-wrap gap-2 sm:gap-3 mt-2 text-xs">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[hsl(0,84%,60%)]" />Scaduto: <b className="tabular-nums">{formatCurrencyCompact(agingReceivables.overdue)}</b></span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[hsl(25,95%,53%)]" />Settim.: <b className="tabular-nums">{formatCurrencyCompact(agingReceivables.thisWeek)}</b></span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[hsl(45,93%,47%)]" />Mese: <b className="tabular-nums">{formatCurrencyCompact(agingReceivables.thisMonth)}</b></span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[hsl(142,76%,36%)]" />Futuro: <b className="tabular-nums">{formatCurrencyCompact(agingReceivables.future)}</b></span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top clienti */}
          {isWidgetVisible("top-customers") && (
            <TopCustomersWidget companyId={companyId} dateFrom={dateRange.from} dateTo={dateRange.to} />
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Customizer */}
      <DashboardWidgetCustomizer
        open={isCustomizing}
        onOpenChange={setIsCustomizing}
        widgets={widgets}
        onToggle={toggleWidget}
        onMove={moveWidget}
        onReset={resetToDefault}
      />
    </div>
  );
}
