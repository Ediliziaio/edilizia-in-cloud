import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { CompanyDashboardFilters, type CompanyDashboardFiltersState, type DatePreset } from "@/components/dashboard/CompanyDashboardFilters";
import { subDays, startOfDay, endOfDay, startOfMonth } from "date-fns";

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
function getDateRange(preset: DatePreset, customFrom?: Date, customTo?: Date): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last7":
      return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
    case "last30":
      return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
    case "month":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "custom":
      return { from: customFrom || subDays(now, 30), to: customTo || now };
  }
}

export default function CompanyDashboard() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // --- Filters state ---
  const [filters, setFilters] = useState<CompanyDashboardFiltersState>({
    datePreset: "month",
    dateFrom: startOfMonth(new Date()),
    dateTo: endOfDay(new Date()),
    statusId: null,
    customerIds: [],
  });

  const updateFilters = useCallback((partial: Partial<CompanyDashboardFiltersState>) => {
    setFilters(prev => {
      const next = { ...prev, ...partial };
      if (partial.datePreset && partial.datePreset !== "custom") {
        const range = getDateRange(partial.datePreset);
        next.dateFrom = range.from;
        next.dateTo = range.to;
      }
      return next;
    });
  }, []);

  const dateRange = useMemo(() => getDateRange(filters.datePreset, filters.dateFrom, filters.dateTo), [filters.datePreset, filters.dateFrom, filters.dateTo]);

  // Calculate comparison period (same duration shifted back)
  const prevRange = useMemo(() => {
    const durationMs = dateRange.to.getTime() - dateRange.from.getTime();
    return {
      from: new Date(dateRange.from.getTime() - durationMs - 86400000),
      to: new Date(dateRange.from.getTime() - 1),
    };
  }, [dateRange]);

  const { data: dashboardData, isLoading, isError } = useQuery({
    queryKey: ["dashboard-data", companyId, dateRange.from.toISOString(), dateRange.to.toISOString(), filters.statusId, filters.customerIds],
    queryFn: async () => {
      const now = new Date();
      const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      const sevenDaysFromNow = new Date(now);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const todayStr = now.toISOString().split("T")[0];
      const thisMonthEndStr = thisMonthEnd.toISOString().split("T")[0];
      const sevenDaysStr = sevenDaysFromNow.toISOString().split("T")[0];

      const dateFromStr = dateRange.from.toISOString();
      const dateToStr = dateRange.to.toISOString();
      const prevFromStr = prevRange.from.toISOString();
      const prevToStr = prevRange.to.toISOString();

      const [
        ordersRes, customersRes, ticketsRes, ordersDataRes, pendingRevenueRes,
        urgentItemsRes, costsRes,
        // Prev month comparisons
        prevOrdersRes, prevCustomersRes, prevTicketsRes,
        // CEO strip: revenue & margin
        ordersThisMonthRes, ordersPrevMonthRes,
        // Weekly deadlines: supplier costs due within 7 days
        supplierCostsDueRes,
        // Weekly deadlines: upcoming works
        upcomingWorksRes,
      ] = await Promise.all([
        // Orders count (filtered)
        (() => {
          let q: any = supabase.from("orders").select("id", { count: "exact", head: true }).eq("company_id", companyId!)
            .gte("created_at", dateFromStr).lte("created_at", dateToStr);
          if (filters.statusId) q = q.eq("status_id", filters.statusId);
          if (filters.customerIds.length > 0) q = q.in("customer_id", filters.customerIds);
          return q;
        })(),
        // Customers (filtered)
        (() => {
          let q: any = supabase.from("orders").select("customer_id").eq("company_id", companyId!)
            .gte("created_at", dateFromStr).lte("created_at", dateToStr);
          if (filters.statusId) q = q.eq("status_id", filters.statusId);
          if (filters.customerIds.length > 0) q = q.in("customer_id", filters.customerIds);
          return q;
        })(),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", companyId!).eq("status", "aperto"),
        // Recent orders (filtered)
        (() => {
          let q: any = supabase.from("orders")
            .select(`id, description, total_amount, created_at,
              customer:profiles!orders_customer_id_fkey(first_name, last_name),
              status:order_statuses(name, color)`)
            .eq("company_id", companyId!)
            .gte("created_at", dateFromStr).lte("created_at", dateToStr);
          if (filters.statusId) q = q.eq("status_id", filters.statusId);
          if (filters.customerIds.length > 0) q = q.in("customer_id", filters.customerIds);
          return q.order("created_at", { ascending: false }).limit(5);
        })(),
        supabase
          .from("orders")
          .select("description, deposit_amount, deposit_paid, deposit_expected_date, deposit_2_amount, deposit_2_paid, deposit_2_expected_date, balance_amount, balance_paid, balance_expected_date, financing_amount, financing_paid, financing_expected_date, customer:profiles!orders_customer_id_fkey(first_name, last_name)")
          .eq("company_id", companyId!),
        supabase
          .from("order_items")
          .select(`id, name, status,
            order:orders!inner(id, order_code, work_start_date, expected_date, company_id,
              customer:profiles!orders_customer_id_fkey(first_name, last_name))`)
          .eq("order.company_id", companyId!)
          .neq("status", "installato")
          .neq("status", "in_magazzino"),
        supabase
          .from("company_costs")
          .select("amount, due_date, is_paid")
          .eq("company_id", companyId!)
          .eq("is_paid", false),
        // Prev period: orders
        supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .gte("created_at", prevFromStr)
          .lte("created_at", prevToStr),
        // Prev period: customers
        supabase.from("orders").select("customer_id")
          .eq("company_id", companyId!)
          .gte("created_at", prevFromStr)
          .lte("created_at", prevToStr),
        // Prev month: tickets (snapshot not meaningful — skip delta for tickets)
        supabase.from("tickets").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("status", "aperto"),
        // Current period orders with amounts for revenue + margin
        supabase.from("orders")
          .select("id, total_amount, order_items(purchase_price, quantity), order_employees(total_cost), order_external_teams(total_cost)")
          .eq("company_id", companyId!)
          .gte("created_at", dateFromStr)
          .lte("created_at", dateToStr),
        // Prev period orders with amounts
        supabase.from("orders")
          .select("id, total_amount, order_items(purchase_price, quantity), order_employees(total_cost), order_external_teams(total_cost)")
          .eq("company_id", companyId!)
          .gte("created_at", prevFromStr)
          .lte("created_at", prevToStr),
        // Supplier costs due within 7 days
        supabase.from("company_costs")
          .select("name, amount, due_date")
          .eq("company_id", companyId!)
          .eq("is_paid", false)
          .gte("due_date", todayStr)
          .lte("due_date", sevenDaysStr)
          .order("due_date"),
        // Upcoming works in 7 days
        supabase.from("orders")
          .select("order_code, work_start_date, customer:profiles!orders_customer_id_fkey(first_name, last_name)")
          .eq("company_id", companyId!)
          .gte("work_start_date", todayStr)
          .lte("work_start_date", sevenDaysStr)
          .order("work_start_date"),
      ]);

      // === Stat card values ===
      const totalOrders = ordersRes.count || 0;
      const totalCustomers = new Set(customersRes.data?.map((o: any) => o.customer_id) || []).size;
      const openTickets = ticketsRes.count || 0;

      // Previous month stats for delta
      const prevOrdersCount = prevOrdersRes.count || 0;
      const prevCustomersCount = new Set(prevCustomersRes.data?.map((o: any) => o.customer_id) || []).size;

      // === Pending revenue + overdue ===
      let pendingRevenue = 0;
      let pendingOrdersCount = 0;
      let overduePayments = 0;
      let overdueCount = 0;

      // Receivables due within 7 days for weekly deadlines
      const weeklyReceivables: Array<{
        orderDescription: string;
        customerName: string;
        amount: number;
        expectedDate: string;
        daysLeft: number;
      }> = [];

      pendingRevenueRes.data?.forEach((order: any) => {
        let orderPending = 0;
        const customerName = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();

        const checkPayment = (paid: boolean, amount: number, expectedDate: string | null) => {
          if (!paid && amount > 0) {
            orderPending += amount;
            if (expectedDate && expectedDate < todayStr) {
              overduePayments += amount;
              overdueCount++;
            }
            // Weekly deadlines
            if (expectedDate && expectedDate >= todayStr && expectedDate <= sevenDaysStr) {
              const daysLeft = Math.ceil((new Date(expectedDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              weeklyReceivables.push({
                orderDescription: order.description || "Ordine",
                customerName,
                amount,
                expectedDate,
                daysLeft: Math.max(0, daysLeft),
              });
            }
          }
        };

        checkPayment(order.deposit_paid, Number(order.deposit_amount), order.deposit_expected_date);
        checkPayment(order.deposit_2_paid, Number(order.deposit_2_amount), order.deposit_2_expected_date);
        checkPayment(order.balance_paid, Number(order.balance_amount), order.balance_expected_date);
        checkPayment(order.financing_paid, Number(order.financing_amount), order.financing_expected_date);

        if (orderPending > 0) {
          pendingRevenue += orderPending;
          pendingOrdersCount++;
        }
      });

      // === Cash flow (this month / next month) ===
      let thisMonthIncome = 0;
      let nextMonthTotal = 0;

      pendingRevenueRes.data?.forEach((order: any) => {
        const addIfInRange = (paid: boolean, amount: number, date: string | null) => {
          if (!paid && date) {
            const d = new Date(date);
            if (d <= thisMonthEnd) thisMonthIncome += Number(amount) || 0;
            else if (d <= nextMonthEnd) nextMonthTotal += Number(amount) || 0;
          }
        };
        addIfInRange(order.deposit_paid, order.deposit_amount, order.deposit_expected_date);
        addIfInRange(order.deposit_2_paid, order.deposit_2_amount, order.deposit_2_expected_date);
        addIfInRange(order.balance_paid, order.balance_amount, order.balance_expected_date);
        addIfInRange(order.financing_paid, order.financing_amount, order.financing_expected_date);
      });

      // Unpaid costs this month (outflows)
      let unpaidCostsThisMonth = 0;
      costsRes.data?.forEach(cost => {
        if (cost.due_date && cost.due_date <= thisMonthEndStr) {
          unpaidCostsThisMonth += Number(cost.amount) || 0;
        }
      });

      // === CEO Strip: Revenue & Margin ===
      const calcRevenueAndMargin = (orders: any[]) => {
        let revenue = 0;
        let totalMarginPct = 0;
        let marginCount = 0;

        orders.forEach((o: any) => {
          const total = Number(o.total_amount) || 0;
          revenue += total;

          const articleCost = (o.order_items || []).reduce(
            (s: number, i: any) => s + (Number(i.purchase_price || 0) * Number(i.quantity || 1)), 0);
          const laborCost =
            (o.order_employees || []).reduce((s: number, e: any) => s + Number(e.total_cost || 0), 0) +
            (o.order_external_teams || []).reduce((s: number, t: any) => s + Number(t.total_cost || 0), 0);
          const totalCost = articleCost + laborCost;

          if (total > 0 && totalCost > 0) {
            totalMarginPct += ((total - totalCost) / total) * 100;
            marginCount++;
          }
        });

        return { revenue, margin: marginCount > 0 ? totalMarginPct / marginCount : 0 };
      };

      const thisMonthStats = calcRevenueAndMargin(ordersThisMonthRes.data || []);
      const prevMonthStats = calcRevenueAndMargin(ordersPrevMonthRes.data || []);

      // === Urgent items ===
      const processedUrgentItems: UrgentItem[] = [];
      urgentItemsRes.data?.forEach((item: any) => {
        const expectedDate = item.order?.expected_date || item.order?.work_start_date;
        if (expectedDate) {
          const date = new Date(expectedDate);
          const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysLeft >= 0 && daysLeft <= 7) {
            processedUrgentItems.push({
              id: item.id,
              name: item.name,
              orderCode: item.order.order_code,
              customerName: `${item.order.customer.first_name} ${item.order.customer.last_name}`,
              daysLeft,
            });
          }
        }
      });

      // === Weekly deadlines: supplier costs ===
      const weeklySupplierPayments = (supplierCostsDueRes.data || []).map((c: any) => ({
        name: c.name,
        amount: Number(c.amount),
        dueDate: c.due_date,
        daysLeft: Math.max(0, Math.ceil((new Date(c.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
      }));

      // === Weekly deadlines: upcoming works ===
      const weeklyUpcomingWorks = (upcomingWorksRes.data || []).map((o: any) => ({
        orderCode: o.order_code,
        customerName: `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim(),
        workDate: o.work_start_date,
        daysLeft: Math.max(0, Math.ceil((new Date(o.work_start_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
      }));

      // === Financial alerts ===
      const financialAlerts: { type: "warning" | "error"; message: string }[] = [];
      if (overdueCount > 0) {
        financialAlerts.push({
          type: "error",
          message: `${overdueCount} pagamenti scaduti per ${formatCurrency(overduePayments)}`,
        });
      }
      if (unpaidCostsThisMonth > thisMonthIncome && unpaidCostsThisMonth > 0) {
        financialAlerts.push({
          type: "warning",
          message: `Uscite previste (${formatCurrency(unpaidCostsThisMonth)}) superiori agli incassi (${formatCurrency(thisMonthIncome)}) questo mese`,
        });
      }

      return {
        stats: { totalOrders, totalCustomers, openTickets, pendingRevenue, pendingOrdersCount },
        prevStats: { totalOrders: prevOrdersCount, totalCustomers: prevCustomersCount },
        recentOrders: (ordersDataRes.data as unknown as RecentOrder[]) || [],
        cashFlow: {
          thisMonthIncome,
          thisMonthOutflow: unpaidCostsThisMonth,
          netCashFlow: thisMonthIncome - unpaidCostsThisMonth,
          nextMonth: nextMonthTotal,
        },
        ceoStrip: {
          revenueThisMonth: thisMonthStats.revenue,
          revenuePrevMonth: prevMonthStats.revenue,
          marginThisMonth: thisMonthStats.margin,
          marginPrevMonth: prevMonthStats.margin,
          ordersThisMonth: (ordersThisMonthRes.data || []).length,
          ordersPrevMonth: (ordersPrevMonthRes.data || []).length,
        },
        urgentItems: processedUrgentItems.slice(0, 5),
        financialAlerts,
        weeklyDeadlines: {
          receivables: weeklyReceivables,
          companyCosts: weeklySupplierPayments,
          upcomingWorks: weeklyUpcomingWorks,
        },
      };
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const stats = dashboardData?.stats ?? { totalOrders: 0, totalCustomers: 0, openTickets: 0, pendingRevenue: 0, pendingOrdersCount: 0 };
  const prevStats = dashboardData?.prevStats ?? { totalOrders: 0, totalCustomers: 0 };
  const recentOrders = dashboardData?.recentOrders ?? [];
  const cashFlow = dashboardData?.cashFlow ?? { thisMonthIncome: 0, thisMonthOutflow: 0, netCashFlow: 0, nextMonth: 0 };
  const urgentItems = dashboardData?.urgentItems ?? [];
  const financialAlerts = dashboardData?.financialAlerts ?? [];
  const ceoStrip = dashboardData?.ceoStrip ?? { revenueThisMonth: 0, revenuePrevMonth: 0, marginThisMonth: 0, marginPrevMonth: 0, ordersThisMonth: 0, ordersPrevMonth: 0 };
  const weeklyDeadlines = dashboardData?.weeklyDeadlines ?? { receivables: [], companyCosts: [], upcomingWorks: [] };

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

  // Cash flow progress bar
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

        {/* Bilancio Mese (was: Previsionale Incassi) */}
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
            {/* Income */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Entrate attese</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(cashFlow.thisMonthIncome)}</span>
              </div>
              <Progress value={incomePercent} className="h-2 [&>div]:bg-emerald-500" />
            </div>
            {/* Outflow */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Uscite attese</span>
                <span className="font-medium text-destructive">{formatCurrency(cashFlow.thisMonthOutflow)}</span>
              </div>
              <Progress value={outflowPercent} className="h-2 [&>div]:bg-destructive" />
            </div>
            {/* Net */}
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
            {/* Next month preview */}
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

        {/* Weekly Deadlines (replaces Quick Actions) */}
        <WeeklyDeadlines
          receivables={weeklyDeadlines.receivables}
          companyCosts={weeklyDeadlines.companyCosts}
          upcomingWorks={weeklyDeadlines.upcomingWorks}
        />
      </div>
    </div>
  );
}
