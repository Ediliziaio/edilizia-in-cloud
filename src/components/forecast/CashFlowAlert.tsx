import { useState } from "react";
import { addDays } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";

interface CashFlowAlertProps {
  upcomingCosts: any[];
  currentBalance?: number;
  minThreshold?: number;
}

export function CashFlowAlert({
  upcomingCosts,
  currentBalance: initialBalance = 0,
  minThreshold: initialThreshold = 5000,
}: CashFlowAlertProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [threshold, setThreshold] = useState(initialThreshold);
  const now = new Date();

  const calcOutflow = (days: number) =>
    upcomingCosts
      .filter(
        (c) =>
          !c.is_paid &&
          c.due_date &&
          c.due_date !== "9999-12-31" &&
          new Date(c.due_date) <= addDays(now, days),
      )
      .reduce((s, c) => s + Number(c.amount), 0);

  const outflow30 = calcOutflow(30);
  const outflow60 = calcOutflow(60);
  const outflow90 = calcOutflow(90);
  const horizons = [
    { label: "30 giorni", outflow: outflow30, balance: balance - outflow30 },
    { label: "60 giorni", outflow: outflow60, balance: balance - outflow60 },
    { label: "90 giorni", outflow: outflow90, balance: balance - outflow90 },
  ];
  const hasNegative = horizons.some((h) => h.balance < 0);
  const firstNegative = horizons.find((h) => h.balance < 0);

  const getColor = (bal: number) =>
    bal > threshold
      ? "border-green-400 bg-green-50 dark:bg-green-900/10"
      : bal >= 0
        ? "border-orange-400 bg-orange-50 dark:bg-orange-900/10"
        : "border-red-400 bg-red-50 dark:bg-red-900/10";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Saldo attuale (€)</Label>
          <Input
            type="number"
            value={balance}
            onChange={(e) => setBalance(Number(e.target.value))}
            className="w-32 h-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Soglia minima (€)</Label>
          <Input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-32 h-8"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {horizons.map((h) => (
          <Card key={h.label} className={cn("border-2", getColor(h.balance))}>
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-2">{h.label}</p>
              <p className="text-xs text-muted-foreground">Uscite previste</p>
              <p className="text-base font-bold">{formatCurrency(h.outflow)}</p>
              <p className="text-xs text-muted-foreground mt-1">Saldo stimato</p>
              <p
                className={cn(
                  "text-lg font-bold",
                  h.balance < 0
                    ? "text-red-600"
                    : h.balance < threshold
                      ? "text-orange-600"
                      : "text-green-600",
                )}
              >
                {formatCurrency(h.balance)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {hasNegative && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            La cassa potrebbe scendere sotto zero entro {firstNegative?.label}.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
