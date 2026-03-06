import { AlertCircle, Check, Clock, Calculator, Truck, TrendingUp, CalendarDays } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/formatters";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  Cell,
} from "recharts";

interface YearlyStats {
  total: number;
  totalPaid: number;
  totalUnpaid: number;
  totalOverdue: number;
  pctPaid: number;
  count: number;
}

interface MonthlyDistItem {
  month: string;
  monthKey: string;
  Fissi: number;
  Variabili: number;
  Pagati: number;
  Totale: number;
  isCurrent: boolean;
}

interface CostsStatsCardsProps {
  stats: {
    totalUnpaidThisMonth: number;
    totalPaidThisMonth: number;
    totalOverdue: number;
    unpaidCount: number;
    paidCount: number;
    overdueCount: number;
    expiringSoonCount: number;
    totalExpiringSoon: number;
    totalPeriod: number;
    totalCount: number;
  };
  vatStats: { vatDebit: number; supplierUnpaid: number };
  monthlyDistribution: MonthlyDistItem[];
  periodLabel?: string;
  yearlyStats: YearlyStats;
  selectedYear: number;
  onYearChange: (year: number) => void;
}

const currentYear = new Date().getFullYear();

export function CostsStatsCards({ stats, vatStats, monthlyDistribution, periodLabel = "Periodo", yearlyStats, selectedYear, onYearChange }: CostsStatsCardsProps) {
  return (
    <>
      {/* Annual Summary */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Situazione {selectedYear}</h3>
          </div>
          <div className="flex gap-1">
            <Button
              variant={selectedYear === currentYear ? "default" : "outline"}
              size="sm"
              onClick={() => onYearChange(currentYear)}
            >
              {currentYear}
            </Button>
            <Button
              variant={selectedYear === currentYear - 1 ? "default" : "outline"}
              size="sm"
              onClick={() => onYearChange(currentYear - 1)}
            >
              {currentYear - 1}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Totale Anno</p>
              <p className="text-2xl font-bold text-primary tabular-nums">{formatCurrency(yearlyStats.total)}</p>
              <p className="text-[10px] text-muted-foreground">{yearlyStats.count} costi</p>
            </CardContent>
          </Card>
          <Card className="border-green-500/20 bg-green-500/5">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Pagato</p>
              <p className="text-2xl font-bold text-green-600 tabular-nums">{formatCurrency(yearlyStats.totalPaid)}</p>
              <div className="mt-1.5">
                <Progress value={yearlyStats.pctPaid} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-0.5">{yearlyStats.pctPaid}% del totale</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Da Pagare</p>
              <p className="text-2xl font-bold text-red-600 tabular-nums">{formatCurrency(yearlyStats.totalUnpaid)}</p>
              <p className="text-[10px] text-muted-foreground">{100 - yearlyStats.pctPaid}% rimanente</p>
            </CardContent>
          </Card>
          <Card className="border-orange-500/20 bg-orange-500/5">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">Scaduti</p>
              <p className="text-2xl font-bold text-orange-600 tabular-nums">{formatCurrency(yearlyStats.totalOverdue)}</p>
              <p className="text-[10px] text-muted-foreground">Da saldare</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Period Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-medium">Totale {periodLabel}</span>
          </div>
          <p className="text-xl font-bold text-blue-600 tabular-nums">{formatCurrency(stats.totalPeriod)}</p>
          <p className="text-[10px] text-muted-foreground">{stats.totalCount} costi</p>
        </div>
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span className="text-xs font-medium">Da pagare</span>
          </div>
          <p className="text-xl font-bold text-red-600 tabular-nums">{formatCurrency(stats.totalUnpaidThisMonth)}</p>
          <p className="text-[10px] text-muted-foreground">
            {stats.unpaidCount} da pagare
            {stats.expiringSoonCount > 0 && (
              <span className="text-orange-600 font-medium"> · {stats.expiringSoonCount} in scadenza 7gg</span>
            )}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 mb-1">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-xs font-medium">Pagato</span>
          </div>
          <p className="text-xl font-bold text-green-600 tabular-nums">{formatCurrency(stats.totalPaidThisMonth)}</p>
          <p className="text-[10px] text-muted-foreground">{stats.paidCount} pagati</p>
        </div>
        <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-orange-600" />
            <span className="text-xs font-medium">Scaduti</span>
          </div>
          <p className="text-xl font-bold text-orange-600 tabular-nums">{formatCurrency(stats.totalOverdue)}</p>
          <p className="text-[10px] text-muted-foreground">{stats.overdueCount} scaduti</p>
        </div>
        <div className="p-4 rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800">
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="h-4 w-4 text-violet-600" />
            <span className="text-xs font-medium">IVA a debito</span>
          </div>
          <p className="text-xl font-bold text-violet-600 tabular-nums">{formatCurrency(vatStats.vatDebit)}</p>
          <p className="text-[10px] text-muted-foreground">Su costi non pagati</p>
        </div>
        <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-medium">Fornitori da pagare</span>
          </div>
          <p className="text-xl font-bold text-indigo-600 tabular-nums">{formatCurrency(vatStats.supplierUnpaid)}</p>
          <p className="text-[10px] text-muted-foreground">Costi con fornitore</p>
        </div>
      </div>

      {/* Monthly Distribution Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Distribuzione Mensile Costi</CardTitle>
          <CardDescription>Ultimi 6 mesi e prossimi 6 mesi — fissi, variabili e pagati</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyDistribution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="month"
                  className="text-xs"
                  tick={({ x, y, payload, index }: any) => {
                    const item = monthlyDistribution[index];
                    const isCurrent = item?.isCurrent;
                    return (
                      <text
                        x={x} y={y + 12}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={isCurrent ? 700 : 400}
                        fill={isCurrent ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                      >
                        {payload.value}
                      </text>
                    );
                  }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                />
                <Legend />
                <Bar dataKey="Fissi" fill="hsl(0 84.2% 60.2%)" radius={[2, 2, 0, 0]} barSize={16}>
                  {monthlyDistribution.map((entry, i) => (
                    <Cell key={i} fillOpacity={entry.isCurrent ? 1 : 0.7} />
                  ))}
                </Bar>
                <Bar dataKey="Variabili" fill="hsl(45 93% 47%)" radius={[2, 2, 0, 0]} barSize={16}>
                  {monthlyDistribution.map((entry, i) => (
                    <Cell key={i} fillOpacity={entry.isCurrent ? 1 : 0.7} />
                  ))}
                </Bar>
                <Bar dataKey="Pagati" fill="hsl(142 76% 36%)" radius={[2, 2, 0, 0]} barSize={16}>
                  {monthlyDistribution.map((entry, i) => (
                    <Cell key={i} fillOpacity={entry.isCurrent ? 1 : 0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
