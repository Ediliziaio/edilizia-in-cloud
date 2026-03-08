import { useState, useMemo } from "react";
import { AlertCircle, Check, Clock, Calculator, TrendingUp, CalendarDays, ArrowUpDown, Eye, BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  Cell, PieChart, Pie, LineChart, Line,
} from "recharts";
import type { StatusTabFilter } from "@/hooks/useCompanyCostsData";

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
  PagatoEffettivo: number;
  Totale: number;
  Previsto: number;
  Sostenuto: number;
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
    totalPrevisti: number;
    previstiCount: number;
    scostamento: number;
  };
  vatStats: { vatDebit: number; supplierUnpaid: number };
  monthlyDistribution: MonthlyDistItem[];
  periodLabel?: string;
  yearlyStats: YearlyStats;
  selectedYear: number;
  onYearChange: (year: number) => void;
  activeStatusTab?: StatusTabFilter;
  onStatusTabChange?: (tab: StatusTabFilter) => void;
  categoryDistribution?: { name: string; value: number }[];
  availableYears?: number[];
  fixedCostsTrend?: { month: string; pctFixed: number }[];
}

const currentYear = new Date().getFullYear();

const PIE_COLORS = [
  "hsl(217 91% 60%)", "hsl(142 76% 36%)", "hsl(0 84% 60%)",
  "hsl(45 93% 47%)", "hsl(270 67% 58%)", "hsl(200 70% 50%)", "hsl(var(--muted-foreground))",
];

export function CostsStatsCards({ stats, vatStats, monthlyDistribution, periodLabel = "Periodo", yearlyStats, selectedYear, onYearChange, activeStatusTab, onStatusTabChange, categoryDistribution = [], availableYears = [], fixedCostsTrend = [] }: CostsStatsCardsProps) {
  const [chartView, setChartView] = useState<"current" | "comparison">("current");

  const handleCardClick = (tab: StatusTabFilter) => {
    if (onStatusTabChange) {
      onStatusTabChange(activeStatusTab === tab ? "all" : tab);
    }
  };

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

      {/* Period Stats — Clickable Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <button
          type="button"
          className={`p-4 rounded-lg border text-left transition-all hover:shadow-md ${activeStatusTab === "sostenuti" ? "ring-2 ring-green-500 bg-green-100 dark:bg-green-900/20 border-green-400" : "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800"}`}
          onClick={() => handleCardClick("sostenuti")}
        >
          <div className="flex items-center gap-2 mb-1">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-xs font-medium">Sostenuti (reali)</span>
          </div>
          <p className="text-xl font-bold text-green-600 tabular-nums">{formatCurrency(stats.totalPaidThisMonth)}</p>
          <p className="text-[10px] text-muted-foreground">{stats.paidCount} pagati</p>
        </button>

        <button
          type="button"
          className={`p-4 rounded-lg border text-left transition-all hover:shadow-md ${activeStatusTab === "previsti" ? "ring-2 ring-blue-500 bg-blue-100 dark:bg-blue-900/20 border-blue-400" : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800"}`}
          onClick={() => handleCardClick("previsti")}
        >
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-medium">Previsti (ricorrenti)</span>
          </div>
          <p className="text-xl font-bold text-blue-600 tabular-nums">{formatCurrency(stats.totalPrevisti)}</p>
          <p className="text-[10px] text-muted-foreground">{stats.previstiCount} previsti</p>
        </button>

        <button
          type="button"
          className={`p-4 rounded-lg border text-left transition-all hover:shadow-md ${activeStatusTab === "in_ritardo" ? "ring-2 ring-red-500 bg-red-100 dark:bg-red-900/20 border-red-400" : "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800"}`}
          onClick={() => handleCardClick("in_ritardo")}
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span className="text-xs font-medium">Da pagare (scaduti)</span>
          </div>
          <p className="text-xl font-bold text-red-600 tabular-nums">{formatCurrency(stats.totalOverdue)}</p>
          <p className="text-[10px] text-muted-foreground">{stats.overdueCount} scaduti</p>
        </button>

        <button
          type="button"
          className={`p-4 rounded-lg border text-left transition-all hover:shadow-md ${activeStatusTab === "in_scadenza" ? "ring-2 ring-orange-500 bg-orange-100 dark:bg-orange-900/20 border-orange-400" : "bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800"}`}
          onClick={() => handleCardClick("in_scadenza")}
        >
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-orange-600" />
            <span className="text-xs font-medium">In scadenza (7gg)</span>
          </div>
          <p className="text-xl font-bold text-orange-600 tabular-nums">{formatCurrency(stats.totalExpiringSoon)}</p>
          <p className="text-[10px] text-muted-foreground">{stats.expiringSoonCount} in scadenza</p>
        </button>

        <div className="p-4 rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800">
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="h-4 w-4 text-violet-600" />
            <span className="text-xs font-medium">IVA a debito</span>
          </div>
          <p className="text-xl font-bold text-violet-600 tabular-nums">{formatCurrency(vatStats.vatDebit)}</p>
          <p className="text-[10px] text-muted-foreground">Su costi non pagati</p>
        </div>

        <div className={`p-4 rounded-lg border ${stats.scostamento >= 0 ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800" : "bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800"}`}>
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpDown className={`h-4 w-4 ${stats.scostamento >= 0 ? "text-emerald-600" : "text-rose-600"}`} />
            <span className="text-xs font-medium">Scostamento</span>
          </div>
          <p className={`text-xl font-bold tabular-nums ${stats.scostamento >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {stats.scostamento >= 0 ? "+" : ""}{formatCurrency(stats.scostamento)}
          </p>
          <p className="text-[10px] text-muted-foreground">Sostenuto vs previsto</p>
        </div>
      </div>

      {/* Monthly Distribution Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">Distribuzione Mensile Costi</CardTitle>
              <CardDescription>
                {chartView === "current"
                  ? "Previsto (per scadenza) vs Pagato effettivo (per data pagamento)"
                  : "Confronto Previsto vs Sostenuto per mese"
                }
              </CardDescription>
            </div>
            <div className="flex gap-1">
              <Button
                variant={chartView === "current" ? "default" : "outline"}
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setChartView("current")}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Dettaglio
              </Button>
              <Button
                variant={chartView === "comparison" ? "default" : "outline"}
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setChartView("comparison")}
              >
                <Eye className="h-3.5 w-3.5" />
                Previsto vs Sostenuto
              </Button>
            </div>
          </div>
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
                  content={chartView === "comparison" ? ({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const previsto = payload.find(p => p.dataKey === "Previsto")?.value as number || 0;
                    const sostenuto = payload.find(p => p.dataKey === "Sostenuto")?.value as number || 0;
                    const delta = sostenuto - previsto;
                    return (
                      <div className="rounded-lg border bg-card p-3 shadow-md text-xs space-y-1">
                        <p className="font-semibold text-foreground">{label}</p>
                        <div className="flex justify-between gap-4">
                          <span className="text-blue-600">Previsto:</span>
                          <span className="font-medium">{formatCurrency(previsto)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-green-600">Sostenuto:</span>
                          <span className="font-medium">{formatCurrency(sostenuto)}</span>
                        </div>
                        <div className={`flex justify-between gap-4 pt-1 border-t font-semibold ${delta >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          <span>Delta:</span>
                          <span>{delta >= 0 ? "+" : ""}{formatCurrency(delta)}</span>
                        </div>
                      </div>
                    );
                  } : undefined}
                />
                <Legend />
                {chartView === "current" ? (
                  <>
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
                    <Bar
                      dataKey="PagatoEffettivo"
                      name="Pagato Effettivo"
                      fill="hsl(142 76% 36%)"
                      fillOpacity={0.25}
                      stroke="hsl(142 76% 36%)"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                      radius={[2, 2, 0, 0]}
                      barSize={16}
                    >
                      {monthlyDistribution.map((entry, i) => (
                        <Cell key={i} fillOpacity={entry.isCurrent ? 0.35 : 0.2} />
                      ))}
                    </Bar>
                  </>
                ) : (
                  <>
                    <Bar dataKey="Previsto" fill="hsl(217 91% 60%)" radius={[2, 2, 0, 0]} barSize={20}>
                      {monthlyDistribution.map((entry, i) => (
                        <Cell key={i} fillOpacity={entry.isCurrent ? 1 : 0.7} />
                      ))}
                    </Bar>
                    <Bar dataKey="Sostenuto" fill="hsl(142 76% 36%)" radius={[2, 2, 0, 0]} barSize={20}>
                      {monthlyDistribution.map((entry, i) => (
                        <Cell key={i} fillOpacity={entry.isCurrent ? 1 : 0.7} />
                      ))}
                    </Bar>
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Category Distribution PieChart */}
      {categoryDistribution.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spese per Categoria</CardTitle>
            <CardDescription>Distribuzione delle uscite per tipologia</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {categoryDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
