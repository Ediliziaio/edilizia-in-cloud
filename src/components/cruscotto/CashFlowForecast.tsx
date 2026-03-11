import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { FinanceData, CashFlowForecastData } from "@/hooks/useCruscottoData";
import { useNavigate } from "react-router-dom";

function fmtEur(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

interface Props {
  finance: FinanceData;
  cashFlowForecast: CashFlowForecastData | null;
  isLoading?: boolean;
}

export function CashFlowForecast({ finance, cashFlowForecast, isLoading }: Props) {
  const navigate = useNavigate();
  const burnRate = finance.thisMonthOutflow > 0
    ? finance.thisMonthOutflow / new Date().getDate()
    : 0;

  if (isLoading) return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-20 w-full" />
      </CardContent>
    </Card>
  );

  const forecast = cashFlowForecast ?? { incoming30: 0, incoming60: 0, incoming90: 0, monthRevenue: 0, quarterRevenue: 0, ytdRevenue: 0 };
  const maxIncoming = Math.max(forecast.incoming90, 1);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Finanza & Cash Flow</CardTitle>
        <button
          onClick={() => navigate("/azienda/costi")}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          Dettaglio →
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Cash Flow Net */}
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-muted-foreground">Cash Flow Netto (mese)</p>
            <p className={cn("text-2xl font-bold", finance.cashFlowNet >= 0 ? "text-green-600" : "text-destructive")}>
              {finance.cashFlowNet >= 0 ? "+" : ""}{fmtEur(finance.cashFlowNet)}
            </p>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">{fmtEur(finance.thisMonthIncome)}</span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-destructive" />
              <span className="text-xs text-muted-foreground">{fmtEur(finance.thisMonthOutflow)}</span>
            </div>
          </div>
        </div>

        {/* Burn rate + margin */}
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-muted-foreground">Burn rate</p>
            <p className="text-sm font-semibold text-foreground">{fmtEur(burnRate)}/gg</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Margine lordo</p>
            <p className="text-sm font-semibold text-foreground">{finance.marginThisMonth.toFixed(1)}%</p>
          </div>
        </div>

        {/* Forecast bars */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Incassi attesi (rate di pagamento programmate)</p>
          {forecast.incoming90 > 0 ? (
            <div className="space-y-2">
              {[
                { label: "Entro 30gg", value: forecast.incoming30 },
                { label: "Entro 60gg", value: forecast.incoming60 },
                { label: "Entro 90gg", value: forecast.incoming90 },
              ].map(({ label, value }) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-foreground">{fmtEur(value)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(4, (value / maxIncoming) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Nessuna rata di pagamento pianificata nei prossimi 90 giorni.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
