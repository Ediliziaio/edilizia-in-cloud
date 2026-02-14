import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, Users, MessageSquare, BarChart3, LogIn, TrendingUp, Heart, DollarSign, Calendar } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { ticketStatusLabels } from "@/lib/adminConstants";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { CompanyStats } from "@/hooks/useCompanyDetail";

interface MonthlyOrderData {
  month: string;
  count: number;
  value: number;
}

interface CompanyOverviewTabProps {
  stats: CompanyStats | null;
  totalTeam: number;
  recentOrders: any[] | undefined;
  recentTickets: any[] | undefined;
  currentPlan: any | null;
  currentSubscription: any | null;
  monthlyOrders: MonthlyOrderData[];
  daysSinceLastOrder: number | null;
  companyCreatedAt: string;
  onImpersonate: () => void;
  onImpersonateAndNavigate: (path: string) => void;
}

function getHealthColor(days: number | null): { color: string; label: string; bgClass: string } {
  if (days === null) return { color: "text-muted-foreground", label: "Nessun ordine", bgClass: "bg-muted" };
  if (days <= 7) return { color: "text-green-600", label: `${days}g fa`, bgClass: "bg-green-500/10" };
  if (days <= 30) return { color: "text-yellow-600", label: `${days}g fa`, bgClass: "bg-yellow-500/10" };
  return { color: "text-red-600", label: `${days}g fa`, bgClass: "bg-red-500/10" };
}

export function CompanyOverviewTab({
  stats, totalTeam, recentOrders, recentTickets,
  currentPlan, currentSubscription, monthlyOrders, daysSinceLastOrder,
  companyCreatedAt, onImpersonate, onImpersonateAndNavigate,
}: CompanyOverviewTabProps) {
  const avgOrderValue = stats && stats.ordersCount > 0 ? stats.ordersValue / stats.ordersCount : 0;
  const mrr = currentPlan?.price_monthly || 0;
  const health = getHealthColor(daysSinceLastOrder);

  // Calculate LTV: months since creation * MRR
  const monthsActive = Math.max(1, Math.round((Date.now() - new Date(companyCreatedAt).getTime()) / (30 * 24 * 60 * 60 * 1000)));
  const ltv = mrr * monthsActive;

  // Calculate month-over-month variation
  const currentMonthValue = monthlyOrders.length > 0 ? monthlyOrders[monthlyOrders.length - 1].value : 0;
  const prevMonthValue = monthlyOrders.length > 1 ? monthlyOrders[monthlyOrders.length - 2].value : 0;
  const momVariation = prevMonthValue > 0 ? ((currentMonthValue - prevMonthValue) / prevMonthValue) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valore Ordini</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.ordersValue || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.ordersCount || 0} ordini totali
              {momVariation !== 0 && (
                <span className={momVariation > 0 ? "text-green-600 ml-2" : "text-red-600 ml-2"}>
                  {momVariation > 0 ? "+" : ""}{momVariation.toFixed(0)}% vs mese prec.
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valore Medio</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgOrderValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">per ordine</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entrate Mensili</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(mrr)}</div>
            <p className="text-xs text-muted-foreground mt-1">{currentPlan?.name || "Nessun piano"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stato Salute</CardTitle>
            <div className={`h-8 w-8 rounded-lg ${health.bgClass} flex items-center justify-center`}>
              <Heart className={`h-4 w-4 ${health.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${health.color}`}>{health.label}</div>
            <p className="text-xs text-muted-foreground mt-1">ultimo ordine creato</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Chart */}
      {monthlyOrders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Ordini negli Ultimi 6 Mesi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyOrders}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis yAxisId="left" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
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
          </CardContent>
        </Card>
      )}

      {/* Revenue Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Piano attuale</p>
              <p className="text-lg font-semibold">{currentPlan?.name || "—"}</p>
              {currentPlan && (
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(currentPlan.price_monthly)}/mese · {formatCurrency(currentPlan.price_yearly)}/anno
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">MRR</p>
              <p className="text-lg font-semibold">{formatCurrency(mrr)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Prossimo rinnovo</p>
              <p className="text-lg font-semibold">
                {currentSubscription?.current_period_end
                  ? format(new Date(currentSubscription.current_period_end), "dd MMM yyyy", { locale: it })
                  : "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Lifetime Value</p>
              <p className="text-lg font-semibold">{mrr > 0 ? formatCurrency(ltv) : "N/A"}</p>
              <p className="text-xs text-muted-foreground">{mrr > 0 ? `${monthsActive} mesi attivi` : "Nessun piano attivo"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Orders & Tickets */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Ultimi Ordini
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!recentOrders || recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nessun ordine</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrizione</TableHead>
                    <TableHead>Importo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map((order) => {
                    const statusInfo = order.order_statuses as { name: string; color: string; icon: string } | null;
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{order.description}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(order.total_amount)}</TableCell>
                        <TableCell>
                          {statusInfo ? (
                            <Badge variant="outline" className="text-xs" style={{ borderColor: statusInfo.color, color: statusInfo.color }}>
                              {statusInfo.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{format(new Date(order.created_at), "dd/MM/yy")}</TableCell>
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
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Ultimi Ticket
            </CardTitle>
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
                    <TableHead>Data</TableHead>
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
                        <TableCell className="text-muted-foreground text-xs">{format(new Date(ticket.created_at), "dd/MM/yy")}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Azioni Rapide</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={onImpersonate}>
            <LogIn className="h-4 w-4 mr-2" />
            Accedi al pannello azienda
          </Button>
          <Button variant="outline" onClick={() => onImpersonateAndNavigate("/azienda/ordini")}>
            <ClipboardList className="h-4 w-4 mr-2" />
            Visualizza ordini ({stats?.ordersCount || 0})
          </Button>
          <Button variant="outline" onClick={() => onImpersonateAndNavigate("/azienda/assistenza")}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Gestisci ticket ({stats?.ticketsCount || 0})
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
