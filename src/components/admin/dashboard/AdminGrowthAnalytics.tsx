import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Banknote,
  Building2,
  CalendarClock,
  CreditCard,
  Loader2,
  MousePointerClick,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useAdminGrowthAnalytics, type GrowthCompanyRow } from "@/hooks/useAdminGrowthAnalytics";
import { DashboardDateFilter, getDefaultDateRange } from "./DashboardDateFilter";

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
};

const metricCopy = {
  newCompanies: "Nuove aziende",
  trialsStarted: "Trial avviati",
  newPayingCompanies: "Nuove paganti",
  newUsers: "Nuovi utenti",
  collected: "Incassato",
  newMrr: "Nuovo MRR",
};

function KpiTile({
  label,
  value,
  description,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  description: string;
  icon: React.ElementType;
  tone?: "primary" | "emerald" | "sky" | "amber" | "rose";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  }[tone];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] md:text-xs font-semibold uppercase text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl md:text-2xl font-bold tabular-nums truncate">{value}</p>
          </div>
          <div className={cn("rounded-md p-2 shrink-0", toneClass)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{description}</p>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-52" />
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={idx} className="h-28 rounded-lg" />
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </div>
  );
}

function CompanyRows({ rows, emptyText }: { rows: GrowthCompanyRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyText}</div>;
  }

  return (
    <div className="divide-y rounded-lg border">
      {rows.map((row) => (
        <Link
          key={`${row.companyId}-${row.date}`}
          to={`/admin/aziende/${row.companyId}`}
          className="grid grid-cols-[1fr_auto] gap-3 p-3 transition-colors hover:bg-muted/50"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.companyName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.planName} · {format(new Date(row.date), "dd MMM yyyy", { locale: it })}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={row.status === "active" ? "default" : "secondary"} className="text-[10px]">
              {row.status || "n/d"}
            </Badge>
            {row.monthlyRevenue > 0 && (
              <span className="text-xs font-semibold">{formatCurrency(row.monthlyRevenue)}/mese</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

export function AdminGrowthAnalytics() {
  const [range, setRange] = useState(getDefaultDateRange);
  const { data, isLoading, isFetching, isError, refetch } = useAdminGrowthAnalytics(range);

  if (isLoading) return <LoadingState />;

  if (isError || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Growth analytics</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">Non riesco a caricare le metriche di crescita.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Riprova
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <CardTitle className="text-base">Crescita, incassi e trial</CardTitle>
                {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Incassi da fatture Stripe pagate · MRR solo aziende realmente paganti
              </p>
            </div>
            <DashboardDateFilter value={range} onChange={setRange} />
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Incassato periodo"
          value={formatCurrency(data.collected)}
          description="Somma delle fatture Stripe pagate nel periodo selezionato"
          icon={Banknote}
          tone="emerald"
        />
        <KpiTile
          label="Media mensile"
          value={formatCurrency(data.monthlyCollectedAverage)}
          description="Media normalizzata sul numero di mesi coperti dal filtro"
          icon={CalendarClock}
          tone="sky"
        />
        <KpiTile
          label="Nuove aziende"
          value={String(data.newCompanies)}
          description="Aziende create nel periodo, escluse quelle di piattaforma"
          icon={Building2}
        />
        <KpiTile
          label="Nuovi utenti"
          value={String(data.newUsers)}
          description="Profili collegati ad aziende creati nel periodo"
          icon={UserPlus}
          tone="sky"
        />
        <KpiTile
          label="Trial"
          value={String(data.trialsStarted)}
          description={`${data.trialConversionRate}% conversione stimata nello stesso periodo`}
          icon={MousePointerClick}
          tone="amber"
        />
        <KpiTile
          label="Nuove paganti"
          value={String(data.newPayingCompanies)}
          description={`Nuovo MRR: ${formatCurrency(data.newMrr)}`}
          icon={CreditCard}
          tone="emerald"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Aziende entrate nel funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.trend} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => [value, metricCopy[name as keyof typeof metricCopy] || name]}
                />
                <Legend formatter={(value: string) => metricCopy[value as keyof typeof metricCopy] || value} />
                <Bar dataKey="newCompanies" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="trialsStarted" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="newPayingCompanies" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Incassi e nuovi utenti</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={data.trend} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis
                  yAxisId="money"
                  tickFormatter={formatCurrencyCompact}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <YAxis
                  yAxisId="users"
                  orientation="right"
                  allowDecimals={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => {
                    const label = metricCopy[name as keyof typeof metricCopy] || name;
                    return [name === "newUsers" ? value : formatCurrency(value), label];
                  }}
                />
                <Legend formatter={(value: string) => metricCopy[value as keyof typeof metricCopy] || value} />
                <Bar yAxisId="money" dataKey="collected" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                <Area
                  yAxisId="money"
                  type="monotone"
                  dataKey="newMrr"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary) / 0.16)"
                  strokeWidth={2}
                />
                <Bar yAxisId="users" dataKey="newUsers" fill="hsl(199 89% 48%)" radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium">Nuove aziende paganti</CardTitle>
              <Badge variant="secondary">{data.payingCompanies} paganti totali</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <CompanyRows rows={data.newPayingRows} emptyText="Nessuna nuova azienda pagante nel periodo selezionato." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium">Trial avviati</CardTitle>
              <Badge variant="outline">
                {formatCurrency(data.currentMrr)} MRR pagante · {formatCurrency(data.excludedMrr)} escluso
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <CompanyRows rows={data.trialRows} emptyText="Nessun trial avviato nel periodo selezionato." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
