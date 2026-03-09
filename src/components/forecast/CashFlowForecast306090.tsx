import { useMemo } from "react";
import { addDays, isWithinInterval, startOfDay, isPast, isToday } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Wallet, CalendarClock, AlertTriangle, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { Progress } from "@/components/ui/progress";

interface ScadenzaForecast {
  id: string;
  description: string;
  amount: number;
  expectedDate: Date | null;
  direction: "entrata" | "uscita";
  tipo: string;
  supplierName: string | null;
  orderNumber: string | null;
  orderId: string | null;
}

interface ForecastBand {
  label: string;
  income: number;
  expenses: number;
  net: number;
  incomeCount: number;
  expensesCount: number;
}

interface Props {
  scadenze: ScadenzaForecast[];
  primaNotaSaldo: { entrate: number; uscite: number; saldo: number; entry_count: number };
  expectedPayments: { amount: number; expectedDate: Date | null }[];
  expectedExpenses: { amount: number; expectedDate: Date | null; isPaid?: boolean }[];
  expectedCommissions: { amount: number; expectedDate: Date | null }[];
  expectedSupplierPayments: { amount: number; expectedDate: Date | null; isPaid?: boolean }[];
  expectedCompanyCosts: { amount: number; expectedDate: Date | null }[];
}

export function CashFlowForecast306090({
  scadenze,
  primaNotaSaldo,
  expectedPayments,
  expectedExpenses,
  expectedCommissions,
  expectedSupplierPayments,
  expectedCompanyCosts,
}: Props) {
  const bands = useMemo(() => {
    const now = startOfDay(new Date());
    const periods = [
      { label: "30 giorni", end: addDays(now, 30) },
      { label: "60 giorni", end: addDays(now, 60) },
      { label: "90 giorni", end: addDays(now, 90) },
    ];

    const inRange = (d: Date | null, end: Date) =>
      d && isWithinInterval(d, { start: now, end });

    return periods.map(({ label, end }): ForecastBand => {
      // Income from order installments
      const orderIncome = expectedPayments
        .filter(p => inRange(p.expectedDate, end))
        .reduce((s, p) => s + p.amount, 0);

      // Income from scadenze entrata
      const scadIncome = scadenze
        .filter(s => s.direction === "entrata" && inRange(s.expectedDate, end))
        .reduce((s, sc) => s + sc.amount, 0);

      const incomeItems = expectedPayments.filter(p => inRange(p.expectedDate, end)).length
        + scadenze.filter(s => s.direction === "entrata" && inRange(s.expectedDate, end)).length;

      // Expenses from all sources
      const extTeams = expectedExpenses
        .filter(e => !(e as any).isPaid && inRange(e.expectedDate, end))
        .reduce((s, e) => s + e.amount, 0);
      const commissions = expectedCommissions
        .filter(c => inRange(c.expectedDate, end))
        .reduce((s, c) => s + c.amount, 0);
      const suppliers = expectedSupplierPayments
        .filter(p => !(p as any).isPaid && inRange(p.expectedDate, end))
        .reduce((s, p) => s + p.amount, 0);
      const costs = expectedCompanyCosts
        .filter(c => inRange(c.expectedDate, end))
        .reduce((s, c) => s + c.amount, 0);

      // Expenses from scadenze uscita
      const scadExpenses = scadenze
        .filter(s => s.direction === "uscita" && inRange(s.expectedDate, end))
        .reduce((s, sc) => s + sc.amount, 0);

      const totalExpenses = extTeams + commissions + suppliers + costs + scadExpenses;
      const expenseItems = expectedExpenses.filter(e => !(e as any).isPaid && inRange(e.expectedDate, end)).length
        + expectedCommissions.filter(c => inRange(c.expectedDate, end)).length
        + expectedSupplierPayments.filter(p => !(p as any).isPaid && inRange(p.expectedDate, end)).length
        + expectedCompanyCosts.filter(c => inRange(c.expectedDate, end)).length
        + scadenze.filter(s => s.direction === "uscita" && inRange(s.expectedDate, end)).length;

      const totalIncome = orderIncome + scadIncome;
      return {
        label,
        income: totalIncome,
        expenses: totalExpenses,
        net: totalIncome - totalExpenses,
        incomeCount: incomeItems,
        expensesCount: expenseItems,
      };
    });
  }, [scadenze, expectedPayments, expectedExpenses, expectedCommissions, expectedSupplierPayments, expectedCompanyCosts]);

  // Overdue scadenze
  const overdueScadenze = useMemo(() => {
    return scadenze.filter(s => {
      if (!s.expectedDate) return false;
      return isPast(s.expectedDate) && !isToday(s.expectedDate);
    });
  }, [scadenze]);

  const overdueTotal = overdueScadenze.reduce((s, sc) => s + sc.amount, 0);

  const currentSaldo = primaNotaSaldo.saldo;

  return (
    <div className="space-y-4">
      {/* Current position + overdue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className={cn(
          "border",
          currentSaldo >= 0
            ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
            : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
        )}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Landmark className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Saldo Prima Nota</p>
            </div>
            <p className={cn("text-3xl font-bold tabular-nums", currentSaldo >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {formatCurrency(currentSaldo)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {primaNotaSaldo.entry_count} registrazioni · Entrate {formatCurrency(primaNotaSaldo.entrate)} · Uscite {formatCurrency(primaNotaSaldo.uscite)}
            </p>
          </CardContent>
        </Card>

        {overdueScadenze.length > 0 && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <p className="text-sm font-medium text-destructive">Scadenze in ritardo</p>
              </div>
              <p className="text-3xl font-bold tabular-nums text-destructive">
                {formatCurrency(overdueTotal)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {overdueScadenze.length} scadenze scadute non saldate
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 30/60/90 bands */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Previsione Cash Flow — 30 / 60 / 90 giorni
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {bands.map((band) => {
              const projectedSaldo = currentSaldo + band.net;
              return (
                <div key={band.label} className="space-y-3 p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs font-medium">{band.label}</Badge>
                    {band.net >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-destructive" />
                    )}
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Entrate ({band.incomeCount})</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">{formatCurrency(band.income)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Uscite ({band.expensesCount})</span>
                      <span className="text-red-600 dark:text-red-400 font-medium">{formatCurrency(band.expenses)}</span>
                    </div>
                    <div className="border-t pt-1.5 flex justify-between">
                      <span className="font-medium">Netto</span>
                      <span className={cn("font-bold", band.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                        {formatCurrency(band.net)}
                      </span>
                    </div>
                  </div>

                  {/* Projected saldo */}
                  <div className="pt-2 border-t">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Wallet className="h-3 w-3" /> Saldo proiettato
                      </span>
                      <span className={cn("font-bold text-sm", projectedSaldo >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                        {formatCurrency(projectedSaldo)}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(100, Math.max(0, (band.income / Math.max(band.income + band.expenses, 1)) * 100))}
                      className="h-1.5 mt-2"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span>Entrate</span>
                      <span>Uscite</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
