import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ClipboardList, Users, MessageSquare, TrendingUp, Heart, DollarSign,
  Calendar, Activity, ArrowUpRight, ArrowDownRight, Minus, ShoppingCart,
  Clock, CheckCircle2, AlertTriangle, Zap
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { ticketStatusLabels } from "@/lib/adminConstants";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from "recharts";
import { CompanyConversionCard } from "./CompanyConversionCard";
import { Progress } from "@/components/ui/progress";
import { useCompanyHealthScore } from "@/hooks/useHealthScores";
import { HealthScoreBadge } from "./HealthScoreBadge";
import type { CompanyStats } from "@/hooks/useCompanyDetail";
import { cn } from "@/lib/utils";

interface MonthlyOrderData {
  month: string;
  count: number;
  value: number;
}

interface CompanyOverviewTabProps {
  companyId?: string;
  stats: CompanyStats | null;
  totalTeam: number;
  recentOrders: any[] | undefined;
  recentTickets: any[] | undefined;
  currentPlan: any | null;
  currentSubscription: any | null;
  monthlyOrders: MonthlyOrderData[];
  daysSinceLastOrder: number | null;
  companyCreatedAt: string;
  companyStatus?: string;
  trialEndsAt?: string | null;
  paymentMethod?: string;
  onExtendTrial?: (days: number) => void;
  isExtendingTrial?: boolean;
}

function getHealthInfo(days: number | null) {
  if (days === null) return { color: "text-muted-foreground", label: "N/A", bgClass: "bg-muted/50", ring: "ring-muted" };
  if (days <= 7) return { color: "text-green-600", label: `${days}g fa`, bgClass: "bg-green-500/10", ring: "ring-green-500/20" };
  if (days <= 30) return { color: "text-yellow-600", label: `${days}g fa`, bgClass: "bg-yellow-500/10", ring: "ring-yellow-500/20" };
  return { color: "text-red-600", label: `${days}g fa`, bgClass: "bg-red-500/10", ring: "ring-red-500/20" };
}

function TrendIndicator({ value, suffix = "%" }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" /> 0{suffix}</span>;
  if (value > 0) return <span className="text-xs text-green-600 flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" /> +{value.toFixed(0)}{suffix}</span>;
  return <span className="text-xs text-red-600 flex items-center gap-0.5"><ArrowDownRight className="h-3 w-3" /> {value.toFixed(0)}{suffix}</span>;
}

function MiniBar({ data }: { data: MonthlyOrderData[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-primary/60 hover:bg-primary transition-colors"
          style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }}
          title={`${d.month}: ${formatCurrency(d.value)}`}
        />
      ))}
    </div>
  );
}

function buildTimeline(recentOrders: any[], recentTickets: any[], companyCreatedAt: string) {
  const items: Array<{ id: string; type: string; title: string; date: string; icon: typeof ClipboardList; color: string; detail?: string }> = [];

  (recentOrders || []).slice(0, 3).forEach(o => {
    items.push({
      id: `o-${o.id}`,
      type: "Ordine",
      title: o.description || "Ordine",
      date: o.created_at,
      icon: ShoppingCart,
      color: "text-primary",
      detail: formatCurrency(o.total_amount),
    });
  });

  (recentTickets || []).slice(0, 3).forEach(t => {
    const status = ticketStatusLabels[t.status];
    items.push({
      id: `t-${t.id}`,
      type: "Ticket",
      title: t.subject,
      date: t.created_at,
      icon: MessageSquare,
      color: t.status === "risolto" ? "text-green-600" : "text-yellow-600",
      detail: status?.label || t.status,
    });
  });

  items.push({
    id: "created",
    type: "Evento",
    title: "Azienda creata",
    date: companyCreatedAt,
    icon: Zap,
    color: "text-violet-600",
  });

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return items.slice(0, 8);
}

export function CompanyOverviewTab({
  companyId, stats, totalTeam, recentOrders, recentTickets,
  currentPlan, currentSubscription, monthlyOrders, daysSinceLastOrder,
  companyCreatedAt, companyStatus, trialEndsAt, paymentMethod,
  onExtendTrial, isExtendingTrial,
}: CompanyOverviewTabProps) {
  const { data: serverHealth } = useCompanyHealthScore(companyId);
  const avgOrderValue = stats && stats.ordersCount > 0 ? stats.ordersValue / stats.ordersCount : 0;
  const mrr = currentPlan?.price_monthly || 0;
  const health = getHealthInfo(daysSinceLastOrder);

  const monthsActive = Math.max(1, Math.round((Date.now() - new Date(companyCreatedAt).getTime()) / (30 * 24 * 60 * 60 * 1000)));
  const ltv = mrr * monthsActive;

  const currentMonthValue = monthlyOrders.length > 0 ? monthlyOrders[monthlyOrders.length - 1].value : 0;
  const prevMonthValue = monthlyOrders.length > 1 ? monthlyOrders[monthlyOrders.length - 2].value : 0;
  const momVariation = prevMonthValue > 0 ? ((currentMonthValue - prevMonthValue) / prevMonthValue) * 100 : 0;

  const currentMonthCount = monthlyOrders.length > 0 ? monthlyOrders[monthlyOrders.length - 1].count : 0;
  const prevMonthCount = monthlyOrders.length > 1 ? monthlyOrders[monthlyOrders.length - 2].count : 0;
  const momCountVar = prevMonthCount > 0 ? ((currentMonthCount - prevMonthCount) / prevMonthCount) * 100 : 0;

  const timeline = buildTimeline(recentOrders || [], recentTickets || [], companyCreatedAt);

  return (
    <div className="space-y-6">
      {/* Trial Conversion Card */}
      {companyStatus === "trial" && (
        <CompanyConversionCard
          trialEndsAt={trialEndsAt || null}
          onboardingPct={0}
          paymentMethod={paymentMethod || "none"}
          onExtendTrial={onExtendTrial}
          isExtendingTrial={isExtendingTrial}
        />
      )}

      {/* === KPI Hero Row === */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Revenue KPI */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fatturato Ordini</p>
                <p className="text-2xl font-bold tracking-tight">{formatCurrency(stats?.ordersValue || 0)}</p>
                <div className="flex items-center gap-2">
                  <TrendIndicator value={momVariation} />
                  <span className="text-xs text-muted-foreground">vs mese prec.</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="mt-3">
              <MiniBar data={monthlyOrders} />
            </div>
          </CardContent>
        </Card>

        {/* Orders KPI */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ordini</p>
                <p className="text-2xl font-bold tracking-tight">{stats?.ordersCount || 0}</p>
                <div className="flex items-center gap-2">
                  <TrendIndicator value={momCountVar} />
                  <span className="text-xs text-muted-foreground">media {formatCurrency(avgOrderValue)}</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center ring-1 ring-blue-500/20">
                <ClipboardList className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full", health.bgClass)}>
                <Heart className={cn("h-3 w-3", health.color)} />
                <span className={cn("font-medium", health.color)}>Ultimo: {health.label}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MRR & LTV */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-bl-full" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">MRR</p>
                <p className="text-2xl font-bold tracking-tight">{formatCurrency(mrr)}</p>
                <p className="text-xs text-muted-foreground">{currentPlan?.name || "Nessun piano"}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center ring-1 ring-green-500/20">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">LTV</span>
              <span className="font-semibold">{mrr > 0 ? formatCurrency(ltv) : "N/A"}</span>
              <span className="text-muted-foreground">{monthsActive} mesi</span>
            </div>
            {mrr > 0 && (
              <Progress value={Math.min(100, (monthsActive / 24) * 100)} className="h-1 mt-1.5" />
            )}
          </CardContent>
        </Card>

        {/* Team & Subscription */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-bl-full" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Team & Rinnovo</p>
                <p className="text-2xl font-bold tracking-tight">{totalTeam} <span className="text-sm font-normal text-muted-foreground">membri</span></p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center ring-1 ring-violet-500/20">
                <Users className="h-5 w-5 text-violet-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Rinnovo:</span>
              <span className="font-medium">
                {currentSubscription?.current_period_end
                  ? format(new Date(currentSubscription.current_period_end), "dd MMM yyyy", { locale: it })
                  : "—"}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Ticket aperti:</span>
              <Badge variant={stats?.openTicketsCount ? "destructive" : "secondary"} className="text-[10px] h-4 px-1.5">
                {stats?.openTicketsCount || 0}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === Health Score === */}
      {serverHealth && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Health Score
              </CardTitle>
              <HealthScoreBadge companyId={companyId!} healthScore={serverHealth} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-5 gap-4">
              {[
                { label: "Login", value: serverHealth.login_score, max: 25, icon: "🔑" },
                { label: "Ordini", value: serverHealth.orders_score, max: 25, icon: "📦" },
                { label: "Funzionalità", value: serverHealth.features_score, max: 20, icon: "⚙️" },
                { label: "Team", value: serverHealth.team_score, max: 15, icon: "👥" },
                { label: "Engagement", value: serverHealth.engagement_score, max: 15, icon: "🔥" },
              ].map((item) => {
                const pct = (item.value / item.max) * 100;
                return (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{item.icon}</span>
                      <span className="text-xs font-medium">{item.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={cn(
                        "text-lg font-bold",
                        pct >= 70 ? "text-green-600" : pct >= 40 ? "text-yellow-600" : "text-red-600"
                      )}>{item.value}</span>
                      <span className="text-xs text-muted-foreground">/{item.max}</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })}
            </div>

            {serverHealth.signals.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {serverHealth.signals.map((s) => (
                  <Badge key={s} variant="outline" className="text-xs gap-1">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {s.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1 border-t">
              <span className="text-xs font-medium text-muted-foreground">Rischio Churn</span>
              <Progress value={serverHealth.churn_risk} className="h-2 flex-1" />
              <span className={cn(
                "text-sm font-bold",
                serverHealth.churn_risk > 60 ? "text-red-600" : serverHealth.churn_risk > 30 ? "text-yellow-600" : "text-green-600"
              )}>{serverHealth.churn_risk}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* === Chart + Timeline Row === */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Orders Chart - 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Trend Ordini — Ultimi 6 Mesi
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyOrders.length > 0 ? (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyOrders}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis yAxisId="left" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(value: number, name: string) => [
                        name === "value" ? formatCurrency(value) : value,
                        name === "value" ? "Valore" : "Ordini",
                      ]}
                    />
                    <Area yAxisId="left" type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#colorValue)" strokeWidth={2} name="count" />
                    <Area yAxisId="right" type="monotone" dataKey="value" stroke="hsl(142 76% 36%)" fill="none" strokeWidth={2} strokeDasharray="5 5" name="value" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                Nessun dato disponibile
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Timeline - 1 col */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Attività Recente
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[300px] overflow-y-auto">
              {timeline.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className={cn("mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                      item.type === "Ordine" ? "bg-primary/10" : item.type === "Ticket" ? "bg-yellow-500/10" : "bg-violet-500/10"
                    )}>
                      <Icon className={cn("h-3.5 w-3.5", item.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">{item.type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.date), { addSuffix: true, locale: it })}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate mt-0.5">{item.title}</p>
                      {item.detail && (
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {timeline.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nessuna attività</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === Recent Orders & Tickets Tables === */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                Ultimi Ordini
              </CardTitle>
              <Badge variant="secondary" className="text-xs">{recentOrders?.length || 0}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!recentOrders || recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nessun ordine</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrizione</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map((order) => {
                    const statusInfo = order.order_statuses as { name: string; color: string; icon: string } | null;
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{order.description}</TableCell>
                        <TableCell className="font-semibold text-right">{formatCurrency(order.total_amount)}</TableCell>
                        <TableCell>
                          {statusInfo ? (
                            <Badge variant="outline" className="text-xs" style={{ borderColor: statusInfo.color, color: statusInfo.color }}>
                              {statusInfo.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs text-right">
                          {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: it })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Ultimi Ticket
              </CardTitle>
              <Badge variant={stats?.openTicketsCount ? "destructive" : "secondary"} className="text-xs">
                {stats?.openTicketsCount || 0} aperti
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!recentTickets || recentTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nessun ticket</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Oggetto</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTickets.map((ticket) => {
                    const tStatus = ticketStatusLabels[ticket.status] || { label: ticket.status, variant: "outline" as const };
                    return (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-medium max-w-[250px] truncate">{ticket.subject}</TableCell>
                        <TableCell>
                          <Badge variant={tStatus.variant} className="text-xs">{tStatus.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs text-right">
                          {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: it })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
