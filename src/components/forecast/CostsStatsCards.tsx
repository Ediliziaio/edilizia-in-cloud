import { AlertCircle, Check, Clock, Calculator, Truck, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from "recharts";

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
  monthlyDistribution: { month: string; Fissi: number; Variabili: number }[];
  periodLabel?: string;
}

export function CostsStatsCards({ stats, vatStats, monthlyDistribution, periodLabel = "Periodo" }: CostsStatsCardsProps) {
  return (
    <>
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Distribuzione Mensile Costi Futuri</CardTitle>
          <CardDescription>Costi non pagati per i prossimi 6 mesi</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyDistribution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                <RechartsTooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend />
                <Bar dataKey="Fissi" stackId="costs" fill="hsl(0 84.2% 60.2%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Variabili" stackId="costs" fill="hsl(45 93% 47%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
