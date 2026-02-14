import {
  CalendarClock,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Flame,
  ArrowLeftRight,
  Clock,
  Repeat,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { ForecastStats, CfoKpis } from "@/lib/forecastTypes";

interface ForecastStatCardsProps {
  stats: ForecastStats;
  cfoKpis: CfoKpis;
}

export function ForecastStatCards({ stats, cfoKpis }: ForecastStatCardsProps) {
  return (
    <>
      {/* Main Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Questo Mese</CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.thisMonth.net >= 0 ? "text-green-600" : "text-destructive"}`}>
              {stats.thisMonth.net >= 0 ? "+" : ""}{formatCurrency(stats.thisMonth.net)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.thisMonth.incomeCount} entrate, {stats.thisMonth.expensesCount} uscite
            </p>
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
            <div className={`text-2xl font-bold ${stats.nextMonth.net >= 0 ? "text-green-600" : "text-destructive"}`}>
              {stats.nextMonth.net >= 0 ? "+" : ""}{formatCurrency(stats.nextMonth.net)}
            </div>
            <p className="text-xs text-muted-foreground">
              Entrate {formatCurrency(stats.nextMonth.income)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prossimi 3 Mesi</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.next3Months.net >= 0 ? "text-green-600" : "text-destructive"}`}>
              {stats.next3Months.net >= 0 ? "+" : ""}{formatCurrency(stats.next3Months.net)}
            </div>
            <p className="text-xs text-muted-foreground">
              Uscite previste {formatCurrency(stats.next3Months.expenses)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totale in Sospeso</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.total.net >= 0 ? "text-green-600" : "text-destructive"}`}>
              {stats.total.net >= 0 ? "+" : ""}{formatCurrency(stats.total.net)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.total.incomeCount} entrate, {stats.total.expensesCount} uscite
            </p>
          </CardContent>
        </Card>
      </div>

      {/* CFO KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Burn Rate Mensile</CardTitle>
            <Flame className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(cfoKpis.burnRate)}
            </div>
            <p className="text-xs text-muted-foreground">Media uscite/mese (6 mesi)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rapporto Entrate/Uscite</CardTitle>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${cfoKpis.ratio >= 1 ? "text-green-600" : "text-destructive"}`}>
              {cfoKpis.ratio.toFixed(2)}x
            </div>
            <p className="text-xs text-muted-foreground">
              {cfoKpis.ratio >= 1 ? "Entrate superiori" : "Uscite superiori"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Costi Scaduti</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${cfoKpis.overdueTotal > 0 ? "text-destructive" : "text-green-600"}`}>
              {formatCurrency(cfoKpis.overdueTotal)}
            </div>
            <p className="text-xs text-muted-foreground">{cfoKpis.overdueCount} costi non pagati</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ricorrenti Mensili</CardTitle>
            <Repeat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(cfoKpis.monthlyRecurring)}
            </div>
            <p className="text-xs text-muted-foreground">Costi fissi mensili</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
