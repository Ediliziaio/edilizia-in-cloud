import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Zap, Snowflake, Users, ClipboardList, UserPlus, Clock, AlertTriangle, BellRing } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { Link } from "react-router-dom";
import type { TrialActivation } from "@/hooks/useAdminRevenueData";

interface Props {
  data: TrialActivation;
}

export function AdminTrialIntelligence({ data }: Props) {
  const pctOrders = data.total > 0 ? Math.round((data.withOrders / data.total) * 100) : 0;
  const pctCustomers = data.total > 0 ? Math.round((data.withCustomers / data.total) * 100) : 0;
  const pctStaff = data.total > 0 ? Math.round((data.withStaff / data.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Hot Trial Alerts Banner */}
      {data.hotTrialAlerts.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-base text-amber-800 dark:text-amber-300">
                Alert: Trial ad alto engagement in scadenza
              </CardTitle>
              <Badge variant="destructive" className="text-xs ml-auto">
                {data.hotTrialAlerts.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.hotTrialAlerts.map((alert) => (
                <Link
                  key={alert.companyId}
                  to={`/admin/aziende/${alert.companyId}`}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-background hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle className={`h-4 w-4 shrink-0 ${
                      alert.daysUntilExpiry <= 1 ? "text-red-600" : "text-amber-600"
                    }`} />
                    <div>
                      <p className="text-sm font-medium">{alert.companyName}</p>
                      <p className="text-xs text-muted-foreground">
                        {alert.ordersLast30d} ordini (30gg) · {alert.userCount} utenti · Score {alert.score}
                      </p>
                    </div>
                  </div>
                  <Badge variant={alert.daysUntilExpiry <= 1 ? "destructive" : "secondary"} className="text-xs shrink-0">
                    {alert.daysUntilExpiry <= 0
                      ? "Scade oggi"
                      : alert.daysUntilExpiry === 1
                      ? "Scade domani"
                      : `${alert.daysUntilExpiry}gg rimasti`}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Row 1: KPIs + Scoring */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Conversion Rate Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Trial → Paid</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <span className="text-sm font-medium">Conversion Rate</span>
              <span className={`text-2xl font-bold ${
                data.conversionRate >= 50 ? "text-emerald-600"
                : data.conversionRate >= 25 ? "text-amber-600"
                : "text-red-600"
              }`}>
                {data.conversionRate}%
              </span>
            </div>
            {data.avgDaysToFirstOrder !== null && (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Time-to-activation:</span>
                <span className="font-semibold">{data.avgDaysToFirstOrder} giorni</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {data.total} trial attivi · Pool totale calcolato su trial + convertiti + expired
            </div>
          </CardContent>
        </Card>

        {/* Trial Scoring */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Trial Scoring</CardTitle>
              <Badge variant="outline" className="text-xs">{data.total} attivi</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20">
                <Zap className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{data.hot}</p>
                  <p className="text-xs text-muted-foreground">Caldi</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/20">
                <Snowflake className="h-5 w-5 text-sky-600" />
                <div>
                  <p className="text-2xl font-bold text-sky-700 dark:text-sky-400">{data.cold}</p>
                  <p className="text-xs text-muted-foreground">Freddi</p>
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><Zap className="h-3 w-3 inline text-orange-500" /> Caldi = ordini negli ultimi 30gg</p>
              <p><Snowflake className="h-3 w-3 inline text-sky-500" /> Freddi = nessun ordine, ≤1 utente</p>
            </div>
          </CardContent>
        </Card>

        {/* Activation Milestones */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Milestone Attivazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <MilestoneBar
              icon={<ClipboardList className="h-3.5 w-3.5" />}
              label="Primo ordine creato"
              value={data.withOrders}
              total={data.total}
              pct={pctOrders}
            />
            <MilestoneBar
              icon={<UserPlus className="h-3.5 w-3.5" />}
              label="Primo cliente aggiunto"
              value={data.withCustomers}
              total={data.total}
              pct={pctCustomers}
            />
            <MilestoneBar
              icon={<Users className="h-3.5 w-3.5" />}
              label="Staff invitato"
              value={data.withStaff}
              total={data.total}
              pct={pctStaff}
            />
            <div className="pt-2 border-t text-xs text-muted-foreground">
              Percentuale calcolata sui {data.total} trial attivi
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Conversion Trend Chart */}
      {data.conversionTrend.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Trend Conversione (ultimi 6 mesi)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.conversionTrend} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        trialsStarted: "Trial avviati",
                        converted: "Convertiti",
                        expired: "Persi",
                      };
                      return [value, labels[name] || name];
                    }}
                  />
                  <Legend
                    formatter={(value: string) => {
                      const labels: Record<string, string> = {
                        trialsStarted: "Trial avviati",
                        converted: "Convertiti",
                        expired: "Persi",
                      };
                      return labels[value] || value;
                    }}
                  />
                  <Bar dataKey="trialsStarted" fill="hsl(var(--muted-foreground))" opacity={0.3} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="converted" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expired" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Conversion Rate Storico</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.conversionTrend} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, "Conversion Rate"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={{ fill: "hsl(var(--primary))", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function MilestoneBar({
  icon,
  label,
  value,
  total,
  pct,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total: number;
  pct: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <span className="text-xs font-medium">
          {value}/{total} ({pct}%)
        </span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
