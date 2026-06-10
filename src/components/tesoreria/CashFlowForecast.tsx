import { useEffect, useState } from "react";
import { formatDateIt } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatTreasuryCurrency, toFiniteAmount } from "@/lib/treasury";

const formatEur = (val: unknown) => formatTreasuryCurrency(val, "€0,00");

interface Props {
  companyId: string;
  refreshKey?: number;
}

export default function CashFlowForecast({ companyId, refreshKey = 0 }: Props) {
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (companyId) void loadForecast();
    else {
      setForecast(null);
      setLoading(false);
    }
  }, [companyId, refreshKey]);

  async function loadForecast() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.rpc("get_cash_flow_forecast", {
        p_company_id: companyId,
        p_days: 90,
      });

      if (error) throw error;
      setForecast(data && data.length > 0 ? data[0] : null);
    } catch (e: any) {
      setForecast(null);
      setLoadError(e.message || "Impossibile caricare le previsioni");
      toast.error("Errore caricamento previsioni di tesoreria");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <div className="grid gap-4 grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!forecast) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground space-y-3">
          <p>{loadError || "Collega una banca per vedere le previsioni di cash flow"}</p>
          {loadError && <Button variant="outline" size="sm" onClick={() => loadForecast()}>Riprova</Button>}
        </CardContent>
      </Card>
    );
  }

  const isPositive = toFiniteAmount(forecast.forecasted_balance) >= 0;

  return (
    <div className="space-y-4">
      {/* Saldo previsionale */}
      <Card className={isPositive ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800"}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" />
            Previsione Liquidità — 90 giorni
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Saldo Attuale</p>
              <p className="text-xl font-bold">{formatEur(forecast.current_balance)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-green-600" /> Entrate Attese
              </p>
              <p className="text-xl font-bold text-green-600">+{formatEur(forecast.expected_income)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-red-600" /> Uscite Previste
              </p>
              <p className="text-xl font-bold text-red-600">-{formatEur(forecast.expected_expenses)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Wallet className="h-3 w-3" /> Saldo Previsionale
              </p>
              <p className={`text-xl font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
                {formatEur(forecast.forecasted_balance)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dettagli */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Entrate attese */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Fatture in Attesa di Pagamento
              <Badge variant="outline" className="ml-auto">{(forecast.income_details || []).length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(forecast.income_details || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nessuna fattura in attesa</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-auto">
                {(forecast.income_details || []).slice(0, 10).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div>
                      <p className="font-medium truncate max-w-[200px]">{item.client || item.invoice_number}</p>
                      <p className="text-xs text-muted-foreground">{formatDateIt(item.due_date)}</p>
                    </div>
                    <span className="text-green-600 font-medium">{formatEur(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Uscite previste */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Scadenze in Arrivo
              <Badge variant="outline" className="ml-auto">{(forecast.expense_details || []).length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(forecast.expense_details || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nessuna scadenza</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-auto">
                {(forecast.expense_details || []).slice(0, 10).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <div>
                      <p className="font-medium truncate max-w-[200px]">{item.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDateIt(item.due_date)}</p>
                    </div>
                    <span className="text-red-600 font-medium">-{formatEur(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
