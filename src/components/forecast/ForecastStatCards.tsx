import {
  CalendarClock,
  TrendingUp,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { ForecastStats } from "@/lib/forecastTypes";

interface ForecastStatCardsProps {
  stats: ForecastStats;
}

function StatBreakdown({ income, expenses, net }: { income: number; expenses: number; net: number }) {
  return (
    <div className="space-y-1.5">
      <div className={`text-2xl font-bold ${net >= 0 ? "text-green-600" : "text-destructive"}`}>
        {net >= 0 ? "+" : ""}{formatCurrency(net)}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="text-green-600">↑ {formatCurrency(income)}</span>
        <span className="text-destructive">↓ {formatCurrency(expenses)}</span>
      </div>
    </div>
  );
}

export function ForecastStatCards({ stats }: ForecastStatCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Questo Mese</CardTitle>
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <StatBreakdown
            income={stats.thisMonth.income}
            expenses={stats.thisMonth.expenses}
            net={stats.thisMonth.net}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Prossimo Mese</CardTitle>
          {stats.nextMonth.net >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-destructive" />
          )}
        </CardHeader>
        <CardContent>
          <StatBreakdown
            income={stats.nextMonth.income}
            expenses={stats.nextMonth.expenses}
            net={stats.nextMonth.net}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Prossimi 3 Mesi</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <StatBreakdown
            income={stats.next3Months.income}
            expenses={stats.next3Months.expenses}
            net={stats.next3Months.net}
          />
        </CardContent>
      </Card>
    </div>
  );
}
