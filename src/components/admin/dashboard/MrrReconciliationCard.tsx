import { format } from "date-fns";
import { it } from "date-fns/locale";
import { RefreshCw, TrendingUp, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscrepanzeTable } from "./DiscrepanzeTable";
import { useMrrReconciliation } from "@/hooks/useMrrReconciliation";

const fmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function MrrReconciliationCard() {
  const { latest, isLoading, syncMutation } = useMrrReconciliation();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Riconciliazione MRR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const mrrStripe = latest ? latest.mrr_stripe_cents / 100 : 0;
  const mrrInterno = latest ? latest.mrr_interno_cents / 100 : 0;
  const discrepanza = latest ? latest.discrepanza_cents / 100 : 0;
  const discrepanzaPct =
    mrrStripe > 0 ? Math.abs((discrepanza / mrrStripe) * 100) : 0;
  const hasBigDiscrepancy = discrepanzaPct > 5;

  const discrepanze = latest
    ? (latest.dettaglio_discrepanze as Array<{ company_id: string; nome: string; mrr_stripe: number; mrr_interno: number }>)
    : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Riconciliazione MRR
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="h-7 text-xs"
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            <span className="ml-1.5">
              {syncMutation.isPending ? "Sincronizzazione..." : "Sincronizza ora"}
            </span>
          </Button>
        </div>
        {latest && (
          <p className="text-xs text-muted-foreground">
            Ultimo aggiornamento:{" "}
            {format(new Date(latest.data), "dd/MM/yyyy", { locale: it })}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {!latest ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Nessun dato disponibile. Avvia la prima sincronizzazione.
          </div>
        ) : (
          <>
            {/* Metriche principali */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">MRR Stripe</p>
                <p className="text-xl font-bold tabular-nums">{fmt.format(mrrStripe)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {latest.aziende_attive_stripe} aziende attive
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">MRR Interno</p>
                <p className="text-xl font-bold tabular-nums">{fmt.format(mrrInterno)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {latest.aziende_attive_interno} aziende attive
                </p>
              </div>
            </div>

            {/* Discrepanza */}
            <div
              className={`rounded-lg border p-3 flex items-center gap-3 ${
                hasBigDiscrepancy
                  ? "border-orange-200 bg-orange-50"
                  : "border-green-200 bg-green-50"
              }`}
            >
              {hasBigDiscrepancy ? (
                <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Delta:{" "}
                  <span className={hasBigDiscrepancy ? "text-orange-600" : "text-green-600"}>
                    {discrepanza >= 0 ? "+" : ""}
                    {fmt.format(discrepanza)}
                  </span>
                  <Badge
                    variant="outline"
                    className={`ml-2 text-xs ${
                      hasBigDiscrepancy
                        ? "border-orange-300 text-orange-600"
                        : "border-green-300 text-green-600"
                    }`}
                  >
                    {discrepanzaPct.toFixed(1)}%
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {hasBigDiscrepancy
                    ? "Discrepanza significativa rilevata (> 5%)"
                    : "MRR allineato con Stripe"}
                </p>
              </div>
            </div>

            {/* Dettaglio discrepanze per azienda */}
            {discrepanze.length > 0 && (
              <DiscrepanzeTable discrepanze={discrepanze} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
