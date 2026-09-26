import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { FinanceData, CashFlowForecastData } from "@/hooks/useCruscottoData";
import { useNavigate } from "react-router-dom";

function fmtEur(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
}

interface Props {
  /** Non più mostrato qui: cash flow netto, burn rate e margine sono nel
   *  «Bilancio mese corrente» accanto (FinanzaCashFlow). */
  finance?: FinanceData;
  cashFlowForecast: CashFlowForecastData | null;
  isLoading?: boolean;
}

/**
 * Incassi attesi a 30/60/90 giorni (scheda Finanza del Cruscotto). Prima si
 * chiamava «Finanza & Cash Flow» come il blocco accanto e ne ripeteva il cash
 * flow netto, entrate e uscite, il burn rate e il margine (79,4% da una parte
 * «lordo», dall'altra «ponderato»): gli stessi numeri due volte a 20cm.
 */
export function CashFlowForecast({ cashFlowForecast, isLoading }: Props) {
  const navigate = useNavigate();

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
        <CardTitle className="text-sm font-semibold">Incassi attesi</CardTitle>
        <button
          onClick={() => navigate("/azienda/scadenzario")}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          Dettaglio →
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Forecast bars */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Rate di pagamento programmate</p>
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
                    <span className="font-medium tabular-nums text-foreground">{fmtEur(value)}</span>
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
